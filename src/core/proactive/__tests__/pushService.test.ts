import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// web-push をモック
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

describe('PushService', () => {
  // モック Firestore を DI で注入するためのヘルパー
  function createMockFirestore(overrides?: { getDocs?: { empty: boolean; docs: unknown[] } }) {
    const mockGetResult = overrides?.getDocs ?? { empty: true, docs: [] };
    const mockGet = vi.fn().mockResolvedValue(mockGetResult);
    const mockAdd = vi.fn().mockResolvedValue({ id: 'test-doc-id' });
    const mockWhere = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ get: mockGet }),
      get: mockGet,
    });

    return {
      collection: vi.fn().mockReturnValue({
        where: mockWhere,
        add: mockAdd,
      }),
      batch: vi.fn().mockReturnValue({
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as Firestore;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  });

  test('should return VAPID public key', async () => {
    const { PushService } = await import('../pushService.js');
    const db = createMockFirestore();
    const service = new PushService(db);
    expect(service.getPublicKey()).toBe('test-public-key');
  });

  test('should return null when VAPID key is not set', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const { PushService } = await import('../pushService.js');
    const db = createMockFirestore();
    const service = new PushService(db);
    expect(service.getPublicKey()).toBeNull();
  });

  test('should save subscription to Firestore', async () => {
    const { PushService } = await import('../pushService.js');
    const db = createMockFirestore();
    const service = new PushService(db);

    const subscription = {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' },
    };

    await expect(service.saveSubscription('user-1', subscription)).resolves.not.toThrow();
  });

  test('should return false for sendPush when not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { PushService } = await import('../pushService.js');
    const db = createMockFirestore();
    const service = new PushService(db);

    const event = {
      id: 'test-1',
      source: 'gmail' as const,
      type: 'new_email',
      priority: 'medium' as const,
      summary: 'Test',
      timestamp: Date.now(),
      metadata: {},
    };

    const result = await service.sendPush('user-1', event, 'test message');
    expect(result).toBe(false);
  });
});
