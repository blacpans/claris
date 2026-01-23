/**
 * Hono Server - Minimal runtime for Claris
 */
import { Hono } from 'hono';
import { adkRunner } from './runner.js';
import { webhookApp } from './webhook.js';
import { getAuthUrl, handleAuthCallback } from '../tools/google/auth.js';

export const app = new Hono();

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Claris',
    status: 'online',
    message: 'Hello! Claris is ready to help! 🌸',
  });
});

// Google OAuth: 認証開始エンドポイント
app.get('/auth/google', async (c) => {
  try {
    const secret = c.req.query('secret');
    if (secret !== process.env.AUTH_SECRET) {
      return c.json({ error: 'Unauthorized: Missing or invalid secret' }, 401);
    }
    const authUrl = await getAuthUrl(secret); // secretをstateとして渡す
    return c.redirect(authUrl);
  } catch (error) {
    console.error('Auth URL generation error:', error);
    return c.json({ error: 'Failed to generate auth URL' }, 500);
  }
});

// Google OAuth: コールバックエンドポイント
app.get('/oauth2callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!code) {
      return c.json({ error: 'No authorization code provided' }, 400);
    }

    // CSRF対策: state (AUTH_SECRET) の検証
    if (state !== process.env.AUTH_SECRET) {
      return c.json({ error: 'Unauthorized: Invalid state parameter' }, 401);
    }

    await handleAuthCallback(code);
    return c.html(`
      <html>
        <head><title>Authentication Successful</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>✨ Authentication Successful! ✨</h1>
          <p>Google Workspace との連携が完了したよ！🌸</p>
          <p>このタブは閉じて大丈夫だよ！</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

// Chat endpoint (for testing)
app.post('/chat', async (c) => {
  try {
    const body = await c.req.json<{ userId?: string; sessionId?: string; message: string }>();

    if (!body.message) {
      return c.json({ error: 'message is required' }, 400);
    }

    const userId = body.userId || 'anonymous';
    const sessionId = body.sessionId || `session-${Date.now()}`;

    const response = await adkRunner.run({
      userId,
      sessionId,
      message: body.message,
    });

    return c.json({
      userId,
      sessionId,
      response,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Mount webhook handler
app.route('/webhook', webhookApp);

