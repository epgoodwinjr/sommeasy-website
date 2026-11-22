-- drill-roles.sql — the roles a Supabase database has and a plain Postgres
-- doesn't, so a backup's GRANTs and policies restore into a LOCAL drill
-- database. Roles belong to the whole Postgres cluster, so this is safe to
-- run again. Never run against a Supabase project (it has these already).

do $$
declare
  r text;
begin
  foreach r in array array[
    'postgres', 'anon', 'authenticated', 'service_role', 'authenticator',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin',
    'dashboard_user', 'pgbouncer'
  ] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end
$$;
