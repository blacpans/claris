import { EventEmitter } from 'node:events';
import type { Event, Session } from '@google/adk';
import { GoogleGenAI, type Part } from '@google/genai';
import { generateLiveSessionConfig } from '@/agents/prompts.js';
import '@/config/env.js';
import { getLiveModel } from '@/config/models.js';
import { MemoryService } from '@/core/memory/MemoryService.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';
import { fastBase64Decode } from '@/utils/base64.js';

// Interface for events emitted by ServerLiveSession
export interface ServerLiveSessionEvents {
  audio: (data: Buffer) => void;
  text: (text: string) => void;
  close: () => void;
  interrupted: () => void;
  turnComplete: () => void;
  error: (error: Error) => void;
}

interface LiveServerMessage {
  serverContent?: {
    modelTurn?: {
      parts?: Part[];
    };
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: {
      text?: string;
      finished?: boolean;
    };
  };
}

/**
 * Claris 固有のセッションイベント定義 🧠
 * ADK の Event 型を拡張して、会話履歴に必要な type と text を持たせるじゃんね！💎
 */
interface ClarisSessionEvent extends Event {
  type: 'user-message' | 'model-response';
  text: string;
}

/**
 * ServerLiveSession
 *
 * Manages a Gemini Live API session for a server-side client (via WebSocket).
 * Instead of playing/recording audio directly, it emits events and accepts data buffers.
 */
export class ServerLiveSession extends EventEmitter {
  private client: GoogleGenAI;
  // using unknown to avoid 'any' for internal SDK session type
  private session: unknown = null;
  private sessionService: FirestoreSessionService;
  private memoryService: MemoryService;
  private currentSessionId: string | null = null;
  private currentUserId: string = 'anonymous';
  private eventsBuffer: ClarisSessionEvent[] = [];

  // Audio Buffer for connection phase
  private audioQueue: Buffer[] = [];

