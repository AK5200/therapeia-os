-- 60-day image retention: posts whose image files were deleted carry slides.images_removed = true; the OS shows a placeholder.
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
     from public.post_revisions r where r.post_id = c.id) as revisions,
  coalesce((c.slides->>'images_removed')::boolean, false) as images_removed
from public.content_ledger c;
select 'view updated' as status;
