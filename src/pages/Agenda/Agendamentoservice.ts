import { supabase } from "../../lib/supabase";
import {
  Agendamento,
  Fisioterapeuta,
  NovoAgendamentoForm,
  Paciente,
  StatusAgendamento,
  TipoSessao,
} from "./types";

type PatientDB = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
};

type ProfessionalDB = {
  id: string;
  full_name: string;
  role: string | null;
};

type AppointmentStatusDB =
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "missed";

type AppointmentDB = {
  id: string;
  patient_id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  type: string;
  status: AppointmentStatusDB;
  notes: string | null;
  patients: PatientDB | null;
  profiles: ProfessionalDB | null;
};

const PROFESSIONAL_COLORS = [
  "#0F6E56",
  "#185FA5",
  "#993C1D",
  "#7C3AED",
  "#C2410C",
];

const statusFromDb: Record<AppointmentStatusDB, StatusAgendamento> = {
  scheduled: "pendente",
  confirmed: "confirmado",
  cancelled: "cancelado",
  completed: "concluido",
  missed: "cancelado",
};

const statusToDb: Record<StatusAgendamento, AppointmentStatusDB> = {
  pendente: "scheduled",
  confirmado: "confirmed",
  cancelado: "cancelled",
  concluido: "completed",
};

function toTime(value: string): string {
  return new Date(value).toISOString().slice(11, 16);
}

function toDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function toTipoSessao(value: string): TipoSessao {
  const tipos: TipoSessao[] = [
    "Avaliação Inicial",
    "Fisioterapia Ortopédica",
    "Fisioterapia Neurológica",
    "Fisioterapia Respiratória",
    "Pilates Clínico",
    "RPG",
    "Acupuntura",
    "Hidroterapia",
  ];

  return tipos.includes(value as TipoSessao)
    ? (value as TipoSessao)
    : "Fisioterapia Ortopédica";
}

function toPaciente(db: PatientDB): Paciente {
  return {
    id: db.id,
    nome: db.full_name,
    telefone: db.phone ?? "",
    email: db.email ?? "",
    dataNascimento: db.birth_date ?? "",
  };
}

function toFisioterapeuta(
  db: ProfessionalDB,
  index = 0,
): Fisioterapeuta {
  return {
    id: db.id,
    nome: db.full_name,
    especialidade: db.role === "physio" ? "Fisioterapia" : db.role ?? "",
    cor: PROFESSIONAL_COLORS[index % PROFESSIONAL_COLORS.length],
  };
}

function toAgendamento(db: AppointmentDB): Agendamento {
  if (!db.patients || !db.profiles) {
    throw new Error("Agendamento sem paciente ou profissional relacionado.");
  }

  return {
    id: db.id,
    pacienteId: db.patient_id,
    paciente: toPaciente(db.patients),
    fisioterapeutaId: db.professional_id,
    fisioterapeuta: toFisioterapeuta(db.profiles),
    data: toDate(db.start_time),
    horaInicio: toTime(db.start_time),
    horaFim: toTime(db.end_time),
    tipoSessao: toTipoSessao(db.type),
    status: statusFromDb[db.status],
    observacoes: db.notes ?? undefined,
  };
}

export async function getFisioterapeutas(): Promise<Fisioterapeuta[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar fisioterapeutas: ${error.message}`);
  }

  return ((data ?? []) as ProfessionalDB[]).map(toFisioterapeuta);
}

export async function getPacientes(): Promise<Paciente[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, phone, email, birth_date")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar pacientes: ${error.message}`);
  }

  return ((data ?? []) as PatientDB[]).map(toPaciente);
}

export async function getAgendamentos(): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      patient_id,
      professional_id,
      start_time,
      end_time,
      type,
      status,
      notes,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role)
    `,
    )
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar agendamentos: ${error.message}`);
  }

  return ((data ?? []) as unknown as AppointmentDB[]).map(toAgendamento);
}

export async function getAgendamentosPorMes(
  ano: number,
  mes: number,
): Promise<Agendamento[]> {
  const inicio = new Date(ano, mes, 1).toISOString();
  const fim = new Date(ano, mes + 1, 1).toISOString();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      patient_id,
      professional_id,
      start_time,
      end_time,
      type,
      status,
      notes,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role)
    `,
    )
    .gte("start_time", inicio)
    .lt("start_time", fim)
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar agendamentos do mês: ${error.message}`);
  }

  return ((data ?? []) as unknown as AppointmentDB[]).map(toAgendamento);
}

export async function criarAgendamento(
  clinicId: string,
  form: NovoAgendamentoForm,
): Promise<Agendamento> {
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: form.pacienteId,
      professional_id: form.fisioterapeutaId,
      start_time: toDateTime(form.data, form.horaInicio),
      end_time: toDateTime(form.data, form.horaFim),
      type: form.tipoSessao,
      status: statusToDb[form.status],
      notes: form.observacoes || null,
    })
    .select(
      `
      id,
      patient_id,
      professional_id,
      start_time,
      end_time,
      type,
      status,
      notes,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role)
    `,
    )
    .single();

  if (error) {
    throw new Error(`Erro ao criar agendamento: ${error.message}`);
  }

  return toAgendamento(data as unknown as AppointmentDB);
}

export async function atualizarAgendamento(
  id: string,
  form: NovoAgendamentoForm,
): Promise<Agendamento> {
  const { data, error } = await supabase
    .from("appointments")
    .update({
      patient_id: form.pacienteId,
      professional_id: form.fisioterapeutaId,
      start_time: toDateTime(form.data, form.horaInicio),
      end_time: toDateTime(form.data, form.horaFim),
      type: form.tipoSessao,
      status: statusToDb[form.status],
      notes: form.observacoes || null,
    })
    .eq("id", id)
    .select(
      `
      id,
      patient_id,
      professional_id,
      start_time,
      end_time,
      type,
      status,
      notes,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role)
    `,
    )
    .single();

  if (error) {
    throw new Error(`Erro ao atualizar agendamento: ${error.message}`);
  }

  return toAgendamento(data as unknown as AppointmentDB);
}

export async function atualizarStatusAgendamento(
  id: string,
  status: StatusAgendamento,
): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .update({ status: statusToDb[status] })
    .eq("id", id);

  if (error) {
    throw new Error(`Erro ao atualizar status: ${error.message}`);
  }
}

export async function excluirAgendamento(id: string): Promise<void> {
  const { error } = await supabase.from("appointments").delete().eq("id", id);

  if (error) {
    throw new Error(`Erro ao excluir agendamento: ${error.message}`);
  }
}
