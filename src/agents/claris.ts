/**
 * Claris Agent - The NetNavi Persona 🌸
 *
 * Claris (クラリス) is an autonomous AI companion designed to assist developers.
 * She's cheerful, supportive, and loves to help with code reviews and Git operations.
 */
import { LlmAgent, Gemini } from '@google/adk';
import { listUpcomingEvents, createEvent, listUnreadEmails } from '../tools/index.js';
import { loadConfig, getModelName } from '../config/index.js';
import { CLARIS_INSTRUCTIONS } from './prompts.js';

/**
 * Claris Agent - The NetNavi Persona 🌸
 */
export async function createClarisAgent() {
  const config = await loadConfig();
  const modelName = getModelName(config.rapid);
  const agentName = process.env.CLARIS_NAME || 'Claris';

  const model = new Gemini({
    model: modelName,
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION,
  });

  const instruction = CLARIS_INSTRUCTIONS.replace(/\${NAME}/g, agentName);

  return new LlmAgent({
    name: agentName.toLowerCase(),
    model,
    instruction,
    tools: [listUpcomingEvents, createEvent, listUnreadEmails],
  });
}
