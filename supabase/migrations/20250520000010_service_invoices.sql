/*
# Service invoices / NFS-e preparation

Keeps an operational ledger of service invoices prepared inside the app. The
records work without a fiscal provider and can later be sent to a NFe.io proxy.
*/

CREATE TABLE IF NOT EXISTS public.service_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  service_description text NOT NULL,
  service_code text,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'processing', 'issued', 'error', 'cancelled')),
  provider text NOT NULL DEFAULT 'nfeio',
  provider_invoice_id text,
  verification_url text,
  requested_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_response jsonb,
  error_message text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS service_invoices_clinic_created_idx
  ON public.service_invoices (clinic_id, created_at DESC);

ALTER TABLE public.service_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage service invoices in their clinic" ON public.service_invoices;
CREATE POLICY "Users can manage service invoices in their clinic" ON public.service_invoices
FOR ALL
USING (clinic_id = public.current_user_clinic_id())
WITH CHECK (clinic_id = public.current_user_clinic_id());
