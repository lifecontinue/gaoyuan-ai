# VS Code Usage Gateway

PM Growth OS should not ask the developer to manually enter token usage. The target flow is:

1. A VS Code/Codex request triggers a model-backed operation.
2. The model provider or VS Code extension returns usage metadata.
3. The gateway maps that metadata to `usage_logs`.
4. DevBoard displays the resulting rows.

Required payload shape:

```json
{
  "user_id": "haidagy@gmail.com",
  "feature": "Knowledge search fix",
  "model": "gpt-5.5",
  "prompt_tokens": 1234,
  "completion_tokens": 567,
  "cost": 0.007213,
  "latency": 4200,
  "created_at": "2026-05-04T10:00:00.000Z"
}
```

Current implementation:

- App-side Agent actions automatically create local `usageLogs`.
- DevBoard renders those logs without manual token input.
- Real VS Code/Codex usage is accepted through `POST /api/usage-logs`.
- DevBoard syncs `GET /api/usage-logs` and merges bridge rows into the usage ledger.
- When Langfuse env vars are configured, the gateway also forwards each usage row as trace/generation events.

## Bridge Endpoint

Local development:

```bash
npm run dev:api
```

Then post usage:

```bash
curl -X POST http://127.0.0.1:8787/api/usage-logs \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "haidagy@gmail.com",
    "feature": "VS Code prompt tuning",
    "model": "gpt-5.5",
    "prompt_tokens": 1200,
    "completion_tokens": 420,
    "cost": 0.0057,
    "latency": 3800
  }'
```

If `VSCODE_USAGE_BRIDGE_TOKEN` is set, include:

```bash
Authorization: Bearer <token>
```

## Node Bridge Script

VS Code tasks, extension hooks, or model proxies can pipe usage metadata into:

```bash
npm run bridge:usage
```

Example:

```bash
echo '{
  "user_id": "haidagy@gmail.com",
  "feature": "Knowledge search fix",
  "model": "gpt-5.5",
  "prompt_tokens": 1234,
  "completion_tokens": 567,
  "cost": 0.007213,
  "latency": 4200
}' | npm run bridge:usage
```

Set `PM_GROWTH_USAGE_BRIDGE_URL` when posting to production:

```bash
PM_GROWTH_USAGE_BRIDGE_URL=https://your-app.vercel.app/api/usage-logs npm run bridge:usage
```

Production behavior:

- `api/usage-logs.js` inserts rows into Supabase `public.usage_logs`.
- Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Optional `VSCODE_USAGE_BRIDGE_TOKEN` protects writes.
- Optional Langfuse tracing uses `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_BASE_URL`.
