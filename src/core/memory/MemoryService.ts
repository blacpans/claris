import { GoogleGenAI } from '@google/genai';
import { FieldValue, Firestore } from '@google-cloud/firestore';

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
  private model = 'gemini-1.5-flash-001'; // For summarization
  private embeddingModel = 'text-embedding-004';

  constructor() {
    this.db = new Firestore({ ignoreUndefinedProperties: true });
    this.genAI = new GoogleGenAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
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

    // Handle SDK response: text is a getter method returning String
    const summary = response.text ? response.text.toString() : '';

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
