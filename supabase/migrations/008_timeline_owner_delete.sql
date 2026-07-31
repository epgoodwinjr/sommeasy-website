-- Act III, Session 3: an owner-scoped DELETE policy on dna_timeline.
--
-- The timeline stays insert-only AS THE APP'S CONTRACT — no product code
-- path deletes or rewrites history, and UPDATE remains impossible (no
-- policy). This policy exists because the identity-shift e2e guard must
-- restore its exact baseline (Ed's S3 mandate: "restore the exact baseline
-- including … the shifted event"), and the e2e suite deliberately runs as
-- the test user under RLS with no service key. Owners deleting their own
-- history rows is a capability, not a behavior — nothing exercises it
-- outside the guard's teardown.

CREATE POLICY "Users can delete own timeline" ON dna_timeline
  FOR DELETE USING (auth.uid() = user_id);
