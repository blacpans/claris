/**
 * GitHub Webhook Handler
 *
 * Handles incoming webhook events from GitHub and triggers appropriate agent actions.
 */
import { Hono } from 'hono';
import { createHmac } from 'crypto';
import { adkRunner } from './runner.js';
import { fetchDiff, getPRDetails, postComment } from '../tools/git/github.js';

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
    return false;
  }

  const hmac = createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return signature === digest;
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
  prAuthor: string
): Promise<string> {
  console.log(`📥 PR #${prNumber} "${prTitle}" by ${prAuthor} - Action: ${action}`);

  // Only process opened, synchronize (new commits), or reopened PRs
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return `Skipped: PR action "${action}" doesn't require review`;
  }

  try {
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
${diff.slice(0, 10000)}${diff.length > 10000 ? '\n... (差分が長いため省略)' : ''}
\`\`\`

このPRをレビューして、問題点や改善提案があればコメントを作成してね。
問題なければ「LGTM！」と言ってOK。
`;

    // Run Claris agent to analyze the PR
    console.log('🤖 Asking Claris to review...');
    const reviewComment = await adkRunner.run({
      userId: 'github-webhook',
      sessionId: `pr-${repo.replace('/', '-')}-${prNumber}`,
      message: prompt,
    });

    // Post the review comment to the PR
    console.log('💬 Posting review comment...');
    const result = await postComment({
      repo,
      prNumber,
      body: `## 🌸 Claris Review\n\n${reviewComment}`,
    });

    console.log('✅ Review posted:', result);
    return result;
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
  const eventType = c.req.header('X-GitHub-Event');
  const signature = c.req.header('X-Hub-Signature-256');
  const rawBody = await c.req.text();

  console.log(`🔔 Webhook received: ${eventType}`);

  // Verify signature
  if (!verifySignature(rawBody, signature)) {
    console.error('❌ Invalid webhook signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const repo = getRepoFromPayload(payload);
  if (!repo) {
    return c.json({ error: 'No repository in payload' }, 400);
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
      handlePullRequestEvent(action, pr.number, repo, pr.title, pr.user.login).catch(
        console.error
      );
    });

    return c.json({ received: true, event: eventType, action });
  }

  // Ping event (sent when webhook is first configured)
  if (eventType === 'ping') {
    console.log('🏓 Ping received! Webhook is configured correctly.');
    return c.json({ message: 'Pong! Claris is ready! 🌸' });
  }

  // Other events
  return c.json({ received: true, event: eventType, message: 'Event not handled' });
});
