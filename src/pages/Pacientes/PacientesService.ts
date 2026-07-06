import { supabase } from "../../lib/supabase";
import {
  NewPatientForm,
  PackageSummary,
  Patient,
  PatientAddress,
  PatientProcedure,
  PROCEDURE_OPTIONS,
} from "./types";
import { SESSION_DURATION_MINUTES } from "../Agenda/Agendamentoservice";

const PATIENTS_TABLE = "patients";
const PACKAGES_TABLE = "lesson_packages";
const INSTALLMENTS_TABLE = "package_installments";
const TRANSACTIONS_TABLE = "transactions";
const CLINIC_UTC_OFFSET = "-03:00";

type AppointmentInsert = {
  clinic_id: string;
  patient_id: string;
  professional_id?: string;
  start_time: string;
  end_time?: string;
  status: string;
  package_id: string | null;
  package_lesson_number?: number | null;
  type: string;
  class_price?: number;
  notes?: string;
};

type TransactionInsert = {
  clinic_id: string;
  patient_id: string;
  amount: number;
  type: string;
  category: string;
  status: string;
  description: string;
  due_date: string;
};

type PatientDuplicateCandidate = Pick<
  Patient,
  "id" | "full_name" | "cpf" | "phone" | "birth_date"
>;

type RepairablePackage = {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  total_lessons: number;
  lesson_value: number | string;
  start_date: string;
  fixed_weekdays: number[];
  fixed_time: string;
  status: PackageSummary["status"];
  procedure_credits: PatientProcedure[] | null;
};

type RepairablePatient = Pick<
  Patient,
  "id" | "clinic_id" | "procedures" | "responsible_professional_id"
>;

export type AppointmentRepairResult = {
  packagesChecked: number;
  patientsChecked: number;
  packageAppointmentsCreated: number;
  procedureAppointmentsCreated: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

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

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizePatientName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatSupabaseError(
  action: string,
  error: SupabaseErrorLike,
  table = PATIENTS_TABLE,
): Error {
  const extra = [error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
  const suffix = extra ? ` (${extra})` : "";

  return new Error(`${action} na tabela ${table}: ${error.message}${suffix}`);
}

async function getPatientClinicId(patientId: string): Promise<string> {
  const { data, error } = await supabase
    .from(PATIENTS_TABLE)
    .select("clinic_id")
    .eq("id", patientId)
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao localizar paciente", error);
  }

  const clinicId = (data as Pick<Patient, "clinic_id"> | null)?.clinic_id;
  if (!clinicId) {
    throw new Error("Não foi possível identificar a clínica do paciente.");
  }

  return clinicId;
}

function getDuplicateReasons(
  form: NewPatientForm,
  patient: PatientDuplicateCandidate,
): string[] {
  const reasons: string[] = [];
  const formName = normalizePatientName(form.full_name);
  const patientName = normalizePatientName(patient.full_name);
  const formCpf = onlyDigits(form.cpf);
  const patientCpf = onlyDigits(patient.cpf ?? "");
  const formPhone = onlyDigits(form.phone);
  const patientPhone = onlyDigits(patient.phone ?? "");

  if (formName && patientName && formName === patientName) {
    reasons.push("mesmo nome");
  }

  if (formCpf && patientCpf && formCpf === patientCpf) {
    reasons.push("mesmo CPF");
  }

  if (formPhone && patientPhone && formPhone === patientPhone) {
    reasons.push("mesmo telefone");
  }

  if (
    form.birth_date &&
    patient.birth_date &&
    form.birth_date === patient.birth_date &&
    formName &&
    patientName &&
    formName === patientName
  ) {
    reasons.push("mesma data de nascimento");
  }

  return reasons;
}

async function assertPatientIsNotDuplicate(
  clinicId: string,
  form: NewPatientForm,
  ignorePatientId?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from(PATIENTS_TABLE)
    .select("id, full_name, cpf, phone, birth_date")
    .eq("clinic_id", clinicId);

  if (error) {
    throw formatSupabaseError("Erro ao validar duplicidade do paciente", error);
  }

  const duplicate = ((data ?? []) as PatientDuplicateCandidate[])
    .filter((patient) => patient.id !== ignorePatientId)
    .map((patient) => ({
      patient,
      reasons: getDuplicateReasons(form, patient),
    }))
    .find(({ reasons }) => reasons.length > 0);

  if (!duplicate) return;

  throw new Error(
    `Já existe um paciente cadastrado com dados semelhantes: ${duplicate.patient.full_name} (${duplicate.reasons.join(", ")}). Revise o cadastro antes de salvar para evitar duplicidade.`,
  );
}

function normalizeProcedures(form: NewPatientForm): PatientProcedure[] {
  return form.procedures
    .map((procedure) => {
      const option = PROCEDURE_OPTIONS.find(
        (item) => item.type === procedure.type,
      );
      const quantity = Math.max(Number(procedure.quantity) || 1, 1);
      const schedule = (procedure.schedule ?? [])
        .slice(0, quantity)
        .filter((item) => item.date && item.time)
        .map((item) => ({
          date: item.date,
          time: item.time,
          status: item.status ?? "agendada",
        }));

      return {
        type: procedure.type,
        name: option?.name ?? procedure.name,
        agreed_value: Number(procedure.agreed_value) || 0,
        quantity,
        ...(procedure.scheduled_date
          ? { scheduled_date: procedure.scheduled_date }
          : {}),
        ...(procedure.scheduled_time
          ? { scheduled_time: procedure.scheduled_time }
          : {}),
        ...(schedule.length > 0 ? { schedule } : {}),
        ...(procedure.schedule_mode
          ? { schedule_mode: procedure.schedule_mode }
          : {}),
        ...(procedure.recurring_start_date
          ? { recurring_start_date: procedure.recurring_start_date }
          : {}),
        ...(procedure.recurring_time
          ? { recurring_time: procedure.recurring_time }
          : {}),
        ...(procedure.recurring_weekdays?.length
          ? { recurring_weekdays: procedure.recurring_weekdays }
          : {}),
        ...(procedure.recurring_status
          ? { recurring_status: procedure.recurring_status }
          : {}),
      };
    })
    .filter((procedure) => procedure.name.trim());
}

function normalizeAddress(form: NewPatientForm): PatientAddress | null {
  const address = form.address;
  const hasAddress = [
    address.postalCode,
    address.street,
    address.number,
    address.additionalInformation,
    address.district,
    address.cityCode,
    address.cityName,
    address.state,
  ].some((value) => value.trim());

  if (!hasAddress) return null;

  return {
    country: "BRA",
    postalCode: onlyDigits(address.postalCode),
    street: address.street.trim(),
    number: address.number.trim(),
    additionalInformation: emptyToNull(address.additionalInformation),
    district: address.district.trim(),
    city: {
      code: onlyDigits(address.cityCode),
      name: address.cityName.trim(),
    },
    state: address.state
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 2)
      .toUpperCase(),
  };
}

