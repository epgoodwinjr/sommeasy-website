-- 015 — The List Ledger: a catalog of the restaurant wine lists Sommeasy reads.
--
-- Every scan already extracts each wine's name, vintage, prices, section,
-- color, grape, region, country and producer, uses it for the page, and
-- used to throw it away. From here on a list that was photographed,
-- uploaded or linked is kept — DE-IDENTIFIED (Ed, Nov 24, 2026):
--
--   * nothing in these four tables says who read a list: no user id, no
--     email, no IP, no location, no timestamp finer than a day. The only
--     link between a person and a list is the list_ref their OWN
--     menu_analyzed event carries — and that row leaves with their account
--     (wine_events cascades from auth.users). The catalog stays, pointing
--     at no one;
--   * a restaurant is named only on strong evidence — a shared link's web
--     address, a website printed on the list, or a printed name together
--     with a printed city (src/lib/listLedger.js decides; never a guess);
--   * prices are stored, and nothing reads them for the picks.
--
-- Tables (all RLS ON with NO policies, and no table privileges for anon or
-- authenticated: only the service role — /api/lists and the SQL Editor —
-- reads or writes them):
--   restaurants             one row per restaurant we can name
--   wine_lists              one row per distinct list VERSION (fingerprint)
--   wine_list_items         one row per line, raw as extracted
--   wine_list_observations  one row per sitting that read a list (list_ref)
--
-- record_list_observation() does a whole write in ONE transaction: the
-- restaurant, the list (deduplicated by fingerprint), its lines, and the
-- sitting's observation — which always ends on the FULLEST version the
-- sitting sent ("Add another page" sends the whole list read so far, and a
-- late partial write must never pull the observation back). A version no
-- observation points at is removed. Dates only: observed_on, first_seen and
-- last_seen are days.
--
-- origin: 'live' only for the production deployment (VERCEL_ENV); e2e and
-- dev runs write to the same database as 'test', and the admin views leave
-- test lists out. The origin is part of the fingerprint, so a test read can
-- never join (or be joined by) a live list.

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text,
  name_key text,
  city text,
  website_host text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurants_has_identity check (website_host is not null or (name_key is not null and city is not null))
);

create unique index if not exists restaurants_website_host_key
  on public.restaurants (website_host) where website_host is not null;
-- A restaurant named by name + city (no web address yet): one row per pair
create unique index if not exists restaurants_name_city_key
  on public.restaurants (name_key, (lower(city))) where website_host is null;

create table if not exists public.wine_lists (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  fingerprint text not null unique,
  source_kind text not null check (source_kind in ('scan', 'pdf', 'url')),
  source_host text,
  read_name text,
  read_city text,
  read_website text,
  wine_count integer not null default 0 check (wine_count >= 0),
  priced_count integer not null default 0 check (priced_count >= 0),
  btg_count integer not null default 0 check (btg_count >= 0),
  first_seen date not null,
  last_seen date not null,
  times_seen integer not null default 0 check (times_seen >= 0),
  origin text not null check (origin in ('live', 'test')),
  parser_version text not null
);

create index if not exists wine_lists_restaurant_idx on public.wine_lists (restaurant_id);

create table if not exists public.wine_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.wine_lists(id) on delete cascade,
  position integer not null check (position > 0),
  name text not null,
  -- the name folded for comparison across lists (lowercase, no accents, no
  -- punctuation, no vintage) — the repeat-bottles view groups on it
  name_key text not null default '',
  producer text,
  vintage text,
  bottle_price numeric(10, 2) check (bottle_price is null or bottle_price > 0),
  glass_price numeric(10, 2) check (glass_price is null or glass_price > 0),
  is_btg boolean not null default false,
  section text,
  color text,
  grape text,
  region text,
  country text,
  unique (list_id, position)
);

create index if not exists wine_list_items_name_key_idx on public.wine_list_items (name_key);

create table if not exists public.wine_list_observations (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.wine_lists(id) on delete cascade,
  list_ref uuid not null unique,
  observed_on date not null,
  source_kind text not null check (source_kind in ('scan', 'pdf', 'url')),
  origin text not null check (origin in ('live', 'test'))
);

create index if not exists wine_list_observations_list_idx on public.wine_list_observations (list_id);

