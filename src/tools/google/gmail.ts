import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { getGmailClient } from './auth.js';

const listUnreadEmailsSchema = z.object({
  maxResults: z.number().optional().describe('Maximum number of emails to list. Defaults to 5.'),
});

export async function listUnreadEmailsFn({ maxResults = 5 }: { maxResults?: number }) {
  try {
    const gmail = await getGmailClient();
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults,
    });

    const messages = res.data.messages;
    if (!messages || messages.length === 0) {
      return 'No unread emails found.';
    }

    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id || '', // Fallback or strict check
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = detail.data.payload?.headers;
        const subject = headers?.find((h) => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers?.find((h) => h.name === 'From')?.value || '(Unknown Sender)';
        const date = headers?.find((h) => h.name === 'Date')?.value || '';
        const snippet = detail.data.snippet;

        return `- [${date}] ${from}: ${subject}\n  Snippet: ${snippet}`;
      }),
    );

    return emailDetails.join('\n\n');
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    if (
      err.message?.includes('No saved credentials found') ||
      err.message?.includes('invalid_grant') ||
      err.code === 401 ||
      err.code === 403
    ) {
      return 'Gmailの認証ができていないか、期限切れみたいだよ💦\nサーバー管理者（あなた）に `/auth/google` にアクセスして認証するようお願いしてね！';
    }
    return `エラーが発生しちゃった💦: ${err.message || String(error)}`;
  }
}

const watchGmailSchema = z.object({
  topicName: z
    .string()
    .optional()
    .describe(
      `The full name of the Cloud Pub/Sub topic. Defaults to "projects/\${GOOGLE_CLOUD_PROJECT}/topics/claris-events" if not specified.`,
    ),
});

export async function watchGmailFn({ topicName }: { topicName?: string }) {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT is not set in .env');
    }

    const finalTopicName = topicName || `projects/${projectId}/topics/claris-events`;

    const gmail = await getGmailClient();
    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: finalTopicName,
        labelIds: ['INBOX'], // Watch for changes in Inbox
        labelFilterAction: 'include',
      },
    });

    return `Successfully set up Gmail watch! 📡\nTopic: ${finalTopicName}\nHistory ID: ${res.data.historyId}\nExpiration: ${new Date(Number(res.data.expiration)).toLocaleString()}`;
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to set up Gmail watch 😢: ${err.message || String(error)}`;
  }
}

export async function stopWatchGmailFn() {
  try {
    const gmail = await getGmailClient();
    await gmail.users.stop({ userId: 'me' });
    return 'Successfully stopped Gmail notifications. 🛑';
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to stop Gmail watch 😢: ${err.message || String(error)}`;
  }
}

export const listUnreadEmails = new FunctionTool({
  name: 'listUnreadEmails',
  description: "List unread emails from the user's Gmail inbox.",
  parameters: listUnreadEmailsSchema,
  execute: listUnreadEmailsFn,
});

export const watchGmail = new FunctionTool({
  name: 'watchGmail',
  description: 'Start watching Gmail for new emails and push notifications to a Cloud Pub/Sub topic.',
  parameters: watchGmailSchema,
  execute: watchGmailFn,
});

export const stopWatchGmail = new FunctionTool({
  name: 'stopWatchGmail',
  description: 'Stop watching Gmail notifications.',
  parameters: z.object({}),
  execute: stopWatchGmailFn,
});
