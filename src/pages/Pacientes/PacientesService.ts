import { supabase } from "../../lib/supabase";
import {
  NewPatientForm,
  PackageSummary,
  Patient,
  PatientProcedure,
  PROCEDURE_OPTIONS,
} from "./types";

const PATIENTS_TABLE = "patients";
const PACKAGES_TABLE = "lesson_packages";
const INSTALLMENTS_TABLE = "package_installments";
const TRANSACTIONS_TABLE = "transactions";
const CLINIC_UTC_OFFSET = "-03:00";

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

function normalizeProcedures(form: NewPatientForm): PatientProcedure[] {
  return form.procedures
    .map((procedure) => {
      const option = PROCEDURE_OPTIONS.find(
        (item) => item.type === procedure.type,
      );

      return {
        type: procedure.type,
        name: option?.name ?? procedure.name,
        agreed_value: Number(procedure.agreed_value) || 0,
        quantity: Number(procedure.quantity) || 1,
      };
    })
    .filter((procedure) => procedure.name.trim());
}

function getProcedureAmount(form: NewPatientForm): number {
  return normalizeProcedures(form).reduce(
    (total, procedure) =>
      total + procedure.agreed_value * procedure.quantity,
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

function getFinancialTotalAmount(form: NewPatientForm): number {
  return getLessonsAmount(form) + getProcedureAmount(form);
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
  }

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

  return (data ?? []).map((patient) => ({
    ...(patient as Patient),
    lesson_packages: ((patient as Patient).lesson_packages ?? []).sort(
      (a, b) => b.start_date.localeCompare(a.start_date),
    ),
  }));
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes, 0);
  return date.toTimeString().slice(0, 5);
}

function toDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00${CLINIC_UTC_OFFSET}`).toISOString();
}

function generateLessonDates(
  startDate: string,
  weekdays: number[],
  totalLessons: number,
): string[] {
  if (totalLessons <= 0) return [];
  if (!startDate || weekdays.length === 0) {
    throw new Error("Informe data inicial e dias fixos para gerar as aulas.");
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

function addMonths(date: string, months: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPatientPlanFields(form: NewPatientForm) {
  const withLessons = hasLessonPackage(form);

  return {
    plan_start_date: emptyToNull(form.plan_start_date),
    contracted_lessons: withLessons ? form.contracted_lessons : null,
    fixed_weekdays: withLessons ? form.fixed_weekdays : null,
    fixed_time: withLessons ? emptyToNull(form.fixed_time) : null,
  };
}

function validateLessonPackageFields(form: NewPatientForm) {
  if (!hasLessonPackage(form)) return;

  if (!form.plan_start_date || !form.fixed_time || form.fixed_weekdays.length === 0) {
    throw new Error("Informe data inicial, dias fixos e horário para gerar as aulas.");
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
    throw formatSupabaseError("Erro ao gerar parcelas", error, INSTALLMENTS_TABLE);
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
    ? `pacote ${totalLessons} aulas${procedureAmount > 0 ? " e procedimentos" : ""}`
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
      status: form.status,
      ...patientPlanFields,
      responsible_professional_id: form.responsible_professional_id,
      procedures,
    })
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, procedures, created_at",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao cadastrar paciente", error);
  }

  const patient = data as Patient;
  if (!withLessons) {
    await registrarRecebimentoInicial({
      clinicId,
      patientId: patient.id,
      patientName: patient.full_name,
      amountPaid,
      procedureAmount,
      paymentMethod: form.payment_method,
    });

    return {
      ...patient,
      lesson_packages: [],
    };
  }

  validateLessonPackageFields(form);
  const lessonDates = generateLessonDates(
    form.plan_start_date,
    form.fixed_weekdays,
    form.contracted_lessons,
  );
  const endTime = addMinutesToTime(
    form.fixed_time,
    form.lesson_duration_minutes,
  );

  const { data: packageData, error: packageError } = await supabase
    .from(PACKAGES_TABLE)
    .insert({
      clinic_id: clinicId,
      patient_id: patient.id,
      professional_id: form.responsible_professional_id,
      total_lessons: form.contracted_lessons,
      lesson_value: Number(form.lesson_value) || 0,
      procedure_amount: procedureAmount,
      procedure_credits: procedures,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: emptyToNull(form.payment_method),
      payment_status: paymentStatus,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date: lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: form.lesson_duration_minutes,
    })
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (packageError) {
    throw formatSupabaseError("Erro ao cadastrar pacote", packageError, PACKAGES_TABLE);
  }

  const activePackage = packageData as PackageSummary;
  await criarParcelasPacote(
    clinicId,
    activePackage.id,
    patient.id,
    form,
    totalAmount,
  );

  const appointments = lessonDates.map((lessonDate, index) => ({
    clinic_id: clinicId,
    patient_id: patient.id,
    professional_id: form.responsible_professional_id,
    package_id: activePackage.id,
    package_lesson_number: index + 1,
    class_price: Number(form.lesson_value) || 0,
    start_time: toDateTime(lessonDate, form.fixed_time),
    end_time: toDateTime(lessonDate, endTime),
    type: "Fisioterapia",
    status: "agendada",
    notes: `Aula ${index + 1}/${form.contracted_lessons} do pacote.`,
  }));

  const { error: appointmentsError } = await supabase
    .from("appointments")
    .insert(appointments);

  if (appointmentsError) {
    throw formatSupabaseError(
      "Erro ao gerar aulas do pacote",
      appointmentsError,
      "appointments",
    );
  }

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

  const { data: patientData, error: patientError } = await supabase
    .from(PATIENTS_TABLE)
    .update({
      status: "ativo",
      ...patientPlanFields,
      responsible_professional_id: form.responsible_professional_id,
      procedures,
    })
    .eq("id", patientId)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, procedures, created_at",
    )
    .single();

  if (patientError) {
    throw formatSupabaseError("Erro ao atualizar paciente", patientError);
  }

  if (!withLessons) {
    await registrarRecebimentoInicial({
      clinicId,
      patientId,
      patientName: (patientData as Patient).full_name,
      amountPaid,
      procedureAmount,
      paymentMethod: form.payment_method,
      isRenewal: true,
    });

    return {
      ...(patientData as Patient),
      lesson_packages: [],
    };
  }

  validateLessonPackageFields(form);
  const lessonDates = generateLessonDates(
    form.plan_start_date,
    form.fixed_weekdays,
    form.contracted_lessons,
  );
  const endTime = addMinutesToTime(
    form.fixed_time,
    form.lesson_duration_minutes,
  );

  const { data: packageData, error: packageError } = await supabase
    .from(PACKAGES_TABLE)
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: form.responsible_professional_id,
      total_lessons: form.contracted_lessons,
      lesson_value: Number(form.lesson_value) || 0,
      procedure_amount: procedureAmount,
      procedure_credits: procedures,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: emptyToNull(form.payment_method),
      payment_status: paymentStatus,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date: lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: form.lesson_duration_minutes,
    })
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (packageError) {
    throw formatSupabaseError("Erro ao renovar pacote", packageError, PACKAGES_TABLE);
  }

  const renewedPackage = packageData as PackageSummary;
  await criarParcelasPacote(
    clinicId,
    renewedPackage.id,
    patientId,
    form,
    totalAmount,
  );

  const appointments = lessonDates.map((lessonDate, index) => ({
    clinic_id: clinicId,
    patient_id: patientId,
    professional_id: form.responsible_professional_id,
    package_id: renewedPackage.id,
    package_lesson_number: index + 1,
    class_price: Number(form.lesson_value) || 0,
    start_time: toDateTime(lessonDate, form.fixed_time),
    end_time: toDateTime(lessonDate, endTime),
    type: "Fisioterapia",
    status: "agendada",
    notes: `Renovação: aula ${index + 1}/${form.contracted_lessons} do novo pacote.`,
  }));

  const { error: appointmentsError } = await supabase
    .from("appointments")
    .insert(appointments);

  if (appointmentsError) {
    throw formatSupabaseError(
      "Erro ao gerar aulas da renovação",
      appointmentsError,
      "appointments",
    );
  }

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
  const totalAmount = getFinancialTotalAmount(form);
  const procedures = normalizeProcedures(form);
  const patientPlanFields = getPatientPlanFields(form);

  const { data, error } = await supabase
    .from(PATIENTS_TABLE)
    .update({
      full_name: form.full_name.trim(),
      cpf: emptyToNull(form.cpf),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      birth_date: emptyToNull(form.birth_date),
      gender: emptyToNull(form.gender),
      status: form.status,
      ...patientPlanFields,
      responsible_professional_id: form.responsible_professional_id,
      procedures,
    })
    .eq("id", patientId)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, procedures, created_at",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao atualizar paciente", error);
  }

  const patient = data as Patient;
  const activePackage = await atualizarPacotePrincipal(patientId, form, totalAmount);

  return {
    ...patient,
    lesson_packages: activePackage ? [activePackage] : [],
  };
}

async function atualizarPacotePrincipal(
  patientId: string,
  form: NewPatientForm,
  totalAmount: number,
): Promise<PackageSummary | null> {
  if (!hasLessonPackage(form)) return null;

  const { data: packageRow, error: packageFetchError } = await supabase
    .from(PACKAGES_TABLE)
    .select("id, clinic_id")
    .eq("patient_id", patientId)
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

  if (!packageRow) return null;

  const packageId = (packageRow as { id: string; clinic_id: string }).id;
  const clinicId = (packageRow as { id: string; clinic_id: string }).clinic_id;
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

  const { data, error } = await supabase
    .from(PACKAGES_TABLE)
    .update({
      professional_id: form.responsible_professional_id,
      total_lessons: form.contracted_lessons,
      lesson_value: Number(form.lesson_value) || 0,
      procedure_amount: procedureAmount,
      procedure_credits: procedures,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: emptyToNull(form.payment_method),
      payment_status: paymentStatus,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date: lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: form.lesson_duration_minutes,
      status: form.status === "encerrado" ? "cancelado" : "ativo",
    })
    .eq("id", packageId)
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, procedure_amount, procedure_credits, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao atualizar pacote", error, PACKAGES_TABLE);
  }

  await sincronizarParcelasPacote(
    clinicId,
    packageId,
    patientId,
    form,
    totalAmount,
  );

  return data as PackageSummary;
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
    throw formatSupabaseError("Erro ao encerrar pacote", packageError, PACKAGES_TABLE);
  }
}
