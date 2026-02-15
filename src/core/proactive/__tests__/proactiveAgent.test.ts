import type { GoogleGenAI } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProactiveAgent } from '../proactiveAgent.js';
import type { ClarisEvent } from '../types.js';

// Mock GoogleGenAI
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn(),
      },
    })),
  };
});

describe('ProactiveAgent', () => {
  let agent: ProactiveAgent;
  let mockGenAI: { models: { generateContent: ReturnType<typeof vi.fn> } };
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instance manually to control behavior
    mockGenerateContent = vi.fn();
    mockGenAI = {
      models: {
        generateContent: mockGenerateContent,
      },
    };

    agent = new ProactiveAgent(mockGenAI as unknown as GoogleGenAI);
  });

  const baseEvent: ClarisEvent = {
    id: 'test-event-1',
    type: 'test',
    source: 'github',
    summary: 'Test Event',
    priority: 'medium',
    timestamp: Date.now(),
    metadata: {},
  };

  it('should return shouldNotify: true when AI decides to notify', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        shouldNotify: true,
        priority: 'high',
        reason: 'Urgent matter',
      }),
    });

    const result = await agent.evaluateEvent(baseEvent);

    expect(result.shouldNotify).toBe(true);
    expect(result.priority).toBe('high');
    expect(result.reason).toBe('Urgent matter');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should return shouldNotify: false when AI decides not to notify', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        shouldNotify: false,
        priority: 'low',
        reason: 'Not important',
      }),
    });

    const result = await agent.evaluateEvent(baseEvent);

    expect(result.shouldNotify).toBe(false);
    expect(result.priority).toBe('low');
  });

  it('should handle markdown code blocks in response', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '```json\n{"shouldNotify": true, "priority": "medium", "reason": "Reason"}\n```',
    });

    const result = await agent.evaluateEvent(baseEvent);

    expect(result.shouldNotify).toBe(true);
    expect(result.priority).toBe('medium');
  });

  it('should handle API errors by falling back (low priority -> false)', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API Error'));

    const result = await agent.evaluateEvent({ ...baseEvent, priority: 'low' });

    expect(result.shouldNotify).toBe(false);
    expect(result.reason).toContain('AI evaluation failed');
  });

  it('should handle API errors by falling back (high priority -> true)', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API Error'));

    const result = await agent.evaluateEvent({ ...baseEvent, priority: 'high' });

    expect(result.shouldNotify).toBe(true);
    expect(result.reason).toContain('AI evaluation failed');
  });
});
