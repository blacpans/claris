import 'dotenv/config'; // Load .env
import { notificationService } from '../src/core/proactive/notificationService.js';
import type { ClarisEvent } from '../src/core/proactive/types.js';

async function main() {
  console.log('--- Notification Test Start ---');

  // ダミーイベント
  const event: ClarisEvent = {
    source: 'system',
    priority: 'high',
    timestamp: Date.now(),
    payload: { message: 'Test Notification' },
  };

  const message = 'テスト通知だよ！届いてる？🌸';

  console.log(`Sending broadcast message: "${message}"`);

  // ブロードキャスト送信
  // 注意: このスクリプトは単体で動作するため、WebSocketサーバーとしての接続は持っていません。
  // そのため、常に Web Push へのフォールバック（またはオフライン判定）になりますが、
  // PushService が正しく構成されていれば、登録済みユーザーへ Push が送られるはずです。
  // ただし、notificationService 内の connections はメモリ上にあるため、
  // このスクリプトのプロセス内では「接続ユーザー0」とみなされます。

  // 永続化されたサブスクリプションに対して送る機能を直接テストするために
  // PushService を直接使うか、broadcast が pushService にフォールバックするロジックを確認します。
  // notificationService.notify は WS がなければ PushService.sendPush を呼びます。
  // しかし、broadcast は connections.keys() ループなので、メモリ上に接続がないと誰も対象になりません。

  // そのため、Firestore から直接ユーザーを取得して送るか、特定の既知のユーザーIDに対して送る必要があります。
  // ここでは、環境変数 TEST_USER_ID があればそのユーザーへ、なければ警告を出して終了します。

  console.log('--- Listing all subscriptions ---');
  // @ts-expect-error
  const snapshot = await notificationService.getPushService().db.collection('claris-push-subscriptions').get();
  if (snapshot.empty) {
    console.log('❌ No subscriptions found in Firestore.');
  } else {
    console.log(`✅ Found ${snapshot.size} subscriptions:`);
    snapshot.forEach((doc) => {
      console.log(
        `- ID: ${doc.id}, User: ${doc.data().userId}, Endpoint: ${doc.data().subscription?.endpoint?.slice(0, 20)}...`,
      );
    });
  }
  console.log('---------------------------------');

  const testUserId = process.env.TEST_USER_ID;

  if (testUserId) {
    await sendToUser(testUserId, event, message);
  } else if (!snapshot.empty) {
    const firstDoc = snapshot.docs[0].data();
    const targetUser = firstDoc.userId;
    console.log(`⚠️ TEST_USER_ID not set. Auto-targeting first found user: "${targetUser}"`);
    await sendToUser(targetUser, event, message);
  } else {
    console.warn('⚠️ No subscriptions found and TEST_USER_ID is not set. Cannot send notification.');
  }

  console.log('--- Notification Test End ---');
}

async function sendToUser(userId: string, event: ClarisEvent, message: string) {
  console.log(`Targeting user: ${userId}`);

  // NotificationService の notify を呼ぶと、WS接続がないため PushService へフォールバックするはず
  // ただし notify メソッドは非同期で PushService を呼ぶので、スクリプトが即終了しないように待つ必要がある
  // NotificationService.notify は boolean を返すが、Push の完了を待たない設計になっている

  // 今回のテストでは確実に結果を見たいので、内部の PushService を直接取得して使います
  const pushService = notificationService.getPushService();

  try {
    const sent = await pushService.sendPush(userId, event, message);
    if (sent) {
      console.log('✅ Web Push sent successfully!');
    } else {
      console.log('❌ Web Push failed or no subscription found.');
    }
  } catch (error) {
    console.error('❌ Error sending push:', error);
  }
}

main().catch(console.error);
