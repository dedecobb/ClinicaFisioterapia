export type PatientStatus = "ativo" | "pausado" | "inadimplente" | "encerrado";

export type PaymentStatus = "pago" | "pendente" | "parcial" | "inadimplente";

export interface PackageSummary {
  id: string;
  total_lessons: number;
  completed_lessons: number;
  missed_lessons: number;
  justified_absences: number;
  justified_absence_limit: number;
  lesson_value: number;
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
  plan_start_date: string;
  contracted_lessons: number;
  fixed_weekdays: number[];
  fixed_time: string;
  lesson_duration_minutes: number;
  responsible_professional_id: string;
  lesson_value: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string;
  payment_status: PaymentStatus;
  installments: number;
}
