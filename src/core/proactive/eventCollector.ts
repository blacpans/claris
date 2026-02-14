/**
 * Event Collector - 外部イベントの収集と正規化 📡
 * Gmail, GitHub などのイベントを ClarisEvent に変換して EventQueue に投入する
 */

import { EventQueue } from './eventQueue.js';
import { notificationService } from './notificationService.js';
import { ProactiveAgent } from './proactiveAgent.js';
import type { ClarisEvent, EventSource } from './types.js';

/**
 * イベントを収集・正規化し、即時通知を行うコレクター
 */
export class EventCollector {
  private queue: EventQueue;
  private proactiveAgent: ProactiveAgent;

  constructor(queue?: EventQueue, agent?: ProactiveAgent) {
    this.queue = queue || new EventQueue();
    this.proactiveAgent = agent || new ProactiveAgent();
  }

  /**
   * Gmail 通知イベントを処理する
   */
  collectGmailEvent(userId: string, emails: Array<{ from: string; subject: string }>): ClarisEvent[] {
    const events: ClarisEvent[] = emails.map((email, i) => ({
      id: `gmail-${Date.now()}-${i}`,
      source: 'gmail' as EventSource,
      type: 'new_email',
      priority: 'medium' as const,
      summary: `📧 ${email.from} から: ${email.subject}`,
      timestamp: Date.now(),
      metadata: { from: email.from, subject: email.subject },
    }));

    for (const event of events) {
      if (this.queue.enqueue(event)) {
        // AIによる通知判断 (非同期)
        this.proactiveAgent
          .evaluateEvent(event)
          .then((result) => {
            if (result.shouldNotify) {
              // 優先度をAI判断で更新
              const updatedEvent = { ...event, priority: result.priority };
              notificationService.notify(
                userId,
                updatedEvent,
                `先輩！${result.reason} (メール: ${event.metadata.from})\n${event.summary}`,
              );
            } else {
              console.log(`🔕 Suppressed Gmail notification: ${result.reason}`);
            }
          })
          .catch((err) => console.error('Error evaluating Gmail event:', err));
      }
    }

    return events;
  }

  /**
   * GitHub イベントを処理する
   */
  collectGitHubEvent(
    userId: string,
    eventType: string,
    details: {
      repo: string;
      title?: string;
      author?: string;
      url?: string;
    },
  ): ClarisEvent {
    const typeMap: Record<string, string> = {
      pull_request_opened: '🐙 新しいPRが来たよ！',
      pull_request_merged: '🎉 PRがマージされたよ！',
      pull_request_review: '👀 PRにレビューが来たよ！',
      issue_opened: '📝 新しいIssueが作られたよ！',
      push: '📦 新しいコミットがプッシュされたよ！',
    };

    const summary = typeMap[eventType] || `GitHub: ${eventType}`;

    const event: ClarisEvent = {
      id: `github-${eventType}-${Date.now()}`,
      source: 'github',
      type: eventType,
      priority: eventType.includes('review') ? 'high' : 'medium',
      summary: `${summary} (${details.repo})${details.title ? ` - ${details.title}` : ''}`,
      timestamp: Date.now(),
      metadata: details,
    };

    if (this.queue.enqueue(event)) {
      // AIによる通知判断 (非同期)
      this.proactiveAgent
        .evaluateEvent(event)
        .then((result) => {
          if (result.shouldNotify) {
            // 優先度をAI判断で更新
            const updatedEvent = { ...event, priority: result.priority };
            notificationService.notify(userId, updatedEvent, `先輩！${result.reason}\n${updatedEvent.summary}`);
          } else {
            console.log(`🔕 Suppressed GitHub notification: ${result.reason}`);
          }
        })
        .catch((err) => console.error('Error evaluating GitHub event:', err));
    }

    return event;
  }

  /**
   * スケジュールイベントを処理する（将来用）
   */
  collectSchedulerEvent(type: string, summary: string): ClarisEvent {
    const event: ClarisEvent = {
      id: `scheduler-${type}-${Date.now()}`,
      source: 'scheduler',
      type,
      priority: 'low',
      summary,
      timestamp: Date.now(),
      metadata: {},
    };

    if (this.queue.enqueue(event)) {
      // スケジューライベントも評価対象にする
      this.proactiveAgent.evaluateEvent(event).then((result) => {
        if (result.shouldNotify) {
          const updatedEvent = { ...event, priority: result.priority };
          notificationService.notify(
            'anonymous', // Scheduler events might not have specific userId context yet
            updatedEvent,
            `先輩！${result.reason}\n${summary}`,
          );
        }
      });
    }
    return event;
  }

  /**
   * キュー内の全イベントを取り出す
   */
  drainEvents(): ClarisEvent[] {
    return this.queue.drainAll();
  }

  /**
   * キューのサイズを返す
   */
  get pendingCount(): number {
    return this.queue.size;
  }
}

/** シングルトンインスタンス */
export const eventCollector = new EventCollector();
