import { supabase } from "../../lib/supabase";
import { NewPatientForm, Patient } from "./types";

const PATIENTS_TABLE = "patients";

type SupabaseErrorLike = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatSupabaseError(action: string, error: SupabaseErrorLike): Error {
  const extra = [error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
  const suffix = extra ? ` (${extra})` : "";

  return new Error(`${action} na tabela ${PATIENTS_TABLE}: ${error.message}${suffix}`);
}

export async function listarPacientes(
  clinicId: string,
  searchTerm = "",
): Promise<Patient[]> {
  let query = supabase
    .from(PATIENTS_TABLE)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, created_at",
    )
    .eq("clinic_id", clinicId)
    .order("full_name", { ascending: true });

  const term = searchTerm.trim();

  if (term) {
    const escapedTerm = term.replace(/[%_,]/g, "");
    query = query.or(
      `full_name.ilike.%${escapedTerm}%,cpf.ilike.%${escapedTerm}%,phone.ilike.%${escapedTerm}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw formatSupabaseError("Erro ao buscar pacientes", error);
  }

  return (data ?? []) as Patient[];
}

export async function criarPaciente(
  clinicId: string,
  form: NewPatientForm,
): Promise<Patient> {
  const { data, error } = await supabase
    .from(PATIENTS_TABLE)
    .insert({
      clinic_id: clinicId,
      full_name: form.full_name.trim(),
      cpf: emptyToNull(form.cpf),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      birth_date: emptyToNull(form.birth_date),
      gender: emptyToNull(form.gender),
      status: "active",
    })
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, created_at",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao cadastrar paciente", error);
  }

  return data as Patient;
}
