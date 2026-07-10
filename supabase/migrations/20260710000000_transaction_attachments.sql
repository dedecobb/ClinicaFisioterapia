/*
# Transaction documents support

Adds attachments support to financial transactions and creates a secure
storage bucket for expense documents.
*/

ALTER TABLE IF EXISTS public.transactions
  ADD COLUMN IF NOT EXISTS attachments TEXT[];

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'transaction-docs',
  'transaction-docs',
  true,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Clinic staff can view transaction docs" ON storage.objects;
CREATE POLICY "Clinic staff can view transaction docs" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'transaction-docs'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE clinic_id = public.current_user_clinic_id()
      AND profiles.clinic_id = public.current_user_clinic_id()
  )
);

DROP POLICY IF EXISTS "Clinic staff can upload transaction docs" ON storage.objects;
CREATE POLICY "Clinic staff can upload transaction docs" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transaction-docs'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE clinic_id = public.current_user_clinic_id()
      AND profiles.clinic_id = public.current_user_clinic_id()
  )
);

DROP POLICY IF EXISTS "Clinic staff can update transaction docs" ON storage.objects;
CREATE POLICY "Clinic staff can update transaction docs" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'transaction-docs'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE clinic_id = public.current_user_clinic_id()
      AND profiles.clinic_id = public.current_user_clinic_id()
  )
)
WITH CHECK (
  bucket_id = 'transaction-docs'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE clinic_id = public.current_user_clinic_id()
      AND profiles.clinic_id = public.current_user_clinic_id()
  )
);

DROP POLICY IF EXISTS "Clinic staff can delete transaction docs" ON storage.objects;
CREATE POLICY "Clinic staff can delete transaction docs" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'transaction-docs'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE clinic_id = public.current_user_clinic_id()
      AND profiles.clinic_id = public.current_user_clinic_id()
  )
);
