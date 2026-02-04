/**
 * Claris - An Agentic NetNavi 🌸
 * Entry point for the application
 */
import './config/env.js';

import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { app } from './runtime/server.js';
import { setupWebSocket } from './runtime/websocket.js';

const PORT = Number(process.env.PORT) || 8080;

console.log('🌸 Claris is starting up...');

const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0', // IPv4での接続を確実に許可
  },
  (info) => {
    console.log(`✨ Claris is listening on http://${info.address}:${info.port}`);
  },
);

setupWebSocket(server as unknown as Server);
