export type PatientStatus = "active" | "inactive";

export interface Patient {
  id: string;
  clinic_id: string;
  full_name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  gender: string | null;
  status: PatientStatus;
  created_at: string | null;
}

export interface NewPatientForm {
  full_name: string;
  cpf: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: string;
}
