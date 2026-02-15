import { Octokit } from '@octokit/rest';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'blacpans/claris'; // Default repo
const SERVER_URL = process.env.SERVER_URL || 'https://claris.blacpans.net';
const AUTH_SECRET = process.env.AUTH_SECRET;
const TARGET_USER_ID = process.env.TARGET_USER_ID; // Optional: specify your userId

async function sendDemoNotification() {
  console.log('🚀 Starting Demo Notification Script...');

  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is not set!');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const [owner, repo] = REPO.split('/');

  try {
    console.log(`🔍 Fetching PRs from ${REPO}...`);
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: 5,
    });

    if (prs.length === 0) {
      console.log('ℹ️ No PRs found.');
      return;
    }

    // Format the summary message
    let summary = '先輩！直近のPR状況をまとめておいたよ！🌸\n\n';
    prs.forEach((pr) => {
      summary += `- [#${pr.number}] ${pr.title} (${pr.state})\n`;
    });
    summary += '\nこれぞ自律型エージェントの力じゃんね！🚀✨';

    console.log('📝 Summary created:');
    console.log(summary);

    // Send notification to the server
    console.log(`📡 Sending notification to ${SERVER_URL}...`);
    const response = await axios.get(`${SERVER_URL}/api/debug/test-notification`, {
      params: {
        text: summary,
        source: 'github',
        targetUserId: TARGET_USER_ID,
        broadcast: !TARGET_USER_ID, // If no userId, try broadcasting
        secret: AUTH_SECRET, // Keep secret for auth
      },
    });

    if (response.data.success) {
      console.log('✅ Notification sent successfully! Check your browser! 🔔✨');
    } else {
      console.error('❌ Failed to send notification:', response.data);
    }
  } catch (error) {
    console.error('❌ Error in Demo Notification Script:', error);
  }
}

sendDemoNotification();
