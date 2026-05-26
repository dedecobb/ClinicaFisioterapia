/*
# Final Security and Data Structure Fix
This migration corrects RLS syntax and ensures all policies are idempotent.

## Query Description:
This script enables Row Level Security using the correct PostgreSQL syntax and creates policies for all core tables. It uses `DROP POLICY IF EXISTS` to ensure it can be run multiple times without errors.

## Metadata:
- Schema-Category: Structural/Security
- Impact-Level: Medium
- Requires-Backup: false
- Reversible: true
*/

-- 1. Correcting RLS Syntax for all tables
ALTER TABLE IF EXISTS public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;

-- 2. Idempotent Policies for Clinics
DROP POLICY IF EXISTS "Users can view their own clinic" ON public.clinics;
CREATE POLICY "Users can view their own clinic" ON public.clinics
FOR SELECT USING (owner_id = auth.uid());

-- 3. Idempotent Policies for Profiles
DROP POLICY IF EXISTS "Users can view profiles in their clinic" ON public.profiles;
CREATE POLICY "Users can view profiles in their clinic" ON public.profiles
FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));

-- 4. Idempotent Policies for Patients
DROP POLICY IF EXISTS "Users can manage patients in their clinic" ON public.patients;
CREATE POLICY "Users can manage patients in their clinic" ON public.patients
FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));

-- 5. Idempotent Policies for Appointments
DROP POLICY IF EXISTS "Users can manage appointments in their clinic" ON public.appointments;
CREATE POLICY "Users can manage appointments in their clinic" ON public.appointments
FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));

-- 6. Idempotent Policies for Transactions
DROP POLICY IF EXISTS "Users can manage transactions in their clinic" ON public.transactions;
CREATE POLICY "Users can manage transactions in their clinic" ON public.transactions
FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));

-- 7. Idempotent Policies for Evolutions
DROP POLICY IF EXISTS "Users can manage evolutions in their clinic" ON public.evolutions;
CREATE POLICY "Users can manage evolutions in their clinic" ON public.evolutions
FOR ALL USING (
  patient_id IN (
    SELECT id FROM public.patients 
    WHERE clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
  )
);
