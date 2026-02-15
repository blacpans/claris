import { beforeEach, describe, expect, type Mock, test, vi } from 'vitest';
import { EventQueue } from '../eventQueue.js';
import { notificationService } from '../notificationService.js';
import type { ProactiveAgent } from '../proactiveAgent.js';

// シングルトンのモジュールロード時に ProactiveAgent が new されるのを防ぐ
vi.mock('../proactiveAgent.js', () => {
  return {
    ProactiveAgent: function MockProactiveAgent() {
      return {
        evaluateEvent: vi.fn().mockResolvedValue({
          shouldNotify: true,
          priority: 'medium',
          reason: 'Test reason',
        }),
      };
    },
  };
});

interface MockAgent {
  evaluateEvent: Mock;
}

describe('EventCollector', () => {
  let queue: EventQueue;
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new EventQueue();

    // テスト用のモックエージェントを作成
    mockAgent = {
      evaluateEvent: vi.fn().mockResolvedValue({
        shouldNotify: true,
        priority: 'medium',
        reason: 'Test reason',
      }),
    };

    // Mock notificationService
    vi.spyOn(notificationService, 'notify').mockImplementation(() => true);
  });

  test('should collect and normalize Gmail events', async () => {
    // DI でモックを注入
    const { EventCollector } = await import('../eventCollector.js');
    const collector = new EventCollector(queue, mockAgent as unknown as ProactiveAgent);

    const emails = [{ from: 'test@example.com', subject: 'Test Email' }];
    const events = collector.collectGmailEvent('test-user', emails);

    expect(events).toHaveLength(1);
    const firstEvent = events[0];
    if (!firstEvent) throw new Error('Event not found');
    expect(firstEvent.source).toBe('gmail');
    expect(firstEvent.type).toBe('new_email');
    expect(queue.size).toBe(1);

    // AI評価は非同期なので、マイクロタスクが完了するのを待つ
    await vi.waitFor(() => {
      expect(notificationService.notify).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          source: 'gmail',
          type: 'new_email',
        }),
        expect.stringContaining('Test reason'),
      );
    });
  });

  test('should collect and normalize GitHub events', async () => {
    const { EventCollector } = await import('../eventCollector.js');
    const collector = new EventCollector(queue, mockAgent as unknown as ProactiveAgent);

    const event = collector.collectGitHubEvent('test-user', 'pull_request_opened', {
      repo: 'blacpans/claris',
      title: 'New PR',
      author: 'blacpans',
    });

    expect(event.source).toBe('github');
    expect(event.type).toBe('pull_request_opened');
    expect(queue.size).toBe(1);

    // AI評価後に通知されることを確認
    await vi.waitFor(() => {
      expect(notificationService.notify).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          source: 'github',
          type: 'pull_request_opened',
        }),
        expect.stringContaining('Test reason'),
      );
    });
  });

  test('should not notify when AI decides not to', async () => {
    // AI が「通知しない」と判断するケースを設定
    mockAgent.evaluateEvent.mockResolvedValue({
      shouldNotify: false,
      priority: 'low',
      reason: 'Not important',
    });

    const { EventCollector } = await import('../eventCollector.js');
    const collector = new EventCollector(queue, mockAgent as unknown as ProactiveAgent);

    collector.collectGitHubEvent('test-user', 'push', {
      repo: 'blacpans/claris',
    });

    // 非同期処理が完了するのを待つ
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  test('should handle duplicate events gracefully', async () => {
    vi.useFakeTimers();

    const { EventCollector } = await import('../eventCollector.js');
    const collector = new EventCollector(queue, mockAgent as unknown as ProactiveAgent);

    const emails = [{ from: 'test@example.com', subject: 'Test Email' }];

    // First call
    collector.collectGmailEvent('test-user', emails);

    // Advance time to ensure next ID is different
    vi.advanceTimersByTime(10);

    // Second call
    collector.collectGmailEvent('test-user', emails);

    // Different timestamps = different IDs -> both are queued
    expect(queue.size).toBe(2);

    vi.useRealTimers();
  });
});
