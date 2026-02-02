import { createClarisAgent } from '@/agents/claris.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';
import { type Event, InMemoryRunner } from '@google/adk';

const APP_NAME = 'claris';

export class AdkRunnerService {
  private readonly sessionService: FirestoreSessionService;

  constructor() {
    this.sessionService = new FirestoreSessionService({
      collectionName: process.env.FIRESTORE_COLLECTION || 'claris-sessions',
    });
  }

  /**
   * Executes an agent turn with the given user message
   */
  async run(options: {
    userId: string;
    sessionId: string;
    message: string;
    context?: { activeFile?: string }; // 🦀 Context for Soul Unison
  }): Promise<string> {
    // 毎回設定を読み込むことで、ナビカスの調整を即時反映する
    // Context を渡して適切なソウルを共鳴させる
    const agent = await createClarisAgent(options.context);

    // Ensure session exists
    let session = await this.sessionService.getSession({
      appName: APP_NAME,
      userId: options.userId,
      sessionId: options.sessionId,
    });

    if (!session) {
      session = await this.sessionService.createSession({
        appName: APP_NAME,
        userId: options.userId,
        sessionId: options.sessionId,
      });
    }

    // Create runner with our session service
    const runner = new InMemoryRunner({
      agent,
      appName: APP_NAME,
    });

    // For now, create a temporary session in the InMemoryRunner
    await runner.sessionService.createSession({
      appName: APP_NAME,
      userId: options.userId,
      sessionId: options.sessionId,
    });

    // Execute the agent turn
    const events = runner.runAsync({
      userId: options.userId,
      sessionId: options.sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: options.message }],
      },
    });

    // Collect response content
    let responseText = '';
    const bufferedEvents: Event[] = [];

    try {
      for await (const event of events) {
        if (session) {
          console.log(`[Runner] Event: ${JSON.stringify(event)}`);
          // Attach timestamp immediately to capture generation time
          if (!event.timestamp) {
            event.timestamp = Date.now();
          }
          bufferedEvents.push(event);
        }

        // Extract text content from agent responses
        if (event.author === agent.name && event.content?.parts) {
          for (const part of event.content.parts) {
            if ('text' in part && part.text) {
              responseText += part.text;
            }
          }
        }
      }
    } finally {
      // Ensure all events are persisted before returning (batched for performance and order consistency)
      // Even if the loop fails, we save what we have buffered so far.
      if (session && bufferedEvents.length > 0) {
        await this.sessionService.appendEvents({
          session,
          events: bufferedEvents,
        });
      }
    }

    return responseText || 'Clarisからの応答がありませんでした。';
  }
}

// Singleton instance
export const adkRunner = new AdkRunnerService();
