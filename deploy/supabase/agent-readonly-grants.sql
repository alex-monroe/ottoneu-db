-- SELECT for agent_readonly on every public table except fantasy-pulse's
-- (prefix fp + underscore). Run by `db.sh setup-readonly` and again inside
-- every `just migrate`, so a new table is readable right away. A no-op until
-- the role exists.
do $grants$
declare t record;
begin
  if not exists (select from pg_roles where rolname = 'agent_readonly') then return; end if;
  for t in select tablename from pg_tables where schemaname = 'public' loop
    if left(t.tablename, 3) = 'fp' || '_' then
      execute format('revoke all on public.%I from agent_readonly', t.tablename);
    else
      execute format('grant select on public.%I to agent_readonly', t.tablename);
    end if;
  end loop;
end
$grants$;
