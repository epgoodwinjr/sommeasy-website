-- Act III, Session 3 ("The Living Strand"): the 'shifted' timeline event is
-- an identity-level record, not a varietal/estate/region/country event.
-- Migration 006 widened event_type, but the original 003 schema ALSO checks
-- the dimension column — so 'shifted' rows (dimension='identity',
-- dimension_value = JSON before→after strand, display_name = the new title)
-- need the dimension CHECK widened too. Nothing else changes; the table
-- stays insert-only.

ALTER TABLE dna_timeline DROP CONSTRAINT dna_timeline_dimension_check;
ALTER TABLE dna_timeline ADD CONSTRAINT dna_timeline_dimension_check
  CHECK (dimension IN ('varietal', 'estate', 'region', 'country', 'identity'));
