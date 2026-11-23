-- The read-only role behind `just sql` (deploy/supabase/db.sh). Idempotent:
-- `db.sh setup-readonly` runs it, then agent-readonly-grants.sql. Re-run both
-- after a restore from hosted (Phase 5), since hosted has no such role.
--
-- No password: it can only log in from inside the db container, where
-- 127.0.0.1 is `trust` in pg_hba.conf. BYPASSRLS so it sees what the old
-- Supabase MCP (role postgres) saw; it still has SELECT only, and no grant on
-- fantasy-pulse's tables at all.
select 'create role agent_readonly login' where not exists (select from pg_roles where rolname = 'agent_readonly')
\gexec
alter role agent_readonly with login bypassrls password null;
alter role agent_readonly set default_transaction_read_only = on;
alter role agent_readonly set statement_timeout = '30s';
alter role agent_readonly set idle_in_transaction_session_timeout = '60s';
grant usage on schema public, supabase_migrations to agent_readonly;
grant select on supabase_migrations.schema_migrations to agent_readonly;
