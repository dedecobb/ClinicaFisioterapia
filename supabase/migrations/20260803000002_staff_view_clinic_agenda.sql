/*
  All clinic staff may view the complete agenda. Appointment changes remain
  restricted to administrators by the policies created previously.
*/

DROP POLICY IF EXISTS "Staff view appointments in their scope" ON public.appointments;

CREATE POLICY "Clinic staff view all clinic appointments"
ON public.appointments
FOR SELECT
USING (clinic_id = public.current_user_clinic_id());
