# Forge - AI Coding Agent

An autonomous AI coding agent that plans, writes code, runs tests, and iterates until your task is complete.

## Overview

Forge is a web application where you submit coding tasks and watch an AI agent autonomously work through them. The agent plans its approach, writes code, executes tests in a sandbox, and iterates up to 5 times until tests pass.

## Features

- **Autonomous Agent Loop**: Plan → Code → Test → Iterate
- **Multi-language Support**: Python, JavaScript, TypeScript
- **Real-time Streaming**: SSE-based progress updates with visual feedback
- **Git Integration**: Automatic commits each iteration, manual commit UI
- **Error Recovery**: 20+ error types with targeted fix prompts
- **Code Formatting**: Auto-formats with prettier (JS/TS) and black (Python)
- **Session Dashboard**: Search, filter, archive, and export session history

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4, React Query
- **Backend**: Express 5, PostgreSQL, Drizzle ORM
- **AI**: OpenAI GPT models (gpt-4.1, gpt-4o, gpt-4o-mini)
- **Monorepo**: pnpm workspaces

## Project Structure

```
/artifacts
├── ai-agent/        # React frontend application
├── api-server/      # Express backend API
└── mockup-sandbox/  # Sandbox UI prototype

/lib
├── api-client-react/  # React Query hooks
├── api-spec/          # OpenAPI spec + Orval codegen
├── api-zod/           # Zod validation schemas
├── db/                # Drizzle ORM schema
└── integrations/      # OpenAI integration
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database

### Installation

```bash
# Install dependencies
pnpm install

# Setup database (run migrations)
pnpm --filter @workspace/db migrate

# Start development servers
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/ai-agent dev
```

### Environment Variables

**API Server** (`artifacts/api-server/.env`):
```
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
```

**AI Agent** (`artifacts/ai-agent/.env`):
```
VITE_API_URL=http://localhost:3000
```

## Usage

1. Enter a coding task description
2. Select your language (Python, JS, or TS)
3. Choose an AI model
4. Click "Start Session" and watch the agent work
5. View iteration history, events, and generated files
6. Export sessions or view stats in the dashboard

## License

MIT