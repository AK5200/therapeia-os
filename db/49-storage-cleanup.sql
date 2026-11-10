-- Storage cleanup candidates (bucket 'assets'). Returns one row per file to delete; the caller deletes them through the
-- Storage API (DELETE /storage/v1/object/assets {prefixes}) so the space is really freed, then marks retired posts.
--  1. files of posts that no longer exist
--  2. old versions of a finished post (repair rounds, earlier renders) that the post no longer uses
--  3. retention: every file of a post that was posted, rejected, failed or a test run more than 60 days ago
-- Never touched: files that are not post images (product photos, logos), posts in review / scheduled / being made,
-- and anything uploaded in the last 2 hours.
with f as (
  select o.name, coalesce((o.metadata->>'size')::bigint, 0) as sz, o.created_at,
         (regexp_match(o.name, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(?:ig/|tt/|slide-)'))[1] as post_id
  from storage.objects o
  where o.bucket_id = 'assets' and o.created_at < now() - interval '2 hours'
), c as (
  select f.name, f.sz, l.id as ledger_id,
         case when l.id is null then 'post deleted'
              when l.status in ('published', 'rejected', 'failed', 'test')
                   and coalesce(l.published_at, l.updated_at) < now() - interval '60 days' then 'older than 60 days'
              when l.status not in ('planned', 'drafted', 'changes_requested')
                   and position(f.name in l.slides::text) = 0 then 'old version'
         end as reason
  from f left join content_ledger l on l.id::text = f.post_id
  where f.post_id is not null
)
select name as path, sz, reason, ledger_id
from c where reason is not null
order by reason, name
limit 1000;
