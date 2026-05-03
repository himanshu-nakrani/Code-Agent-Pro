# Workspace

## Overview

**Forge** — an AI coding agent web app. Users submit a task (with language selection), and the autonomous agent plans, writes code, runs tests in a sandbox, and iterates until tests pass. Supports multiple files and Git integration.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/ai-agent) — Warm & Professional theme (soft orange primary), dark backgrounds
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (gpt-4.1)

## Key Features

- AI agent that autonomously plans, codes, tests, and iterates (up to 5 iterations)
- Supports Python, JavaScript, TypeScript
- Code sandbox execution using child_process with timeout
- 20+ error type detection (SYNTAX_ERROR, MISSING_MODULE, TYPE_ERROR, etc.) with targeted fix prompts
- Git integration per session (auto-init, auto-commit at each iteration, manual commit UI)
- SSE stream for real-time event push (`/api/agent/sessions/:id/stream`) with exponential backoff reconnection
- Multi-panel session detail: file viewer/editor, event log with search/filter, test results panel, VCS panel, git history
- Test result parsing: extracts individual test names from pytest/jest/mocha/tap output
- Dashboard sorted newest-first, with language color badges, relative timestamps, live active-session auto-refresh
- Theme system: warm (default), minimal, playful, bold — stored in localStorage
- Auto-navigate to session detail after session creation

## SSE Hook (`use-sse.ts`)

- Accepts `onStatusChange` and `onComplete` callbacks
- Filters: control messages (status/complete) fire callbacks; agent events (with numeric `id`) are buffered into state
- Exponential backoff reconnection (1s → 8s max)
- Session-detail invalidates React Query caches on relevant SSE event types (test → testResults, git → gitStatus/gitLog, code/success → files)

## Database Tables

- `sessions` — agent task sessions with status/language/iterations/workspacePath/gitInitialized
- `agent_files` — generated code files per session
- `agent_events` — agent thoughts, plans, code writes, test results (event log)
- `test_results` — per-iteration test run results (passed, output, errors, iteration)
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
- Agent uses `gpt-4.1` for planning and code generation

## Theme System

- CSS variables in `artifacts/ai-agent/src/themes.css`
- Applied via `data-theme` attribute on `<html>`
- Default: `warm` (32° hue orange/amber palette)
- Switcher in `artifacts/ai-agent/src/components/theme-switcher.tsx`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
