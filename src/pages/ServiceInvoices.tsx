import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  RotateCcw,
  Send,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  NfeioBorrowerAddress,
  NfeioFiscalDetails,
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
  fiscalDetails?: NfeioFiscalDetails;
  taxRate?: number;
  taxBreakdown?: InvoiceTaxBreakdown;
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
  appointment_id: string | null;
  amount: number | string;
  category: string;
  status: string;
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

type InvoiceTaxItem = {
  rate: number;
  reductionRate: number;
  effectiveRate: number;
  amount: number;
};

type InvoiceTaxBreakdown = {
  iss: {
    basis: number;
    rate: number;
    amount: number;
  };
  federalRetentions: {
    retentionType: string;
    pis: number | null;
    cofins: number | null;
    csll: number | null;
    irrf: number | null;
    socialSecurity: number | null;
    totalAmount: number;
  };
  ibsCbs: {
    operationIndicator: string;
    classCode: string;
    taxationSituation: string;
    operationType: string;
    governmentEntityType: string;
    governmentPurchaseReductionRate: number;
    basis: number;
    cbs: InvoiceTaxItem;
    ibsState: InvoiceTaxItem;
    ibsMunicipal: InvoiceTaxItem;
    ibsTotalAmount: number;
  };
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

const percentageFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const DEFAULT_ISS_TAX_RATE = 2.01;
const DEFAULT_SERVICE_CODE = "04.08.02";
const DEFAULT_MUNICIPAL_ACTIVITY_CODE = "8650-0/04";
const DEFAULT_MUNICIPAL_ACTIVITY_DESCRIPTION = "Atividades de fisioterapia";
const DEFAULT_CNAE_CODE = "8650004";
const DEFAULT_SERVICE_LOCATION = {
  country: "BRA",
  city: {
    code: "5103403",
    name: "Cuiabá",
  },
  state: "MT",
} as const;

const DEFAULT_SERVICE_FISCAL_DETAILS: NfeioFiscalDetails = {
  federalServiceCode: DEFAULT_SERVICE_CODE,
  municipalActivityCode: DEFAULT_MUNICIPAL_ACTIVITY_CODE,
  municipalActivityDescription: DEFAULT_MUNICIPAL_ACTIVITY_DESCRIPTION,
  cnaeCode: DEFAULT_CNAE_CODE,
  serviceLocation: DEFAULT_SERVICE_LOCATION,
};

const DEFAULT_IBS_CBS_CONFIG = {
  operationIndicator: "03010",
  classCode: "200029",
  taxationSituation: "Alíquota reduzida",
  operationType: "Fornecimento com pagamento posterior",
  governmentEntityType: "Município",
  governmentPurchaseReductionRate: 0,
} as const;

const DEFAULT_FEDERAL_RETENTIONS = {
  retentionType: "PIS/COFINS/CSLL Não Retidos",
  pis: null,
  cofins: null,
  csll: null,
  irrf: null,
  socialSecurity: null,
  totalAmount: 0,
} as const;

const DEFAULT_TAX_CONFIG = {
  cbs: {
    rate: 0.9,
    reductionRate: 60,
  },
  ibsState: {
    rate: 0.1,
    reductionRate: 60,
  },
  ibsMunicipal: {
    rate: 0,
    reductionRate: 60,
  },
} as const;

function money(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function cents(value: number | string | null | undefined): number {
  return Math.round(money(value) * 100);
}

function percent(value: number): string {
  return `${percentageFormatter.format(value)}%`;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}

function effectiveRate(rate: number, reductionRate: number): number {
  return roundPercent(rate * (1 - reductionRate / 100));
}

function taxAmount(baseAmount: number, effectiveRatePercent: number): number {
  return roundMoney((baseAmount * effectiveRatePercent) / 100);
}

function buildInvoiceTaxBreakdown(
  serviceAmount: number,
  issRate = DEFAULT_ISS_TAX_RATE,
): InvoiceTaxBreakdown {
  const issBasis = roundMoney(serviceAmount);
  const issEffectiveRate = roundPercent(issRate || DEFAULT_ISS_TAX_RATE);
  const issAmount = taxAmount(issBasis, issEffectiveRate);
  const ibsCbsBasis = Math.max(0, roundMoney(issBasis - issAmount));
  const cbsEffectiveRate = effectiveRate(
    DEFAULT_TAX_CONFIG.cbs.rate,
    DEFAULT_TAX_CONFIG.cbs.reductionRate,
  );
  const ibsStateEffectiveRate = effectiveRate(
    DEFAULT_TAX_CONFIG.ibsState.rate,
    DEFAULT_TAX_CONFIG.ibsState.reductionRate,
  );
  const ibsMunicipalEffectiveRate = effectiveRate(
    DEFAULT_TAX_CONFIG.ibsMunicipal.rate,
    DEFAULT_TAX_CONFIG.ibsMunicipal.reductionRate,
  );
  const ibsStateAmount = taxAmount(ibsCbsBasis, ibsStateEffectiveRate);
  const ibsMunicipalAmount = taxAmount(
    ibsCbsBasis,
    ibsMunicipalEffectiveRate,
  );

  return {
    iss: {
      basis: issBasis,
      rate: issEffectiveRate,
      amount: issAmount,
    },
    federalRetentions: { ...DEFAULT_FEDERAL_RETENTIONS },
    ibsCbs: {
      ...DEFAULT_IBS_CBS_CONFIG,
      basis: ibsCbsBasis,
      cbs: {
        ...DEFAULT_TAX_CONFIG.cbs,
        effectiveRate: cbsEffectiveRate,
        amount: taxAmount(ibsCbsBasis, cbsEffectiveRate),
      },
      ibsState: {
        ...DEFAULT_TAX_CONFIG.ibsState,
        effectiveRate: ibsStateEffectiveRate,
        amount: ibsStateAmount,
      },
      ibsMunicipal: {
        ...DEFAULT_TAX_CONFIG.ibsMunicipal,
        effectiveRate: ibsMunicipalEffectiveRate,
        amount: ibsMunicipalAmount,
      },
      ibsTotalAmount: roundMoney(ibsStateAmount + ibsMunicipalAmount),
    },
  };
}

function normalizeInvoiceTaxBreakdown(
  value: unknown,
  serviceAmount: number,
  issRate: number,
): InvoiceTaxBreakdown {
  if (!value || typeof value !== "object" || !("ibsCbs" in value)) {
    return buildInvoiceTaxBreakdown(serviceAmount, issRate);
  }

  const fallback = buildInvoiceTaxBreakdown(serviceAmount, issRate);
  const record = value as Partial<InvoiceTaxBreakdown>;

  return {
    iss: {
      ...fallback.iss,
      ...record.iss,
    },
    federalRetentions: {
      ...fallback.federalRetentions,
      ...record.federalRetentions,
    },
    ibsCbs: {
      ...fallback.ibsCbs,
      ...record.ibsCbs,
      cbs: {
        ...fallback.ibsCbs.cbs,
        ...record.ibsCbs?.cbs,
      },
      ibsState: {
        ...fallback.ibsCbs.ibsState,
        ...record.ibsCbs?.ibsState,
      },
      ibsMunicipal: {
        ...fallback.ibsCbs.ibsMunicipal,
        ...record.ibsCbs?.ibsMunicipal,
      },
    },
  };
}

function formatOptionalTaxAmount(value: number | null): string {
  return value === null ? "-" : currencyFormatter.format(value);
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

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function transactionOptionLabel(
  transaction: TransactionOption,
  invoice?: ServiceInvoice,
): string {
  const patientName = transaction.patients?.full_name ?? "Paciente";
  const status = invoice ? ` (${statusLabel[invoice.status]})` : "";

  return `${patientName} - ${currencyFormatter.format(
    money(transaction.amount),
  )} - ${formatDate(transaction.due_date)}${status}`;
}

function duplicateProcedureTransactionKey(transaction: TransactionOption): string {
  return [
    transaction.patient_id ?? "",
    cents(transaction.amount),
    transaction.due_date,
  ].join("|");
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

function findNextUnissuedTransaction(
  transactions: TransactionOption[],
  invoices: ServiceInvoice[],
): TransactionOption | null {
  const invoiceByTransactionId = new Map<string, ServiceInvoice>();
  invoices.forEach((invoice) => {
    if (invoice.transaction_id) {
      invoiceByTransactionId.set(invoice.transaction_id, invoice);
    }
  });

  return (
    transactions.find(
      (transaction) =>
        invoiceByTransactionId.get(transaction.id)?.status !== "issued",
    ) ?? null
  );
}

export const ServiceInvoices = () => {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<TransactionOption[]>([]);
  const [invoices, setInvoices] = useState<ServiceInvoice[]>([]);
  const [transactionId, setTransactionId] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionPickerOpen, setTransactionPickerOpen] = useState(false);
  const [serviceDescription, setServiceDescription] = useState(
    "Serviços de fisioterapia",
  );
  const [serviceCode, setServiceCode] = useState(DEFAULT_SERVICE_CODE);
  const [taxRate, setTaxRate] = useState(DEFAULT_ISS_TAX_RATE);
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

  const visibleTransactions = useMemo(() => {
    const linkedProcedureKeys = new Set(
      transactions
        .filter(
          (transaction) =>
            transaction.category === "Recebimento de procedimentos" &&
            transaction.status === "paid" &&
            Boolean(transaction.appointment_id),
        )
        .map(duplicateProcedureTransactionKey),
    );

    return transactions.filter((transaction) => {
      if (
        transaction.category !== "Recebimento de procedimentos" ||
        transaction.status !== "paid" ||
        transaction.appointment_id
      ) {
        return true;
      }

      return !linkedProcedureKeys.has(duplicateProcedureTransactionKey(transaction));
    });
  }, [transactions]);

  const invoiceByTransaction = useMemo(() => {
    const map = new Map<string, ServiceInvoice>();
    invoices.forEach((invoice) => {
      if (invoice.transaction_id) map.set(invoice.transaction_id, invoice);
    });
    return map;
  }, [invoices]);

  const availableTransactions = useMemo(
    () =>
      visibleTransactions.filter(
        (transaction) =>
          invoiceByTransaction.get(transaction.id)?.status !== "issued",
      ),
    [invoiceByTransaction, visibleTransactions],
  );

  useEffect(() => {
    if (!selectedTransaction) return;
    setTransactionSearch(
      transactionOptionLabel(
        selectedTransaction,
        invoiceByTransaction.get(selectedTransaction.id),
      ),
    );
  }, [invoiceByTransaction, selectedTransaction]);

  const hasIssuedDateFilter = Boolean(issuedFrom || issuedTo);

  const taxBreakdown = useMemo(
    () => buildInvoiceTaxBreakdown(amount, taxRate || DEFAULT_ISS_TAX_RATE),
    [amount, taxRate],
  );

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

  const visibleTransactionOptions = useMemo(() => {
    const normalizedSearch = normalizeSearch(transactionSearch);
    const filtered = normalizedSearch
      ? availableTransactions.filter((transaction) => {
          const invoice = invoiceByTransaction.get(transaction.id);
          const searchableText = [
            transactionOptionLabel(transaction, invoice),
            transaction.patients?.full_name,
            transaction.description,
            currencyFormatter.format(money(transaction.amount)),
            formatDate(transaction.due_date),
          ]
            .filter(Boolean)
            .join(" ");

          return normalizeSearch(searchableText).includes(normalizedSearch);
        })
      : availableTransactions;

    return filtered.slice(0, 20);
  }, [availableTransactions, invoiceByTransaction, transactionSearch]);

  const findTransactionBySearch = (value: string): TransactionOption | undefined => {
    const normalizedValue = normalizeSearch(value);
    if (!normalizedValue) return undefined;

    const exactByLabel = availableTransactions.find((transaction) => {
      const invoice = invoiceByTransaction.get(transaction.id);
      return (
        normalizeSearch(transactionOptionLabel(transaction, invoice)) ===
        normalizedValue
      );
    });
    if (exactByLabel) return exactByLabel;

    const exactByPatient = availableTransactions.filter(
      (transaction) =>
        normalizeSearch(transaction.patients?.full_name ?? "Paciente") ===
        normalizedValue,
    );

    return exactByPatient.length === 1 ? exactByPatient[0] : undefined;
  };

  const handleTransactionSearchChange = (value: string) => {
    setTransactionSearch(value);
    setTransactionId(findTransactionBySearch(value)?.id ?? "");
    setTransactionPickerOpen(true);
  };

  const selectTransaction = (transaction: TransactionOption) => {
    setTransactionId(transaction.id);
    setTransactionSearch(
      transactionOptionLabel(
        transaction,
        invoiceByTransaction.get(transaction.id),
      ),
    );
    setTransactionPickerOpen(false);
  };

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

  const clearInvoiceForm = useCallback(() => {
    setTransactionId("");
    setTransactionSearch("");
    setTransactionPickerOpen(false);
    setAmount(0);
    setServiceDescription("Serviços de fisioterapia");
    setServiceCode(DEFAULT_SERVICE_CODE);
    setTaxRate(DEFAULT_ISS_TAX_RATE);
    setIssueDate(today());
    applyBorrowerFields(undefined, null);
  }, [applyBorrowerFields]);

  const applyTransactionToForm = useCallback((
    transaction: TransactionOption,
    invoice?: ServiceInvoice,
  ) => {
    const requestedPayload = invoice?.requested_payload;

    setAmount(money(invoice?.amount ?? transaction.amount));
    setServiceDescription(
      invoice?.service_description ??
        transaction.description ??
        "Serviços de fisioterapia",
    );
    setServiceCode(DEFAULT_SERVICE_CODE);
    setTaxRate(
      money(invoice?.tax_rate) ||
        money(requestedPayload?.taxRate) ||
        DEFAULT_ISS_TAX_RATE,
    );
    setIssueDate(requestedPayload?.issueDate ?? today());
    applyBorrowerFields(requestedPayload?.borrower, transaction.patients);
  }, [applyBorrowerFields]);

  const loadData = async () => {
    if (!profile?.clinic_id) {
      setLoading(false);
      return null;
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
          appointment_id,
          amount,
          category,
          status,
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
      return null;
    }

    const loadedTransactions =
      (transactionsResult.data ?? []) as unknown as TransactionOption[];
    const loadedInvoices =
      (invoicesResult.data ?? []) as unknown as ServiceInvoice[];

    setTransactions(loadedTransactions);
    setInvoices(loadedInvoices);

    const selectedInvoice = transactionId
      ? loadedInvoices.find((invoice) => invoice.transaction_id === transactionId)
      : undefined;

    if (!transactionId || selectedInvoice?.status === "issued") {
      const nextTransaction = findNextUnissuedTransaction(
        loadedTransactions,
        loadedInvoices,
      );

      if (nextTransaction) {
        setTransactionId(nextTransaction.id);
        applyTransactionToForm(
          nextTransaction,
          loadedInvoices.find(
            (invoice) => invoice.transaction_id === nextTransaction.id,
          ),
        );
      } else {
        clearInvoiceForm();
      }
    }

    setLoading(false);
    return {
      transactions: loadedTransactions,
      invoices: loadedInvoices,
    };
  };

  useEffect(() => {
    loadData();
  }, [profile?.clinic_id]);

  useEffect(() => {
    if (!selectedTransaction) return;

    const existing = invoiceByTransaction.get(selectedTransaction.id);
    applyTransactionToForm(selectedTransaction, existing);
  }, [selectedTransaction, invoiceByTransaction, applyTransactionToForm]);

  const saveInvoice = async (status: InvoiceStatus) => {
    if (!profile?.clinic_id || !selectedTransaction) {
      setError("Selecione um recebimento para preparar a nota fiscal.");
      return null;
    }

    setSaving(true);
    setError(null);

    const existing = invoiceByTransaction.get(selectedTransaction.id);
    const preparedTaxRate = taxRate || DEFAULT_ISS_TAX_RATE;
    const preparedServiceCode = DEFAULT_SERVICE_CODE;
    const preparedTaxBreakdown = buildInvoiceTaxBreakdown(
      amount,
      preparedTaxRate,
    );
    const payload = {
      clinic_id: profile.clinic_id,
      patient_id: selectedTransaction.patient_id,
      transaction_id: selectedTransaction.id,
      amount,
      service_description: serviceDescription.trim(),
      service_code: preparedServiceCode,
      tax_rate: preparedTaxRate,
      status,
      provider: "nfeio",
      requested_payload: {
        issueDate,
        transaction: selectedTransaction,
        serviceDescription: serviceDescription.trim(),
        serviceCode: preparedServiceCode,
        fiscalDetails: DEFAULT_SERVICE_FISCAL_DETAILS,
        taxRate: preparedTaxRate,
        taxBreakdown: preparedTaxBreakdown,
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
      invoice.service_code || DEFAULT_SERVICE_CODE,
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
    let issuedSuccessfully = false;

    try {
      const result = await issueServiceInvoice({
        invoiceId: invoice.id,
        amount: money(invoice.amount),
        serviceDescription: invoice.service_description,
        serviceCode: invoice.service_code?.trim() || DEFAULT_SERVICE_CODE,
        fiscalDetails:
          invoice.requested_payload?.fiscalDetails ??
          DEFAULT_SERVICE_FISCAL_DETAILS,
        taxRate: money(invoice.tax_rate) || DEFAULT_ISS_TAX_RATE,
        taxBreakdown: normalizeInvoiceTaxBreakdown(
          invoice.requested_payload?.taxBreakdown ??
            null,
          money(invoice.amount),
          money(invoice.tax_rate) || DEFAULT_ISS_TAX_RATE,
        ),
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
      issuedSuccessfully = true;
    } catch (err) {
      issueMessage =
        err instanceof Error ? err.message : "Erro ao emitir nota fiscal.";
      await supabase
        .from("service_invoices")
        .update({ status: "error", error_message: issueMessage })
        .eq("id", invoice.id);
    } finally {
      setSaving(false);
      const loadedData = await loadData();

      if (issueMessage) {
        setError(issueMessage);
      } else if (issuedSuccessfully && loadedData) {
        const nextTransaction = findNextUnissuedTransaction(
          loadedData.transactions,
          loadedData.invoices,
        );

        if (nextTransaction) {
          setTransactionId(nextTransaction.id);
          applyTransactionToForm(
            nextTransaction,
            loadedData.invoices.find(
              (item) => item.transaction_id === nextTransaction.id,
            ),
          );
          setNotice(
            "NFS-e emitida com sucesso. O formulário foi preparado para a próxima nota pendente.",
          );
        } else {
          clearInvoiceForm();
          setNotice(
            "NFS-e emitida com sucesso. Não há outros recebimentos pendentes para preparar.",
          );
        }
      }
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
    const previewTaxBreakdown = normalizeInvoiceTaxBreakdown(
      invoice.requested_payload?.taxBreakdown ?? null,
      money(invoice.amount),
      money(invoice.tax_rate) || DEFAULT_ISS_TAX_RATE,
    );
    const previewFiscalDetails =
      invoice.requested_payload?.fiscalDetails ?? DEFAULT_SERVICE_FISCAL_DETAILS;

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
            <div class="row"><strong>Cód. Trib. Nacional</strong><span>${escapeHtml(previewFiscalDetails.federalServiceCode)}</span></div>
            <div class="row"><strong>Atividade Municipal</strong><span>${escapeHtml(`[${previewFiscalDetails.municipalActivityCode}] ${previewFiscalDetails.municipalActivityDescription}`)}</span></div>
            <div class="row"><strong>Local da prestação</strong><span>${escapeHtml(`${previewFiscalDetails.serviceLocation.city.name} - ${previewFiscalDetails.serviceLocation.state}`)}</span></div>
            <div class="row"><strong>ISSQN</strong><span>${escapeHtml(currencyFormatter.format(previewTaxBreakdown.iss.basis))} · ${escapeHtml(percent(previewTaxBreakdown.iss.rate))} · ${escapeHtml(currencyFormatter.format(previewTaxBreakdown.iss.amount))}</span></div>
            <div class="row"><strong>Retenções federais</strong><span>${escapeHtml(previewTaxBreakdown.federalRetentions.retentionType)}</span></div>
            <div class="row"><strong>Base IBS/CBS</strong><span>${escapeHtml(currencyFormatter.format(previewTaxBreakdown.ibsCbs.basis))}</span></div>
            <div class="row"><strong>CBS</strong><span>${escapeHtml(percent(previewTaxBreakdown.ibsCbs.cbs.effectiveRate))} · ${escapeHtml(currencyFormatter.format(previewTaxBreakdown.ibsCbs.cbs.amount))}</span></div>
            <div class="row"><strong>IBS Est.</strong><span>${escapeHtml(percent(previewTaxBreakdown.ibsCbs.ibsState.effectiveRate))} · ${escapeHtml(currencyFormatter.format(previewTaxBreakdown.ibsCbs.ibsState.amount))}</span></div>
            <div class="row"><strong>IBS Mun.</strong><span>${escapeHtml(percent(previewTaxBreakdown.ibsCbs.ibsMunicipal.effectiveRate))} · ${escapeHtml(currencyFormatter.format(previewTaxBreakdown.ibsCbs.ibsMunicipal.amount))}</span></div>
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
                  <div className="relative">
                    <input
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Digite o nome do paciente"
                      value={transactionSearch}
                      onFocus={() => setTransactionPickerOpen(true)}
                      onBlur={() =>
                        window.setTimeout(
                          () => setTransactionPickerOpen(false),
                          120,
                        )
                      }
                      onChange={(event) =>
                        handleTransactionSearchChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setTransactionPickerOpen(false);
                        }
                      }}
                      autoComplete="off"
                    />

                    {transactionPickerOpen && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
                        {visibleTransactionOptions.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-slate-500">
                            Nenhum recebimento pendente encontrado.
                          </div>
                        ) : (
                          visibleTransactionOptions.map((transaction) => {
                            const invoice = invoiceByTransaction.get(
                              transaction.id,
                            );

                            return (
                              <button
                                key={transaction.id}
                                type="button"
                                className="block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  selectTransaction(transaction);
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <span className="min-w-0 break-words text-sm font-semibold text-slate-900 dark:text-white">
                                    {transaction.patients?.full_name ??
                                      "Paciente"}
                                  </span>
                                  <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {currencyFormatter.format(
                                      money(transaction.amount),
                                    )}
                                  </span>
                                </div>
                                <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                                  {transaction.description ?? "Recebimento"}
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-400">
                                  Pago em {formatDate(transaction.due_date)}
                                  {invoice
                                    ? ` · ${statusLabel[invoice.status]}`
                                    : ""}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
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
                      Cód. Trib. Nacional
                    </label>
                    <input
                      readOnly
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={serviceCode}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Atividade Municipal
                    </label>
                    <input
                      readOnly
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={`[${DEFAULT_MUNICIPAL_ACTIVITY_CODE}] ${DEFAULT_MUNICIPAL_ACTIVITY_DESCRIPTION}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Local da prestação
                    </label>
                    <input
                      readOnly
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={`${DEFAULT_SERVICE_LOCATION.city.name} - ${DEFAULT_SERVICE_LOCATION.state}`}
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

                <TaxBreakdownPanel breakdown={taxBreakdown} />

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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={clearInvoiceForm}
                    className="gap-2"
                  >
                    <RotateCcw size={16} /> Limpar dados
                  </Button>
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

function TaxBreakdownPanel({ breakdown }: { breakdown: InvoiceTaxBreakdown }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
        Tributos
      </h3>
      <TaxSection title="ISSQN">
        <TaxLine
          label="Base de Cálculo"
          value={currencyFormatter.format(breakdown.iss.basis)}
        />
        <TaxLine label="Alíquota" value={percent(breakdown.iss.rate)} />
        <TaxLine
          label="Vl. ISSQN"
          value={currencyFormatter.format(breakdown.iss.amount)}
        />
      </TaxSection>

      <TaxSection title="Tributação Nacional">
        <TaxLine label="CST" value="Nenhum" />
        <TaxLine
          label="Tipo de Retenção"
          value={breakdown.federalRetentions.retentionType}
        />
        <TaxLine
          label="Vl. PIS"
          value={formatOptionalTaxAmount(breakdown.federalRetentions.pis)}
        />
        <TaxLine
          label="Vl. COFINS"
          value={formatOptionalTaxAmount(breakdown.federalRetentions.cofins)}
        />
        <TaxLine
          label="Vl. CSLL"
          value={formatOptionalTaxAmount(breakdown.federalRetentions.csll)}
        />
        <TaxLine
          label="Vl. IRRF"
          value={formatOptionalTaxAmount(breakdown.federalRetentions.irrf)}
        />
        <TaxLine
          label="Vl. CP Retido"
          value={formatOptionalTaxAmount(
            breakdown.federalRetentions.socialSecurity,
          )}
        />
      </TaxSection>

      <TaxSection title="IBS/CBS">
        <TaxLine
          label="Cód. Ind. Op."
          value={breakdown.ibsCbs.operationIndicator}
        />
        <TaxLine
          label="Classif. Tributária"
          value={breakdown.ibsCbs.classCode}
        />
        <TaxLine
          label="Situação Tributária"
          value={breakdown.ibsCbs.taxationSituation}
        />
        <TaxLine label="Tipo de Operação" value={breakdown.ibsCbs.operationType} />
        <TaxLine
          label="Tipo de Ente Governamental"
          value={breakdown.ibsCbs.governmentEntityType}
        />
        <TaxLine
          label="Perc. Red. Compra Gov."
          value={percent(breakdown.ibsCbs.governmentPurchaseReductionRate)}
        />
        <TaxLine
          label="Base de Cálculo"
          value={currencyFormatter.format(breakdown.ibsCbs.basis)}
        />
        <TaxLine label="Alíq. CBS" value={percent(breakdown.ibsCbs.cbs.rate)} />
        <TaxLine
          label="Perc. Red. Alíq. CBS"
          value={percent(breakdown.ibsCbs.cbs.reductionRate)}
        />
        <TaxLine
          label="Alíq. Efet. CBS"
          value={percent(breakdown.ibsCbs.cbs.effectiveRate)}
        />
        <TaxLine
          label="Valor CBS"
          value={currencyFormatter.format(breakdown.ibsCbs.cbs.amount)}
        />
        <TaxLine
          label="Alíq. IBS Est."
          value={percent(breakdown.ibsCbs.ibsState.rate)}
        />
        <TaxLine
          label="Perc. Red. Alíq. IBS Est."
          value={percent(breakdown.ibsCbs.ibsState.reductionRate)}
        />
        <TaxLine
          label="Alíq. Efet. IBS Est."
          value={percent(breakdown.ibsCbs.ibsState.effectiveRate)}
        />
        <TaxLine
          label="Valor IBS Est."
          value={currencyFormatter.format(breakdown.ibsCbs.ibsState.amount)}
        />
        <TaxLine
          label="Alíq. IBS Mun."
          value={percent(breakdown.ibsCbs.ibsMunicipal.rate)}
        />
        <TaxLine
          label="Perc. Red. Alíq. IBS Mun."
          value={percent(breakdown.ibsCbs.ibsMunicipal.reductionRate)}
        />
        <TaxLine
          label="Alíq. Efet. IBS Mun."
          value={percent(breakdown.ibsCbs.ibsMunicipal.effectiveRate)}
        />
        <TaxLine
          label="Valor IBS Mun."
          value={currencyFormatter.format(breakdown.ibsCbs.ibsMunicipal.amount)}
        />
      </TaxSection>

      <TaxSection title="Totais">
        <TaxLine
          label="Total de Retenção"
          value={
            breakdown.federalRetentions.totalAmount > 0
              ? currencyFormatter.format(breakdown.federalRetentions.totalAmount)
              : "-"
          }
        />
        <TaxLine
          label="Valor Total do CBS"
          value={currencyFormatter.format(breakdown.ibsCbs.cbs.amount)}
        />
        <TaxLine
          label="Valor Total do IBS"
          value={currencyFormatter.format(breakdown.ibsCbs.ibsTotalAmount)}
        />
        <TaxLine
          label="Valor Total Líquido"
          value={currencyFormatter.format(breakdown.iss.basis)}
        />
        <TaxLine
          label="Valor Total da Nota Fiscal - IBS/CBS"
          value={currencyFormatter.format(breakdown.iss.basis)}
        />
      </TaxSection>
    </div>
  );
}

function TaxSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0 dark:border-slate-800">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function TaxLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
      <span className="min-w-0 text-xs font-medium text-slate-500">
        {label}
      </span>
      <span className="min-w-0 break-words text-right font-semibold text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}
