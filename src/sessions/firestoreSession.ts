/**
 * FirestoreSessionService - Persistent session storage for ADK
 *
 * Implements ADK's BaseSessionService to store agent sessions in Firestore.
 * This enables stateful conversations across HTTP requests.
 */
import { Firestore, FieldValue } from '@google-cloud/firestore';
import type { Event, Session } from '@google/adk';
import type {
  CreateSessionRequest,
  GetSessionRequest,
  ListSessionsRequest,
  ListSessionsResponse,
  DeleteSessionRequest,
  AppendEventRequest,
} from '@google/adk';

export class FirestoreSessionService {
  private readonly db: Firestore;
  private readonly collectionName: string;

  constructor(options?: { collectionName?: string }) {
    this.db = new Firestore({ ignoreUndefinedProperties: true });
    this.collectionName = options?.collectionName || 'claris-sessions';
  }

  /**
   * Creates a new session in Firestore
   */
  async createSession(request: CreateSessionRequest): Promise<Session> {
    const sessionId = request.sessionId || this.generateId();
    const session: Session = {
      id: sessionId,
      appName: request.appName,
      userId: request.userId,
      state: (request.state as Record<string, unknown>) || {},
      events: [],
      lastUpdateTime: Date.now(),
    };

    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(request.appName, request.userId, sessionId));

    await docRef.set(this.removeUndefined(session));
    console.log(`[Firestore] Created session: ${sessionId}`);
    return session;
  }

  /**
   * Retrieves a session from Firestore
   */
  async getSession(request: GetSessionRequest): Promise<Session | undefined> {
    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(request.appName, request.userId, request.sessionId));

    const doc = await docRef.get();
    if (!doc.exists) {
      return undefined;
    }

    const session = doc.data() as Session;

    // Apply optional filters
    if (request.config?.numRecentEvents) {
      session.events = session.events.slice(-request.config.numRecentEvents);
    }
    if (request.config?.afterTimestamp) {
      session.events = session.events.filter(
        (e) => e.timestamp > request.config!.afterTimestamp!
      );
    }

    return session;
  }

  /**
   * Lists all sessions for a user
   */
  async listSessions(request: ListSessionsRequest): Promise<ListSessionsResponse> {
    const snapshot = await this.db
      .collection(this.collectionName)
      .where('appName', '==', request.appName)
      .where('userId', '==', request.userId)
      .get();

    const sessions: Session[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Session;
      // Don't include events/state in list response (too heavy)
      return {
        id: data.id,
        appName: data.appName,
        userId: data.userId,
        state: {},
        events: [],
        lastUpdateTime: data.lastUpdateTime,
      };
    });

    return { sessions };
  }

  /**
   * Deletes a session from Firestore
   */
  async deleteSession(request: DeleteSessionRequest): Promise<void> {
    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(request.appName, request.userId, request.sessionId));

    await docRef.delete();
  }

  /**
   * Appends an event to a session
   */
  async appendEvent({ session, event }: AppendEventRequest): Promise<Event> {
    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(session.appName, session.userId, session.id));

    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    } as Event;

    await docRef.update({
      events: FieldValue.arrayUnion(this.removeUndefined(eventWithTimestamp)),
      lastUpdateTime: Date.now(),
    });

    return eventWithTimestamp;
  }

  /**
   * Builds a unique document ID for a session
   */
  private buildDocId(appName: string, userId: string, sessionId: string): string {
    return `${appName}__${userId}__${sessionId}`;
  }

  /**
   * Generates a random session ID
   */
  private generateId(): string {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Recursively removes undefined values from an object
   */
  private removeUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return obj.map((v) => this.removeUndefined(v)) as unknown as T;
    }
    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = this.removeUndefined(value);
        }
      }
      return result;
    }
    return obj;
  }
}
