import { supabase } from "../lib/supabase";

export async function getPatientOpenAmount(
  clinicId: string | null | undefined,
  patientId: string,
): Promise<number> {
  if (!clinicId) return 0;

  // Sumariza pacotes (lesson_packages) com saldo aberto
  const { data: packagesData, error: pkgError } = await supabase
    .from("lesson_packages")
    .select("total_amount, amount_paid")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId);

  if (pkgError) throw new Error(pkgError.message);

  const packagesOpen = (packagesData ?? []).reduce((acc: number, item: any) => {
    const total = Number(item.total_amount) || 0;
    const paid = Number(item.amount_paid) || 0;
    return acc + Math.max(total - paid, 0);
  }, 0);

  // Sumariza transações de procedimentos/recebíveis não pagas
  const { data: txData, error: txError } = await supabase
    .from("transactions")
    .select("amount, status, type")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .eq("type", "income");

  if (txError) throw new Error(txError.message);

  const transactionsOpen = (txData ?? []).reduce((acc: number, item: any) => {
    const status = item.status;
    const amount = Number(item.amount) || 0;
    if (status === "paid" || status === "cancelled") return acc;
    return acc + amount;
  }, 0);

  return packagesOpen + transactionsOpen;
}

export async function registerManualReceipt(params: {
  clinicId: string;
  patientId?: string | null;
  amount: number;
  date: string; // YYYY-MM-DD
  description?: string | null;
}): Promise<void> {
  const { clinicId, patientId, amount, date, description } = params;

  const { error } = await supabase.from("transactions").insert({
    clinic_id: clinicId,
    patient_id: patientId ?? null,
    amount,
    type: "income",
    category: "Recebimento manual",
    status: "paid",
    description: description?.trim() || null,
    due_date: date,
  });

  if (error) throw new Error(error.message);
}
