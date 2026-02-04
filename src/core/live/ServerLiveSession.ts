import { GoogleGenAI, Modality, type Part } from '@google/genai';
import { CLARIS_INSTRUCTIONS } from '@/agents/prompts.js';
import '@/config/env.js';
import { EventEmitter } from 'node:events';
import type { ListSessionsRequest } from '@google/adk';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';

// Interface for events emitted by ServerLiveSession
export interface ServerLiveSessionEvents {
  audio: (data: Buffer) => void;
  text: (text: string) => void;
  close: () => void;
  interrupted: () => void;
  error: (error: Error) => void;
}

interface StoredEvent {
  type: string;
  text: string;
  timestamp?: number;
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
  }

  async start(userId = 'anonymous') {
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
      // Find the most recent session for this user
      const list = await this.sessionService.listSessions({
        appName: 'claris',
        userId: userId,
      } as ListSessionsRequest);

      if (!list.sessions || list.sessions.length === 0) {
        // Fallback: Check for 'anonymous' if current user is different
        if (userId !== 'anonymous') {
          return this.loadMemory('anonymous');
        }
        return 'No previous conversation history.';
      }

      // Sort by lastUpdateTime desc
      const sortedSessions = list.sessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
      const latestSessionSummary = sortedSessions[0];

      if (!latestSessionSummary) {
        return 'No previous conversation history.';
      }

      // Fetch full session details
      const session = await this.sessionService.getSession({
        appName: 'claris',
        userId: userId,
        sessionId: latestSessionSummary.id,
        config: { numRecentEvents: 20 },
      });

      if (!session || !('events' in session)) return 'No previous conversation history.';

      // Cast to custom type that definitely has events
      const events = (session as unknown as { events: StoredEvent[] }).events;

      // Format events to text
      const history = events
        .map((e) => {
          if (e.type === 'user-message') return `User: ${e.text}`;
          if (e.type === 'model-response') return `Claris: ${e.text}`;
          return null;
        })
        .filter(Boolean)
        .join('\n');

      return history || 'No previous conversation history.';
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
      // Explicitly cast session to expected interface structure
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

  stop() {
    if (this.session) {
      // this.session.close();
      this.session = null;
    }
  }
}
