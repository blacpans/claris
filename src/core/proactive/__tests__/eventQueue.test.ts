import { beforeEach, describe, expect, test } from 'vitest';
import { EventQueue } from '../eventQueue.js';
import type { ClarisEvent } from '../types.js';

describe('EventQueue', () => {
  let queue: EventQueue;

  beforeEach(() => {
    queue = new EventQueue();
  });

  const createEvent = (id: string, priority: ClarisEvent['priority']): ClarisEvent => ({
    id,
    source: 'system',
    type: 'test',
    priority,
    summary: `Event ${id}`,
    timestamp: Date.now(),
    metadata: {},
  });

  test('should enqueue and dequeue events', () => {
    const event = createEvent('1', 'medium');
    expect(queue.enqueue(event)).toBe(true);
    expect(queue.size).toBe(1);
    expect(queue.dequeue()).toEqual(event);
    expect(queue.size).toBe(0);
  });

  test('should not enqueue duplicate events', () => {
    const event = createEvent('1', 'medium');
    expect(queue.enqueue(event)).toBe(true);
    expect(queue.enqueue(event)).toBe(false);
    expect(queue.size).toBe(1);
  });

  test('should dequeue events in priority order', () => {
    queue.enqueue(createEvent('1', 'low'));
    queue.enqueue(createEvent('2', 'high'));
    queue.enqueue(createEvent('3', 'medium'));
    queue.enqueue(createEvent('4', 'critical'));

    expect(queue.dequeue()?.id).toBe('4'); // critical
    expect(queue.dequeue()?.id).toBe('2'); // high
    expect(queue.dequeue()?.id).toBe('3'); // medium
    expect(queue.dequeue()?.id).toBe('1'); // low
  });

  test('should drain all events in priority order', () => {
    queue.enqueue(createEvent('1', 'low'));
    queue.enqueue(createEvent('2', 'critical'));
    queue.enqueue(createEvent('3', 'medium'));

    // EventQueueにはdrainAllがある
    const drained = queue.drainAll();

    expect(drained).toHaveLength(3);
    const [first, second, third] = drained;
    if (!first || !second || !third) throw new Error('Drained events not found');
    expect(first.id).toBe('2');
    expect(second.id).toBe('3');
    expect(third.id).toBe('1');
    expect(queue.size).toBe(0);
  });

  test('should respect max queue size and drop lowest priority', () => {
    // MAX_QUEUE_SIZE is 100. Let's fill it.
    for (let i = 0; i < 100; i++) {
      queue.enqueue(createEvent(`fill-${i}`, 'medium'));
    }
    expect(queue.size).toBe(100);

    // Add a critical event
    const criticalEvent = createEvent('critical-1', 'critical');
    queue.enqueue(criticalEvent);

    expect(queue.size).toBe(100); // Size should remain 100

    // The critical event should be present
    const drained = queue.drainAll();
    expect(drained.find((e) => e.id === 'critical-1')).toBeDefined();

    // A medium event should have been dropped (conceptually lowest or equal lowest)
    // Since we filled with medium, one medium was dropped.
  });
});
