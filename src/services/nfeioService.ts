export type NfeioInvoicePayload = {
  invoiceId: string;
  amount: number;
  serviceDescription: string;
  serviceCode: string;
  customer: {
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
  };
};

export type NfeioIssueResult = {
  providerInvoiceId: string | null;
  verificationUrl: string | null;
  rawResponse: unknown;
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

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
