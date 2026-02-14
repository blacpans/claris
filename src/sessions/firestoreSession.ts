/**
 * FirestoreSessionService - Persistent session storage for ADK
 *
 * Implements ADK's BaseSessionService to store agent sessions in Firestore.
 * This enables stateful conversations across HTTP requests.
 */

import type {
  AppendEventRequest,
  CreateSessionRequest,
  DeleteSessionRequest,
  Event,
  GetSessionRequest,
  ListSessionsRequest,
  ListSessionsResponse,
  Session,
} from '@google/adk';
import { type CollectionReference, type DocumentReference, Firestore, type Query } from '@google-cloud/firestore';

const DEFAULT_EVENT_LIMIT = 1000;

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
      events: [], // Kept in interface but empty in storage
      lastUpdateTime: Date.now(),
    };

    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(request.appName, request.userId, sessionId));

    // Exclude 'events' from the parent document storage
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { events, ...sessionData } = session;

    await docRef.set(this.removeUndefined(sessionData));
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

    const sessionData = doc.data() as Session;
    const session: Session = {
      ...sessionData,
      events: [],
    };

    session.events = await this._fetchEvents(docRef, request.config);

    return session;
  }

  /**
   * Retrieves the latest session for a user.
   *
   * @remarks
   * This query requires a Firestore Composite Index:
   * - appName (ASC)
   * - userId (ASC)
   * - lastUpdateTime (DESC)
   */
  async getLatestSession(request: {
    appName: string;
    userId: string;
    config?: { numRecentEvents?: number; afterTimestamp?: number };
  }): Promise<Session | null> {
    const snapshot = await this.db
      .collection(this.collectionName)
      .where('appName', '==', request.appName)
      .where('userId', '==', request.userId)
      .orderBy('lastUpdateTime', 'desc')
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }

    const data = doc.data() as Session;
    const events = request.config ? await this._fetchEvents(doc.ref, request.config) : [];

    return {
      ...data,
      events,
    };
  }

  /**
   * Lists all sessions for a user.
   */
  async listSessions(
    request: ListSessionsRequest & { limit?: number; offset?: number },
  ): Promise<ListSessionsResponse> {
    let query = this.db
      .collection(this.collectionName)
      .where('appName', '==', request.appName)
      .where('userId', '==', request.userId)
      .orderBy('lastUpdateTime', 'desc')
      .select('id', 'appName', 'userId', 'lastUpdateTime'); // Only fetch metadata

    if (request.offset !== undefined) {
      query = query.offset(request.offset);
    }

    if (request.limit !== undefined) {
      query = query.limit(request.limit);
    }

    const snapshot = await query.get();

    const sessions: Session[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Session;
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
   * Deletes a session from Firestore (Recursive delete)
   */
  async deleteSession(request: DeleteSessionRequest): Promise<void> {
    const docRef = this.db
      .collection(this.collectionName)
      .doc(this.buildDocId(request.appName, request.userId, request.sessionId));

    // Delete subcollection 'events'
    await this.deleteCollection(docRef.collection('events'), 50);

    // Delete parent doc
    await docRef.delete();
  }

  /**
   * Helper to fetch events for a session
   */
  private async _fetchEvents(
    docRef: DocumentReference,
    config?: { numRecentEvents?: number; afterTimestamp?: number },
  ): Promise<Event[]> {
    // Fetch events from subcollection
    let query = docRef.collection('events').orderBy('timestamp', 'asc');

    // Apply optional filters
    if (config?.afterTimestamp) {
      query = query.where('timestamp', '>', config.afterTimestamp);
    }

    // Prevent unbounded fetches by applying a default limit if no specific limit is requested
    if (!config?.numRecentEvents) {
      query = query.limit(DEFAULT_EVENT_LIMIT);
    }

    // Note: limitToLast is more efficient for "recent items" but tricky with 'asc' sort if we want the *very* last ones.
    // If we want the last N events: orderBy('timestamp', 'desc').limit(N) -> then reverse.
    if (config?.numRecentEvents) {
      let recentQuery: Query = docRef.collection('events');

      if (config?.afterTimestamp) {
        recentQuery = recentQuery.where('timestamp', '>', config.afterTimestamp);
      }

      recentQuery = recentQuery.orderBy('timestamp', 'desc').limit(config.numRecentEvents);

      const snapshot = await recentQuery.get();
      return snapshot.docs.map((d) => d.data() as Event).reverse();
    }

    const snapshot = await query.get();
    let events = snapshot.docs.map((d) => d.data() as Event);

    // If both applied and we fell back to 'asc' query, slice locally (though less efficient)
    if (config?.numRecentEvents && events.length > config.numRecentEvents) {
      events = events.slice(-config.numRecentEvents);
    }

    return events;
  }

  /**
   * Helper to recursively delete a collection
   * Reference: https://firebase.google.com/docs/firestore/manage-data/delete-data#collections
   */
  private async deleteCollection(collectionRef: CollectionReference, batchSize: number): Promise<void> {
    const query = collectionRef.orderBy('__name__').limit(batchSize);
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      return;
    }

    const batch = this.db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    // Recurse
    if (snapshot.size >= batchSize) {
      await this.deleteCollection(collectionRef, batchSize);
    }
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

    // Add to subcollection
    await docRef.collection('events').add(this.removeUndefined(eventWithTimestamp));

    // Update parent metadata
    await docRef.update({
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

    const batch = this.db.batch();
    const headersUpdate: Record<string, unknown> = { lastUpdateTime: now };

    // Update parent
    batch.update(docRef, headersUpdate);

    // Add events to subcollection
    const eventsCollection = docRef.collection('events');
    for (const event of eventsWithTimestamp) {
      // Use a new doc ref for each event
      const newEventRef = eventsCollection.doc();
      batch.set(newEventRef, this.removeUndefined(event));
    }

    await batch.commit();

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
