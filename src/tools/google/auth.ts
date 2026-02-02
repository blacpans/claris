import { type Auth, google } from 'googleapis';
import { type SavedCredentials, getCredentialStore } from './store.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/gmail.readonly'];

// メモリ上のキャッシュされたクライアント
let cachedClient: Auth.JWT | Auth.OAuth2Client | null = null;

/**
 * Type Guard for OAuth2Client
 */
function isOAuth2Client(client: unknown): client is Auth.OAuth2Client {
  return typeof client === 'object' && client !== null && 'generateAuthUrl' in client && 'getToken' in client;
}

/**
 * Type Guard for JWT
 */
function isJWT(client: unknown): client is Auth.JWT {
  return typeof client === 'object' && client !== null && 'authorize' in client && !('fromJSON' in client);
}

/**
 * トークンをストアから読み込む
 * 環境変数 TOKEN_STORE_TYPE に応じて File or Firestore を自動選択
 */
async function loadSavedCredentialsIfExist(): Promise<Auth.JWT | Auth.OAuth2Client | null> {
  // キャッシュがあればそれを返す
  if (cachedClient) {
    return cachedClient;
  }

  try {
    const store = getCredentialStore();
    const credentials = await store.load();
    if (!credentials) return null;

    // googleapis の fromJSON は authorized_user 形式を期待
    const fullCredentials = {
      type: 'authorized_user' as const,
      client_id: credentials.client_id || process.env.GOOGLE_CLIENT_ID || '',
      client_secret: credentials.client_secret || process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: credentials.refresh_token || '',
    };

    const client = google.auth.fromJSON(fullCredentials);

    if (isOAuth2Client(client) || isJWT(client)) {
      cachedClient = client;
      return client;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 環境変数からクレデンシャルを読み込む
 */
function loadCredentials(): { client_id: string; client_secret: string } {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required. ' +
        'Set them in .env or configure via Secret Manager for Cloud Run.',
    );
  }

  return { client_id, client_secret };
}

/**
 * リダイレクトURIを取得する
 * 環境変数 GOOGLE_REDIRECT_URI がなければデフォルト値を使用
 */
function getRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/oauth2callback';
}

/**
 * OAuth2 クライアントを生成する
 */
function createOAuth2Client(): Auth.OAuth2Client {
  const { client_id, client_secret } = loadCredentials();
  return new google.auth.OAuth2(client_id, client_secret, getRedirectUri());
}

/**
 * トークンをストアに保存する
 * 環境変数 TOKEN_STORE_TYPE に応じて File or Firestore を自動選択
 */
async function saveCredentials(client: Auth.OAuth2Client): Promise<void> {
  const { client_id, client_secret } = loadCredentials();
  const store = getCredentialStore();

  // refresh_token がない場合は既存のものを引き継ぐ
  let refreshToken = client.credentials.refresh_token as string | undefined | null;
  if (!refreshToken) {
    const existing = await store.load();
    if (existing?.refresh_token) {
      refreshToken = existing.refresh_token;
    }
  }

  const payload: SavedCredentials = {
    type: 'authorized_user',
    client_id,
    client_secret,
    refresh_token: refreshToken,
  };

  await store.save(payload);
  // 新しいクレデンシャル保存時にキャッシュを無効化
  cachedClient = null;
  console.log('[Auth] Saved Google OAuth credentials');
}

/**
 * 認証用URLを生成する（サーバーサイドフロー用）
 */
export async function getAuthUrl(state?: string): Promise<string> {
  const client = createOAuth2Client();
  const opts = {
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // 再認証時もrefresh_tokenを確実に取得
    ...(state ? { state } : {}),
  };
  return client.generateAuthUrl(opts);
}

/**
 * 認証コールバックを処理する（サーバーサイドフロー用）
 * @param code - Google から返ってきた認証コード
 */
export async function handleAuthCallback(code: string): Promise<void> {
  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    await saveCredentials(client);
  } catch (error) {
    console.error('Failed to exchange code for tokens:', error);
    throw new Error('Failed to complete authentication process');
  }
}

/**
 * Load or request authorization to call APIs.
 * 保存済みトークンがあればそれを使用、なければ認証が必要
 */
export async function authorize(): Promise<Auth.JWT | Auth.OAuth2Client> {
  const client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  // トークンがない場合はエラー（サーバー環境では /auth/google エンドポイントへ誘導）
  throw new Error('No saved credentials found. Please visit /auth/google to authenticate.');
}

/**
 * Get authenticated Google Calendar client
 */
export async function getCalendarClient() {
  const auth = await authorize();
  return google.calendar({ version: 'v3', auth });
}

/**
 * Get authenticated Gmail client
 */
export async function getGmailClient() {
  const auth = await authorize();
  return google.gmail({ version: 'v1', auth });
}
