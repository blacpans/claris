import 'dotenv/config';
import { adkRunner } from '../src/runtime/runner.js';
import { fetchDiff, getPRDetails } from '../src/tools/git/github.js';

async function main() {
  const repo = 'blacpans/claris';
  // Use a recent closed PR for testing if possible, or a specific one.
  // Using PR #17 (the runner optimization PR) as a test case.
  const prNumber = 17;

  console.log(`🤖 Starting Manual Review Test for ${repo} #${prNumber}...`);

  try {
    console.log('📄 Fetching details and diff...');
    const prDetails = await getPRDetails({ repo, prNumber });
    const diff = await fetchDiff({ repo, prNumber });

    console.log(`✅ Fetched PR: "${prDetails.title}"`);
    console.log(`✅ Diff length: ${diff.length} chars`);

    // Prepare prompt (Simplified from webhook.ts)
    const prompt = `
GitHub PRレビュー依頼が来たよ！

## PR情報
- リポジトリ: ${repo}
- PR番号: #${prNumber}
- タイトル: ${prDetails.title}
- 作成者: ${prDetails.author}
- 追加行: ${prDetails.additions}
- 削除行: ${prDetails.deletions}
- 変更ファイル数: ${prDetails.changedFiles}

**指示:**
提供されたPRのDiff（System Contextにあります）を確認し、コードレビューを行ってください。
問題点や改善提案があればコメントを作成してください。

# 重要: 出力フォーマット
必ず以下の **JSONフォーマット** で出力して！マークダウンのコードブロックで囲むこと。

\`\`\`json
{
  "status": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "comment": "レビューコメントの内容（Markdown形式）"
}
\`\`\`
`;

    console.log('🚀 Sending request to Claris (Mode: review)...');

    // Measure time
    const startTime = Date.now();

    const aiResponse = await adkRunner.run({
      userId: 'manual-test-user',
      sessionId: `manual-test-${Date.now()}`,
      message: prompt,
      context: {
        mode: 'review',
        diff,
      },
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`⏱️ Response received in ${duration.toFixed(2)}s`);
    console.log('--------------------------------------------------');
    console.log(aiResponse);
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
