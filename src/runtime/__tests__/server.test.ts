import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set required env vars before importing app
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
process.env.AUTH_SECRET = 'test-auth-secret';

// webhook.ts のトップレベル環境変数チェックを回避
vi.mock('../webhook.js', () => ({
  webhookApp: {
    routes: [], // Hono expects this
    fetch: vi.fn(),
  },
}));

import { MESSAGES } from '@/constants/messages.js';
import { app } from '../server.js';

// Mock dependencies
vi.mock('@/core/auth/SessionManager.js', () => ({
  logout: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock('@/core/proactive/index.js', () => ({
  notificationService: {
    getPushService: vi.fn().mockReturnValue({
      getPublicKey: vi.fn().mockReturnValue('test-public-key'),
    }),
    notify: vi.fn(),
    broadcast: vi.fn(),
  },
  notificationHistoryService: {
    getNotifications: vi.fn().mockResolvedValue([]),
    markAsRead: vi.fn().mockResolvedValue(true),
    markAllAsRead: vi.fn().mockResolvedValue(10),
  },
}));

vi.mock('../runner.js', () => ({
  adkRunner: {
    run: vi.fn().mockResolvedValue('Mock response from Claris'),
  },
}));

vi.mock('@/tools/google/auth.js', () => ({
  getAuthUrl: vi.fn().mockResolvedValue('https://mock-auth-url.com'),
  handleAuthCallback: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
}));

interface HealthResponse {
  name: string;
  status: string;
  message: string;
}

interface ConfigResponse {
  version: string;
  wsPath: string;
}

interface ChatResponse {
  response: string;
  userId: string;
  error?: string;
}

interface VapidKeyResponse {
  publicKey: string;
}

describe('Server Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const data = (await res.json()) as HealthResponse;
      expect(data).toEqual({
        name: 'Claris',
        status: 'online',
        message: MESSAGES.SERVER.HEALTH_CHECK,
      });
    });
  });

  describe('GET /api/config', () => {
    it('should return app configuration', async () => {
      const res = await app.request('/api/config');
      expect(res.status).toBe(200);
      const data = (await res.json()) as ConfigResponse;
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('wsPath', '/ws/live');
    });
  });

  describe('GET /api/config.js', () => {
    it('should return configuration script', async () => {
      const res = await app.request('/api/config.js');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/javascript');
      const text = await res.text();
      expect(text).toContain('window.CLARIS_CONFIG');
    });
  });

  describe('POST /chat', () => {
    it('should return 400 if message is missing', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as ChatResponse;
      expect(data.error).toBe(MESSAGES.SERVER.CHAT_MISSING_MESSAGE);
    });

    it('should run adkRunner and return response', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as ChatResponse;
      expect(data.response).toBe('Mock response from Claris');
      expect(data.userId).toBe('anonymous');
    });
  });

  describe('Push Notification Endpoints', () => {
    it('GET /api/push/vapid-key should return public key', async () => {
      const res = await app.request('/api/push/vapid-key');
      expect(res.status).toBe(200);
      const data = (await res.json()) as VapidKeyResponse;
      expect(data.publicKey).toBe('test-public-key');
    });
  });
});
