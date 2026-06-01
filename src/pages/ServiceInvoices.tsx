import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileCheck2,
  FileText,
  Filter,
  Loader2,
  Mail,
  PlugZap,
  Printer,
  ReceiptText,
  Send,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  NfeioBorrowerAddress,
  NfeioBorrowerType,
  isNfeioConfigured,
  downloadServiceInvoicePdf,
  issueServiceInvoice,
  sendServiceInvoiceEmail,
} from "../services/nfeioService";

type InvoiceStatus =
  | "draft"
  | "ready"
  | "processing"
  | "issued"
  | "error"
  | "cancelled";

type PatientSummary = {
  id: string;
  full_name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  address: unknown | null;
};

type InvoiceRequestedPayload = {
  issueDate?: string;
  serviceDescription?: string;
  serviceCode?: string | null;
  taxRate?: number;
  borrower?: {
    type?: NfeioBorrowerType;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: NfeioBorrowerAddress | null;
  };
};

type TransactionOption = {
  id: string;
  patient_id: string | null;
  amount: number | string;
  description: string | null;
  due_date: string;
  created_at: string;
  patients: PatientSummary | null;
};

type ServiceInvoice = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  transaction_id: string | null;
  amount: number | string;
  service_description: string;
  service_code: string | null;
  tax_rate: number | string | null;
  status: InvoiceStatus;
  provider: string;
  provider_invoice_id: string | null;
  verification_url: string | null;
  requested_payload: InvoiceRequestedPayload | null;
  error_message: string | null;
  issued_at: string | null;
  created_at: string;
  patients: PatientSummary | null;
};

const statusLabel: Record<InvoiceStatus, string> = {
  draft: "Rascunho",
  ready: "Pronta",
  processing: "Processando",
  issued: "Emitida",
  error: "Erro",
  cancelled: "Cancelada",
};

const statusVariant: Record<InvoiceStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  draft: "neutral",
  ready: "warning",
  processing: "info",
  issued: "success",
  error: "danger",
  cancelled: "neutral",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function onlyDigits(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || null;
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function uppercaseState(value: string): string {
  return value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
}

function borrowerTypeFromDocument(document: string): NfeioBorrowerType {
  return digits(document).length > 11 ? "LegalEntity" : "NaturalPerson";
}

function addressField(value: unknown, aliases: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const alias of aliases) {
    const field = record[alias];
    if (typeof field === "string" || typeof field === "number") {
      return String(field);
    }
  }
  return "";
}

function parsePatientAddress(value: unknown): Partial<NfeioBorrowerAddress> {
  if (!value) return {};

  if (typeof value === "string") {
    return { street: value };
  }

  if (typeof value !== "object") return {};

  const cityValue = (value as Record<string, unknown>).city;
  const city =
    cityValue && typeof cityValue === "object"
      ? {
          code: addressField(cityValue, ["code", "ibgeCode", "cityCode"]),
          name: addressField(cityValue, ["name", "city"]),
        }
      : {
          code: addressField(value, ["cityCode", "city_code", "ibgeCode"]),
          name: addressField(value, ["cityName", "city_name", "city", "cidade"]),
        };

  return {
    country: addressField(value, ["country", "pais"]) || "BRA",
    postalCode: addressField(value, ["postalCode", "postal_code", "zip", "cep"]),
    street: addressField(value, ["street", "logradouro", "rua", "address"]),
    number: addressField(value, ["number", "numero"]),
    additionalInformation: addressField(value, [
      "additionalInformation",
      "complement",
      "complemento",
    ]),
    district: addressField(value, ["district", "neighborhood", "bairro"]),
    city,
    state: addressField(value, ["state", "uf"]),
  };
}

