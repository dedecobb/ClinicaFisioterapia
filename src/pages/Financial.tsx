import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowDownCircle,
  Check,
  DollarSign,
  Filter,
  Loader2,
  PlusCircle,
  Receipt,
  Search,
  TrendingUp,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type PaymentStatus = "pago" | "pendente" | "parcial" | "inadimplente";

type InstallmentRow = {
  id: string;
  installment_number: number;
  amount: number | string;
  amount_paid: number | string;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
  status: PaymentStatus;
};

type PackageRow = {
  id: string;
  patient_id: string;
  total_lessons: number;
  completed_lessons: number;
  missed_lessons: number;
  procedure_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  payment_status: PaymentStatus;
  payment_method: string | null;
  installments: number;
  start_date: string;
  expected_end_date: string | null;
  status: "ativo" | "concluido" | "cancelado";
  patients: {
    full_name: string;
    phone: string | null;
    profiles: { full_name: string } | null;
  } | null;
  package_installments: InstallmentRow[];
};

type CommissionAppointment = {
  id: string;
  patient_id: string | null;
  package_id: string | null;
  start_time: string;
  status: string;
  class_price: number | string | null;
  patients: {
    full_name: string;
    profiles?: { id: string; full_name: string } | null;
  } | null;
  profiles: { id: string; full_name: string } | null;
  lesson_packages: {
    total_lessons: number;
    lesson_value: number | string;
    procedure_amount: number | string;
    total_amount: number | string;
  } | null;
};

type ProfessionalReport = {
  professionalId: string;
  professionalName: string;
  heldClasses: number;
  paidMisses: number;
  gross: number;
  professionalShare: number;
  commissionPaid: number;
};

type CommissionDetailRow = {
  professionalId: string;
  professionalName: string;
  patientId: string;
  patientName: string;
  packageId: string;
  packageAmount: number;
  grossClassValue: number;
  commissionClassValue: number;
  contractedLessons: number;
  presenceByDate: Record<string, number>;
  presences: number;
  totalCommission: number;
};

type TransactionRow = {
  id: string;
  patient_id: string | null;
  amount: number | string;
  type: "income" | "expense";
  category: string;
  status: "paid" | "pending" | "overdue" | "cancelled";
  description: string | null;
  due_date: string;
  created_at: string;
  patients: {
    full_name: string;
    profiles: { full_name: string } | null;
  } | null;
};

type TransactionStatus = TransactionRow["status"];

type ReceivableFilter = "open" | "paid" | "all";
type DueSort = "asc" | "desc";
type ExpenseViewFilter = "period" | "payable";
type ExpenseReminderTone = "overdue" | "today" | "soon";

type ExpenseFormState = {
  amount: string;
  category: string;
  description: string;
  dueDate: string;
  status: TransactionStatus;
};

type ReceivableRow = {
  kind: "package";
  packageItem: PackageRow;
  installment: InstallmentRow;
  patientName: string;
  professionalName: string;
  remaining: number;
  status: PaymentStatus;
};

type ProcedureReceivableRow = {
  kind: "procedure";
  transaction: TransactionRow;
  patientName: string;
  professionalName: string;
  remaining: number;
  status: PaymentStatus;
};

type ReceivableItem = ReceivableRow | ProcedureReceivableRow;

type PaymentTarget =
  | {
      kind: "package";
      packageItem: PackageRow;
      installment: InstallmentRow;
    }
  | {
      kind: "procedure";
      transaction: TransactionRow;
    };

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const paymentLabel: Record<PaymentStatus, string> = {
  pago: "Pago",
  pendente: "Pendente",
  parcial: "Parcial",
  inadimplente: "Inadimplente",
};

