import { supabase } from "../lib/supabase";

export type NfeioBorrowerType = "NaturalPerson" | "LegalEntity";

export type NfeioBorrowerAddress = {
  country?: string;
  postalCode: string;
  street: string;
  number: string;
  additionalInformation?: string | null;
  district: string;
  city: {
    code: string;
    name: string;
  };
  state: string;
};

export type NfeioTaxItem = {
  rate: number;
  reductionRate: number;
  effectiveRate: number;
  amount: number;
};

export type NfeioServiceLocation = {
  country?: string;
  city: {
    code: string;
    name: string;
  };
  state: string;
};

export type NfeioFiscalDetails = {
  federalServiceCode: string;
  municipalActivityCode: string;
  municipalActivityDescription: string;
  cnaeCode?: string;
  serviceLocation: NfeioServiceLocation;
};

export type NfeioIssBreakdown = {
  basis: number;
  rate: number;
  amount: number;
};

export type NfeioFederalRetentions = {
  retentionType: string;
  pis: number | null;
  cofins: number | null;
  csll: number | null;
  irrf: number | null;
  socialSecurity: number | null;
  totalAmount: number;
};

export type NfeioIbsCbsBreakdown = {
  operationIndicator: string;
  classCode: string;
  taxationSituation: string;
  operationType: string;
  governmentEntityType: string;
  governmentPurchaseReductionRate: number;
  basis: number;
  cbs: NfeioTaxItem;
  ibsState: NfeioTaxItem;
  ibsMunicipal: NfeioTaxItem;
  ibsTotalAmount: number;
};

export type NfeioTaxBreakdown = {
  iss: NfeioIssBreakdown;
  federalRetentions: NfeioFederalRetentions;
  ibsCbs: NfeioIbsCbsBreakdown;
};

export type NfeioInvoicePayload = {
  invoiceId: string;
  amount: number;
  serviceDescription: string;
  serviceCode: string;
  fiscalDetails?: NfeioFiscalDetails;
  taxRate?: number;
  taxBreakdown?: NfeioTaxBreakdown;
  issueDate?: string;
  customer: {
    type?: NfeioBorrowerType;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: NfeioBorrowerAddress | null;
  };
};

export type NfeioIssueResult = {
  providerInvoiceId: string | null;
  verificationUrl: string | null;
  rawResponse: unknown;
};

export type NfeioPdfResult = {
  pdfBase64?: string;
  pdfContentType?: string;
  pdfUrl?: string;
  rawResponse?: unknown;
};

const proxyUrl = import.meta.env.VITE_NFEIO_PROXY_URL as string | undefined;

export function isNfeioConfigured(): boolean {
  return Boolean(proxyUrl?.trim());
}

export async function issueServiceInvoice(
  payload: NfeioInvoicePayload,
): Promise<NfeioIssueResult> {
  if (!proxyUrl) {
    throw new Error(
      "Integração NFe.io ainda não configurada. A nota foi preparada, mas não emitida.",
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | {
        id?: string;
        providerInvoiceId?: string;
        verificationUrl?: string;
        url?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      data && "message" in data && typeof data.message === "string"
        ? data.message
        : "Erro ao emitir NFS-e pelo conector NFe.io.",
    );
  }

  return {
    providerInvoiceId: data?.providerInvoiceId ?? data?.id ?? null,
    verificationUrl: data?.verificationUrl ?? data?.url ?? null,
    rawResponse: data,
  };
}

export async function downloadServiceInvoicePdf(
  providerInvoiceId: string,
): Promise<NfeioPdfResult> {
  return callInvoiceAction<NfeioPdfResult>("downloadPdf", providerInvoiceId);
}

export async function sendServiceInvoiceEmail(
  providerInvoiceId: string,
): Promise<{ ok: boolean; rawResponse?: unknown }> {
  return callInvoiceAction("sendEmail", providerInvoiceId);
}

async function callInvoiceAction<T>(
  action: "downloadPdf" | "sendEmail",
  providerInvoiceId: string,
): Promise<T> {
  if (!proxyUrl) {
    throw new Error("Integração NFe.io ainda não configurada.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, providerInvoiceId }),
  });

  const data = (await response.json().catch(() => null)) as
    | ({ message?: string } & T)
    | null;

  if (!response.ok) {
    throw new Error(
      data?.message ??
        (action === "downloadPdf"
          ? "Erro ao baixar PDF da NFS-e."
          : "Erro ao enviar NFS-e por e-mail."),
    );
  }

  return data as T;
}
