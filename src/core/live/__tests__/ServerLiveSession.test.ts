import type { GoogleGenAI } from '@google/genai';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { MemoryService } from '@/core/memory/MemoryService.js';
import { FirestoreSessionService } from '@/sessions/firestoreSession.js';
import { ServerLiveSession } from '../ServerLiveSession.js';

// Mock dependencies
const mockLiveConnect = vi.fn().mockResolvedValue({
  sendRealtimeInput: vi.fn(),
});

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      live = {
        connect: mockLiveConnect,
      };
    },
  };
});

vi.mock('@/sessions/firestoreSession.js', () => ({
  FirestoreSessionService: class {
    getSession = vi.fn();
    getLatestSession = vi.fn();
    appendEvents = vi.fn();
  },
}));

vi.mock('@/core/memory/MemoryService.js', () => ({
  MemoryService: class {
    searchMemories = vi.fn().mockResolvedValue([]);
    addMemory = vi.fn();
  },
}));

vi.mock('@/config/index.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
  getStyleForExtension: vi.fn().mockReturnValue('standard'),
}));

vi.mock('@/config/models.js', () => ({
  getLiveModel: vi.fn().mockReturnValue('gemini-2.0-flash-exp'),
}));

interface MockSessionService {
  getSession: Mock;
  getLatestSession: Mock;
  appendEvents: Mock;
}

describe('ServerLiveSession', () => {
  let liveSession: ServerLiveSession;
  let mockSessionService: MockSessionService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create actual mock instances with Partial types
    const mockClient = {
      live: {
        connect: mockLiveConnect,
      },
    } as unknown as GoogleGenAI;

    const mockService = new FirestoreSessionService() as unknown as FirestoreSessionService;
    const mockMemory = new MemoryService() as unknown as MemoryService;

    // Inject them into the constructor
    liveSession = new ServerLiveSession(mockClient, mockService, mockMemory);

    // Access the actual mock instances from the session object using unknown cast for safety
    const internalSession = liveSession as unknown as { sessionService: MockSessionService };
    mockSessionService = internalSession.sessionService;
  });

  it('sessionId が指定された場合、それを使用してセッションを開始するじゃんね！✨', async () => {
    const userId = 'user-123';
    const sessionId = 'session-456';

    await liveSession.start(userId, undefined, sessionId);

    // 内部の currentSessionId が正しくセットされているか（private だけどアクセスしちゃうじゃんね！🤫）
    const internalSession = liveSession as unknown as { currentSessionId: string };
    expect(internalSession.currentSessionId).toBe(sessionId);

    // loadMemory 内では getLatestSession が呼ばれる (将来的に getSession に最適化されるかもだけど、今はこれ)
    expect(mockSessionService.getLatestSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
      }),
    );
  });

  it('sessionId が指定されない場合、新しいセッションIDが生成されるじゃんね！💎', async () => {
    const userId = 'user-123';

    await liveSession.start(userId);

    // getLatestSession が呼ばれる
    expect(mockSessionService.getLatestSession).toHaveBeenCalled();

    // sessionId は新しく生成されているはず
    const internalSession = liveSession as unknown as { currentSessionId: string };
    expect(internalSession.currentSessionId).toMatch(/^session-\d+$/);
  });
});
