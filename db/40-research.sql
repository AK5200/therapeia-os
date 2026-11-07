-- ===== RESEARCH LIBRARY =====
-- Study cards found by the Research Radar (PubMed, Google, research accounts on IG/TikTok).
-- A study is only usable after a person approves it in the OS. Approval turns each of its findings
-- into an approved_facts row (claim_type 'research', placement 'caption') so the existing
-- claims-first pipeline (Brain -> fact ids -> copy) uses it with no special path.
-- Retiring a study blocks its facts again (the "remove if questioned" path).

create table if not exists research_studies (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'retired')),
  tier          text not null check (tier in ('product_match', 'ingredient', 'early', 'blocked')),
  ingredient    text not null check (ingredient in ('ashwagandha', 'shilajit', 'both', 'other')),
  -- the paper (always the original paper, never the social post)
  pmid text, doi text, url text,
  title text not null, authors text, journal text, year int,
  design text, participants int, population text,
  extract text, dose text, duration text,
  outcomes text, results text, limitations text, funding text,
  citation      text not null,                 -- short form for captions: "Lopresti et al., 2019, Medicine"
  findings      jsonb not null default '[]',   -- [{ "finding": plain words, "safe_wording": caption-ready sentence }]
  -- where the lead came from and how it was checked
  lead_source   text check (lead_source in ('pubmed', 'google', 'instagram', 'tiktok', 'manual')),
  lead_url text, lead_claim text,
  verify_notes  text,                           -- did the lead's claim match the paper? what differs?
  reviewed_by text, reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists research_studies_pmid on research_studies (client_id, pmid) where pmid is not null;
create unique index if not exists research_studies_doi on research_studies (client_id, lower(doi)) where doi is not null;

-- research facts live in approved_facts so the pipeline needs no second source of facts
alter table approved_facts add column if not exists study_id  uuid references research_studies(id) on delete set null;
alter table approved_facts add column if not exists citation  text;
alter table approved_facts add column if not exists tier      text;
alter table approved_facts add column if not exists placement text not null default 'any';
do $$ begin
  alter table approved_facts add constraint approved_facts_placement_check check (placement in ('any', 'caption'));
exception when duplicate_object then null; end $$;

-- approve: findings -> approved facts (caption only). Blocked and early tiers can never be approved.
create or replace function os_approve_study(p_id uuid, p_by text default 'owner', p_note text default null)
returns text language plpgsql security definer set search_path = public as $f$
declare s research_studies; f jsonb; n int := 0;
begin
  select * into s from research_studies where id = p_id for update;
  if not found then return 'not_found'; end if;
  if os_role(s.client_id) is null and current_user not in ('postgres', 'service_role') then raise exception 'not allowed'; end if;
  if s.status = 'approved' then return 'already_approved'; end if;
  if s.tier in ('blocked', 'early') then return 'tier_not_allowed'; end if;
  if jsonb_array_length(s.findings) = 0 then return 'no_findings'; end if;
  for f in select * from jsonb_array_elements(s.findings) loop
    if coalesce(f->>'safe_wording', '') = '' then continue; end if;
    insert into approved_facts (client_id, product_slug, claim_type, claim_text, safe_wording, status, needs_disclaimer,
                                source, source_ref, notes, ingredient, study_id, citation, tier, placement)
    values (s.client_id, null, 'research', coalesce(f->>'finding', f->>'safe_wording'), f->>'safe_wording', 'approved', true,
            'research', coalesce(s.url, 'https://doi.org/' || s.doi, 'https://pubmed.ncbi.nlm.nih.gov/' || s.pmid || '/'),
            'study ' || s.id || coalesce(' · ' || p_note, ''),
            case when s.ingredient = 'other' then 'brand' else s.ingredient end,
            s.id, s.citation, s.tier, 'caption');
    n := n + 1;
  end loop;
  update research_studies set status = 'approved', reviewed_by = p_by, reviewed_at = now(), review_note = p_note where id = p_id;
  return 'approved:' || n;
end $f$;

create or replace function os_reject_study(p_id uuid, p_by text default 'owner', p_note text default null)
returns text language plpgsql security definer set search_path = public as $f$
declare s research_studies;
begin
  select * into s from research_studies where id = p_id for update;
  if not found then return 'not_found'; end if;
  if os_role(s.client_id) is null and current_user not in ('postgres', 'service_role') then raise exception 'not allowed'; end if;
  if s.status = 'approved' then return 'use_retire'; end if;
  update research_studies set status = 'rejected', reviewed_by = p_by, reviewed_at = now(), review_note = p_note where id = p_id;
  return 'rejected';
end $f$;

-- retire: stop using an approved study (e.g. if questioned). Its facts become blocked so they are never reused.
create or replace function os_retire_study(p_id uuid, p_by text default 'owner', p_note text default null)
returns text language plpgsql security definer set search_path = public as $f$
declare s research_studies; n int;
begin
  select * into s from research_studies where id = p_id for update;
  if not found then return 'not_found'; end if;
  if os_role(s.client_id) is null and current_user not in ('postgres', 'service_role') then raise exception 'not allowed'; end if;
  update approved_facts set status = 'blocked', notes = coalesce(notes, '') || ' · retired ' || now()::date || coalesce(': ' || p_note, '')
   where study_id = p_id and status <> 'blocked';
  get diagnostics n = row_count;
  update research_studies set status = 'retired', reviewed_by = p_by, reviewed_at = now(), review_note = p_note where id = p_id;
  return 'retired:' || n;
end $f$;

alter table research_studies enable row level security;
drop policy if exists research_studies_read on research_studies;
create policy research_studies_read on research_studies for select using (os_role(client_id) is not null);
grant execute on function os_approve_study(uuid, text, text), os_reject_study(uuid, text, text), os_retire_study(uuid, text, text) to authenticated;
