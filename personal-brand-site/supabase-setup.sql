-- ============================================================
-- GoBoardcast 协作白板 — Supabase 一键建表脚本
-- 项目: lifecontinue's Project (id: ghlbpxlyclmgsawfjhqt)
-- 用法: Supabase Dashboard -> SQL Editor -> New query -> 粘贴执行
-- ============================================================

-- 1) 画布表: 每行一块画布, data 存完整序列化 JSON
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  title       text not null default 'Untitled board',
  data        jsonb not null default '{}'::jsonb,
  item_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) 行级安全: 默认拒绝, 只放行本人数据
alter table public.boards enable row level security;

drop policy if exists "boards_select_own" on public.boards;
create policy "boards_select_own" on public.boards
  for select using (auth.uid() = user_id);

drop policy if exists "boards_insert_own" on public.boards;
create policy "boards_insert_own" on public.boards
  for insert with check (auth.uid() = user_id);

drop policy if exists "boards_update_own" on public.boards;
create policy "boards_update_own" on public.boards
  for update using (auth.uid() = user_id);

drop policy if exists "boards_delete_own" on public.boards;
create policy "boards_delete_own" on public.boards
  for delete using (auth.uid() = user_id);

-- 3) 自动刷新 updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_boards_updated_at on public.boards;
create trigger trg_boards_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

-- 4) 索引: 列表按更新时间倒序
create index if not exists boards_user_updated_idx
  on public.boards (user_id, updated_at desc);
