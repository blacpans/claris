/**
 * Claris - An Agentic NetNavi 🌸
 * Entry point for the application
 */
import './config/env.js';

import type { Server } from 'node:http';
import { serve } from '@hono/node-server';

import { app } from '@/runtime/server.js';
import { setupWebSocket } from '@/runtime/websocket.js';

const NAVI_NAME = process.env.NAVI_NAME || 'Claris';
const PORT = Number(process.env.PORT) || 8080;

console.log(`🌸 ${NAVI_NAME} is starting up...`);

const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0', // IPv4での接続を確実に許可
  },
  (info) => {
    console.log(`✨ ${NAVI_NAME} is listening on http://${info.address}:${info.port}`);
  },
);

setupWebSocket(server as unknown as Server);
