-- read-only: approved_facts columns, constraints and value sets (used before seeding the research library)
select
  (select json_agg(json_build_object('c', column_name, 't', data_type, 'null', is_nullable, 'd', column_default) order by ordinal_position)
     from information_schema.columns where table_name = 'approved_facts' and table_schema = 'public') as columns,
  (select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid = 'public.approved_facts'::regclass) as constraints,
  (select json_agg(distinct status) from approved_facts) as statuses,
  (select json_agg(distinct claim_type) from approved_facts) as claim_types,
  (select json_agg(distinct source) from approved_facts) as sources,
  (select json_agg(distinct ingredient) from approved_facts) as ingredients,
  (select json_agg(distinct tier) from approved_facts) as tiers,
  (select count(*) from approved_facts) as total;
