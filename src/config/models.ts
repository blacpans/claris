/**
 * Gemini Model Definitions
 */
export const GEMINI_MODELS = {
  // Live API (Multimodal)
  LIVE: {
    // Latest experimental model for Live API
    DEFAULT: process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio',
  },
  // Generation (Text/Chat)
  GENERATE: {
    // Fast & Cost-effective
    FLASH: process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview',
    // Strong reasoning
    PRO: process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-preview',
  },
  // Embeddings
  EMBEDDING: {
    DEFAULT: 'text-embedding-004',
  },
} as const;

/**
 * Get the live model name.
 * Respects GEMINI_LIVE_MODEL environment variable if set.
 */
export function getLiveModel(): string {
  return process.env.GEMINI_LIVE_MODEL || GEMINI_MODELS.LIVE.DEFAULT;
}

/**
 * Get the embedding model name.
 */
export function getEmbeddingModel(): string {
  return GEMINI_MODELS.EMBEDDING.DEFAULT;
}

/**
 * Get the summarization model name.
 */
export function getSummarizationModel(): string {
  // Using Flash for speed and cost effectiveness in background tasks
  return GEMINI_MODELS.GENERATE.FLASH;
}

/**
 * Get the generation/summarization location.
 */
export function getGenerationLocation(): string {
  return process.env.GEMINI_GENERATE_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'global';
}
