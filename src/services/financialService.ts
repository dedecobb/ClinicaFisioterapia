import { supabase } from "../lib/supabase";

export type OpenReceivable =
  | {
      id: string;
      kind: "package";
      label: string;
      dueDate: string;
      amount: number;
      remaining: number;
      packageId: string;
      installmentNumber: number;
    }
  | {
      id: string;
      kind: "procedure";
      label: string;
      dueDate: string;
      amount: number;
      remaining: number;
      description: string | null;
    };

const money = (value: number | string | null | undefined) => Number(value) || 0;

const paymentStatus = (total: number, paid: number) => {
  if (paid >= total) return "pago";
  return "pendente";
};

export async function getPatientOpenReceivables(
  clinicId: string | null | undefined,
  patientId: string,
): Promise<OpenReceivable[]> {
  if (!clinicId) return [];

  const [installmentsResult, transactionsResult] = await Promise.all([
    supabase
      .from("package_installments")
      .select("id, package_id, installment_number, amount, amount_paid, due_date")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("due_date", { ascending: true }),
    supabase
      .from("transactions")
      .select("id, amount, due_date, description")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .eq("type", "income")
      .not("status", "in", "(paid,cancelled)")
      .order("due_date", { ascending: true }),
  ]);

  if (installmentsResult.error) throw new Error(installmentsResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);

  const installments = (installmentsResult.data ?? [])
    .map((item) => {
      const remaining = Math.max(money(item.amount) - money(item.amount_paid), 0);
      return {
        id: item.id,
        kind: "package" as const,
        label: `Pacote · parcela #${item.installment_number}`,
        dueDate: item.due_date,
        amount: money(item.amount),
        remaining,
        packageId: item.package_id,
        installmentNumber: item.installment_number,
      };
    })
    .filter((item) => item.remaining > 0);

  const procedures = (transactionsResult.data ?? []).map((item) => ({
    id: item.id,
    kind: "procedure" as const,
    label: item.description?.trim() || "Procedimento avulso",
    dueDate: item.due_date,
    amount: money(item.amount),
    remaining: money(item.amount),
    description: item.description,
  }));

  return [...installments, ...procedures].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
}

export async function getPatientOpenAmount(
  clinicId: string | null | undefined,
  patientId: string,
): Promise<number> {
  const receivables = await getPatientOpenReceivables(clinicId, patientId);
  return receivables.reduce((total, item) => total + item.remaining, 0);
}

export async function registerReceiptForOpenReceivable(params: {
  clinicId: string;
  patientId: string;
  receivable: OpenReceivable;
  amount: number;
  date: string;
  paymentMethod: string;
  notes?: string | null;
}): Promise<void> {
  const { clinicId, patientId, receivable, amount, date, paymentMethod, notes } = params;
  if (amount <= 0 || amount > receivable.remaining) {
    throw new Error("O valor informado deve ser maior que zero e não pode ultrapassar o saldo em aberto.");
  }

  if (receivable.kind === "procedure") {
    const description = receivable.description?.trim() || "Recebimento de procedimentos";
    if (amount === receivable.remaining) {
      const { error } = await supabase
        .from("transactions")
        .update({
          status: "paid",
          due_date: date,
          description: `${description} (${paymentMethod})${notes?.trim() ? ` - ${notes.trim()}` : ""}`,
        })
        .eq("id", receivable.id)
        .eq("clinic_id", clinicId);
      if (error) throw new Error(error.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("transactions")
      .update({ amount: receivable.remaining - amount, status: "pending", description: `${description} - saldo restante` })
      .eq("id", receivable.id)
      .eq("clinic_id", clinicId);
    if (updateError) throw new Error(updateError.message);

    const { error: insertError } = await supabase.from("transactions").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      amount,
      type: "income",
      category: "Recebimento de procedimentos",
      status: "paid",
      description: `${description} - recebido (${paymentMethod})${notes?.trim() ? ` - ${notes.trim()}` : ""}`,
      due_date: date,
    });
    if (insertError) throw new Error(insertError.message);
    return;
  }

  const { data: installment, error: installmentReadError } = await supabase
    .from("package_installments")
    .select("amount, amount_paid")
    .eq("id", receivable.id)
    .eq("clinic_id", clinicId)
    .single();
  if (installmentReadError) throw new Error(installmentReadError.message);

  const installmentTotal = money(installment.amount);
  const newInstallmentPaid = money(installment.amount_paid) + amount;
  const nextInstallmentStatus = paymentStatus(installmentTotal, newInstallmentPaid);
  const { error: installmentError } = await supabase
    .from("package_installments")
    .update({
      amount_paid: newInstallmentPaid,
      payment_method: paymentMethod,
      status: nextInstallmentStatus,
      paid_at: nextInstallmentStatus === "pago" ? `${date}T12:00:00` : null,
    })
    .eq("id", receivable.id)
    .eq("clinic_id", clinicId);
  if (installmentError) throw new Error(installmentError.message);

  const { data: packageItem, error: packageReadError } = await supabase
    .from("lesson_packages")
    .select("total_amount, amount_paid, total_lessons")
    .eq("id", receivable.packageId)
    .eq("clinic_id", clinicId)
    .single();
  if (packageReadError) throw new Error(packageReadError.message);

  const newPackagePaid = money(packageItem.amount_paid) + amount;
  const { error: packageError } = await supabase
    .from("lesson_packages")
    .update({
      amount_paid: newPackagePaid,
      payment_method: paymentMethod,
      payment_status: paymentStatus(money(packageItem.total_amount), newPackagePaid),
    })
    .eq("id", receivable.packageId)
    .eq("clinic_id", clinicId);
  if (packageError) throw new Error(packageError.message);

  const { error: transactionError } = await supabase.from("transactions").insert({
    clinic_id: clinicId,
    patient_id: patientId,
    amount,
    type: "income",
    category: "Recebimento de pacote",
    status: "paid",
    description: `Recebimento de pacote · parcela #${receivable.installmentNumber} (${paymentMethod})${notes?.trim() ? ` - ${notes.trim()}` : ""}`,
    due_date: date,
  });
  if (transactionError) throw new Error(transactionError.message);
}

/**
 * Registra um recebível avulso que já foi recebido. O mesmo lançamento fica
 * disponível no Financeiro e no histórico financeiro do paciente.
 */
export async function createAndRegisterStandaloneReceipt(params: {
  clinicId: string;
  patientId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  notes?: string | null;
}): Promise<void> {
  const { clinicId, patientId, amount, date, paymentMethod, notes } = params;

  if (amount <= 0) {
    throw new Error("O valor informado deve ser maior que zero.");
  }

  const description = [
    `Recebível avulso recebido (${paymentMethod})`,
    notes?.trim() || null,
  ]
    .filter(Boolean)
    .join(" - ");

  const { error } = await supabase.from("transactions").insert({
    clinic_id: clinicId,
    patient_id: patientId,
    amount,
    type: "income",
    category: "Recebimento avulso",
    status: "paid",
    description,
    due_date: date,
  });

  if (error) throw new Error(error.message);
}
