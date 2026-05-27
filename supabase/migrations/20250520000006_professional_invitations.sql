/*
# Professional invitations

Allows clinic admins to invite physiotherapists by email. When an invited user
authenticates for the first time, the app can create their profile in the
inviting clinic with role `physio`.
*/

CREATE TABLE IF NOT EXISTS public.professional_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'physio' CHECK (role IN ('physio', 'receptionist')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE public.professional_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage professional invitations" ON public.professional_invitations;
CREATE POLICY "Admins can manage professional invitations" ON public.professional_invitations
FOR ALL
USING (
  clinic_id = public.current_user_clinic_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
)
WITH CHECK (
  clinic_id = public.current_user_clinic_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Invited users can view their invitation" ON public.professional_invitations;
CREATE POLICY "Invited users can view their invitation" ON public.professional_invitations
FOR SELECT
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
  AND status = 'pending'
);

DROP POLICY IF EXISTS "Invited users can accept their invitation" ON public.professional_invitations;
CREATE POLICY "Invited users can accept their invitation" ON public.professional_invitations
FOR UPDATE
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
  AND status = 'pending'
)
WITH CHECK (
  lower(email) = lower(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Invited users can create their profile" ON public.profiles;
CREATE POLICY "Invited users can create their profile" ON public.profiles
FOR INSERT
WITH CHECK (
  id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.professional_invitations pi
    WHERE pi.clinic_id = profiles.clinic_id
      AND lower(pi.email) = lower(auth.jwt() ->> 'email')
      AND pi.status = 'pending'
      AND pi.role = profiles.role
  )
);
