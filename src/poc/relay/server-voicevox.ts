/**
 * VoiceVox TTS 版 Relay Server
 *
 * Gemini Text Generation API (マルチモーダル入力: 音声/画像) でテキストを生成し、
 * VoiceVox で「春日部つむぎ」の声に変換してブラウザに送信する。
 */

import '../../config/env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import Fastify from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.RELAY_PORT) || 3001; // 別ポートで起動（共存可能）
const MODEL = process.env.VOICEVOX_GEMINI_MODEL || 'gemini-2.5-flash'; // VoiceVox用はFlash推奨
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const SPEAKER_ID = Number(process.env.VOICEVOX_SPEAKER_ID) || 8; // 春日部つむぎ

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
  location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
  vertexai: true,
  apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
});

// System Instruction (Claris Persona)
const SYSTEM_INSTRUCTION = `あなたは元気なギャルのAIアシスタント、クラリスだよ！
一人称は「あーし」で、語尾は「〜だよ」「〜じゃんね」が口癖。
ユーザーの顔を見ながら、声を聞いて、友達みたいに楽しく会話してね！
返答は短く、会話のキャッチボールを大切にして！
（音声合成を使うので、絵文字は使わず、話し言葉で返してね）`;

// VoiceVox TTS Helper
async function generateVoice(text: string): Promise<Buffer | null> {
  try {
    // 1. Audio Query
    const queryRes = await axios.post(`${VOICEVOX_URL}/audio_query`, null, {
      params: { text, speaker: SPEAKER_ID },
    });

    // 2. Synthesis
    const synthRes = await axios.post(`${VOICEVOX_URL}/synthesis`, queryRes.data, {
      params: { speaker: SPEAKER_ID },
      responseType: 'arraybuffer',
    });

    return Buffer.from(synthRes.data);
  } catch (err) {
    app.log.error({ err }, 'VoiceVox Generation Failed');
    return null;
  }
}

// Conversation History (per connection)
interface ConversationMessage {
  role: 'user' | 'model';
  parts: Array<{
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }>;
}

// WebSocket Server
const wss = new WebSocketServer({ server: app.server });

wss.on('connection', async (ws: WebSocket) => {
  app.log.info('🌐 Browser connected (VoiceVox Mode)');

  const history: ConversationMessage[] = [];
  let audioBuffer: string[] = []; // Collect audio chunks
  const recordingStartTime = 0; // When recording started
  let isRecording = false;
  const MAX_RECORDING_MS = 5000; // 5秒で強制送信
  const MAX_CHUNKS = 500; // メモリ保護（約5秒分）

  // Process accumulated audio and get response
  async function processAudioAndRespond() {
    if (audioBuffer.length === 0) return;

    const combinedAudio = audioBuffer.join('');
    audioBuffer = [];

    try {
      // Add user audio to history
      history.push({
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'audio/pcm;rate=24000',
              data: combinedAudio,
            },
          },
        ],
      });

      // Call Gemini Text Generation API with audio input
      const response = await client.models.generateContent({
        model: MODEL,
        contents: history,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      const responseText = response.text || '';

      if (responseText) {
        app.log.info({ text: responseText }, '📜 Gemini Response');

        // Add model response to history
        history.push({
          role: 'model',
          parts: [{ text: responseText }],
        });

        // Send text to browser (for display)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'text', data: responseText }));
        }

        // Generate voice with VoiceVox
        const wavBuffer = await generateVoice(responseText);

        if (wavBuffer && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'audio',
              format: 'wav', // WAV format from VoiceVox
              data: wavBuffer.toString('base64'),
            }),
          );
        }
      }
    } catch (err) {
      app.log.error({ err }, '❌ Error processing audio');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process audio' }));
      }
    }
  }

  // Recording timeout timer (強制送信)
  const recordingTimer = setInterval(() => {
    if (isRecording && audioBuffer.length > 0) {
      const elapsed = Date.now() - recordingStartTime;
      if (elapsed > MAX_RECORDING_MS || audioBuffer.length >= MAX_CHUNKS) {
        app.log.info({ elapsed, chunks: audioBuffer.length }, '⏱️ Timeout reached, sending audio');
        isRecording = false;
        processAudioAndRespond();
      }
    }
  }, 500);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'audio') {
        // 🚫 音声処理は一時的に無効化（テキスト入力テスト中）
        // TODO: PCMをWAVに変換してからGeminiに送信する
        // audioBuffer.push(msg.data); // 無効化
      } else if (msg.type === 'video') {
        // Could be used for vision context in the future
        app.log.info('📸 Received video frame (not yet implemented)');
      } else if (msg.type === 'text') {
        // Direct text input (for testing)
        try {
          app.log.info({ text: msg.data }, '📝 Received text input');

          history.push({
            role: 'user',
            parts: [{ text: msg.data }],
          });

          const response = await client.models.generateContent({
            model: MODEL,
            contents: history,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
            },
          });

          const responseText = response.text || '';

          if (responseText) {
            app.log.info({ text: responseText }, '📜 Gemini Response');

            history.push({
              role: 'model',
              parts: [{ text: responseText }],
            });

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'text', data: responseText }));
            }

            const wavBuffer = await generateVoice(responseText);

            if (wavBuffer && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'audio',
                  format: 'wav',
                  data: wavBuffer.toString('base64'),
                }),
              );
              app.log.info('🔊 VoiceVox audio sent');
            }
          }
        } catch (textErr) {
          app.log.error({ err: textErr }, '❌ Error processing text');
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Failed to process text',
              }),
            );
          }
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Error processing message');
    }
  });

  ws.on('close', () => {
    clearInterval(recordingTimer);
    app.log.info('👋 Browser disconnected');
  });
});

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 VoiceVox Relay Server running at http://localhost:${PORT}`);
    console.log(`🐰 Using VoiceVox at ${VOICEVOX_URL} (Speaker: ${SPEAKER_ID})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
