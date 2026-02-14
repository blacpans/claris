import { type Event, InMemoryRunner } from '@google/adk';
import { createClarisAgent } from '@/agents/claris.js';
import { PubSubListener } from '@/core/async/pubsub.js';
import { eventCollector } from '@/core/proactive/index.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';
import { getGmailClient } from '@/tools/google/auth.js';

const APP_NAME = 'claris';

export class AdkRunnerService {
  private readonly sessionService: FirestoreSessionService;
  private pubsubListener: PubSubListener | null = null;

  constructor() {
    this.sessionService = new FirestoreSessionService({
      collectionName: process.env.FIRESTORE_COLLECTION || 'claris-sessions',
    });
    this.initializePubSub();
  }

  private async initializePubSub() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const subscriptionName = process.env.PUBSUB_SUBSCRIPTION;

    if (projectId && subscriptionName) {
      this.pubsubListener = new PubSubListener(projectId, subscriptionName);
      this.pubsubListener.listen(this.handlePubSubMessage.bind(this));
    } else {
      console.log('ℹ️ Pub/Sub configuration missing. Skipping listener initialization.');
    }
  }

  private async handlePubSubMessage(message: {
    id: string;
    data?: string | Buffer;
    ack: () => void;
    nack: () => void;
  }) {
    console.log(`📨 Received Pub/Sub message: ${message.id}`);
    const data = message.data ? Buffer.from(message.data as string, 'base64').toString() : '{}';
    const parsedData = JSON.parse(data);

    // Gmail Notification Handling
    if (parsedData.emailAddress && parsedData.historyId) {
      console.log(`📧 Gmail Notification for ${parsedData.emailAddress}, History ID: ${parsedData.historyId}`);
      try {
        const gmail = await getGmailClient();
        const history = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: parsedData.historyId,
          historyTypes: ['messageAdded'],
        });

        const newMessages = history.data.history?.flatMap((h) => h.messagesAdded || []) || [];

        if (newMessages.length > 0) {
          const emails = await Promise.all(
            newMessages.map(async (msg) => {
              if (!msg.message?.id) return null;
              const m = await gmail.users.messages.get({
                userId: 'me',
                id: msg.message.id,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From'],
              });
              const headers = m.data.payload?.headers;
              const subject = headers?.find((h) => h.name === 'Subject')?.value || '(No Subject)';
              const from = headers?.find((h) => h.name === 'From')?.value || '(Unknown)';
              return { from, subject };
            }),
          );

          const validEmails = emails.filter((e): e is { from: string; subject: string } => e !== null);
          if (validEmails.length > 0) {
            // EventCollector に委譲: 正規化 + 即時通知
            eventCollector.collectGmailEvent(parsedData.emailAddress, validEmails);
          }
        }
      } catch (error) {
        console.error('❌ Error processing Gmail notification:', error);
      }
    }
  }

  /**
   * Executes an agent turn with the given user message
   */
  async run(options: {
    userId: string;
    sessionId: string;
    message: string;
    context?: {
      activeFile?: string;
      mode?: 'chat' | 'review' | string;
      diff?: string;
    };
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

    // 📝 Ephemeral State: Prepare state for InMemoryRunner
    // We inject the diff here so it's available for ${diff} substitution,
    // but we do NOT save it to Firestore, ensuring it remains truly ephemeral.
    let runnerState = session.state;
    if (options.context?.diff) {
      runnerState = {
        ...runnerState,
        diff: options.context.diff,
      };
    }

    // Initialize session in the InMemoryRunner with our state
    await runner.sessionService.createSession({
      appName: APP_NAME,
      userId: options.userId,
      sessionId: options.sessionId,
      state: runnerState,
    });

    // 🧠 Context Injection: Supply historical events to the runner
    if (session.events && session.events.length > 0) {
      console.log(`[Runner] Injecting ${session.events.length} historical events into runner session.`);
      for (const event of session.events) {
        await runner.sessionService.appendEvent({
          session,
          event,
        });
      }
    }

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

    // Use a base time and counter to ensure unique timestamps even in high-speed loops
    const baseTime = Date.now();
    let eventIndex = 0;

    try {
      let eventCount = 0;
      for await (const event of events) {
        eventCount++;
        if (session) {
          console.log(`[Runner] Event #${eventCount}: ${JSON.stringify(event)}`);
          if (!event.timestamp) {
            event.timestamp = baseTime + eventIndex++;
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
      console.log(`[Runner] Finished loop. Total events: ${eventCount}, Total text length: ${responseText.length}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[Runner] Error in generation loop: ${message}`, e);
      throw e; // Webhook handler will catch this
    } finally {
      // Ensure all events are persisted before returning (batched for performance and order consistency)
      // Even if the loop fails, we save what we have buffered so far.
      if (session) {
        if (bufferedEvents.length > 0) {
          await this.sessionService.appendEvents({
            session,
            events: bufferedEvents,
          });
        }
      }
    }

    return responseText || 'Clarisからの応答がありませんでした。';
  }
}

// Singleton instance
export const adkRunner = new AdkRunnerService();
