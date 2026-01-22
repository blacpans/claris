import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { google, Auth } from 'googleapis';
import open from 'open';

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
  // Note: Distinction might be subtle, but for our usage, we check properties used by googleapis
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
    // If it's a compute/external client, we might need to handle it differently or ignore it for this desktop app flow.
    // However, google.auth.fromJSON might return BaseExternalAccountClient etc.
    // For local dev, we prioritize OAuth2Client.
    return null;

  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 */
async function saveCredentials(client: Auth.OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });

  // Ensure directory exists
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 */
export async function authorize(): Promise<Auth.JWT | Auth.OAuth2Client> {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  // Load client secrets from a local file.
  let keys;
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    keys = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Error loading ${CREDENTIALS_PATH}. Please make sure you have downloaded the OAuth 2.0 credentials from Google Cloud Console.`
    );
  }

  const key = keys.installed || keys.web;
  const oAuth2Client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    'http://localhost:3001/oauth2callback'
  );

  return authenticate(oAuth2Client);
}

/**
 * Authenticate with OAuth 2.0 flow
 */
async function authenticate(client: Auth.OAuth2Client): Promise<Auth.OAuth2Client> {
  return new Promise((resolve, reject) => {
    const authorizeUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    const server = http
      .createServer(async (req, res) => {
        try {
          if (req.url!.indexOf('/oauth2callback') > -1) {
            const qs = new URL(req.url!, 'http://localhost:3001').searchParams;
            const code = qs.get('code');
            res.end('Authentication successful! Please return to the console.');
            server.close();

            if (!code) {
              reject(new Error('No code found in URL'));
              return;
            }

            const { tokens } = await client.getToken(code);
            client.setCredentials(tokens);
            await saveCredentials(client);
            resolve(client);
          }
        } catch (e) {
          reject(e);
        }
      })
      .listen(3001, () => {
        // Open the browser to the authorize url to start the workflow
        open(authorizeUrl, { wait: false }).then(cp => cp.unref());
        console.log('Opened browser for authentication...');
      });

    // Handle server errors (e.g., port in use)
    server.on('error', (e) => reject(e));

    // Fallback if open() fails or environment is headless (optional, but good for logs)
    console.log(`Please visit this URL to authorize: ${authorizeUrl}`);
  });
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
