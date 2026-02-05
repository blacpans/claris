import { GoogleGenAI, Modality, type Part } from '@google/genai';
import { CLARIS_INSTRUCTIONS } from '@/agents/prompts.js';
import '@/config/env.js';
import { EventEmitter } from 'node:events';
import type { ListSessionsRequest } from '@google/adk';
import { MemoryService } from '@/core/memory/MemoryService.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';

// Interface for events emitted by ServerLiveSession
export interface ServerLiveSessionEvents {
  audio: (data: Buffer) => void;
  text: (text: string) => void;
  close: () => void;
  interrupted: () => void;
  error: (error: Error) => void;
}

interface LiveServerMessage {
  serverContent?: {
    modelTurn?: {
      parts?: Part[];
    };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
}

interface LiveSessionClient {
  send: (parts: string | Part[] | object, turnComplete?: boolean) => Promise<void>;
}

// Local interface for stored events to ensure type safety
interface StoredEvent {
  type: string;
  text: string;
  timestamp?: number;
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
  private currentUserId: string = 'anonymous';
  private currentSessionId: string | null = null;

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
    // Generate session ID if not exists (for this run)
    if (!this.currentSessionId) {
      this.currentSessionId = `session-${Date.now()}`;
    }

    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';
    console.log(`🔌 Connecting to Gemini (${model}) for Server Session...`);

    // Load Memory
    const memory = await this.loadMemory(userId);
    console.log(`🧠 Memory Loaded: ${memory.length} characters`);

    const config = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [
          {
            text: `Language: Japanese (Always speak in Japanese)
${CLARIS_INSTRUCTIONS}

NOTE: You are in "Live Mode". Speak conversationally and keep responses short.

## Memory (Past Conversations)
${memory}`,
          },
        ],
      },
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Aoede', // Valid voice name for Gemini Live
          },
        },
      },
    };

    try {
      this.session = await this.client.live.connect({
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
          longTermMemory =
            '## Long-term Memory (Relevant Facts)\n' + results.map((r) => `- ${r.memory.summary}`).join('\n') + '\n\n';
        }
      } catch (err) {
        console.error('Failed to load long-term memory:', err);
      }

      // 2. Short-term Memory (Recent Session)
      const list = await this.sessionService.listSessions({
        appName: 'claris',
        userId: userId,
      } as ListSessionsRequest);

      if (!list.sessions || list.sessions.length === 0) {
        // user 'anonymous' fallback removed for privacy
        return `${longTermMemory}No previous conversation history.`.trim();
      }

      // Sort by lastUpdateTime desc
      const sortedSessions = list.sessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
      const latestSessionSummary = sortedSessions[0];

      if (!latestSessionSummary) {
        return `${longTermMemory}No previous conversation history.`.trim();
      }

      // Fetch full session details
      const session = await this.sessionService.getSession({
        appName: 'claris',
        userId: userId,
        sessionId: latestSessionSummary.id,
        config: { numRecentEvents: 20 },
      });

      if (!session || !('events' in session)) return `${longTermMemory}No previous conversation history.`.trim();

      // Cast to custom type that definitely has events
      const events = (session as unknown as { events: StoredEvent[] }).events;

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
   * Sends audio chunk from client to Gemini
   * @param inputAudioPCM 16kHz PCM Audio Buffer
   */
  async sendAudio(inputAudioPCM: Buffer) {
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
    } catch (e) {
      console.error('Error sending audio:', e);
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          // Received Audio from Gemini -> Emit to WebSocket
          const pcmData = Buffer.from(part.inlineData.data, 'base64');
          this.emit('audio', pcmData);
        }
        if (part.text) {
          this.emit('text', part.text);
        }
      }
    }

    if (message.serverContent?.interrupted) {
      console.log('🛑 Interrupted');
      this.emit('interrupted');
    }
  }

  /**
   * Gracefully disconnects: requests a summary, saves it, then closes.
   */
  async disconnect() {
    if (!this.session) return;

    console.log('📝 Requesting conversation summary...');
    try {
      // 1. Request Summary
      const session = this.session as LiveSessionClient;
      // Send text "User: ..."
      await session.send(
        '会話を終了します。これまでの会話の要約を作成してください。（ユーザーの好み、重要な事実、話したトピックを中心に）',
        true,
      );

      // 2. Wait for Summary Response
      const timeoutMs = process.env.SUMMARY_TIMEOUT_MS ? parseInt(process.env.SUMMARY_TIMEOUT_MS, 10) : 10000;
      const summary = await this.waitForSummary(timeoutMs);

      // 3. Save Memory
      if (summary && this.currentSessionId && this.currentUserId !== 'anonymous') {
        console.log(`💾 Saving Summary: ${summary.slice(0, 50)}...`);
        await this.memoryService.saveMemory(this.currentUserId, this.currentSessionId, summary);
      } else {
        console.log('⚠️ No summary received or session ID missing, skipping save.');
      }
    } catch (e) {
      console.error('❌ Failed to summarize session:', e);
    } finally {
      // 4. Close
      this.stop();
    }
  }

  private waitForSummary(timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
      let accumulated = '';
      let timer: NodeJS.Timeout;

      const handler = (text: string) => {
        accumulated += text;
      };

      this.on('text', handler);

      timer = setTimeout(() => {
        this.off('text', handler);
        clearTimeout(timer);
        resolve(accumulated.trim());
      }, timeoutMs);
    });
  }

  stop() {
    if (this.session) {
      // this.session.close();
      this.session = null;
    }
  }
}
