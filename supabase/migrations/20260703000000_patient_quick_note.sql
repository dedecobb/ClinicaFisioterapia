/*
  # Patient quick note

  Adds a short operational note shown on patient cards.
*/

ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS quick_note text;
