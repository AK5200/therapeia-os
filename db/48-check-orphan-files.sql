-- Read-only: which stored files could be freed (bucket 'assets').
-- Post files live under <client>/<day>/<post id>/slide-… (raw AI images) and rendered/<day>/<post id>/(ig|tt)/… (finished slides).
with f as (
  select o.name, coalesce((o.metadata->>'size')::bigint, 0) as sz,
         (regexp_match(o.name, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(?:ig/|tt/|slide-)'))[1] as post_id
  from storage.objects o where o.bucket_id = 'assets'
), c as (
  select f.*, l.status, l.created_at as post_created,
         case when f.post_id is null then 'not a post file (keep)'
              when l.id is null then 'post deleted'
              when l.status = 'test' then 'test-run post'
              when position(f.name in l.slides::text) = 0 then 'old version of a live post (not used now)'
              else 'used by a live post (keep)' end as bucket
  from f left join content_ledger l on l.id::text = f.post_id
)
select bucket, count(*) as files, round(sum(sz) / 1e6) as mb,
       min(post_created)::date as oldest_post, max(post_created)::date as newest_post
from c group by bucket order by mb desc;
