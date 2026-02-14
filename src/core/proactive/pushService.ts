/**
 * Push Notification Service - Web Push API による通知配信 📲
 * VAPID 認証を使って、オフラインのブラウザにもプッシュ通知を送る
 */

import { Firestore } from '@google-cloud/firestore';
import webPush from 'web-push';
import type { ClarisEvent } from './types.js';

/**
 * Web Push のサブスクリプション情報
 */
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Firestore に保存するサブスクリプションドキュメント
 */
interface StoredSubscription {
  userId: string;
  subscription: PushSubscriptionData;
  createdAt: number;
}

/**
 * Web Push 通知を管理するサービス
 */
export class PushService {
  private db: Firestore;
  private collectionName = 'claris-push-subscriptions';
  private isConfigured = false;

  constructor(db?: Firestore) {
    this.db = db || new Firestore({ ignoreUndefinedProperties: true });
    this.setupVapid();
  }

  /**
   * VAPID 認証情報を設定する
   */
  private setupVapid(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      console.warn('⚠️ VAPID keys not configured. Web Push disabled.');
      return;
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);
    this.isConfigured = true;
    console.log('📲 Web Push configured with VAPID keys.');
  }

  /**
   * VAPID 公開鍵を取得する（クライアント配布用）
   */
  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * サブスクリプションを Firestore に保存する
   */
  async saveSubscription(userId: string, subscription: PushSubscriptionData): Promise<void> {
    // 既存のサブスクリプションを endpoint で検索して重複を防ぐ
    const existing = await this.db
      .collection(this.collectionName)
      .where('userId', '==', userId)
      .where('subscription.endpoint', '==', subscription.endpoint)
      .get();

    if (!existing.empty && existing.docs[0]) {
      console.log(`📲 Subscription already exists for ${userId}, updating...`);
      // 既存を更新
      await existing.docs[0].ref.update({
        subscription,
        createdAt: Date.now(),
      });
      return;
    }

    const doc: StoredSubscription = {
      userId,
      subscription,
      createdAt: Date.now(),
    };

    await this.db.collection(this.collectionName).add(doc);
    console.log(`📲 Push subscription saved for ${userId}`);
  }

  /**
   * サブスクリプションを削除する
   */
  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    const snapshot = await this.db
      .collection(this.collectionName)
      .where('userId', '==', userId)
      .where('subscription.endpoint', '==', endpoint)
      .get();

    const batch = this.db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    console.log(`📲 Push subscription removed for ${userId}`);
  }

  /**
   * ユーザーの全サブスクリプションを取得する
   */
  private async getSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
    const snapshot = await this.db.collection(this.collectionName).where('userId', '==', userId).get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as StoredSubscription;
      return data.subscription;
    });
  }

  /**
   * Web Push 通知を送信する
   */
  async sendPush(userId: string, event: ClarisEvent, message: string): Promise<boolean> {
    if (!this.isConfigured) {
      console.log('📲 Web Push not configured, skipping.');
      return false;
    }

    const subscriptions = await this.getSubscriptions(userId);
    if (subscriptions.length === 0) {
      console.log(`📲 No push subscriptions for ${userId}`);
      return false;
    }

    const firstLine = message.split('\n')[0] ?? message;

    const payload = JSON.stringify({
      title: 'Claris 🌸',
      body: firstLine.slice(0, 120),
      icon: '/img/claris-icon.png',
      badge: '/img/claris-badge.png',
      data: {
        source: event.source,
        priority: event.priority,
        url: '/',
      },
    });

    let sent = false;

    // 全サブスクリプションに並列送信
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(sub, payload);
          return true;
        } catch (error: unknown) {
          // 410 Gone = サブスクリプション期限切れ → 削除
          if (error instanceof Error && 'statusCode' in error && (error as { statusCode: number }).statusCode === 410) {
            console.log(`📲 Subscription expired, removing: ${sub.endpoint.slice(0, 50)}...`);
            await this.removeSubscription(userId, sub.endpoint);
          } else {
            console.error('📲 Push send failed:', error);
          }
          return false;
        }
      }),
    );

    sent = results.some((r) => r.status === 'fulfilled' && r.value);
    if (sent) {
      console.log(`📲 Web Push sent to ${userId}`);
    }

    return sent;
  }
}
