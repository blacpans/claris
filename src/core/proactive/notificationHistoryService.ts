/**
 * Notification History Service - 通知履歴の管理 📜✨
 * 通知を Firestore に保存し、履歴として取得・更新する
 */

import { Firestore } from '@google-cloud/firestore';
import type { NotificationHistoryItem, ProactiveNotification } from './types.js';

export class NotificationHistoryService {
  private db: Firestore;
  private collectionName = 'claris-notifications';

  constructor(db?: Firestore) {
    this.db = db || new Firestore({ ignoreUndefinedProperties: true });
  }

  /**
   * 通知を履歴として保存する
   */
  async saveNotification(userId: string, notification: ProactiveNotification): Promise<string> {
    try {
      const historyItem: NotificationHistoryItem = {
        ...notification,
        userId,
        isRead: false,
      };

      const docRef = await this.db.collection(this.collectionName).add(historyItem);
      console.log(`📜 NotificationHistoryService: Saved notification for ${userId} (ID: ${docRef.id})`);
      return docRef.id;
    } catch (e) {
      console.error('📜 Failed to save notification history:', e);
      throw e;
    }
  }

  /**
   * 特定ユーザーの通知履歴を取得する（新しい順）
   */
  async getNotifications(userId: string, limit = 20): Promise<NotificationHistoryItem[]> {
    try {
      const snapshot = await this.db
        .collection(this.collectionName)
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => ({
        ...(doc.data() as NotificationHistoryItem),
        id: doc.id,
      }));
    } catch (e) {
      console.error('📜 Failed to fetch notification history:', e);
      return [];
    }
  }

  /**
   * 通知を既読にする
   */
  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(notificationId);
      const doc = await docRef.get();

      if (!doc.exists || doc.data()?.userId !== userId) {
        return false;
      }

      await docRef.update({ isRead: true });
      return true;
    } catch (e) {
      console.error('📜 Failed to mark notification as read:', e);
      return false;
    }
  }

  /**
   * 全ての通知を既読にする
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const snapshot = await this.db
        .collection(this.collectionName)
        .where('userId', '==', userId)
        .where('isRead', '==', false)
        .get();

      if (snapshot.empty) return 0;

      const batch = this.db.batch();
      for (const doc of snapshot.docs) {
        batch.update(doc.ref, { isRead: true });
      }

      await batch.commit();
      return snapshot.size;
    } catch (e) {
      console.error('📜 Failed to mark all notifications as read:', e);
      return 0;
    }
  }
}

/** シングルトンインスタンス */
export const notificationHistoryService = new NotificationHistoryService();
