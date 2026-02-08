import { type Message, PubSub, type Subscription } from '@google-cloud/pubsub';

export type PubSubHandler = (message: Message) => Promise<void>;

export class PubSubListener {
  private pubsub: PubSub;
  private subscriptionName: string;
  private subscription: Subscription | null = null;
  private handler: PubSubHandler | null = null;

  constructor(projectId: string, subscriptionName: string) {
    this.pubsub = new PubSub({ projectId });
    this.subscriptionName = subscriptionName;
  }

  public listen(handler: PubSubHandler) {
    if (this.subscription) {
      console.warn('⚠️ PubSubListener is already listening.');
      return;
    }

    this.handler = handler;
    this.subscription = this.pubsub.subscription(this.subscriptionName);

    console.log(`📡 Listening for messages on ${this.subscriptionName}...`);

    this.subscription.on('message', async (message: Message) => {
      try {
        if (this.handler) {
          await this.handler(message);
        }
        message.ack();
      } catch (error) {
        console.error('❌ Error handling Pub/Sub message:', error);
        message.nack();
      }
    });

    this.subscription.on('error', (error) => {
      console.error('❌ Pub/Sub subscription error:', error);
    });
  }

  public async stop() {
    if (this.subscription) {
      console.log('🛑 Stopping PubSubListener...');
      await this.subscription.close();
      this.subscription = null;
      this.handler = null;
    }
  }
}
