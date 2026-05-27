import { supabase } from "../../lib/supabase";
import {
  Agendamento,
  Fisioterapeuta,
  NovoAgendamentoForm,
  Paciente,
  StatusAgendamento,
  TipoSessao,
} from "./types";

type AccessProfile = {
  id: string;
  clinic_id: string;
  role: string;
};

type PatientDB = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  lesson_packages?: PackageDB[];
};

type PackageDB = {
  id: string;
  professional_id: string | null;
  total_lessons: number;
  completed_lessons: number;
  missed_lessons: number;
  justified_absences: number;
  lesson_value: number | string;
  fixed_weekdays: number[];
  fixed_time: string;
  lesson_duration_minutes: number;
  payment_status: string;
  status: string;
  start_date: string;
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
  | "missed"
  | "agendada"
  | "confirmada"
  | "presenca_registrada"
  | "ausencia_justificada"
  | "falta"
  | "reposicao"
  | "cancelada";

type AppointmentDB = {
  id: string;
  patient_id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  type: string;
  status: AppointmentStatusDB;
  notes: string | null;
  package_id: string | null;
  package_lesson_number: number | null;
  class_price: number | string | null;
  patients: PatientDB | null;
  profiles: ProfessionalDB | null;
  lesson_packages: { total_lessons: number } | null;
};

const PROFESSIONAL_COLORS = [
  "#0F6E56",
  "#185FA5",
  "#993C1D",
  "#7C3AED",
  "#C2410C",
];

const statusFromDb: Record<AppointmentStatusDB, StatusAgendamento> = {
  scheduled: "agendada",
  confirmed: "confirmada",
  cancelled: "cancelada",
  completed: "presenca_registrada",
  missed: "falta",
  agendada: "agendada",
  confirmada: "confirmada",
  presenca_registrada: "presenca_registrada",
  ausencia_justificada: "ausencia_justificada",
  falta: "falta",
  reposicao: "reposicao",
  cancelada: "cancelada",
};

const statusToDb: Record<StatusAgendamento, AppointmentStatusDB> = {
  agendada: "agendada",
  confirmada: "confirmada",
  presenca_registrada: "presenca_registrada",
  ausencia_justificada: "ausencia_justificada",
  falta: "falta",
  reposicao: "reposicao",
  cancelada: "cancelada",
};

function toTime(value: string): string {
  return new Date(value).toISOString().slice(11, 16);
}

function toDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateBr(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
  const pacote = (db.lesson_packages ?? []).find(
    (item) => item.status === "ativo",
  );

  return {
    id: db.id,
    nome: db.full_name,
    telefone: db.phone ?? "",
    email: db.email ?? "",
    dataNascimento: db.birth_date ?? "",
    pacoteAtivo: pacote
      ? {
          id: pacote.id,
          professionalId: pacote.professional_id,
          totalAulas: pacote.total_lessons,
          aulasRealizadas: pacote.completed_lessons,
          aulasFaltadas: pacote.missed_lessons,
          ausenciasJustificadas: pacote.justified_absences,
          valorAula: Number(pacote.lesson_value) || 0,
          diasFixos: pacote.fixed_weekdays ?? [],
          horarioFixo: pacote.fixed_time.slice(0, 5),
          duracaoMinutos: pacote.lesson_duration_minutes || 50,
          statusPagamento: pacote.payment_status,
        }
      : undefined,
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
    pacoteId: db.package_id ?? undefined,
    sessaoNumero: db.package_lesson_number ?? undefined,
    totalSessoes: db.lesson_packages?.total_lessons,
    valorAula: Number(db.class_price) || undefined,
  };
}

export async function getFisioterapeutas(
  profile?: AccessProfile | null,
): Promise<Fisioterapeuta[]> {
  let query = supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });

  if (profile?.role === "physio") {
    query = query.eq("id", profile.id);
  } else if (profile?.clinic_id) {
    query = query.eq("clinic_id", profile.clinic_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar fisioterapeutas: ${error.message}`);
  }

  return ((data ?? []) as ProfessionalDB[]).map(toFisioterapeuta);
}

export async function getPacientes(
  profile?: AccessProfile | null,
): Promise<Paciente[]> {
  let query = supabase
    .from("patients")
    .select(
      `
      id,
      full_name,
      phone,
      email,
      birth_date,
      lesson_packages (
        id,
        professional_id,
        total_lessons,
        completed_lessons,
        missed_lessons,
        justified_absences,
        lesson_value,
        fixed_weekdays,
        fixed_time,
        lesson_duration_minutes,
        payment_status,
        status,
        start_date
      )
    `,
    )
    .eq("status", "ativo")
    .order("full_name", { ascending: true });

  if (profile?.role === "physio") {
    query = query.eq("responsible_professional_id", profile.id);
  } else if (profile?.clinic_id) {
    query = query.eq("clinic_id", profile.clinic_id);
  }

  const { data, error } = await query;

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
      package_id,
      package_lesson_number,
      class_price,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role),
      lesson_packages (total_lessons)
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
  profile?: AccessProfile | null,
): Promise<Agendamento[]> {
  const inicio = new Date(ano, mes, 1).toISOString();
  const fim = new Date(ano, mes + 1, 1).toISOString();

  let query = supabase
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
      package_id,
      package_lesson_number,
      class_price,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role),
      lesson_packages (total_lessons)
    `,
    )
    .gte("start_time", inicio)
    .lt("start_time", fim)
    .order("start_time", { ascending: true });

  if (profile?.role === "physio") {
    query = query.eq("professional_id", profile.id);
  } else if (profile?.clinic_id) {
    query = query.eq("clinic_id", profile.clinic_id);
  }

  const { data, error } = await query;

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
      package_id: form.pacoteId || null,
      package_lesson_number: form.sessaoNumero || null,
      class_price: form.valorAula || 0,
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
      package_id,
      package_lesson_number,
      class_price,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role),
      lesson_packages (total_lessons)
    `,
    )
    .single();

  if (error) {
    throw new Error(`Erro ao criar agendamento: ${error.message}`);
  }

  if (form.pacoteId) {
    await atualizarResumoPacote(form.pacoteId);
  }

  return toAgendamento(data as unknown as AppointmentDB);
}

export async function atualizarAgendamento(
  id: string,
  form: NovoAgendamentoForm,
): Promise<Agendamento> {
  const { data: currentAppointment, error: currentError } = await supabase
    .from("appointments")
    .select("start_time, end_time, notes")
    .eq("id", id)
    .single();

  if (currentError) {
    throw new Error(`Erro ao buscar agendamento atual: ${currentError.message}`);
  }

  const oldStart = (currentAppointment as { start_time: string }).start_time;
  const oldEnd = (currentAppointment as { end_time: string }).end_time;
  const oldNotes = (currentAppointment as { notes: string | null }).notes;
  const newStart = toDateTime(form.data, form.horaInicio);
  const newEnd = toDateTime(form.data, form.horaFim);
  const changedSchedule = oldStart !== newStart || oldEnd !== newEnd;
  const remarcacaoNote = changedSchedule
    ? `Remarcação: de ${formatDateBr(toDate(oldStart))} ${toTime(oldStart)}-${toTime(oldEnd)} para ${formatDateBr(form.data)} ${form.horaInicio}-${form.horaFim}.`
    : "";
  const notes = [form.observacoes || oldNotes || "", remarcacaoNote]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabase
    .from("appointments")
    .update({
      patient_id: form.pacienteId,
      professional_id: form.fisioterapeutaId,
      start_time: newStart,
      end_time: newEnd,
      type: form.tipoSessao,
      status: statusToDb[form.status],
      notes: notes || null,
      package_id: form.pacoteId || null,
      package_lesson_number: form.sessaoNumero || null,
      class_price: form.valorAula || 0,
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
      package_id,
      package_lesson_number,
      class_price,
      patients (id, full_name, phone, email, birth_date),
      profiles (id, full_name, role),
      lesson_packages (total_lessons)
    `,
    )
    .single();

  if (error) {
    throw new Error(`Erro ao atualizar agendamento: ${error.message}`);
  }

  if (form.pacoteId) {
    await atualizarResumoPacote(form.pacoteId);
  }

  return toAgendamento(data as unknown as AppointmentDB);
}

