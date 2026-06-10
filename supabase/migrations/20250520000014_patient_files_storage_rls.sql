/*
# Patient file storage policies

Creates the Storage bucket used by patient record attachments and allows clinic
staff to manage files only for patients that belong to their own clinic.
*/

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'patient-files',
  'patient-files',
  true,
  10485760,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Clinic staff can view patient files" ON storage.objects;
CREATE POLICY "Clinic staff can view patient files" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-files'
  AND EXISTS (
    SELECT 1
    FROM public.patients
    WHERE patients.id::text = (storage.foldername(name))[1]
      AND patients.clinic_id = public.current_user_clinic_id()
  )
);

DROP POLICY IF EXISTS "Clinic staff can upload patient files" ON storage.objects;
CREATE POLICY "Clinic staff can upload patient files" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'patient-files'
  AND EXISTS (
    SELECT 1
    FROM public.patients
    WHERE patients.id::text = (storage.foldername(name))[1]
      AND patients.clinic_id = public.current_user_clinic_id()
  )
);

DROP POLICY IF EXISTS "Clinic staff can update patient files" ON storage.objects;
CREATE POLICY "Clinic staff can update patient files" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'patient-files'
  AND EXISTS (
    SELECT 1
    FROM public.patients
    WHERE patients.id::text = (storage.foldername(name))[1]
      AND patients.clinic_id = public.current_user_clinic_id()
  )
)
WITH CHECK (
  bucket_id = 'patient-files'
  AND EXISTS (
    SELECT 1
    FROM public.patients
    WHERE patients.id::text = (storage.foldername(name))[1]
      AND patients.clinic_id = public.current_user_clinic_id()
  )
);

DROP POLICY IF EXISTS "Clinic staff can delete patient files" ON storage.objects;
CREATE POLICY "Clinic staff can delete patient files" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'patient-files'
  AND EXISTS (
    SELECT 1
    FROM public.patients
    WHERE patients.id::text = (storage.foldername(name))[1]
      AND patients.clinic_id = public.current_user_clinic_id()
  )
);
