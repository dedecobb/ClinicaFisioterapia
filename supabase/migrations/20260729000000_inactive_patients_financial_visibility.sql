/*
  Inactive patients are retained for administrative records, but must not be
  available to non-admin staff or included in financial collections.
*/

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_status_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_status_check
  CHECK (status IN ('ativo', 'pausado', 'inadimplente', 'inativo', 'encerrado'));

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

DROP POLICY IF EXISTS "Users can manage patients in their clinic" ON public.patients;
DROP POLICY IF EXISTS "Clinic staff can manage patients" ON public.patients;

CREATE POLICY "Staff can view active patients and admins can view inactive patients"
ON public.patients
FOR SELECT
USING (
  clinic_id = public.current_user_clinic_id()
  AND (status <> 'inativo' OR public.current_user_is_admin())
);

CREATE POLICY "Staff can create active patients and admins can create inactive patients"
ON public.patients
FOR INSERT
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND (status <> 'inativo' OR public.current_user_is_admin())
);

CREATE POLICY "Staff can update active patients and admins can manage inactive patients"
ON public.patients
FOR UPDATE
USING (
  clinic_id = public.current_user_clinic_id()
  AND (status <> 'inativo' OR public.current_user_is_admin())
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND (status <> 'inativo' OR public.current_user_is_admin())
);

CREATE POLICY "Staff can delete active patients and admins can delete inactive patients"
ON public.patients
FOR DELETE
USING (
  clinic_id = public.current_user_clinic_id()
  AND (status <> 'inativo' OR public.current_user_is_admin())
);

-- Financial and scheduling data is scoped to the logged-in physiotherapist.
-- Administrators retain the clinic-wide view.
DROP POLICY IF EXISTS "Users can manage appointments in their clinic" ON public.appointments;
DROP POLICY IF EXISTS "Clinic staff can manage appointments" ON public.appointments;
CREATE POLICY "Admins manage all appointments and physios manage their own"
ON public.appointments
FOR ALL
USING (
  clinic_id = public.current_user_clinic_id()
  AND (public.current_user_is_admin() OR professional_id = auth.uid())
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND (public.current_user_is_admin() OR professional_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage lesson packages in their clinic" ON public.lesson_packages;
CREATE POLICY "Admins manage all packages and physios manage their own"
ON public.lesson_packages
FOR ALL
USING (
  clinic_id = public.current_user_clinic_id()
  AND (public.current_user_is_admin() OR professional_id = auth.uid())
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND (public.current_user_is_admin() OR professional_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage package installments in their clinic" ON public.package_installments;
CREATE POLICY "Admins manage all installments and physios view their own"
ON public.package_installments
FOR ALL
USING (
  clinic_id = public.current_user_clinic_id()
  AND EXISTS (
    SELECT 1
    FROM public.lesson_packages package_item
    WHERE package_item.id = package_installments.package_id
      AND (public.current_user_is_admin() OR package_item.professional_id = auth.uid())
  )
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND EXISTS (
    SELECT 1
    FROM public.lesson_packages package_item
    WHERE package_item.id = package_installments.package_id
      AND (public.current_user_is_admin() OR package_item.professional_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can manage transactions in their clinic" ON public.transactions;
DROP POLICY IF EXISTS "Clinic staff can manage transactions" ON public.transactions;
CREATE POLICY "Admins can manage all clinic transactions"
ON public.transactions
FOR ALL
USING (
  clinic_id = public.current_user_clinic_id()
  AND public.current_user_is_admin()
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND public.current_user_is_admin()
);

CREATE POLICY "Physios can view only their commission payments"
ON public.transactions
FOR SELECT
USING (
  clinic_id = public.current_user_clinic_id()
  AND NOT public.current_user_is_admin()
  AND type = 'expense'
  AND category = 'Comissão fisioterapeuta'
  AND description ILIKE '%' || auth.uid()::text || '%'
);
