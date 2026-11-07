-- Research findings may appear on ONE slide only as a person-approved short "slide wording" (comp.principles rule 6).
alter table approved_facts add column if not exists slide_wording text;

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
    insert into approved_facts (client_id, product_slug, claim_type, claim_text, safe_wording, slide_wording, status, needs_disclaimer,
                                source, source_ref, notes, ingredient, study_id, citation, tier, placement)
    values (s.client_id, null, 'research', coalesce(f->>'finding', f->>'safe_wording'), f->>'safe_wording', nullif(f->>'slide_wording', ''), 'approved', true,
            'research', coalesce(s.url, 'https://doi.org/' || s.doi, 'https://pubmed.ncbi.nlm.nih.gov/' || s.pmid || '/'),
            'study ' || s.id || coalesce(' · ' || p_note, ''),
            case when s.ingredient = 'other' then 'brand' else s.ingredient end,
            s.id, s.citation, s.tier, 'caption');
    n := n + 1;
  end loop;
  update research_studies set status = 'approved', reviewed_by = p_by, reviewed_at = now(), review_note = p_note where id = p_id;
  return 'approved:' || n;
end $f$;

-- test study (Salve 2019): short slide wordings (to be confirmed by Deep in the OS)
update approved_facts set slide_wording = 'In one 8-week study, stressed adults taking KSM-66 ashwagandha felt less stressed than the placebo group.'
 where study_id is not null and claim_text = 'stress scores and cortisol';
update approved_facts set slide_wording = 'In the same study, they also rated their sleep quality better than the placebo group.'
 where study_id is not null and claim_text = 'sleep quality ratings';
update research_studies set findings = jsonb_build_array(
  findings->0 || jsonb_build_object('slide_wording', 'In one 8-week study, stressed adults taking KSM-66 ashwagandha felt less stressed than the placebo group.'),
  findings->1 || jsonb_build_object('slide_wording', 'In the same study, they also rated their sleep quality better than the placebo group.'))
 where pmid = '32021735';

-- older research facts that state study results: caption only (study note), no slide wording yet
with moved as (
  update approved_facts set placement = 'caption', citation = coalesce(citation, substring(coalesce(safe_wording, claim_text) from '\(([^)]*\d{4})\)'))
   where claim_type = 'research' and placement = 'any' and status in ('approved', 'reword')
     and coalesce(safe_wording, claim_text) ~* '(study|studies|placebo|participants|trial|%)'
  returning left(id::text, 6) as fid, coalesce(safe_wording, claim_text) as say)
select (select json_agg(moved) from moved) as moved_to_caption,
       (select count(*) from approved_facts where slide_wording is not null) as with_slide_wording;
