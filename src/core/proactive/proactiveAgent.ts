import { GoogleGenAI } from '@google/genai';
import { EVALUATE_EVENT_PROMPT } from '@/agents/prompts.js';
import { getGenerationLocation } from '@/config/models.js';
import type { ClarisEvent, EventPriority } from './types.js';

interface EvaluationResult {
  shouldNotify: boolean;
  priority: EventPriority;
  reason: string;
}

export class ProactiveAgent {
  private genAI: GoogleGenAI;
  // Gemini 3 Flash (via env var or default)
  private model = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';

  constructor(genAI?: GoogleGenAI) {
    this.genAI =
      genAI ||
      new GoogleGenAI({
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: getGenerationLocation(),
        vertexai: true,
        apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
      });
  }

  /**
   * Evaluate an event to decide whether to notify the user.
   * Uses Gemini 3 Flash to determine urgency and relevance.
   */
  async evaluateEvent(event: ClarisEvent): Promise<EvaluationResult> {
    try {
      // Prepare prompt
      const eventJson = JSON.stringify(
        {
          id: event.id,
          type: event.type,
          source: event.source,
          summary: event.summary,
          priority: event.priority, // Original priority as hint
          metadata: event.metadata,
        },
        null,
        2,
      );

      const prompt = `${EVALUATE_EVENT_PROMPT}\n\n## イベント情報 (Event Info)\n\`\`\`json\n${eventJson}\n\`\`\``;

      // Call Gemini
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2, // Low temperature for consistent JSON output
        },
      });

      // Parse response
      const text = response.text;
      if (!text) {
        throw new Error('No response text from Gemini');
      }

      // Cleanup markdown (just in case model adds it despite MIME type)
      const cleanJson = text.replace(/^```json\n|```$/g, '').trim();

      let result: Partial<EvaluationResult>;
      try {
        result = JSON.parse(cleanJson);
      } catch (e) {
        console.warn('Failed to parse JSON directly, attempting relaxed parsing:', cleanJson);
        // Fallback for messy JSON if needed, or re-throw
        throw e;
      }

      // Validate and normalize
      return {
        shouldNotify: Boolean(result.shouldNotify),
        priority: (result.priority as EventPriority) || event.priority,
        reason: result.reason || 'No reason provided by AI',
      };
    } catch (error) {
      console.error('❌ ProactiveAgent Evaluation Failed:', error);

      // Fallback Strategy on Error:
      // If original priority was 'high' or 'critical', notify anyway to be safe.
      // Otherwise, suppress to avoid noise.
      const isUrgent = event.priority === 'high' || event.priority === 'critical';

      return {
        shouldNotify: isUrgent,
        priority: event.priority,
        reason: `AI evaluation failed (${error instanceof Error ? error.message : String(error)}). Fallback based on original priority.`,
      };
    }
  }
}
