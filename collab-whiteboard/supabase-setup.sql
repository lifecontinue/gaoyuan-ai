-- =============================================================
--  素白板 · Supabase 后端初始化脚本
--  在 Supabase 控制台 → SQL Editor → New query 里整段执行一次即可。
--  执行完成后到 Settings → API 复制 Project URL 与 anon public key，
--  填进白板右上角「账户 → 云端配置」。
-- =============================================================

-- ---------- 1. 画布表 ----------
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '未命名画布',
  data        jsonb not null default '{}'::jsonb,   -- 整份画布快照
  item_count  int  not null default 0,              -- 冗余计数，列表页免解析 data
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 列表查询走 (user_id, updated_at desc)
create index if not exists boards_user_updated_idx
  on public.boards (user_id, updated_at desc);

-- ---------- 2. updated_at 自动维护 ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_touch_updated_at on public.boards;
create trigger boards_touch_updated_at
  before update on public.boards
  for each row execute function public.touch_updated_at();

-- ---------- 3. 行级安全：每个用户只能看见/操作自己的画布 ----------
alter table public.boards enable row level security;

drop policy if exists "boards_select_own" on public.boards;
create policy "boards_select_own" on public.boards
  for select using (auth.uid() = user_id);

drop policy if exists "boards_insert_own" on public.boards;
create policy "boards_insert_own" on public.boards
  for insert with check (auth.uid() = user_id);

drop policy if exists "boards_update_own" on public.boards;
create policy "boards_update_own" on public.boards
  for update using (auth.uid() = user_id)
          with check (auth.uid() = user_id);

drop policy if exists "boards_delete_own" on public.boards;
create policy "boards_delete_own" on public.boards
  for delete using (auth.uid() = user_id);

-- ---------- 4. 让 user_id 默认取当前登录用户（前端可不传） ----------
alter table public.boards
  alter column user_id set default auth.uid();


-- =============================================================
--  控制台还需要做的两步（SQL 之外）
-- =============================================================
--
--  A. Authentication → Providers → Email
--     · 打开 "Enable Email provider"
--     · 打开 "Enable Email OTP / Magic Link"
--     · 建议关闭 "Confirm email"（魔法链接本身就完成了邮箱验证）
--
--  B. Authentication → URL Configuration
--     · Site URL 填你实际访问白板的地址，例如 http://localhost:5173
--     · Redirect URLs 里把同一地址再加一条（支持通配，如 http://localhost:*/**）
--
--  重要：魔法链接的回调无法送达 file:// 页面，必须通过 http(s) 打开白板。
--  本地起服务任选其一：
--     npx serve .
--     python -m http.server 5173
-- =============================================================
