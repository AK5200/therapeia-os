-- Read-only: current Supabase usage (same numbers the pipeline Preflight reads)
select pg_size_pretty(pg_database_size(current_database())) as db_size,
       pg_database_size(current_database())::bigint as db_bytes,
       coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)::bigint as storage_bytes,
       (select count(*) from storage.objects) as files,
       (select supabase_plan from os_settings where client_id = '3034c840-dfc2-4c85-b949-bc8d4fd69208') as plan_setting;
