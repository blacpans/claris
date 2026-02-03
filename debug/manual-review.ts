import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { generatePRReviewPrompt } from '../src/agents/prompts.js';
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

    // Prepare prompt using shared logic
    const prompt = generatePRReviewPrompt(repo, prNumber, prDetails.title, prDetails.author, prDetails);

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
