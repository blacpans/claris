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
        <head>
          <title>${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
              text-align: center; 
              padding: 40px 20px; 
              background-color: #1a1a1a; 
              color: white; 
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: rgba(255, 255, 255, 0.05);
              padding: 2rem;
              border-radius: 1rem;
              max-width: 400px;
              width: 100%;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            h1 { 
              color: #ff69b4; 
              margin-bottom: 1rem; 
              font-size: 1.5rem;
              background: linear-gradient(45deg, #ff69b4, #da70d6);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            p { color: #ddd; line-height: 1.6; margin-bottom: 1.5rem; }
            .btn {
              background: linear-gradient(135deg, #ff69b4 0%, #ff4b4b 100%);
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
              display: inline-block;
              transition: transform 0.2s;
              border: none;
              cursor: pointer;
            }
            .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(255, 71, 87, 0.4); }
            .btn:active { transform: scale(0.95); }
            .timer { font-size: 0.9rem; color: #888; margin-top: 1rem; }
          </style>
          <script>
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          </script>
        </head>
        <body>
          <div class="card">
            <h1>${header}</h1>
            <p>${body}</p>
            <a href="/" class="btn">アプリに戻る 🚀</a>
            <p class="timer">${footer}</p>
          </div>
        </body>
      </html>
    `,
    SUCCESS_TITLE: 'Authentication Successful',
    SUCCESS_HEADER: '✨ Authentication Successful! ✨',
    SUCCESS_BODY: 'Google Workspace との連携が完了したよ！🌸',
    SUCCESS_FOOTER: '3秒後にアプリに戻るよ！🌸',
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
