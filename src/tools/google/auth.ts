import { type Auth, google } from 'googleapis';
import { getCredentialStore, type SavedCredentials } from './store.js';

// Main account scopes (Drive, Photos, etc.)
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks', // Tasks
  'https://www.googleapis.com/auth/spreadsheets', // Sheets
  'https://www.googleapis.com/auth/drive.readonly', // Drive (Search - metadata.readonly sometimes insufficient for query filtering)
  'https://www.googleapis.com/auth/drive.file', // Drive (File access)
  'https://www.googleapis.com/auth/photoslibrary.readonly', // Photos
  'https://www.googleapis.com/auth/contacts.readonly', // People (Contacts)
  'https://www.googleapis.com/auth/user.birthday.read', // People (Birthdays)
];

// YouTube account scopes (Brand Account)
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly', // YouTube (Search/Playlists)
  'https://www.googleapis.com/auth/youtube.force-ssl', // YouTube (Manage)
];

// メモリ上のキャッシュされたクライアント (key: profile name or 'default')
const cachedClients: Record<string, Auth.JWT | Auth.OAuth2Client> = {};

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
/**
 * トークンをストアから読み込む
 * 環境変数 TOKEN_STORE_TYPE に応じて File or Firestore を自動選択
 */
async function loadSavedCredentialsIfExist(profile?: string): Promise<Auth.JWT | Auth.OAuth2Client | null> {
  const cacheKey = profile || 'default';

  // キャッシュがあればそれを返す
  if (cachedClients[cacheKey]) {
    return cachedClients[cacheKey];
  }

  try {
    const store = getCredentialStore();
    const credentials = await store.load(profile);
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
      cachedClients[cacheKey] = client;
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
/**
 * トークンをストアに保存する
 * 環境変数 TOKEN_STORE_TYPE に応じて File or Firestore を自動選択
 */
async function saveCredentials(client: Auth.OAuth2Client, profile?: string): Promise<void> {
  const { client_id, client_secret } = loadCredentials();
  const store = getCredentialStore();

  // refresh_token がない場合は既存のものを引き継ぐ
  let refreshToken = client.credentials.refresh_token as string | undefined | null;
  if (!refreshToken) {
    const existing = await store.load(profile);
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

  await store.save(payload, profile);
  // 新しいクレデンシャル保存時にキャッシュを無効化
  const cacheKey = profile || 'default';
  delete cachedClients[cacheKey];
  console.log(`[Auth] Saved Google OAuth credentials for profile: ${profile || 'default'}`);
}

/**
 * 認証用URLを生成する（サーバーサイドフロー用）
 */
/**
 * 認証用URLを生成する（サーバーサイドフロー用）
 * state パラメータに profile 情報をエンコードして渡す
 */
export async function getAuthUrl(state?: string, profile?: string): Promise<string> {
  const client = createOAuth2Client();

  // プロファイルに応じてスコープを切り替え
  const scopes = profile === 'youtube' ? YOUTUBE_SCOPES : DEFAULT_SCOPES;

  // state に profile 情報を埋め込む (JSON文字列としてエンコード)
  const stateObj = {
    originalState: state,
    profile,
  };
  const encodedState = Buffer.from(JSON.stringify(stateObj)).toString('base64');

  const opts = {
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // 再認証時もrefresh_tokenを確実に取得
    state: encodedState,
  };
  return client.generateAuthUrl(opts);
}

/**
 * 認証コールバックを処理する（サーバーサイドフロー用）
 * @param code - Google から返ってきた認証コード
 * @param state - Google から返ってきた state パラメータ (profile 情報含む)
 * @returns 認証されたユーザーのメールアドレス
 */
export async function handleAuthCallback(code: string, state?: string): Promise<{ email: string }> {
  try {
    let profile: string | undefined;

    // state から profile を復元
    if (state) {
      try {
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
        const stateObj = JSON.parse(decodedState);
        profile = stateObj.profile;
      } catch (e) {
        console.warn('Failed to parse state parameter:', e);
      }
    }

    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    await saveCredentials(client, profile);

    // ユーザー情報を取得
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email) {
      throw new Error('Failed to get email from Google');
    }

    return { email: userInfo.data.email };
  } catch (error) {
    console.error('Failed to exchange code for tokens:', error);
    throw new Error('Failed to complete authentication process');
  }
}

/**
 * Load or request authorization to call APIs.
 * 保存済みトークンがあればそれを使用、なければ認証が必要
 */
/**
 * Load or request authorization to call APIs.
 * 保存済みトークンがあればそれを使用、なければ認証が必要
 */
export async function authorize(profile?: string): Promise<Auth.JWT | Auth.OAuth2Client> {
  const client = await loadSavedCredentialsIfExist(profile);
  if (client) {
    return client;
  }

  // トークンがない場合はエラー（サーバー環境では /auth/google エンドポイントへ誘導）
  throw new Error(
    `No saved credentials found for profile "${profile || 'default'}". Please visit /auth/google to authenticate.`,
  );
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
