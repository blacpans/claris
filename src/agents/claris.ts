import { getModelName, getStyleForExtension, loadConfig } from '@/config/index.js';
import { createEvent, listUnreadEmails, listUpcomingEvents } from '@/tools/index.js';
/**
 * Claris Agent - The NetNavi Persona 🌸
 *
 * Claris (クラリス) is an autonomous AI companion designed to assist developers.
 * She's cheerful, supportive, and loves to help with code reviews and Git operations.
 */
import { Gemini, LlmAgent } from '@google/adk';
import { CLARIS_INSTRUCTIONS, STYLE_PROMPTS } from './prompts.js';

/**
 * Claris Agent - The NetNavi Persona 🌸
 */
export type AgentMode = 'chat' | 'review' | string;

export interface ClarisContext {
  activeFile?: string;
  mode?: AgentMode;
  diff?: string;
}

/**
 * Claris Agent - The NetNavi Persona 🌸
 */
export async function createClarisAgent(context?: ClarisContext) {
  const config = await loadConfig();
  const modelName = getModelName(config.rapid);
  const agentName = process.env.CLARIS_NAME || 'Claris';
  const mode = context?.mode || 'chat';

  const model = new Gemini({
    model: modelName,
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION,
  });

  let instruction = CLARIS_INSTRUCTIONS.replace(/\${NAME}/g, agentName);

  // 🦀 Soul Unison: Apply Thinking Style based on active file or preference 🐳
  if (context?.activeFile || config.preferredStyle) {
    const style = getStyleForExtension(context?.activeFile || '', config);
    const soulPrompt = STYLE_PROMPTS[style];

    if (soulPrompt) {
      instruction += `\n\n${soulPrompt}`;
    }
  }

  // 📝 Review Mode: Inject Diff into System Instruction
  if (mode === 'review' && context?.diff) {
    // We use ${diff} template variable which ADK will replace with the content from session.state.diff
    // This avoids issues with template injection vulnerabilities in the code diff itself
    instruction +=
      '\n\n# PR Review Context\nHere is the diff of the Pull Request you are reviewing:\n\n```diff\n${diff}\n```\n\nFocus on this diff to provide your review. This is ephemeral context for this turn only.';
  }

  // 🛠️ Tool Selection
  // In review mode, we exclude heavy tools to save tokens and avoid distraction
  const tools =
    mode === 'review'
      ? [] // No tools needed for pure code review for now (maybe generic search later)
      : [listUpcomingEvents, createEvent, listUnreadEmails];

  return new LlmAgent({
    name: agentName.toLowerCase(),
    model,
    instruction,
    tools,
  });
}
