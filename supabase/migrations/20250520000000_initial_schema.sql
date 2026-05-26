/*
  # FisioFlow Initial Schema
  
  ## Query Description:
  This migration sets up the core tables for the FisioFlow SaaS, including multi-tenant support for clinics, patient records, clinical evolutions, and appointment scheduling.
  
  ## Metadata:
  - Schema-Category: Structural
  - Impact-Level: High
  - Requires-Backup: false
  - Reversible: true
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clinics (Multi-tenant)
CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (Staff)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  clinic_id UUID REFERENCES public.clinics(id),
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'physio', 'receptionist')),
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Patients
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id),
  full_name TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  phone TEXT,
  birth_date DATE,
  gender TEXT,
  address JSONB,
  clinical_notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id),
  patient_id UUID REFERENCES public.patients(id),
  professional_id UUID REFERENCES public.profiles(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL, -- 'fisioterapia', 'pilates', 'avaliacao'
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'missed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Clinical Evolution (Prontuário)
CREATE TABLE IF NOT EXISTS public.evolutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES public.patients(id),
  professional_id UUID REFERENCES public.profiles(id),
  appointment_id UUID REFERENCES public.appointments(id),
  content TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolutions ENABLE ROW LEVEL SECURITY;

-- Example Policy: Users can only see data from their clinic
CREATE POLICY "Users can view their own clinic data" ON public.patients
  FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));
