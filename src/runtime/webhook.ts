import { createHmac, timingSafeEqual } from 'node:crypto';
/**
 * GitHub Webhook Handler
 *
 * Handles incoming webhook events from GitHub and triggers appropriate agent actions.
 */
import { Hono } from 'hono';
import { MESSAGES } from '../constants/messages.js';
import { addLabels, addReviewer, createReview, fetchDiff, getPRDetails, postComment } from '../tools/git/github.js';
import { adkRunner } from './runner.js';

export const webhookApp = new Hono();

// Webhook secret for signature verification (REQUIRED)
const webhookSecretEnv = process.env.GITHUB_WEBHOOK_SECRET;

// Validate at module load time - fail fast if secret is not configured
if (!webhookSecretEnv) {
  throw new Error('GITHUB_WEBHOOK_SECRET is required for webhook signature verification');
}

// After validation, we know this is a string
const WEBHOOK_SECRET: string = webhookSecretEnv;

/**
 * Verifies the GitHub webhook signature
 */
function verifySignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    console.warn(MESSAGES.WEBHOOK.NO_SIGNATURE_HEADER);
    return false;
  }

  const hmac = createHmac('sha256', WEBHOOK_SECRET);
  const digest = `sha256=${hmac.update(payload).digest('hex')}`;

  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) {
    console.error(MESSAGES.WEBHOOK.INVALID_SIGNATURE);
    return false;
  }

  const isValid = timingSafeEqual(signatureBuffer, digestBuffer);
  if (!isValid) {
    console.error(MESSAGES.WEBHOOK.INVALID_SIGNATURE);
  }
  return isValid;
}

/**
 * Extracts repository info from webhook payload
 */
function getRepoFromPayload(payload: Record<string, unknown>): string | null {
  const repo = payload.repository as { full_name?: string } | undefined;
  return repo?.full_name || null;
}

/**
 * Handles Pull Request events
 */
async function handlePullRequestEvent(
  action: string,
  prNumber: number,
  repo: string,
  prTitle: string,
  prAuthor: string,
): Promise<string> {
  console.log(`📥 PR #${prNumber} "${prTitle}" by ${prAuthor} - Action: ${action}`);

  // Only process opened, synchronize (new commits), or reopened PRs
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return MESSAGES.WEBHOOK.SKIPPED_ACTION(action);
  }

  try {
    // Add claris-bot as reviewer (only on opened)
    if (action === 'opened') {
      console.log('👥 Adding claris-bot as reviewer...');
      await addReviewer({ repo, prNumber, reviewer: 'claris-bot' });
    }

    // Fetch PR diff
    console.log('📄 Fetching diff...');
    const diff = await fetchDiff({ repo, prNumber });
    const prDetails = await getPRDetails({ repo, prNumber });

    // Prepare prompt for Claris
    const prompt = `
GitHub PRレビュー依頼が来たよ！

## PR情報
- リポジトリ: ${repo}
- PR番号: #${prNumber}
- タイトル: ${prTitle}
- 作成者: ${prAuthor}
- 追加行: ${prDetails.additions}
- 削除行: ${prDetails.deletions}
- 変更ファイル数: ${prDetails.changedFiles}

## 差分 (Diff)
\`\`\`diff
    // Fetch PR diff with exclusions to avoid noise and huge payloads
    console.log('📄 Fetching diff...');
    const diff = await fetchDiff({ repo, prNumber });

${diff.slice(0, 300000)}${diff.length > 300000 ? '\n... (差分が長いため省略)' : ''}
\`\`\`

このPRをレビューして、問題点や改善提案があればコメントを作成してね。

# 重要: 出力フォーマット
必ず以下の **JSONフォーマット** で出力して！マークダウンのコードブロックで囲むこと。

\`\`\`json
{
  "status": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "comment": "レビューコメントの内容（Markdown形式）"
}
\`\`\`

- **APPROVE**: 問題がなく、すぐにマージできる場合（LGTM）
- **REQUEST_CHANGES**: 修正が必要な問題（バグ、セキュリティリスク、設計ミスなど）がある場合
- **COMMENT**: 質問や提案のみで、マージをブロックする必要がない場合
`;

    // Run Claris agent to analyze the PR
    console.log('🤖 Asking Claris to review...');
    const aiResponse = await adkRunner.run({
      userId: 'github-webhook',
      sessionId: `pr-${repo.replace('/', '-')}-${prNumber}`,
      message: prompt,
    });

    // Parse AI response
    let reviewData: {
      status: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      comment: string;
    };
    try {
      // Extract JSON from code block
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch?.[1] ? jsonMatch[1] : aiResponse;
      reviewData = JSON.parse(jsonString);
    } catch (e) {
      console.error(MESSAGES.WEBHOOK.FAILED_PARSE_AI, e);
      // Fallback: treat as comment
      reviewData = { status: 'COMMENT', comment: aiResponse };
    }

    // Determine event and labels
    const reviewEvent = reviewData.status as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    let labels: string[] = [];
    if (reviewEvent === 'APPROVE') labels = ['approved'];
    if (reviewEvent === 'REQUEST_CHANGES') labels = ['needs-review'];

    // Create the review with proper status
    console.log(`📝 Creating review (${reviewEvent})...`);
    const reviewResult = await createReview({
      repo,
      prNumber,
      event: reviewEvent,
      body: `${MESSAGES.WEBHOOK.REVIEW_HEADER}${reviewData.comment}`,
    });
    console.log('✅ Review created:', reviewResult);

    // Add labels
    if (labels.length > 0) {
      console.log(`🏷️ Adding labels: ${labels.join(', ')}...`);
      await addLabels({ repo, prNumber, labels });
    }

    return reviewResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error processing PR:', errorMessage);
    return `Error: ${errorMessage}`;
  }
}

