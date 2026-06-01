/*
# Patient procedures

Stores the procedures chosen in the patient registration. Each item keeps the
procedure type, display name and agreed value for that patient.
*/

ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS procedures jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.patients
  DROP CONSTRAINT IF EXISTS patients_procedures_is_array;

ALTER TABLE IF EXISTS public.patients
  ADD CONSTRAINT patients_procedures_is_array
  CHECK (jsonb_typeof(procedures) = 'array');

ALTER TABLE IF EXISTS public.lesson_packages
  ADD COLUMN IF NOT EXISTS procedure_amount numeric(12,2) NOT NULL DEFAULT 0;