alter table public.restaurants enable row level security;
alter table public.wine_lists enable row level security;
alter table public.wine_list_items enable row level security;
alter table public.wine_list_observations enable row level security;
-- Deliberately NO policies: only the service role reads or writes these.
revoke all on public.restaurants, public.wine_lists, public.wine_list_items, public.wine_list_observations
  from anon, authenticated;

-- ─── The one write ───
-- p_restaurant is what the route proved, or null:
--   { "name", "name_key", "city", "website_host" } — website_host set, or
--   name_key + city both set (src/lib/listLedger.js restaurantEvidence)
-- p_items: [{ position, name, name_key, producer, vintage, bottle_price,
--   glass_price, is_btg, section, color, grape, region, country }]
-- Returns { list_id, list: new|existing, observation: new|moved|kept,
--   restaurant: bool }.
create or replace function public.record_list_observation(
  p_list_ref uuid,
  p_observed_on date,
  p_source_kind text,
  p_source_host text,
  p_origin text,
  p_parser_version text,
  p_fingerprint text,
  p_wine_count integer,
  p_priced_count integer,
  p_btg_count integer,
  p_read_name text,
  p_read_city text,
  p_read_website text,
  p_restaurant jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r_id uuid;
  r_host text := nullif(p_restaurant ->> 'website_host', '');
  r_name text := nullif(p_restaurant ->> 'name', '');
  r_key text := nullif(p_restaurant ->> 'name_key', '');
  r_city text := nullif(p_restaurant ->> 'city', '');
  l_id uuid;
  l_new boolean;
  o_list uuid;
  o_state text;
  old_count integer;
  touched uuid[];
begin
  -- 1. The restaurant, on the evidence the route proved
  if r_host is not null then
    select id into r_id from public.restaurants where website_host = r_host;
    if r_id is null and r_key is not null and r_city is not null then
      -- named before by name + city: this list gives it its web address
      update public.restaurants set website_host = r_host, updated_at = now()
       where id = (select id from public.restaurants
                    where name_key = r_key and lower(city) = lower(r_city) and website_host is null
                    limit 1 for update)
      returning id into r_id;
    end if;
    if r_id is null then
      insert into public.restaurants (name, name_key, city, website_host)
      values (r_name, r_key, r_city, r_host)
      on conflict (website_host) where website_host is not null do nothing
      returning id into r_id;
      if r_id is null then
        select id into r_id from public.restaurants where website_host = r_host;
      end if;
    end if;
  elsif r_key is not null and r_city is not null then
    select id into r_id from public.restaurants
     where name_key = r_key and lower(city) = lower(r_city)
     order by (website_host is null) limit 1;
    if r_id is null then
      insert into public.restaurants (name, name_key, city)
      values (r_name, r_key, r_city)
      on conflict (name_key, (lower(city))) where website_host is null do nothing
      returning id into r_id;
      if r_id is null then
        select id into r_id from public.restaurants
         where name_key = r_key and lower(city) = lower(r_city) and website_host is null;
      end if;
    end if;
  end if;
  if r_id is not null then
    -- what a restaurant row lacks, a later list may supply; nothing is overwritten
    update public.restaurants
       set name = coalesce(name, r_name), name_key = coalesce(name_key, r_key),
           city = coalesce(city, r_city), updated_at = now()
     where id = r_id;
  end if;

  -- 2. The list version, deduplicated by fingerprint
  insert into public.wine_lists as l (
    restaurant_id, fingerprint, source_kind, source_host, read_name, read_city, read_website,
    wine_count, priced_count, btg_count, first_seen, last_seen, times_seen, origin, parser_version
  ) values (
    r_id, p_fingerprint, p_source_kind, p_source_host, p_read_name, p_read_city, p_read_website,
    p_wine_count, p_priced_count, p_btg_count, p_observed_on, p_observed_on, 0, p_origin, p_parser_version
  )
  on conflict (fingerprint) do update
     set restaurant_id = coalesce(l.restaurant_id, excluded.restaurant_id),
         source_host = coalesce(l.source_host, excluded.source_host),
         read_name = coalesce(l.read_name, excluded.read_name),
         read_city = coalesce(l.read_city, excluded.read_city),
         read_website = coalesce(l.read_website, excluded.read_website)
  returning id, (xmax = 0) into l_id, l_new;

  if l_new then
    insert into public.wine_list_items (
      list_id, position, name, name_key, producer, vintage, bottle_price, glass_price,
      is_btg, section, color, grape, region, country
    )
    select l_id, (i ->> 'position')::integer, i ->> 'name', coalesce(i ->> 'name_key', ''),
           i ->> 'producer', i ->> 'vintage', (i ->> 'bottle_price')::numeric, (i ->> 'glass_price')::numeric,
           coalesce((i ->> 'is_btg')::boolean, false), i ->> 'section', i ->> 'color',
           i ->> 'grape', i ->> 'region', i ->> 'country'
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;
  end if;

  -- 3. The sitting's observation: one per list_ref, on the fullest version
  select list_id into o_list from public.wine_list_observations where list_ref = p_list_ref for update;
  if o_list is null then
    insert into public.wine_list_observations (list_id, list_ref, observed_on, source_kind, origin)
    values (l_id, p_list_ref, p_observed_on, p_source_kind, p_origin)
    on conflict (list_ref) do nothing;
    if found then
      o_state := 'new';
    else
      -- another write for this sitting landed first
      select list_id into o_list from public.wine_list_observations where list_ref = p_list_ref for update;
    end if;
  end if;
  if o_state is null then
    if o_list = l_id then
      o_state := 'kept';
    else
      select wine_count into old_count from public.wine_lists where id = o_list;
      if p_wine_count >= coalesce(old_count, 0) then
        update public.wine_list_observations set list_id = l_id where list_ref = p_list_ref;
        o_state := 'moved';
      else
        o_state := 'kept';  -- a late, smaller write: the observation stays where it is
      end if;
    end if;
  end if;

  -- 4. A version nothing points at is gone; the rest count what they've seen
  touched := array_remove(array[l_id, o_list], null);
  delete from public.wine_lists w
   where w.id = any (touched)
     and not exists (select 1 from public.wine_list_observations o where o.list_id = w.id);
  update public.wine_lists w
     set times_seen = s.n, first_seen = s.first_on, last_seen = s.last_on
    from (select list_id, count(*)::integer as n, min(observed_on) as first_on, max(observed_on) as last_on
            from public.wine_list_observations where list_id = any (touched) group by list_id) s
   where w.id = s.list_id;

  return jsonb_build_object(
    'list_id', (select list_id from public.wine_list_observations where list_ref = p_list_ref),
    'list', case when l_new then 'new' else 'existing' end,
    'observation', o_state,
    'restaurant', r_id is not null
  );
end;
$$;

revoke all on function public.record_list_observation(uuid, date, text, text, text, text, text, integer, integer, integer, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_list_observation(uuid, date, text, text, text, text, text, integer, integer, integer, text, text, text, jsonb, jsonb)
  to service_role;

-- ─── The admin views (the user_roster pattern) ───
-- Definer-rights views, REVOKEd from anon and authenticated: SQL Editor
-- only. Both leave test-origin lists out.

-- Lists by restaurant. The row with no restaurant is every list we couldn't name.
create or replace view public.list_catalog_by_restaurant as
select
  r.id                       as restaurant_id,
  r.name,
  r.city,
  r.website_host,
  count(l.id)                as lists,
  sum(l.times_seen)::integer as times_seen,
  sum(l.wine_count)::integer as wines,
  max(l.last_seen)           as last_seen
from public.wine_lists l
left join public.restaurants r on r.id = l.restaurant_id
where l.origin = 'live'
group by r.id, r.name, r.city, r.website_host
order by max(l.last_seen) desc, count(l.id) desc;

revoke all on public.list_catalog_by_restaurant from anon, authenticated;

-- Bottles seen on two or more lists: the same bottle's price across lists.
create or replace view public.list_catalog_repeat_bottles as
select
  i.name_key,
  min(i.name)                        as example_name,
  count(distinct i.list_id)          as lists,
  count(distinct l.restaurant_id)    as restaurants,
  min(i.bottle_price)                as min_bottle_price,
  max(i.bottle_price)                as max_bottle_price
from public.wine_list_items i
join public.wine_lists l on l.id = i.list_id
where l.origin = 'live' and i.name_key <> ''
group by i.name_key
having count(distinct i.list_id) >= 2
order by count(distinct i.list_id) desc, i.name_key;

revoke all on public.list_catalog_repeat_bottles from anon, authenticated;
