import { supabase } from "../../lib/supabase";
import {
  Agendamento,
  Fisioterapeuta,
  NovoAgendamentoForm,
  Paciente,
  PatientProcedure,
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
  procedures?: PatientProcedure[] | null;
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
  procedure_credits?: PatientProcedure[] | null;
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
  lesson_packages: {
    total_lessons: number;
    procedure_credits?: PatientProcedure[] | null;
  } | null;
};

type AppointmentFinanceDB = {
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  type: string;
  status: AppointmentStatusDB;
  package_id: string | null;
  class_price: number | string | null;
  patients: { full_name: string } | null;
};

type ProcedureReceivableRow = {
  id: string;
  status: string;
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

const CLINIC_TIME_ZONE = "America/Sao_Paulo";
const CLINIC_UTC_OFFSET = "-03:00";
const TRANSACTIONS_TABLE = "transactions";

function getDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

function toTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function toDate(value: string): string {
  const { year, month, day } = getDateParts(value);
  return `${year}-${month}-${day}`;
}

function formatDateBr(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00${CLINIC_UTC_OFFSET}`).toISOString();
}

function toMonthBoundary(year: number, month: number): string {
  const boundary = new Date(year, month, 1);
  const date = `${boundary.getFullYear()}-${String(
    boundary.getMonth() + 1,
  ).padStart(2, "0")}-01`;
  return toDateTime(date, "00:00");
}

function normalizePackageNotes(db: AppointmentDB): string | null {
  if (
    !db.package_id ||
    !db.package_lesson_number ||
    !db.lesson_packages?.total_lessons ||
    !db.notes
  ) {
    return db.notes;
  }

  if (/^Aula \d+\/\d+ do pacote\.$/.test(db.notes)) {
    return `Aula ${db.package_lesson_number}/${db.lesson_packages.total_lessons} do pacote.`;
  }

  if (/^Renovação: aula \d+\/\d+ do novo pacote\.$/.test(db.notes)) {
    return `Renovação: aula ${db.package_lesson_number}/${db.lesson_packages.total_lessons} do novo pacote.`;
  }

  return db.notes;
}

function toTipoSessao(value: string): TipoSessao {
  const tipos: TipoSessao[] = [
    "RPG",
    "Drenagem linfática",
    "Liberação miofascial",
    "Massagem relaxante",
    "Fisioterapia",
    "Fisioterapia pélvica",
  ];

  return tipos.includes(value as TipoSessao)
    ? (value as TipoSessao)
    : "Fisioterapia";
}

function appointmentFinanceDescription(appointment: AppointmentFinanceDB): string {
  const patientName = appointment.patients?.full_name ?? "paciente";

  return `Procedimento avulso de ${patientName} - ${appointment.type} em ${formatDateBr(
    toDate(appointment.start_time),
  )} ${toTime(appointment.start_time)}`;
}

async function syncStandaloneProcedureReceivable(
  appointmentId: string,
  appointment: AppointmentFinanceDB,
): Promise<void> {
  const { data: existingRows, error: fetchError } = await supabase
    .from(TRANSACTIONS_TABLE)
    .select("id, status")
    .eq("appointment_id", appointmentId)
    .eq("category", "Recebimento de procedimentos")
    .limit(1);

  if (fetchError) {
    throw new Error(`Erro ao buscar financeiro do atendimento: ${fetchError.message}`);
  }

  const existing = ((existingRows ?? []) as { id: string; status: string }[])[0];

  if (
    appointment.package_id ||
    appointment.status === "cancelada" ||
    appointment.status === "cancelled"
  ) {
    if (existing?.status !== "paid") {
      await deletePendingProcedureReceivable(appointmentId);
    }
    return;
  }

  const amount = Number(appointment.class_price) || 0;
  if (amount <= 0) {
    if (existing?.status !== "paid") {
      await deletePendingProcedureReceivable(appointmentId);
    }
    return;
  }

  if (existing?.status === "paid") return;

  const payload = {
    clinic_id: appointment.clinic_id,
    patient_id: appointment.patient_id,
    appointment_id: appointmentId,
    amount,
    type: "income",
    category: "Recebimento de procedimentos",
    status: "pending",
    description: appointmentFinanceDescription(appointment),
    due_date: toDate(appointment.start_time),
  };

  if (!existing) {
    const reusableReceivable = await findReusableProcedureReceivable(
      appointment,
      amount,
    );

    if (reusableReceivable?.status === "paid") {
      const { error } = await supabase
        .from(TRANSACTIONS_TABLE)
        .update({ appointment_id: appointmentId })
        .eq("id", reusableReceivable.id);

      if (error) {
        throw new Error(
          `Erro ao vincular recebimento pago ao atendimento: ${error.message}`,
        );
      }
      return;
    }

    if (reusableReceivable) {
      const { error } = await supabase
        .from(TRANSACTIONS_TABLE)
        .update(payload)
        .eq("id", reusableReceivable.id);

      if (error) {
        throw new Error(
          `Erro ao atualizar recebimento do atendimento: ${error.message}`,
        );
      }
      return;
    }
  }

  const { error } = existing
    ? await supabase
        .from(TRANSACTIONS_TABLE)
        .update(payload)
        .eq("id", existing.id)
    : await supabase.from(TRANSACTIONS_TABLE).insert(payload);

  if (error) {
    throw new Error(`Erro ao vincular atendimento ao financeiro: ${error.message}`);
  }
}

async function findReusableProcedureReceivable(
  appointment: AppointmentFinanceDB,
  amount: number,
): Promise<ProcedureReceivableRow | undefined> {
  const { data, error } = await supabase
    .from(TRANSACTIONS_TABLE)
    .select("id, status")
    .eq("clinic_id", appointment.clinic_id)
    .eq("patient_id", appointment.patient_id)
    .eq("type", "income")
    .eq("category", "Recebimento de procedimentos")
    .eq("amount", amount)
    .in("status", ["pending", "paid"])
    .is("appointment_id", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(
      `Erro ao buscar recebimento existente do procedimento: ${error.message}`,
    );
  }

  return ((data ?? []) as ProcedureReceivableRow[])[0];
}

async function deletePendingProcedureReceivable(appointmentId: string): Promise<void> {
  const { error } = await supabase
    .from(TRANSACTIONS_TABLE)
    .delete()
    .eq("appointment_id", appointmentId)
    .eq("category", "Recebimento de procedimentos")
    .neq("status", "paid");

  if (error) {
    throw new Error(`Erro ao remover financeiro do atendimento: ${error.message}`);
  }
}

function mergeProcedures(
  ...procedureLists: Array<PatientProcedure[] | null | undefined>
): PatientProcedure[] {
  const byType = new Map<string, PatientProcedure>();

  procedureLists
    .flatMap((procedures) => procedures ?? [])
    .forEach((procedure) => {
      if (!procedure.name?.trim()) return;
      byType.set(procedure.type, procedure);
    });

  return Array.from(byType.values());
}

function toPaciente(db: PatientDB): Paciente {
  const pacote = [...(db.lesson_packages ?? [])]
    .filter((item) => item.status === "ativo")
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  const procedimentos = mergeProcedures(db.procedures, pacote?.procedure_credits);

  return {
    id: db.id,
    nome: db.full_name,
    telefone: db.phone ?? "",
    email: db.email ?? "",
    dataNascimento: db.birth_date ?? "",
    procedimentos,
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
          procedimentos,
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

  const paciente = toPaciente(db.patients);
  const allProcedures = mergeProcedures(
    db.patients.procedures,
    paciente.procedimentos,
    paciente.pacoteAtivo?.procedimentos,
    db.lesson_packages?.procedure_credits,
  );
  const standaloneProcedure =
    !db.package_id
      ? allProcedures.find((procedure) => procedure.name === db.type)
      : undefined;
  const syntheticStandaloneProcedure =
    !db.package_id && !standaloneProcedure
      ? {
          type: db.type,
          name: db.type,
          agreed_value: Number(db.class_price) || 0,
          quantity: 1,
        }
      : undefined;

  return {
    id: db.id,
    pacienteId: db.patient_id,
    paciente,
    fisioterapeutaId: db.professional_id,
    fisioterapeuta: toFisioterapeuta(db.profiles),
    data: toDate(db.start_time),
    horaInicio: toTime(db.start_time),
    horaFim: toTime(db.end_time),
    tipoSessao: toTipoSessao(db.type),
    status: statusFromDb[db.status],
    observacoes: normalizePackageNotes(db) ?? undefined,
    pacoteId: db.package_id ?? undefined,
    sessaoNumero: db.package_lesson_number ?? undefined,
    totalSessoes: db.lesson_packages?.total_lessons,
    valorAula: Number(db.class_price) || undefined,
    procedimentos:
      standaloneProcedure || syntheticStandaloneProcedure
        ? [standaloneProcedure ?? syntheticStandaloneProcedure]
        : allProcedures,
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
      procedures,
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
        start_date,
        procedure_credits
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
      patients (id, full_name, phone, email, birth_date, procedures),
      profiles (id, full_name, role),
      lesson_packages (total_lessons, procedure_credits)
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
  const inicio = toMonthBoundary(ano, mes);
  const fim = toMonthBoundary(ano, mes + 1);

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
      patients (id, full_name, phone, email, birth_date, procedures),
      profiles (id, full_name, role),
      lesson_packages (total_lessons, procedure_credits)
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
      patients (id, full_name, phone, email, birth_date, procedures),
      profiles (id, full_name, role),
      lesson_packages (total_lessons, procedure_credits)
    `,
    )
    .single();

  if (error) {
    throw new Error(`Erro ao criar agendamento: ${error.message}`);
  }

  const createdAppointment = data as unknown as AppointmentDB;

  if (form.pacoteId) {
    await atualizarResumoPacote(form.pacoteId);
  } else {
    await syncStandaloneProcedureReceivable(createdAppointment.id, {
      clinic_id: clinicId,
      patient_id: form.pacienteId,
      professional_id: form.fisioterapeutaId,
      start_time: toDateTime(form.data, form.horaInicio),
      end_time: toDateTime(form.data, form.horaFim),
      type: form.tipoSessao,
      status: statusToDb[form.status],
      package_id: null,
      class_price: form.valorAula || 0,
      patients: createdAppointment.patients
        ? { full_name: createdAppointment.patients.full_name }
        : null,
    });
  }

  return toAgendamento(createdAppointment);
}

