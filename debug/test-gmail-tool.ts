import 'dotenv/config';
import { listUnreadEmailsFn } from '../src/tools/google/gmail.js';

async function main() {
  console.log('🧪 Testing Gmail Tool Function Directly...');

  console.log('\n--- Testing listUnreadEmails ---');
  // We expect this to fail with auth error, so we can test handling
  const resultList = await listUnreadEmailsFn({ maxResults: 3 });
  console.log('Result:', resultList);
}

main();