  constructor() {
    super();
    this.client = new GoogleGenAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
      vertexai: true,
      apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
    });
    this.sessionService = new FirestoreSessionService({
      collectionName: process.env.FIRESTORE_COLLECTION || 'claris-sessions',
    });
    this.memoryService = new MemoryService();
  }

  async start(userId = 'anonymous') {
    this.currentUserId = userId;
    this.eventsBuffer = []; // Reset buffer for new session

    // Generate session ID if not exists (for this run)
    if (!this.currentSessionId) {
      this.currentSessionId = `session-${Date.now()}`;
    }

    const model = getLiveModel();
    console.log(`🔌 Connecting to Gemini (${model}) for Server Session...`);

    // Load Memory
    const memory = await this.loadMemory(userId);
    console.log(`🧠 Memory Loaded: ${memory.length} characters`);

    const config = generateLiveSessionConfig(process.env.CLARIS_NAME || 'Claris', memory);

    try {
      // biome-ignore lint/suspicious/noExplicitAny: SDK types for Live API are currently incomplete
      this.session = await (this.client as any).live.connect({
        model: model,
        config: config,
        callbacks: {
          onmessage: async (message: unknown) => {
            await this.handleMessage(message as LiveServerMessage);
          },
          onerror: (err: unknown) => {
            console.error('❌ Session Error:', JSON.stringify(err, null, 2));
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
          },
          onclose: (event: unknown) => {
            console.log('🔌 Session Closed', event);
            this.emit('close');
          },
        },
      });

      console.log('✨ Connected to Gemini Live!');

      // Flush buffered audio
      if (this.audioQueue.length > 0) {
        console.log(`🌊 Flushing ${this.audioQueue.length} buffered audio chunks...`);
        for (const chunk of this.audioQueue) {
          await this.sendAudioInternal(chunk);
        }
        this.audioQueue = []; // Clear buffer
      }
    } catch (err) {
      console.error('❌ Failed to connect:', err);
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async loadMemory(userId: string): Promise<string> {
    try {
      // 1. Long-term Memory (RAG)
      let longTermMemory = '';
      try {
        // Retrieve relevant memories
        const results = await this.memoryService.searchMemories(
          userId,
          'User preferences, personality, and important facts',
          3,
        );
        if (results.length > 0) {
          longTermMemory = `## Long-term Memory (Relevant Facts)\n${results.map((r) => `- ${r.memory.summary}`).join('\n')}\n\n`;
        }
      } catch (err) {
        console.error('Failed to load long-term memory:', err);
      }

      // 2. Short-term Memory (Recent Session)
      const session = await this.sessionService.getLatestSession({
        appName: 'claris',
        userId: userId,
        config: { numRecentEvents: 20 },
      });

      if (!session) return `${longTermMemory}No previous conversation history.`.trim();

      const events = (session.events || []) as ClarisSessionEvent[];

      // Format events to text
      const shortTermHistory = events
        .map((e) => {
          if (e.type === 'user-message') return `User: ${e.text}`;
          if (e.type === 'model-response') return `Claris: ${e.text}`;
          return null;
        })
        .filter(Boolean)
        .join('\n');

      return `${longTermMemory}${shortTermHistory || 'No previous conversation history.'}`.trim();
    } catch (e) {
      console.error('Error loading memory:', e);
      return 'Failed to load memory.';
    }
  }

  /**
   * Sends audio chunk from client to Gemini.
   * Buffers if session is not yet ready.
   * @param inputAudioPCM 16kHz PCM Audio Buffer
   */
  async sendAudio(inputAudioPCM: Buffer) {
    if (!this.session) {
      // Buffer the audio
      // Limit buffer size to prevent memory leaks if connection never succeeds (e.g., max 10 seconds ~ 500 chunks)
      if (this.audioQueue.length < 500) {
        this.audioQueue.push(inputAudioPCM);
        if (this.audioQueue.length % 50 === 0) {
          console.log(`⏳ Buffering audio... (${this.audioQueue.length} chunks)`);
        }
      }
      return;
    }
    await this.sendAudioInternal(inputAudioPCM);
  }

  private async sendAudioInternal(inputAudioPCM: Buffer) {
    if (!this.session) return;
    try {
      await (
        this.session as { sendRealtimeInput: (arg: { media: { mimeType: string; data: string } }) => Promise<void> }
      ).sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=16000',
          data: inputAudioPCM.toString('base64'),
        },
      });
      // console.log('.'); // Heartbeat
    } catch (e) {
      console.error('Error sending audio:', e);
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          // Received Audio from Gemini -> Emit to WebSocket
          const pcmData = fastBase64Decode(part.inlineData.data);
          this.emit('audio', pcmData);
        }
        if (part.text) {
          this.emit('text', part.text);
        }
      }
    }

    if (message.serverContent?.turnComplete) {
      console.log('✅ Turn Complete');
      this.emit('turnComplete');
    }

    if (message.serverContent?.interrupted) {
      console.log('🛑 Interrupted');
      this.emit('interrupted');
    }

    // ユーザー発言の記録
    if (message.serverContent?.inputTranscription?.text) {
      const text = message.serverContent.inputTranscription.text;
      // 重複記録を避けるため、最後のイベントが同じテキストの user-message でないかチェック
      const lastEvent = this.eventsBuffer[this.eventsBuffer.length - 1];
      if (!lastEvent || lastEvent.type !== 'user-message' || lastEvent.text !== text) {
        this.eventsBuffer.push({
          id: `ev-${Date.now()}`,
          type: 'user-message',
          text,
          timestamp: Date.now(),
          invocationId: '', // Live API doesn't have ADK invocation context here
          actions: {
            stateDelta: {},
            artifactDelta: {},
            requestedAuthConfigs: {},
            requestedToolConfirmations: {},
          },
        });
      }
    }

    // モデル発言の記録
    if (message.serverContent?.modelTurn?.parts) {
      const modelText = message.serverContent.modelTurn.parts
        .map((p) => p.text)
        .filter(Boolean)
        .join('');

      if (modelText) {
        this.eventsBuffer.push({
          id: `ev-${Date.now()}`,
          type: 'model-response',
          text: modelText,
          timestamp: Date.now(),
          invocationId: '', // Live API doesn't have ADK invocation context here
          actions: {
            stateDelta: {},
            artifactDelta: {},
            requestedAuthConfigs: {},
            requestedToolConfirmations: {},
          },
        });
      }
    }
  }

  /**
   * Gracefully disconnects: requests a summary, saves it, then closes.
   */
  async disconnect() {
    this.audioQueue = []; // Clear audio buffer

    if (!this.session) return;

    console.log('📝 Disconnecting session...');

    try {
      if (this.eventsBuffer.length > 0 && this.currentSessionId) {
        // 1. 会話履歴の保存（短期記憶）
        console.log(`💾 Saving ${this.eventsBuffer.length} events to Firestore...`);
        const session: Session = {
          id: this.currentSessionId,
          appName: process.env.CLARIS_NAME || 'Claris',
          userId: this.currentUserId,
          state: {},
          events: [],
          lastUpdateTime: Date.now(),
        };
        const events: Event[] = this.eventsBuffer.map((e, index) => ({
          ...e,
          id: e.id || `ls-${Date.now()}-${index}`,
        }));
        await this.sessionService.appendEvents({ session, events });

        // 2. 要約の生成と保存（長期記憶）
        const fullText = this.eventsBuffer
          .map((e) => (e.type === 'user-message' ? `User: ${e.text}` : `Claris: ${e.text}`))
          .join('\n');

        if (fullText.length > 50) {
          console.log('🧠 Generating session summary...');
          await this.memoryService.addMemory(this.currentUserId, this.currentSessionId, fullText);
        }
      }
    } catch (e) {
      console.error('❌ Failed to save session data:', e);
    }

    this.stop();
  }

  stop() {
    if (this.session) {
      // this.session.close();
      this.session = null;
    }
    this.audioQueue = [];
  }
}
