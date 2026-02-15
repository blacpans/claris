import { beforeEach, describe, expect, type Mock, test, vi } from 'vitest';
import { NotificationHistoryService } from '../notificationHistoryService.js';
import type { ProactiveNotification } from '../types.js';

vi.mock('@google-cloud/firestore', () => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'doc-123' });
  const mockGet = vi.fn();
  const mockUpdate = vi.fn();
  const mockCommit = vi.fn();

  class MockFirestore {
    collection = vi.fn().mockReturnThis();
    add = mockAdd;
    where = vi.fn().mockReturnThis();
    orderBy = vi.fn().mockReturnThis();
    limit = vi.fn().mockReturnThis();
    get = mockGet;
    doc = vi.fn().mockReturnThis();
    update = mockUpdate;
    batch = vi.fn().mockReturnValue({
      update: vi.fn(),
      commit: mockCommit,
    });
  }

  return {
    Firestore: MockFirestore,
    // テストからモックにアクセスできるようにするための裏口
    _mocks: { mockAdd, mockGet, mockUpdate, mockCommit },
  };
});

interface MockFirestoreMocks {
  mockAdd: Mock;
  mockGet: Mock;
  mockUpdate: Mock;
  mockCommit: Mock;
}

describe('NotificationHistoryService', () => {
  let service: NotificationHistoryService;
  let mocks: MockFirestoreMocks;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new NotificationHistoryService();
    // モックへの参照を取得
    const firestore = (await import('@google-cloud/firestore')) as unknown as { _mocks: MockFirestoreMocks };
    mocks = firestore._mocks;
  });

  const testNotification: ProactiveNotification = {
    type: 'proactive_message',
    text: 'Test Notification',
    source: 'system',
    priority: 'medium',
    timestamp: Date.now(),
  };

  test('should save notification to Firestore', async () => {
    const id = await service.saveNotification('user-1', testNotification);
    expect(id).toBe('doc-123');
    expect(mocks.mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        text: 'Test Notification',
        isRead: false,
      }),
    );
  });

  test('should fetch notification history', async () => {
    mocks.mockGet.mockResolvedValue({
      docs: [
        {
          id: 'doc-1',
          data: () => ({ ...testNotification, userId: 'user-1', isRead: false }),
        },
      ],
    });

    const notifications = await service.getNotifications('user-1');
    expect(notifications).toHaveLength(1);
    const firstNotification = notifications[0];
    if (!firstNotification) throw new Error('Notification not found');
    expect(firstNotification.id).toBe('doc-1');
  });

  test('should mark notification as read', async () => {
    mocks.mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'user-1' }),
    });

    const success = await service.markAsRead('user-1', 'doc-1');
    expect(success).toBe(true);
    expect(mocks.mockUpdate).toHaveBeenCalledWith({ isRead: true });
  });

  test('should not mark notification as read if not owned by user', async () => {
    mocks.mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'other-user' }),
    });

    const success = await service.markAsRead('user-1', 'doc-1');
    expect(success).toBe(false);
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });
});
