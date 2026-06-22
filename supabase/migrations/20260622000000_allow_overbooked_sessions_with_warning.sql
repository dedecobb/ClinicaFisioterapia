/*
# Allow overbooked sessions with frontend warning

The agenda UI now warns staff when a session goes over the recommended
capacity, but the clinic can choose to keep the appointment. Keep the automatic
one-hour duration normalization and remove the database hard block.
*/

CREATE OR REPLACE FUNCTION public.enforce_appointment_session_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.end_time := NEW.start_time + interval '1 hour';
  RETURN NEW;
END;
$$;
