-- Permite definir a comissão apenas para uma aula substituída/avulsa,
-- sem modificar o valor ou a comissão das demais aulas do pacote.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2) NOT NULL DEFAULT 0
  CHECK (commission_amount >= 0);
