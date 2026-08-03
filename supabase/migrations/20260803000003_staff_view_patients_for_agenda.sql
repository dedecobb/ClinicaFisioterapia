/*
  The agenda embeds the patient record in each appointment. Staff must be able
  to read patients from their clinic (including inactive ones) for those cards
  to render. Appointment write policies remain restricted to administrators.
*/

DROP POLICY IF EXISTS "Staff can view active patients and admins can view inactive patients" ON public.patients;

CREATE POLICY "Clinic staff view patients in their clinic"
ON public.patients
FOR SELECT
USING (clinic_id = public.current_user_clinic_id());
