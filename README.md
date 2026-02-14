# Claris 🌸

An Agentic NetNavi built with Google Agent Development Kit (ADK).

## Overview

Claris is an autonomous AI companion designed to assist developers with code reviews, Git operations, and general development tasks. She's powered by Google's Gemini models through the Agent Development Kit.

## Features

- 🤖 **Autonomous Agent**: Claris can make decisions and take actions proactively
- 💬 **Conversational**: Natural language interaction with memory of past conversations
- 🧠 **Long-Term Memory**: Remembers your preferences and past interactions via Firestore Vector Search
- 🔔 **Proactive Actions**: Automatically notices errors or PR comments and offers help
- 📱 **Web Push Notifications**: Get notified when Claris completes a task (e.g., finishing a PR review)
- 🎙️ **Live Mode**: Multimodal real-time voice interaction via Gemini Live API
- 🔧 **Tool-Enabled**: Git operations, Google Services (Calendar, Gmail, etc.) through ADK Tools
- 🦀 **Soul Unison**: Automatically switches Thinking Style (Persona) based on file context
- ⚙️ **Navi Customizer**: Extensive configuration via `claris.config.json`

## Tech Stack

- **Framework**: Google Agent Development Kit (ADK)
- **Runtime**: Node.js + Hono
- **LLM**: Google Gemini (Flash / Pro / Multimodal Live API)
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
If you manage a YouTube channel via a Brand Account, you must authenticate separately:
```bash
claris auth --profile youtube
```

## Configuration ⚙️

You can customize Claris's behavior by creating a `claris.config.json` file in your project root.

```json
{
  "attack": 1024,          // Max output tokens
  "rapid": "flash",        // Model speed: "flash" or "pro"
  "charge": 10,            // Conversation history length
  "humor": 0.8,            // Temperature (Creativity)
  "preferredStyle": "guard" // Force a specific soul (Optional)
}
```

## Project Structure 📁

```text
claris/
├── src/
│   ├── agents/      # Agent personas and prompts
│   ├── cli/         # CLI commands (auth, chat, live, etc.)
│   ├── core/        # Core systems (Live, Memory, Proactive, Auth)
│   ├── tools/       # ADK Tools for external services (Git, Google)
│   ├── runtime/     # Server, Webhook, and WebSocket handlers
│   ├── config/      # Environment and model configurations
│   ├── sessions/    # Firestore session persistence
│   └── utils/       # Shared utility functions
├── public/          # Frontend assets and UI
├── scripts/         # Utility scripts (Deployment, Debug)
└── .env.example     # Environment variable template
```

## Getting Started

```bash
# Install dependencies
npm install

# Build and link the CLI globally
npm run build
npm install -g .

# Set up environment variables
cp .env.example .env

# Run in development mode
npm run dev
```

### Environment Variables ⚙️

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud Project ID |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI Location (e.g., `us-central1`, `asia-northeast1`) |
| `GEMINI_MODEL` | Default Gemini Model (e.g., `gemini-3-pro-preview`) |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_WEBHOOK_SECRET` | GitHub Webhook Secret (Required for webhook) |
| `FIRESTORE_COLLECTION` | Firestore Collection (e.g., `claris-sessions`) |
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
# Start a chat session
claris chat

# Start a real-time voice session
claris live

# Authenticate with Google
claris auth

# Check status (Calendar, Gmail)
claris status
```

## License

MIT
