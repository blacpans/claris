import fs from 'node:fs/promises';
import path from 'node:path';
import { google, Auth } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const TOKEN_PATH = path.join(process.cwd(), '.gemini', 'tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

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
 * Reads previously authorized credentials from the save file.
 */
async function loadSavedCredentialsIfExist(): Promise<Auth.JWT | Auth.OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    const credentials = JSON.parse(content);
    const client = google.auth.fromJSON(credentials);

    if (isOAuth2Client(client) || isJWT(client)) {
      return client;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * クレデンシャルファイル（credentials.json）を読み込む
 */
async function loadCredentials(): Promise<{ client_id: string; client_secret: string }> {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    return { client_id: key.client_id, client_secret: key.client_secret };
  } catch {
    throw new Error(
      `Error loading ${CREDENTIALS_PATH}. Please make sure you have downloaded the OAuth 2.0 credentials from Google Cloud Console.`
    );
  }
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
async function createOAuth2Client(): Promise<Auth.OAuth2Client> {
  const { client_id, client_secret } = await loadCredentials();
  return new google.auth.OAuth2(client_id, client_secret, getRedirectUri());
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 */
async function saveCredentials(client: Auth.OAuth2Client): Promise<void> {
  const { client_id, client_secret } = await loadCredentials();
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id,
    client_secret,
    refresh_token: client.credentials.refresh_token,
  });

  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * 認証用URLを生成する（サーバーサイドフロー用）
 */
export async function getAuthUrl(): Promise<string> {
  const client = await createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

/**
 * 認証コールバックを処理する（サーバーサイドフロー用）
 * @param code - Google から返ってきた認証コード
 */
export async function handleAuthCallback(code: string): Promise<void> {
  const client = await createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveCredentials(client);
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
