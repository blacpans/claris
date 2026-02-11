/**
 * Event Queue - イベントの蓄積・管理 🗂️
 * 重複排除と優先度ソートを備えたインメモリキュー
 */

import type { ClarisEvent, EventPriority } from './types.js';

/** 優先度の数値マッピング（高いほど優先） */
const PRIORITY_ORDER: Record<EventPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** キューの最大サイズ（溢れ防止） */
const MAX_QUEUE_SIZE = 100;

export class EventQueue {
  private queue: ClarisEvent[] = [];
  private processedIds: Set<string> = new Set();

  /**
   * イベントをキューに追加する
   * 重複イベントは自動的に除外される
   */
  enqueue(event: ClarisEvent): boolean {
    if (this.processedIds.has(event.id)) {
      return false;
    }

    // キューが溢れた場合、最も古い低優先度イベントを削除
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      this.queue.shift();
    }

    this.queue.push(event);
    this.processedIds.add(event.id);

    // 処理済みID の肥大化防止（最新1000件のみ保持）
    if (this.processedIds.size > 1000) {
      const idsArray = [...this.processedIds];
      this.processedIds = new Set(idsArray.slice(-500));
    }

    return true;
  }

  /**
   * 最も優先度の高いイベントを取り出す
   */
  dequeue(): ClarisEvent | undefined {
    if (this.queue.length === 0) return undefined;

    this.queue.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    return this.queue.shift();
  }

  /**
   * 全てのイベントを優先度順で取り出してキューを空にする
   */
  drainAll(): ClarisEvent[] {
    const events = [...this.queue].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    this.queue = [];
    return events;
  }

  /**
   * キュー内のイベント数を返す
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * キューが空かどうか
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * キューの内容をクリアする（テスト用）
   */
  clear(): void {
    this.queue = [];
    this.processedIds.clear();
  }
}
