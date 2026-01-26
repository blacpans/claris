
import { google, Auth } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const CREDENTIALS_PATH = 'token.json';
import fs from 'fs/promises';
import path from 'path';

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
 * 保存されたトークン情報の型
 */
interface SavedCredentials {
  type: 'authorized_user';
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * トークン保存パスを取得
 */
function getTokenPath(): string {
  return path.resolve(process.cwd(), CREDENTIALS_PATH);
}

/**
 * トークンをローカルファイルから読み込む
 */
async function loadSavedCredentialsIfExist(): Promise<Auth.JWT | Auth.OAuth2Client | null> {
  try {
    const tokenPath = getTokenPath();
    const content = await fs.readFile(tokenPath, 'utf-8');
    const credentials = JSON.parse(content) as SavedCredentials;
    const client = google.auth.fromJSON(credentials);

    if (isOAuth2Client(client) || isJWT(client)) {
      return client;
    }
    return null;
  } catch {
    // File not found or invalid
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
      'Set them in .env or configure via Secret Manager for Cloud Run.'
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
 * トークンをローカルファイルに保存する
 */
async function saveCredentials(client: Auth.OAuth2Client): Promise<void> {
  const { client_id, client_secret } = loadCredentials();
  // refresh_token がない場合は既存のものを引き継ぐ
  let refreshToken = client.credentials.refresh_token as string | undefined | null;
  if (!refreshToken) {
    // 既存のデータを読み込む
    const existing = await loadSavedCredentialsIfExist();
    if (existing && 'credentials' in existing) {
      // Note: existing is Auth.JWT or OAuth2Client. 
      // If it's OAuth2Client, it has credentials.
      // However, loadSavedCredentialsIfExist uses google.auth.fromJSON which returns a client.
      // We can read the file directly to be safe, or cast existing.
      // Let's read file directly to be simple and safe.
      try {
        const content = await fs.readFile(getTokenPath(), 'utf-8');
        const saved = JSON.parse(content) as SavedCredentials;
        refreshToken = saved.refresh_token;
      } catch {
        // Ignore
      }
    }
  }

  const payload: SavedCredentials = {
    type: 'authorized_user',
    client_id,
    client_secret,
    refresh_token: refreshToken!,
  };

  await fs.writeFile(getTokenPath(), JSON.stringify(payload, null, 2));
  console.log(`[Auth] Saved Google OAuth credentials to ${CREDENTIALS_PATH}`);
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
  throw new Error(
    'No saved credentials found. Please visit /auth/google to authenticate.'
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
