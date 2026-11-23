-- RUN Nov 23, 2026, after PR #42 merged, with Ed's yes — on the two accounts
-- the preview named: 5 names removed (18 -> 15, 7 -> 5), order kept; the
-- preview now returns nothing. Kept as the record. Do not run it again.
-- (canary-fixes, Nov 23, 2026; docs/canary-fixes-readout.md §2)
--
-- Until Nov 23, 2026 Log a bottle copied every bottle rated loved or liked
-- into wine_profiles.specific_wines ("Wines you named" on Your palate). It
-- no longer does; the copies already written stay until this runs.
--
-- A named wine is taken for a Log copy only when BOTH hold: the journal
-- rates it loved or liked, AND a bottle_logged event names it (the ledger
-- began Aug 1, 2026). Read-only audit, Nov 23: 29 named wines on 5
-- accounts; 5 meet both, on 2 accounts. A wine the quiz ALSO named looks
-- the same — review every row of the preview before running the update.
--
-- Nothing else moves: no dna_accumulation, no dna_timeline, no identity.
-- The next recompose reads the shorter list (composeIdentity counts named
-- wines), silently, like any refresh.

-- 1. Preview (read-only)
with named as (
  select p.user_id, w as name
  from wine_profiles p, jsonb_array_elements_text(coalesce(p.specific_wines, '[]'::jsonb)) w
)
select n.user_id, n.name
from named n
where exists (select 1 from wine_interactions i
              where i.user_id = n.user_id and lower(i.wine_name) = lower(n.name)
                and i.rating in ('loved', 'liked'))
  and exists (select 1 from wine_events e
              where e.user_id = n.user_id and e.event_type = 'bottle_logged'
                and lower(e.payload->>'wine') = lower(n.name))
order by n.user_id, n.name;

-- 2. The cleanup (run only after reviewing the preview, with Ed's yes)
-- update wine_profiles p
-- set specific_wines = coalesce((
--   select jsonb_agg(w order by ord)
--   from jsonb_array_elements_text(p.specific_wines) with ordinality as t(w, ord)
--   where not (
--     exists (select 1 from wine_interactions i
--             where i.user_id = p.user_id and lower(i.wine_name) = lower(t.w)
--               and i.rating in ('loved', 'liked'))
--     and exists (select 1 from wine_events e
--                 where e.user_id = p.user_id and e.event_type = 'bottle_logged'
--                   and lower(e.payload->>'wine') = lower(t.w))
--   )
-- ), '[]'::jsonb)
-- where jsonb_array_length(coalesce(p.specific_wines, '[]'::jsonb)) > 0;
