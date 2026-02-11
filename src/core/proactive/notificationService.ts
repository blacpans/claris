/**
 * Notification Service - プロアクティブ通知の配信 📲
 * WebSocket 接続中のクライアントにリアルタイム通知を送る
 */

import type { WebSocket } from 'ws';
import type { ClarisEvent, ProactiveNotification } from './types.js';

/**
 * アクティブな WebSocket 接続を管理し、プロアクティブ通知を配信する
 */
export class NotificationService {
  /** userId → WebSocket のマッピング */
  private connections: Map<string, Set<WebSocket>> = new Map();

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
   */
  notify(userId: string, event: ClarisEvent, message: string): boolean {
    const sockets = this.connections.get(userId);
    if (!sockets || sockets.size === 0) {
      console.log(`📲 NotificationService: ${userId} is not connected, notification queued.`);
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

    if (sent) {
      console.log(`📲 Notification sent to ${userId}: ${message.slice(0, 50)}...`);
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
}

/** シングルトンインスタンス */
export const notificationService = new NotificationService();
