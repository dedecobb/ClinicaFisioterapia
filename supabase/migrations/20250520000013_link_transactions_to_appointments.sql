/*
# Link procedure receivables to appointments

Allows agenda-created standalone procedure appointments to create and keep their
financial receivable linked to the originating appointment.
*/

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_appointment_id_idx
  ON public.transactions (appointment_id);
