import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
/**
 * Hono Server - Minimal runtime for Claris
 */
import { Hono } from 'hono';
import { MESSAGES } from '@/constants/messages.js';
import { logout as clearSession, getSession, setSession } from '@/core/auth/SessionManager.js';
import {
  type ClarisEvent,
  type EventSource,
  notificationHistoryService,
  notificationService,
} from '@/core/proactive/index.js';
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
app.get('/api/auth/login', async (c) => {
  try {
    const secret = c.req.query('secret') || process.env.AUTH_SECRET; // secretがない場合はデフォルトを使用
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

// 旧エンドポイントのリダイレクト（互換性のため）
app.get('/auth/google', (c) => c.redirect('/api/auth/login'));

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

    const { email } = await handleAuthCallback(code, state);

    // セッションを保存
    await setSession(c, email);

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

// アプリの構成情報（バージョンなど）を起動時に一回だけ読み込んでキャッシュ
const pkgPath = join(process.cwd(), 'package.json');
let appConfig = { version: 'v0.0.0', wsPath: '/ws/live' };
let configScript = 'window.CLARIS_CONFIG = { version: "v0.0.0", wsPath: "/ws/live" };';

try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  appConfig = {
    version: `v${pkg.version}`,
    wsPath: '/ws/live',
  };
  configScript = `window.CLARIS_CONFIG = ${JSON.stringify(appConfig)};`;
} catch (error) {
  console.error('Failed to load package.json for caching:', error);
}

// アプリの構成情報（バージョンなど）を返す
app.get('/api/config', (c) => {
  return c.json(appConfig);
});

// フロントエンド向けに動的な設定スクリプトを配信
app.get('/api/config.js', (c) => {
  return c.text(configScript, 200, { 'Content-Type': 'application/javascript' });
});

// ログイン中のユーザー情報を取得
app.get('/api/auth/me', async (c) => {
  const userId = await getSession(c);
  if (!userId) {
    return c.json({ authenticated: false }, 401);
  }
  return c.json({ authenticated: true, userId });
});

// ログアウト
app.get('/api/auth/logout', (c) => {
  clearSession(c);
  return c.json({ success: true });
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

// --- Push Notification API ---

// VAPID 公開鍵を返す
app.get('/api/push/vapid-key', (c) => {
  const pushService = notificationService.getPushService();
  const key = pushService.getPublicKey();
  if (!key) {
    return c.json({ error: 'VAPID keys not configured' }, 503);
  }
  return c.json({ publicKey: key });
});

// Push サブスクリプションを登録する
app.post('/api/push/subscribe', async (c) => {
  try {
    const body = await c.req.json<{
      userId: string;
      subscription: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
    }>();

    if (!body.userId || !body.subscription?.endpoint) {
      return c.json({ error: 'Missing userId or subscription' }, 400);
    }

    const pushService = notificationService.getPushService();
    await pushService.saveSubscription(body.userId, body.subscription);
    return c.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return c.json({ error: 'Failed to save subscription' }, 500);
  }
});

// Push サブスクリプションを解除する
app.delete('/api/push/subscribe', async (c) => {
  try {
    const body = await c.req.json<{
      userId: string;
      endpoint: string;
    }>();

    if (!body.userId || !body.endpoint) {
      return c.json({ error: 'Missing userId or endpoint' }, 400);
    }

    const pushService = notificationService.getPushService();
    await pushService.removeSubscription(body.userId, body.endpoint);
    return c.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return c.json({ error: 'Failed to remove subscription' }, 500);
  }
});

// --- Notification History API ---

// 通知履歴を取得する
app.get('/api/notifications', async (c) => {
  const userId = (await getSession(c)) || 'anonymous';

  const limit = Number(c.req.query('limit')) || 20;
  const notifications = await notificationHistoryService.getNotifications(userId, limit);
  return c.json({ notifications });
});

// 特定の通知を既読にする
app.post('/api/notifications/:id/read', async (c) => {
  const userId = (await getSession(c)) || 'anonymous';
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  const success = await notificationHistoryService.markAsRead(userId, id);
  return c.json({ success });
});

// 全ての通知を既読にする
app.post('/api/notifications/read-all', async (c) => {
  const userId = await getSession(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const count = await notificationHistoryService.markAllAsRead(userId);
  return c.json({ success: true, count });
});

// --- Debug API (Development Only) ---

// テスト通知を送信する (GETでお手軽に送信できるようにしたじゃんね！✨)
app.get('/api/debug/test-notification', async (c) => {
  // 1. クエリパラメータで指定された ID
  // 2. セッションの ID
  // 3. デフォルトの anonymous
  const userId = c.req.query('targetUserId') || (await getSession(c)) || 'anonymous';

  // 日本語が化けないように encodeURIComponent されてることを期待するけど、
  // ここでも一応 fallback 用に空文字チェックするじゃんね！✨
  const text = c.req.query('text') || 'これはテスト通知だよ！✨🌸';
  const source = (c.req.query('source') || 'system') as unknown as EventSource;
  const broadcast = c.req.query('broadcast') === 'true';

  const debugEvent: ClarisEvent = {
    id: `debug-${Date.now()}`,
    source,
    type: 'debug_notification',
    priority: 'medium',
    summary: text,
    timestamp: Date.now(),
    metadata: {},
  };

  if (broadcast) {
    console.log(`📡 GET /api/debug/test-notification: Broad-casting to all users! text=${text}`);
    notificationService.broadcast(debugEvent, text);
  } else {
    console.log(`📡 GET /api/debug/test-notification: userId=${userId}, source=${source}, text=${text}`);
    notificationService.notify(userId, debugEvent, text);
  }

  return c.json({ success: true, userId, text, source, broadcast });
});

// 保存されている通知を直接チェックする (デバッグ用)
app.get('/api/debug/check-notifications', async (c) => {
  const userId = c.req.query('userId') || (await getSession(c)) || 'anonymous';
  const notifications = await notificationHistoryService.getNotifications(userId);
  return c.json({ userId, count: notifications.length, notifications });
});

// Mount webhook handler
app.route('/webhook', webhookApp);
