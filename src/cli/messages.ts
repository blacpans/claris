export const CLI_MESSAGES = {
  DESCRIPTION: 'Claris CLI Client',
  COMMANDS: {
    CHAT: {
      NAME: 'chat',
      DESCRIPTION: 'Chat with Claris',
      ARG_MESSAGE: 'Message to send',
      OPT_URL: 'API URL',
    },
  },
  ERRORS: {
    SERVER_ERROR: (status: number, statusText: string) => `Server error: ${status} ${statusText}`,
    UNEXPECTED_RESPONSE: (contentType: string | null, bodySample: string) =>
      `Unexpected response format: ${contentType}\nBody: ${bodySample}...`,
    CONNECTION_REFUSED: 'クラリスに接続できませんでした。サーバーは起動していますか？💦',
    COMMUNICATION_ERROR: 'クラリスとの通信中にエラーが発生しました:',
  },
  PROMPTS: {
    CLARIS: 'Claris 🌸 > ',
  },
} as const;
