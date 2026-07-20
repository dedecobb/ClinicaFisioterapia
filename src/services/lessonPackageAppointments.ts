import { supabase } from "../lib/supabase";

const DEFAULT_SESSION_DURATION_MINUTES = 60;

function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes, 0);
  return date.toTimeString().slice(0, 5);
}

function toDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function generateLessonDates(
  startDate: string,
  weekdays: number[],
  totalLessons: number,
): string[] {
  if (totalLessons <= 0 || !startDate || weekdays.length === 0) return [];

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

interface PackageAppointmentInput {
  id: string;
  clinic_id?: string | null;
  patient_id: string;
  professional_id?: string | null;
  total_lessons: number;
  start_date: string;
  fixed_weekdays?: number[] | null;
  fixed_time?: string | null;
  lesson_duration_minutes?: number | null;
  lesson_value?: number | string | null;
}

function buildMissingAppointmentsForPackage(
  packageItem: PackageAppointmentInput,
  existingAppointments: Array<{ package_lesson_number: number | null; start_time: string | null }>,
) {
  if (!packageItem.fixed_time) return [];

  const lessonDates = generateLessonDates(
    packageItem.start_date,
    packageItem.fixed_weekdays ?? [],
    packageItem.total_lessons,
  );
  const existingLessonNumbers = new Set(
    existingAppointments
      .map((appointment) => appointment.package_lesson_number)
      .filter((value): value is number => Number.isInteger(value)),
  );
  const existingStartTimes = new Set(
    existingAppointments
      .map((appointment) => appointment.start_time)
      .filter((value): value is string => Boolean(value)),
  );

  const endTime = addMinutesToTime(
    packageItem.fixed_time,
    packageItem.lesson_duration_minutes || DEFAULT_SESSION_DURATION_MINUTES,
  );

  return lessonDates.flatMap((lessonDate, index) => {
    const lessonNumber = index + 1;
    const startTime = toDateTime(lessonDate, packageItem.fixed_time);

    if (existingLessonNumbers.has(lessonNumber)) return [];
    if (existingStartTimes.has(startTime)) return [];

    return [
      {
        clinic_id: packageItem.clinic_id ?? null,
        patient_id: packageItem.patient_id,
        professional_id: packageItem.professional_id ?? null,
        package_id: packageItem.id,
        package_lesson_number: lessonNumber,
        class_price: Number(packageItem.lesson_value) || 0,
        start_time: startTime,
        end_time: toDateTime(lessonDate, endTime),
        type: "Fisioterapia",
        status: "agendada",
        notes: `Aula ${lessonNumber}/${packageItem.total_lessons} do pacote.`,
      },
    ];
  });
}

export async function ensureMissingPackageAppointmentsForPatient(
  patientId: string,
): Promise<number> {
  const { data: packageRows, error: packageError } = await supabase
    .from("lesson_packages")
    .select(
      "id, clinic_id, patient_id, professional_id, total_lessons, start_date, fixed_weekdays, fixed_time, lesson_duration_minutes, lesson_value, status",
    )
    .eq("patient_id", patientId)
    .eq("status", "ativo")
    .order("start_date", { ascending: false });

  if (packageError) {
    throw new Error(`Erro ao buscar pacotes do paciente: ${packageError.message}`);
  }

  let createdCount = 0;

  for (const packageItem of (packageRows ?? []) as PackageAppointmentInput[]) {
    const { data: existingAppointments, error: appointmentError } = await supabase
      .from("appointments")
      .select("package_lesson_number, start_time")
      .eq("package_id", packageItem.id);

    if (appointmentError) {
      throw new Error(
        `Erro ao buscar sessões existentes do pacote: ${appointmentError.message}`,
      );
    }

    const missingAppointments = buildMissingAppointmentsForPackage(
      packageItem,
      (existingAppointments ?? []) as Array<{
        package_lesson_number: number | null;
        start_time: string | null;
      }>,
    );

    if (missingAppointments.length === 0) continue;

    const { error: insertError } = await supabase
      .from("appointments")
      .insert(missingAppointments);

    if (insertError) {
      throw new Error(`Erro ao criar aulas faltantes do pacote: ${insertError.message}`);
    }

    createdCount += missingAppointments.length;
  }

  return createdCount;
}

export async function ensureMissingPackageAppointmentsForActivePackages(): Promise<number> {
  const { data: packageRows, error: packageError } = await supabase
    .from("lesson_packages")
    .select(
      "id, clinic_id, patient_id, professional_id, total_lessons, start_date, fixed_weekdays, fixed_time, lesson_duration_minutes, lesson_value, status",
    )
    .eq("status", "ativo");

  if (packageError) {
    throw new Error(`Erro ao buscar pacotes ativos: ${packageError.message}`);
  }

  let createdCount = 0;

  for (const packageItem of (packageRows ?? []) as PackageAppointmentInput[]) {
    const { data: existingAppointments, error: appointmentError } = await supabase
      .from("appointments")
      .select("package_lesson_number, start_time")
      .eq("package_id", packageItem.id);

    if (appointmentError) {
      throw new Error(
        `Erro ao buscar sessões existentes do pacote: ${appointmentError.message}`,
      );
    }

    const missingAppointments = buildMissingAppointmentsForPackage(
      packageItem,
      (existingAppointments ?? []) as Array<{
        package_lesson_number: number | null;
        start_time: string | null;
      }>,
    );

    if (missingAppointments.length === 0) continue;

    const { error: insertError } = await supabase
      .from("appointments")
      .insert(missingAppointments);

    if (insertError) {
      throw new Error(`Erro ao criar aulas faltantes do pacote: ${insertError.message}`);
    }

    createdCount += missingAppointments.length;
  }

  return createdCount;
}
