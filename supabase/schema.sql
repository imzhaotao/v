-- Supabase SQL Schema for Story to Video
-- 在 Supabase Dashboard → SQL Editor 里执行
-- 这个脚本既支持首次建表，也支持把旧版本 drafts 表升级到当前代码所需结构。

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

alter table if exists drafts add column if not exists title text;
alter table if exists drafts add column if not exists story_text text;
alter table if exists drafts add column if not exists language text default 'zh';
alter table if exists drafts add column if not exists story_summary jsonb;
alter table if exists drafts add column if not exists scenes jsonb;
alter table if exists drafts add column if not exists generation_meta jsonb;
alter table if exists drafts add column if not exists status text default 'draft';
alter table if exists drafts add column if not exists model_used text;
alter table if exists drafts add column if not exists created_at timestamp with time zone default now();
alter table if exists drafts add column if not exists updated_at timestamp with time zone default now();

-- 如果旧表允许 story_text 为空，这里先补默认值再收紧约束，避免 alter 失败。
update drafts
set story_text = coalesce(story_text, '')
where story_text is null;

alter table drafts alter column story_text set not null;
alter table drafts alter column language set default 'zh';
alter table drafts alter column status set default 'draft';
alter table drafts alter column created_at set default now();
alter table drafts alter column updated_at set default now();

-- 开启 RLS
alter table drafts enable row level security;

-- 公开读写（第一阶段无认证）
drop policy if exists "Allow all access" on drafts;
create policy "Allow all access" on drafts for all using (true) with check (true);

-- 自动更新 updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists drafts_updated_at on drafts;

create trigger drafts_updated_at
  before update on drafts
  for each row execute function update_updated_at();
