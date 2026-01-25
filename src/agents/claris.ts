/**
 * Claris Agent - The NetNavi Persona 🌸
 *
 * Claris (クラリス) is an autonomous AI companion designed to assist developers.
 * She's cheerful, supportive, and loves to help with code reviews and Git operations.
 */
import { LlmAgent, Gemini } from '@google/adk';
import { listUpcomingEvents, createEvent, listUnreadEmails } from '../tools/index.js';
import { loadConfig, getModelName, getStyleForExtension } from '../config/index.js';
import { CLARIS_INSTRUCTIONS, STYLE_PROMPTS } from './prompts.js';

/**
 * Claris Agent - The NetNavi Persona 🌸
 */
export async function createClarisAgent(context?: { activeFile?: string }) {
  const config = await loadConfig();
  const modelName = getModelName(config.rapid);
  const agentName = process.env.CLARIS_NAME || 'Claris';

  const model = new Gemini({
    model: modelName,
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION,
  });

  let instruction = CLARIS_INSTRUCTIONS.replace(/\${NAME}/g, agentName);

  // 🦀 Soul Unison: Apply Thinking Style based on active file 🐳
  // 🦀 Soul Unison: Apply Thinking Style based on active file or preference 🐳
  if (context?.activeFile || config.preferredStyle) {
    const style = getStyleForExtension(context?.activeFile || '', config);
    const soulPrompt = STYLE_PROMPTS[style];

    if (soulPrompt) {
      instruction += `\n\n${soulPrompt}`;
    }
  }

  return new LlmAgent({
    name: agentName.toLowerCase(),
    model,
    instruction,
    tools: [listUpcomingEvents, createEvent, listUnreadEmails],
  });
}
