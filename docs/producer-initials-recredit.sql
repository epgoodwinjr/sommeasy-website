-- PREPARED, NOT APPLIED. Run only on Ed's explicit OK, after the
-- producer-initials PR is merged and deployed (so the app resolves the row
-- the same way the next time it is touched).
--
-- What it does: credits Nicola's one "liked" bottle, "G.D. Vajra Langhe
-- Rosso" (wine_interactions 1aec65f2-…), exactly as resolveAndAccumulate
-- does under the fixed resolver — confidence 40 -> 90, the full band, +1
-- point and +1 bottle on its three dimensions. Zero dna_timeline rows, zero
-- wine_events, identity untouched (the S5 precedent: a migration is never
-- rating evidence). Every statement is guarded on the state measured
-- Nov 22, 2026, so a re-run, or a row that moved since, changes nothing:
-- check the row counts each statement reports — the expected count is 1.
--
-- Before -> after (Nov 22, 2026 readings):
--   wine_interactions 1aec65f2-…: resolved_winery null -> 'G D Vajra',
--     resolved_province null -> 'Piedmont', match_confidence 40 -> 90,
--     resolved_at 2026-11-02 01:15:17 -> now(); resolved_region 'langhe',
--     resolved_country 'Italy', resolved_varietal null unchanged
--   dna_accumulation country/italy: points 0 -> 1, interaction_count 0 -> 1
--     (row stays source 'quiz', promoted true)
--   dna_accumulation region/piedmont: (none) -> 1 point, 1 bottle, 'auto'
--   dna_accumulation estate/g_d_vajra: (none) -> 1 point, 1 bottle, 'auto'
-- No threshold is reached (estate 4, region 10; Italy already promoted), so
-- no promotion and no event would have been written by the live path either.

begin;

update wine_interactions
   set resolved_winery = 'G D Vajra',
       resolved_province = 'Piedmont',
       match_confidence = 90,
       resolved_at = now()
 where id = '1aec65f2-f674-4386-9a7b-0869e3c29802'
   and user_id = '33430bb8-5b71-4106-b717-27b93aed7c60'
   and wine_name = 'G.D. Vajra Langhe Rosso'
   and rating = 'liked'
   and match_confidence = 40;

update dna_accumulation
   set points = points + 1,
       interaction_count = interaction_count + 1,
       updated_at = now()
 where user_id = '33430bb8-5b71-4106-b717-27b93aed7c60'
   and dimension = 'country' and dimension_value = 'italy'
   and points = 0 and interaction_count = 0;

insert into dna_accumulation (user_id, dimension, dimension_value, display_name, points, interaction_count, mappable, source)
values
  ('33430bb8-5b71-4106-b717-27b93aed7c60', 'region', 'piedmont', 'Piedmont', 1, 1, true, 'auto'),
  ('33430bb8-5b71-4106-b717-27b93aed7c60', 'estate', 'g_d_vajra', 'G D Vajra', 1, 1, true, 'auto')
on conflict (user_id, dimension, dimension_value) do nothing;

-- Verify before committing: expect 90 / 1,1 / 1,1 / 1,1 / 0 timeline rows
select (select match_confidence from wine_interactions where id = '1aec65f2-f674-4386-9a7b-0869e3c29802') as confidence,
       (select json_agg(json_build_object('d', dimension, 'v', dimension_value, 'p', points, 'n', interaction_count) order by dimension)
          from dna_accumulation
         where user_id = '33430bb8-5b71-4106-b717-27b93aed7c60'
           and (dimension, dimension_value) in (('country','italy'), ('region','piedmont'), ('estate','g_d_vajra'))) as dims,
       (select count(*) from dna_timeline where user_id = '33430bb8-5b71-4106-b717-27b93aed7c60') as timeline_rows;

commit;
