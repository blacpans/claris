import { GoogleGenAI } from '@google/genai';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { getEmbeddingModel, getGenerationLocation, getSummarizationModel } from '@/config/models.js';

export interface Memory {
  id?: string;
  userId: string;
  sessionId: string;
  summary: string;
  originalText?: string;
  embedding: FieldValue; // Stored as Vector
  timestamp: number;
  tags?: string[];
}

export interface MemorySearchResult {
  memory: Memory;
  distance: number;
}

export class MemoryService {
  private db: Firestore;
  private genAI: GoogleGenAI;
  private collectionName = 'claris-memories';
  private model = getSummarizationModel(); // For summarization
  private embeddingModel = getEmbeddingModel();

  // Output dimension for text-embedding-004
  public readonly EMBEDDING_DIMENSION = 768;
  private readonly MAX_CHUNK_LENGTH = 15000; // Character limit for a single summary request

  constructor(db?: Firestore, genAI?: GoogleGenAI) {
    this.db = db || new Firestore({ ignoreUndefinedProperties: true });
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
   * Adds a new memory by summarizing the full session text.
   */
  async addMemory(userId: string, sessionId: string, fullText: string): Promise<void> {
    if (!fullText || fullText.length < 50) {
      console.log('Skipping memory creation: text too short');
      return;
    }

    try {
      // 1. Generate Summary
      const summary = await this.generateSummary(fullText);
      console.log(`📝 Generated Summary: ${summary}`);

      // 2. Save
      await this.saveMemory(userId, sessionId, summary);
    } catch (e) {
      console.error('Failed to add memory:', e);
    }
  }

  /**
   * Saves a pre-generated summary as a memory.
   */
  async saveMemory(userId: string, sessionId: string, summary: string): Promise<void> {
    try {
      // 1. Generate Embedding
      const embeddingValues = await this.generateEmbedding(summary);

      // 2. Store in Firestore
      await this.db.collection(this.collectionName).add({
        userId,
        sessionId,
        summary,
        embedding: FieldValue.vector(embeddingValues),
        timestamp: Date.now(),
      });
      console.log('💾 Memory saved to Firestore');
    } catch (e) {
      console.error('Failed to save memory:', e);
    }
  }

  /**
   * Searches for relevant memories using Vector Search.
   */
  async searchMemories(userId: string, queryText: string, limit = 3): Promise<MemorySearchResult[]> {
    try {
      // 1. Generate Query Embedding
      const queryVector = await this.generateEmbedding(queryText);

      // 2. Vector Search
      const collection = this.db.collection(this.collectionName);

      // Note: Requires a composite index on (userId, embedding) if filtering by userId.
      // For now, we might scan all if the dataset is small, or strictly create index.
      // Let's try attempting nearest neighbor search.

      // Vector Search syntax for @google-cloud/firestore
      const vectorQuery = collection
        .where('userId', '==', userId)
        .findNearest('embedding', FieldValue.vector(queryVector), {
          limit: limit,
          distanceMeasure: 'COSINE',
        });

      const snapshot = await vectorQuery.get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          memory: {
            id: doc.id,
            userId: data.userId,
            sessionId: data.sessionId,
            summary: data.summary,
            embedding: data.embedding,
            timestamp: data.timestamp,
          },
          distance: 0,
        };
      });
    } catch (e) {
      console.error('Vector search failed:', e);
      return [];
    }
  }

  private async generateSummary(text: string): Promise<string> {
    // 1. Chunking if text is too long
    if (text.length > this.MAX_CHUNK_LENGTH) {
      console.log(`📜 Text too long (${text.length} chars), splitting into chunks...`);
      const chunks = this.splitTextIntoChunks(text, this.MAX_CHUNK_LENGTH);

      console.log(`🧩 Processed ${chunks.length} chunks. Summarizing in parallel...`);

      // 2. Parallel Summarization
      const summaries = await Promise.all(
        chunks.map(async (chunk, index) => {
          try {
            const summary = await this.callLLMSummarization(chunk);
            return summary;
          } catch (e) {
            console.error(`❌ Failed to summarize chunk ${index}:`, e);
            return ''; // Return empty string on failure to preserve index alignment
          }
        }),
      );

      // 3. Combine Summaries
      // Filter out empty summaries and join
      return summaries.filter((s) => s).join('\n\n');
    }

    // Direct summarization for short text
    return this.callLLMSummarization(text);
  }

  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunkLength = 0;
    let currentChunkStartLineIndex = 0;

    // Simple line-based splitting to avoid cutting sentences ideally
    // But for now, simple length based splitting with newline preference
    const lines = text.split('\n');

    for (const [i, line] of lines.entries()) {
      const len = line.length + 1; // +1 for \n

      if (currentChunkLength + len > maxLength) {
        if (currentChunkLength > 0) {
          const chunkLines = lines.slice(currentChunkStartLineIndex, i);
          chunks.push(`${chunkLines.join('\n')}\n`);
        }
        currentChunkStartLineIndex = i;
        currentChunkLength = len;
      } else {
        currentChunkLength += len;
      }
    }

    if (currentChunkLength > 0) {
      const chunkLines = lines.slice(currentChunkStartLineIndex);
      chunks.push(`${chunkLines.join('\n')}\n`);
    }

    // Fallback: if a single line is massive (unlikely in chat logs but possible), split strictly
    if (chunks.length === 0 && text.length > 0) {
      // very rough split if lines failed
      for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.slice(i, i + maxLength));
      }
    }

    return chunks;
  }

  private async callLLMSummarization(text: string): Promise<string> {
    const prompt = `
    Analyze the following conversation log and summarize the key information related to the user (User).
    Focus on specific facts, preferences, names, and important events mentioned by the user.
    Ignore trivial greetings.
    Output in Japanese.
    
    Conversation Log:
    ${text}
    `;

    const response = await this.genAI.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    // Handle SDK response: text is a getter property
    const summary = response.text || '';

    return summary || 'Summary generation failed';
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.genAI.models.embedContent({
      model: this.embeddingModel,
      contents: [{ role: 'user', parts: [{ text: text }] }],
    });

    if (!response.embeddings || !response.embeddings[0] || !response.embeddings[0].values) {
      throw new Error('Embedding generation failed');
    }

    return response.embeddings[0].values;
  }
}
