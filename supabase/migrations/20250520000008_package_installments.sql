/*
# Package installments

Adds per-installment billing for lesson packages. Payments are registered on the
current installment, while the package keeps aggregate amount_paid/payment_status
for reports.
*/

CREATE TABLE IF NOT EXISTS public.package_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.lesson_packages(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_at timestamptz,
  payment_method text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pago', 'pendente', 'parcial', 'inadimplente')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (package_id, installment_number)
);

ALTER TABLE public.package_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage package installments in their clinic" ON public.package_installments;
CREATE POLICY "Users can manage package installments in their clinic" ON public.package_installments
FOR ALL
USING (clinic_id = public.current_user_clinic_id())
WITH CHECK (clinic_id = public.current_user_clinic_id());

INSERT INTO public.package_installments (
  clinic_id,
  package_id,
  patient_id,
  installment_number,
  amount,
  amount_paid,
  due_date,
  paid_at,
  payment_method,
  status
)
SELECT
  lp.clinic_id,
  lp.id,
  lp.patient_id,
  1,
  lp.total_amount,
  lp.amount_paid,
  lp.start_date,
  CASE WHEN lp.amount_paid >= lp.total_amount THEN now() ELSE NULL END,
  lp.payment_method,
  lp.payment_status
FROM public.lesson_packages lp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.package_installments pi
  WHERE pi.package_id = lp.id
);
