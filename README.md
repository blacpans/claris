# Claris 🌸

An Agentic NetNavi built with Google Agent Development Kit (ADK).

## Overview

Claris is an autonomous AI companion designed to assist developers with code reviews, Git operations, and general development tasks. She's powered by Google's Gemini models through the Agent Development Kit.

## Features

- 🤖 **Autonomous Agent**: Claris can make decisions and take actions proactively
- 💬 **Conversational**: Natural language interaction with memory of past conversations
- 🔧 **Tool-Enabled**: Git operations, code review, and more through ADK Tools
- ☁️ **Cloud-Ready**: Designed to run on Cloud Run with Firestore state persistence

## Tech Stack

- **Framework**: Google Agent Development Kit (ADK)
- **Runtime**: Node.js + Hono
- **LLM**: Google Gemini (via Vertex AI)
- **State**: Firestore (for session persistence)
- **Deployment**: Google Cloud Run

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run in development mode
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud Project ID |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI Location (e.g., `us-central1` or `global`) |
| `GEMINI_MODEL` | Gemini Model Name (e.g., `gemini-1.5-pro`) |
| `FIRESTORE_COLLECTION` | Firestore collection for session storage |
| `GITHUB_TOKEN` | GitHub Personal Access Token (for PR operations) |
| `GITHUB_WEBHOOK_SECRET` | Secret for GitHub Webhook verification |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | Google OAuth 2.0 Redirect URI |
| `AUTH_SECRET` | Secret to protect `/auth/google` and session state |
| `TZ` | Timezone (e.g., `Asia/Tokyo`) |
| `PORT` | Server port (default: 8080) |

## License

MIT
