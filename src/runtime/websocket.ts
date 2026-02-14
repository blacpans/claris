import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { ServerLiveSession } from '@/core/live/ServerLiveSession.js';
import { notificationService } from '@/core/proactive/index.js';

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('📱 Client connected to WebSocket');

    // クエリパラメータから userId, activeFile を取得
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId') || 'anonymous';
    const activeFile = url.searchParams.get('activeFile') || undefined;
    console.log(`👤 Connected user: ${userId}, Active File: ${activeFile || 'none'}`);

    // プロアクティブ通知のために WebSocket 接続を登録
    notificationService.register(userId, ws);

    const liveSession = new ServerLiveSession();
    let isSessionStarted = false;

    // Handle incoming audio from client
    ws.on('message', async (data, isBinary) => {
      if (isBinary) {
        // Audio chunk received
        if (!isSessionStarted) {
          isSessionStarted = true; // Prevent race condition
          console.log('🎤 First audio chunk received, starting session...');

          // Start in background - DO NOT AWAIT!
          liveSession.start(userId, activeFile).catch((err) => {
            console.error('Failed to start session:', err);
            isSessionStarted = false; // Reset on failure
          });
        }

        await liveSession.sendAudio(data as Buffer);
      } else {
        // Text message (control commands etc)
        const _message = data.toString();
        // console.log('📩 Received message:', message);
      }
    });

    // Define specific event handlers for cleanup
    const onAudio = (pcmData: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcmData);
      }
    };

    const onInterrupted = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'interrupted' }));
      }
    };

    const onText = (text: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'text', text }));
      }
    };

    const onTurnComplete = () => {
      if (ws.readyState === WebSocket.OPEN) {
        // Optional: send turn complete event to client if needed
      }
    };

    // Handle outbound audio from Gemini
    liveSession.on('audio', onAudio);
    liveSession.on('interrupted', onInterrupted);
    liveSession.on('text', onText);
    liveSession.on('turnComplete', onTurnComplete);

    // Handle errors and close
    ws.on('close', async () => {
      console.log('📱 Client disconnected');
      // Cleanup listeners to prevent crash on late events
      liveSession.off('audio', onAudio);
      liveSession.off('interrupted', onInterrupted);
      liveSession.off('text', onText);
      liveSession.off('turnComplete', onTurnComplete);
      // プロアクティブ通知の登録解除
      notificationService.unregister(userId, ws);
      await liveSession.disconnect();
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      liveSession.stop();
    });
  });

  console.log('👂 WebSocket Server initialized at /ws/live');
}