function incompleteBorrowerMessage(
  serviceCode: string | null,
  borrower: InvoiceRequestedPayload["borrower"] | undefined,
): string | null {
  if (!serviceCode?.trim()) return "Informe o código municipal do serviço.";
  if (!borrower?.document || !onlyDigits(borrower.document)) {
    return "Informe o CPF/CNPJ do tomador.";
  }

  const address = borrower.address;
  const missingAddress =
    !address?.postalCode?.trim() ||
    !address.street?.trim() ||
    !address.number?.trim() ||
    !address.district?.trim() ||
    !address.city?.code?.trim() ||
    !address.city?.name?.trim() ||
    !address.state?.trim();

  if (missingAddress) return "Complete o endereço fiscal do tomador.";
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const ServiceInvoices = () => {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<TransactionOption[]>([]);
  const [invoices, setInvoices] = useState<ServiceInvoice[]>([]);
  const [transactionId, setTransactionId] = useState("");
  const [serviceDescription, setServiceDescription] = useState(
    "Serviços de fisioterapia",
  );
  const [serviceCode, setServiceCode] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [amount, setAmount] = useState(0);
  const [issueDate, setIssueDate] = useState(today());
  const [borrowerDocument, setBorrowerDocument] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [borrowerPostalCode, setBorrowerPostalCode] = useState("");
  const [borrowerStreet, setBorrowerStreet] = useState("");
  const [borrowerNumber, setBorrowerNumber] = useState("");
  const [borrowerDistrict, setBorrowerDistrict] = useState("");
  const [borrowerCityCode, setBorrowerCityCode] = useState("");
  const [borrowerCityName, setBorrowerCityName] = useState("");
  const [borrowerState, setBorrowerState] = useState("");
  const [borrowerComplement, setBorrowerComplement] = useState("");
  const [issuedFrom, setIssuedFrom] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionInvoiceId, setActionInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nfeioConfigured = isNfeioConfigured();

  const selectedTransaction = transactions.find(
    (transaction) => transaction.id === transactionId,
  );

  const invoiceByTransaction = useMemo(() => {
    const map = new Map<string, ServiceInvoice>();
    invoices.forEach((invoice) => {
      if (invoice.transaction_id) map.set(invoice.transaction_id, invoice);
    });
    return map;
  }, [invoices]);

  const hasIssuedDateFilter = Boolean(issuedFrom || issuedTo);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (!hasIssuedDateFilter) return true;
        if (invoice.status !== "issued" || !invoice.issued_at) return false;

        const issuedDate = invoice.issued_at.slice(0, 10);
        if (issuedFrom && issuedDate < issuedFrom) return false;
        if (issuedTo && issuedDate > issuedTo) return false;
        return true;
      }),
    [hasIssuedDateFilter, invoices, issuedFrom, issuedTo],
  );

  const totals = useMemo(() => {
    const prepared = filteredInvoices.filter((invoice) =>
      ["draft", "ready", "processing"].includes(invoice.status),
    ).length;
    const issued = filteredInvoices.filter((invoice) => invoice.status === "issued");
    const issuedAmount = issued.reduce(
      (total, invoice) => total + money(invoice.amount),
      0,
    );

    return {
      prepared,
      issued: issued.length,
      issuedAmount,
    };
  }, [filteredInvoices]);

  const buildBorrowerPayload = (): NonNullable<
    InvoiceRequestedPayload["borrower"]
  > => ({
    type: borrowerTypeFromDocument(borrowerDocument),
    document: onlyDigits(borrowerDocument),
    email: borrowerEmail.trim() || null,
    phone: onlyDigits(borrowerPhone),
    address: {
      country: "BRA",
      postalCode: digits(borrowerPostalCode),
      street: borrowerStreet.trim(),
      number: borrowerNumber.trim(),
      additionalInformation: borrowerComplement.trim() || null,
      district: borrowerDistrict.trim(),
      city: {
        code: digits(borrowerCityCode),
        name: borrowerCityName.trim(),
      },
      state: uppercaseState(borrowerState),
    },
  });

  const applyBorrowerFields = useCallback((
    borrower: InvoiceRequestedPayload["borrower"] | undefined,
    patient: PatientSummary | null | undefined,
  ) => {
    const address = borrower?.address ?? parsePatientAddress(patient?.address);

    setBorrowerDocument(borrower?.document ?? patient?.cpf ?? "");
    setBorrowerEmail(borrower?.email ?? patient?.email ?? "");
    setBorrowerPhone(borrower?.phone ?? patient?.phone ?? "");
    setBorrowerPostalCode(address?.postalCode ?? "");
    setBorrowerStreet(address?.street ?? "");
    setBorrowerNumber(address?.number ?? "");
    setBorrowerDistrict(address?.district ?? "");
    setBorrowerCityCode(address?.city?.code ?? "");
    setBorrowerCityName(address?.city?.name ?? "");
    setBorrowerState(address?.state ?? "");
    setBorrowerComplement(address?.additionalInformation ?? "");
  }, []);

  const loadData = async () => {
    if (!profile?.clinic_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [transactionsResult, invoicesResult] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          `
          id,
          patient_id,
          amount,
          description,
          due_date,
          created_at,
          patients (id, full_name, cpf, email, phone, address)
        `,
        )
        .eq("clinic_id", profile.clinic_id)
        .eq("type", "income")
        .eq("status", "paid")
        .order("created_at", { ascending: false }),
      supabase
        .from("service_invoices")
        .select(
          `
          id,
          clinic_id,
          patient_id,
          transaction_id,
          amount,
          service_description,
          service_code,
          tax_rate,
          status,
          provider,
          provider_invoice_id,
          verification_url,
          requested_payload,
          error_message,
          issued_at,
          created_at,
          patients (id, full_name, cpf, email, phone, address)
        `,
        )
        .eq("clinic_id", profile.clinic_id)
        .order("created_at", { ascending: false }),
    ]);

    const failed = [transactionsResult, invoicesResult].find(
      (result) => result.error,
    );

    if (failed?.error) {
      setError(
        failed.error.message.includes("service_invoices")
          ? "Tabela de notas fiscais não encontrada. Aplique a migration de NFS-e antes de usar esta tela."
          : failed.error.message,
      );
      setLoading(false);
      return;
    }

    const loadedTransactions =
      (transactionsResult.data ?? []) as unknown as TransactionOption[];

    setTransactions(loadedTransactions);
    setInvoices((invoicesResult.data ?? []) as unknown as ServiceInvoice[]);

    if (!transactionId && loadedTransactions[0]) {
      const first = loadedTransactions[0];
      setTransactionId(first.id);
      setAmount(money(first.amount));
      setServiceDescription(first.description ?? "Serviços de fisioterapia");
      applyBorrowerFields(undefined, first.patients);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [profile?.clinic_id]);

  useEffect(() => {
    if (!selectedTransaction) return;

    const existing = invoiceByTransaction.get(selectedTransaction.id);
    const requestedPayload = existing?.requested_payload;

    setAmount(money(existing?.amount ?? selectedTransaction.amount));
    setServiceDescription(
      existing?.service_description ??
        selectedTransaction.description ??
        "Serviços de fisioterapia",
    );
    setServiceCode(existing?.service_code ?? "");
    setTaxRate(money(existing?.tax_rate ?? 0));
    setIssueDate(requestedPayload?.issueDate ?? today());
    applyBorrowerFields(requestedPayload?.borrower, selectedTransaction.patients);
  }, [selectedTransaction, invoiceByTransaction, applyBorrowerFields]);

  const saveInvoice = async (status: InvoiceStatus) => {
    if (!profile?.clinic_id || !selectedTransaction) {
      setError("Selecione um recebimento para preparar a nota fiscal.");
      return null;
    }

    setSaving(true);
    setError(null);

    const existing = invoiceByTransaction.get(selectedTransaction.id);
    const payload = {
      clinic_id: profile.clinic_id,
      patient_id: selectedTransaction.patient_id,
      transaction_id: selectedTransaction.id,
      amount,
      service_description: serviceDescription.trim(),
      service_code: serviceCode.trim() || null,
      tax_rate: taxRate || 0,
      status,
      provider: "nfeio",
      requested_payload: {
        issueDate,
        transaction: selectedTransaction,
        serviceDescription: serviceDescription.trim(),
        serviceCode: serviceCode.trim() || null,
        taxRate,
        borrower: buildBorrowerPayload(),
      },
    };

    const query = existing
      ? supabase.from("service_invoices").update(payload).eq("id", existing.id)
      : supabase.from("service_invoices").insert(payload);

    const { data, error: saveError } = await query
      .select(
        `
        id,
        clinic_id,
        patient_id,
        transaction_id,
        amount,
        service_description,
        service_code,
        tax_rate,
        status,
        provider,
        provider_invoice_id,
        verification_url,
        requested_payload,
        error_message,
        issued_at,
        created_at,
        patients (id, full_name, cpf, email, phone, address)
      `,
      )
      .single();

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return null;
    }

    await loadData();
    setSaving(false);
    return data as unknown as ServiceInvoice;
  };

  const handleSaveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveInvoice("draft");
  };

  const handlePrepare = async () => {
    await saveInvoice("ready");
  };

  const handleIssue = async (invoice: ServiceInvoice) => {
    if (!nfeioConfigured) {
      setError(
        "Conector NFe.io não configurado. A nota permanece pronta para emissão.",
      );
      return;
    }

    const borrower = invoice.requested_payload?.borrower;
    const missingData = incompleteBorrowerMessage(
      invoice.service_code,
      borrower,
    );

    if (missingData) {
      if (invoice.transaction_id) setTransactionId(invoice.transaction_id);
      setError(`${missingData} Salve a nota novamente antes de emitir.`);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const { error: processingError } = await supabase
      .from("service_invoices")
      .update({ status: "processing", error_message: null })
      .eq("id", invoice.id);

    if (processingError) {
      setError(processingError.message);
      setSaving(false);
      return;
    }

    let issueMessage: string | null = null;

    try {
      const result = await issueServiceInvoice({
        invoiceId: invoice.id,
        amount: money(invoice.amount),
        serviceDescription: invoice.service_description,
        serviceCode: invoice.service_code ?? "",
        taxRate: money(invoice.tax_rate),
        issueDate: invoice.requested_payload?.issueDate,
        customer: {
          type:
            borrower?.type ??
            borrowerTypeFromDocument(borrower?.document ?? invoice.patients?.cpf ?? ""),
          name: invoice.patients?.full_name ?? "Cliente",
          document: onlyDigits(borrower?.document ?? invoice.patients?.cpf),
          email: borrower?.email ?? invoice.patients?.email ?? null,
          phone: onlyDigits(borrower?.phone ?? invoice.patients?.phone),
          address: borrower?.address ?? null,
        },
      });

      const { error: issueError } = await supabase
        .from("service_invoices")
        .update({
          status: "issued",
          provider_invoice_id: result.providerInvoiceId,
          verification_url: result.verificationUrl,
          provider_response: result.rawResponse,
          issued_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (issueError) throw issueError;
    } catch (err) {
      issueMessage =
        err instanceof Error ? err.message : "Erro ao emitir nota fiscal.";
      await supabase
        .from("service_invoices")
        .update({ status: "error", error_message: issueMessage })
        .eq("id", invoice.id);
    } finally {
      setSaving(false);
      await loadData();
      if (issueMessage) setError(issueMessage);
    }
  };

  const openPdf = (
    payload: {
      pdfBase64?: string;
      pdfContentType?: string;
      pdfUrl?: string;
    },
  ) => {
    if (payload.pdfUrl) {
      window.open(payload.pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!payload.pdfBase64) {
      throw new Error("PDF da NFS-e não foi retornado pela NFe.io.");
    }

    const binary = window.atob(payload.pdfBase64.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], {
      type: payload.pdfContentType || "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error("O navegador bloqueou a abertura do PDF.");
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleOpenPdf = async (invoice: ServiceInvoice) => {
    if (!nfeioConfigured || !invoice.provider_invoice_id) {
      setError("A NFS-e emitida ainda não possui ID do provedor para baixar PDF.");
      return;
    }

    setActionInvoiceId(invoice.id);
    setError(null);
    setNotice(null);

    try {
      const result = await downloadServiceInvoicePdf(invoice.provider_invoice_id);
      openPdf(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir PDF da NFS-e.");
    } finally {
      setActionInvoiceId(null);
    }
  };

  const handleSendEmail = async (invoice: ServiceInvoice) => {
    if (!nfeioConfigured || !invoice.provider_invoice_id) {
      setError("A NFS-e emitida ainda não possui ID do provedor para enviar e-mail.");
      return;
    }

    setActionInvoiceId(invoice.id);
    setError(null);
    setNotice(null);

    try {
      await sendServiceInvoiceEmail(invoice.provider_invoice_id);
      setNotice(
        `NFS-e enviada para ${invoice.requested_payload?.borrower?.email ?? invoice.patients?.email ?? "o e-mail do tomador"}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao enviar NFS-e por e-mail.",
      );
    } finally {
      setActionInvoiceId(null);
    }
  };

  const printPreview = (invoice: ServiceInvoice) => {
    const preview = window.open("", "_blank");
    if (!preview) return;
    preview.opener = null;

    preview.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Prévia NFS-e</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; max-width: 720px; }
            h1 { margin: 0 0 8px; }
            .muted { color: #64748b; font-size: 13px; }
            .row { display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding: 10px 0; gap: 24px; }
            .value { font-size: 24px; font-weight: 700; margin: 18px 0; }
            .warning { margin-top: 24px; padding: 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; color: #9a3412; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Prévia de NFS-e</h1>
            <p class="muted">Este documento não substitui a nota fiscal emitida pela prefeitura.</p>
            <p class="value">${currencyFormatter.format(money(invoice.amount))}</p>
            <div class="row"><strong>Tomador</strong><span>${escapeHtml(invoice.patients?.full_name ?? "-")}</span></div>
            <div class="row"><strong>CPF</strong><span>${escapeHtml(invoice.patients?.cpf ?? "-")}</span></div>
            <div class="row"><strong>Serviço</strong><span>${escapeHtml(invoice.service_description)}</span></div>
            <div class="row"><strong>Código do serviço</strong><span>${escapeHtml(invoice.service_code ?? "-")}</span></div>
            <div class="row"><strong>Status</strong><span>${escapeHtml(statusLabel[invoice.status])}</span></div>
            <div class="warning">Prévia operacional gerada pelo sistema. A emissão fiscal real será feita pela integração NFe.io quando configurada.</div>
          </div>
          <script>window.addEventListener("load", () => window.print());</script>
        </body>
      </html>
    `);
    preview.document.close();
    preview.focus();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Notas Fiscais
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Prepare NFS-e de serviços e deixe o fluxo pronto para a integração
            com NFe.io.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
            <PlugZap size={16} />
            {nfeioConfigured ? "NFe.io configurado" : "Modo sem emissão"}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {nfeioConfigured
              ? "As notas prontas podem ser enviadas ao conector."
              : "Você pode preparar, salvar e imprimir prévias sem emitir."}
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p>Carregando notas fiscais...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              icon={FileText}
              label="Preparadas"
              value={String(totals.prepared)}
            />
            <SummaryCard
              icon={FileCheck2}
              label="Emitidas"
              value={String(totals.issued)}
            />
            <SummaryCard
              icon={ReceiptText}
              label="Valor emitido"
              value={currencyFormatter.format(totals.issuedAmount)}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
            <Card title="Preparar NFS-e" subtitle="Selecione um recebimento pago.">
              <form onSubmit={handleSaveDraft} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Recebimento
                  </label>
                  <select
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={transactionId}
                    onChange={(event) => setTransactionId(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {transactions.map((transaction) => {
                      const invoice = invoiceByTransaction.get(transaction.id);
                      return (
                        <option key={transaction.id} value={transaction.id}>
                          {transaction.patients?.full_name ?? "Paciente"} -{" "}
                          {currencyFormatter.format(money(transaction.amount))}
                          {invoice ? ` (${statusLabel[invoice.status]})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedTransaction && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {selectedTransaction.patients?.full_name ?? "Paciente"}
                    </p>
                    <p>{selectedTransaction.description ?? "Recebimento"}</p>
                    <p className="mt-1 text-xs">
                      Pago em {formatDate(selectedTransaction.due_date)}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Descrição do serviço
                  </label>
                  <textarea
                    required
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                    value={serviceDescription}
                    onChange={(event) => setServiceDescription(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Código do serviço
                    </label>
                    <input
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Ex: fisioterapia"
                      value={serviceCode}
                      onChange={(event) => setServiceCode(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      ISS (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={taxRate}
                      onChange={(event) => setTaxRate(Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Valor
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={amount}
                      onChange={(event) => setAmount(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Competência
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={issueDate}
                      onChange={(event) => setIssueDate(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Tomador
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        CPF/CNPJ
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerDocument}
                        onChange={(event) =>
                          setBorrowerDocument(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        E-mail
                      </label>
                      <input
                        type="email"
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerEmail}
                        onChange={(event) => setBorrowerEmail(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        CEP
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerPostalCode}
                        onChange={(event) =>
                          setBorrowerPostalCode(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        UF
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        maxLength={2}
                        value={borrowerState}
                        onChange={(event) =>
                          setBorrowerState(uppercaseState(event.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Telefone
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerPhone}
                        onChange={(event) => setBorrowerPhone(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cidade
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerCityName}
                        onChange={(event) =>
                          setBorrowerCityName(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        IBGE
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerCityCode}
                        onChange={(event) =>
                          setBorrowerCityCode(event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Logradouro
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerStreet}
                        onChange={(event) => setBorrowerStreet(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Número
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerNumber}
                        onChange={(event) => setBorrowerNumber(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Bairro
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerDistrict}
                        onChange={(event) =>
                          setBorrowerDistrict(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Complemento
                      </label>
                      <input
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                        value={borrowerComplement}
                        onChange={(event) =>
                          setBorrowerComplement(event.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    type="submit"
                    variant="outline"
                    isLoading={saving}
                    className="gap-2"
                  >
                    <FileText size={16} /> Salvar rascunho
                  </Button>
                  <Button
                    type="button"
                    isLoading={saving}
                    onClick={handlePrepare}
                    className="gap-2"
                  >
                    <CheckCircle2 size={16} /> Deixar pronta
                  </Button>
                </div>
              </form>
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Controle de NFS-e
                  </h3>
                  <p className="text-sm text-slate-500">
                    Histórico operacional das notas preparadas e emitidas.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                  <label className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                      <Filter size={14} />
                      Emitidas de
                    </span>
                    <input
                      type="date"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none"
                      value={issuedFrom}
                      onChange={(event) => setIssuedFrom(event.target.value)}
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <span className="block text-xs font-semibold uppercase text-slate-400">
                      Até
                    </span>
                    <input
                      type="date"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none"
                      value={issuedTo}
                      onChange={(event) => setIssuedTo(event.target.value)}
                    />
                  </label>

                  <Button
                    type="button"
                    variant="outline"
                    className="self-end"
                    disabled={!hasIssuedDateFilter}
                    onClick={() => {
                      setIssuedFrom("");
                      setIssuedTo("");
                    }}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900/50">
                      <th className="px-6 py-4">Tomador</th>
                      <th className="px-6 py-4">Serviço</th>
                      <th className="px-6 py-4">Emissão</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-sm text-slate-500"
                        >
                          Nenhuma nota encontrada para este filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {invoice.patients?.full_name ?? "Sem paciente"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDate(invoice.created_at)}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="max-w-xs truncate text-sm text-slate-600 dark:text-slate-300">
                              {invoice.service_description}
                            </p>
                            {invoice.error_message && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                                <AlertCircle size={12} />
                                {invoice.error_message}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {invoice.issued_at
                              ? formatDate(invoice.issued_at)
                              : "-"}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold">
                            {currencyFormatter.format(money(invoice.amount))}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={statusVariant[invoice.status]}>
                              {statusLabel[invoice.status]}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => printPreview(invoice)}
                              >
                                <Printer size={14} />
                                Prévia
                              </Button>
                              {invoice.status !== "issued" && (
                                <Button
                                  size="sm"
                                  className="gap-1"
                                  disabled={!nfeioConfigured || saving}
                                  onClick={() => handleIssue(invoice)}
                                  title={
                                    nfeioConfigured
                                      ? "Emitir via conector NFe.io"
                                      : "Configure VITE_NFEIO_PROXY_URL para emitir"
                                  }
                                >
                                  <Send size={14} />
                                  Emitir
                                </Button>
                              )}
                              {invoice.status === "issued" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={
                                      !nfeioConfigured ||
                                      !invoice.provider_invoice_id ||
                                      actionInvoiceId === invoice.id
                                    }
                                    isLoading={actionInvoiceId === invoice.id}
                                    onClick={() => handleOpenPdf(invoice)}
                                    title="Abrir PDF da NFS-e emitida"
                                  >
                                    <FileDown size={14} />
                                    PDF
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={
                                      !nfeioConfigured ||
                                      !invoice.provider_invoice_id ||
                                      actionInvoiceId === invoice.id
                                    }
                                    onClick={() => handleSendEmail(invoice)}
                                    title="Enviar NFS-e por e-mail ao tomador"
                                  >
                                    <Mail size={14} />
                                    E-mail
                                  </Button>
                                </>
                              )}
                              {invoice.verification_url && (
                                <a
                                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                                  href={invoice.verification_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver nota
                                </a>
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
          </div>
        </>
      )}
    </div>
  );
};

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
