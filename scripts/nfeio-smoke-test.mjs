import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function loadEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const apiKey = process.env.NFEIO_API_KEY ?? process.env.NFEIO_INVOICE_KEY;
const companyId = process.env.NFEIO_COMPANY_ID;
const serviceBaseUrl = trimTrailingSlash(
  process.env.NFEIO_BASE_URL ?? "https://api.nfe.io",
);
const managementBaseUrl = trimTrailingSlash(
  process.env.NFEIO_MANAGEMENT_BASE_URL ?? "https://api.nfse.io",
);

if (!apiKey || !companyId) {
  console.error(
    "Configure NFEIO_API_KEY e NFEIO_COMPANY_ID em .env.local ou no ambiente antes de rodar.",
  );
  process.exit(1);
}

console.log("NFe.io smoke test");
console.log(`Empresa: ${companyId}`);
console.log(`API fiscal: ${serviceBaseUrl}`);
console.log("Este teste nao emite nota fiscal.");

if (companyId.startsWith("acc_")) {
  console.log(
    "AVISO: NFEIO_COMPANY_ID comeca com acc_. Isso normalmente e AccountId; para emitir use o Company.Id.",
  );
}

await checkCompaniesList();

await checkEndpoint(
  "Empresa cadastrada",
  `${managementBaseUrl}/v2/companies/${encodeURIComponent(companyId)}`,
  false,
);

await checkServiceInvoicesList();

async function checkCompaniesList() {
  const response = await safeFetch(`${managementBaseUrl}/v2/companies?limit=20`, {
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
  });

  if (!response) {
    console.log("AVISO: Listagem de empresas -> nao foi possivel conectar.");
    return;
  }

  const data = await response
    .json()
    .catch(async () => ({ message: await response.text().catch(() => "") }));

  if (!response.ok) {
    console.log(
      `AVISO: Listagem de empresas -> HTTP ${response.status}: ${
        extractMessage(data) || response.statusText
      }`,
    );
    return;
  }

  const companies = getCompanies(data);
  console.log(`OK: Listagem de empresas -> ${companies.length} empresa(s) encontrada(s)`);

  if (companies.length > 0) {
    console.log("Use um destes valores em NFEIO_COMPANY_ID:");
    for (const company of companies.slice(0, 10)) {
      console.log(`- ${company.id}${company.name ? ` (${company.name})` : ""}`);
    }
  }
}

async function checkServiceInvoicesList() {
  await checkEndpoint(
  "Listagem de NFS-e",
  `${serviceBaseUrl}/v1/companies/${encodeURIComponent(companyId)}/serviceinvoices`,
  true,
  );
}

async function checkEndpoint(label, url, required) {
  const response = await safeFetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
  });

  if (!response) {
    const prefix = required ? "FALHOU" : "AVISO";
    console.log(`${prefix}: ${label} -> nao foi possivel conectar.`);
    if (required) process.exitCode = 1;
    return;
  }

  const data = await response
    .json()
    .catch(async () => ({ message: await response.text().catch(() => "") }));

  if (!response.ok) {
    const message = extractMessage(data) || response.statusText;
    const prefix = required ? "FALHOU" : "AVISO";
    console.log(`${prefix}: ${label} -> HTTP ${response.status}: ${message}`);
    if (required) process.exitCode = 1;
    return;
  }

  console.log(`OK: ${label} -> HTTP ${response.status}`);
  console.log(`Resumo: ${summarize(data)}`);
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    console.log(
      `AVISO: falha de rede ao acessar ${new URL(url).hostname}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function extractMessage(data) {
  if (!data || typeof data !== "object") return "";
  const candidates = [
    data.message,
    data.Message,
    data.error,
    data.Error,
    data.detail,
    data.Detail,
    data.title,
    data.Title,
  ];
  return candidates.find((item) => typeof item === "string" && item.trim()) ?? "";
}

function summarize(data) {
  if (Array.isArray(data)) return `${data.length} registro(s) retornado(s)`;
  if (!data || typeof data !== "object") return typeof data;

  const id = data.id ?? data.Id ?? data.companyId ?? data.CompanyId;
  const status = data.status ?? data.Status ?? data.fiscalStatus ?? data.FiscalStatus;
  const items = data.items ?? data.Items ?? data.data ?? data.Data;

  return JSON.stringify({
    id: typeof id === "string" ? id : undefined,
    status: typeof status === "string" ? status : undefined,
    items: Array.isArray(items) ? items.length : undefined,
    keys: Object.keys(data).slice(0, 8),
  });
}

function getCompanies(data) {
  const candidates = [
    data?.companies,
    data?.Companies,
    data?.data,
    data?.Data,
    data?.items,
    data?.Items,
  ];

  const list = candidates.find(Array.isArray) ?? (Array.isArray(data) ? data : []);
  return list
    .map((item) => {
      const company = item?.Company ?? item?.company ?? item;
      return {
        id: company?.Id ?? company?.id ?? company?.CompanyId ?? company?.companyId,
        name: company?.Name ?? company?.name ?? company?.TradeName ?? company?.tradeName,
      };
    })
    .filter((company) => typeof company.id === "string" && company.id.trim());
}
