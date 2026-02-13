import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ClarisEvent } from './types.js';

// PushService のモック
const mockSendPush = vi.fn().mockResolvedValue(false);

vi.mock('./pushService.js', () => {
  return {
    PushService: function MockPushService() {
      return {
        sendPush: mockSendPush,
        getPublicKey: vi.fn().mockReturnValue('test-key'),
        saveSubscription: vi.fn(),
        removeSubscription: vi.fn(),
      };
    },
  };
});

describe('NotificationService', () => {
  const testEvent: ClarisEvent = {
    id: 'test-1',
    source: 'gmail',
    type: 'new_email',
    priority: 'medium',
    summary: 'Test email',
    timestamp: Date.now(),
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendPush.mockResolvedValue(false);
  });

  test('should send via WebSocket when connected', async () => {
    const { NotificationService } = await import('./notificationService.js');
    const service = new NotificationService();

    // モック WebSocket
    const mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
    } as unknown as WebSocket;

    service.register('user-1', mockWs);

    const result = service.notify('user-1', testEvent, 'Hello');
    expect(result).toBe(true);
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('proactive_message'));
  });

  test('should fallback to Web Push when WebSocket is not connected', async () => {
    const { NotificationService } = await import('./notificationService.js');
    const service = new NotificationService();

    // ユーザー未登録 → WebSocket なし
    const result = service.notify('offline-user', testEvent, 'Hello');
    expect(result).toBe(false);

    // Web Push のフォールバックが非同期で呼ばれることを確認
    await vi.waitFor(() => {
      expect(mockSendPush).toHaveBeenCalledWith('offline-user', testEvent, 'Hello');
    });
  });

  test('should expose PushService via getPushService()', async () => {
    const { NotificationService } = await import('./notificationService.js');
    const service = new NotificationService();

    const pushService = service.getPushService();
    expect(pushService).toBeDefined();
    expect(pushService.getPublicKey()).toBe('test-key');
  });
});
