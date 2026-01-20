/**
 * Hono Server - Minimal runtime for Claris
 */
import { Hono } from 'hono';

export const app = new Hono();

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Claris',
    status: 'online',
    message: 'Hello! Claris is ready to help! 🌸',
  });
});

// Webhook endpoint (to be implemented)
app.post('/webhook', async (c) => {
  // TODO: Implement webhook handling with ADK Runner
  return c.json({ received: true });
});
