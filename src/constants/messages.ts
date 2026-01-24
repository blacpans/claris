/**
 * Application Messages and Constants
 */
export const MESSAGES = {
  SERVER: {
    HEALTH_CHECK: 'Hello! Claris is ready to help! 🌸',
    CHAT_MISSING_MESSAGE: 'message is required',
    INTERNAL_ERROR: 'Internal server error',
  },
  AUTH: {
    UNAUTHORIZED_SECRET: 'Unauthorized: Missing or invalid secret',
    FAILED_GENERATE_URL: 'Failed to generate auth URL',
    MISSING_CODE: 'No authorization code provided',
    INVALID_STATE: 'Unauthorized: Invalid state parameter',
    SUCCESS_HTML: (title: string, header: string, body: string, footer: string) => `
      <html>
        <head><title>${title}</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>${header}</h1>
          <p>${body}</p>
          <p>${footer}</p>
        </body>
      </html>
    `,
    SUCCESS_TITLE: 'Authentication Successful',
    SUCCESS_HEADER: '✨ Authentication Successful! ✨',
    SUCCESS_BODY: 'Google Workspace との連携が完了したよ！🌸',
    SUCCESS_FOOTER: 'このタブは閉じて大丈夫だよ！',
    FAILED_PROCESS: 'Authentication failed',
  },
  WEBHOOK: {
    INVALID_SIGNATURE: '❌ Invalid webhook signature',
    NO_SIGNATURE_HEADER: '⚠️ No signature header provided',
    MISSING_REPO: 'No repository in payload',
    INVALID_JSON: 'Invalid JSON',
    PONG: 'Pong! Claris is ready! 🌸',
    SKIPPED_ACTION: (action: string) => `Skipped: PR action "${action}" doesn't require review`,
    REVIEW_HEADER: '## 🌸 Claris Review\n\n',
    FAILED_PARSE_AI: '❌ Failed to parse AI response as JSON:',
  },
} as const;
