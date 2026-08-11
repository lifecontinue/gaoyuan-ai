# Usage Logs Database

PM Growth OS tracks model and gateway usage with a `usage_logs` table. This table is designed for Postgres-compatible databases and can be analyzed with open-source Metabase.

## Table

Run this migration:

```bash
database/migrations/001_create_usage_logs.sql
```

Columns:

| Column | Meaning |
| --- | --- |
| `id` | Primary key |
| `user_id` | User |
| `feature` | Triggered feature |
| `model` | Model |
| `prompt_tokens` | Input tokens |
| `completion_tokens` | Output tokens |
| `cost` | Cost in USD |
| `latency` | Latency in milliseconds |
| `created_at` | Event time |

## Metabase Setup

1. Create a Postgres-compatible database, for example Supabase, Neon, Railway Postgres, or local Postgres.
2. Apply `database/migrations/001_create_usage_logs.sql`.
3. Start Metabase and connect it to the same database.
4. Build dashboards from `usage_logs` and the helper view `usage_cost_by_feature`.

Recommended charts:

- Cost by feature over time
- Prompt tokens vs completion tokens
- Cost by model
- Average latency by feature
- Daily usage by user

## Current Product Behavior

The static frontend keeps `usageLogs` in localStorage with the same field names as the database table. Usage rows are generated automatically from instrumented app-side Agent calls, such as capture inference, coach planning, knowledge enrichment, and reflection generation.

Dev Gateway can export those rows as JSON. When a server database connector is added, the same payload can be inserted directly into `public.usage_logs`.

VS Code/Codex extension usage cannot be read by the browser directly. The implemented bridge is `POST /api/usage-logs`; VS Code tasks, extension hooks, or model proxies can send real `prompt_tokens`, `completion_tokens`, `model`, `cost`, and `latency` to that endpoint. DevBoard syncs the bridge via `GET /api/usage-logs`.
