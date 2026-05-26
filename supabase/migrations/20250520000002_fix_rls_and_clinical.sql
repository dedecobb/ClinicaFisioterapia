/*
# Fix RLS Syntax and Initialize Financial/Clinical Tables

## Query Description:
This migration fixes the syntax error in the previous script (changing 'ENABLE RLS' to 'ENABLE ROW LEVEL SECURITY'), creates the missing `transactions` table for the financial module, and adds comprehensive RLS policies for all tables to resolve security advisories.

## Metadata:
- Schema-Category: Structural
- Impact-Level: Medium
- Requires-Backup: true
- Reversible: true

## Structure Details:
- Tables: transactions (New), appointments, patients, evolutions, profiles, clinics
- Security: RLS Policies for multi-tenancy based on clinic_id
*/

-- 1. Create Transactions Table if not exists
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
    description text NOT NULL,
    category text NOT NULL,
    amount decimal(12,2) NOT NULL,
    type text NOT NULL CHECK (type IN ('income', 'expense')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')),
    due_date date NOT NULL,
    paid_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 2. Enable RLS with correct syntax
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 3. Create Multi-tenant RLS Policies
-- Policy: Users can only see data belonging to their clinic
DO $$ 
BEGIN
    -- Clinics Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own clinic') THEN
        CREATE POLICY "Users can view their own clinic" ON public.clinics
        FOR SELECT USING (id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    -- Profiles Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view profiles in their clinic') THEN
        CREATE POLICY "Users can view profiles in their clinic" ON public.profiles
        FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    -- Patients Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage patients in their clinic') THEN
        CREATE POLICY "Users can manage patients in their clinic" ON public.patients
        FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    -- Appointments Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage appointments in their clinic') THEN
        CREATE POLICY "Users can manage appointments in their clinic" ON public.appointments
        FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    -- Evolutions Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage evolutions in their clinic') THEN
        CREATE POLICY "Users can manage evolutions in their clinic" ON public.evolutions
        FOR ALL USING (patient_id IN (SELECT id FROM public.patients WHERE clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())));
    END IF;

    -- Transactions Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage transactions in their clinic') THEN
        CREATE POLICY "Users can manage transactions in their clinic" ON public.transactions
        FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));
    END IF;
END $$;
