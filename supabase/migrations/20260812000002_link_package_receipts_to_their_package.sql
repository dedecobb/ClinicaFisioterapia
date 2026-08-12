/*
  Mantém cada recebimento de pacote vinculado à contratação/renovação que o
  originou. Dessa forma, pagamentos de uma renovação não podem ser associados
  a parcelas de pacotes anteriores do mesmo paciente.
*/

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS package_id uuid
  REFERENCES public.lesson_packages(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_package_id_idx
  ON public.transactions (package_id);
