-- sql-test.sql — record_list_observation() on a throwaway database, run by
-- sql-test.sh after every migration (001–016). Every check raises on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.obs(ref uuid, fp text, wines int, restaurant jsonb default null,
  kind text default 'scan', host text default null, origin text default 'test', day date default '2026-11-24')
returns jsonb language sql as $$
  select public.record_list_observation(ref, day, kind, host, origin, 'v1', fp, wines, wines, 0,
    restaurant ->> 'name', restaurant ->> 'city', restaurant ->> 'website_host', restaurant,
    (select coalesce(jsonb_agg(jsonb_build_object('position', g, 'name', 'Wine ' || g, 'name_key', 'wine ' || g,
            'bottle_price', 40 + g, 'is_btg', false)), '[]'::jsonb) from generate_series(1, wines) g))
$$;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok  %', what;
end $$;

-- 1. One sitting, one list
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000001', 'fp-a1', 3) ->> 'observation') = 'new', 'a first write makes a new observation');
select pg_temp.check((select count(*) from public.wine_list_items i join public.wine_lists l on l.id = i.list_id where l.fingerprint = 'fp-a1') = 3, 'its three lines are kept');
select pg_temp.check((select times_seen from public.wine_lists where fingerprint = 'fp-a1') = 1, 'times seen 1');

-- 2. "Add another page": the fuller version takes the observation, the partial goes
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000001', 'fp-a2', 7) ->> 'observation') = 'moved', 'page two moves the observation');
select pg_temp.check(not exists (select 1 from public.wine_lists where fingerprint = 'fp-a1'), 'the partial version nothing points at is removed');
select pg_temp.check((select count(*) from public.wine_list_observations where list_ref = '00000000-0000-4000-8000-000000000001') = 1, 'still one observation');
select pg_temp.check((select l.fingerprint from public.wine_list_observations o join public.wine_lists l on l.id = o.list_id where o.list_ref = '00000000-0000-4000-8000-000000000001') = 'fp-a2', 'on the fuller list');
select pg_temp.check(not exists (select 1 from public.wine_list_items i left join public.wine_lists l on l.id = i.list_id where l.id is null), 'no orphaned lines');

-- 3. A late partial write never pulls it back, and leaves nothing behind
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000001', 'fp-a1', 3) ->> 'observation') = 'kept', 'a late smaller write keeps the observation where it is');
select pg_temp.check(not exists (select 1 from public.wine_lists where fingerprint = 'fp-a1'), 'and its version is removed again');

-- 4. The same list in another sitting: one list, two observations
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000002', 'fp-a2', 7, day => '2026-11-26') ->> 'list') = 'existing', 'the same fingerprint is the same list');
select pg_temp.check((select times_seen from public.wine_lists where fingerprint = 'fp-a2') = 2, 'times seen 2');
select pg_temp.check((select first_seen = '2026-11-24' and last_seen = '2026-11-26' from public.wine_lists where fingerprint = 'fp-a2'), 'first and last seen are the observations'' days');
select pg_temp.check((select count(*) from public.wine_list_items i join public.wine_lists l on l.id = i.list_id where l.fingerprint = 'fp-a2') = 7, 'its lines are not written twice');

-- 5. A list another sitting points at is never removed by this one's move
select pg_temp.obs('00000000-0000-4000-8000-000000000003', 'fp-a2', 7);
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000003', 'fp-a3', 9) ->> 'observation') = 'moved', 'a third sitting moves on to its fuller page');
select pg_temp.check((select times_seen from public.wine_lists where fingerprint = 'fp-a2') = 2, 'the shared list keeps its other two sittings');

-- 6. Restaurants: a host, name + city, a name alone
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000010', 'fp-r1', 2,
  '{"website_host":"harbourtable.example","name":"The Harbour Table","name_key":"harbour table","city":"Hermanus"}', 'url', 'harbourtable.example') ->> 'restaurant')::boolean, 'a host names a restaurant');
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000011', 'fp-r2', 2,
  '{"website_host":"harbourtable.example"}') ->> 'restaurant')::boolean, 'the same host again');
select pg_temp.check((select count(*) from public.restaurants where website_host = 'harbourtable.example') = 1, 'is the same restaurant');
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000012', 'fp-r3', 2,
  '{"name":"Vine & Fig","name_key":"vine fig","city":"Stellenbosch"}') ->> 'restaurant')::boolean, 'a printed name with a printed city names one');
select pg_temp.obs('00000000-0000-4000-8000-000000000013', 'fp-r4', 2, '{"name":"VINE & FIG","name_key":"vine fig","city":"STELLENBOSCH"}');
select pg_temp.check((select count(*) from public.restaurants where name_key = 'vine fig') = 1, 'the same name and city in other cases are the same restaurant');
select pg_temp.obs('00000000-0000-4000-8000-000000000014', 'fp-r5', 2, '{"website_host":"vineandfig.example","name":"Vine & Fig","name_key":"vine fig","city":"Stellenbosch"}');
select pg_temp.check((select count(*) from public.restaurants where name_key = 'vine fig') = 1 and exists (select 1 from public.restaurants where name_key = 'vine fig' and website_host = 'vineandfig.example'), 'a later web address joins the row named by name and city');
select pg_temp.obs('00000000-0000-4000-8000-000000000016', 'fp-r7', 2, '{"name":"VINE AND FIG","name_key":"vine fig","city":"stellenbosch"}');
select pg_temp.check((select count(*) from public.restaurants where name_key = 'vine fig') = 1, 'name + city in another case still finds the row that now has a web address');
select pg_temp.check((pg_temp.obs('00000000-0000-4000-8000-000000000015', 'fp-r6', 2) ->> 'restaurant')::boolean = false, 'no evidence, no restaurant');
do $$ begin
  begin
    insert into public.restaurants (name, name_key, first_seen, last_seen) values ('Name Alone', 'name alone', '2026-11-24', '2026-11-24');
    raise exception 'FAILED: a name alone made a restaurant row';
  exception when check_violation then raise notice 'ok  a name alone can never be a restaurant row';
  end;
