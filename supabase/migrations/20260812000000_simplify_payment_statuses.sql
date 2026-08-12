/*
  Payment statuses are intentionally binary across packages and installments.
  Existing partially paid and delinquent records remain financially intact
  (amount_paid is not changed), but are represented as pending until settled.
*/

UPDATE public.lesson_packages
SET payment_status = 'pendente'
WHERE payment_status IN ('parcial', 'inadimplente');

UPDATE public.package_installments
SET status = 'pendente'
WHERE status IN ('parcial', 'inadimplente');

ALTER TABLE public.lesson_packages
  DROP CONSTRAINT IF EXISTS lesson_packages_payment_status_check;

ALTER TABLE public.lesson_packages
  ADD CONSTRAINT lesson_packages_payment_status_check
  CHECK (payment_status IN ('pago', 'pendente'));

ALTER TABLE public.package_installments
  DROP CONSTRAINT IF EXISTS package_installments_status_check;

ALTER TABLE public.package_installments
  ADD CONSTRAINT package_installments_status_check
  CHECK (status IN ('pago', 'pendente'));
