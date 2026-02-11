/**
 * 自律型 Claris のイベント型定義 🧠
 * Event → Think → Notify アーキテクチャの基盤
 */

/**
 * イベントの発生源
 */
export type EventSource = 'gmail' | 'github' | 'scheduler' | 'system';

/**
 * イベントの優先度
 */
export type EventPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Claris が収集・処理する統一イベント型
 */
export interface ClarisEvent {
  /** 一意な識別子 */
  id: string;
  /** イベントの発生源 */
  source: EventSource;
  /** イベントの種類（例: 'new_email', 'pr_merged', 'daily_check'） */
  type: string;
  /** 優先度 */
  priority: EventPriority;
  /** 人間が読める概要 */
  summary: string;
  /** イベント発生時刻 */
  timestamp: number;
  /** ソース固有のメタデータ */
  metadata: Record<string, unknown>;
}

/**
 * プロアクティブ通知メッセージ
 * WebSocket 経由でクライアントに送信される形式
 */
export interface ProactiveNotification {
  /** メッセージ種別の識別子 */
  type: 'proactive_message';
  /** 通知の内容テキスト */
  text: string;
  /** 元になったイベントの発生源 */
  source: EventSource;
  /** 通知の優先度 */
  priority: EventPriority;
  /** 送信時刻 */
  timestamp: number;
}
