# Operator Setup

## Principle

PM Growth OS should launch with platform-managed basics. End users should be able to sign up and use Evidence Capture, Coach, Reflection, Evidence Library, exports, and cost monitoring without bringing their own API keys.

## Baseline Accounts

Create and configure these before public launch:

| Account | Required | Purpose |
| --- | --- | --- |
| Vercel | Yes | Host frontend and API routes. |
| Supabase | Yes | Auth, Postgres, user data, row-level security. |
| OpenAI | Yes | Default Agent model provider. |
| Anthropic | Recommended | Long-context summaries and higher-quality reflection fallback. |
| MCP Memory gateway | Optional for launch | External long-term memory / knowledge connector. |
| Notion/GitHub/Lark | Optional | Later personal or workspace integrations. |

## Environment Variables

Use `.env.production.example` as the deployment checklist. In Vercel, configure these as project environment variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
```

Add these when available:

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
MCP_MEMORY_URL
MCP_MEMORY_TOKEN
```

Do not expose provider secret keys to the browser. All LLM calls must run server-side.

## User Experience Target

After platform setup:

1. User opens the hosted app.
2. User signs up or logs in.
3. User creates evidence records and gets AI suggestions without configuring any model key.
4. User generates Coach plans and Reflection summaries.
5. Cost Monitor records token usage under the platform model provider.
6. Optional connectors show as add-ons, not blockers.

## Connector Policy

| Connector type | Who configures it | User sees |
| --- | --- | --- |
| OpenAI / Anthropic | Platform operator | Available / unavailable status. |
| Supabase Auth/DB | Platform operator | Login and saved cloud data. |
| MCP Memory | Platform operator initially | Available / unavailable status. |
| Markdown export | Built in | Always available. |
| Notion/GitHub/Lark | User or workspace admin later | Optional connection request. |

## Next Implementation Tasks

1. Add Supabase schema migrations.
2. Add Supabase Auth UI.
3. Replace JSON workspace store with Supabase repositories.
4. Move current Node API into deployable Vercel functions or a hosted Node API.
5. Add server-side OpenAI provider adapter.
6. Store real provider token usage in `model_traces`.
7. Add onboarding copy that says AI is included by the platform.
