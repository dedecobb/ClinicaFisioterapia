/*
# Agenda session duration and capacity

Keeps every appointment session at 60 minutes and blocks more than five active
patients in the same clinic at the same session start time, regardless of the
assigned professional.
*/

ALTER TABLE IF EXISTS public.lesson_packages
  ALTER COLUMN lesson_duration_minutes SET DEFAULT 60;

UPDATE public.lesson_packages
SET lesson_duration_minutes = 60
WHERE lesson_duration_minutes IS DISTINCT FROM 60;

UPDATE public.appointments
SET end_time = start_time + interval '1 hour'
WHERE end_time IS DISTINCT FROM start_time + interval '1 hour';

CREATE OR REPLACE FUNCTION public.enforce_appointment_session_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
BEGIN
  NEW.end_time := NEW.start_time + interval '1 hour';

  IF NEW.status <> 'cancelada' THEN
    SELECT count(*)
      INTO active_count
      FROM public.appointments a
      WHERE a.clinic_id = NEW.clinic_id
        AND a.start_time = NEW.start_time
        AND a.status <> 'cancelada'
        AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

    IF active_count >= 5 THEN
      RAISE EXCEPTION
        'Esta sessão já tem 5 pacientes neste horário. Escolha outro horário.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_appointment_session_rules_trigger
  ON public.appointments;

CREATE TRIGGER enforce_appointment_session_rules_trigger
BEFORE INSERT OR UPDATE OF start_time, end_time, status, clinic_id
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_appointment_session_rules();
