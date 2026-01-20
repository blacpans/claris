/**
 * ADK Runner Service - Orchestrates agent execution
 *
 * This service initializes the ADK Runner with Claris agent and Firestore sessions,
 * and provides a simple interface to execute agent turns from webhook handlers.
 */
import { InMemoryRunner } from '@google/adk';
import { clarisAgent } from '../agents/claris.js';
import { FirestoreSessionService } from '../sessions/firestoreSession.js';

// Re-export FirestoreSessionService for compatibility with ADK Runner
// Note: InMemoryRunner uses InMemorySessionService by default,
// but we can pass our custom one via the constructor

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
  }): Promise<string> {
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
    // Note: InMemoryRunner manages its own session service internally,
    // so we need to manually sync with Firestore before/after runs
    const runner = new InMemoryRunner({
      agent: clarisAgent,
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
    for await (const event of events) {
      // Store event in Firestore for persistence
      if (session) {
        console.log(`[Runner] Event: ${JSON.stringify(event)}`);
        await this.sessionService.appendEvent({
          session,
          event: event as any,
        });
      }

      // Extract text content from agent responses
      if (event.author === clarisAgent.name && event.content?.parts) {
        for (const part of event.content.parts) {
          if ('text' in part && part.text) {
            responseText += part.text;
          }
        }
      }
    }

    return responseText || 'Clarisからの応答がありませんでした。';
  }
}

// Singleton instance
export const adkRunner = new AdkRunnerService();
