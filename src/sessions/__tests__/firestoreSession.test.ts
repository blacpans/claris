import type { Event } from '@google/adk';
import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, type Mock, test, vi } from 'vitest';
import { FirestoreSessionService } from '../firestoreSession.js';

// Mock Firestore Interfaces
interface MockFirestoreRef {
  orderBy: Mock<(field: string, direction: 'asc' | 'desc') => MockFirestoreRef>;
  where: Mock<(field: string, op: string, val: unknown) => MockFirestoreRef>;
  limit: Mock<(n: number) => MockFirestoreRef>;
  offset: Mock<(n: number) => MockFirestoreRef>;
  select: Mock<(...fields: string[]) => MockFirestoreRef>;
  get: Mock<() => Promise<unknown>>;
  add: Mock<(data: unknown) => Promise<{ id: string }>>;
  set: Mock<(data: unknown) => Promise<void>>;
  update: Mock<(data: unknown) => Promise<void>>;
  delete: Mock<() => Promise<void>>;
  doc: Mock<(id?: string) => MockFirestoreRef>;
  collection: Mock<(name: string) => MockFirestoreRef>;
}

interface MockBatch {
  update: Mock<(ref: unknown, data: unknown) => MockBatch>;
  set: Mock<(ref: unknown, data: unknown) => MockBatch>;
  delete: Mock<(ref: unknown) => MockBatch>;
  commit: Mock<() => Promise<void>>;
}

const mockBatch: MockBatch = {
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue(undefined),
};

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn().mockResolvedValue({ id: 'new-event-id' });

// 再帰的なクエリ/ドキュメントモックのファクトリ
const createMockRef = (): MockFirestoreRef => {
  const ref: MockFirestoreRef = {
    orderBy: vi.fn().mockImplementation(() => ref),
    where: vi.fn().mockImplementation(() => ref),
    limit: vi.fn().mockImplementation(() => ref),
    offset: vi.fn().mockImplementation(() => ref),
    select: vi.fn().mockImplementation(() => ref),
    get: mockGet,
    add: mockAdd,
    set: mockSet,
    update: mockUpdate,
    delete: vi.fn().mockResolvedValue(undefined),
    doc: vi.fn().mockImplementation(() => ref),
    collection: vi.fn().mockImplementation(() => ref),
  } as unknown as MockFirestoreRef;
  return ref;
};

const mockDbRef = createMockRef();
const mockDb = {
  collection: vi.fn().mockReturnValue(mockDbRef),
  doc: vi.fn().mockReturnValue(mockDbRef),
  batch: vi.fn().mockReturnValue(mockBatch),
};

vi.mock('@google-cloud/firestore', () => {
  return {
    Firestore: vi.fn(() => mockDb),
  };
});

describe('FirestoreSessionService', () => {
  let service: FirestoreSessionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new FirestoreSessionService({ db: mockDb as unknown as Firestore });

    // Default mock behavior
    mockGet.mockResolvedValue({
      exists: false,
      docs: [],
    });
  });

  const testSession = {
    appName: 'claris',
    userId: 'user-1',
    config: {},
  };

  test('getSession should return session when it exists', async () => {
    const mockData = {
      id: 'session-1',
      appName: 'claris',
      userId: 'user-1',
      events: [],
    };

    mockGet.mockResolvedValue({
      exists: true,
      data: () => mockData,
      docs: [], // for subcollection fetch
    });

    const session = await service.getSession({ ...testSession, sessionId: 'session-1' });

    expect(session).toEqual(
      expect.objectContaining({
        id: 'session-1',
        appName: 'claris',
      }),
    );
    expect(mockGet).toHaveBeenCalled();
  });

  test('getSession should return undefined when it does not exist', async () => {
    mockGet.mockResolvedValue({
      exists: false,
    });

    const session = await service.getSession({ ...testSession, sessionId: 'non-existent' });

    expect(session).toBeUndefined();
  });

  test('appendEvents should create new session if not exists', async () => {
    mockGet.mockResolvedValue({ exists: false });

    await service.appendEvents({
      session: {
        id: 'new-session',
        appName: 'claris',
        userId: 'user-1',
        state: {},
        events: [],
        lastUpdateTime: Date.now(),
      },
      events: [
        {
          id: 'event-1',
          type: 'user-message',
          timestamp: Date.now(),
          invocationId: 'inv-1',
          actions: {},
        } as unknown as Event,
      ],
    });

    expect(mockBatch.set).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  test('appendEvents should update existing session', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ events: [] }),
    });

    await service.appendEvents({
      session: {
        id: 'existing-session',
        appName: 'claris',
        userId: 'user-1',
        state: {},
        events: [],
        lastUpdateTime: Date.now(),
      },
      events: [
        {
          id: 'event-2',
          type: 'model-response',
          timestamp: Date.now(),
          invocationId: 'inv-2',
          actions: {},
        } as unknown as Event,
      ],
    });

    expect(mockBatch.update).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });
});
