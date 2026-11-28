-- 016_list_ledger_days.sql — the catalog keeps days, never times.
--
-- 015 gave restaurants created_at / updated_at timestamps, and updated_at
-- moved on every write that named the restaurant — so the table kept the
-- minute a list was read, which the Privacy Policy says the catalog never
-- does ("only the day a list was read, never the time"). They become
-- first_seen / last_seen DAYS, as on wine_lists, set from the observation's
-- own day (p_observed_on) — never from the clock. No column in the catalog
-- holds a time (scripts/list-ledger/sql-test.sql §9 checks every one).
--
-- The function is otherwise exactly 015's; only its restaurant writes change.

alter table public.restaurants rename column created_at to first_seen;
alter table public.restaurants rename column updated_at to last_seen;
alter table public.restaurants
  alter column first_seen drop default,
  alter column first_seen type date using (first_seen at time zone 'utc')::date,
  alter column last_seen drop default,
  alter column last_seen type date using (last_seen at time zone 'utc')::date;

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
      update public.restaurants set website_host = r_host
       where id = (select id from public.restaurants
                    where name_key = r_key and lower(city) = lower(r_city) and website_host is null
                    limit 1 for update)
      returning id into r_id;
    end if;
    if r_id is null then
      insert into public.restaurants (name, name_key, city, website_host, first_seen, last_seen)
      values (r_name, r_key, r_city, r_host, p_observed_on, p_observed_on)
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
      insert into public.restaurants (name, name_key, city, first_seen, last_seen)
      values (r_name, r_key, r_city, p_observed_on, p_observed_on)
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
           city = coalesce(city, r_city),
           first_seen = least(first_seen, p_observed_on), last_seen = greatest(last_seen, p_observed_on)
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

revoke all on function public.record_list_observation(uuid, date, text, text, text, text, text, integer, integer, integer, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_list_observation(uuid, date, text, text, text, text, text, integer, integer, integer, text, text, text, jsonb, jsonb) to service_role;
