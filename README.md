# Claris 🌸

An Agentic NetNavi built with Google Agent Development Kit (ADK).

## Overview

Claris is an autonomous AI companion designed to assist developers with code reviews, Git operations, and general development tasks. She's powered by Google's Gemini models through the Agent Development Kit.

## Features

- 🤖 **Autonomous Agent**: Claris can make decisions and take actions proactively
- 💬 **Conversational**: Natural language interaction with memory of past conversations
- 🧠 **Long-Term Memory**: Remembers your preferences and past interactions via Firestore Vector Search
- 🔔 **Web Push Notifications**: Get notified when Claris completes a task (e.g., finishing a PR review)
- 🔧 **Tool-Enabled**: Git operations, code review, and more through ADK Tools
- ☁️ **Cloud-Ready**: Designed to run on Cloud Run with Firestore state persistence
- 🦀 **Soul Unison**: Automatically switches Thinking Style (Persona) based on file context
- ⚙️ **Navi Customizer**: Extensive configuration via `claris.config.json`

## Tech Stack

- **Framework**: Google Agent Development Kit (ADK)
- **Runtime**: Node.js + Hono
- **LLM**: Google Gemini (via Vertex AI)
- **State**: Firestore (for session persistence & memory)
- **Notifications**: Web Push API
- **Deployment**: Google Cloud Run (Requires "CPU always allocated" for background tasks)

## Soul Unison (Thinking Styles) 🧠

Claris adapts her personality and expertise based on the file extension you are working on:

| Soul | Color | Focus | Extensions (Default) |
|------|-------|-------|----------------------|
| **Guard Soul** | 🟩 | Safety & Robustness | `.ts`, `.go`, `.rs`, `.java` |
| **Logic Soul** | 🟦 | Logic & Efficiency | `.py`, `.c`, `.sql`, `.sh` |
| **Passion Soul** | 🟥 | Creativity & Speed | `.js`, `.md`, `.css`, `.html` |

## Authentication 🔑

Claris requires Google authentication to access services like Drive, Calendar, and YouTube.

### Default Profile (Main)
For standard services (Drive, Docs, Calendar, Gmail, etc.):
```bash
claris auth
```

### YouTube Brand Account (Optional)
If you manage a YouTube channel via a Brand Account, you must authenticate separately with the "youtube" profile:
```bash
claris auth --profile youtube
```
*Note: This creates a separate `token_youtube.json` file. Claris will automatically switch to this credential when using YouTube tools.*

## Configuration ⚙️

You can customize Claris's behavior by creating a `claris.config.json` file in your project root.

```json
{
  "attack": 1024,          // Max output tokens
  "rapid": "flash",        // Model speed: "flash" or "pro"
  "humor": 0.8,            // Temperature (Creativity)
  "preferredStyle": "guard" // Force a specific soul (Optional)
}
```

## Project Structure 📁

```text
claris/
├── src/
│   ├── agents/      # Agent personas and logic (Claris)
│   ├── core/        # Core systems (Live Session, Memory, Proactive)
│   ├── tools/       # ADK Tools for external services
│   ├── runtime/     # Server, Webhook, and CLI runner
│   └── config/      # Environment and model configurations
├── public/          # Frontend assets and UI
├── scripts/         # Utility scripts (Deployment, Debug)
└── .env.example     # Environment variable template
```

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run in development mode
npm run dev
```

### Environment Variables ⚙️

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud Project ID |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI Location (e.g., `global`, `asia-northeast1`) |
| `GEMINI_LIVE_MODEL` | Live API Model |
| `GEMINI_FLASH_MODEL` | Flash Model (Cheap/Fast) |
| `GEMINI_PRO_MODEL` | Pro Model (High Reasoning) |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_WEBHOOK_SECRET` | GitHub Webhook Secret |
| `GOOGLE_CLIENT_ID` | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
| `FIRESTORE_COLLECTION` | Firestore Collection for sessions |
| `VAPID_PUBLIC_KEY` | Web Push VAPID Public Key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID Private Key |

## Firestore & Vector Search Setup 🔥

To enable Long-Term Memory, you need to configure a Firestore Vector Search Index.

1.  **Collection**: `claris-memories`
2.  **Index Type**: Vector Search
3.  **Fields**:
    -   `embedding`: Vector (Dimension: 768)
    -   `userId`: Ascending (for filtering)

> [!NOTE]
> When you run the application for the first time and attempt to save/search memory, the error log will provide a direct URL to create this index automatically.

## CLI Tool 💻

You can interact with Claris directly from your terminal.

```bash
# Method 1: Using npx (Recommended for dev)
npx tsx src/index.ts talk "Hello!"

# Method 2: Global Link (For ease of use)
npm install -g .
claris talk "Hello!" -c src/index.ts

# Check Status (Google Calendar & Gmail)
claris status
```

## License

MIT
