-- seed.sql — synthetic rows for the drill test: three accounts and a row
-- in every user table, with the values a dump most often mangles (quotes,
-- tabs, newlines, backslashes, accents, emoji-free unicode, nulls, jsonb).

insert into auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'drill-one@example.test', '$2a$10$abcdefghijklmnopqrstuv', '{"name": "Drill One"}', '2026-07-01T10:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'drill-two@example.test', '$2a$10$zyxwvutsrqponmlkjihgfe', '{"name": "Rosé \"Two\"", "pending_palate": {"version": 1, "answers": {"countries": ["france"]}}}', '2026-08-01T10:00:00Z'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'drill-three@example.test', null, null, '2026-09-01T10:00:00Z');

insert into auth.identities (provider_id, user_id, identity_data, provider)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{"sub": "1"}', 'email'),
  ('google-333', '33333333-3333-3333-3333-333333333333', '{"sub": "google-333", "email": "drill-three@example.test"}', 'google');

insert into public.wine_profiles (user_id, archetype, narrative, countries, regions, estates, varietals, specific_wines, identity, red_count, white_count)
values
  ('11111111-1111-1111-1111-111111111111', 'The Stellenbosch Loyalist', E'Line one\nline two\twith a tab and a \\ backslash, ''quoted''', '["south_africa", "france"]', '{"south_africa": ["stellenbosch"]}', '{"stellenbosch": ["kanonkop"]}', '["pinot_noir", "chenin_blanc"]', '["Château Musar 2016"]', '{"epithet": "drinks by the coast", "genome": {"seed": 42}}', 3, 2),
  ('22222222-2222-2222-2222-222222222222', 'The Instinctive Palate', null, '[]', '{}', '{}', '[]', '[]', null, 0, 0);

insert into public.wine_interactions (user_id, wine_name, interaction_type, rating, note, place, source_url)
values
  ('11111111-1111-1111-1111-111111111111', 'Kanonkop Paul Sauer 2019', 'had', 'loved', E'Smoky,\nlong — "perfect"', 'out', 'text_paste'),
  ('11111111-1111-1111-1111-111111111111', 'G.D. Vajra Langhe Rosso', 'want', null, null, null, null);

insert into public.dna_accumulation (user_id, dimension, dimension_value, display_name, points, interaction_count, promoted, source)
values
  ('11111111-1111-1111-1111-111111111111', 'estate', 'kanonkop', 'Kanonkop', 4, 2, true, 'auto'),
  ('11111111-1111-1111-1111-111111111111', 'country', 'south_africa', 'South Africa', 0, 0, true, 'quiz');

insert into public.dna_timeline (user_id, event_type, dimension, dimension_value, display_name, wine_name)
values ('11111111-1111-1111-1111-111111111111', 'promoted', 'estate', 'kanonkop', 'Kanonkop', 'Kanonkop Paul Sauer 2019');

insert into public.wine_events (user_id, event_type, payload, occurred_at)
values
  ('11111111-1111-1111-1111-111111111111', 'quiz_completed', '{"mode": "fresh", "title": "The Stellenbosch Loyalist"}', '2026-07-01T10:05:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'menu_analyzed', '{"match_count": 0, "sample": [{"name": "Cuvée \"X\"\twith tab"}]}', now());
