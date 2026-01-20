/**
 * Claris - An Agentic NetNavi 🌸
 * Entry point for the application
 */
import { serve } from '@hono/node-server';
import { app } from './runtime/server';

const PORT = Number(process.env.PORT) || 3000;

console.log('🌸 Claris is starting up...');

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`✨ Claris is listening on http://localhost:${info.port}`);
});
