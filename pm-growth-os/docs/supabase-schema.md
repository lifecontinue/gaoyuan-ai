# Supabase Product Schema

Run `database/migrations/002_create_supabase_product_tables.sql` in the Supabase SQL Editor to create the product tables:

- `notes`
- `capabilities`
- `user_profiles`
- `coach_plans`
- `coach_steps`

The migration also adds indexes, update triggers, and Row Level Security policies so each signed-in user can only access their own rows.

## Notes

Product UI now refers to rows in `notes` as evidence records. The table name remains `notes` for schema stability.

The requested `capabilities.user_id unique` constraint was changed to `unique(user_id, name)`. A single user needs multiple capability rows for the Growth Map, so making `user_id` unique would only allow one capability per user.

`coach_steps` access is controlled through its parent `coach_plans.user_id`.
