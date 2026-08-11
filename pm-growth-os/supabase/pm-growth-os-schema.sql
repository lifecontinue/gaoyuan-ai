-- PM Growth OS complete Supabase schema.
-- Run this whole file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

-- Usage cost ledger for app-side agents and the VS Code usage bridge.
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

alter table public.usage_logs enable row level security;

drop policy if exists usage_logs_owner_access on public.usage_logs;
create policy usage_logs_owner_access
on public.usage_logs
for all
using (
  user_id = auth.uid()::text
  or user_id = coalesce(auth.jwt() ->> 'email', '')
)
with check (
  user_id = auth.uid()::text
  or user_id = coalesce(auth.jwt() ->> 'email', '')
);

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

-- Product tables.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  capability_ids text[] default '{}',
  tags text[] default '{}'
);

create table if not exists public.capabilities (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  category varchar(50) not null,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  stage_label varchar(20),
  evidence_count integer not null default 0,
  user_id uuid references auth.users(id) on delete cascade,
  constraint capabilities_user_name_unique unique (user_id, name)
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  focus_area varchar(100),
  weekly_goal integer not null default 3 check (weekly_goal > 0),
  long_term_goal text,
  preferred_model varchar(50),
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  capability_id uuid references public.capabilities(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  status varchar(20) not null default 'active'
);

create table if not exists public.coach_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.coach_plans(id) on delete cascade,
  title varchar(200) not null,
  detail text,
  status varchar(20) not null default 'todo',
  step_order integer,
  completed_at timestamptz
);

create index if not exists notes_user_created_idx
  on public.notes (user_id, created_at desc);

create index if not exists notes_capability_ids_idx
  on public.notes using gin (capability_ids);

create index if not exists notes_tags_idx
  on public.notes using gin (tags);

create index if not exists capabilities_user_category_idx
  on public.capabilities (user_id, category);

create index if not exists coach_plans_user_created_idx
  on public.coach_plans (user_id, created_at desc);

create index if not exists coach_steps_plan_order_idx
  on public.coach_steps (plan_id, step_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;
alter table public.capabilities enable row level security;
alter table public.user_profiles enable row level security;
alter table public.coach_plans enable row level security;
alter table public.coach_steps enable row level security;

drop policy if exists notes_owner_access on public.notes;
create policy notes_owner_access
on public.notes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists capabilities_owner_access on public.capabilities;
create policy capabilities_owner_access
on public.capabilities
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_profiles_owner_access on public.user_profiles;
create policy user_profiles_owner_access
on public.user_profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists coach_plans_owner_access on public.coach_plans;
create policy coach_plans_owner_access
on public.coach_plans
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists coach_steps_owner_access on public.coach_steps;
create policy coach_steps_owner_access
on public.coach_steps
for all
using (
  exists (
    select 1
    from public.coach_plans
    where coach_plans.id = coach_steps.plan_id
      and coach_plans.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.coach_plans
    where coach_plans.id = coach_steps.plan_id
      and coach_plans.user_id = auth.uid()
  )
);

-- First-run workspace setup for authenticated users.
create or replace function public.initialize_user_workspace()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'initialize_user_workspace requires an authenticated user';
  end if;

  insert into public.user_profiles (
    id,
    focus_area,
    weekly_goal,
    long_term_goal,
    preferred_model,
    preferences
  )
  values (
    current_user_id,
    'Choose your first focus',
    4,
    'Build a personal operating system for compounding AI PM capability.',
    'Default platform model',
    jsonb_build_object('currentStageLabel', 'New workspace')
  )
  on conflict (id) do nothing;

  insert into public.capabilities (
    user_id,
    name,
    category,
    progress,
    stage_label,
    evidence_count
  )
  values
    (current_user_id, 'Prompt Engineering', 'Skills', 0, 'Not started', 0),
    (current_user_id, 'AI Product Strategy', 'Strategy', 0, 'Not started', 0),
    (current_user_id, 'User Research Synthesis', 'Discovery', 0, 'Not started', 0),
    (current_user_id, 'Context Engineering', 'Skills', 0, 'Not started', 0),
    (current_user_id, 'RAG & Knowledge Systems', 'Knowledge', 0, 'Not started', 0),
    (current_user_id, 'Agent Design', 'Application', 0, 'Not started', 0),
    (current_user_id, 'Tool Orchestration', 'Tooling', 0, 'Not started', 0),
    (current_user_id, 'AI Evaluation', 'Tooling', 0, 'Not started', 0),
    (current_user_id, 'Experimentation & Metrics', 'Evaluation', 0, 'Not started', 0),
    (current_user_id, 'AI Safety & Governance', 'Governance', 0, 'Not started', 0),
    (current_user_id, 'Automation Ops', 'Operations', 0, 'Not started', 0),
    (current_user_id, 'Product Storytelling', 'Growth', 0, 'Not started', 0),
    (current_user_id, 'Multi-Agent Collaboration', 'Application', 0, 'Not started', 0)
  on conflict (user_id, name) do nothing;
end;
$$;

grant execute on function public.initialize_user_workspace() to authenticated;

-- Verification query:
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'usage_logs',
--     'notes',
--     'capabilities',
--     'user_profiles',
--     'coach_plans',
--     'coach_steps'
--   )
-- order by table_name;
