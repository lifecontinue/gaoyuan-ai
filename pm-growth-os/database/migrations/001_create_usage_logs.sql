-- PM Growth OS usage cost ledger.
-- Compatible with Postgres, Supabase Postgres, Neon, and other Postgres-compatible databases.

create extension if not exists pgcrypto;

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  feature text not null,
  model text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  cost numeric(12, 8) not null default 0 check (cost >= 0),
  latency integer not null default 0 check (latency >= 0),
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_user_created_idx
  on public.usage_logs (user_id, created_at desc);

create index if not exists usage_logs_feature_created_idx
  on public.usage_logs (feature, created_at desc);

create index if not exists usage_logs_model_created_idx
  on public.usage_logs (model, created_at desc);

create index if not exists usage_logs_created_at_idx
  on public.usage_logs (created_at desc);

create or replace view public.usage_cost_by_feature as
select
  feature,
  model,
  count(*) as calls,
  sum(prompt_tokens) as prompt_tokens,
  sum(completion_tokens) as completion_tokens,
  sum(cost) as cost,
  avg(latency) as avg_latency,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from public.usage_logs
group by feature, model;
