-- Therapeia OS · knowledge base (kb/ files -> kb_sections)
-- One row per "## id: title" section of kb/*.md. Light retrieval = Postgres full-text search
-- (always in sync with the text, no embeddings to rebuild). Every edit keeps the old version.

create table if not exists kb_sections (
  client_id  uuid not null references clients(id) on delete cascade,
  id         text not null,                      -- e.g. anat.rehook
  file       text not null,                      -- e.g. carousel/anatomy.md
  title      text not null,
  agents     text[] not null default '{}',       -- brain, copy, critic, compliance, art, image, design_critic, watcher
  edit       text not null default 'learn' check (edit in ('locked','learn','owner','retired')),
  body       text not null,
  version    int  not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'sync',
  file_md5   text,                               -- md5 of the file text at last sync; lets approved DB edits survive a re-sync
  tsv tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored,
  primary key (client_id, id)
);
create index if not exists kb_sections_tsv on kb_sections using gin (tsv);
create index if not exists kb_sections_agents on kb_sections using gin (agents);

create table if not exists kb_history (
  client_id uuid not null, id text not null, version int not null,
  body text not null, title text, agents text[], edit text,
  updated_by text, replaced_at timestamptz not null default now(),
  primary key (client_id, id, version)
);

create or replace function kb_keep_history() returns trigger language plpgsql as $f$
begin
  if new.body is distinct from old.body or new.agents is distinct from old.agents or new.edit is distinct from old.edit or new.title is distinct from old.title then
    insert into kb_history (client_id, id, version, body, title, agents, edit, updated_by)
    values (old.client_id, old.id, old.version, old.body, old.title, old.agents, old.edit, old.updated_by)
    on conflict do nothing;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $f$;
drop trigger if exists t_kb_history on kb_sections;
create trigger t_kb_history before update on kb_sections for each row execute function kb_keep_history();

-- Proposed edits from the learning loop / Deep's repeated feedback. Nothing goes live until approved.
create table if not exists kb_changes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  section_id  text not null,
  base_version int,                               -- version the proposal was written against
  new_body    text not null,
  reason      text not null,
  evidence    jsonb not null default '{}'::jsonb, -- feedback ids, post ids, metrics
  source      text not null default 'learning_loop' check (source in ('learning_loop','deep_feedback','manual')),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','applied','stale')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  text
);
create index if not exists kb_changes_pending on kb_changes (client_id, status);

-- Fetch exact sections by id (what agents use 99% of the time).
create or replace function kb_get(p_client uuid, p_ids text[])
returns table (id text, title text, body text, version int) language sql stable as $f$
  select s.id, s.title, s.body, s.version from kb_sections s
  where s.client_id = p_client and s.id = any(p_ids) and s.edit <> 'retired'
  order by array_position(p_ids, s.id);
$f$;

-- Light retrieval: keyword search across sections an agent may read.
create or replace function kb_search(p_client uuid, p_agent text, p_query text, p_limit int default 5)
returns table (id text, file text, title text, body text, rank real) language sql stable as $f$
  select s.id, s.file, s.title, s.body, ts_rank(s.tsv, q) as rank
  from kb_sections s, websearch_to_tsquery('english', p_query) q
  where s.client_id = p_client and s.edit <> 'retired'
    and (p_agent is null or p_agent = any(s.agents)) and s.tsv @@ q
  order by rank desc limit greatest(1, least(p_limit, 20));
$f$;

-- Apply an approved proposal. Locked sections can never be changed this way; a proposal
-- written against an older version is marked stale instead of overwriting newer text.
create or replace function os_apply_kb_change(p_change uuid, p_by text default 'owner')
returns text language plpgsql security definer set search_path = public as $f$
declare c kb_changes; s kb_sections;
begin
  select * into c from kb_changes where id = p_change for update;
  if not found then return 'not_found'; end if;
  if c.status not in ('pending','approved') then return 'already_' || c.status; end if;
  if os_role(c.client_id) is null and current_user not in ('postgres','service_role') then raise exception 'not allowed'; end if;
  select * into s from kb_sections where client_id = c.client_id and id = c.section_id;
  if not found then return 'section_missing'; end if;
  if s.edit = 'locked' then
    update kb_changes set status = 'rejected', decided_at = now(), decided_by = 'locked' where id = c.id;
    return 'locked';
  end if;
  if c.base_version is not null and c.base_version <> s.version then
    update kb_changes set status = 'stale', decided_at = now(), decided_by = p_by where id = c.id;
    return 'stale';
  end if;
  update kb_sections set body = c.new_body, updated_by = 'change:' || c.id where client_id = c.client_id and id = c.section_id;
  update kb_changes set status = 'applied', decided_at = now(), decided_by = p_by where id = c.id;
  return 'applied';
end $f$;

create or replace function os_reject_kb_change(p_change uuid, p_by text default 'owner')
returns text language plpgsql security definer set search_path = public as $f$
declare c kb_changes;
begin
  select * into c from kb_changes where id = p_change;
  if not found then return 'not_found'; end if;
  if os_role(c.client_id) is null and current_user not in ('postgres','service_role') then raise exception 'not allowed'; end if;
  update kb_changes set status = 'rejected', decided_at = now(), decided_by = p_by where id = p_change and status = 'pending';
  return 'rejected';
end $f$;

alter table kb_sections enable row level security;
alter table kb_history  enable row level security;
alter table kb_changes  enable row level security;
drop policy if exists kb_sections_read on kb_sections;
create policy kb_sections_read on kb_sections for select using (os_role(client_id) is not null);
drop policy if exists kb_history_read on kb_history;
create policy kb_history_read on kb_history for select using (os_role(client_id) is not null);
drop policy if exists kb_changes_read on kb_changes;
create policy kb_changes_read on kb_changes for select using (os_role(client_id) is not null);
grant execute on function os_apply_kb_change(uuid, text), os_reject_kb_change(uuid, text) to authenticated;
