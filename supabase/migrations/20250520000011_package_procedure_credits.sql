/*
# Package procedure credits

Stores procedure credits on each lesson package so renewals keep their own
procedure quantities and values without changing previous package data.
*/

ALTER TABLE IF EXISTS public.lesson_packages
  ADD COLUMN IF NOT EXISTS procedure_credits jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.lesson_packages
  DROP CONSTRAINT IF EXISTS lesson_packages_procedure_credits_is_array;

ALTER TABLE IF EXISTS public.lesson_packages
  ADD CONSTRAINT lesson_packages_procedure_credits_is_array
  CHECK (jsonb_typeof(procedure_credits) = 'array');
