/*
# Fix profile/patient RLS for authenticated clinic users

This migration avoids recursive profile policy checks and makes patient inserts
explicitly validate the user's clinic_id.
*/

CREATE OR REPLACE FUNCTION public.current_user_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_user_clinic_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.user_owns_clinic(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinics
    WHERE id = target_clinic_id
      AND owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_clinic(uuid) TO authenticated;

ALTER TABLE IF EXISTS public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own clinic" ON public.clinics;
CREATE POLICY "Users can view their own clinic" ON public.clinics
FOR SELECT
USING (
  owner_id = auth.uid()
  OR id = public.current_user_clinic_id()
);

DROP POLICY IF EXISTS "Users can create owned clinics" ON public.clinics;
CREATE POLICY "Users can create owned clinics" ON public.clinics
FOR INSERT
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update owned clinics" ON public.clinics;
CREATE POLICY "Users can update owned clinics" ON public.clinics
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can view profiles in their clinic" ON public.profiles;
DROP POLICY IF EXISTS "Clinic staff can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles in their clinic" ON public.profiles
FOR SELECT
USING (
  id = auth.uid()
  OR clinic_id = public.current_user_clinic_id()
);

DROP POLICY IF EXISTS "Users can create their owner profile" ON public.profiles;
CREATE POLICY "Users can create their owner profile" ON public.profiles
FOR INSERT
WITH CHECK (
  id = auth.uid()
  AND public.user_owns_clinic(clinic_id)
);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can manage patients in their clinic" ON public.patients;
DROP POLICY IF EXISTS "Clinic staff can manage patients" ON public.patients;
DROP POLICY IF EXISTS "Users can view their own clinic data" ON public.patients;
CREATE POLICY "Users can manage patients in their clinic" ON public.patients
FOR ALL
USING (clinic_id = public.current_user_clinic_id())
WITH CHECK (clinic_id = public.current_user_clinic_id());

DROP POLICY IF EXISTS "Users can manage appointments in their clinic" ON public.appointments;
DROP POLICY IF EXISTS "Clinic staff can manage appointments" ON public.appointments;
CREATE POLICY "Users can manage appointments in their clinic" ON public.appointments
FOR ALL
USING (clinic_id = public.current_user_clinic_id())
WITH CHECK (clinic_id = public.current_user_clinic_id());

DROP POLICY IF EXISTS "Users can manage transactions in their clinic" ON public.transactions;
DROP POLICY IF EXISTS "Clinic staff can manage transactions" ON public.transactions;
CREATE POLICY "Users can manage transactions in their clinic" ON public.transactions
FOR ALL
USING (clinic_id = public.current_user_clinic_id())
WITH CHECK (clinic_id = public.current_user_clinic_id());
