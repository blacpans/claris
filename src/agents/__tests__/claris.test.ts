import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClarisAgent } from '../claris.js';

// Mock ADK and config to avoid external calls
vi.mock('@google/adk', () => ({
  Gemini: class {
    constructor(public config: unknown) {}
  },
  LlmAgent: class {
    public name: string;
    public instruction: string;
    constructor(config: { name: string; instruction: string }) {
      this.name = config.name;
      this.instruction = config.instruction;
    }
  },
  FunctionTool: class {
    constructor(public config: unknown) {}
  },
}));

vi.mock('@/config/index.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
  getModelName: vi.fn().mockReturnValue('gemini-pro'),
  getGenerationLocation: vi.fn().mockReturnValue('global'),
  getStyleForExtension: vi.fn().mockReturnValue('passion'),
}));

describe('createClarisAgent Name Switching', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, CLARIS_NAME: 'claris-bot-blacpans' };
  });

  it('should use CLARIS_NAME in review mode', async () => {
    const agent = (await createClarisAgent({ mode: 'review' })) as unknown as { name: string; instruction: string };
    expect(agent.name).toBe('claris_bot_blacpans');
    expect(agent.instruction).toContain('あなたは「claris-bot-blacpans」');
  });

  it('should use default "Claris" in chat mode even if CLARIS_NAME is set', async () => {
    const agent = (await createClarisAgent({ mode: 'chat' })) as unknown as { name: string; instruction: string };
    expect(agent.name).toBe('claris');
    expect(agent.instruction).toContain('あなたは「Claris」');
  });

  it('should use default "Claris" when no mode is provided', async () => {
    const agent = (await createClarisAgent()) as unknown as { name: string; instruction: string };
    expect(agent.name).toBe('claris');
    expect(agent.instruction).toContain('あなたは「Claris」');
  });
});