function getProcedureAmount(form: NewPatientForm): number {
  return normalizeProcedures(form).reduce(
    (total, procedure) => total + procedure.agreed_value * procedure.quantity,
    0,
  );
}

function hasLessonPackage(form: NewPatientForm): boolean {
  return Number(form.contracted_lessons) > 0;
}

function getLessonsAmount(form: NewPatientForm): number {
  if (!hasLessonPackage(form)) return 0;

  return (
    Number(form.total_amount) ||
    Number(form.lesson_value) * Number(form.contracted_lessons)
  );
}

function getLessonUnitValue(form: NewPatientForm): number {
  if (!hasLessonPackage(form)) return 0;

  return getLessonsAmount(form) / Number(form.contracted_lessons);
}

function getFinancialTotalAmount(form: NewPatientForm): number {
  return getLessonsAmount(form) + getProcedureAmount(form);
}

function sortActivePackagesFirst(packages: PackageSummary[]): PackageSummary[] {
  return [...packages].sort((a, b) => {
    if (a.status === "ativo" && b.status !== "ativo") return -1;
    if (a.status !== "ativo" && b.status === "ativo") return 1;
    return b.start_date.localeCompare(a.start_date);
  });
}

function validatePaymentAmount(form: NewPatientForm, totalAmount: number) {
  if ((Number(form.amount_paid) || 0) > totalAmount) {
    throw new Error("O valor pago não pode ser maior que o total financeiro.");
  }
}

function paymentStatusFromAmounts(
  totalAmount: number,
  amountPaid: number,
  requestedStatus: NewPatientForm["payment_status"],
): NewPatientForm["payment_status"] {
  if (requestedStatus === "inadimplente") return "inadimplente";
  if (amountPaid <= 0) return "pendente";
  if (amountPaid >= totalAmount) return "pago";
  return "parcial";
}

export async function listarPacientes(
  clinicId: string,
  searchTerm = "",
  access?: { id: string; role: string } | null,
  responsibleProfessionalId = "",
): Promise<Patient[]> {
  let query = supabase
    .from(PATIENTS_TABLE)
    .select(
      `
      id,
      clinic_id,
      full_name,
      cpf,
      email,
      phone,
      birth_date,
      gender,
      quick_note,
      address,
      status,
      plan_start_date,
      contracted_lessons,
      fixed_weekdays,
      fixed_time,
      responsible_professional_id,
      procedures,
      created_at,
      lesson_packages (
        id,
        total_lessons,
        completed_lessons,
        missed_lessons,
        justified_absences,
        justified_absence_limit,
        lesson_value,
        procedure_amount,
        procedure_credits,
        total_amount,
        amount_paid,
        payment_status,
        payment_method,
        installments,
        start_date,
        expected_end_date,
        fixed_weekdays,
        fixed_time,
        status
      )
    `,
    )
    .eq("clinic_id", clinicId)
    .order("full_name", { ascending: true });

  if (access?.role === "physio") {
    query = query.eq("responsible_professional_id", access.id);
  } else if (responsibleProfessionalId) {
    query = query.eq("responsible_professional_id", responsibleProfessionalId);
  }

  const term = searchTerm.trim();

  if (term) {
    const escapedTerm = term.replace(/[%_,]/g, "");
    query = query.or(
      `full_name.ilike.%${escapedTerm}%,cpf.ilike.%${escapedTerm}%,phone.ilike.%${escapedTerm}%,quick_note.ilike.%${escapedTerm}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw formatSupabaseError("Erro ao buscar pacientes", error);
  }

  return (data ?? []).map((patient) => ({
    ...(patient as Patient),
    lesson_packages: sortActivePackagesFirst(
      (patient as Patient).lesson_packages ?? [],
    ).filter((packageItem) => packageItem.status === "ativo"),
  }));
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes, 0);
  return date.toTimeString().slice(0, 5);
}

function addMinutesToSchedule(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute + minutes, 0);

  return {
    date: `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(
      value.getDate(),
    )}`,
    time: value.toTimeString().slice(0, 5),
  };
}

function toDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00${CLINIC_UTC_OFFSET}`).toISOString();
}

async function filterExistingStandaloneProcedureAppointments(
  patientId: string,
  appointments: AppointmentInsert[],
): Promise<AppointmentInsert[]> {
  if (appointments.length === 0) return [];

  const startTimes = Array.from(
    new Set(appointments.map((appointment) => appointment.start_time)),
  );

  const { data, error } = await supabase
    .from("appointments")
    .select("type, start_time")
    .eq("patient_id", patientId)
    .is("package_id", null)
    .in("start_time", startTimes);

  if (error) {
    throw formatSupabaseError(
      "Erro ao verificar procedimentos já agendados",
      error,
      "appointments",
    );
  }

  const existing = new Set(
    ((data ?? []) as Array<{ type: string; start_time: string }>).map(
      (appointment) => `${appointment.type}|${appointment.start_time}`,
    ),
  );

  return appointments.filter(
    (appointment) =>
      !existing.has(`${appointment.type}|${appointment.start_time}`),
  );
}

