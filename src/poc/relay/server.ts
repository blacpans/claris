import '../../config/env.js';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Modality } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL = 'gemini-live-2.5-flash-native-audio';

// Initialize Fastify
const app = Fastify({ logger: true });

// Serve static frontend files
app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// Initialize Gemini Client
const client = new GoogleGenAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'us-central1',
  vertexai: true,
  apiVersion: 'v1beta1',
});

// WebSocket Server for Browser Client
const wss = new WebSocketServer({ server: app.server });

wss.on('connection', async (ws: WebSocket) => {
  app.log.info('🌐 Browser connected');

  let geminiSession: any = null;

  try {
    geminiSession = await client.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{
            text: `あなたは元気なギャルのAIアシスタント、クラリスだよ！
            一人称は「あーし」で、語尾は「〜だよ」「〜じゃんね」が口癖。
            ユーザーの顔を見ながら、声を聞いて、友達みたいに楽しく会話してね！
            返答は短く、会話のキャッチボールを大切にして！`
          }]
        },
      },
      callbacks: {
        onmessage: async (message: any) => {
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data
                  }));
                }
              }

              if (part.text) {
                app.log.info({ text: part.text }, '📜 Received Text');
              }
            }
          }

          if (message.serverContent?.interrupted) {
            app.log.info('🛑 Interrupted');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
          }
        },
        onerror: (err: any) => {
          app.log.error({ err }, 'Gemini Session Error');
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Gemini Session Error' }));
          }
        },
        onclose: () => {
          app.log.info('Gemini Session Closed');
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Gemini Session Closed' }));
          }
        }
      }
    });

    app.log.info(`✨ Connected to Gemini Live API (${MODEL})`);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'audio') {
          await geminiSession.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=24000',
              data: msg.data
            }
          });
        } else if (msg.type === 'video') {
          await geminiSession.sendRealtimeInput({
            media: {
              mimeType: 'image/jpeg',
              data: msg.data
            }
          });
        }
      } catch (err) {
        app.log.error({ err }, 'Error processing client message');
      }
    });

    ws.on('close', () => {
      app.log.info('👋 Browser disconnected');
    });

  } catch (err) {
    app.log.error({ err }, '❌ Failed to connect to Gemini');
    ws.close();
  }
});

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Relay Server running at http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