end $$;

-- 7. Live and test never meet in the views
select pg_temp.obs('00000000-0000-4000-8000-000000000020', 'live-b1', 2, origin => 'live');
select pg_temp.obs('00000000-0000-4000-8000-000000000021', 'live-b2', 3, origin => 'live');
select pg_temp.check((select sum(lists) from public.list_catalog_by_restaurant) = 2, 'lists by restaurant counts live lists only');
select pg_temp.check((select lists from public.list_catalog_repeat_bottles where name_key = 'wine 1') = 2, 'a bottle on two live lists');
select pg_temp.check(not exists (select 1 from public.list_catalog_repeat_bottles where name_key = 'wine 3'), 'a bottle on one live list is not repeated');
select pg_temp.check((select min_bottle_price = 41 from public.list_catalog_repeat_bottles where name_key = 'wine 1'), 'with its price range');

-- 8. Only the service role
do $$
declare r text; t text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['restaurants', 'wine_lists', 'wine_list_items', 'wine_list_observations',
                             'list_catalog_by_restaurant', 'list_catalog_repeat_bottles'] loop
      if has_table_privilege(r, 'public.' || t, 'select') or has_table_privilege(r, 'public.' || t, 'insert') then
        raise exception 'FAILED: % can reach %', r, t;
      end if;
    end loop;
    if has_function_privilege(r, 'public.record_list_observation(uuid, date, text, text, text, text, text, integer, integer, integer, text, text, text, jsonb, jsonb)', 'execute') then
      raise exception 'FAILED: % can call record_list_observation', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.record_list_observation(uuid, date, text, text, text, text, text, integer, integer, integer, text, text, text, jsonb, jsonb)', 'execute') then
    raise exception 'FAILED: service_role cannot call record_list_observation';
  end if;
  raise notice 'ok  anon and authenticated reach nothing; the service role may write';
end $$;

-- 9. Nothing in the catalog can say who read a list — nor when, past the day
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name in ('restaurants', 'wine_lists', 'wine_list_items', 'wine_list_observations')
                and column_name ~ '(user|email|ip|location|lat|lng|device)') then
    raise exception 'FAILED: a catalog column could identify a reader';
  end if;
  raise notice 'ok  no user, email, IP or location column in the catalog';
end $$;
do $$
declare c text;
begin
  -- every table AND view of the catalog: a day is a date, and nothing else
  -- that tells time (timestamp, time, interval) may be there
  select string_agg(table_name || '.' || column_name || ' ' || data_type, ', ') into c
    from information_schema.columns
   where table_schema = 'public'
     and table_name in ('restaurants', 'wine_lists', 'wine_list_items', 'wine_list_observations',
                        'list_catalog_by_restaurant', 'list_catalog_repeat_bottles')
     and (data_type like 'timestamp%' or data_type like 'time%' or data_type = 'interval');
  if c is not null then raise exception 'FAILED: a catalog column holds a time: %', c; end if;
  raise notice 'ok  no catalog column holds a time — days only';
end $$;
select pg_temp.check((select count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'restaurants' and column_name in ('first_seen', 'last_seen') and data_type = 'date') = 2,
  'a restaurant keeps the days it was first and last seen');

-- 10. A restaurant's days are its observations' days, never the clock
select pg_temp.obs('00000000-0000-4000-8000-000000000030', 'fp-d1', 2, '{"website_host":"daysonly.example"}', day => '2026-10-02');
select pg_temp.check((select first_seen = '2026-10-02' and last_seen = '2026-10-02' from public.restaurants where website_host = 'daysonly.example'), 'a new restaurant is first and last seen on its observation''s day');
select pg_temp.obs('00000000-0000-4000-8000-000000000031', 'fp-d2', 2, '{"website_host":"daysonly.example"}', day => '2026-10-09');
select pg_temp.check((select first_seen = '2026-10-02' and last_seen = '2026-10-09' from public.restaurants where website_host = 'daysonly.example'), 'a later list moves its last day, not its first');
select pg_temp.obs('00000000-0000-4000-8000-000000000032', 'fp-d3', 2, '{"name":"Day Room","name_key":"day room","city":"Paarl"}', day => '2026-10-03');
select pg_temp.obs('00000000-0000-4000-8000-000000000033', 'fp-d4', 2, '{"website_host":"dayroom.example","name":"Day Room","name_key":"day room","city":"Paarl"}', day => '2026-10-05');
select pg_temp.check((select first_seen = '2026-10-03' and last_seen = '2026-10-05' from public.restaurants where name_key = 'day room'), 'a web address joining a name-and-city row keeps both days right');
