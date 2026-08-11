# PM Growth OS PRD

## 1. Product Summary

PM Growth OS is a knowledge-first growth workspace for product managers learning to work with AI systems. It connects daily capture, skill mapping, guided learning, practice evidence, reflection, and token/cost observability into one repeatable operating system.

The product is designed for global users. All user-facing copy should remain English.

## 2. Product Goal

Help PMs build compounding AI capability through a closed loop:

```text
Capture real work -> Link to Growth Map -> Learn with Knowledge Tool -> Practice -> Capture evidence -> Reflect -> Repeat
```

The product should feel like a real learning companion, not a static demo or generic note app.

## 3. Target Users

| User | Need |
| --- | --- |
| AI-curious PM | Wants a guided path from basic AI concepts to practical product workflows. |
| Product lead | Needs a structured way to track AI capability growth and weekly evidence. |
| Builder PM | Wants to connect learning resources, practice tasks, evidence records, and reflection. |
| Product operator | Needs usage/cost visibility for model-backed product workflows. |

## 4. Core Principles

- Coach-first: the central experience is the Coach Agent learning workflow.
- Evidence over passive reading: every resource should lead to practice and captured evidence.
- Growth Map as navigation: users can choose any capability and start a task from the map.
- Platform-managed configuration: normal users should not bring API keys.
- Local-safe fallback: static/local mode remains usable, but must not pretend to be real cloud sync.
- Observable by design: token usage, model, feature, latency, and cost should be traceable.

## 5. Current Product Surface

### 5.1 Login

- Users see a login screen before entering the workspace.
- Current local credential mode supports the configured test account.
- Production should move to Supabase Auth.

### 5.2 Growth Workspace

- The Growth page is organized around the Coach Agent as the primary workbench.
- Weekly context and selected capability details are shown as compact side context.
- The Growth Map is accessible from the left sidebar and opens as a full modal.
- From Growth Map, users can view capability details or start a focused task.

### 5.3 Coach Agent

The Coach Agent presents a structured workflow:

```text
Learn -> Practice -> Evidence -> Reflect
```

Each generated plan should include:

- Target capability.
- Why this capability matters now.
- Learning path.
- Practice task.
- Evidence template.
- Reflection prompt.
- Next step.
- Learning resources when Knowledge Search is configured.

### 5.4 Knowledge Tool / Web Search

The Knowledge Tool uses server-side web search providers, never frontend API keys.

Supported provider environment variables:

- `TAVILY_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `SERPAPI_API_KEY`

If no provider is configured, the Coach Agent should still generate a plan, but Learning Resources should clearly explain that live resources are unavailable.

### 5.5 Evidence Capture

- Users create evidence records from real AI product work.
- Local inference suggests tags and related capabilities.
- Users can manually adjust related capability links before saving.
- Saved evidence updates capability progress.

### 5.6 Reflection Agent

- Generates weekly Markdown review drafts.
- Supports edit/preview mode.
- Exports review content as Markdown.

### 5.7 Dev Gateway / Usage Bridge

The Dev Board is private developer tooling, not a normal user feature.

It should show `usage_logs` with:

- `id`
- `user_id`
- `feature`
- `model`
- `prompt_tokens`
- `completion_tokens`
- `cost`
- `latency`
- `created_at`

App-side local calls can estimate token usage. Real VS Code/Codex usage requires an external bridge that forwards real usage metadata to `/api/usage-logs`.

## 6. Data Model

### 6.1 Browser Workspace State

The local static app stores workspace state in `localStorage` for development and static-compatible deployment.

Important entities:

- `UserProfile`
- `Capability`
- `Note`
- `CaptureSuggestions`
- `CoachPlan`
- `LearningGuide`
- `LearningResource`
- `WeeklySummary`
- `ModelCallTrace`
- `UsageLog`
- `ToolConnector`

### 6.2 Initial Workspace Seed

The app uses `src/lib/initial-workspace-data.ts` for empty new-user defaults.

This is not mock/demo data. It is the product's initial seed state for a new workspace:

- No saved evidence.
- Zero capability progress.
- Empty capture draft.
- Default onboarding plan.
- New workspace user profile.

### 6.3 Supabase Production Tables

Production schema is documented in:

- `docs/supabase-schema.md`
- `docs/database-usage-logs.md`
- `supabase/migrations/`

Core tables:

- `notes` storage key for evidence records
- `capabilities`
- `user_profiles`
- `coach_plans`
- `coach_steps`
- `usage_logs`

## 7. Architecture

```text
React + Vite frontend
  -> localStorage fallback for static/local mode
  -> Vercel API routes for Knowledge Search and Usage Bridge
  -> Supabase for production persistence and usage logs
  -> Optional model/search providers configured by platform operator
```

Current deployment posture:

- Static-compatible frontend remains supported.
- Vercel Functions are used for server-side provider calls.
- Provider keys must stay server-side.
- Supabase service role key must never be exposed to the browser.

## 8. Project Structure

| Path | Purpose |
| --- | --- |
| `src/` | React frontend, local app state, agents, UI, and browser-side adapters. |
| `server/` | Local Node API server and shared server-side logic for development fallback. |
| `api/` | Vercel serverless API routes for production-compatible backend functions. |
| `configs/` | Build and compiler configuration that does not need to stay at the repository root. |
| `tests/` | Lightweight smoke tests and future product/integration tests. |
| `docs/` | Product, deployment, Supabase, and usage bridge documentation. |
| `supabase/` | Supabase migrations and database setup notes. |

Root-level files remain only when external tools expect them there, such as `package.json`, `vercel.json`, `.env*`, `index.html`, and the editor-compatible `tsconfig.json` shim.

## 9. Tool Connectors

| Connector | Mode | User-facing? | Status |
| --- | --- | --- | --- |
| Local AI Heuristics | Browser/local | Yes | Built in |
| Browser Local Storage | Browser/local | Yes | Built in |
| Knowledge Search | Server-side API | Yes | Requires provider key |
| Usage Logs Database | Server-side API | Developer/admin | Requires Supabase |
| Markdown Export | Browser/local | Yes | Built in |
| Notion | Future | Optional user connector | Not implemented |
| GitHub | Future | Optional user connector | Not implemented |

## 10. Non-Goals

- Do not expose model/search/database secrets in frontend code.
- Do not present static fallback data as real web search results.
- Do not treat Dev Board as an end-user workflow.
- Do not keep garbled legacy Chinese seed data or demo progress in the default workspace.
- Do not add third-party UI or Markdown dependencies unless necessary.

## 11. Acceptance Criteria

- A new user starts from an empty workspace, not prefilled demo progress.
- Coach Agent is the most prominent Growth page module.
- Growth Map lets the user start a capability-specific task.
- Evidence records can manually adjust capability links.
- Reflection drafts can be edited, previewed, and exported.
- Knowledge Search clearly reports whether live resources are available.
- Usage Bridge reports clear API/fallback errors instead of raw JSON parser errors.
- `npm run build:prod` succeeds.
- `npm test` succeeds.
- The frontend source scan for CJK or mojibake characters returns no matches.

## 12. Near-Term Engineering Priorities

1. Replace local test login with Supabase Auth.
2. Move workspace persistence from `localStorage` to Supabase for production.
3. Add server-side LLM provider adapter for real model calls.
4. Store real provider token usage in `usage_logs`.
5. Add onboarding that helps a new user choose their first capability.
6. Add admin-only gating for Dev Gateway.
7. Add e2e smoke path: login -> start task -> capture note -> generate reflection -> inspect usage log.
