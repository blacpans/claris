import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EventCollector } from './eventCollector.js';
import { EventQueue } from './eventQueue.js';
import { notificationService } from './notificationService.js';

describe('EventCollector', () => {
  let collector: EventCollector;
  let queue: EventQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new EventQueue();
    collector = new EventCollector(queue);

    // Mock notificationService
    vi.spyOn(notificationService, 'notify').mockImplementation(() => true);
  });

  test('should collect and normalize Gmail events', () => {
    const emails = [{ from: 'test@example.com', subject: 'Test Email' }];
    const events = collector.collectGmailEvent('test-user', emails);

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('gmail');
    expect(events[0].type).toBe('new_email');
    expect(queue.size).toBe(1);

    // Check notification dispatched
    expect(notificationService.notify).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({
        source: 'gmail',
        type: 'new_email',
        summary: expect.stringContaining('test@example.com'),
      }),
      expect.stringContaining('先輩！メールが来てるよ！'),
    );
  });

  test('should collect and normalize GitHub events', () => {
    const event = collector.collectGitHubEvent('test-user', 'pull_request_opened', {
      repo: 'blacpans/claris',
      title: 'New PR',
      author: 'blacpans',
    });

    expect(event.source).toBe('github');
    expect(event.type).toBe('pull_request_opened');
    expect(queue.size).toBe(1);

    // Check notification dispatched
    expect(notificationService.notify).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({
        source: 'github',
        type: 'pull_request_opened',
        summary: expect.stringMatching(/PR/),
      }),
      expect.stringMatching(/PR/),
    );
  });

  test('should handle duplicate events gracefully', () => {
    vi.useFakeTimers();
    const emails = [{ from: 'test@example.com', subject: 'Test Email' }];

    // First call
    collector.collectGmailEvent('test-user', emails);

    // Advance time to ensure next ID is different (Date.now() changes)
    vi.advanceTimersByTime(10);

    // Second call
    collector.collectGmailEvent('test-user', emails);

    // Even with same content, different timestamps mean different IDs -> queue checks ID for dedup.
    // So 2 events should be queued.
    expect(queue.size).toBe(2);

    vi.useRealTimers();
  });
});