const transactionStatusLabel: Record<TransactionStatus, string> = {
  paid: "Pago",
  pending: "Pendente",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const expenseCategories = [
  "Aluguel",
  "Comissão fisioterapeuta",
  "Material clínico",
  "Limpeza",
  "Água",
  "Energia elétrica",
  "Internet",
  "Impostos",
  "Marketing",
  "Manutenção",
  "Outros",
];

const expenseReminderDays = 7;
const expensePayableWindowDays = 30;

const initialExpenseForm = (): ExpenseFormState => ({
  amount: "",
  category: "Outros",
  description: "",
  dueDate: todayDate(),
  status: "paid",
});

function money(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function cents(value: number | string | null | undefined): number {
  return Math.round(money(value) * 100);
}

function formatBRLValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  if (Number.isNaN(amount)) return "";
  return currencyFormatter.format(amount);
}

function parseCurrencyDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const integerPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const decimalPart = padded.slice(-2);
  return `${integerPart || "0"}.${decimalPart}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function parseDateInput(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  return (
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
}

function listDateRange(startDate: string, endDate: string): string[] {
  const days = Math.max(Math.min(daysBetweenInclusive(startDate, endDate), 31), 0);
  const start = parseDateInput(startDate);

  return Array.from({ length: days }, (_, index) =>
    toDateInputValue(addDays(start, index)),
  );
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatShortDate(date: string): string {
  return new Date(`${date}T12:00:00`)
    .toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    })
    .replace(".", "");
}

function getDefaultCommissionPeriod(): { startDate: string; endDate: string } {
  const monthStart = startOfMonth(new Date());
  const monthEnd = addDays(nextMonth(monthStart), -1);

  return {
    startDate: toDateInputValue(monthStart),
    endDate: toDateInputValue(monthEnd),
  };
}

function getDefaultExpensePeriod(): { startDate: string; endDate: string } {
  const today = new Date();

  return {
    startDate: toDateInputValue(addDays(today, -29)),
    endDate: toDateInputValue(today),
  };
}

function statusFromPayment(total: number, paid: number): PaymentStatus {
  const totalCents = cents(total);
  const paidCents = cents(paid);

  if (paidCents <= 0) return "pendente";
  if (paidCents >= totalCents) return "pago";
  return "parcial";
}

function getInstallments(packageItem: PackageRow): InstallmentRow[] {
  return [...(packageItem.package_installments ?? [])].sort(
    (a, b) => a.installment_number - b.installment_number,
  );
}

function getCurrentInstallment(packageItem: PackageRow): InstallmentRow | null {
  return (
    getInstallments(packageItem).find(
      (item) => getRemainingInstallment(item) > 0,
    ) ?? null
  );
}

function getRemainingInstallment(installment: InstallmentRow): number {
  return (
    Math.max(cents(installment.amount) - cents(installment.amount_paid), 0) /
    100
  );
}

function getInstallmentPaymentStatus(
  installment: InstallmentRow,
): PaymentStatus {
  const status = statusFromPayment(
    money(installment.amount),
    money(installment.amount_paid),
  );

  if (status === "pago") return "pago";
  return installment.status === "inadimplente" ? "inadimplente" : status;
}

function paymentStatusFromTransaction(
  status: TransactionStatus,
): PaymentStatus {
  if (status === "paid") return "pago";
  if (status === "overdue") return "inadimplente";
  return "pendente";
}

function badgeVariantForPayment(status: PaymentStatus) {
  if (status === "pago") return "success";
  if (status === "inadimplente") return "danger";
  return "warning";
}

function badgeVariantForTransaction(status: TransactionStatus) {
  if (status === "paid") return "success";
  if (status === "overdue") return "danger";
  if (status === "cancelled") return "neutral";
  return "warning";
}

function getEffectiveTransactionStatus(
  transaction: TransactionRow,
): TransactionStatus {
  if (
    transaction.type === "expense" &&
    transaction.status === "pending" &&
    transaction.due_date < todayDate()
  ) {
    return "overdue";
  }

  return transaction.status;
}

function getDaysUntil(date: string): number {
  const today = parseDateInput(todayDate());
  const target = parseDateInput(date);

  return Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function getExpenseReminderTone(transaction: TransactionRow): ExpenseReminderTone {
  const daysUntil = getDaysUntil(transaction.due_date);

  if (daysUntil < 0 || transaction.status === "overdue") return "overdue";
  if (daysUntil === 0) return "today";
  return "soon";
}

function getExpenseReminderLabel(transaction: TransactionRow): string {
  const daysUntil = getDaysUntil(transaction.due_date);

  if (daysUntil < 0) {
    const daysLate = Math.abs(daysUntil);
    return `Vencida há ${daysLate} ${daysLate === 1 ? "dia" : "dias"}`;
  }

  if (daysUntil === 0) return "Vence hoje";
  if (daysUntil === 1) return "Vence amanhã";

  return `Vence em ${daysUntil} dias`;
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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateCommissionReportExcel(
  report: ProfessionalReport[],
  detailRows: CommissionDetailRow[],
  startDate: string,
  endDate: string,
): Blob {
  // Preparar dados para a planilha
  const wsData: unknown[][] = [];

  // Título e período
  wsData.push(["Relatório de Comissão"]);
  wsData.push([`Período: ${startDate} a ${endDate}`]);
  wsData.push([]); // Linha vazia para separação

  // Cabeçalho
  wsData.push([
    "Fisioterapeuta",
    "Aulas Realizadas",
    "Faltas Pagas",
    "Valor Bruto",
    "Já Pagou",
    "A Receber (40%)",
  ]);

  // Dados dos profissionais
  report.forEach((item) => {
    wsData.push([
      item.professionalName,
      item.heldClasses,
      item.paidMisses,
      item.gross,
      item.commissionPaid,
      item.professionalShare,
    ]);
  });

  // Calcular totais
  const total = report.reduce(
    (acc, item) => {
      acc.heldClasses += item.heldClasses;
      acc.paidMisses += item.paidMisses;
      acc.gross += item.gross;
      acc.commissionPaid += item.commissionPaid;
      acc.professionalShare += item.professionalShare;
      return acc;
    },
    {
      heldClasses: 0,
      paidMisses: 0,
      gross: 0,
      commissionPaid: 0,
      professionalShare: 0,
    },
  );

  // Linha vazia e linha de totais
  wsData.push([]);
  wsData.push([
    "TOTAL",
    total.heldClasses,
    total.paidMisses,
    total.gross,
    total.commissionPaid,
    total.professionalShare,
  ]);

  // Criar workbook
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Ajustar largura das colunas
  const colWidths = [25, 18, 15, 15, 15, 20];
  ws["!cols"] = colWidths.map((width) => ({ wch: width }));

  // Formatar células monetárias (colunas D, E, F)
  const lastRow = wsData.length;
  for (let row = 4; row <= lastRow; row++) {
    for (let col = 3; col <= 5; col++) {
      const cellAddress = XLSX.utils.encode_col(col) + row;
      if (ws[cellAddress]) {
        ws[cellAddress].z = '"R$ "#,##0.00';
      }
    }
  }

  // Estilizar cabeçalho (linha 4)
  for (let col = 0; col < 6; col++) {
    const cellAddress = XLSX.utils.encode_col(col) + "4";
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "366092" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
  }

  // Estilizar linha de TOTAL
  for (let col = 0; col < 6; col++) {
    const cellAddress = XLSX.utils.encode_col(col) + lastRow;
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E8E8E8" } },
        alignment: { horizontal: "right" },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comissões");

  const dateColumns = listDateRange(startDate, endDate);
  const detailWsData: unknown[][] = [];

  detailWsData.push(["Relatório Detalhado de Comissão"]);
  detailWsData.push([`Período: ${startDate} a ${endDate}`]);
  detailWsData.push([]);

  const detailHeader = [
    "Paciente",
    "Valor pacote",
    "Valor bruto aula",
    "Comissão por aula (40%)",
    "Aulas contratadas",
    ...dateColumns.map(formatShortDate),
    "Presenças",
    "Valor total aulas",
  ];

  const rowsByProfessional = detailRows.reduce((acc, row) => {
    const rows = acc.get(row.professionalId) ?? [];
    rows.push(row);
    acc.set(row.professionalId, rows);
    return acc;
  }, new Map<string, CommissionDetailRow[]>());

  [...rowsByProfessional.values()]
    .sort((a, b) => a[0].professionalName.localeCompare(b[0].professionalName))
    .forEach((professionalRows) => {
      const professionalName = professionalRows[0].professionalName;
      detailWsData.push([professionalName]);
      detailWsData.push(detailHeader);

      professionalRows
        .sort((a, b) => a.patientName.localeCompare(b.patientName))
        .forEach((row) => {
          detailWsData.push([
            row.patientName,
            row.packageAmount,
            row.grossClassValue,
            row.commissionClassValue,
            row.contractedLessons,
            ...dateColumns.map((date) =>
              row.presenceByDate[date] ? "PRESENÇA" : "",
            ),
            row.presences,
            row.totalCommission,
          ]);
        });

      detailWsData.push([
        `TOTAL ${professionalName}`,
        "",
        "",
        "",
        "",
        ...dateColumns.map(() => ""),
        professionalRows.reduce((total, row) => total + row.presences, 0),
        professionalRows.reduce(
          (total, row) => total + row.totalCommission,
          0,
        ),
      ]);
      detailWsData.push([]);
    });

  detailWsData.push([
    "TOTAL GERAL",
    "",
    "",
    "",
    "",
    ...dateColumns.map(() => ""),
    detailRows.reduce((total, row) => total + row.presences, 0),
    detailRows.reduce((total, row) => total + row.totalCommission, 0),
  ]);

  const detailWs = XLSX.utils.aoa_to_sheet(detailWsData);
  detailWs["!cols"] = [
    { wch: 30 },
    { wch: 14 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    ...dateColumns.map(() => ({ wch: 8 })),
    { wch: 12 },
    { wch: 18 },
  ];

  const moneyColumns = [1, 2, 3, detailHeader.length - 1];
  for (let row = 1; row <= detailWsData.length; row++) {
    moneyColumns.forEach((col) => {
      const cellAddress = XLSX.utils.encode_col(col) + row;
      if (detailWs[cellAddress]) {
        detailWs[cellAddress].z = '"R$ "#,##0.00';
      }
    });
  }

  XLSX.utils.book_append_sheet(wb, detailWs, "Detalhado");

  // Gerar arquivo em buffer
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function cleanProcedurePaymentDescription(value: string): string {
  return value.replace(/\s+-\s+saldo em aberto$/i, "");
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesPatientSearch(
  patientName: string | null | undefined,
  searchTerm: string,
): boolean {
  const normalizedSearch = normalizeSearchText(searchTerm);
  if (!normalizedSearch) return true;

  return normalizeSearchText(patientName).includes(normalizedSearch);
}

function getPatientProfessionalName(
  patient: { profiles: { full_name: string } | null } | null,
): string {
  return patient?.profiles?.full_name ?? "Sem fisioterapeuta";
}

function getAppointmentResponsibleProfessional(
  appointment: CommissionAppointment,
): { id: string; full_name: string } {
  const responsible = appointment.patients?.profiles;
  if (responsible?.id || responsible?.full_name) {
    return {
      id: responsible.id ?? "sem-profissional",
      full_name: responsible.full_name ?? "Sem profissional definido",
    };
  }

  return {
    id: appointment.profiles?.id ?? "sem-profissional",
    full_name: appointment.profiles?.full_name ??
      "Sem profissional definido",
  };
}

function getCommissionClassValue(appointment: CommissionAppointment): number {
  const packageItem = appointment.lesson_packages;

  if (!packageItem) return money(appointment.class_price);

  const totalLessons = Number(packageItem.total_lessons) || 0;
  const lessonsAmount = Math.max(
    money(packageItem.total_amount) - money(packageItem.procedure_amount),
    0,
  );

  if (totalLessons > 0 && lessonsAmount > 0) {
    return lessonsAmount / totalLessons;
  }

  return money(packageItem.lesson_value) || money(appointment.class_price);
}

function buildCommissionReport(
  appointments: CommissionAppointment[],
  ownerId: string | null,
  startDate?: string,
  endDate?: string,
): ProfessionalReport[] {
  const report = new Map<string, ProfessionalReport>();

  let filtered = appointments.filter(
    (appointment) =>
      appointment.status === "presenca_registrada" ||
      appointment.status === "falta",
  );

  // Filter by date range if provided
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter((appointment) => {
      const appointmentDate = new Date(appointment.start_time);
      return appointmentDate >= start;
    });
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((appointment) => {
      const appointmentDate = new Date(appointment.start_time);
      return appointmentDate <= end;
    });
  }

  filtered.forEach((appointment) => {
    const responsibleProfessional =
      getAppointmentResponsibleProfessional(appointment);
    const professionalId = responsibleProfessional.id;
    if (ownerId && professionalId === ownerId) return;

    const current =
      report.get(professionalId) ??
      ({
        professionalId,
        professionalName: responsibleProfessional.full_name,
        heldClasses: 0,
        paidMisses: 0,
        gross: 0,
        professionalShare: 0,
        commissionPaid: 0,
      } satisfies ProfessionalReport);

    const classValue = getCommissionClassValue(appointment);
    current.gross += classValue;
    current.professionalShare += classValue * 0.4;
    if (appointment.status === "falta") current.paidMisses += 1;
    if (appointment.status === "presenca_registrada") current.heldClasses += 1;
    report.set(professionalId, current);
  });

  return [...report.values()].sort((a, b) =>
    a.professionalName.localeCompare(b.professionalName),
  );
}

function buildCommissionDetailReport(
  appointments: CommissionAppointment[],
  ownerId: string | null,
  startDate: string,
  endDate: string,
): CommissionDetailRow[] {
  const dateColumns = new Set(listDateRange(startDate, endDate));
  const rows = new Map<string, CommissionDetailRow>();
  const start = parseDateInput(startDate);
  start.setHours(0, 0, 0, 0);
  const end = parseDateInput(endDate);
  end.setHours(23, 59, 59, 999);

  appointments
    .filter(
      (appointment) =>
        appointment.status === "presenca_registrada" ||
        appointment.status === "falta",
    )
    .filter((appointment) => {
      const appointmentDate = new Date(appointment.start_time);
      return appointmentDate >= start && appointmentDate <= end;
    })
    .forEach((appointment) => {
      const responsibleProfessional =
        getAppointmentResponsibleProfessional(appointment);
      const professionalId = responsibleProfessional.id;
      if (ownerId && professionalId === ownerId) return;

      const appointmentDate = toDateInputValue(new Date(appointment.start_time));
      if (!dateColumns.has(appointmentDate)) return;

      const grossClassValue = getCommissionClassValue(appointment);
      const commissionClassValue = grossClassValue * 0.4;
      const patientId = appointment.patient_id ?? "sem-paciente";
      const packageId = appointment.package_id ?? "sem-pacote";
      const rowKey = [
        professionalId,
        patientId,
        packageId,
        commissionClassValue.toFixed(2),
      ].join(":");

      const current =
        rows.get(rowKey) ??
        ({
          professionalId,
          professionalName: responsibleProfessional.full_name,
          patientId,
          patientName: appointment.patients?.full_name ?? "Paciente não informado",
          packageId,
          packageAmount: money(appointment.lesson_packages?.total_amount),
          grossClassValue,
          commissionClassValue,
          contractedLessons: appointment.lesson_packages?.total_lessons ?? 0,
          presenceByDate: {},
          presences: 0,
          totalCommission: 0,
        } satisfies CommissionDetailRow);

      current.presenceByDate[appointmentDate] =
        (current.presenceByDate[appointmentDate] ?? 0) + 1;
      current.presences += 1;
      current.totalCommission += commissionClassValue;
      rows.set(rowKey, current);
    });

  return [...rows.values()];
}

export const Financial = () => {
  const { profile } = useAuth();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [appointments, setAppointments] = useState<CommissionAppointment[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(
    null,
  );
  const [commissionTarget, setCommissionTarget] =
    useState<ProfessionalReport | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [receivableFilter, setReceivableFilter] =
    useState<ReceivableFilter>("open");
  const [dueSort, setDueSort] = useState<DueSort>("asc");
  const [expenseViewFilter, setExpenseViewFilter] =
    useState<ExpenseViewFilter>("period");
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [expenseStartDate, setExpenseStartDate] = useState(
    () => getDefaultExpensePeriod().startDate,
  );
  const [expenseEndDate, setExpenseEndDate] = useState(
    () => getDefaultExpensePeriod().endDate,
  );
  const [historyStartDate, setHistoryStartDate] = useState(
    () => getDefaultExpensePeriod().startDate,
  );
  const [historyEndDate, setHistoryEndDate] = useState(
    () => getDefaultExpensePeriod().endDate,
  );
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(() =>
    initialExpenseForm(),
  );
  const commissionSectionRef = useRef<HTMLDivElement | null>(null);
  const expenseSectionRef = useRef<HTMLDivElement | null>(null);
  const isPhysio = profile?.role === "physio";
  const hasPatientSearch = Boolean(normalizeSearchText(patientSearchTerm));

  const scrollToExpense = () => {
    expenseSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const scrollToCommission = () => {
    commissionSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const resetExpensePeriod = () => {
    const defaultPeriod = getDefaultExpensePeriod();
    setExpenseStartDate(defaultPeriod.startDate);
    setExpenseEndDate(defaultPeriod.endDate);
    setExpenseViewFilter("period");
  };

  const resetHistoryPeriod = () => {
    const defaultPeriod = getDefaultExpensePeriod();
    setHistoryStartDate(defaultPeriod.startDate);
    setHistoryEndDate(defaultPeriod.endDate);
  };

  const getSelectedCommissionPeriod = () => {
    const defaultPeriod = getDefaultCommissionPeriod();
    return {
      startDate: reportStartDate || defaultPeriod.startDate,
      endDate: reportEndDate || defaultPeriod.endDate,
    };
  };

  const commissionPeriodLabel = useMemo(() => {
    const defaultPeriod = getDefaultCommissionPeriod();
    const startDate = reportStartDate || defaultPeriod.startDate;
    const endDate = reportEndDate || defaultPeriod.endDate;

    if (!reportStartDate && !reportEndDate) {
      return `Mostrando o mes atual inteiro (${formatDate(startDate)} ate ${formatDate(endDate)}).`;
    }

    return `Mostrando de ${formatDate(startDate)} ate ${formatDate(endDate)}.`;
  }, [reportEndDate, reportStartDate]);

  const loadCommissionAppointments = async () => {
    if (!profile?.clinic_id) return null;

    const { startDate, endDate } = getSelectedCommissionPeriod();
    const start = parseDateInput(startDate);
    start.setHours(0, 0, 0, 0);
    const endExclusive = addDays(parseDateInput(endDate), 1);
    endExclusive.setHours(0, 0, 0, 0);

    let appointmentsQuery = supabase
      .from("appointments")
      .select(
        `
          id,
          patient_id,
          package_id,
          start_time,
          status,
          class_price,
          patients (
            full_name,
            profiles!patients_responsible_professional_id_fkey (id, full_name)
          ),
          profiles (id, full_name),
          lesson_packages (
            total_lessons,
            lesson_value,
            procedure_amount,
            total_amount
          )
        `,
      )
      .eq("clinic_id", profile.clinic_id)
      .gte("start_time", start.toISOString())
      .lt("start_time", endExclusive.toISOString());

    const appointmentsResult = await appointmentsQuery;

    if (appointmentsResult.error) {
      setError(appointmentsResult.error.message);
      return appointmentsResult;
    }

    const fetchedAppointments =
      (appointmentsResult.data ?? []) as unknown as CommissionAppointment[];

    const appointmentsToSet =
      profile.role === "physio"
        ? fetchedAppointments.filter(
            (appointment) =>
              getAppointmentResponsibleProfessional(appointment).id ===
              profile.id,
          )
        : fetchedAppointments;

    setAppointments(appointmentsToSet);
    return appointmentsResult;
  };

  const downloadCommissionReportExcel = () => {
    if (!commissionReport.length) {
      alert("Nenhum relatório para exportar");
      return;
    }

    const { startDate, endDate } = getSelectedCommissionPeriod();

    if (daysBetweenInclusive(startDate, endDate) > 31) {
      alert("O relatório detalhado em Excel aceita no máximo 31 dias.");
      return;
    }

    const blob = generateCommissionReportExcel(
      commissionReport,
      commissionDetailReport,
      startDate,
      endDate,
    );

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `relatorio_comissoes_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadFinancialData = async () => {
    if (!profile?.clinic_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [
      clinicResult,
      packagesResult,
      appointmentsResult,
      transactionsResult,
    ] = await Promise.all([
      supabase
        .from("clinics")
        .select("owner_id")
        .eq("id", profile.clinic_id)
        .single(),
      supabase
        .from("lesson_packages")
        .select(
          `
            id,
            patient_id,
            total_lessons,
            completed_lessons,
            missed_lessons,
            procedure_amount,
            total_amount,
            amount_paid,
            payment_status,
            payment_method,
            installments,
            start_date,
            expected_end_date,
            status,
            patients (
              full_name,
              phone,
              profiles!patients_responsible_professional_id_fkey (full_name)
            ),
            package_installments (
              id,
              installment_number,
              amount,
              amount_paid,
              due_date,
              paid_at,
              payment_method,
              status
            )
          `,
        )
        .eq("clinic_id", profile.clinic_id)
        .order("created_at", { ascending: false }),
      loadCommissionAppointments(),
      supabase
        .from("transactions")
        .select(
          `
            id,
            patient_id,
            amount,
            type,
            category,
            status,
            description,
            due_date,
            created_at,
            patients (
              full_name,
              profiles!patients_responsible_professional_id_fkey (full_name)
            )
          `,
        )
        .eq("clinic_id", profile.clinic_id)
        .order("created_at", { ascending: false }),
    ]);

    const failed = [
      clinicResult,
      packagesResult,
      appointmentsResult,
      transactionsResult,
    ].find((result) => result?.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setOwnerId((clinicResult.data as { owner_id: string | null }).owner_id);
    setPackages((packagesResult.data ?? []) as unknown as PackageRow[]);
    setAppointments(
      (appointmentsResult?.data ?? []) as unknown as CommissionAppointment[],
    );
    setTransactions(
      (transactionsResult.data ?? []) as unknown as TransactionRow[],
    );
    setLoading(false);
  };

  useEffect(() => {
    loadFinancialData();
  }, [profile?.clinic_id]);

  useEffect(() => {
    if (loading) return;
    loadCommissionAppointments();
  }, [profile?.clinic_id, reportStartDate, reportEndDate]);

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) =>
        matchesPatientSearch(appointment.patients?.full_name, patientSearchTerm),
      ),
    [appointments, patientSearchTerm],
  );

  const filteredPackages = useMemo(
    () =>
      packages.filter((packageItem) =>
        matchesPatientSearch(packageItem.patients?.full_name, patientSearchTerm),
      ),
    [packages, patientSearchTerm],
  );

  const visibleTransactions = useMemo(
    () => dedupeProcedureTransactions(transactions),
    [transactions],
  );

  const filteredVisibleTransactions = useMemo(
    () =>
      visibleTransactions.filter((transaction) =>
        matchesPatientSearch(transaction.patients?.full_name, patientSearchTerm),
      ),
    [patientSearchTerm, visibleTransactions],
  );

  const filteredHistoryTransactions = useMemo(
    () =>
      filteredVisibleTransactions.filter((transaction) => {
        if (historyStartDate && transaction.due_date < historyStartDate) {
          return false;
        }

        if (historyEndDate && transaction.due_date > historyEndDate) {
          return false;
        }

        return true;
      }),
    [filteredVisibleTransactions, historyEndDate, historyStartDate],
  );

  const expenseTransactions = useMemo(
    () =>
      visibleTransactions
        .filter((transaction) => transaction.type === "expense")
        .sort((a, b) => {
          const aStatus = getEffectiveTransactionStatus(a);
          const bStatus = getEffectiveTransactionStatus(b);
          const aOpen = aStatus !== "paid" && aStatus !== "cancelled";
          const bOpen = bStatus !== "paid" && bStatus !== "cancelled";

          if (aOpen !== bOpen) return aOpen ? -1 : 1;
          return aOpen
            ? a.due_date.localeCompare(b.due_date)
            : b.due_date.localeCompare(a.due_date);
        }),
    [visibleTransactions],
  );

  const expenseReminders = useMemo(
    () =>
      expenseTransactions
        .filter((transaction) => {
          const effectiveStatus = getEffectiveTransactionStatus(transaction);
          const daysUntil = getDaysUntil(transaction.due_date);

          return (
            effectiveStatus !== "paid" &&
            effectiveStatus !== "cancelled" &&
            daysUntil <= expenseReminderDays
          );
        })
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [expenseTransactions],
  );

  const filteredExpenseTransactions = useMemo(
    () =>
      expenseTransactions.filter((transaction) => {
        if (expenseViewFilter === "payable") {
          const effectiveStatus = getEffectiveTransactionStatus(transaction);
          const daysUntil = getDaysUntil(transaction.due_date);

          return (
            effectiveStatus !== "paid" &&
            effectiveStatus !== "cancelled" &&
            daysUntil <= expensePayableWindowDays
          );
        }

        if (expenseStartDate && transaction.due_date < expenseStartDate) {
          return false;
        }

        if (expenseEndDate && transaction.due_date > expenseEndDate) {
          return false;
        }

        return true;
      }),
    [expenseEndDate, expenseStartDate, expenseTransactions, expenseViewFilter],
  );

  const expensePeriodTotals = useMemo(() => {
    const paidExpenses = filteredExpenseTransactions
      .filter((transaction) => transaction.status === "paid")
      .reduce((total, item) => total + money(item.amount), 0);
    const openExpenses = filteredExpenseTransactions
      .filter((transaction) => {
        const effectiveStatus = getEffectiveTransactionStatus(transaction);

        return effectiveStatus === "pending" || effectiveStatus === "overdue";
      })
      .reduce((total, item) => total + money(item.amount), 0);

    return { paidExpenses, openExpenses };
  }, [filteredExpenseTransactions]);

  const rawCommissionReport = useMemo(
    () =>
      buildCommissionReport(
        filteredAppointments,
        ownerId,
        reportStartDate,
        reportEndDate,
      ),
    [filteredAppointments, ownerId, reportStartDate, reportEndDate],
  );

  const commissionReport = useMemo(
    () =>
      rawCommissionReport.map((item) => {
        const commissionPaid = hasPatientSearch
          ? 0
          : transactions
              .filter(
                (transaction) =>
                  transaction.type === "expense" &&
                  transaction.status === "paid" &&
                  transaction.category === "Comissão fisioterapeuta" &&
                  (transaction.description?.includes(item.professionalId) ||
                    transaction.description?.includes(item.professionalName)),
              )
              .reduce(
                (total, transaction) => total + money(transaction.amount),
                0,
              );

        return {
          ...item,
          commissionPaid,
          professionalShare: Math.max(
            item.professionalShare - commissionPaid,
            0,
          ),
        };
      }),
    [hasPatientSearch, rawCommissionReport, transactions],
  );

  const commissionDetailReport = useMemo(() => {
    const defaultPeriod = getDefaultCommissionPeriod();
    return buildCommissionDetailReport(
      filteredAppointments,
      ownerId,
      reportStartDate || defaultPeriod.startDate,
      reportEndDate || defaultPeriod.endDate,
    );
  }, [filteredAppointments, ownerId, reportStartDate, reportEndDate]);

  const totals = useMemo(() => {
    const standaloneProcedures = filteredVisibleTransactions.filter(
      isStandaloneProcedureIncome,
    );
    const procedureSold = standaloneProcedures.reduce(
      (total, item) => total + money(item.amount),
      0,
    );
    const procedurePaid = standaloneProcedures
      .filter((item) => item.status === "paid")
      .reduce((total, item) => total + money(item.amount), 0);
    const procedureOpen = standaloneProcedures
      .filter((item) => item.status === "pending" || item.status === "overdue")
      .reduce((total, item) => total + money(item.amount), 0);
    const sold = filteredPackages.reduce(
      (total, item) => total + money(item.total_amount),
      procedureSold,
    );
    const paid = filteredPackages.reduce(
      (total, item) => total + money(item.amount_paid),
      procedurePaid,
    );
    const open = filteredPackages.reduce(
      (total, item) =>
        total + Math.max(money(item.total_amount) - money(item.amount_paid), 0),
      procedureOpen,
    );
    const currentDue = filteredPackages.reduce((total, item) => {
      const installment = getCurrentInstallment(item);
      return total + (installment ? getRemainingInstallment(installment) : 0);
    }, procedureOpen);
    const professionalShare = commissionReport.reduce(
      (total, item) => total + item.professionalShare,
      0,
    );
    const paidExpenses = transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" && transaction.status === "paid",
      )
      .reduce((total, item) => total + money(item.amount), 0);
    const openExpenses = transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          (getEffectiveTransactionStatus(transaction) === "pending" ||
            getEffectiveTransactionStatus(transaction) === "overdue"),
      )
      .reduce((total, item) => total + money(item.amount), 0);
    const net = paid - paidExpenses;

    return {
      sold,
      paid,
      open,
      currentDue,
      professionalShare,
      paidExpenses,
      openExpenses,
      net,
    };
  }, [
    commissionReport,
    filteredPackages,
    filteredVisibleTransactions,
    transactions,
  ]);

  const receivables = useMemo(() => {
    const packageRows: ReceivableItem[] = filteredPackages.flatMap((packageItem) =>
      getInstallments(packageItem).map((installment) => ({
        kind: "package" as const,
        packageItem,
        installment,
        patientName: packageItem.patients?.full_name ?? "Paciente",
        professionalName: getPatientProfessionalName(packageItem.patients),
        remaining: getRemainingInstallment(installment),
        status: getInstallmentPaymentStatus(installment),
      })),
    );
    const procedureRows: ReceivableItem[] = filteredVisibleTransactions
      .filter(isStandaloneProcedureIncome)
      .map((transaction) => ({
        kind: "procedure" as const,
        transaction,
        patientName: transaction.patients?.full_name ?? "Paciente",
        professionalName: getPatientProfessionalName(transaction.patients),
        remaining:
          transaction.status === "paid" || transaction.status === "cancelled"
            ? 0
            : money(transaction.amount),
        status: paymentStatusFromTransaction(transaction.status),
      }));
    const rows = [...packageRows, ...procedureRows];

    return rows
      .filter((row) => {
        if (receivableFilter === "paid") return row.status === "pago";
        if (receivableFilter === "open") return row.remaining > 0;
        return true;
      })
      .sort((a, b) => {
        const direction = dueSort === "asc" ? 1 : -1;
        const aDate =
          a.kind === "package"
            ? a.installment.due_date
            : a.transaction.due_date;
        const bDate =
          b.kind === "package"
            ? b.installment.due_date
            : b.transaction.due_date;
        return aDate.localeCompare(bDate) * direction;
      });
  }, [dueSort, filteredPackages, filteredVisibleTransactions, receivableFilter]);

  const openPaymentModal = (
    packageItem: PackageRow,
    installment: InstallmentRow,
  ) => {
    setPaymentTarget({ kind: "package", packageItem, installment });
    setPaymentAmount(String(getRemainingInstallment(installment) || ""));
    setPaymentMethod(
      installment.payment_method ?? packageItem.payment_method ?? "Pix",
    );
  };

  const openProcedurePaymentModal = (transaction: TransactionRow) => {
    setPaymentTarget({ kind: "procedure", transaction });
    setPaymentAmount(String(money(transaction.amount) || ""));
    setPaymentMethod("Pix");
  };

  const handleRegisterPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentTarget) return;

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setError("Informe um valor de pagamento válido.");
      return;
    }

    setSaving(true);
    setError(null);

    if (paymentTarget.kind === "procedure") {
      const openAmount = money(paymentTarget.transaction.amount);

      if (amount > openAmount) {
        setError(
          `O valor informado é maior que o saldo do procedimento (${currencyFormatter.format(openAmount)}).`,
        );
        setSaving(false);
        return;
      }

      const paymentDate = todayDate();
      const remainingAmount = Math.max(openAmount - amount, 0);
      const baseDescription =
        paymentTarget.transaction.description ?? "Recebimento de procedimentos";
      const paidDescription = cleanProcedurePaymentDescription(baseDescription);

      if (remainingAmount <= 0) {
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            status: "paid",
            due_date: paymentDate,
            description: `${paidDescription} (${paymentMethod})`,
          })
          .eq("id", paymentTarget.transaction.id);

        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }
      } else {
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            amount: remainingAmount,
            status: "pending",
            description: `${baseDescription} - saldo restante`,
          })
          .eq("id", paymentTarget.transaction.id);

        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }

        const { error: insertError } = await supabase
          .from("transactions")
          .insert({
            clinic_id: profile?.clinic_id,
            patient_id: paymentTarget.transaction.patient_id,
            amount,
            type: "income",
            category: "Recebimento de procedimentos",
            status: "paid",
            description: `${paidDescription} - recebido (${paymentMethod})`,
            due_date: paymentDate,
          });

        if (insertError) {
          setError(insertError.message);
          setSaving(false);
          return;
        }
      }

      setPaymentTarget(null);
      setSaving(false);
      await loadFinancialData();
      return;
    }

    const packageOpen = Math.max(
      money(paymentTarget.packageItem.total_amount) -
        money(paymentTarget.packageItem.amount_paid),
      0,
    );

    if (amount > packageOpen) {
      setError(
        `O valor informado é maior que o saldo do pacote (${currencyFormatter.format(packageOpen)}).`,
      );
      setSaving(false);
      return;
    }

    const installments = getInstallments(paymentTarget.packageItem);
    const selectedIndex = installments.findIndex(
      (item) => item.id === paymentTarget.installment.id,
    );
    const orderedInstallments = [
      ...installments.slice(Math.max(selectedIndex, 0)),
      ...installments.slice(0, Math.max(selectedIndex, 0)),
    ].filter((item) => getRemainingInstallment(item) > 0);

    let remainingAmount = amount;
    const paymentDate = new Date().toISOString();
    const updates: Promise<{ error: Error | null }>[] = [];

    for (const installment of orderedInstallments) {
      if (remainingAmount <= 0) break;

      const installmentTotal = money(installment.amount);
      const currentPaid = money(installment.amount_paid);
      const appliedAmount = Math.min(
        remainingAmount,
        Math.max(installmentTotal - currentPaid, 0),
      );

      if (appliedAmount <= 0) continue;

      const installmentPaid = currentPaid + appliedAmount;
      const installmentStatus = statusFromPayment(
        installmentTotal,
        installmentPaid,
      );
      remainingAmount -= appliedAmount;

      updates.push(
        supabase
          .from("package_installments")
          .update({
            amount_paid: installmentPaid,
            payment_method: paymentMethod,
            status: installmentStatus,
            paid_at: installmentStatus === "pago" ? paymentDate : null,
          })
          .eq("id", installment.id) as unknown as Promise<{
          error: Error | null;
        }>,
      );
    }

    const installmentResults = await Promise.all(updates);
    const installmentError = installmentResults.find(
      (result) => result.error,
    )?.error;

    if (installmentError) {
      setError(installmentError.message);
      setSaving(false);
      return;
    }

    const newPackagePaid =
      money(paymentTarget.packageItem.amount_paid) + amount;
    const packageStatus = statusFromPayment(
      money(paymentTarget.packageItem.total_amount),
      newPackagePaid,
    );

    const { error: packageError } = await supabase
      .from("lesson_packages")
      .update({
        amount_paid: newPackagePaid,
        payment_method: paymentMethod,
        payment_status: packageStatus,
      })
      .eq("id", paymentTarget.packageItem.id);

    if (packageError) {
      setError(packageError.message);
      setSaving(false);
      return;
    }

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        clinic_id: profile?.clinic_id,
        patient_id: paymentTarget.packageItem.patient_id,
        amount,
        type: "income",
        category: "Recebimento de pacote",
        status: "paid",
        description: `Recebimento de ${paymentTarget.packageItem.patients?.full_name ?? "paciente"} - pacote ${paymentTarget.packageItem.total_lessons} aulas e procedimentos (${paymentMethod})`,
        due_date: todayDate(),
      });

    if (transactionError) {
      setError(transactionError.message);
      setSaving(false);
      return;
    }

    setPaymentTarget(null);
    setSaving(false);
    await loadFinancialData();
  };

  const handleRegisterCommissionPayment = async () => {
    if (!commissionTarget || !profile?.clinic_id) return;

    setSaving(true);
    setError(null);

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        clinic_id: profile.clinic_id,
        amount: commissionTarget.professionalShare,
        type: "expense",
        category: "Comissão fisioterapeuta",
        status: "paid",
        description: `Pagamento de comissão para ${commissionTarget.professionalName} (${commissionTarget.professionalId})`,
        due_date: todayDate(),
      });

    if (transactionError) {
      setError(transactionError.message);
      setSaving(false);
      return;
    }

    setCommissionTarget(null);
    setSaving(false);
    await loadFinancialData();
  };

  const handleRegisterExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile?.clinic_id) return;

    const amount = Number(expenseForm.amount);
    if (!amount || amount <= 0) {
      setError("Informe um valor de despesa válido.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        clinic_id: profile.clinic_id,
        amount,
        type: "expense",
        category: expenseForm.category,
        status: expenseForm.status,
        description: expenseForm.description.trim() || null,
        due_date: expenseForm.dueDate || todayDate(),
      });

    if (transactionError) {
      setError(transactionError.message);
      setSaving(false);
      return;
    }

    setExpenseForm(initialExpenseForm());
    setSaving(false);
    await loadFinancialData();
  };

  const handleMarkExpensePaid = async (transaction: TransactionRow) => {
    if (transaction.type !== "expense") return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        status: "paid",
        due_date: todayDate(),
      })
      .eq("id", transaction.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    await loadFinancialData();
  };

  const handleDeleteExpense = async (transaction: TransactionRow) => {
    if (transaction.type !== "expense" || !profile?.clinic_id) return;

    const confirmed = window.confirm(
      `Excluir a despesa "${transaction.category}" no valor de ${currencyFormatter.format(money(transaction.amount))}?`,
    );

    if (!confirmed) return;

    setSaving(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id)
      .eq("clinic_id", profile.clinic_id)
      .eq("type", "expense");

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    await loadFinancialData();
  };

  const printReceipt = (
    packageItem: PackageRow,
    installment?: InstallmentRow,
  ) => {
    const receiptWindow = window.open("", "_blank");
    if (!receiptWindow) return;
    receiptWindow.opener = null;

    receiptWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Recibo</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; max-width: 620px; }
            h1 { margin: 0 0 8px; }
            p { margin: 8px 0; }
            .value { font-size: 24px; font-weight: 700; margin: 16px 0; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Recibo de pagamento</h1>
            <p>Paciente: <strong>${packageItem.patients?.full_name ?? "-"}</strong></p>
            <p>Pacote: ${packageItem.total_lessons} aulas${money(packageItem.procedure_amount) > 0 ? ` + ${currencyFormatter.format(money(packageItem.procedure_amount))} em procedimentos` : ""}</p>
            <p>Parcela: ${installment?.installment_number ?? "-"}</p>
            <p>Forma de pagamento: ${installment?.payment_method ?? packageItem.payment_method ?? "-"}</p>
            <p class="value">${currencyFormatter.format(money(installment?.amount_paid ?? packageItem.amount_paid))}</p>
            <p>Emitido em ${new Date().toLocaleDateString("pt-BR")}</p>
          </div>
        </body>
      </html>
    `);
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  };

  return (
    <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          Financeiro
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">
          {isPhysio
            ? "Acompanhe sua produção financeira pelas aulas realizadas e faltas pagas."
            : "Registre parcelas, acompanhe histórico de pacotes e cobre pelo WhatsApp."}
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p>Carregando financeiro...</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Buscar paciente..."
                className="min-h-11 w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm"
                value={patientSearchTerm}
                onChange={(event) => setPatientSearchTerm(event.target.value)}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {hasPatientSearch && (
                <Button
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={() => setPatientSearchTerm("")}
                >
                  Limpar busca
                </Button>
              )}
              {!isPhysio && (
                <Button className="w-full gap-2 sm:w-auto" onClick={scrollToExpense}>
                  <PlusCircle size={16} />
                  Lançar despesa
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={scrollToCommission}
              >
                <UserCheck size={16} />
                Ir para comissões
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-2 xl:grid-cols-6 gap-3 sm:gap-6">
            {!isPhysio && (
              <>
                <FinancialCard
                  label="Receita vendida"
                  value={totals.sold}
                  icon={TrendingUp}
                />
                <FinancialCard
                  label="Valor recebido"
                  value={totals.paid}
                  icon={DollarSign}
                />
                <FinancialCard
                  label="Total em aberto"
                  value={totals.open}
                  icon={AlertTriangle}
                  danger
                />
                <FinancialCard
                  label="Despesas pagas"
                  value={totals.paidExpenses}
                  icon={ArrowDownCircle}
                  danger
                />
                <FinancialCard
                  label="Resultado líquido"
                  value={totals.net}
                  icon={DollarSign}
                  danger={totals.net < 0}
                />
              </>
            )}
            <FinancialCard
              label={isPhysio ? "Minha produção" : "Comissão a pagar"}
              value={totals.professionalShare}
              icon={UserCheck}
            />
          </div>

          {!isPhysio && (
            <Card className="p-0 overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Recebíveis
                  </h3>
                  <p className="text-sm text-slate-500">
                    Veja parcelas e procedimentos em aberto, pagos ou tudo
                    junto.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-500">
                    <Filter size={16} />
                    <select
                      className="min-h-11 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none"
                      value={receivableFilter}
                      onChange={(event) =>
                        setReceivableFilter(
                          event.target.value as ReceivableFilter,
                        )
                      }
                    >
                      <option value="open">Em aberto</option>
                      <option value="paid">Pagas</option>
                      <option value="all">Todas</option>
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDueSort((current) =>
                        current === "asc" ? "desc" : "asc",
                      )
                    }
                  >
                    <ArrowUpDown size={16} />
                    Vencimento {dueSort === "asc" ? "mais antigo" : "mais novo"}
                  </Button>
                </div>
              </div>

              <div className="mobile-card-table overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-4">Paciente</th>
                      <th className="px-6 py-4">Parcela</th>
                      <th className="px-6 py-4">Vencimento</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Recebido</th>
                      <th className="px-6 py-4">Saldo</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {receivables.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-10 text-center text-sm text-slate-500"
                        >
                          Nenhum recebível encontrado para este filtro.
                        </td>
                      </tr>
                    ) : (
                      receivables.map((row: ReceivableItem) => (
                        <tr
                          key={
                            row.kind === "package"
                              ? row.installment.id
                              : row.transaction.id
                          }
                        >
                          <td className="px-6 py-4" data-label="Paciente">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {row.patientName}
                            </p>
                            <p className="text-xs text-slate-500">
                              Fisio: {row.professionalName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {row.kind === "package"
                                ? `Pacote de ${row.packageItem.total_lessons} aulas`
                                : "Procedimentos avulsos"}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold" data-label="Parcela">
                            {row.kind === "package"
                              ? `#${row.installment.installment_number}`
                              : "Procedimento"}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500" data-label="Vencimento">
                            {formatDate(
                              row.kind === "package"
                                ? row.installment.due_date
                                : row.transaction.due_date,
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm" data-label="Valor">
                            {currencyFormatter.format(
                              row.kind === "package"
                                ? money(row.installment.amount)
                                : money(row.transaction.amount),
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-emerald-600 font-semibold" data-label="Recebido">
                            {currencyFormatter.format(
                              row.kind === "package"
                                ? money(row.installment.amount_paid)
                                : row.transaction.status === "paid"
                                  ? money(row.transaction.amount)
                                  : 0,
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold" data-label="Saldo">
                            {currencyFormatter.format(row.remaining)}
                          </td>
                          <td className="px-6 py-4" data-label="Status">
                            <Badge variant={badgeVariantForPayment(row.status)}>
                              {paymentLabel[row.status]}
                            </Badge>
                          </td>
                          <td className="px-6 py-4" data-label="Ações">
                            <div className="flex gap-2">
                              {row.remaining > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    row.kind === "package"
                                      ? openPaymentModal(
                                          row.packageItem,
                                          row.installment,
                                        )
                                      : openProcedurePaymentModal(
                                          row.transaction,
                                        )
                                  }
                                >
                                  Registrar
                                </Button>
                              )}
                              {row.kind === "package" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    printReceipt(
                                      row.packageItem,
                                      row.installment,
                                    )
                                  }
                                >
                                  <Receipt size={14} />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!isPhysio && (
            <Card className="p-0 overflow-hidden">
              <div
                ref={expenseSectionRef}
                className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Despesas da clínica
                  </h3>
                  <p className="text-sm text-slate-500">
                    Registre contas pagas ou vencimentos pendentes para acompanhar o que sai.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Pagas no período</p>
                    <p className="font-bold text-rose-600">
                      {currencyFormatter.format(expensePeriodTotals.paidExpenses)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Em aberto no período</p>
                    <p className="font-bold text-amber-600">
                      {currencyFormatter.format(expensePeriodTotals.openExpenses)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Histórico financeiro
                    </h4>
                    <p className="text-xs text-slate-500">
                      Por padrão, mostrando despesas dos últimos 30 dias.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      De
                      <input
                        type="date"
                        value={expenseStartDate}
                        onChange={(event) => {
                          setExpenseStartDate(event.target.value);
                          setExpenseViewFilter("period");
                        }}
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Até
                      <input
                        type="date"
                        value={expenseEndDate}
                        onChange={(event) => {
                          setExpenseEndDate(event.target.value);
                          setExpenseViewFilter("period");
                        }}
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900"
                      />
                    </label>
                    <div className="flex flex-col gap-2 self-end sm:flex-row">
                      <Button
                        type="button"
                        variant={expenseViewFilter === "payable" ? "secondary" : "outline"}
                        className="gap-2"
                        onClick={() => setExpenseViewFilter("payable")}
                      >
                        <AlertTriangle size={16} />
                        A pagar
                      </Button>
                      <Button
                        type="button"
                        variant={expenseViewFilter === "period" ? "secondary" : "outline"}
                        onClick={resetExpensePeriod}
                      >
                        Últimos 30 dias
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {expenseReminders.length > 0 && (
                <div className="border-b border-amber-100 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
                    <AlertTriangle size={16} />
                    Despesas para pagar nos próximos {expenseReminderDays} dias
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {expenseReminders.slice(0, 6).map((transaction) => {
                      const tone = getExpenseReminderTone(transaction);

                      return (
                        <div
                          key={transaction.id}
                          className={clsx(
                            "rounded-lg border bg-white p-3 text-sm dark:bg-slate-950",
                            tone === "overdue"
                              ? "border-rose-200 text-rose-800 dark:border-rose-900/50 dark:text-rose-300"
                              : "border-amber-200 text-amber-900 dark:border-amber-900/50 dark:text-amber-300",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {transaction.category}
                              </p>
                              <p className="text-xs opacity-80">
                                {getExpenseReminderLabel(transaction)} -{" "}
                                {formatDate(transaction.due_date)}
                              </p>
                            </div>
                            <p className="shrink-0 font-bold">
                              {currencyFormatter.format(money(transaction.amount))}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-0">
                <form
                  onSubmit={handleRegisterExpense}
                  className="p-6 border-b xl:border-b-0 xl:border-r border-slate-100 dark:border-slate-800 space-y-4"
                >
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Valor
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={formatBRLValue(expenseForm.amount)}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          amount: parseCurrencyDigits(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Categoria
                    </label>
                    <select
                      className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={expenseForm.category}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    >
                      {expenseCategories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Data de pagamento ou vencimento
                      </label>
                      <input
                        type="date"
                        required
                        className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={expenseForm.dueDate}
                        onChange={(event) =>
                          setExpenseForm((current) => ({
                            ...current,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Status
                      </label>
                      <select
                        className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={expenseForm.status}
                        onChange={(event) =>
                          setExpenseForm((current) => ({
                            ...current,
                            status: event.target.value as TransactionStatus,
                          }))
                        }
                      >
                        <option value="paid">Pago</option>
                        <option value="pending">Pendente</option>
                        <option value="overdue">Vencido</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Descrição
                    </label>
                    <textarea
                      rows={3}
                      className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                      value={expenseForm.description}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full gap-2" isLoading={saving}>
                    <PlusCircle size={16} />
                    Lançar despesa
                  </Button>
                </form>

                <div className="mobile-card-table max-h-[520px] overflow-auto overscroll-contain xl:max-h-[640px]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 dark:bg-slate-900">Data</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 dark:bg-slate-900">Categoria</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 dark:bg-slate-900">Status</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 dark:bg-slate-900">Descrição</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 dark:bg-slate-900">Valor</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 dark:bg-slate-900">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredExpenseTransactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-10 text-center text-sm text-slate-500"
                          >
                            {expenseViewFilter === "payable"
                              ? "Nenhuma despesa em aberto para pagar nos próximos dias."
                              : "Nenhuma despesa encontrada neste período."}
                          </td>
                        </tr>
                      ) : (
                        filteredExpenseTransactions.map((transaction) => {
                          const effectiveStatus =
                            getEffectiveTransactionStatus(transaction);

                          return (
                            <tr key={transaction.id}>
                              <td className="px-6 py-4 text-sm text-slate-500" data-label="Data">
                                {formatDate(transaction.due_date)}
                              </td>
                              <td className="px-6 py-4 text-sm font-semibold" data-label="Categoria">
                                {transaction.category}
                              </td>
                              <td className="px-6 py-4" data-label="Status">
                                <Badge
                                  variant={badgeVariantForTransaction(
                                    effectiveStatus,
                                  )}
                                >
                                  {transactionStatusLabel[effectiveStatus]}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-500" data-label="Descrição">
                                {transaction.description ?? "-"}
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-rose-600" data-label="Valor">
                                -{currencyFormatter.format(money(transaction.amount))}
                              </td>
                              <td className="px-6 py-4" data-label="Ações">
                                <div className="flex flex-wrap gap-2">
                                  {effectiveStatus !== "paid" &&
                                    effectiveStatus !== "cancelled" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          handleMarkExpensePaid(transaction)
                                        }
                                        disabled={saving}
                                      >
                                        <Check size={14} />
                                        Marcar pago
                                      </Button>
                                    )}
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() =>
                                      handleDeleteExpense(transaction)
                                    }
                                    disabled={saving}
                                  >
                                    <Trash2 size={14} />
                                    Excluir
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          <div ref={commissionSectionRef} className="scroll-mt-6">
            <Card className="p-0 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Comissão por fisioterapeuta
                  </h3>
                  <p className="text-sm text-slate-500">
                    {commissionPeriodLabel}
                  </p>
                  {hasPatientSearch && (
                    <p className="text-sm text-slate-500">
                      Produção filtrada pelo paciente "{patientSearchTerm}".
                    </p>
                  )}
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Data Inicial
                    </label>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Data Final
                    </label>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={downloadCommissionReportExcel}
                      className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Exportar EXCEL
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Fisioterapeuta</th>
                    <th className="px-6 py-4">Aulas</th>
                    <th className="px-6 py-4">Faltas pagas</th>
                    <th className="px-6 py-4">Bruto</th>
                    <th className="px-6 py-4">Já pago</th>
                    <th className="px-6 py-4">A pagar</th>
                    {!isPhysio && <th className="px-6 py-4">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commissionReport.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isPhysio ? 6 : 7}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        Nenhuma presença ou falta registrada neste mês.
                      </td>
                    </tr>
                  ) : (
                    commissionReport.map((item) => (
                      <tr key={item.professionalId}>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.professionalName}
                          </p>
                          <Badge variant="neutral">Produção</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {item.heldClasses}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {item.paidMisses}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold">
                          {currencyFormatter.format(item.gross)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {currencyFormatter.format(item.commissionPaid)}
                        </td>
                        <td
                          className={clsx(
                            "px-6 py-4 text-sm font-bold",
                            item.professionalShare > 0
                              ? "text-emerald-600"
                              : "text-slate-500",
                          )}
                        >
                          {currencyFormatter.format(item.professionalShare)}
                        </td>
                        {!isPhysio && (
                          <td className="px-6 py-4">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={item.professionalShare <= 0}
                              onClick={() => setCommissionTarget(item)}
                            >
                              <Check size={14} />
                              Registrar pagamento
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          </div>
          {!isPhysio && (
            <Card className="p-0 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Histórico financeiro
                    </h3>
                    <p className="text-sm text-slate-500">
                      Entradas, pendências e comissões pagas ficam registradas aqui.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      De
                      <input
                        type="date"
                        value={historyStartDate}
                        onChange={(event) =>
                          setHistoryStartDate(event.target.value)
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Até
                      <input
                        type="date"
                        value={historyEndDate}
                        onChange={(event) =>
                          setHistoryEndDate(event.target.value)
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="self-end"
                      onClick={resetHistoryPeriod}
                    >
                      Últimos 30 dias
                    </Button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Categoria</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredHistoryTransactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-10 text-center text-sm text-slate-500"
                        >
                          Nenhum lançamento encontrado neste período.
                        </td>
                      </tr>
                    ) : (
                      filteredHistoryTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {formatDate(transaction.due_date)}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={
                                transaction.type === "income"
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {transaction.type === "income"
                                ? "Entrada"
                                : "Saída"}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold">
                            {transaction.category}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={badgeVariantForTransaction(
                                transaction.status,
                              )}
                            >
                              {transactionStatusLabel[transaction.status]}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {transaction.description ??
                              transaction.patients?.full_name ??
                              "-"}
                          </td>
                          <td
                            className={clsx(
                              "px-6 py-4 text-sm font-bold",
                              transaction.type === "income"
                                ? "text-emerald-600"
                                : "text-rose-600",
                            )}
                          >
                            {transaction.type === "income" ? "+" : "-"}
                            {currencyFormatter.format(
                              money(transaction.amount),
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {paymentTarget &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Registrar pagamento
                  </h2>
                  <p className="text-sm text-slate-500">
                    {paymentTarget.kind === "package"
                      ? `${paymentTarget.packageItem.patients?.full_name ?? "Paciente"} · Parcela #${paymentTarget.installment.installment_number}`
                      : `${paymentTarget.transaction.patients?.full_name ?? "Paciente"} · Procedimentos`}
                  </p>
                </div>
                <button
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"
                  onClick={() => setPaymentTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleRegisterPayment} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Valor recebido
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={formatBRLValue(paymentAmount)}
                    onChange={(event) =>
                      setPaymentAmount(parseCurrencyDigits(event.target.value))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Forma de pagamento
                  </label>
                  <select
                    className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option>Pix</option>
                    <option>Cartão de crédito</option>
                    <option>Cartão de débito</option>
                    <option>Dinheiro</option>
                    <option>Transferência</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPaymentTarget(null)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={saving}>
                    Salvar
                  </Button>
                </div>
              </form>
            </Card>
          </div>,
          document.body,
        )}

      {commissionTarget &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Registrar comissão
                  </h2>
                  <p className="text-sm text-slate-500">
                    {commissionTarget.professionalName}
                  </p>
                </div>
                <button
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"
                  onClick={() => setCommissionTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 mb-4">
                <p className="text-sm text-slate-500">Valor da comissão</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {currencyFormatter.format(commissionTarget.professionalShare)}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCommissionTarget(null)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  isLoading={saving}
                  onClick={handleRegisterCommissionPayment}
                >
                  Confirmar
                </Button>
              </div>
            </Card>
          </div>,
          document.body,
        )}
    </div>
  );
};

function FinancialCard({
  label,
  value,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value: number;
  icon: typeof TrendingUp;
  danger?: boolean;
}) {
  return (
    <Card className={clsx("relative", danger ? "bg-rose-50/50 border-rose-100" : "")}>
      <div>
        <div className="min-w-0">
          <p
            className={clsx(
              "text-sm font-medium",
              danger ? "text-rose-600" : "text-slate-500",
            )}
          >
            {label}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-tight text-slate-900 dark:text-white min-[390px]:text-xl sm:text-2xl">
            {currencyFormatter.format(value)}
          </h3>
        </div>
        <Icon
          className={clsx(
            "absolute right-6 top-6 hidden sm:block",
            danger ? "text-rose-600" : "text-brand-600",
          )}
          size={24}
        />
      </div>
    </Card>
  );
}
