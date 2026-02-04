import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { ServerLiveSession } from '@/core/live/ServerLiveSession.js';

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('📱 Client connected to WebSocket');

    const liveSession = new ServerLiveSession();
    let isSessionStarted = false;

    // Handle incoming audio from client
    ws.on('message', async (data, isBinary) => {
      if (isBinary) {
        // Audio chunk received
        if (!isSessionStarted) {
          console.log('🎤 First audio chunk received, starting session...');
          await liveSession.start();
          isSessionStarted = true;
        }
        await liveSession.sendAudio(data as Buffer);
      } else {
        // Text message (control commands etc)
        const message = data.toString();
        console.log('📩 Received message:', message);
      }
    });

    // Handle outbound audio from Gemini
    liveSession.on('audio', (pcmData: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcmData);
      }
    });

    liveSession.on('interrupted', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'interrupted' }));
      }
    });

    liveSession.on('text', (text: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'text', text }));
      }
    });

    // Handle errors and close
    ws.on('close', () => {
      console.log('📱 Client disconnected');
      liveSession.stop();
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      liveSession.stop();
    });
  });

  console.log('👂 WebSocket Server initialized at /ws/live');
}
