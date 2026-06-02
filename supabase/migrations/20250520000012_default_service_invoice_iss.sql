/*
# Default fiscal fields for service invoices

Keeps the database defaults aligned with the NFS-e form defaults.
*/

ALTER TABLE public.service_invoices
  ALTER COLUMN tax_rate SET DEFAULT 2.01;

ALTER TABLE public.service_invoices
  ALTER COLUMN service_code SET DEFAULT '04.08.02';
