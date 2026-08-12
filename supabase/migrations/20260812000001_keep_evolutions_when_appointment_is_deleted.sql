/*
  A evolução clínica deve permanecer no prontuário quando o agendamento a que
  ela se referia for excluído. Assim, a aula pode ser removida da Agenda sem
  impedir a operação por chave estrangeira.
*/

ALTER TABLE public.evolutions
  DROP CONSTRAINT IF EXISTS evolutions_appointment_id_fkey;

ALTER TABLE public.evolutions
  ADD CONSTRAINT evolutions_appointment_id_fkey
  FOREIGN KEY (appointment_id)
  REFERENCES public.appointments(id)
  ON DELETE SET NULL;
