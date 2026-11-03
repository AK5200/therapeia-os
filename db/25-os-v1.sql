-- Therapeia Zoi OS · v1 foundations (Supabase project weshvnbovvzucjxymllc)
-- Adds: members + login access, settings, generic approvals queue, actions bus, events log,
-- post scheduling/publish columns, a flat post view for the dashboard, and the RPCs the dashboard calls.
-- The browser only READS through row-level security and WRITES through the os_* functions below.
-- n8n keeps full access through the postgres role, as today. Nothing existing is dropped.
-- Review first; then run once in SQL Editor (or through the admin SQL runner).

begin;

-- =========================================================
-- 1. Members (who can open the OS for a client). "clients" stays the org/tenant table.
-- =========================================================
create table if not exists public.os_members (
  client_id  uuid not null references public.clients(id) on delete cascade,
  email      text not null,
  role       text not null default 'editor' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (client_id, email)
);
create unique index if not exists os_members_email_ci on public.os_members (client_id, lower(email));

create or replace function public.os_role(p_client uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.os_members
  where client_id = p_client and lower(email) = lower(coalesce(auth.email(), ''))
  limit 1
$$;
create or replace function public.os_is_member(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.os_role(p_client) is not null
$$;
create or replace function public.os_can_edit(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.os_role(p_client) in ('owner','admin','editor'), false)
$$;

-- =========================================================
-- 2. Settings (one row per client)
-- =========================================================
create table if not exists public.os_settings (
  client_id     uuid primary key references public.clients(id) on delete cascade,
  auto_mode     text not null default 'manual' check (auto_mode in ('manual','trust','paused')),
  trust_hours   integer not null default 12 check (trust_hours between 1 and 72),
  post_times    text[] not null default '{09:00}',          -- local times in clients.timezone
  platforms     jsonb  not null default '{"instagram": true, "tiktok": true, "youtube": true}',
  provider      text   not null default 'blotato' check (provider in ('blotato','postiz','none')),
  publish_mode  text   not null default 'manual' check (publish_mode in ('manual','auto')),  -- 'auto' = production switch (Blotato)
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- =========================================================
-- 3. Posts: new columns + wider status list
-- =========================================================
alter table public.content_ledger
  add column if not exists approved_at      timestamptz,
  add column if not exists approved_by      text,
  add column if not exists review_note      text,
  add column if not exists publish_results  jsonb,          -- { instagram: {status, url, id, error, at}, tiktok: {...} }
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists revision         integer not null default 0;

alter table public.content_ledger drop constraint if exists content_ledger_status_check;
alter table public.content_ledger add constraint content_ledger_status_check check (status = any (array[
  'planned','drafted','in_review','changes_requested','approved','scheduled','publishing','published','rejected','failed'
]));
create index if not exists idx_ledger_due on public.content_ledger (scheduled_for) where status = 'scheduled';

alter table public.feedback_log drop constraint if exists feedback_log_source_check;
alter table public.feedback_log add constraint feedback_log_source_check
  check (source = any (array['telegram','judge','system','dashboard']));

-- =========================================================
-- 4. Approvals: one queue for anything a human must OK (posts now; agent actions later)
-- =========================================================
create table if not exists public.approvals (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  kind            text not null,                 -- 'post_publish' | later: 'prompt_update', 'ad_launch', 'budget_change', ...
  ref_table       text,
  ref_id          uuid,
  title           text,
  summary         text,
  payload         jsonb,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected','changes_requested','expired','cancelled')),
  auto_approve_at timestamptz,                   -- set in trust mode; n8n approves when due unless decided
  decided_by      text,
  decided_at      timestamptz,
  note            text,
  created_at      timestamptz not null default now()
);
create unique index if not exists approvals_one_pending on public.approvals (ref_table, ref_id) where status = 'pending';
create index if not exists approvals_client_status on public.approvals (client_id, status, created_at desc);

-- =========================================================
-- 5. Actions bus (work requested by the UI or agents; n8n / agent service picks it up)
-- =========================================================
create table if not exists public.actions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  type         text not null,                    -- 'regenerate_post', 'publish_now', ...
  ref_table    text,
  ref_id       uuid,
  payload      jsonb,
  status       text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  source       text not null default 'ui' check (source in ('ui','agent','n8n','system')),
  requested_by text,
  result       jsonb,
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists actions_queue on public.actions (status, created_at) where status = 'queued';

-- =========================================================
-- 6. Events log (audit trail + raw material for analytics and learning)
-- =========================================================
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  actor      text,                               -- email, 'n8n', 'agent:<name>'
  type       text not null,                      -- 'post.approved', 'post.published', 'settings.updated', ...
  ref_table  text,
  ref_id     uuid,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_client_time on public.events (client_id, created_at desc);

-- =========================================================
-- 7. Auto-create a pending approval whenever a post reaches in_review
-- =========================================================
create or replace function public.os_on_ledger_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.os_settings;
begin
  if new.status = 'in_review' and (tg_op = 'INSERT' or old.status is distinct from 'in_review') then
    select * into s from public.os_settings where client_id = new.client_id;
    insert into public.approvals (client_id, kind, ref_table, ref_id, title, summary, auto_approve_at)
    values (new.client_id, 'post_publish', 'content_ledger', new.id,
            coalesce(new.slides->'slides'->0->>'headline', new.angle, 'New post'),
            new.angle,
            case when s.auto_mode = 'trust' then now() + make_interval(hours => s.trust_hours) end)
    on conflict do nothing;
    insert into public.events (client_id, actor, type, ref_table, ref_id)
    values (new.client_id, 'n8n', 'post.ready_for_review', 'content_ledger', new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
        and new.status in ('published','failed','publishing') then
    insert into public.events (client_id, actor, type, ref_table, ref_id, data)
    values (new.client_id, 'n8n', 'post.' || new.status, 'content_ledger', new.id, new.publish_results);
  end if;
  return new;
end $$;
drop trigger if exists trg_ledger_status on public.content_ledger;
create trigger trg_ledger_status after insert or update of status on public.content_ledger
  for each row execute function public.os_on_ledger_status();

-- =========================================================
-- 8. Flat post view for the dashboard (RLS of the caller applies)
-- =========================================================
create or replace view public.v_os_posts with (security_invoker = on) as
select
  c.id, c.client_id, c.status, c.format, c.funnel_stage, c.pillar, c.hook_type, c.mood, c.angle,
  c.created_at, c.updated_at, c.scheduled_for, c.published_at, c.approved_at, c.approved_by,
  c.review_note, c.publish_results, c.publish_attempts, c.metrics,
  coalesce((select array_agg(s->>'ig_url' order by (s->>'n')::int) from jsonb_array_elements(c.slides->'plan'->'slides') s where s->>'ig_url' is not null), '{}') as ig_slides,
  coalesce((select array_agg(s->>'tt_url' order by (s->>'n')::int) from jsonb_array_elements(c.slides->'plan'->'slides') s where s->>'tt_url' is not null), '{}') as tt_slides,
  c.slides->>'caption_instagram' as caption_instagram,
  c.slides->>'caption_tiktok'    as caption_tiktok,
  c.slides->'hashtags_instagram' as hashtags_instagram,
  c.slides->'hashtags_tiktok'    as hashtags_tiktok,
  c.slides->>'alt_text'          as alt_text,
  c.slides->'plan'->>'look'      as look,
  (c.slides->'plan'->'critic'->-1->>'verdict') as critic_verdict,
  (c.slides->'plan'->'critic'->-1->>'summary') as critic_summary,
  c.compliance->>'verdict'       as compliance_verdict,
  coalesce((c.compliance->>'flagged')::boolean, false) as compliance_flagged,
  (select a.auto_approve_at from public.approvals a where a.ref_id = c.id and a.status = 'pending' limit 1) as auto_approve_at
from public.content_ledger c;

-- =========================================================
-- 9. Next free posting slot (client timezone, settings.post_times)
-- =========================================================
create or replace function public.os_next_slot(p_client uuid, p_after timestamptz default now())
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare tz text; times text[]; d date; t text; slot timestamptz;
begin
  select coalesce(timezone, 'America/New_York') into tz from public.clients where id = p_client;
  select coalesce(post_times, '{09:00}') into times from public.os_settings where client_id = p_client;
  times := coalesce(times, '{09:00}');
  for i in 0..90 loop
    d := (p_after at time zone tz)::date + i;
    foreach t in array times loop
      slot := (d::text || ' ' || t)::timestamp at time zone tz;
      continue when slot <= p_after + interval '15 minutes';
      if not exists (select 1 from public.content_ledger
                     where client_id = p_client and status in ('scheduled','publishing','published')
                       and scheduled_for = slot) then
        return slot;
      end if;
    end loop;
  end loop;
  return p_after + interval '1 day';
end $$;

-- =========================================================
-- 10. Dashboard RPCs (all check membership; all write an event)
-- =========================================================
create or replace function public.os_decide_post(p_post uuid, p_decision text, p_note text default null, p_when timestamptz default null)
returns public.content_ledger language plpgsql security definer set search_path = public as $$
declare r public.content_ledger; who text := auth.email(); slot timestamptz;
begin
  select * into r from public.content_ledger where id = p_post for update;
  if r.id is null then raise exception 'Post not found'; end if;
  if not public.os_can_edit(r.client_id) then raise exception 'You do not have permission to review posts'; end if;
  if r.status not in ('in_review','changes_requested','scheduled','failed') then
    raise exception 'This post is % and cannot be reviewed', r.status;
  end if;

  if p_decision = 'approve' then
    slot := coalesce(p_when, r.scheduled_for, public.os_next_slot(r.client_id));
    update public.content_ledger set status = 'scheduled', scheduled_for = slot, approved_at = now(),
           approved_by = who, review_note = coalesce(p_note, review_note), updated_at = now()
     where id = p_post returning * into r;
    update public.approvals set status = 'approved', decided_by = who, decided_at = now(), note = p_note
     where ref_id = p_post and status = 'pending';
  elsif p_decision = 'changes' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Tell the AI what to change'; end if;
    update public.content_ledger set status = 'changes_requested', review_note = p_note, scheduled_for = null, updated_at = now()
     where id = p_post returning * into r;
    update public.approvals set status = 'changes_requested', decided_by = who, decided_at = now(), note = p_note
     where ref_id = p_post and status = 'pending';
    insert into public.actions (client_id, type, ref_table, ref_id, payload, requested_by)
    values (r.client_id, 'regenerate_post', 'content_ledger', p_post, jsonb_build_object('note', p_note), who);
    insert into public.feedback_log (client_id, ledger_id, source, feedback) values (r.client_id, p_post, 'dashboard', p_note);
  elsif p_decision = 'unschedule' then
    if r.status <> 'scheduled' then raise exception 'Only scheduled posts can be pulled back'; end if;
    update public.content_ledger set status = 'in_review', scheduled_for = null, approved_at = null, approved_by = null, updated_at = now()
     where id = p_post returning * into r;   -- trigger re-opens a pending approval
  elsif p_decision = 'reject' then
    update public.content_ledger set status = 'rejected', review_note = p_note, scheduled_for = null, updated_at = now()
     where id = p_post returning * into r;
    update public.approvals set status = 'rejected', decided_by = who, decided_at = now(), note = p_note
     where ref_id = p_post and status = 'pending';
    if p_note is not null then
      insert into public.feedback_log (client_id, ledger_id, source, feedback) values (r.client_id, p_post, 'dashboard', 'Rejected: ' || p_note);
    end if;
  else
    raise exception 'Unknown decision %', p_decision;
  end if;

  insert into public.events (client_id, actor, type, ref_table, ref_id, data)
  values (r.client_id, who, 'post.' || p_decision, 'content_ledger', p_post,
          jsonb_build_object('note', p_note, 'scheduled_for', r.scheduled_for));
  return r;
end $$;

create or replace function public.os_update_post(p_post uuid, p_caption_ig text default null, p_caption_tt text default null, p_when timestamptz default null)
returns public.content_ledger language plpgsql security definer set search_path = public as $$
declare r public.content_ledger; who text := auth.email();
begin
  select * into r from public.content_ledger where id = p_post for update;
  if r.id is null then raise exception 'Post not found'; end if;
  if not public.os_can_edit(r.client_id) then raise exception 'You do not have permission to edit posts'; end if;
  if r.status not in ('in_review','changes_requested','scheduled','failed') then
    raise exception 'This post is % and cannot be edited', r.status;
  end if;
  if p_when is not null and p_when < now() then raise exception 'Pick a time in the future'; end if;
  update public.content_ledger set
    slides = case when p_caption_ig is null then slides else jsonb_set(slides, '{caption_instagram}', to_jsonb(p_caption_ig)) end,
    scheduled_for = case when p_when is not null and status = 'scheduled' then p_when else scheduled_for end,
    updated_at = now()
  where id = p_post returning * into r;
  if p_caption_tt is not null then
    update public.content_ledger set slides = jsonb_set(slides, '{caption_tiktok}', to_jsonb(p_caption_tt))
    where id = p_post returning * into r;
  end if;
  insert into public.events (client_id, actor, type, ref_table, ref_id, data)
  values (r.client_id, who, 'post.edited', 'content_ledger', p_post,
          jsonb_build_object('caption_ig', p_caption_ig is not null, 'caption_tt', p_caption_tt is not null, 'when', p_when));
  return r;
end $$;

create or replace function public.os_retry_publish(p_post uuid)
returns public.content_ledger language plpgsql security definer set search_path = public as $$
declare r public.content_ledger; who text := auth.email();
begin
  select * into r from public.content_ledger where id = p_post for update;
  if r.id is null then raise exception 'Post not found'; end if;
  if not public.os_can_edit(r.client_id) then raise exception 'You do not have permission to publish'; end if;
  if r.status <> 'failed' or r.approved_at is null then raise exception 'Only approved posts that failed to publish can be retried'; end if;
  update public.content_ledger set status = 'scheduled', scheduled_for = now(), updated_at = now()
   where id = p_post returning * into r;
  insert into public.events (client_id, actor, type, ref_table, ref_id) values (r.client_id, who, 'post.retry', 'content_ledger', p_post);
  return r;
end $$;

create or replace function public.os_save_settings(p_client uuid, p jsonb)
returns public.os_settings language plpgsql security definer set search_path = public as $$
declare r public.os_settings; who text := auth.email();
begin
  if coalesce(public.os_role(p_client) in ('owner','admin'), false) is false then
    raise exception 'Only owners and admins can change settings';
  end if;
  insert into public.os_settings (client_id) values (p_client) on conflict do nothing;
  update public.os_settings set
    auto_mode   = coalesce(p->>'auto_mode', auto_mode),
    trust_hours = coalesce((p->>'trust_hours')::int, trust_hours),
    post_times  = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'post_times') x), post_times),
    platforms   = coalesce(p->'platforms', platforms),
    provider    = coalesce(p->>'provider', provider),
    publish_mode = coalesce(p->>'publish_mode', publish_mode),
    updated_at  = now(), updated_by = who
  where client_id = p_client returning * into r;
  insert into public.events (client_id, actor, type, data) values (p_client, who, 'settings.updated', p);
  return r;
end $$;

revoke all on function public.os_decide_post(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.os_update_post(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.os_retry_publish(uuid) from public, anon;
revoke all on function public.os_save_settings(uuid, jsonb) from public, anon;
revoke all on function public.os_next_slot(uuid, timestamptz) from public, anon;
grant execute on function public.os_decide_post(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.os_update_post(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.os_retry_publish(uuid) to authenticated;
grant execute on function public.os_save_settings(uuid, jsonb) to authenticated;
grant execute on function public.os_next_slot(uuid, timestamptz) to authenticated;

-- =========================================================
-- 11. Row-level security: members may READ their client's data; no direct writes from the browser
-- =========================================================
alter table public.os_members  enable row level security;
alter table public.os_settings enable row level security;
alter table public.approvals   enable row level security;
alter table public.actions     enable row level security;
alter table public.events      enable row level security;

drop policy if exists os_read on public.clients;          create policy os_read on public.clients          for select to authenticated using (public.os_is_member(id));
drop policy if exists os_read on public.products;         create policy os_read on public.products         for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.content_ledger;   create policy os_read on public.content_ledger   for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.competitor_posts; create policy os_read on public.competitor_posts for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.os_settings;      create policy os_read on public.os_settings      for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.approvals;        create policy os_read on public.approvals        for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.actions;          create policy os_read on public.actions          for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.events;           create policy os_read on public.events           for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read_self on public.os_members;  create policy os_read_self on public.os_members  for select to authenticated using (lower(email) = lower(coalesce(auth.email(), '')));

-- =========================================================
-- 12. Seed: settings + members (EDIT the emails before running)
-- =========================================================
insert into public.os_settings (client_id) values ('3034c840-dfc2-4c85-b949-bc8d4fd69208') on conflict do nothing;
insert into public.os_members (client_id, email, role) values
  ('3034c840-dfc2-4c85-b949-bc8d4fd69208', 'anupam@saltpilot.com', 'owner')
  , ('3034c840-dfc2-4c85-b949-bc8d4fd69208', 'therapeia.social@gmail.com', 'admin')
on conflict do nothing;

-- Back-fill: posts already waiting for review get a pending approval
insert into public.approvals (client_id, kind, ref_table, ref_id, title, summary)
select client_id, 'post_publish', 'content_ledger', id, coalesce(slides->'slides'->0->>'headline', angle, 'New post'), angle
from public.content_ledger where status = 'in_review'
on conflict do nothing;

-- =========================================================
-- 13. Revisions (Deep's change requests), learning loop, manual posting
-- =========================================================
create table if not exists public.post_revisions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  post_id      uuid not null references public.content_ledger(id) on delete cascade,
  revision     integer not null,
  note         text not null,
  scope        text,                          -- caption | copy | image | full (set by the classifier)
  categories   text[] not null default '{}',  -- e.g. {image_lighting, text_size}
  instructions jsonb,                         -- { copywriter: '...', art_director: '...' }
  before       jsonb,                         -- snapshot of slides/captions/images before the change
  status       text not null default 'queued' check (status in ('queued','running','done','failed')),
  error        text,
  requested_by text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (post_id, revision)
);
create index if not exists post_revisions_cat on public.post_revisions using gin (categories);

create table if not exists public.learned_rules (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  agent       text not null check (agent in ('copywriter','art_director')),
  category    text not null,
  rule_text   text not null,
  status      text not null default 'active' check (status in ('active','retired')),
  evidence    uuid[] not null default '{}',   -- post_revisions ids that led to this rule
  approval_id uuid references public.approvals(id) on delete set null,
  created_by  text,
  created_at  timestamptz not null default now(),
  retired_at  timestamptz
);
create unique index if not exists learned_rules_one_active on public.learned_rules (client_id, category) where status = 'active';

alter table public.post_revisions enable row level security;
alter table public.learned_rules  enable row level security;
drop policy if exists os_read on public.post_revisions; create policy os_read on public.post_revisions for select to authenticated using (public.os_is_member(client_id));
drop policy if exists os_read on public.learned_rules;  create policy os_read on public.learned_rules  for select to authenticated using (public.os_is_member(client_id));

-- revision bookkeeping when the pipeline finishes or fails a revised post
create or replace function public.os_on_revision_result() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.revision > 0 and new.status is distinct from old.status then
    if new.status = 'in_review' then
      update public.post_revisions set status = 'done', finished_at = now()
       where post_id = new.id and revision = new.revision and status in ('queued','running');
    elsif new.status = 'failed' then
      update public.post_revisions set status = 'failed', finished_at = now(), error = 'pipeline failed'
       where post_id = new.id and revision = new.revision and status in ('queued','running');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ledger_revision on public.content_ledger;
create trigger trg_ledger_revision after update of status on public.content_ledger
  for each row execute function public.os_on_revision_result();

-- Deep marks a platform as posted (manual mode). When every enabled platform is posted, the post becomes 'published'.
create or replace function public.os_mark_posted(p_post uuid, p_platform text, p_posted boolean default true, p_url text default null)
returns public.content_ledger language plpgsql security definer set search_path = public as $$
declare r public.content_ledger; who text := auth.email(); pf jsonb; res jsonb; all_done boolean;
begin
  if p_platform not in ('instagram','tiktok','youtube') then raise exception 'Unknown platform %', p_platform; end if;
  select * into r from public.content_ledger where id = p_post for update;
  if r.id is null then raise exception 'Post not found'; end if;
  if not public.os_can_edit(r.client_id) then raise exception 'You do not have permission to mark posts'; end if;
  if r.status not in ('scheduled','published','failed') then raise exception 'Approve the post before marking it posted'; end if;
  if p_url is not null and p_url !~* '^https://' then raise exception 'The link must start with https://'; end if;

  res := coalesce(r.publish_results, '{}'::jsonb);
  if p_posted then
    res := jsonb_set(res, array[p_platform], jsonb_build_object('status','published','url',p_url,'at',now(),'by',who,'via','manual'));
  else
    res := res - p_platform;
  end if;

  select platforms into pf from public.os_settings where client_id = r.client_id;
  pf := coalesce(pf, '{"instagram":true,"tiktok":true,"youtube":true}'::jsonb);
  select bool_and(res->k->>'status' = 'published') into all_done
    from jsonb_each_text(pf) e(k, v) where v::boolean;

  update public.content_ledger set publish_results = res,
         status = case when coalesce(all_done,false) then 'published' else 'scheduled' end,
         published_at = case when coalesce(all_done,false) then coalesce(published_at, now()) else null end,
         updated_at = now()
   where id = p_post returning * into r;
  insert into public.events (client_id, actor, type, ref_table, ref_id, data)
  values (r.client_id, who, case when p_posted then 'post.marked_posted' else 'post.unmarked_posted' end, 'content_ledger', p_post,
          jsonb_build_object('platform', p_platform, 'url', p_url));
  return r;
end $$;

-- Generic approval decision (used now for AI rule proposals: kind = 'prompt_update')
create or replace function public.os_decide_approval(p_approval uuid, p_decision text, p_text text default null)
returns public.approvals language plpgsql security definer set search_path = public as $$
declare a public.approvals; who text := auth.email();
begin
  select * into a from public.approvals where id = p_approval for update;
  if a.id is null then raise exception 'Not found'; end if;
  if coalesce(public.os_role(a.client_id) in ('owner','admin'), false) is false then raise exception 'Only owners and admins can approve rules'; end if;
  if a.status <> 'pending' then raise exception 'This was already decided'; end if;
  if a.kind = 'post_publish' then raise exception 'Use the post review buttons for posts'; end if;
  if p_decision = 'approve' then
    if a.kind = 'prompt_update' then
      update public.learned_rules set status = 'retired', retired_at = now()
       where client_id = a.client_id and category = a.payload->>'category' and status = 'active';
      insert into public.learned_rules (client_id, agent, category, rule_text, evidence, approval_id, created_by)
      values (a.client_id, a.payload->>'agent', a.payload->>'category', coalesce(nullif(trim(p_text),''), a.payload->>'rule_text'),
              coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(a.payload->'evidence') x), '{}'), a.id, who);
    end if;
    update public.approvals set status = 'approved', decided_by = who, decided_at = now(), note = p_text where id = a.id returning * into a;
  elsif p_decision = 'reject' then
    update public.approvals set status = 'rejected', decided_by = who, decided_at = now(), note = p_text where id = a.id returning * into a;
  else raise exception 'Unknown decision %', p_decision; end if;
  insert into public.events (client_id, actor, type, ref_table, ref_id, data)
  values (a.client_id, who, 'approval.' || p_decision, 'approvals', a.id, jsonb_build_object('kind', a.kind));
  return a;
end $$;

create or replace function public.os_retire_rule(p_rule uuid)
returns public.learned_rules language plpgsql security definer set search_path = public as $$
declare r public.learned_rules; who text := auth.email();
begin
  select * into r from public.learned_rules where id = p_rule for update;
  if r.id is null then raise exception 'Not found'; end if;
  if coalesce(public.os_role(r.client_id) in ('owner','admin'), false) is false then raise exception 'Only owners and admins can change rules'; end if;
  update public.learned_rules set status = 'retired', retired_at = now() where id = p_rule returning * into r;
  insert into public.events (client_id, actor, type, ref_table, ref_id) values (r.client_id, who, 'rule.retired', 'learned_rules', p_rule);
  return r;
end $$;

revoke all on function public.os_mark_posted(uuid, text, boolean, text) from public, anon;
revoke all on function public.os_decide_approval(uuid, text, text) from public, anon;
revoke all on function public.os_retire_rule(uuid) from public, anon;
grant execute on function public.os_mark_posted(uuid, text, boolean, text) to authenticated;
grant execute on function public.os_decide_approval(uuid, text, text) to authenticated;
grant execute on function public.os_retire_rule(uuid) to authenticated;

-- Post view, now with revision info and a status for the UI (posts being revised show as 'changes_requested')
create or replace view public.v_os_posts with (security_invoker = on) as
select
  c.id, c.client_id, c.status, c.format, c.funnel_stage, c.pillar, c.hook_type, c.mood, c.angle,
  c.created_at, c.updated_at, c.scheduled_for, c.published_at, c.approved_at, c.approved_by,
  c.review_note, c.publish_results, c.publish_attempts, c.metrics,
  coalesce((select array_agg(s->>'ig_url' order by (s->>'n')::int) from jsonb_array_elements(c.slides->'plan'->'slides') s where s->>'ig_url' is not null), '{}') as ig_slides,
  coalesce((select array_agg(s->>'tt_url' order by (s->>'n')::int) from jsonb_array_elements(c.slides->'plan'->'slides') s where s->>'tt_url' is not null), '{}') as tt_slides,
  c.slides->>'caption_instagram' as caption_instagram,
  c.slides->>'caption_tiktok'    as caption_tiktok,
  c.slides->'hashtags_instagram' as hashtags_instagram,
  c.slides->'hashtags_tiktok'    as hashtags_tiktok,
  c.slides->>'alt_text'          as alt_text,
  c.slides->'plan'->>'look'      as look,
  (c.slides->'plan'->'critic'->-1->>'verdict') as critic_verdict,
  (c.slides->'plan'->'critic'->-1->>'summary') as critic_summary,
  c.compliance->>'verdict'       as compliance_verdict,
  coalesce((c.compliance->>'flagged')::boolean, false) as compliance_flagged,
  (select a.auto_approve_at from public.approvals a where a.ref_id = c.id and a.status = 'pending' limit 1) as auto_approve_at,
  c.revision,
  case when c.status in ('planned','drafted') and c.revision > 0 then 'changes_requested' else c.status end as ui_status,
  (select jsonb_agg(jsonb_build_object('revision', r.revision, 'note', r.note, 'status', r.status, 'scope', r.scope, 'at', r.created_at) order by r.revision)
     from public.post_revisions r where r.post_id = c.id) as revisions
from public.content_ledger c;

-- What Deep asks for most (last 30 days), for the learning page
create or replace view public.v_os_learning with (security_invoker = on) as
select r.client_id, cat as category, count(*) as times, max(r.created_at) as last_at,
       (array_agg(r.note order by r.created_at desc))[1:3] as examples
from public.post_revisions r, unnest(r.categories) cat
where r.created_at > now() - interval '30 days'
group by r.client_id, cat;

commit;

-- Quick check after running:
-- select status, count(*) from v_os_posts group by 1;
-- select os_next_slot('3034c840-dfc2-4c85-b949-bc8d4fd69208');

-- 14. Read access for signed-in users (applied 2026-11-03). Row-level security still limits rows to members.
grant usage on schema public to authenticated;
grant select on public.v_os_posts, public.v_os_learning, public.os_settings, public.approvals, public.actions, public.events,
  public.learned_rules, public.post_revisions, public.os_members, public.content_ledger, public.clients, public.products,
  public.competitor_posts to authenticated;
revoke all on public.v_os_posts, public.v_os_learning from anon;

-- 15. TEMPORARY open access (applied 2026-11-03): no login needed while we build. Turn off later with
--     update os_settings set open_access = false;  and set requireLogin: true in js/config.js
alter table public.os_settings add column if not exists open_access boolean not null default false;
-- os_role() now returns 'admin' for anyone when open_access is true (see runner execution 44 for the full statement).

-- 16. Competitor watch + news radar (applied via n8n SQL runner, Nov 3 2026)
-- Tables: watch_accounts, watch_posts, signals, insights, us_occasions. RLS read via os_role(client_id).
-- Functions: os_set_insight(id, status), os_toggle_account(id, active). Seeded: 34 IG, 8 TikTok, 3 YouTube accounts + US occasion calendar.
