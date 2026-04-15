-- Supabase SQL Schema for Story to Video
-- 在 Supabase Dashboard → SQL Editor 里执行

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  title text,
  story_text text not null,
  language text default 'zh',
  story_summary jsonb,
  scenes jsonb,
  generation_meta jsonb,
  status text default 'draft',
  model_used text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 开启 RLS
alter table drafts enable row level security;

-- 公开读写（第一阶段无认证）
create policy "Allow all access" on drafts for all using (true) with check (true);

-- 自动更新 updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger drafts_updated_at
  before update on drafts
  for each row execute function update_updated_at();
