/**
 * Claris Agent - The NetNavi Persona 🌸
 *
 * Claris (クラリス) is an autonomous AI companion designed to assist developers.
 * She's cheerful, supportive, and loves to help with code reviews and Git operations.
 */
import { Gemini, LlmAgent } from '@google/adk';
import { getGenerationLocation, getModelName, getStyleForExtension, loadConfig } from '@/config/index.js';
import {
  addTask,
  appendToSheet,
  createEvent,
  createSheet,
  getDirections,
  getWeather,
  googleSearch,
  listConnections,
  listPhotos,
  listPlaylists,
  listTasks,
  listUnreadEmails,
  listUpcomingEvents,
  readSheet,
  searchContacts,
  searchFiles,
  searchPlaces,
  searchVideos,
  stopWatchGmail,
  watchGmail,
} from '@/tools/index.js';
import { CLARIS_INSTRUCTIONS, REVIEW_CONTEXT_INSTRUCTION, STYLE_PROMPTS } from './prompts.js';

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
    location: getGenerationLocation(),
  });

  let instruction = CLARIS_INSTRUCTIONS.replace(/\${NAME}/g, agentName);

  // 🕐 現在日時の注入: モデルが「今日」を正しく認識するために必須
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: process.env.TZ || 'Asia/Tokyo',
  });
  const timeStr = now.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: process.env.TZ || 'Asia/Tokyo',
  });
  instruction += `\n\n## 現在の日時\n現在は ${dateStr} ${timeStr} です。ユーザーからの質問には、この日時を基準に回答してください。`;

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
    instruction += `\n\n${REVIEW_CONTEXT_INSTRUCTION}`;
  }

  // 🛠️ Tool Selection
  // In review mode, we exclude heavy tools to save tokens and avoid distraction
  const tools =
    mode === 'review'
      ? [] // No tools needed for pure code review for now (maybe generic search later)
      : [
          listUpcomingEvents,
          createEvent,
          listUnreadEmails,
          watchGmail,
          stopWatchGmail,
          listTasks,
          addTask,
          createSheet,
          readSheet,
          appendToSheet,
          searchPlaces,
          getDirections,
          getWeather,
          googleSearch,
          searchVideos,
          listPlaylists,
          searchFiles,
          listPhotos,
          searchContacts,
          listConnections,
        ];

  return new LlmAgent({
    name: agentName.toLowerCase().replace(/-/g, '_'),
    model,
    instruction,
    tools,
  });
}
