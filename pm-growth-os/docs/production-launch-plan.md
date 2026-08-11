# PM Growth OS Production Launch Plan

## Goal

Ship PM Growth OS as a real multi-user web product, not a local demo. The production version should support accounts, cloud persistence, real LLM calls, token/cost tracing, export, and optional external tool connections.

The default launch posture is platform-managed: ordinary users should not need to bring their own OpenAI, Anthropic, Supabase, or MCP credentials. The operator configures baseline services once, and users consume the product directly after login.

## Recommended Stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Frontend hosting | Vercel | Best fit for Vite/React deployment, preview deployments, environment variables, and serverless API routes. |
| Backend runtime | Vercel Functions first | Lowest-friction path from current Node API. Migrate to a long-running service only if queues/MCP sessions require it. |
| Database | Supabase Postgres | Multi-user persistence, relational data, SQL visibility, and Row Level Security. |
| Auth | Supabase Auth | Email/social auth, user identity, and direct coupling with database policies. |
| LLM layer | Server-side provider adapter | Keep API keys off the client; start with OpenAI and Anthropic behind one interface. |
| Tool connections | Connector registry + MCP/account adapters | Keep integrations optional and progressively connected. |
| Observability | App traces table + Vercel logs | Continue token/cost traces, then add error and latency dashboards. |

## Product Architecture

```text
Browser
  -> Vercel React app
  -> Vercel API routes
  -> Supabase Auth
  -> Supabase Postgres
  -> LLM provider adapter
  -> Optional MCP / Notion / GitHub / Lark connectors
```

## Production Data Model

Start with these tables:

| Table | Purpose |
| --- | --- |
| `profiles` | User settings, stage, preferred model, weekly goal. |
| `capabilities` | Canonical AI PM skill graph. |
| `user_capabilities` | Per-user progress, stage, evidence count. |
| `notes` | Saved Evidence Capture records. |
| `note_capabilities` | Many-to-many note to capability links. |
| `coach_plans` | Generated exploration plans and step status. |
| `reflection_drafts` | Weekly/monthly generated summaries. |
| `model_traces` | Prompt/completion tokens, provider usage, cost, latency, request ids. |
| `tool_connectors` | Per-user connector status and non-secret metadata. |

Secrets should not be stored in `tool_connectors`. Use environment variables for platform-owned keys, and a secret store/OAuth flow for user-owned connections.

## Backend Migration Plan

1. Convert `server/index.mjs` endpoints into Vercel API route handlers.
2. Replace `data/workspace.json` with Supabase queries.
3. Add Supabase Auth session handling to each API route.
4. Scope every query by `user_id`.
5. Move local rule-based Agent logic behind provider adapters.
6. Keep local fallback mode for development and demos.

## LLM Provider Plan

Create a server-side `modelProvider` interface:

```ts
type ModelRequest = {
  agent: string;
  operation: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  maxOutputTokens?: number;
};

type ModelResult = {
  text: string;
  model: string;
  provider: 'openai' | 'anthropic' | 'local';
  promptTokens: number;
  completionTokens: number;
  requestId?: string;
};
```

Initial route mapping:

| Agent | Default provider | Fallback |
| --- | --- | --- |
| Evidence Capture | OpenAI small model | Local rule classifier |
| Coach Agent | OpenAI or Claude | Template generator |
| Reflection Agent | Claude/OpenAI long-context | Template generator |
| Evaluation | OpenAI judge model | Manual score |

## Connector Plan

| Connector | Release priority | Who configures it |
| --- | --- | --- |
| OpenAI | P0 | Platform operator sets `OPENAI_API_KEY` in Vercel env. |
| Supabase | P0 | Platform operator sets Supabase URL, anon key, service role key. |
| Markdown export | P0 | Built in, no external account. |
| Anthropic | P1 | Platform operator sets `ANTHROPIC_API_KEY` in Vercel env. |
| MCP Memory | P1 | Platform operator configures hosted MCP gateway. |
| Notion | P2 | Optional user/workspace integration. |
| GitHub | P2 | Optional user/workspace integration or platform MCP. |
| Lark/Feishu | P2 | Optional user/workspace integration. |

## Release Milestones

### Milestone 1: Cloud MVP

- Vercel deployment.
- Supabase Auth.
- Supabase persistence for profiles, evidence records, capabilities, traces.
- Existing UI works for multiple users.
- Server-side local Agent fallback remains available.

### Milestone 2: Real Agent MVP

- OpenAI provider adapter.
- Real usage tokens stored in `model_traces`.
- Evidence Capture/Coach/Reflection use real models when configured.
- Cost Monitor switches from estimated usage to provider usage when available.

### Milestone 3: Collaboration-Ready

- Export improvements: Markdown and PDF.
- Notion or Lark export connector.
- Admin/debug trace view.
- Basic onboarding and invite flow.

### Milestone 4: Tool Ecosystem

- MCP memory connector.
- GitHub connector for project evidence.
- Template market for reports and retrospectives.
- Ability assessment module.

## Immediate Engineering Tasks

1. Add Supabase project and schema migrations.
2. Add auth UI and session state.
3. Replace JSON store with Supabase repository functions.
4. Add server-side LLM provider adapter.
5. Add deployment config and Vercel env setup guide.
6. Add seed script for capability graph.
7. Add e2e smoke test for signup -> evidence -> reflection -> cost trace.

## Accounts And Credentials Needed

You should prepare:

- Vercel account.
- Supabase account and project.
- OpenAI API key.
- Optional Anthropic API key.
- Optional Notion integration.
- Optional GitHub token or MCP GitHub server.
- Optional Lark/Feishu open platform app.

## Production Acceptance Criteria

- A new user can sign up, save evidence, see only their own data, and generate a weekly summary.
- LLM keys are never exposed to the browser.
- Every real model call records provider, model, token usage, cost, latency, status, and operation.
- Deleting an evidence record updates capability progress and evidence counts.
- App can be deployed from a clean clone using documented env variables.
- Basic errors are visible in UI and server logs.
