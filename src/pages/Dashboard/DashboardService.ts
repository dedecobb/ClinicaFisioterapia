import { supabase } from "../../lib/supabase";
import {
  BirthdayPatient,
  DashboardData,
  DashboardStats,
  FinancialChartPoint,
} from "./types";

type PatientRow = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
};

type TransactionRow = {
  id: string;
  patient_id: string | null;
  amount: number | string;
  type: "income" | "expense";
  category: string;
  status: "paid" | "pending" | "overdue" | "cancelled";
  description: string | null;
  due_date: string | null;
  created_at: string | null;
};

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function moneyValue(value: number | string): number {
  return Number(value) || 0;
}

function cents(value: number | string): number {
  return Math.round(moneyValue(value) * 100);
}

function isStandaloneProcedureIncome(transaction: TransactionRow): boolean {
  return (
    transaction.type === "income" &&
    transaction.category === "Recebimento de procedimentos"
  );
}

function dedupeProcedureTransactions(
  transactions: TransactionRow[],
): TransactionRow[] {
  const seen = new Set<string>();

  return transactions.filter((transaction) => {
    if (!isStandaloneProcedureIncome(transaction)) return true;

    const key = [
      transaction.patient_id ?? transaction.description ?? transaction.id,
      transaction.type,
      transaction.category,
      transaction.status,
      transaction.due_date,
      cents(transaction.amount),
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTransactionDate(transaction: TransactionRow): Date {
  return new Date(transaction.due_date ?? transaction.created_at ?? new Date());
}

function buildFinancialChart(
  transactions: TransactionRow[],
): FinancialChartPoint[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: monthKey(date),
      name: monthFormatter.format(date).replace(".", ""),
      faturamento: 0,
      despesas: 0,
      saldo: 0,
    };
  });

  const byMonth = new Map(months.map((item) => [item.key, item]));

  transactions
    .filter((transaction) => transaction.status === "paid")
    .forEach((transaction) => {
      const bucket = byMonth.get(monthKey(getTransactionDate(transaction)));
      if (!bucket) return;

      const amount = moneyValue(transaction.amount);
      if (transaction.type === "expense") {
        bucket.despesas += amount;
      } else {
        bucket.faturamento += amount;
      }
      bucket.saldo = bucket.faturamento - bucket.despesas;
    });

  return months.map(({ name, faturamento, despesas, saldo }) => ({
    name,
    faturamento,
    despesas,
    saldo,
  }));
}

function birthdayThisYear(birthDate: string, reference: Date): Date {
  const [, month, day] = birthDate.split("-").map(Number);
  return new Date(reference.getFullYear(), month - 1, day);
}

function calculateAge(birthDate: string, reference: Date): number {
  const birth = new Date(`${birthDate}T12:00:00`);
  let age = reference.getFullYear() - birth.getFullYear();
  const birthday = birthdayThisYear(birthDate, reference);

  if (birthday > reference) {
    age -= 1;
  }

  return age;
}

function birthdayLabel(daysUntil: number, date: Date): string {
  if (daysUntil === 0) return "Hoje";
  if (daysUntil === 1) return "Amanhã";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function mapBirthdays(patients: PatientRow[]): BirthdayPatient[] {
  const today = startOfDay(new Date());
  const nextWeek = addDays(today, 7);

  return patients
    .filter((patient) => Boolean(patient.birth_date))
    .map((patient) => {
      const firstBirthday = birthdayThisYear(patient.birth_date!, today);
      const nextBirthday =
        firstBirthday < today
          ? new Date(today.getFullYear() + 1, firstBirthday.getMonth(), firstBirthday.getDate())
          : firstBirthday;
      const daysUntil = Math.round(
        (nextBirthday.getTime() - today.getTime()) / 86_400_000,
      );

      return {
        id: patient.id,
        name: patient.full_name,
        phone: patient.phone,
        birthDate: patient.birth_date!,
        label: birthdayLabel(daysUntil, nextBirthday),
        age: calculateAge(patient.birth_date!, nextBirthday),
        daysUntil,
      };
    })
    .filter((birthday) => {
      const birthdayDate = addDays(today, birthday.daysUntil);
      return birthdayDate <= nextWeek;
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, 5);
}

export async function getDashboardData(
  clinicId: string,
  access?: { id: string; role: string } | null,
): Promise<DashboardData> {
  const today = new Date();
  const todayStart = startOfDay(today);
  const tomorrowStart = addDays(todayStart, 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const sixMonthsStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const todayIsoDate = todayStart.toISOString().slice(0, 10);

  let patientsCountQuery = supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "ativo");
  let appointmentsCountQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("start_time", todayStart.toISOString())
    .lt("start_time", tomorrowStart.toISOString());
  let birthdayPatientsQuery = supabase
    .from("patients")
    .select("id, full_name, phone, birth_date")
    .eq("clinic_id", clinicId)
    .eq("status", "ativo")
    .not("birth_date", "is", null);

  if (access?.role === "physio") {
    patientsCountQuery = patientsCountQuery.eq(
      "responsible_professional_id",
      access.id,
    );
    appointmentsCountQuery = appointmentsCountQuery.eq(
      "professional_id",
      access.id,
    );
    birthdayPatientsQuery = birthdayPatientsQuery.eq(
      "responsible_professional_id",
      access.id,
    );
  }

  const [
    patientsCountResult,
    appointmentsCountResult,
    monthTransactionsResult,
    chartTransactionsResult,
    birthdayPatientsResult,
  ] = await Promise.all([
    patientsCountQuery,
    appointmentsCountQuery,
    supabase
      .from("transactions")
      .select("id, patient_id, amount, type, category, status, description, due_date, created_at")
      .eq("clinic_id", clinicId)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("id, patient_id, amount, type, category, status, description, due_date, created_at")
      .eq("clinic_id", clinicId)
      .gte("created_at", sixMonthsStart.toISOString()),
    birthdayPatientsQuery,
  ]);

  const results = [
    patientsCountResult,
    appointmentsCountResult,
    monthTransactionsResult,
    chartTransactionsResult,
    birthdayPatientsResult,
  ];

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Erro ao carregar dashboard: ${failed.error.message}`);
  }

  const monthTransactions = dedupeProcedureTransactions(
    (monthTransactionsResult.data ?? []) as TransactionRow[],
  );
  const paidIncome = monthTransactions
    .filter(
      (transaction) =>
        transaction.status === "paid" && transaction.type === "income",
    )
    .reduce((total, transaction) => total + moneyValue(transaction.amount), 0);
  const overdueAmount = monthTransactions
    .filter(
      (transaction) =>
        transaction.status === "overdue" ||
        (transaction.status === "pending" &&
          Boolean(transaction.due_date) &&
          transaction.due_date! < todayIsoDate),
    )
    .reduce((total, transaction) => total + moneyValue(transaction.amount), 0);

  const stats: DashboardStats = {
    activePatients: patientsCountResult.count ?? 0,
    todayAppointments: appointmentsCountResult.count ?? 0,
    monthRevenue: access?.role === "physio" ? 0 : paidIncome,
    overdueAmount: access?.role === "physio" ? 0 : overdueAmount,
  };

  return {
    stats,
    chartData: buildFinancialChart(
      dedupeProcedureTransactions(
        (chartTransactionsResult.data ?? []) as TransactionRow[],
      ),
    ),
    birthdays: mapBirthdays((birthdayPatientsResult.data ?? []) as PatientRow[]),
  };
}
