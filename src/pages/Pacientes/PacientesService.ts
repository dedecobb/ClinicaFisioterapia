import { supabase } from "../../lib/supabase";
import { NewPatientForm, PackageSummary, Patient } from "./types";

const PATIENTS_TABLE = "patients";
const PACKAGES_TABLE = "lesson_packages";
const INSTALLMENTS_TABLE = "package_installments";

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
      created_at,
      lesson_packages (
        id,
        total_lessons,
        completed_lessons,
        missed_lessons,
        justified_absences,
        justified_absence_limit,
        lesson_value,
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
  return new Date(`${date}T${time}:00`).toISOString();
}

function generateLessonDates(
  startDate: string,
  weekdays: number[],
  totalLessons: number,
): string[] {
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
    throw formatSupabaseError("Erro ao gerar parcelas", error);
  }
}

export async function criarPaciente(
  clinicId: string,
  form: NewPatientForm,
): Promise<Patient> {
  const totalAmount =
    Number(form.total_amount) ||
    Number(form.lesson_value) * Number(form.contracted_lessons);

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
      plan_start_date: form.plan_start_date,
      contracted_lessons: form.contracted_lessons,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      responsible_professional_id: form.responsible_professional_id,
    })
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, created_at",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao cadastrar paciente", error);
  }

  const patient = data as Patient;
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
      total_amount: totalAmount,
      amount_paid: Number(form.amount_paid) || 0,
      payment_method: emptyToNull(form.payment_method),
      payment_status: form.payment_status,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date: lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: form.lesson_duration_minutes,
    })
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (packageError) {
    throw formatSupabaseError("Erro ao cadastrar pacote", packageError);
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
    type: "Pilates Clínico",
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
    );
  }

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
  const totalAmount =
    Number(form.total_amount) ||
    Number(form.lesson_value) * Number(form.contracted_lessons);

  const { data: patientData, error: patientError } = await supabase
    .from(PATIENTS_TABLE)
    .update({
      status: "ativo",
      plan_start_date: form.plan_start_date,
      contracted_lessons: form.contracted_lessons,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      responsible_professional_id: form.responsible_professional_id,
    })
    .eq("id", patientId)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, created_at",
    )
    .single();

  if (patientError) {
    throw formatSupabaseError("Erro ao atualizar paciente", patientError);
  }

  await supabase
    .from(PACKAGES_TABLE)
    .update({ status: "concluido" })
    .eq("patient_id", patientId)
    .eq("status", "ativo");

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
      total_amount: totalAmount,
      amount_paid: Number(form.amount_paid) || 0,
      payment_method: emptyToNull(form.payment_method),
      payment_status: form.payment_status,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date: lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: form.lesson_duration_minutes,
    })
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (packageError) {
    throw formatSupabaseError("Erro ao renovar pacote", packageError);
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
    type: "Pilates Clínico",
    status: "agendada",
    notes: `Renovação: aula ${index + 1}/${form.contracted_lessons} do pacote.`,
  }));

  const { error: appointmentsError } = await supabase
    .from("appointments")
    .insert(appointments);

  if (appointmentsError) {
    throw formatSupabaseError(
      "Erro ao gerar aulas da renovação",
      appointmentsError,
    );
  }

  return {
    ...(patientData as Patient),
    lesson_packages: [renewedPackage],
  };
}

export async function atualizarPaciente(
  patientId: string,
  form: NewPatientForm,
): Promise<Patient> {
  const totalAmount =
    Number(form.total_amount) ||
    Number(form.lesson_value) * Number(form.contracted_lessons);

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
      plan_start_date: form.plan_start_date,
      contracted_lessons: form.contracted_lessons,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      responsible_professional_id: form.responsible_professional_id,
    })
    .eq("id", patientId)
    .select(
      "id, clinic_id, full_name, cpf, email, phone, birth_date, gender, status, plan_start_date, contracted_lessons, fixed_weekdays, fixed_time, responsible_professional_id, created_at",
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
  const { data: packageRow, error: packageFetchError } = await supabase
    .from(PACKAGES_TABLE)
    .select("id")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (packageFetchError) {
    throw formatSupabaseError("Erro ao buscar pacote", packageFetchError);
  }

  if (!packageRow) return null;

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
      total_amount: totalAmount,
      amount_paid: Number(form.amount_paid) || 0,
      payment_method: emptyToNull(form.payment_method),
      payment_status: form.payment_status,
      installments: Number(form.installments) || 1,
      start_date: form.plan_start_date,
      expected_end_date: lessonDates[lessonDates.length - 1] ?? form.plan_start_date,
      fixed_weekdays: form.fixed_weekdays,
      fixed_time: form.fixed_time,
      lesson_duration_minutes: form.lesson_duration_minutes,
      status: form.status === "encerrado" ? "cancelado" : "ativo",
    })
    .eq("id", (packageRow as { id: string }).id)
    .select(
      "id, total_lessons, completed_lessons, missed_lessons, justified_absences, justified_absence_limit, lesson_value, total_amount, amount_paid, payment_status, payment_method, installments, start_date, expected_end_date, fixed_weekdays, fixed_time, status",
    )
    .single();

  if (error) {
    throw formatSupabaseError("Erro ao atualizar pacote", error);
  }

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
    throw formatSupabaseError("Erro ao encerrar pacote", packageError);
  }
}
