-- Initializes a new user's profile and default Growth Map capabilities.

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
