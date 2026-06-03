type BorrowerType = "NaturalPerson" | "LegalEntity";

type BorrowerAddress = {
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

type TaxItem = {
  rate: number;
  reductionRate: number;
  effectiveRate: number;
  amount: number;
};

type ServiceLocation = {
  country?: string;
  city: {
    code: string;
    name: string;
  };
  state: string;
};

type FiscalDetails = {
  federalServiceCode: string;
  municipalActivityCode: string;
  municipalActivityDescription: string;
  cnaeCode?: string;
  serviceLocation: ServiceLocation;
};

type IssBreakdown = {
  basis: number;
  rate: number;
  amount: number;
};

type FederalRetentions = {
  retentionType: string;
  pis: number | null;
  cofins: number | null;
  csll: number | null;
  irrf: number | null;
  socialSecurity: number | null;
  totalAmount: number;
};

type IbsCbsBreakdown = {
  operationIndicator: string;
  classCode: string;
  taxationSituation: string;
  operationType: string;
  governmentEntityType: string;
  governmentPurchaseReductionRate: number;
  basis: number;
  cbs: TaxItem;
  ibsState: TaxItem;
  ibsMunicipal: TaxItem;
  ibsTotalAmount: number;
};

type TaxBreakdown = {
  iss: IssBreakdown;
  federalRetentions: FederalRetentions;
  ibsCbs: IbsCbsBreakdown;
};

type InvoiceRequest = {
  invoiceId: string;
  amount: number;
  serviceDescription: string;
  serviceCode: string;
  fiscalDetails?: FiscalDetails;
  taxRate?: number;
  taxBreakdown?: TaxBreakdown;
  issueDate?: string;
  customer: {
    type?: BorrowerType;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: BorrowerAddress | null;
  };
};

type InvoiceActionRequest = {
  action: "downloadPdf" | "sendEmail";
  providerInvoiceId: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_ISS_TAX_RATE = 2.01;
const DEFAULT_FEDERAL_SERVICE_CODE = "04.08.02";
const DEFAULT_MUNICIPAL_ACTIVITY_CODE = "8650-0/04";
const DEFAULT_MUNICIPAL_ACTIVITY_DESCRIPTION = "Atividades de fisioterapia";
const DEFAULT_CNAE_CODE = "8650004";
const DEFAULT_SERVICE_LOCATION: ServiceLocation = {
  country: "BRA",
  city: {
    code: "5103403",
    name: "Cuiabá",
  },
  state: "MT",
};
const DEFAULT_IBS_CBS_CONFIG = {
  operationIndicator: "03010",
  operationType: "SupplyFirstPayLater",
  classCode: "200029",
  taxationSituation: "Alíquota reduzida",
  governmentEntityType: "Municipality",
  governmentPurchaseReductionRate: 0,
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ message: "Metodo nao permitido." }, 405);
  }

  const requireAuth = Deno.env.get("NFEIO_REQUIRE_AUTH") !== "false";
  const authorization = request.headers.get("Authorization");
  if (requireAuth && !authorization?.startsWith("Bearer ")) {
    return json({ message: "Sessao autenticada obrigatoria para emitir NFS-e." }, 401);
  }

  const apiKey = Deno.env.get("NFEIO_API_KEY") ?? Deno.env.get("NFEIO_INVOICE_KEY");
  const companyId = Deno.env.get("NFEIO_COMPANY_ID");
  const baseUrl = trimTrailingSlash(Deno.env.get("NFEIO_BASE_URL") ?? "https://api.nfe.io");

  if (!apiKey || !companyId) {
    return json(
      {
        message:
          "Segredos NFEIO_API_KEY e NFEIO_COMPANY_ID nao configurados na Edge Function.",
      },
      500,
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | InvoiceRequest
    | InvoiceActionRequest
    | null;

  if (isInvoiceAction(payload)) {
    return handleInvoiceAction(payload, { apiKey, companyId, baseUrl });
  }

  const validationError = validateInvoice(payload);
  if (validationError) return json({ message: validationError }, 400);

  const customer = payload.customer;
  const document = onlyDigits(customer.document);
  const nfeioPayload = {
    externalId: payload.invoiceId,
    borrower: {
      type: customer.type ?? borrowerTypeFromDocument(document),
      name: customer.name.trim(),
      federalTaxNumber: document,
      email: customer.email?.trim() || undefined,
      address: normalizeAddress(customer.address),
    },
    cityServiceCode: payload.serviceCode.trim(),
    description: payload.serviceDescription.trim(),
    servicesAmount: Number(payload.amount),
  };

  const response = await fetch(
    `${baseUrl}/v1/companies/${encodeURIComponent(companyId)}/serviceinvoices`,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(nfeioPayload),
    },
  );

  const data = await response
    .json()
    .catch(async () => ({ message: await response.text().catch(() => "") }));

  if (!response.ok) {
    return json(
      {
        message: extractMessage(data) || "Erro ao enviar NFS-e para a NFe.io.",
        status: response.status,
        providerResponse: data,
      },
      response.status,
    );
  }

  return json({
    providerInvoiceId: getString(data, ["id", "Id", "providerInvoiceId", "ProviderInvoiceId"]),
    verificationUrl: getString(data, ["verificationUrl", "VerificationUrl", "url", "Url"]),
    rawResponse: data,
  });
});

