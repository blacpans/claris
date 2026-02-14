/**
 * Notification Service - プロアクティブ通知の配信 📲
 * WebSocket 接続中のクライアントにリアルタイム通知を送り、
 * オフラインの場合は Web Push にフォールバックする
 */

import type { WebSocket } from 'ws';
import { notificationHistoryService } from './notificationHistoryService.js';
import { PushService } from './pushService.js';
import type { ClarisEvent, ProactiveNotification } from './types.js';

/**
 * アクティブな WebSocket 接続を管理し、プロアクティブ通知を配信する
 * WebSocket が利用不可の場合、Web Push にフォールバックする
 */
export class NotificationService {
  /** userId → WebSocket のマッピング */
  private connections: Map<string, Set<WebSocket>> = new Map();
  private pushService: PushService;

  constructor(pushService?: PushService) {
    this.pushService = pushService || new PushService();
  }

  /**
   * WebSocket 接続を登録する
   */
  register(userId: string, ws: WebSocket): void {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)?.add(ws);
    console.log(`📲 NotificationService: registered ${userId} (total: ${this.connections.get(userId)?.size})`);
  }

  /**
   * WebSocket 接続を解除する
   */
  unregister(userId: string, ws: WebSocket): void {
    const sockets = this.connections.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.connections.delete(userId);
      }
    }
  }

  /**
   * 特定ユーザーにプロアクティブ通知を送信する
   * WebSocket 接続があればそちらを使い、なければ Web Push にフォールバック
   */
  notify(userId: string, event: ClarisEvent, message: string): boolean {
    // 1. WebSocket で送信を試みる
    const sentViaWs = this.sendViaWebSocket(userId, event, message);

    if (sentViaWs) {
      return true;
    }

    // 2. WebSocket 失敗 → Web Push にフォールバック (非同期)
    this.pushService
      .sendPush(userId, event, message)
      .then((sent) => {
        if (sent) {
          console.log(`📲 Fallback: Web Push sent to ${userId}`);
        } else {
          console.log(`📲 ${userId} is offline and has no push subscription.`);
        }
      })
      .catch((err) => console.error('📲 Web Push fallback failed:', err));

    return false;
  }

  /**
   * WebSocket 経由で通知を送信する
   */
  private sendViaWebSocket(userId: string, event: ClarisEvent, message: string): boolean {
    const sockets = this.connections.get(userId);
    if (!sockets || sockets.size === 0) {
      return false;
    }

    const notification: ProactiveNotification = {
      type: 'proactive_message',
      text: message,
      source: event.source,
      priority: event.priority,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(notification);
    let sent = false;

    for (const ws of sockets) {
      // readyState === 1 は WebSocket.OPEN を示す
      if (ws.readyState === 1) {
        ws.send(payload);
        sent = true;
      }
    }

    // WebSocket で送信できたかに関わらず、履歴には保存する
    notificationHistoryService.saveNotification(userId, notification).catch((err) => {
      console.error('📜 Failed to save notification to history (WS path):', err);
    });

    if (sent) {
      console.log(`📲 Notification sent via WebSocket to ${userId}: ${message.slice(0, 50)}...`);
    }

    return sent;
  }

  /**
   * 全接続中ユーザーにブロードキャスト通知を送信する
   */
  broadcast(event: ClarisEvent, message: string): number {
    let count = 0;
    for (const userId of this.connections.keys()) {
      if (this.notify(userId, event, message)) {
        count++;
      }
    }
    return count;
  }

  /**
   * 接続中のユーザー数を返す
   */
  get connectedUsers(): number {
    return this.connections.size;
  }

  /**
   * 特定ユーザーが接続中かどうか
   */
  isConnected(userId: string): boolean {
    const sockets = this.connections.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * PushService インスタンスへのアクセサ（API Route で使用）
   */
  getPushService(): PushService {
    return this.pushService;
  }
}

/** シングルトンインスタンス */
export const notificationService = new NotificationService();
