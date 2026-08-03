/*
  Physiotherapists can view their own appointments, but only clinic
  administrators may create, update, or delete appointments.
*/

DROP POLICY IF EXISTS "Admins manage all appointments and physios manage their own" ON public.appointments;
DROP POLICY IF EXISTS "Users can manage appointments in their clinic" ON public.appointments;
DROP POLICY IF EXISTS "Clinic staff can manage appointments" ON public.appointments;

CREATE POLICY "Staff view appointments in their scope"
ON public.appointments
FOR SELECT
USING (
  clinic_id = public.current_user_clinic_id()
  AND (public.current_user_is_admin() OR professional_id = auth.uid())
);

CREATE POLICY "Admins create appointments"
ON public.appointments
FOR INSERT
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND public.current_user_is_admin()
);

CREATE POLICY "Admins update appointments"
ON public.appointments
FOR UPDATE
USING (
  clinic_id = public.current_user_clinic_id()
  AND public.current_user_is_admin()
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND public.current_user_is_admin()
);

CREATE POLICY "Admins delete appointments"
ON public.appointments
FOR DELETE
USING (
  clinic_id = public.current_user_clinic_id()
  AND public.current_user_is_admin()
);
