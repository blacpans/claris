import { describe, expect, it } from 'vitest';
import { generateLiveSessionConfig } from '../prompts.js';

describe('generateLiveSessionConfig', () => {
  it('should include style prompt when provided', () => {
    const agentName = 'Claris';
    const memory = 'Recent conversation history';
    const soulPrompt = '## 現在のソウル: Logic Soul (論理) 🟦';

    const config = generateLiveSessionConfig(agentName, memory, soulPrompt);
    const instruction = config.systemInstruction?.parts?.[0]?.text;

    expect(instruction).toContain('Logic Soul');
    expect(instruction).toContain('Claris');
    expect(instruction).toContain('Recent conversation history');
  });

  it('should work without style prompt', () => {
    const config = generateLiveSessionConfig('Claris', 'Memory');
    const instruction = config.systemInstruction?.parts?.[0]?.text;

    expect(instruction).not.toContain('Soul');
    expect(instruction).toContain('Claris');
  });
});
