import { serveStatic } from '@hono/node-server/serve-static';
/**
 * Hono Server - Minimal runtime for Claris
 */
import { Hono } from 'hono';
import { MESSAGES } from '@/constants/messages.js';
import { getAuthUrl, handleAuthCallback } from '@/tools/google/auth.js';
import { adkRunner } from './runner.js';
import { webhookApp } from './webhook.js';

export const app = new Hono();

// Static file serving (PWA)
app.use('/*', serveStatic({ root: './public' }));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    name: 'Claris',
    status: 'online',
    message: MESSAGES.SERVER.HEALTH_CHECK,
  });
});

// Google OAuth: 認証開始エンドポイント
app.get('/auth/google', async (c) => {
  try {
    const secret = c.req.query('secret');
    const profile = c.req.query('profile'); // プロファイル名を取得

    if (secret !== process.env.AUTH_SECRET) {
      return c.json({ error: MESSAGES.AUTH.UNAUTHORIZED_SECRET }, 401);
    }
    const authUrl = await getAuthUrl(secret, profile); // secretをstateとして、profileと共に渡す
    return c.redirect(authUrl);
  } catch (error) {
    console.error('Auth URL generation error:', error);
    return c.json({ error: MESSAGES.AUTH.FAILED_GENERATE_URL }, 500);
  }
});

// Google OAuth: コールバックエンドポイント
app.get('/oauth2callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!code) {
      return c.json({ error: MESSAGES.AUTH.MISSING_CODE }, 400);
    }

    // CSRF対策: state (AUTH_SECRET) の検証
    // state は base64 エンコードされた JSON 文字列になっている可能性がある
    let isValidState = false;
    if (state === process.env.AUTH_SECRET) {
      isValidState = true; // 旧方式 (or profileなし)
    } else if (state) {
      try {
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
        const stateObj = JSON.parse(decodedState);
        if (stateObj.originalState === process.env.AUTH_SECRET) {
          isValidState = true;
        }
      } catch {
        // Parse error or invalid format -> valid = false
      }
    }

    if (!isValidState) {
      return c.json({ error: MESSAGES.AUTH.INVALID_STATE }, 401);
    }

    await handleAuthCallback(code, state);
    return c.html(
      MESSAGES.AUTH.SUCCESS_HTML(
        MESSAGES.AUTH.SUCCESS_TITLE,
        MESSAGES.AUTH.SUCCESS_HEADER,
        MESSAGES.AUTH.SUCCESS_BODY,
        MESSAGES.AUTH.SUCCESS_FOOTER,
      ),
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.json({ error: MESSAGES.AUTH.FAILED_PROCESS }, 500);
  }
});

// Chat endpoint (for testing)
app.post('/chat', async (c) => {
  try {
    const body = await c.req.json<{
      userId?: string;
      sessionId?: string;
      message: string;
      context?: { activeFile?: string };
    }>();

    if (!body.message) {
      return c.json({ error: MESSAGES.SERVER.CHAT_MISSING_MESSAGE }, 400);
    }

    const userId = body.userId || 'anonymous';
    const sessionId = body.sessionId || `session-${Date.now()}`;

    const response = await adkRunner.run({
      userId,
      sessionId,
      message: body.message,
      context: body.context,
    });

    return c.json({
      userId,
      sessionId,
      response,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: MESSAGES.SERVER.INTERNAL_ERROR }, 500);
  }
});

// Mount webhook handler
app.route('/webhook', webhookApp);
