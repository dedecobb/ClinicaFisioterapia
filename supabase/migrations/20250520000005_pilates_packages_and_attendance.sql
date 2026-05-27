/*
# Pilates packages, attendance statuses and commission base

Adds the operational model requested by the clinic owner: clients buy lesson
packages, fixed class slots are generated into the agenda, and each class can
carry the attendance/absence status used later by WhatsApp, finance and reports.
*/

ALTER TABLE IF EXISTS public.patients
  DROP CONSTRAINT IF EXISTS patients_status_check;

UPDATE public.patients
SET status = CASE status
  WHEN 'active' THEN 'ativo'
  WHEN 'inactive' THEN 'encerrado'
  ELSE status
END;

ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS plan_start_date date,
  ADD COLUMN IF NOT EXISTS contracted_lessons integer,
  ADD COLUMN IF NOT EXISTS fixed_weekdays integer[],
  ADD COLUMN IF NOT EXISTS fixed_time time,
  ADD COLUMN IF NOT EXISTS responsible_professional_id uuid REFERENCES public.profiles(id);

ALTER TABLE IF EXISTS public.patients
  ADD CONSTRAINT patients_status_check
  CHECK (status IN ('ativo', 'pausado', 'inadimplente', 'encerrado'));

CREATE TABLE IF NOT EXISTS public.lesson_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_lessons integer NOT NULL CHECK (total_lessons > 0),
  completed_lessons integer NOT NULL DEFAULT 0,
  missed_lessons integer NOT NULL DEFAULT 0,
  justified_absences integer NOT NULL DEFAULT 0,
  justified_absence_limit integer NOT NULL DEFAULT 2,
  lesson_value numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pendente'
    CHECK (payment_status IN ('pago', 'pendente', 'parcial', 'inadimplente')),
  installments integer NOT NULL DEFAULT 1 CHECK (installments > 0),
  start_date date NOT NULL,
  expected_end_date date,
  fixed_weekdays integer[] NOT NULL,
  fixed_time time NOT NULL,
  lesson_duration_minutes integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

UPDATE public.appointments
SET status = CASE status
  WHEN 'scheduled' THEN 'agendada'
  WHEN 'confirmed' THEN 'confirmada'
  WHEN 'completed' THEN 'presenca_registrada'
  WHEN 'missed' THEN 'falta'
  WHEN 'cancelled' THEN 'cancelada'
  ELSE status
END;

ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.lesson_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_lesson_number integer,
  ADD COLUMN IF NOT EXISTS class_price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_notes text,
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'agendada',
      'confirmada',
      'presenca_registrada',
      'ausencia_justificada',
      'falta',
      'reposicao',
      'cancelada'
    )
  );

ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage lesson packages in their clinic" ON public.lesson_packages;
CREATE POLICY "Users can manage lesson packages in their clinic" ON public.lesson_packages
FOR ALL
USING (clinic_id = public.current_user_clinic_id())
WITH CHECK (clinic_id = public.current_user_clinic_id());