export async function atualizarStatusAgendamento(
  id: string,
  status: StatusAgendamento,
): Promise<StatusAgendamento> {
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("package_id")
    .eq("id", id)
    .single();

  if (appointmentError) {
    throw new Error(`Erro ao buscar aula: ${appointmentError.message}`);
  }

  let finalStatus = status;
  const packageId = (appointment as { package_id: string | null }).package_id;

  if (packageId && status === "ausencia_justificada") {
    const { data: packageData, error: packageError } = await supabase
      .from("lesson_packages")
      .select("justified_absence_limit")
      .eq("id", packageId)
      .single();

    if (packageError) {
      throw new Error(`Erro ao validar pacote: ${packageError.message}`);
    }

    const { count, error: countError } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_id", packageId)
      .eq("status", "ausencia_justificada")
      .neq("id", id);

    if (countError) {
      throw new Error(`Erro ao contar ausências: ${countError.message}`);
    }

    const limit =
      Number(
        (packageData as { justified_absence_limit: number })
          .justified_absence_limit,
      ) || 2;

    if ((count ?? 0) >= limit) {
      finalStatus = "falta";
    }
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status: statusToDb[finalStatus] })
    .eq("id", id);

  if (error) {
    throw new Error(`Erro ao atualizar status: ${error.message}`);
  }

  if (packageId) {
    await atualizarResumoPacote(packageId);
  }

  return finalStatus;
}

async function atualizarResumoPacote(packageId: string): Promise<void> {
  const { data, error } = await supabase
    .from("appointments")
    .select("status")
    .eq("package_id", packageId);

  if (error) {
    throw new Error(`Erro ao recalcular pacote: ${error.message}`);
  }

  const statuses = ((data ?? []) as { status: AppointmentStatusDB }[]).map(
    (item) => statusFromDb[item.status],
  );

  const completed = statuses.filter(
    (status) => status === "presenca_registrada",
  ).length;
  const missed = statuses.filter((status) => status === "falta").length;
  const justified = statuses.filter(
    (status) => status === "ausencia_justificada",
  ).length;

  const { error: updateError } = await supabase
    .from("lesson_packages")
    .update({
      completed_lessons: completed,
      missed_lessons: missed,
      justified_absences: justified,
    })
    .eq("id", packageId);

  if (updateError) {
    throw new Error(`Erro ao atualizar pacote: ${updateError.message}`);
  }
}

export async function excluirAgendamento(id: string): Promise<void> {
  const { error } = await supabase.from("appointments").delete().eq("id", id);

  if (error) {
    throw new Error(`Erro ao excluir agendamento: ${error.message}`);
  }
}
