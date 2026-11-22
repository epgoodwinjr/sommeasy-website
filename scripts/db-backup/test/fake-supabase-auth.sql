-- fake-supabase-auth.sql — a SMALL stand-in for Supabase's auth schema, so
-- the repo's migrations apply to a plain local Postgres for the drill test.
-- It is NOT Supabase's schema: only the tables and functions the
-- migrations and the backup touch (users, identities, schema_migrations,
-- uid()/role()). The real schema is checked on the first real backup.

create schema auth;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sign_in_at timestamptz
);

create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  created_at timestamptz default now(),
  unique (provider_id, provider)
);

create table auth.schema_migrations (version varchar(255) primary key);
insert into auth.schema_migrations values ('20240101000000'), ('20250101000000');

create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;
