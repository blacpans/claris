/**
 * Hono Server - Minimal runtime for Claris
 */
import { Hono } from 'hono';
import { adkRunner } from './runner.js';
import { webhookApp } from './webhook.js';

export const app = new Hono();

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Claris',
    status: 'online',
    message: 'Hello! Claris is ready to help! 🌸',
  });
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