/**
 * Main webhook endpoint
 */
webhookApp.post('/', async (c) => {
  const allHeaders = c.req.header();
  const eventType = c.req.header('X-GitHub-Event');
  // 署名ヘッダーを複数の候補から探す（大文字小文字対策）
  const signature =
    c.req.header('X-Hub-Signature-256') || c.req.header('x-hub-signature-256') || allHeaders['x-hub-signature-256'];

  const rawBody = await c.req.text();

  console.log(`🔔 Webhook received: ${eventType || 'unknown'}`);

  // Verify signature
  if (!verifySignature(rawBody, signature)) {
    console.error(MESSAGES.WEBHOOK.INVALID_SIGNATURE);
    return c.json({ error: MESSAGES.WEBHOOK.INVALID_SIGNATURE }, 401);
  }

  // Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: MESSAGES.WEBHOOK.INVALID_JSON }, 400);
  }

  const repo = getRepoFromPayload(payload);
  if (!repo) {
    return c.json({ error: MESSAGES.WEBHOOK.MISSING_REPO }, 400);
  }

  // Handle different event types
  if (eventType === 'pull_request') {
    const action = payload.action as string;
    const pr = payload.pull_request as {
      number: number;
      title: string;
      user: { login: string };
    };

    // Fire-and-forget: respond immediately, process in background
    // Note: In production, use a queue (Cloud Tasks, Pub/Sub) for reliability
    setImmediate(() => {
      handlePullRequestEvent(action, pr.number, repo, pr.title, pr.user.login).catch(console.error);
    });

    return c.json({ received: true, event: eventType, action });
  }

  // Ping event (sent when webhook is first configured)
  if (eventType === 'ping') {
    console.log('🏓 Ping received! Webhook is configured correctly.');
    return c.json({ message: MESSAGES.WEBHOOK.PONG });
  }

  // Other events
  if (eventType === 'issue_comment') {
    const action = payload.action as string;
    const issue = payload.issue as {
      number: number;
      pull_request?: unknown;
      title: string;
      user: { login: string };
    };
    const comment = payload.comment as {
      body: string;
      user: { login: string };
    };

    // Only process created comments on PRs
    if (action === 'created' && issue.pull_request) {
      const botName = process.env.CLARIS_NAME || 'Claris';

      // Check if bot is mentioned (case insensitive)
      // Also ensure we don't reply to ourselves (though usually bot token differs)
      const isMentioned =
        comment.body.toLowerCase().includes(`@${botName.toLowerCase()}`) ||
        comment.body.toLowerCase().includes(botName.toLowerCase());

      if (isMentioned) {
        console.log(
          `🤖 Bot mentioned in comment on PR #${issue.number} by ${comment.user.login}. Triggering re-review...`,
        );

        // Use setImmediate for async processing
        setImmediate(() => {
          // Treat as a 'synchronize' event to trigger a fresh review
          handlePullRequestEvent('synchronize', issue.number, repo, issue.title, issue.user.login).catch(console.error);
        });

        return c.json({
          received: true,
          event: eventType,
          action,
          triggered: true,
        });
      }
    }
  }

  return c.json({
    received: true,
    event: eventType,
    message: 'Event not handled',
  });
});
