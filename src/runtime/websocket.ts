import type { Server } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import { Firestore } from '@google-cloud/firestore';
import { WebSocket, WebSocketServer } from 'ws';
import { getGenerationLocation } from '@/config/models.js';
import { ServerLiveSession } from '@/core/live/ServerLiveSession.js';
import { MemoryService } from '@/core/memory/MemoryService.js';
import { notificationService } from '@/core/proactive/index.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';

// --- Singleton Initialization (Shared resources) ---

// 1. Shared Firestore instance
const db = new Firestore({ ignoreUndefinedProperties: true });

// 2. Client for Live API (Multimodal Live)
// Live API currently requires specific locations (e.g. us-central1)
const liveClient = new GoogleGenAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
  vertexai: true,
  apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
});

// 3. Client for Generation/Embedding (MemoryService)
// This can use a different location (e.g. global or user-specified)
const genClient = new GoogleGenAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: getGenerationLocation(),
  vertexai: true,
  apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
});

// 4. Services (Singleton or Lightweight)
const sessionService = new FirestoreSessionService({
  collectionName: process.env.FIRESTORE_COLLECTION || 'claris-sessions',
  db, // Reuse shared DB
});

const memoryService = new MemoryService(db, genClient);

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('📱 Client connected to WebSocket');

    // クエリパラメータから userId, sessionId, activeFile を取得
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId') || 'anonymous';
    const sessionId = url.searchParams.get('sessionId') || undefined;
    const activeFile = url.searchParams.get('activeFile') || undefined;
    const location = url.searchParams.get('location') || undefined;
    console.log(
      `👤 Connected user: ${userId}, Session: ${sessionId || 'new'}, Active File: ${activeFile || 'none'}, Location: ${location || 'unknown'}`,
    );

    // プロアクティブ通知のために WebSocket 接続を登録
    notificationService.register(userId, ws);

    // Initialize session with shared dependencies
    const liveSession = new ServerLiveSession(liveClient, sessionService, memoryService);

    // 🚀 Start session immediately on connection!
    // Do NOT wait for first audio. This hides the cold start latency.
    liveSession.start(userId, activeFile).catch((err) => {
      console.error('Failed to start session on connection:', err);
    });

    // Handle incoming audio from client
    ws.on('message', async (data, isBinary) => {
      if (isBinary) {
        // Audio chunk received
        await liveSession.sendAudio(data as Buffer);
      } else {
        // Text message (control commands etc)
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
