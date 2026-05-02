# Workspace

## Overview

**Forge** — an AI coding agent web app. Users submit a task (with language selection), and the autonomous agent plans, writes code, runs tests in a sandbox, and iterates until tests pass. Supports multiple files and Git integration.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/ai-agent) — dark terminal aesthetic, amber accent
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (gpt-5.4, gpt-5.3-codex)

## Key Features

- AI agent that autonomously plans, codes, tests, and iterates (up to 5 iterations)
- Supports Python, JavaScript, TypeScript
- Code sandbox execution using child_process with timeout
- Git integration per session (auto-init, auto-commit, manual commit)
- SSE stream endpoint for real-time event updates (/api/agent/sessions/:id/stream)
- Multi-panel session detail: file viewer, event log, git panel, test results
- OpenAI chat conversations for general Q&A

## Database Tables

- `sessions` — agent task sessions with status/language/iterations
- `agent_files` — generated code files per session
- `agent_events` — agent thoughts, plans, code writes, test results (event log)
- `test_results` — per-iteration test run results
- `conversations` — OpenAI chat conversations
- `messages` — chat messages

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Routes

- Frontend: `/` (served by artifacts/ai-agent)
- API: `/api` (served by artifacts/api-server)

## AI Integration

- Uses Replit AI Integrations (no user API key needed)
- Env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`
- Agent uses `gpt-5.4` for planning and code generation

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
