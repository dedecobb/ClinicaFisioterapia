/*
# Financial System & Security Policies
Adding the financial infrastructure and securing existing tables with RLS policies.

## Query Description:
This migration creates the `transactions` table to track clinic finances and implements Row Level Security (RLS) policies for all core tables to ensure data isolation between clinics.

## Metadata:
- Schema-Category: Structural
- Impact-Level: Medium
- Requires-Backup: true
- Reversible: true

## Structure Details:
- New Table: `transactions` (income/expense tracking)
- Policies: Added for `clinics`, `profiles`, `patients`, `appointments`, `evolutions`, and `transactions`.
*/

-- Create Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')),
    description TEXT,
    due_date DATE NOT NULL,
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE RLS;

-- RLS POLICIES (Addressing Security Advisories)

-- 1. Clinics: Only owners can see their clinic
CREATE POLICY "Users can view their own clinic" ON public.clinics
    FOR SELECT USING (owner_id = auth.uid());

-- 2. Profiles: Users can see profiles within their clinic
CREATE POLICY "Clinic staff can view profiles" ON public.profiles
    FOR SELECT USING (clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 3. Patients: Clinic staff can manage patients
CREATE POLICY "Clinic staff can manage patients" ON public.patients
    FOR ALL USING (clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 4. Appointments: Clinic staff can manage appointments
CREATE POLICY "Clinic staff can manage appointments" ON public.appointments
    FOR ALL USING (clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 5. Evolutions: Clinic staff can manage clinical records
CREATE POLICY "Clinic staff can manage evolutions" ON public.evolutions
    FOR ALL USING (patient_id IN (
        SELECT id FROM public.patients WHERE clinic_id IN (
            SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
        )
    ));

-- 6. Transactions: Clinic staff can manage finances
CREATE POLICY "Clinic staff can manage transactions" ON public.transactions
    FOR ALL USING (clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
    ));
