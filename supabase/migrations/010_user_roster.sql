-- The Long Memory: user_roster — the founder's CRM at current scale.
-- One row per auth user: who they are, when they arrived, what they've done,
-- who their palate says they are. Queried from the SQL Editor (service
-- role); this is deliberately NOT a product surface.
--
-- Access reasoning: this is a definer-rights view (Postgres default), which
-- means it reads THROUGH RLS and across auth.users — so client roles must
-- never see it. The REVOKEs below strip the default public-schema grants
-- from anon/authenticated; only postgres/service_role (the SQL Editor and
-- any future founder tooling) can select it. security_invoker=true was the
-- alternative, but it would break under service_role anyway less cleanly
-- than a plain revoke, and client roles have no business here at all.

CREATE OR REPLACE VIEW user_roster AS
SELECT
  u.id                                          AS user_id,
  u.email,
  u.created_at                                  AS signed_up_at,
  p.archetype                                   AS title,
  p.identity ->> 'epithet'                      AS epithet,
  (SELECT COUNT(*) FROM wine_interactions wi
     WHERE wi.user_id = u.id AND wi.rating IS NOT NULL)          AS bottles_rated,
  (SELECT COUNT(*) FROM dna_timeline t
     WHERE t.user_id = u.id AND t.event_type = 'shifted')        AS shift_count,
  (SELECT COUNT(*) FROM wine_events e
     WHERE e.user_id = u.id)                                     AS events_count,
  (SELECT MAX(e.occurred_at) FROM wine_events e
     WHERE e.user_id = u.id)                                     AS last_event_at,
  NOW() - COALESCE(p.narrative_updated_at, p.created_at)         AS narrative_age
FROM auth.users u
LEFT JOIN wine_profiles p ON p.user_id = u.id
ORDER BY u.created_at;

REVOKE ALL ON user_roster FROM anon, authenticated;
