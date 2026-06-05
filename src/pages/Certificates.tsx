import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  ClipboardCheck,
  FileText,
  Loader2,
  Printer,
  Stethoscope,
  User,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type CertificateKind = "comparecimento" | "afastamento";

type PatientOption = {
  id: string;
  full_name: string;
  cpf: string | null;
};

type ProfessionalOption = {
  id: string;
  full_name: string;
  role: string | null;
};

type ClinicInfo = {
  name: string;
};

const kindLabel: Record<CertificateKind, string> = {
  comparecimento: "Comparecimento",
  afastamento: "Afastamento",
};

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateBr(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cpfText(cpf: string | null): string {
  return cpf ? `, CPF ${cpf}` : "";
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function patientOptionLabel(patient: PatientOption): string {
  return patient.cpf
    ? `${patient.full_name} - ${patient.cpf}`
    : patient.full_name;
}

export const Certificates = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [patientId, setPatientId] = useState(
    searchParams.get("patientId") ?? "",
  );
  const [patientSearch, setPatientSearch] = useState("");
  const [professionalId, setProfessionalId] = useState(profile?.id ?? "");
  const [professionalRegistry, setProfessionalRegistry] = useState("");
  const [kind, setKind] = useState<CertificateKind>("comparecimento");
  const [issueDate, setIssueDate] = useState(today());
  const [attendanceDate, setAttendanceDate] = useState(today());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:50");
  const [restDays, setRestDays] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPatientId(searchParams.get("patientId") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (profile?.id && !professionalId) {
      setProfessionalId(profile.id);
    }
  }, [professionalId, profile?.id]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!profile?.clinic_id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const [clinicResult, patientsResult, professionalsResult] =
        await Promise.all([
          supabase
            .from("clinics")
            .select("name")
            .eq("id", profile.clinic_id)
            .single(),
          supabase
            .from("patients")
            .select("id, full_name, cpf")
            .eq("clinic_id", profile.clinic_id)
            .order("full_name", { ascending: true }),
          supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("clinic_id", profile.clinic_id)
            .in("role", ["admin", "physio"])
            .order("full_name", { ascending: true }),
        ]);

      if (!active) return;

      const failed = [clinicResult, patientsResult, professionalsResult].find(
        (result) => result.error,
      );

      if (failed?.error) {
        setError(failed.error.message);
        setLoading(false);
        return;
      }

      const loadedProfessionals = (professionalsResult.data ??
        []) as ProfessionalOption[];

      setClinic((clinicResult.data ?? null) as ClinicInfo | null);
      setPatients((patientsResult.data ?? []) as PatientOption[]);
      setProfessionals(loadedProfessionals);

      if (!professionalId) {
        const defaultProfessional =
          loadedProfessionals.find((item) => item.id === profile.id) ??
          loadedProfessionals.find((item) => item.role === "physio") ??
          loadedProfessionals[0];
        setProfessionalId(defaultProfessional?.id ?? "");
      }

      setLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, [professionalId, profile?.clinic_id, profile?.id]);

  const selectedPatient = patients.find((patient) => patient.id === patientId);
  const selectedProfessional = professionals.find(
    (professional) => professional.id === professionalId,
  );

  useEffect(() => {
    if (!selectedPatient) return;
    setPatientSearch(patientOptionLabel(selectedPatient));
  }, [selectedPatient]);

  // Auto-preencher CREFITO de Cristiane Carrasco
  useEffect(() => {
    if (!selectedProfessional) return;
    if (selectedProfessional.full_name.toLowerCase().includes("cristiane")) {
      setProfessionalRegistry("26235/MT");
    }
  }, [selectedProfessional]);

  const findPatientBySearch = (value: string): PatientOption | undefined => {
    const normalizedValue = normalizeSearch(value);
    if (!normalizedValue) return undefined;

    const exactByLabel = patients.find(
      (patient) =>
        normalizeSearch(patientOptionLabel(patient)) === normalizedValue,
    );
    if (exactByLabel) return exactByLabel;

    const exactByName = patients.filter(
      (patient) => normalizeSearch(patient.full_name) === normalizedValue,
    );
    return exactByName.length === 1 ? exactByName[0] : undefined;
  };

  const handlePatientSearchChange = (value: string) => {
    setPatientSearch(value);
    setPatientId(findPatientBySearch(value)?.id ?? "");
  };

  const certificateText = useMemo(() => {
    if (!selectedPatient || !selectedProfessional) return "";

    const patient = `${selectedPatient.full_name}${cpfText(selectedPatient.cpf)}`;
    const noteText = notes.trim() ? ` Observação: ${notes.trim()}` : "";

    if (kind === "afastamento") {
      return `Atesto, para os devidos fins, que ${patient} foi atendido(a) nesta clínica em contexto de cuidado fisioterapêutico, em ${formatDateBr(attendanceDate)}, e, por motivo de saúde, necessita de afastamento de suas atividades por ${restDays} dia(s), a contar desta data.${noteText}`;
    }

    return `Atesto, para os devidos fins, que ${patient} compareceu a esta clínica para atendimento em saúde, em acompanhamento fisioterapêutico, no dia ${formatDateBr(attendanceDate)}, permanecendo em atendimento no horário de ${startTime} às ${endTime}.${noteText}`;
  }, [
    attendanceDate,
    endTime,
    kind,
    notes,
    restDays,
    selectedPatient,
    selectedProfessional,
    startTime,
  ]);

  const printCertificate = () => {
    if (!selectedPatient || !selectedProfessional) {
      setError("Selecione paciente e fisioterapeuta para gerar o atestado.");
      return;
    }

    const receiptWindow = window.open("", "_blank");
    if (!receiptWindow) return;
    receiptWindow.opener = null;

    const clinicName = clinic?.name ?? "Clínica";
    const professionalName = selectedProfessional.full_name;
    const registry = professionalRegistry.trim();

    receiptWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Atestado - ${escapeHtml(selectedPatient.full_name)}</title>
          <style>
            @page { size: A4; margin: 22mm; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
            .page { min-height: 250mm; display: flex; flex-direction: column; }
            header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 18px; }
            .clinic { font-size: 20px; font-weight: 700; }
            .meta { font-size: 12px; color: #64748b; text-align: right; }
            h1 { margin: 52px 0 34px; text-align: center; font-size: 24px; letter-spacing: 0.12em; text-transform: uppercase; }
            .content { font-size: 17px; line-height: 1.8; text-align: justify; flex: 1; }
            .date { margin-top: 34px; text-align: right; font-size: 15px; }
            .signature { margin: 76px auto 0; width: 360px; text-align: center; }
            .signature-name { font-family: "Brush Script MT", "Segoe Script", cursive; font-size: 36px; line-height: 1; color: #0f172a; }
            .signature-line { border-top: 1px solid #0f172a; margin-top: 10px; padding-top: 8px; }
            .professional { font-size: 14px; font-weight: 700; }
            .registry { margin-top: 2px; font-size: 12px; color: #475569; }
          </style>
        </head>
        <body>
          <main class="page">
            <header>
              <div>
                <div class="clinic">${escapeHtml(clinicName)}</div>
                <div class="meta">Atestado gerado pelo sistema</div>
              </div>
              <div class="meta">
                Tipo: ${escapeHtml(kindLabel[kind])}<br />
                Emissão: ${escapeHtml(formatDateBr(issueDate))}
              </div>
            </header>
            <h1>Atestado</h1>
            <section class="content">${escapeHtml(certificateText)}</section>
            <p class="date">${escapeHtml(clinicName)}, ${escapeHtml(formatDateBr(issueDate))}.</p>
            <section class="signature">
              <div class="signature-name">${escapeHtml(professionalName)}</div>
              <div class="signature-line">
                <div class="professional">${escapeHtml(professionalName)}</div>
                <div class="registry">${escapeHtml(registry || "Fisioterapeuta responsável")}</div>
              </div>
            </section>
          </main>
          <script>
            window.addEventListener("load", () => {
              window.print();
            });
          </script>
        </body>
      </html>
    `);
    receiptWindow.document.close();
    receiptWindow.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    printCertificate();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Atestados
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gere atestados com assinatura da fisioterapeuta.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={printCertificate}
          disabled={!selectedPatient || !selectedProfessional}
        >
          <Printer size={18} /> Imprimir / PDF
        </Button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p>Carregando dados...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
          <Card title="Dados do atestado">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Paciente
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    required
                    list="certificate-patient-options"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    placeholder="Digite o nome do paciente"
                    value={patientSearch}
                    onChange={(event) =>
                      handlePatientSearchChange(event.target.value)
                    }
                    autoComplete="off"
                  />
                  <datalist id="certificate-patient-options">
                    {patients.map((patient) => (
                      <option
                        key={patient.id}
                        value={patientOptionLabel(patient)}
                      />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Fisioterapeuta
                </label>
                <div className="relative">
                  <Stethoscope
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <select
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={professionalId}
                    onChange={(event) => setProfessionalId(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Registro profissional
                </label>
                <input
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="CREFITO..."
                  value={professionalRegistry}
                  onChange={(event) =>
                    setProfessionalRegistry(event.target.value)
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold cursor-pointer ${
                    kind === "comparecimento"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900"
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="kind"
                    checked={kind === "comparecimento"}
                    onChange={() => setKind("comparecimento")}
                  />
                  Comparecimento
                </label>
                <label
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold cursor-pointer ${
                    kind === "afastamento"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900"
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="kind"
                    checked={kind === "afastamento"}
                    onChange={() => setKind("afastamento")}
                  />
                  Afastamento
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Data de emissão
                  </label>
                  <div className="relative">
                    <Calendar
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      type="date"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={issueDate}
                      onChange={(event) => setIssueDate(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Data do atendimento
                  </label>
                  <div className="relative">
                    <ClipboardCheck
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      type="date"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={attendanceDate}
                      onChange={(event) =>
                        setAttendanceDate(event.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              {kind === "comparecimento" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Início
                    </label>
                    <input
                      type="time"
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Fim
                    </label>
                    <input
                      type="time"
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Dias de afastamento
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={restDays}
                    onChange={(event) =>
                      setRestDays(Number(event.target.value))
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Observação
                </label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <Button type="submit" className="w-full gap-2">
                <Printer size={18} /> Gerar atestado
              </Button>
            </form>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center gap-2">
              <FileText size={18} className="text-slate-400" />
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Prévia do documento
              </h3>
            </div>
            <div className="bg-slate-100 dark:bg-slate-950 p-4 sm:p-8">
              <div className="mx-auto min-h-[760px] max-w-[760px] bg-white text-slate-900 shadow-sm border border-slate-200 p-10 sm:p-14 flex flex-col">
                <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-xl font-bold">
                      {clinic?.name ?? "Clínica"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Atestado gerado pelo sistema
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>Tipo: {kindLabel[kind]}</p>
                    <p>Emissão: {formatDateBr(issueDate)}</p>
                  </div>
                </div>

                <h2 className="mt-14 mb-10 text-center text-2xl font-bold uppercase tracking-[0.12em]">
                  Atestado
                </h2>

                <p className="flex-1 text-[17px] leading-8 text-justify">
                  {certificateText ||
                    "Selecione paciente e fisioterapeuta para gerar a prévia do atestado."}
                </p>

                <p className="mt-10 text-right text-sm">
                  {clinic?.name ?? "Clínica"}, {formatDateBr(issueDate)}.
                </p>

                <div className="mx-auto mt-20 w-full max-w-[360px] text-center">
                  <p className="font-[cursive] text-4xl leading-none">
                    {selectedProfessional?.full_name ?? "Assinatura"}
                  </p>
                  <div className="mt-3 border-t border-slate-900 pt-2">
                    <p className="text-sm font-bold">
                      {selectedProfessional?.full_name ?? "Fisioterapeuta"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {professionalRegistry || "Fisioterapeuta responsável"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
