/**
 * FirestoreSessionService - Persistent session storage for ADK
 *
 * Implements ADK's BaseSessionService to store agent sessions in Firestore.
 * This enables stateful conversations across HTTP requests.
 */
import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { Event, Session } from '@google/adk';
import type {
  AppendEventRequest,
  CreateSessionRequest,
  DeleteSessionRequest,
  GetSessionRequest,
  ListSessionsRequest,
  ListSessionsResponse,
} from '@google/adk';

export class FirestoreSessionService {
  private readonly db: Firestore;
  private readonly collectionName: string;

  constructor(options?: { collectionName?: string; db?: Firestore }) {
    this.db = options?.db || new Firestore({ ignoreUndefinedProperties: true });
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
      session.events = session.events.filter((e) => e.timestamp > (request.config?.afterTimestamp ?? 0));
    }

    return session;
  }

  /**
   * Lists all sessions for a user.
   *
   * Note: The returned sessions contain empty `events` and `state` to reduce payload size.
   * Use `getSession` to retrieve full session details.
   */
  async listSessions(request: ListSessionsRequest): Promise<ListSessionsResponse> {
    const snapshot = await this.db
      .collection(this.collectionName)
      .where('appName', '==', request.appName)
      .where('userId', '==', request.userId)
      .select('id', 'appName', 'userId', 'lastUpdateTime')
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
   * Appends multiple events to a session in a single batch
   */
  async appendEvents({ session, events }: { session: Session; events: Event[] }): Promise<Event[]> {
    if (events.length === 0) return [];

    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(session.appName, session.userId, session.id));

    const now = Date.now();
    const eventsWithTimestamp = events.map(
      (event, index) =>
        ({
          ...event,
          // Add index to timestamp to ensure uniqueness and preserve order within the batch
          timestamp: event.timestamp || now + index,
        }) as Event,
    );

    await docRef.update({
      events: FieldValue.arrayUnion(...eventsWithTimestamp.map((e) => this.removeUndefined(e))),
      lastUpdateTime: Date.now(),
    });

    return eventsWithTimestamp;
  }

  /**
   * Updates a session's state in Firestore
   */
  async updateSession(request: { session: Session; state?: Record<string, unknown> }): Promise<void> {
    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(request.session.appName, request.session.userId, request.session.id));

    const updates: Record<string, unknown> = {
      lastUpdateTime: Date.now(),
    };

    if (request.state) {
      updates.state = this.removeUndefined(request.state);
    }

    await docRef.update(updates);
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
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = this.removeUndefined(value);
        }
      }
      return result as unknown as T;
    }
    return obj;
  }
}
