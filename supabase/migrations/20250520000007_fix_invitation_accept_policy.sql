/*
# Fix invitation accept policy

The first invitation policy allowed invited users to update pending invitations,
but some Supabase/Postgres flows validate the resulting row more strictly. This
policy explicitly allows the invited authenticated user to transition their own
pending invite to accepted/cancelled while preserving email ownership.
*/

DROP POLICY IF EXISTS "Invited users can accept their invitation" ON public.professional_invitations;
CREATE POLICY "Invited users can accept their invitation" ON public.professional_invitations
FOR UPDATE
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
  AND status = 'pending'
)
WITH CHECK (
  lower(email) = lower(auth.jwt() ->> 'email')
  AND accepted_by = auth.uid()
  AND status IN ('accepted', 'cancelled')
);

DROP POLICY IF EXISTS "Invited users can view accepted invitation" ON public.professional_invitations;
CREATE POLICY "Invited users can view accepted invitation" ON public.professional_invitations
FOR SELECT
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
  AND status IN ('pending', 'accepted')
);
