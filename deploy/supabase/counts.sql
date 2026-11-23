-- Restore verification: identical output on hosted and self-hosted means the
-- data and schema came across. fantasy-pulse's fp_ tables are left out of the
-- row counts (this repo does not read them); they count in the totals.
select 'public.' || table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'fp\_%'
union all select 'auth.users', count(*)::text from auth.users
union all select 'auth.identities', count(*)::text from auth.identities
union all select 'supabase_migrations.schema_migrations', count(*)::text from supabase_migrations.schema_migrations
union all select 'meta:public_tables_total', count(*)::text from pg_tables where schemaname = 'public'
union all select 'meta:rls_policies', count(*)::text from pg_policies where schemaname = 'public'
union all select 'meta:rls_enabled_tables', count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
union all select 'meta:public_functions', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'meta:indexes', count(*)::text from pg_indexes where schemaname = 'public'
union all select 'meta:fk_constraints', count(*)::text
  from pg_constraint c join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and contype = 'f'
union all select 'meta:extensions', string_agg(extname, ',' order by extname) from pg_extension
order by 1;