async function handleInvoiceAction(
  payload: InvoiceActionRequest,
  config: { apiKey: string; companyId: string; baseUrl: string },
) {
  const providerInvoiceId = payload.providerInvoiceId?.trim();
  if (!providerInvoiceId) return json({ message: "ID da NFS-e ausente." }, 400);

  const endpoint = `${config.baseUrl}/v1/companies/${encodeURIComponent(
    config.companyId,
  )}/serviceinvoices/${encodeURIComponent(providerInvoiceId)}`;

  if (payload.action === "sendEmail") {
    const response = await fetch(`${endpoint}/sendemail`, {
      method: "PUT",
      headers: {
        Authorization: config.apiKey,
        Accept: "application/json",
      },
    });
    const data = await readProviderResponse(response);

    if (!response.ok) {
      return json(
        {
          message: extractMessage(data) || "Erro ao enviar e-mail pela NFe.io.",
          status: response.status,
          providerResponse: data,
        },
        response.status,
      );
    }

    return json({ ok: true, rawResponse: data });
  }

  const response = await fetch(`${endpoint}/pdf`, {
    method: "GET",
    headers: {
      Authorization: config.apiKey,
      Accept: "application/pdf, application/json",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const data = await readProviderResponse(response);
    return json(
      {
        message: extractMessage(data) || "Erro ao baixar PDF da NFS-e.",
        status: response.status,
        providerResponse: data,
      },
      response.status,
    );
  }

  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    return json({
      ...extractPdfPayload(data),
      rawResponse: data,
    });
  }

  if (contentType.includes("text/")) {
    const text = await response.text();
    return json({
      ...extractPdfPayload(text),
      rawResponse: text,
    });
  }

  return json({
    pdfBase64: arrayBufferToBase64(await response.arrayBuffer()),
    pdfContentType: contentType || "application/pdf",
  });
}

function validateInvoice(payload: InvoiceRequest | null): string | null {
  if (!payload) return "Payload invalido.";
  if (!payload.invoiceId?.trim()) return "ID interno da nota ausente.";
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
    return "Valor da nota deve ser maior que zero.";
  }
  if (!payload.serviceDescription?.trim()) return "Descricao do servico ausente.";
  if (!payload.serviceCode?.trim()) return "Codigo municipal do servico ausente.";
  if (!payload.customer?.name?.trim()) return "Nome do tomador ausente.";
  if (!onlyDigits(payload.customer.document)) return "CPF/CNPJ do tomador ausente.";

  const address = payload.customer.address;
  if (!address) return "Endereco do tomador ausente.";

  const requiredAddressFields = [
    address.postalCode,
    address.street,
    address.number,
    address.district,
    address.city?.code,
    address.city?.name,
    address.state,
  ];

  if (requiredAddressFields.some((field) => !field?.trim())) {
    return "Endereco do tomador incompleto.";
  }

  return null;
}

function isInvoiceAction(payload: unknown): payload is InvoiceActionRequest {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;

  return (
    (record.action === "downloadPdf" || record.action === "sendEmail") &&
    typeof record.providerInvoiceId === "string"
  );
}

function normalizeAddress(address: BorrowerAddress | null): BorrowerAddress {
  if (!address) throw new Error("Endereco do tomador ausente.");

  return {
    country: address.country?.trim() || "BRA",
    postalCode: onlyDigits(address.postalCode),
    street: address.street.trim(),
    number: address.number.trim(),
    additionalInformation: address.additionalInformation?.trim() || undefined,
    district: address.district.trim(),
    city: {
      code: onlyDigits(address.city.code),
      name: address.city.name.trim(),
    },
    state: address.state.trim().toUpperCase(),
  };
}

function borrowerTypeFromDocument(document: string): BorrowerType {
  return document.length > 11 ? "LegalEntity" : "NaturalPerson";
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const candidates = [
    record.message,
    record.Message,
    record.error,
    record.Error,
    record.detail,
    record.Detail,
    record.title,
    record.Title,
  ];
  return candidates.find((item): item is string => typeof item === "string" && item.trim()) ?? "";
}

async function readProviderResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => null);
  }
  return await response.text().catch(() => "");
}

function extractPdfPayload(data: unknown): {
  pdfBase64?: string;
  pdfContentType?: string;
  pdfUrl?: string;
} {
  const value = getPdfString(data);
  if (!value) return {};

  if (/^https?:\/\//i.test(value)) return { pdfUrl: value };

  const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      pdfContentType: dataUrlMatch[1],
      pdfBase64: dataUrlMatch[2],
    };
  }

  return {
    pdfContentType: "application/pdf",
    pdfBase64: value,
  };
}

function getPdfString(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return null;

  const keys = [
    "pdf",
    "Pdf",
    "pdfBase64",
    "PdfBase64",
    "base64",
    "Base64",
    "content",
    "Content",
    "file",
    "File",
    "url",
    "Url",
    "downloadUrl",
    "DownloadUrl",
  ];

  return getString(data, keys);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getString(data: unknown, keys: string[]): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key] as string;
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
