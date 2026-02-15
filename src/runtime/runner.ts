import { type Event, InMemoryRunner } from '@google/adk';
import { createClarisAgent } from '@/agents/claris.js';
import { PubSubListener } from '@/core/async/pubsub.js';
import { eventCollector } from '@/core/proactive/index.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';
import { getGmailClient } from '@/tools/google/auth.js';

export class AdkRunnerService {
  private readonly sessionService: FirestoreSessionService;
  private pubsubListener: PubSubListener | null = null;
  private readonly appName: string;

  constructor() {
    this.appName = process.env.CLARIS_NAME || 'Claris';
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
      location?: string;
    };
  }): Promise<string> {
    console.log(`🏃 [Runner] Run called for user: ${options.userId}, session: ${options.sessionId}`);
    const agent = await createClarisAgent(options.context);

    // Ensure session exists
    let session = await this.sessionService.getSession({
      appName: this.appName,
      userId: options.userId,
      sessionId: options.sessionId,
    });

    if (!session) {
      session = await this.sessionService.createSession({
        appName: this.appName,
        userId: options.userId,
        sessionId: options.sessionId,
      });
    }

    // Create runner with our session service
    const runner = new InMemoryRunner({
      agent,
      appName: this.appName,
    });

    // Ephemeral State 準備
    let runnerState = session.state;
    if (options.context?.diff) {
      runnerState = {
        ...runnerState,
        diff: options.context.diff,
      };
    }

    const runnerSession = await runner.sessionService.createSession({
      appName: this.appName,
      userId: options.userId,
      sessionId: options.sessionId,
      state: runnerState,
    });

    // 🧠 Context Injection: Supply historical events to the runner
    if (session.events && session.events.length > 0) {
      console.log(`[Runner] Injecting ${session.events.length} historical events into runner session.`);
      for (const event of session.events) {
        await runner.sessionService.appendEvent({
          session: runnerSession,
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
    const baseTime = Date.now();
    let eventIndex = 0;

    try {
      let eventCount = 0;
      for await (const event of events) {
        eventCount++;
        console.log(`[Runner] Event #${eventCount} Received: ${JSON.stringify(event, null, 2)}`);

        if (session) {
          if (!event.timestamp) {
            event.timestamp = baseTime + eventIndex++;
          }
          bufferedEvents.push(event);
        }

        // Extract text content from agent responses
        // 厳密な判定：Author が明示的に agent 名に一致するか、 model/assistant の場合にのみテキストを拾うじゃんね！✨
        // author が空（!author）の場合は、ツール実行結果などの可能性が高いから除外するよ！💎
        const author = (event.author || '').toLowerCase();
        const agentName = agent.name.toLowerCase();
        const isAgent = author === agentName || author === 'model' || author === 'assistant';

        if (!isAgent || !event.content?.parts) {
          continue;
        }

        for (const part of event.content.parts) {
          if ('text' in part && part.text) {
            responseText += part.text;
          }
        }
      }
      console.log(
        `🚀 [Runner] Generation loop finished. Event count: ${eventCount}, Total text length: ${responseText.length}`,
      );
    } catch (e: unknown) {
      console.error(`[Runner] Error in generation loop: ${e}`);
      throw e;
    } finally {
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