function generateLessonDates(
  startDate: string,
  weekdays: number[],
  totalLessons: number,
): string[] {
  if (totalLessons <= 0) return [];
  if (!startDate || weekdays.length === 0) {
    throw new Error("Informe data inicial e dias fixos para gerar as sessões.");
  }

  const selected = new Set(weekdays);
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);

  while (dates.length < totalLessons) {
    if (selected.has(cursor.getDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildLessonAppointments({
  clinicId,
  patientId,
  professionalId,
  packageId,
  lessonDates,
  form,
  totalLessons,
  existingLockedStartTimes = new Set<string>(),
  isRenewal = false,
}: {
  clinicId: string;
  patientId: string;
  professionalId: string;
  packageId: string | null;
  lessonDates: string[];
  form: NewPatientForm;
  totalLessons: number;
  existingLockedStartTimes?: Set<string>;
  isRenewal?: boolean;
}): AppointmentInsert[] {
  const endTime = addMinutesToTime(form.fixed_time, SESSION_DURATION_MINUTES);
  const lessonUnitValue = getLessonUnitValue(form);

  return lessonDates.flatMap((lessonDate, index) => {
    const lessonNumber = index + 1;
    const startTime = toDateTime(lessonDate, form.fixed_time);

    if (existingLockedStartTimes.has(startTime)) return [];

    return [
      {
        clinic_id: clinicId,
        patient_id: patientId,
        professional_id: professionalId,
        package_id: packageId,
        package_lesson_number: lessonNumber,
        class_price: lessonUnitValue,
        start_time: startTime,
        end_time: toDateTime(lessonDate, endTime),
        type: "Fisioterapia",
        status: "agendada",
        notes: `${isRenewal ? "Renovação: aula" : "Aula"} ${lessonNumber}/${totalLessons} ${isRenewal ? "do novo pacote" : "do pacote"}.`,
      },
    ];
  });
}

async function sincronizarAgendamentosPacote({
  clinicId,
  patientId,
  professionalId,
  packageId,
  lessonDates,
  form,
  totalLessons,
  isRenewal = false,
}: {
  clinicId: string;
  patientId: string;
  professionalId: string;
  packageId: string;
  lessonDates: string[];
  form: NewPatientForm;
  totalLessons: number;
  isRenewal?: boolean;
}) {
  const { data: lockedAppointments, error: lockedError } = await supabase
    .from("appointments")
    .select("start_time")
    .eq("package_id", packageId)
    .in("status", ["presenca_registrada", "falta", "ausencia_justificada"]);

  if (lockedError) {
    throw formatSupabaseError(
      "Erro ao verificar sessões já realizadas do pacote",
      lockedError,
      "appointments",
    );
  }

  const existingLockedStartTimes = new Set(
    ((lockedAppointments ?? []) as { start_time: string | null }[])
      .map((appointment) => appointment.start_time)
      .filter((value): value is string => Boolean(value)),
  );

  const appointments = buildLessonAppointments({
    clinicId,
    patientId,
    professionalId,
    packageId,
    lessonDates,
    form,
    totalLessons,
    existingLockedStartTimes,
    isRenewal,
  });

  if (appointments.length === 0) return;

  const { error: deleteError } = await supabase
    .from("appointments")
    .delete()
    .eq("package_id", packageId)
    .in("status", ["agendada", "confirmada", "cancelada"]);

  if (deleteError) {
    throw formatSupabaseError(
      "Erro ao sincronizar sessões antigas do pacote",
      deleteError,
      "appointments",
    );
  }

  const { error: appointmentsError } = await supabase
    .from("appointments")
    .insert(appointments);

  if (appointmentsError) {
    throw formatSupabaseError(
      "Erro ao gerar sessões do pacote",
      appointmentsError,
      "appointments",
    );
  }
}

function addMonths(date: string, months: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getPatientPlanFields(form: NewPatientForm) {
  const withLessons = hasLessonPackage(form);
  const procedures = normalizeProcedures(form);
  const firstProcedure = procedures[0];
  const firstProcedureSchedule = firstProcedure?.schedule?.[0];
  const withProcedures = procedures.length > 0;

  return {
    plan_start_date: withLessons
      ? emptyToNull(form.plan_start_date)
      : withProcedures
        ? (firstProcedure.scheduled_date ??
          firstProcedureSchedule?.date ??
          todayDate())
        : null,
    contracted_lessons: withLessons ? form.contracted_lessons : null,
    fixed_weekdays: withLessons ? form.fixed_weekdays : null,
    fixed_time: withLessons
      ? emptyToNull(form.fixed_time)
      : (firstProcedure.scheduled_time ?? firstProcedureSchedule?.time ?? null),
  };
}

function validateLessonPackageFields(form: NewPatientForm) {
  if (!hasLessonPackage(form)) return;

  if (
    !form.plan_start_date ||
    !form.fixed_time ||
    form.fixed_weekdays.length === 0
  ) {
    throw new Error(
      "Informe data inicial, dias fixos e horário para gerar as sessões.",
    );
  }

  if (form.fixed_weekdays.length > Number(form.contracted_lessons)) {
    throw new Error(
      "A quantidade de dias fixos não pode ser maior que as sessões contratadas.",
    );
  }
}

function validateStandaloneProcedureFields(form: NewPatientForm) {
  if (hasLessonPackage(form)) return;

  const procedures = normalizeProcedures(form);
  if (procedures.length === 0) return;

  procedures.forEach((procedure) => {
    const quantity = Math.max(Number(procedure.quantity) || 1, 1);
    const scheduledCredits = procedure.schedule?.length ?? 0;

    if (procedure.schedule_mode === "fixed_weekdays") {
      if (
        !procedure.recurring_start_date ||
        !procedure.recurring_time ||
        !procedure.recurring_weekdays?.length
      ) {
        throw new Error(
          `Informe data inicial, horário e dias fixos para gerar ${procedure.name}.`,
        );
      }

      if ((procedure.recurring_weekdays?.length ?? 0) > quantity) {
        throw new Error(
          `O procedimento ${procedure.name} tem mais dias fixos do que créditos contratados.`,
        );
      }
    }

    if (scheduledCredits > quantity) {
      throw new Error(
        `O procedimento ${procedure.name} tem mais agendamentos do que créditos contratados.`,
      );
    }
  });
}

function getProcedureCredits(procedures: PatientProcedure[]) {
  return procedures.flatMap((procedure) => {
    const quantity = Math.max(Number(procedure.quantity) || 1, 1);
    const schedule =
      procedure.schedule && procedure.schedule.length > 0
        ? procedure.schedule
        : procedure.schedule_mode === "fixed_weekdays" &&
            procedure.recurring_start_date &&
            procedure.recurring_time &&
            procedure.recurring_weekdays?.length
          ? generateLessonDates(
              procedure.recurring_start_date,
              procedure.recurring_weekdays,
              quantity,
            ).map((date) => ({
              date,
              time: procedure.recurring_time ?? "",
              status: procedure.recurring_status ?? "agendada",
            }))
          : procedure.scheduled_date && procedure.scheduled_time
            ? [
                {
                  date: procedure.scheduled_date,
                  time: procedure.scheduled_time,
                  status: "agendada" as const,
                },
              ]
            : [];

    return schedule.slice(0, quantity).map((scheduledCredit, index) => ({
      procedure,
      creditNumber: index + 1,
      totalCredits: quantity,
      scheduledCredit,
    }));
  });
}

function buildRepairLessonAppointments(
  packageItem: RepairablePackage,
  existingStartTimes: Set<string>,
): AppointmentInsert[] {
  const startTime = packageItem.fixed_time.slice(0, 5);
  const endTime = addMinutesToTime(startTime, SESSION_DURATION_MINUTES);
  const lessonDates = generateLessonDates(
    packageItem.start_date,
    packageItem.fixed_weekdays,
    packageItem.total_lessons,
  );

  return lessonDates.flatMap((lessonDate, index) => {
    const lessonNumber = index + 1;
    const appointmentStartTime = toDateTime(lessonDate, startTime);

    if (existingStartTimes.has(appointmentStartTime)) return [];

    return [
      {
        clinic_id: packageItem.clinic_id,
        patient_id: packageItem.patient_id,
        ...(packageItem.professional_id
          ? { professional_id: packageItem.professional_id }
          : {}),
        package_id: packageItem.id,
        package_lesson_number: lessonNumber,
        class_price: Number(packageItem.lesson_value) || 0,
        start_time: appointmentStartTime,
        end_time: toDateTime(lessonDate, endTime),
        type: "Fisioterapia",
        status: "agendada",
        notes: `Aula ${lessonNumber}/${packageItem.total_lessons} do pacote.`,
      },
    ];
  });
}

function buildStandaloneProcedureAppointments({
  clinicId,
  patientId,
  professionalId,
  procedures,
  isRenewal = false,
}: {
  clinicId: string;
  patientId: string;
  professionalId?: string | null;
  procedures: PatientProcedure[];
  isRenewal?: boolean;
}): AppointmentInsert[] {
  const credits = getProcedureCredits(procedures);
  const duration = SESSION_DURATION_MINUTES;

  return credits.map((credit) => {
    const scheduledDate = credit.scheduledCredit.date;
    const scheduledTime = credit.scheduledCredit.time;
    const start = addMinutesToSchedule(
      scheduledDate,
      scheduledTime.slice(0, 5),
      0,
    );
    const end = addMinutesToSchedule(start.date, start.time, duration);
    const procedureName = credit.procedure.name || "Procedimento";

    return {
      clinic_id: clinicId,
      patient_id: patientId,
      ...(professionalId ? { professional_id: professionalId } : {}),
      start_time: toDateTime(start.date, start.time),
      end_time: toDateTime(end.date, end.time),
      type: procedureName,
      status: credit.scheduledCredit.status ?? "agendada",
      package_id: null,
      package_lesson_number: null,
      class_price: Number(credit.procedure.agreed_value) || 0,
      notes: `${isRenewal ? "Renovação: " : ""}Procedimento avulso ${credit.creditNumber}/${credit.totalCredits}: ${procedureName}.`,
    };
  });
}

async function criarAgendamentosProcedimentosAvulsos({
  clinicId,
  patientId,
  professionalId,
  form,
  procedures,
  isRenewal = false,
  replaceExisting = false,
}: {
  clinicId: string;
  patientId: string;
  professionalId: string;
  form: NewPatientForm;
  procedures: PatientProcedure[];
  isRenewal?: boolean;
  replaceExisting?: boolean;
}) {
  if (procedures.length === 0) return;

  validateStandaloneProcedureFields(form);

  const requestedAppointments = buildStandaloneProcedureAppointments({
    clinicId,
    patientId,
    professionalId,
    procedures,
    isRenewal,
  });

  if (replaceExisting) {
    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .eq("patient_id", patientId)
      .is("package_id", null)
      .in("status", ["agendada", "confirmada", "cancelada"]);

    if (deleteError) {
      throw formatSupabaseError(
        "Erro ao substituir procedimentos antigos na agenda",
        deleteError,
        "appointments",
      );
    }
  }

  const appointments = await filterExistingStandaloneProcedureAppointments(
    patientId,
    requestedAppointments,
  );

  if (appointments.length === 0) return;

  const { error } = await supabase.from("appointments").insert(appointments);

  if (error) {
    throw formatSupabaseError(
      "Erro ao gerar procedimentos na agenda",
      error,
      "appointments",
    );
  }
}

function installmentStatus(amount: number, paid: number) {
  if (paid <= 0) return "pendente";
  if (paid >= amount) return "pago";
  return "parcial";
}

function buildInstallments(
  clinicId: string,
  packageId: string,
  patientId: string,
  form: NewPatientForm,
  totalAmount: number,
) {
  const count = Math.max(Number(form.installments) || 1, 1);
  const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
  let remainingTotal = totalAmount;
  let remainingPaid = Number(form.amount_paid) || 0;

  return Array.from({ length: count }, (_, index) => {
    const isLast = index === count - 1;
    const amount = isLast ? Number(remainingTotal.toFixed(2)) : baseAmount;
    remainingTotal -= amount;

    const amountPaid = Math.min(remainingPaid, amount);
    remainingPaid -= amountPaid;

    return {
      clinic_id: clinicId,
      package_id: packageId,
      patient_id: patientId,
      installment_number: index + 1,
      amount,
      amount_paid: amountPaid,
      due_date: addMonths(form.plan_start_date, index),
      paid_at: amountPaid >= amount ? new Date().toISOString() : null,
      payment_method: amountPaid > 0 ? emptyToNull(form.payment_method) : null,
      status: installmentStatus(amount, amountPaid),
    };
  });
}

async function criarParcelasPacote(
  clinicId: string,
  packageId: string,
  patientId: string,
  form: NewPatientForm,
  totalAmount: number,
) {
  const installments = buildInstallments(
    clinicId,
    packageId,
    patientId,
    form,
    totalAmount,
  );

  const { error } = await supabase
    .from(INSTALLMENTS_TABLE)
    .insert(installments);

  if (error) {
    throw formatSupabaseError(
      "Erro ao gerar parcelas",
      error,
      INSTALLMENTS_TABLE,
    );
  }
}

async function registrarRecebimentoInicial({
  clinicId,
  patientId,
  patientName,
  amountPaid,
  procedureAmount,
  paymentMethod,
  totalLessons,
  isRenewal = false,
}: {
  clinicId: string;
  patientId: string;
  patientName: string;
  amountPaid: number;
  procedureAmount: number;
  paymentMethod: string;
  totalLessons?: number;
  isRenewal?: boolean;
}) {
  if (amountPaid <= 0) return;

  const method = emptyToNull(paymentMethod);
  const paymentDate = todayDate();
  const hasLessons = Number(totalLessons) > 0;
  const serviceLabel = hasLessons
    ? `pacote ${totalLessons} sessões${procedureAmount > 0 ? " e procedimentos" : ""}`
    : "procedimentos";
  const description = [
    `${isRenewal ? "Recebimento inicial da renovação" : "Recebimento inicial"} de ${
      patientName || "paciente"
    } - ${serviceLabel}`,
    method ? `(${method})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const { error } = await supabase.from(TRANSACTIONS_TABLE).insert({
    clinic_id: clinicId,
    patient_id: patientId,
    amount: amountPaid,
    type: "income",
    category: hasLessons
      ? "Recebimento de pacote"
      : "Recebimento de procedimentos",
    status: "paid",
    description,
    due_date: paymentDate,
  });

  if (error) {
    throw formatSupabaseError(
      "Erro ao registrar pagamento inicial",
      error,
      TRANSACTIONS_TABLE,
    );
  }
}

async function registrarFinanceiroProcedimentosAvulsos({
  clinicId,
  patientId,
  patientName,
  totalAmount,
  amountPaid,
  paymentMethod,
  isRenewal = false,
  replaceExisting = false,
}: {
  clinicId: string;
  patientId: string;
  patientName: string;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: string;
  isRenewal?: boolean;
  replaceExisting?: boolean;
}) {
  if (replaceExisting) {
    const { error: deleteError } = await supabase
      .from(TRANSACTIONS_TABLE)
      .delete()
      .eq("patient_id", patientId)
      .eq("category", "Recebimento de procedimentos");

    if (deleteError) {
      throw formatSupabaseError(
        "Erro ao substituir financeiro dos procedimentos",
        deleteError,
        TRANSACTIONS_TABLE,
      );
    }
  }

  if (totalAmount <= 0) return;

  const method = emptyToNull(paymentMethod);
  const paymentDate = todayDate();
  const safePaid = Math.min(Math.max(amountPaid, 0), totalAmount);
  const pendingAmount = Math.max(totalAmount - safePaid, 0);
  const baseDescription = `${isRenewal ? "Renovação" : "Contratação"} de procedimentos de ${
    patientName || "paciente"
  }`;
  const rows = [
    safePaid > 0
      ? {
          clinic_id: clinicId,
          patient_id: patientId,
          amount: safePaid,
          type: "income",
          category: "Recebimento de procedimentos",
          status: "paid",
          description: `${baseDescription} - recebido${method ? ` (${method})` : ""}`,
          due_date: paymentDate,
        }
      : null,
    pendingAmount > 0
      ? {
          clinic_id: clinicId,
          patient_id: patientId,
          amount: pendingAmount,
          type: "income",
          category: "Recebimento de procedimentos",
          status: "pending",
          description: `${baseDescription} - saldo em aberto`,
          due_date: paymentDate,
        }
      : null,
  ].filter((row): row is TransactionInsert => Boolean(row));

  if (rows.length === 0) return;

  const { error } = await supabase.from(TRANSACTIONS_TABLE).insert(rows);

  if (error) {
    throw formatSupabaseError(
      "Erro ao registrar financeiro dos procedimentos",
      error,
      TRANSACTIONS_TABLE,
    );
  }
}

async function sincronizarParcelasPacote(
  clinicId: string,
  packageId: string,
  patientId: string,
  form: NewPatientForm,
  totalAmount: number,
) {
  const installments = buildInstallments(
    clinicId,
    packageId,
    patientId,
    form,
    totalAmount,
  );

  const { error: upsertError } = await supabase
    .from(INSTALLMENTS_TABLE)
    .upsert(installments, { onConflict: "package_id,installment_number" });

  if (upsertError) {
    throw formatSupabaseError(
      "Erro ao atualizar parcelas",
      upsertError,
      INSTALLMENTS_TABLE,
    );
  }

  const { error: deleteError } = await supabase
    .from(INSTALLMENTS_TABLE)
    .delete()
    .eq("package_id", packageId)
    .gt("installment_number", installments.length);

  if (deleteError) {
    throw formatSupabaseError(
      "Erro ao remover parcelas excedentes",
      deleteError,
      INSTALLMENTS_TABLE,
    );
  }
}

export async function criarPaciente(
  clinicId: string,
  form: NewPatientForm,
): Promise<Patient> {
  const withLessons = hasLessonPackage(form);
  const procedureAmount = getProcedureAmount(form);
  const totalAmount = getFinancialTotalAmount(form);
  const amountPaid = Number(form.amount_paid) || 0;
  const paymentStatus = paymentStatusFromAmounts(
    totalAmount,
    amountPaid,
    form.payment_status,
  );
  const procedures = normalizeProcedures(form);
  const patientPlanFields = getPatientPlanFields(form);
  const address = normalizeAddress(form);
  validatePaymentAmount(form, totalAmount);

  if (!withLessons) {
    validateStandaloneProcedureFields(form);
  }

  await assertPatientIsNotDuplicate(clinicId, form);

  let lessonDates: string[] = [];

  if (withLessons) {
    validateLessonPackageFields(form);
    lessonDates = generateLessonDates(
      form.plan_start_date,
      form.fixed_weekdays,
      form.contracted_lessons,
    );
  }

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
      quick_note: emptyToNull(form.quick_note),
      address,
      status: form.status,
      ...patientPlanFields,
      responsible_professional_id: form.responsible_professional_id,
      procedures,
    })
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, quick_note, address, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, procedures, created_at",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao cadastrar paciente", error);
  }

  const patient = data as Patient;
  if (!withLessons) {
    await criarAgendamentosProcedimentosAvulsos({
      clinicId,
      patientId: patient.id,
      professionalId: form.responsible_professional_id,
      form,
      procedures,
    });

    await registrarFinanceiroProcedimentosAvulsos({
      clinicId,
      patientId: patient.id,
      patientName: patient.full_name,
      totalAmount,
      amountPaid,
      paymentMethod: form.payment_method,
    });

    return {
      ...patient,
      lesson_packages: [],
    };
  }

  const { data: packageData, error: packageError } = await supabase
    .from(PACKAGES_TABLE)
    .insert({
      clinic_id: clinicId,
      patient_id: patient.id,
      professional_id: form.responsible_professional_id,
      total_lessons: form.contracted_lessons,
      lesson_value: getLessonUnitValue(form),
      procedure_amount: procedureAmount,
      procedure_credits: procedures,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: emptyToNull(form.payment_method),
      payment_status: paymentStatus,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date:
        lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: SESSION_DURATION_MINUTES,
    })
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (packageError) {
    throw formatSupabaseError(
      "Erro ao cadastrar pacote",
      packageError,
      PACKAGES_TABLE,
    );
  }

  const activePackage = packageData as PackageSummary;
  await criarParcelasPacote(
    clinicId,
    activePackage.id,
    patient.id,
    form,
    totalAmount,
  );

  await sincronizarAgendamentosPacote({
    clinicId,
    patientId: patient.id,
    professionalId: form.responsible_professional_id,
    packageId: activePackage.id,
    lessonDates,
    form,
    totalLessons: activePackage.total_lessons,
  });

  await registrarRecebimentoInicial({
    clinicId,
    patientId: patient.id,
    patientName: patient.full_name,
    amountPaid,
    procedureAmount,
    paymentMethod: form.payment_method,
    totalLessons: activePackage.total_lessons,
  });

  return {
    ...patient,
    lesson_packages: [activePackage],
  };
}

export async function renovarPacotePaciente(
  clinicId: string,
  patientId: string,
  form: NewPatientForm,
): Promise<Patient> {
  const withLessons = hasLessonPackage(form);
  const procedureAmount = getProcedureAmount(form);
  const totalAmount = getFinancialTotalAmount(form);
  const amountPaid = Number(form.amount_paid) || 0;
  const paymentStatus = paymentStatusFromAmounts(
    totalAmount,
    amountPaid,
    form.payment_status,
  );
  const procedures = normalizeProcedures(form);
  const patientPlanFields = getPatientPlanFields(form);
  const address = normalizeAddress(form);
  validatePaymentAmount(form, totalAmount);

  if (!withLessons) {
    validateStandaloneProcedureFields(form);
  }

  let lessonDates: string[] = [];

  if (withLessons) {
    validateLessonPackageFields(form);
    lessonDates = generateLessonDates(
      form.plan_start_date,
      form.fixed_weekdays,
      form.contracted_lessons,
    );
  }

  const { data: patientData, error: patientError } = await supabase
    .from(PATIENTS_TABLE)
    .update({
      status: "ativo",
      quick_note: emptyToNull(form.quick_note),
      address,
      ...patientPlanFields,
      responsible_professional_id: form.responsible_professional_id,
      procedures,
    })
    .eq("id", patientId)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, quick_note, address, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, procedures, created_at",
    )
    .single();

  if (patientError) {
    throw formatSupabaseError("Erro ao atualizar paciente", patientError);
  }

  if (!withLessons) {
    await criarAgendamentosProcedimentosAvulsos({
      clinicId,
      patientId,
      professionalId: form.responsible_professional_id,
      form,
      procedures,
      isRenewal: true,
    });

    await registrarFinanceiroProcedimentosAvulsos({
      clinicId,
      patientId,
      patientName: (patientData as Patient).full_name,
      totalAmount,
      amountPaid,
      paymentMethod: form.payment_method,
      isRenewal: true,
    });

    return {
      ...(patientData as Patient),
      lesson_packages: [],
    };
  }

  const { data: packageData, error: packageError } = await supabase
    .from(PACKAGES_TABLE)
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: form.responsible_professional_id,
      total_lessons: form.contracted_lessons,
      lesson_value: getLessonUnitValue(form),
      procedure_amount: procedureAmount,
      procedure_credits: procedures,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: emptyToNull(form.payment_method),
      payment_status: paymentStatus,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date:
        lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: SESSION_DURATION_MINUTES,
    })
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (packageError) {
    throw formatSupabaseError(
      "Erro ao renovar pacote",
      packageError,
      PACKAGES_TABLE,
    );
  }

  const renewedPackage = packageData as PackageSummary;
  await criarParcelasPacote(
    clinicId,
    renewedPackage.id,
    patientId,
    form,
    totalAmount,
  );

  await sincronizarAgendamentosPacote({
    clinicId,
    patientId,
    professionalId: form.responsible_professional_id,
    packageId: renewedPackage.id,
    lessonDates,
    form,
    totalLessons: renewedPackage.total_lessons,
    isRenewal: true,
  });

  await registrarRecebimentoInicial({
    clinicId,
    patientId,
    patientName: (patientData as Patient).full_name,
    amountPaid,
    procedureAmount,
    paymentMethod: form.payment_method,
    totalLessons: renewedPackage.total_lessons,
    isRenewal: true,
  });

  return {
    ...(patientData as Patient),
    lesson_packages: [renewedPackage],
  };
}

export async function atualizarPaciente(
  patientId: string,
  form: NewPatientForm,
): Promise<Patient> {
  const withLessons = hasLessonPackage(form);
  const totalAmount = getFinancialTotalAmount(form);
  const procedures = normalizeProcedures(form);
  const amountPaid = Number(form.amount_paid) || 0;
  const patientPlanFields = getPatientPlanFields(form);
  const address = normalizeAddress(form);
  validatePaymentAmount(form, totalAmount);

  if (!withLessons && procedures.length > 0) {
    validateStandaloneProcedureFields(form);
  }

  const clinicId = await getPatientClinicId(patientId);
  await assertPatientIsNotDuplicate(clinicId, form, patientId);

  const { data, error } = await supabase
    .from(PATIENTS_TABLE)
    .update({
      full_name: form.full_name.trim(),
      cpf: emptyToNull(form.cpf),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      birth_date: emptyToNull(form.birth_date),
      gender: emptyToNull(form.gender),
      quick_note: emptyToNull(form.quick_note),
      address,
      status: form.status,
      ...patientPlanFields,
      responsible_professional_id: form.responsible_professional_id,
      procedures,
    })
    .eq("id", patientId)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, quick_note, address, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, procedures, created_at",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao atualizar paciente", error);
  }

  const patient = data as Patient;
  const activePackage = await atualizarPacotePrincipal(
    patientId,
    form,
    totalAmount,
    clinicId,
  );

  if (!withLessons && procedures.length > 0) {
    await criarAgendamentosProcedimentosAvulsos({
      clinicId: patient.clinic_id,
      patientId,
      professionalId: form.responsible_professional_id,
      form,
      procedures,
      replaceExisting: true,
    });

    await registrarFinanceiroProcedimentosAvulsos({
      clinicId: patient.clinic_id,
      patientId,
      patientName: patient.full_name,
      totalAmount,
      amountPaid,
      paymentMethod: form.payment_method,
      replaceExisting: true,
    });
  }

  return {
    ...patient,
    lesson_packages: activePackage ? [activePackage] : [],
  };
}

async function atualizarPacotePrincipal(
  patientId: string,
  form: NewPatientForm,
  totalAmount: number,
  patientClinicId: string,
): Promise<PackageSummary | null> {
  const { data: packageRow, error: packageFetchError } = await supabase
    .from(PACKAGES_TABLE)
    .select("id, clinic_id")
    .eq("patient_id", patientId)
    .eq("status", "ativo")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (packageFetchError) {
    throw formatSupabaseError(
      "Erro ao buscar pacote",
      packageFetchError,
      PACKAGES_TABLE,
    );
  }

  if (!hasLessonPackage(form) && !packageRow) return null;

  const packageId = (packageRow as { id: string; clinic_id: string } | null)
    ?.id;
  const clinicId =
    (packageRow as { id: string; clinic_id: string } | null)?.clinic_id ??
    patientClinicId;

  if (!hasLessonPackage(form)) {
    const { error: deleteAppointmentsError } = await supabase
      .from("appointments")
      .delete()
      .eq("package_id", packageId)
      .in("status", ["agendada", "confirmada", "cancelada"]);

    if (deleteAppointmentsError) {
      throw formatSupabaseError(
        "Erro ao remover sessões futuras do pacote",
        deleteAppointmentsError,
        "appointments",
      );
    }

    const { error: packageCancelError } = await supabase
      .from(PACKAGES_TABLE)
      .update({ status: "cancelado" })
      .eq("id", packageId);

    if (packageCancelError) {
      throw formatSupabaseError(
        "Erro ao cancelar pacote sem sessões",
        packageCancelError,
        PACKAGES_TABLE,
      );
    }

    return null;
  }

  const procedures = normalizeProcedures(form);
  const procedureAmount = getProcedureAmount(form);
  const amountPaid = Number(form.amount_paid) || 0;
  const paymentStatus = paymentStatusFromAmounts(
    totalAmount,
    amountPaid,
    form.payment_status,
  );
  validateLessonPackageFields(form);
  const lessonDates = generateLessonDates(
    form.plan_start_date,
    form.fixed_weekdays,
    form.contracted_lessons,
  );

  if (!packageId) {
    const { data, error } = await supabase
      .from(PACKAGES_TABLE)
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        professional_id: form.responsible_professional_id,
        total_lessons: form.contracted_lessons,
        lesson_value: getLessonUnitValue(form),
        procedure_amount: procedureAmount,
        procedure_credits: procedures,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        payment_method: emptyToNull(form.payment_method),
        payment_status: paymentStatus,
        installments: Number(form.installments) || 1,
        start_date: form.plan_start_date,
        expected_end_date:
          lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
        fixed_weekdays: form.fixed_weekdays,
        fixed_time: form.fixed_time,
        lesson_duration_minutes: SESSION_DURATION_MINUTES,
        status: form.status === "encerrado" ? "cancelado" : "ativo",
      })
      .select(
        "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
      )
      .single();

    if (error) {
      throw formatSupabaseError(
        "Erro ao cadastrar pacote",
        error,
        PACKAGES_TABLE,
      );
    }

    const createdPackage = data as PackageSummary;
    await criarParcelasPacote(
      clinicId,
      createdPackage.id,
      patientId,
      form,
      totalAmount,
    );

    await sincronizarAgendamentosPacote({
      clinicId,
      patientId,
      professionalId: form.responsible_professional_id,
      packageId: createdPackage.id,
      lessonDates,
      form,
      totalLessons: createdPackage.total_lessons,
    });

    return createdPackage;
  }

  const { data, error } = await supabase
    .from(PACKAGES_TABLE)
    .update({
      professional_id: form.responsible_professional_id,
      total_lessons: form.contracted_lessons,
      lesson_value: getLessonUnitValue(form),
      procedure_amount: procedureAmount,
      procedure_credits: procedures,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: emptyToNull(form.payment_method),
      payment_status: paymentStatus,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date:
        lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: SESSION_DURATION_MINUTES,
      status: form.status === "encerrado" ? "cancelado" : "ativo",
    })
    .eq("id", packageId)
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (error) {
    throw formatSupabaseError(
      "Erro ao atualizar pacote",
      error,
      PACKAGES_TABLE,
    );
  }

  await sincronizarParcelasPacote(
    clinicId,
    packageId,
    patientId,
    form,
    totalAmount,
  );

  await sincronizarAgendamentosPacote({
    clinicId,
    patientId,
    professionalId: form.responsible_professional_id,
    packageId,
    lessonDates,
    form,
    totalLessons: (data as PackageSummary).total_lessons,
  });

  return data as PackageSummary;
}

export async function repararAgendamentosPendentes(
  clinicId: string,
): Promise<AppointmentRepairResult> {
  const result: AppointmentRepairResult = {
    packagesChecked: 0,
    patientsChecked: 0,
    packageAppointmentsCreated: 0,
    procedureAppointmentsCreated: 0,
  };

  const { data: packagesData, error: packagesError } = await supabase
    .from(PACKAGES_TABLE)
    .select(
      "id, clinic_id, patient_id, professional_id, total_lessons, lesson_value, start_date, fixed_weekdays, fixed_time, status, procedure_credits",
    )
    .eq("clinic_id", clinicId)
    .eq("status", "ativo");

  if (packagesError) {
    throw formatSupabaseError(
      "Erro ao buscar pacotes para reparar agenda",
      packagesError,
      PACKAGES_TABLE,
    );
  }

  const packages = (packagesData ?? []) as RepairablePackage[];
  result.packagesChecked = packages.length;

  const packageIds = packages.map((packageItem) => packageItem.id);
  const existingStartTimesByPackage = new Map<string, Set<string>>();

  if (packageIds.length > 0) {
    const { data: existingLessons, error: existingLessonsError } =
      await supabase
        .from("appointments")
        .select("package_id, start_time")
        .in("package_id", packageIds);

    if (existingLessonsError) {
      throw formatSupabaseError(
        "Erro ao verificar sessões já existentes",
        existingLessonsError,
        "appointments",
      );
    }

    (
      (existingLessons ?? []) as Array<{
        package_id: string | null;
        start_time: string | null;
      }>
    ).forEach((appointment) => {
      if (!appointment.package_id || !appointment.start_time) return;

      const startTimes =
        existingStartTimesByPackage.get(appointment.package_id) ??
        new Set<string>();
      startTimes.add(appointment.start_time);
      existingStartTimesByPackage.set(appointment.package_id, startTimes);
    });
  }

  const missingPackageAppointments = packages.flatMap((packageItem) =>
    buildRepairLessonAppointments(
      packageItem,
      existingStartTimesByPackage.get(packageItem.id) ?? new Set<string>(),
    ),
  );

  if (missingPackageAppointments.length > 0) {
    const { error: insertPackageAppointmentsError } = await supabase
      .from("appointments")
      .upsert(missingPackageAppointments, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      });

    if (insertPackageAppointmentsError) {
      throw formatSupabaseError(
        "Erro ao recriar sessões pendentes dos pacotes",
        insertPackageAppointmentsError,
        "appointments",
      );
    }

    result.packageAppointmentsCreated = missingPackageAppointments.length;
  }

  const { data: patientsData, error: patientsError } = await supabase
    .from(PATIENTS_TABLE)
    .select("id, clinic_id, procedures, responsible_professional_id")
    .eq("clinic_id", clinicId)
    .neq("status", "encerrado");

  if (patientsError) {
    throw formatSupabaseError(
      "Erro ao buscar pacientes para reparar procedimentos",
      patientsError,
    );
  }

  const patients = (patientsData ?? []) as RepairablePatient[];
  result.patientsChecked = patients.length;

  const packageProceduresByPatient = packages.reduce<
    Record<string, PatientProcedure[]>
  >((map, packageItem) => {
    const procedures = packageItem.procedure_credits ?? [];
    if (procedures.length === 0) return map;

    map[packageItem.patient_id] = [
      ...(map[packageItem.patient_id] ?? []),
      ...procedures,
    ];
    return map;
  }, {});

  const packageProfessionalByPatient = packages.reduce<Record<string, string>>(
    (map, packageItem) => {
      if (packageItem.professional_id && !map[packageItem.patient_id]) {
        map[packageItem.patient_id] = packageItem.professional_id;
      }
      return map;
    },
    {},
  );

  for (const patient of patients) {
    const procedures = [
      ...(patient.procedures ?? []),
      ...(packageProceduresByPatient[patient.id] ?? []),
    ];

    if (procedures.length === 0) continue;

    const requestedAppointments = buildStandaloneProcedureAppointments({
      clinicId,
      patientId: patient.id,
      professionalId:
        patient.responsible_professional_id ??
        packageProfessionalByPatient[patient.id] ??
        null,
      procedures,
    });
    const uniqueAppointments = Array.from(
      new Map(
        requestedAppointments.map((appointment) => [
          `${appointment.type}|${appointment.start_time}`,
          appointment,
        ]),
      ).values(),
    );
    const missingAppointments =
      await filterExistingStandaloneProcedureAppointments(
        patient.id,
        uniqueAppointments,
      );

    if (missingAppointments.length === 0) continue;

    const { error: insertProcedureAppointmentsError } = await supabase
      .from("appointments")
      .upsert(missingAppointments, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      });
    if (insertProcedureAppointmentsError) {
      throw formatSupabaseError(
        "Erro ao recriar procedimentos pendentes na agenda",
        insertProcedureAppointmentsError,
        "appointments",
      );
    }

    result.procedureAppointmentsCreated += missingAppointments.length;
  }

  return result;
}

export async function encerrarPaciente(patientId: string): Promise<void> {
  const { error } = await supabase
    .from(PATIENTS_TABLE)
    .update({ status: "encerrado" })
    .eq("id", patientId);

  if (error) {
    throw formatSupabaseError("Erro ao encerrar paciente", error);
  }

  const { error: packageError } = await supabase
    .from(PACKAGES_TABLE)
    .update({ status: "cancelado" })
    .eq("patient_id", patientId)
    .eq("status", "ativo");

  if (packageError) {
    throw formatSupabaseError(
      "Erro ao encerrar pacote",
      packageError,
      PACKAGES_TABLE,
    );
  }
}

export async function atualizarObservacaoPaciente(
  patientId: string,
  quickNote: string,
): Promise<Pick<Patient, "id" | "quick_note">> {
  const { data, error } = await supabase
    .from(PATIENTS_TABLE)
    .update({ quick_note: emptyToNull(quickNote.slice(0, 180)) })
    .eq("id", patientId)
    .select("id, quick_note")
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao atualizar observação", error);
  }

  return data as Pick<Patient, "id" | "quick_note">;
}
