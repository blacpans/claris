import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { FirestoreSessionService } from './firestoreSession.js';

interface MockQuery {
  _name: string;
  orderBy: Mock;
  where: Mock;
  limit: Mock;
  get: Mock;
  offset: Mock;
  select: Mock;
}

// Factory for creating independent mock queries
const createMockQuery = (name = 'query'): MockQuery => {
  const query: MockQuery = {
    _name: name, // for debugging
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
    offset: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  return query;
};

const mockCollection = {
  doc: vi.fn().mockReturnThis(),
  collection: vi.fn().mockReturnThis(),
  // orderBy, where, limit will be mocked in beforeEach
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  get: vi.fn().mockResolvedValue({ docs: [] }),
};

const mockDb = {
  collection: vi.fn().mockReturnValue(mockCollection),
  batch: vi.fn().mockReturnValue({
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  }),
};

// Mock the Firestore constructor
vi.mock('@google-cloud/firestore', () => {
  return {
    Firestore: vi.fn(() => mockDb),
  };
});

describe('FirestoreSessionService', () => {
  let service: FirestoreSessionService;
  let createdQueries: MockQuery[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    createdQueries = [];

    // Setup mockCollection to return new queries
    mockCollection.orderBy.mockImplementation(() => {
      const q = createMockQuery('orderByQuery');
      createdQueries.push(q);
      return q;
    });
    mockCollection.where.mockImplementation(() => {
      const q = createMockQuery('whereQuery');
      createdQueries.push(q);
      return q;
    });
    mockCollection.limit.mockImplementation(() => {
      const q = createMockQuery('limitQuery');
      createdQueries.push(q);
      return q;
    });

    // Also need to handle collection().get() if that's ever called (it's not here, query.get is called)

    mockCollection.doc.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ id: 's1', appName: 'testApp', userId: 'testUser', lastUpdateTime: 123 }),
      }),
      collection: vi.fn().mockReturnValue(mockCollection),
    });

    service = new FirestoreSessionService({ db: mockDb as unknown as Firestore });
  });

  it('should limit events query when numRecentEvents and afterTimestamp are both provided', async () => {
    const config = { numRecentEvents: 10, afterTimestamp: 1000 };
    await service.getSession({ sessionId: 's1', appName: 'testApp', userId: 'testUser', config });

    // Find the query that was executed (get was called)
    const executedQueries = createdQueries.filter((q) => q.get.mock.calls.length > 0);

    expect(executedQueries.length).toBeGreaterThan(0);
    const executedQuery = executedQueries[0];

    // Verify limit was called on the executed query
    // This should FAIL if the optimization is missing
    expect(executedQuery.limit).toHaveBeenCalledWith(10);
  });
});