export async function atualizarAgendamento(
  id: string,
  form: NovoAgendamentoForm,
): Promise<Agendamento> {
  const { data: currentAppointment, error: currentError } = await supabase
    .from("appointments")
    .select("clinic_id, package_id, start_time, end_time, notes")
    .eq("id", id)
    .single();

  if (currentError) {
    throw new Error(`Erro ao buscar agendamento atual: ${currentError.message}`);
  }

  const oldStart = (currentAppointment as { start_time: string }).start_time;
  const oldEnd = (currentAppointment as { end_time: string }).end_time;
  const oldNotes = (currentAppointment as { notes: string | null }).notes;
  const clinicId = (currentAppointment as { clinic_id: string }).clinic_id;
  const oldPackageId = (currentAppointment as { package_id: string | null })
    .package_id;
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
      patients (id, full_name, phone, email, birth_date, procedures),
      profiles (id, full_name, role),
      lesson_packages (total_lessons, procedure_credits)
    `,
    )
    .single();

  if (error) {
    throw new Error(`Erro ao atualizar agendamento: ${error.message}`);
  }

  if (form.pacoteId) {
    await atualizarResumoPacote(form.pacoteId);
    await deletePendingProcedureReceivable(id);
  } else {
    await syncStandaloneProcedureReceivable(id, {
      clinic_id: clinicId,
      patient_id: form.pacienteId,
      professional_id: form.fisioterapeutaId,
      start_time: newStart,
      end_time: newEnd,
      type: form.tipoSessao,
      status: statusToDb[form.status],
      package_id: null,
      class_price: form.valorAula || 0,
      patients: (data as unknown as AppointmentDB).patients
        ? { full_name: (data as unknown as AppointmentDB).patients!.full_name }
        : null,
    });
  }

  if (oldPackageId && oldPackageId !== form.pacoteId) {
    await atualizarResumoPacote(oldPackageId);
  }

  return toAgendamento(data as unknown as AppointmentDB);
}

export async function atualizarStatusAgendamento(
  id: string,
  status: StatusAgendamento,
): Promise<StatusAgendamento> {
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select(
      `
      clinic_id,
      patient_id,
      professional_id,
      start_time,
      end_time,
      type,
      package_id,
      class_price,
      patients (full_name)
    `,
    )
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
  } else {
    await syncStandaloneProcedureReceivable(id, {
      ...(appointment as unknown as Omit<AppointmentFinanceDB, "status">),
      status: statusToDb[finalStatus],
    });
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
  await deletePendingProcedureReceivable(id);

  const { error } = await supabase.from("appointments").delete().eq("id", id);

  if (error) {
    throw new Error(`Erro ao excluir agendamento: ${error.message}`);
  }
}
