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
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            :root {
              --primary: 330 81% 60%;
              --secondary: 330 100% 96%;
              --accent: 262 83% 58%;
              --background: 0 0% 100%;
              --foreground: 222 47% 11%;
              --border: 214.3 31.8% 91.4%;
              --input: 214.3 31.8% 91.4%;
              --ring: 222.2 84% 4.9%;
            }
            body { 
              font-family: "IBM Plex Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
              text-align: center; 
              padding: 20px; 
              background-color: #ffffff;
              color: hsl(var(--foreground));
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              overflow: hidden;
              position: relative;
            }
            
            /* Background Gradients (Synced with index.html) */
            .background-gradients {
              position: fixed;
              inset: 0;
              z-index: 0;
              pointer-events: none;
              overflow: hidden;
            }
            .blob {
              position: absolute;
              border-radius: 50%;
              filter: blur(100px);
              mix-blend-mode: multiply;
              animation: blob 7s infinite;
              opacity: 0.6;
            }
            .blob-1 { top: -10%; left: -10%; width: 50vw; height: 50vw; background-color: hsla(var(--primary), 0.2); }
            .blob-2 { top: -10%; right: -10%; width: 50vw; height: 50vw; background-color: hsla(var(--accent), 0.2); animation-delay: 2s; }
            .blob-3 { bottom: -10%; left: 20%; width: 50vw; height: 50vw; background-color: hsla(30, 80%, 70%, 0.2); animation-delay: 4s; }

            @keyframes blob {
              0% { transform: translate(0px, 0px) scale(1); }
              33% { transform: translate(30px, -50px) scale(1.1); }
              66% { transform: translate(-20px, 20px) scale(0.9); }
              100% { transform: translate(0px, 0px) scale(1); }
            }

            .card {
              background: rgba(255, 255, 255, 0.6);
              backdrop-filter: blur(24px);
              -webkit-backdrop-filter: blur(24px);
              padding: 3rem 2rem;
              border-radius: 1.5rem;
              max-width: 400px;
              width: 100%;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              position: relative;
              z-index: 10;
              animation: fade-in 0.5s ease-out;
            }
            @keyframes fade-in {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            h1 { 
              margin-bottom: 1.5rem; 
              font-size: 2.25rem;
              font-weight: 700;
              background: linear-gradient(to right, hsl(var(--primary)), hsl(var(--accent)));
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              letter-spacing: -0.025em;
            }
            p { 
              color: hsl(var(--foreground)); 
              opacity: 0.7;
              line-height: 1.6; 
              margin-bottom: 2rem; 
              font-size: 1rem;
            }
            .btn {
              background: hsl(var(--primary));
              color: white;
              padding: 12px 32px;
              text-decoration: none;
              border-radius: 9999px;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              border: none;
              cursor: pointer;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              font-size: 1.125rem;
            }
            .btn:hover { 
              transform: scale(1.05); 
              background-color: hsla(var(--primary), 0.9);
            }
            .btn:active { transform: scale(0.95); }
            .timer { font-size: 0.75rem; color: hsl(var(--foreground)); margin-top: 1.5rem; opacity: 0.5; font-family: monospace; }
          </style>
          <script>
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          </script>
        </head>
        <body>
          <div class="background-gradients">
            <div class="blob blob-1"></div>
            <div class="blob blob-2"></div>
            <div class="blob blob-3"></div>
          </div>
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
