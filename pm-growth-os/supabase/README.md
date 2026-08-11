# Supabase SQL Files

These files are local migration files. They do not create tables in your remote
Supabase project until you run them in Supabase.

Fast path:

1. Open Supabase Dashboard.
2. Go to SQL Editor.
3. Paste and run `pm-growth-os-schema.sql`.
4. Open Table Editor and confirm the tables exist.

Expected tables:

- `usage_logs`
- `notes`
- `capabilities`
- `user_profiles`
- `coach_plans`
- `coach_steps`

Expected view:

- `usage_cost_by_feature`

Run these files in order in the Supabase SQL Editor, or keep them as Supabase CLI migrations:

1. `migrations/202605040001_create_usage_logs.sql`
2. `migrations/202605040002_create_product_tables.sql`
3. `migrations/202605040003_create_workspace_init_function.sql`

What they create:

- `usage_logs`
- `usage_cost_by_feature`
- `notes`
- `capabilities`
- `user_profiles`
- `coach_plans`
- `coach_steps`
- RLS policies for user-owned data
- `initialize_user_workspace()` RPC for first-run workspace setup

Important schema choice:

`capabilities.user_id` is not unique by itself because each user needs multiple Growth Map capabilities. The migration uses `unique(user_id, name)` instead.

Environment status:

The app also needs Supabase connection values before it can read or write remote
data:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep real values in local `.env` or Vercel environment variables only. Do not
commit real keys.
