import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  DollarSign,
  Filter,
  Loader2,
  MessageCircle,
  Receipt,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";
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
  total_amount: number | string;
  amount_paid: number | string;
  payment_status: PaymentStatus;
  payment_method: string | null;
  installments: number;
  start_date: string;
  expected_end_date: string | null;
  status: "ativo" | "concluido" | "cancelado";
  patients: { full_name: string; phone: string | null } | null;
  package_installments: InstallmentRow[];
};

type CommissionAppointment = {
  id: string;
  status: string;
  class_price: number | string | null;
  profiles: { id: string; full_name: string } | null;
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

type TransactionRow = {
  id: string;
  amount: number | string;
  type: "income" | "expense";
  category: string;
  status: "paid" | "pending" | "overdue" | "cancelled";
  description: string | null;
  due_date: string;
  created_at: string;
  patients: { full_name: string } | null;
};

type ReceivableFilter = "open" | "paid" | "all";
type DueSort = "asc" | "desc";

type ReceivableRow = {
  packageItem: PackageRow;
  installment: InstallmentRow;
  patientName: string;
  remaining: number;
  status: PaymentStatus;
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

function money(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function cents(value: number | string | null | undefined): number {
  return Math.round(money(value) * 100);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function openWhatsApp(phone: string | null | undefined, message: string) {
  const digits = onlyDigits(phone);
  if (!digits) return;
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  window.open(
    `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
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
    getInstallments(packageItem).find((item) => getRemainingInstallment(item) > 0) ??
    null
  );
}

function getRemainingInstallment(installment: InstallmentRow): number {
  return Math.max(cents(installment.amount) - cents(installment.amount_paid), 0) / 100;
}

function getInstallmentPaymentStatus(installment: InstallmentRow): PaymentStatus {
  const status = statusFromPayment(
    money(installment.amount),
    money(installment.amount_paid),
  );

  if (status === "pago") return "pago";
  return installment.status === "inadimplente" ? "inadimplente" : status;
}

function getPackagePaymentStatus(packageItem: PackageRow): PaymentStatus {
  const status = statusFromPayment(
    money(packageItem.total_amount),
    money(packageItem.amount_paid),
  );

  if (status === "pago") return "pago";
  return packageItem.payment_status === "inadimplente" ? "inadimplente" : status;
}

function badgeVariantForPayment(status: PaymentStatus) {
  if (status === "pago") return "success";
  if (status === "inadimplente") return "danger";
  return "warning";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildCommissionReport(
  appointments: CommissionAppointment[],
  ownerId: string | null,
): ProfessionalReport[] {
  const report = new Map<string, ProfessionalReport>();

  appointments
    .filter(
      (appointment) =>
        appointment.status === "presenca_registrada" ||
        appointment.status === "falta",
    )
    .forEach((appointment) => {
      const professionalId = appointment.profiles?.id ?? "sem-profissional";
      if (ownerId && professionalId === ownerId) return;

      const current =
        report.get(professionalId) ??
        ({
          professionalId,
          professionalName:
            appointment.profiles?.full_name ?? "Sem profissional definido",
          heldClasses: 0,
          paidMisses: 0,
          gross: 0,
          professionalShare: 0,
          commissionPaid: 0,
        } satisfies ProfessionalReport);

      const classValue = money(appointment.class_price);
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

export const Financial = () => {
  const { profile } = useAuth();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [appointments, setAppointments] = useState<CommissionAppointment[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{
    packageItem: PackageRow;
    installment: InstallmentRow;
  } | null>(null);
  const [commissionTarget, setCommissionTarget] =
    useState<ProfessionalReport | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [receivableFilter, setReceivableFilter] =
    useState<ReceivableFilter>("open");
  const [dueSort, setDueSort] = useState<DueSort>("asc");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPhysio = profile?.role === "physio";

  const loadFinancialData = async () => {
    if (!profile?.clinic_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const monthStart = startOfMonth(new Date());
    const monthEnd = nextMonth(monthStart);

    let appointmentsQuery = supabase
      .from("appointments")
      .select("id, status, class_price, profiles (id, full_name)")
      .eq("clinic_id", profile.clinic_id)
      .gte("start_time", monthStart.toISOString())
      .lt("start_time", monthEnd.toISOString());

    if (profile.role === "physio") {
      appointmentsQuery = appointmentsQuery.eq("professional_id", profile.id);
    }

    const [clinicResult, packagesResult, appointmentsResult, transactionsResult] =
      await Promise.all([
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
            total_amount,
            amount_paid,
            payment_status,
            payment_method,
            installments,
            start_date,
            expected_end_date,
            status,
            patients (full_name, phone),
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
        appointmentsQuery,
        supabase
          .from("transactions")
          .select(
            "id, amount, type, category, status, description, due_date, created_at, patients (full_name)",
          )
          .eq("clinic_id", profile.clinic_id)
          .order("created_at", { ascending: false }),
      ]);

    const failed = [
      clinicResult,
      packagesResult,
      appointmentsResult,
      transactionsResult,
    ].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setOwnerId((clinicResult.data as { owner_id: string | null }).owner_id);
    setPackages((packagesResult.data ?? []) as unknown as PackageRow[]);
    setAppointments(
      (appointmentsResult.data ?? []) as unknown as CommissionAppointment[],
    );
    setTransactions(
      (transactionsResult.data ?? []) as unknown as TransactionRow[],
    );
    setLoading(false);
  };

  useEffect(() => {
    loadFinancialData();
  }, [profile?.clinic_id]);

  const rawCommissionReport = useMemo(
    () => buildCommissionReport(appointments, ownerId),
    [appointments, ownerId],
  );

  const commissionReport = useMemo(
    () =>
      rawCommissionReport.map((item) => {
        const commissionPaid = transactions
          .filter(
            (transaction) =>
              transaction.type === "expense" &&
              transaction.status === "paid" &&
              transaction.category === "Comissão fisioterapeuta" &&
              (transaction.description?.includes(item.professionalId) ||
                transaction.description?.includes(item.professionalName)),
          )
          .reduce((total, transaction) => total + money(transaction.amount), 0);

        return {
          ...item,
          commissionPaid,
          professionalShare: Math.max(item.professionalShare - commissionPaid, 0),
        };
      }),
    [rawCommissionReport, transactions],
  );

  const totals = useMemo(() => {
    const sold = packages.reduce(
      (total, item) => total + money(item.total_amount),
      0,
    );
    const paid = packages.reduce(
      (total, item) => total + money(item.amount_paid),
      0,
    );
    const open = packages.reduce(
      (total, item) =>
        total + Math.max(money(item.total_amount) - money(item.amount_paid), 0),
      0,
    );
    const currentDue = packages.reduce((total, item) => {
      const installment = getCurrentInstallment(item);
      return total + (installment ? getRemainingInstallment(installment) : 0);
    }, 0);
    const professionalShare = commissionReport.reduce(
      (total, item) => total + item.professionalShare,
      0,
    );

    return { sold, paid, open, currentDue, professionalShare };
  }, [commissionReport, packages]);

  const receivables = useMemo(() => {
    const rows = packages.flatMap((packageItem) =>
      getInstallments(packageItem).map((installment) => ({
        packageItem,
        installment,
        patientName: packageItem.patients?.full_name ?? "Paciente",
        remaining: getRemainingInstallment(installment),
        status: getInstallmentPaymentStatus(installment),
      })),
    );

    return rows
      .filter((row) => {
        if (receivableFilter === "paid") return row.status === "pago";
        if (receivableFilter === "open") return row.remaining > 0;
        return true;
      })
      .sort((a, b) => {
        const direction = dueSort === "asc" ? 1 : -1;
        return a.installment.due_date.localeCompare(b.installment.due_date) * direction;
      });
  }, [dueSort, packages, receivableFilter]);

  const openPaymentModal = (
    packageItem: PackageRow,
    installment: InstallmentRow,
  ) => {
    setPaymentTarget({ packageItem, installment });
    setPaymentAmount(String(getRemainingInstallment(installment) || ""));
    setPaymentMethod(installment.payment_method ?? packageItem.payment_method ?? "Pix");
  };

  const handleRegisterPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentTarget) return;

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setError("Informe um valor de pagamento válido.");
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
      return;
    }

    setSaving(true);
    setError(null);

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
      const installmentStatus = statusFromPayment(installmentTotal, installmentPaid);
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
          .eq("id", installment.id) as unknown as Promise<{ error: Error | null }>,
      );
    }

    const installmentResults = await Promise.all(updates);
    const installmentError = installmentResults.find((result) => result.error)?.error;

    if (installmentError) {
      setError(installmentError.message);
      setSaving(false);
      return;
    }

    const newPackagePaid = money(paymentTarget.packageItem.amount_paid) + amount;
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

    const { error: transactionError } = await supabase.from("transactions").insert({
      clinic_id: profile?.clinic_id,
      patient_id: paymentTarget.packageItem.patient_id,
      amount,
      type: "income",
      category: "Recebimento de pacote",
      status: "paid",
      description: `Recebimento de ${paymentTarget.packageItem.patients?.full_name ?? "paciente"} - pacote ${paymentTarget.packageItem.total_lessons} aulas (${paymentMethod})`,
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

    const { error: transactionError } = await supabase.from("transactions").insert({
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

  const printReceipt = (
    packageItem: PackageRow,
    installment?: InstallmentRow,
  ) => {
    const receiptWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!receiptWindow) return;

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
            <p>Pacote: ${packageItem.total_lessons} aulas</p>
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Financeiro
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {!isPhysio && (
              <>
                <FinancialCard label="Pacotes vendidos" value={totals.sold} icon={TrendingUp} />
                <FinancialCard label="Valor recebido" value={totals.paid} icon={DollarSign} />
                <FinancialCard label="Parcela atual" value={totals.currentDue} icon={AlertTriangle} danger />
                <FinancialCard label="Total em aberto" value={totals.open} icon={AlertTriangle} danger />
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
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Parcelas
                  </h3>
                  <p className="text-sm text-slate-500">
                    Veja o que está em aberto, pago ou tudo junto.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-500">
                    <Filter size={16} />
                    <select
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none"
                      value={receivableFilter}
                      onChange={(event) =>
                        setReceivableFilter(event.target.value as ReceivableFilter)
                      }
                    >
                      <option value="open">Em aberto</option>
                      <option value="paid">Pagas</option>
                      <option value="all">Todas</option>
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    onClick={() => setDueSort((current) => (current === "asc" ? "desc" : "asc"))}
                  >
                    <ArrowUpDown size={16} />
                    Vencimento {dueSort === "asc" ? "mais antigo" : "mais novo"}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
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
                        <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                          Nenhuma parcela encontrada para este filtro.
                        </td>
                      </tr>
                    ) : (
                      receivables.map((row: ReceivableRow) => (
                        <tr key={row.installment.id}>
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {row.patientName}
                            </p>
                            <p className="text-xs text-slate-500">
                              Pacote de {row.packageItem.total_lessons} aulas
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold">
                            #{row.installment.installment_number}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {formatDate(row.installment.due_date)}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {currencyFormatter.format(money(row.installment.amount))}
                          </td>
                          <td className="px-6 py-4 text-sm text-emerald-600 font-semibold">
                            {currencyFormatter.format(money(row.installment.amount_paid))}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold">
                            {currencyFormatter.format(row.remaining)}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={badgeVariantForPayment(row.status)}>
                              {paymentLabel[row.status]}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              {row.remaining > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    openPaymentModal(row.packageItem, row.installment)
                                  }
                                >
                                  Registrar
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => printReceipt(row.packageItem, row.installment)}
                              >
                                <Receipt size={14} />
                              </Button>
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
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Histórico de pacotes e parcelas
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {packages.map((packageItem) => {
                  const installments = getInstallments(packageItem);
                  const currentInstallment = getCurrentInstallment(packageItem);
                  const packageOpen = Math.max(
                    (cents(packageItem.total_amount) -
                      cents(packageItem.amount_paid)) /
                      100,
                    0,
                  );
                  const packagePaymentStatus = getPackagePaymentStatus(packageItem);

                  return (
                    <div key={packageItem.id} className="p-6 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-900 dark:text-white">
                              {packageItem.patients?.full_name ?? "Paciente"}
                            </h4>
                            <Badge variant={packageItem.status === "ativo" ? "success" : "neutral"}>
                              {packageItem.status}
                            </Badge>
                            <Badge
                              variant={
                                packagePaymentStatus === "pago"
                                  ? "success"
                                  : packagePaymentStatus === "inadimplente"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {paymentLabel[packagePaymentStatus]}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">
                            {packageItem.completed_lessons + packageItem.missed_lessons}/
                            {packageItem.total_lessons} aulas consumidas · início em{" "}
                            {formatDate(packageItem.start_date)}
                          </p>
                        </div>
                        <div className="text-sm lg:text-right">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {currencyFormatter.format(money(packageItem.amount_paid))} pago
                          </p>
                          <p className="text-slate-500">
                            {currencyFormatter.format(packageOpen)} em aberto
                          </p>
                        </div>
                      </div>

                      {currentInstallment && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-amber-900">
                              Parcela atual: #{currentInstallment.installment_number}
                            </p>
                            <p className="text-sm text-amber-800">
                              Vence em {formatDate(currentInstallment.due_date)} ·{" "}
                              {currencyFormatter.format(getRemainingInstallment(currentInstallment))}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => openPaymentModal(packageItem, currentInstallment)}
                            >
                              <Check size={14} /> Registrar pagamento
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openWhatsApp(
                                  packageItem.patients?.phone,
                                  `Olá, ${packageItem.patients?.full_name ?? "tudo bem"}! A parcela ${currentInstallment.installment_number} do seu pacote de Pilates vence em ${formatDate(currentInstallment.due_date)} no valor de ${currencyFormatter.format(getRemainingInstallment(currentInstallment))}. Posso te enviar os dados para pagamento?`,
                                )
                              }
                              disabled={!onlyDigits(packageItem.patients?.phone)}
                            >
                              <MessageCircle size={14} />
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-xs font-bold uppercase text-slate-400">
                              <th className="py-2 pr-4">Parcela</th>
                              <th className="py-2 pr-4">Vencimento</th>
                              <th className="py-2 pr-4">Valor</th>
                              <th className="py-2 pr-4">Pago</th>
                              <th className="py-2 pr-4">Status</th>
                              <th className="py-2 pr-4">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {installments.map((installment) => {
                              const installmentStatus =
                                getInstallmentPaymentStatus(installment);
                              const installmentRemaining =
                                getRemainingInstallment(installment);

                              return (
                                <tr
                                  key={installment.id}
                                  className="border-t border-slate-100 dark:border-slate-800"
                                >
                                  <td className="py-3 pr-4 text-sm font-semibold">
                                    #{installment.installment_number}
                                  </td>
                                  <td className="py-3 pr-4 text-sm text-slate-500">
                                    {formatDate(installment.due_date)}
                                  </td>
                                  <td className="py-3 pr-4 text-sm">
                                    {currencyFormatter.format(money(installment.amount))}
                                  </td>
                                  <td className="py-3 pr-4 text-sm text-emerald-600 font-semibold">
                                    {currencyFormatter.format(money(installment.amount_paid))}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <Badge
                                      variant={
                                        installmentStatus === "pago"
                                          ? "success"
                                          : installmentStatus === "inadimplente"
                                            ? "danger"
                                            : "warning"
                                      }
                                    >
                                      {paymentLabel[installmentStatus]}
                                    </Badge>
                                  </td>
                                  <td className="py-3 pr-4">
                                    <div className="flex gap-2">
                                      {installmentRemaining > 0 && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            openPaymentModal(packageItem, installment)
                                          }
                                        >
                                          Registrar
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => printReceipt(packageItem, installment)}
                                      >
                                        <Receipt size={14} />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Comissão por fisioterapeuta
              </h3>
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
                      <td colSpan={isPhysio ? 6 : 7} className="px-6 py-10 text-center text-sm text-slate-500">
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

          {!isPhysio && (
            <Card className="p-0 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Histórico de pagamentos
                </h3>
                <p className="text-sm text-slate-500">
                  Entradas recebidas e comissões pagas ficam registradas aqui.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Categoria</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                          Nenhum pagamento registrado ainda.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {formatDate(transaction.due_date)}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={transaction.type === "income" ? "success" : "warning"}>
                              {transaction.type === "income" ? "Recebido" : "Pago"}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold">
                            {transaction.category}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {transaction.description ?? transaction.patients?.full_name ?? "-"}
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
                            {currencyFormatter.format(money(transaction.amount))}
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
                    {paymentTarget.packageItem.patients?.full_name} · Parcela #
                    {paymentTarget.installment.installment_number}
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
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
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
    <Card className={danger ? "bg-rose-50/50 border-rose-100" : ""}>
      <div className="flex items-center justify-between">
        <div>
          <p className={clsx("text-sm font-medium", danger ? "text-rose-600" : "text-slate-500")}>
            {label}
          </p>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {currencyFormatter.format(value)}
          </h3>
        </div>
        <Icon className={danger ? "text-rose-600" : "text-brand-600"} size={28} />
      </div>
    </Card>
  );
}
