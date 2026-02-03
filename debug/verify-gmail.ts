import 'dotenv/config';
import { adkRunner } from '../src/runtime/runner.js';

async function main() {
  console.log('🤖 Starting Gmail Verification...');

  // 1. Ask for unread emails (expecting auth error or success if already authenticated)
  const prompt = '未読メールを教えて！';
  console.log(`👤 User: ${prompt}`);

  try {
    const response = await adkRunner.run({
      userId: 'verify-gmail-user',
      sessionId: `verify-gmail-${Date.now()}`,
      message: prompt,
    });

    console.log('--------------------------------------------------');
    console.log(`🌸 Claris: ${response}`);
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
