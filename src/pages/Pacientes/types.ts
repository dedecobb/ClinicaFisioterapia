export type PatientStatus = "ativo" | "pausado" | "inadimplente" | "encerrado";

export type PaymentStatus = "pago" | "pendente" | "parcial" | "inadimplente";

export const PROCEDURE_OPTIONS = [
  { type: "rpg", name: "RPG" },
  { type: "drenagem_linfatica", name: "Drenagem linfática" },
  { type: "liberacao_miofascial", name: "Liberação miofascial" },
  { type: "massagem_relaxante", name: "Massagem relaxante" },
  { type: "fisioterapia", name: "Fisioterapia" },
  { type: "fisioterapia_pelvica", name: "Fisioterapia pélvica" },
] as const;

export type ProcedureType = (typeof PROCEDURE_OPTIONS)[number]["type"];

export interface PatientAddress {
  country?: string | null;
  postalCode?: string | null;
  street?: string | null;
  number?: string | null;
  additionalInformation?: string | null;
  district?: string | null;
  city?: {
    code?: string | null;
    name?: string | null;
  } | null;
  state?: string | null;
}

export interface PatientAddressForm {
  postalCode: string;
  street: string;
  number: string;
  additionalInformation: string;
  district: string;
  cityCode: string;
  cityName: string;
  state: string;
}

export interface PatientProcedure {
  type: ProcedureType;
  name: string;
  agreed_value: number;
  quantity: number;
  scheduled_date?: string;
  scheduled_time?: string;
  schedule?: PatientProcedureSchedule[];
}

export interface PatientProcedureSchedule {
  date: string;
  time: string;
  status?: "agendada" | "presenca_registrada";
}

export interface PackageSummary {
  id: string;
  total_lessons: number;
  completed_lessons: number;
  missed_lessons: number;
  justified_absences: number;
  justified_absence_limit: number;
  lesson_value: number;
  procedure_amount: number;
  procedure_credits: PatientProcedure[] | null;
  total_amount: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  installments: number;
  start_date: string;
  expected_end_date: string | null;
  fixed_weekdays: number[];
  fixed_time: string;
  status: "ativo" | "concluido" | "cancelado";
}

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
  plan_start_date: string | null;
  contracted_lessons: number | null;
  fixed_weekdays: number[] | null;
  fixed_time: string | null;
  responsible_professional_id: string | null;
  address: PatientAddress | string | null;
  procedures: PatientProcedure[] | null;
  created_at: string | null;
  lesson_packages?: PackageSummary[];
}

export interface NewPatientForm {
  full_name: string;
  cpf: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: string;
  status: PatientStatus;
  address: PatientAddressForm;
  plan_start_date: string;
  contracted_lessons: number;
  fixed_weekdays: number[];
  fixed_time: string;
  lesson_duration_minutes: number;
  responsible_professional_id: string;
  procedures: PatientProcedure[];
  lesson_value: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string;
  payment_status: PaymentStatus;
  installments: number;
}
