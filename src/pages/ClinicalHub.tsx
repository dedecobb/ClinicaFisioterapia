import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import {
  ArrowLeft,
  Mic,
  MicOff,
  FileText,
  Plus,
  Paperclip,
  History,
  Activity,
  Save,
  Trash2,
  Loader2,
  AlertCircle,
  User,
  Edit3,
  X,
  Check,
  ChevronDown,
  Phone,
  Mail,
  Calendar,
  ClipboardList,
  Shield,
  Download,
  ExternalLink,
  File,
  Image,
  FileArchive,
} from "lucide-react";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { messages } from "../i18n";
import { UploadExameModal } from "../components/modals/UploadExameModal";
import { ProtocolosModal } from "../components/modals/ProtocolosModal";
import {
  Documento,
  Evolution,
  Patient,
  PatientAddress,
  PatientAppointment,
  Profile,
  addAttachmentsToEvolution,
  calcularIdade,
  createEvolution,
  deleteEvolution,
  extrairDocumentos,
  formatarData,
  formatarDataNascimento,
  formatarHora,
  getAppointmentsByPatient,
  getEvolutionsByPatient,
  getPatientById,
  getProfiles,
  updateEvolution,
} from "../services/evolutionService";

// ── Tipos de aba ──────────────────────────────────────────────────────────────
type Tab = "timeline" | "agenda" | "details" | "files";

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type BrowserSpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  presenca_registrada: "Presença registrada",
  ausencia_justificada: "Ausência justificada",
  falta: "Falta",
  reposicao: "Reposição",
  cancelada: "Cancelada",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function procedureQuantity(procedure: { quantity?: number | string | null }) {
  return Number(procedure.quantity) || 1;
}

function procedureTotal(procedure: {
  agreed_value: number | string;
  quantity?: number | string | null;
}) {
  return (Number(procedure.agreed_value) || 0) * procedureQuantity(procedure);
}

function formatProcedures(
  procedures:
    | Array<{ name: string; quantity?: number | string | null }>
    | null
    | undefined,
) {
  return (procedures ?? [])
    .map((procedure) => {
      const quantity = procedureQuantity(procedure);
      return `${procedure.name}${quantity > 1 ? ` (${quantity}x)` : ""}`;
    })
    .join(", ");
}

function formatAppointmentProcedures(
  appointment: PatientAppointment,
  patientProcedures: Patient["procedures"],
) {
  if (!appointment.package_id) {
    return appointment.type?.trim() || formatProcedures(patientProcedures);
  }

  return formatProcedures(
    appointment.lesson_packages?.procedure_credits ?? patientProcedures,
  );
}

function formatPatientAddress(
  address: PatientAddress | string | null | undefined,
): string {
  if (!address) return "";
  if (typeof address === "string") return address;

  const streetAndNumber = [address.street, address.number]
    .filter(Boolean)
    .join(", ");
  const cityAndState = [address.city?.name, address.state]
    .filter(Boolean)
    .join(" - ");
  const cep = address.postalCode ? `CEP ${address.postalCode}` : "";

  return [
    streetAndNumber,
    address.district,
    cityAndState,
    cep,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── Ícone por extensão de arquivo ─────────────────────────────────────────────
function IconeArquivo({ url, size = 18 }: { url: string; size?: number }) {
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
    return <Image size={size} />;
  if (["zip", "rar"].includes(ext)) return <FileArchive size={size} />;
  return <File size={size} />;
}

// ─────────────────────────────────────────────────────────────────────────────
export const ClinicalHub = () => {
  const { id: patientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, profile } = useAuth();

  // ── Dados ────────────────────────────────────────────────────────────────────
  const [patient, setPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const documentos: Documento[] = extrairDocumentos(evolutions);

  // ── UI: nova evolução ────────────────────────────────────────────────────────
  const [evolutionText, setEvolutionText] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // ── UI: modais ───────────────────────────────────────────────────────────────
  const [uploadAberto, setUploadAberto] = useState(false);
  const [protocolosAberto, setProtocolosAberto] = useState(false);

  // ── UI: abas ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("timeline");

  // ── Loading / erros ──────────────────────────────────────────────────────────
  const [loadingPage, setLoadingPage] = useState(true);
  const [savingEvol, setSavingEvol] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Edição inline ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const evolutionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Voz ─────────────────────────────────────────────────────────────────────
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!patientId) return;
    setLoadingPage(true);
    setPageError(null);
    try {
      const [pat, evols, profs, appts] = await Promise.all([
        getPatientById(patientId),
        getEvolutionsByPatient(patientId),
        getProfiles(),
        getAppointmentsByPatient(patientId),
      ]);
      if (!pat) {
        setPageError("Paciente não encontrado.");
        return;
      }
      if (
        profile?.role === "physio" &&
        pat.responsible_professional_id !== profile.id
      ) {
        setPageError("Este prontuário não está vinculado à sua agenda.");
        return;
      }
      setPatient(pat);
      setEvolutions(evols);
      setProfiles(profs);
      setAppointments(appts);
      if (session?.user?.id) setSelectedProfile(session.user.id);
    } catch (err: unknown) {
      setPageError(
        err instanceof Error ? err.message : "Erro ao carregar dados.",
      );
    } finally {
      setLoadingPage(false);
    }
  }, [patientId, session, profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Web Speech API ───────────────────────────────────────────────────────────
  const toggleRecording = () => {
    const browserWindow = window as BrowserSpeechRecognitionWindow;
    const SpeechRec =
      browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;

    if (!SpeechRec) {
      alert(
        "Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.",
      );
      return;
    }
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }
    const r = new SpeechRec();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: SpeechRecognitionEventLike) => {
      const transcript = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      setEvolutionText((p) => (p ? `${p} ${transcript}` : transcript));
    };
    r.onerror = r.onend = () => setIsRecording(false);
    recognitionRef.current = r;
    r.start();
    setIsRecording(true);
  };

  // ── Protocolo inserido ───────────────────────────────────────────────────────
  const handleInserirProtocolo = (texto: string) => {
    setEvolutionText((prev) => (prev ? `${prev}\n\n${texto}` : texto));
  };

  // ── Salvar evolução ──────────────────────────────────────────────────────────
  const handleSaveEvolution = async () => {
    if (!evolutionText.trim() || !patientId) return;
    setSavingEvol(true);
    setSaveError(null);
    try {
      const nova = await createEvolution({
        patient_id: patientId,
        professional_id: selectedProfile || null,
        content: evolutionText.trim(),
      });
      setEvolutions((prev) => [nova, ...prev]);
      setEvolutionText("");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSavingEvol(false);
    }
  };

  // ── Upload de exames inline (botão "Anexar Exame" no formulário) ─────────────
  // Estratégia: cria/atualiza a evolução mais recente OU a que está sendo escrita
  const handleAnexarUrls = async (urls: string[]) => {
    if (!patientId) return;
    // Se já existe ao menos uma evolução, adiciona na mais recente
    if (evolutions.length > 0) {
      const maisRecente = evolutions[0];
      try {
        const updated = await addAttachmentsToEvolution(
          maisRecente.id,
          urls,
          maisRecente.attachments,
        );
        setEvolutions((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e)),
        );
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erro ao anexar arquivos.");
      }
    } else {
      // Nenhuma evolução ainda: cria uma com os anexos
      try {
        const nova = await createEvolution({
          patient_id: patientId,
          professional_id: selectedProfile || null,
          content: evolutionText.trim() || "Exames anexados.",
          attachments: urls,
        });
        setEvolutions((prev) => [nova, ...prev]);
        if (evolutionText.trim()) setEvolutionText("");
      } catch (err: unknown) {
        alert(
          err instanceof Error
            ? err.message
            : "Erro ao criar evolução com anexos.",
        );
      }
    }
  };

  // ── Excluir evolução ─────────────────────────────────────────────────────────
  const handleDeleteEvolution = async (id: string) => {
    if (
      !window.confirm(
        "Deseja excluir esta evolução? Esta ação não pode ser desfeita.",
      )
    )
      return;
    setDeletingId(id);
    try {
      await deleteEvolution(id);
      setEvolutions((prev) => prev.filter((e) => e.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Edição inline ────────────────────────────────────────────────────────────
  const startEdit = (ev: Evolution) => {
    setEditingId(ev.id);
    setEditingText(ev.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };
  const saveEdit = async (id: string) => {
    if (!editingText.trim()) return;
    try {
      const updated = await updateEvolution(id, editingText.trim());
      setEvolutions((prev) => prev.map((e) => (e.id === id ? updated : e)));
      cancelEdit();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  };

  // ── Loading / erro ────────────────────────────────────────────────────────────
  if (loadingPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={32} className="animate-spin text-brand-500" />
          <span className="text-sm font-medium">Carregando prontuário...</span>
        </div>
      </div>
    );
  }

  if (pageError || !patient) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle size={40} className="text-rose-400" />
          <p className="font-semibold text-slate-900 dark:text-white">
            {pageError ?? "Paciente não encontrado."}
          </p>
          <Button onClick={() => navigate("/pacientes")}>
            <ArrowLeft size={16} /> Voltar para Pacientes
          </Button>
        </div>
      </div>
    );
  }

  const idade = calcularIdade(patient.birth_date);
  const appointmentSummary = (() => {
    const presencas = appointments.filter(
      (item) => item.status === "presenca_registrada",
    ).length;
    const faltas = appointments.filter((item) => item.status === "falta").length;
    const justificadas = appointments.filter(
      (item) => item.status === "ausencia_justificada",
    ).length;
    const reposicoes = appointments.filter(
      (item) => item.status === "reposicao",
    ).length;
    const canceladas = appointments.filter(
      (item) => item.status === "cancelada",
    ).length;
    const totalContratado =
      appointments.find((item) => item.lesson_packages?.total_lessons)
        ?.lesson_packages?.total_lessons ?? 0;
    const consumidas = presencas + faltas;

    return {
      totalContratado,
      presencas,
      faltas,
      justificadas,
      reposicoes,
      canceladas,
      restantes: Math.max(totalContratado - consumidas, 0),
    };
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Modais ── */}
      <UploadExameModal
        aberto={uploadAberto}
        patientId={patientId!}
        onFechar={() => setUploadAberto(false)}
        onAnexar={handleAnexarUrls}
      />
      <ProtocolosModal
        aberto={protocolosAberto}
        onFechar={() => setProtocolosAberto(false)}
        onInserir={handleInserirProtocolo}
      />

      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        {/* ── Cabeçalho ── */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/pacientes")}
              className="p-2 hover:bg-white dark:hover:bg-slate-900 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400 font-bold text-lg">
                {patient.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                  {patient.full_name}
                </h1>
                <p className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                  {patient.cpf && <span>CPF: {patient.cpf}</span>}
                  {idade !== null && (
                    <>
                      {patient.cpf && (
                        <span className="text-slate-300 dark:text-slate-700">
                          •
                        </span>
                      )}
                      <span>{idade} anos</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="success">Ativo</Badge>
            {patient.status && <Badge variant="info">{patient.status}</Badge>}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Coluna principal ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* ── Nova Evolução ── */}
            <Card
              title="Nova Evolução Clínica"
              subtitle="Registre o progresso da sessão de hoje"
            >
              <div className="space-y-4">
                {/* Seletor de profissional */}
                {profiles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-slate-400 flex-shrink-0" />
                    <div className="relative flex-1">
                      <select
                        className="w-full appearance-none bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-brand-500 outline-none pr-8"
                        value={selectedProfile}
                        onChange={(e) => setSelectedProfile(e.target.value)}
                      >
                        <option value="">Profissional responsável</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>
                )}

                {/* Textarea + microfone */}
                <div className="relative">
                  <textarea
                    ref={evolutionTextareaRef}
                    translate="no"
                    className="w-full h-48 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none text-slate-700 dark:text-slate-300 text-sm"
                    placeholder={messages.clinicalHub.evolutionPlaceholder}
                    value={evolutionText}
                    onChange={(e) => setEvolutionText(e.target.value)}
                  />
                  <div className="absolute bottom-4 right-4">
                    <button
                      type="button"
                      onClick={toggleRecording}
                      title={
                        isRecording
                          ? "Parar gravação"
                          : "Iniciar ditado por voz"
                      }
                      className={clsx(
                        "p-3 rounded-full transition-all shadow-lg",
                        isRecording
                          ? "bg-rose-500 text-white animate-pulse"
                          : "bg-white dark:bg-slate-900 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30",
                      )}
                    >
                      {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                  </div>
                  {isRecording && (
                    <div className="absolute top-3 left-4 flex items-center gap-2 text-rose-500 text-xs font-semibold">
                      <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                      Gravando...
                    </div>
                  )}
                </div>

                {saveError && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 dark:text-rose-400 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0" />{" "}
                    {saveError}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {/* ✅ Abre modal de upload */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setUploadAberto(true)}
                    >
                      <Paperclip size={16} /> Anexar Exame
                    </Button>
                    {/* ✅ Abre modal de protocolos */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setProtocolosAberto(true)}
                    >
                      <Activity size={16} /> Protocolos
                    </Button>
                  </div>
                  <Button
                    className="gap-2 px-8"
                    onClick={handleSaveEvolution}
                    disabled={savingEvol || !evolutionText.trim()}
                  >
                    {savingEvol ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />{" "}
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save size={16} /> Salvar Evolução
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>

            {/* ── Abas ── */}
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: "timeline", label: "Linha do Tempo", icon: History },
                  { id: "agenda", label: "Histórico de Aulas", icon: Calendar },
                  { id: "details", label: "Ficha Clínica", icon: FileText },
                  {
                    id: "files",
                    label: `Documentos${documentos.length > 0 ? ` (${documentos.length})` : ""}`,
                    icon: Paperclip,
                  },
                ] as { id: Tab; label: string; icon: React.ElementType }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                    activeTab === tab.id
                      ? "text-brand-600"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                  )}
                >
                  <tab.icon size={16} />
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* ── Conteúdo das abas ── */}
            <AnimatePresence mode="wait">
              {/* Timeline */}
              {activeTab === "timeline" && (
                <motion.div
                  key="timeline"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {evolutions.length === 0 ? (
                    <EmptyState
                      icon={History}
                      titulo="Nenhuma evolução registrada"
                      sub="Adicione a primeira evolução acima."
                    />
                  ) : (
                    <div className="relative pl-8 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                      {evolutions.map((ev) => (
                        <div key={ev.id} className="relative">
                          <div className="absolute -left-[29px] top-1 w-6 h-6 rounded-full bg-white dark:bg-slate-950 border-4 border-brand-500 z-10" />
                          <Card className="hover:border-brand-200 dark:hover:border-brand-800 transition-all">
                            {editingId === ev.id ? (
                              <div className="space-y-3">
                                <textarea
                                  className="w-full h-36 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 resize-none focus:ring-2 focus:ring-brand-500 outline-none"
                                  value={editingText}
                                  onChange={(e) =>
                                    setEditingText(e.target.value)
                                  }
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={cancelEdit}
                                    className="gap-1 text-slate-400"
                                  >
                                    <X size={14} /> Cancelar
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => saveEdit(ev.id)}
                                    className="gap-1"
                                  >
                                    <Check size={14} /> Salvar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
                                        Evolução
                                      </span>
                                      <span className="text-xs text-slate-400">
                                        •
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        {formatarData(ev.created_at)} às{" "}
                                        {formatarHora(ev.created_at)}
                                      </span>
                                    </div>
                                    {ev.profiles?.full_name && (
                                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                        <User size={11} />{" "}
                                        {ev.profiles.full_name}
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant="neutral">Fisioterapia</Badge>
                                </div>

                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                                  {ev.content}
                                </p>

                                {/* Anexos da evolução */}
                                {ev.attachments &&
                                  ev.attachments.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {ev.attachments.map((url, i) => (
                                        <a
                                          key={i}
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-brand-600 hover:bg-brand-50 transition-colors"
                                        >
                                          <Paperclip size={11} />
                                          {url
                                            .split("/")
                                            .pop()
                                            ?.replace(/^\d+_/, "") ??
                                            `Arquivo ${i + 1}`}
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                <div className="mt-4 flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1.5 text-slate-400 hover:text-slate-700"
                                    onClick={() => startEdit(ev)}
                                  >
                                    <Edit3 size={14} /> Editar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1.5 text-rose-400 hover:text-rose-600"
                                    onClick={() => handleDeleteEvolution(ev.id)}
                                    disabled={deletingId === ev.id}
                                  >
                                    {deletingId === ev.id ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                    Excluir
                                  </Button>
                                </div>
                              </>
                            )}
                          </Card>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Histórico de Aulas */}
              {activeTab === "agenda" && (
                <motion.div
                  key="agenda"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Contratadas
                      </p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {appointmentSummary.totalContratado}
                      </p>
                    </Card>
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Restantes
                      </p>
                      <p className="text-2xl font-bold text-brand-600">
                        {appointmentSummary.restantes}
                      </p>
                    </Card>
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Presenças
                      </p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {appointmentSummary.presencas}
                      </p>
                    </Card>
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Faltas
                      </p>
                      <p className="text-2xl font-bold text-rose-600">
                        {appointmentSummary.faltas}
                      </p>
                    </Card>
                  </div>

                  <Card title="Histórico completo da agenda">
                    {appointments.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nenhuma aula gerada para este paciente ainda.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {appointments.map((appointment) => {
                          const procedures = formatAppointmentProcedures(
                            appointment,
                            patient.procedures,
                          );
                          const appointmentKind = appointment.package_id
                            ? "Sessão"
                            : "Procedimento";

                          return (
                            <div
                              key={appointment.id}
                              className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4"
                            >
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                                    {formatarData(appointment.start_time)} às{" "}
                                    {formatarHora(appointment.start_time)}
                                  </span>
                                  <Badge
                                    variant={
                                      appointment.status ===
                                        "presenca_registrada" ||
                                      appointment.status === "confirmada"
                                        ? "success"
                                        : appointment.status === "falta" ||
                                            appointment.status === "cancelada"
                                          ? "danger"
                                          : "warning"
                                    }
                                  >
                                    {APPOINTMENT_STATUS_LABEL[
                                      appointment.status
                                    ] ?? appointment.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {appointmentKind}{" "}
                                  {appointment.package_lesson_number ?? "avulsa"}
                                  {appointment.lesson_packages?.total_lessons
                                    ? `/${appointment.lesson_packages.total_lessons}`
                                    : ""}{" "}
                                  ·{" "}
                                  {appointment.profiles?.full_name ??
                                    "Sem profissional"}
                                </p>
                                {procedures && (
                                  <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                    Procedimentos: {procedures}
                                  </p>
                                )}
                                {appointment.notes && (
                                  <p className="text-xs text-slate-400 mt-1">
                                    {appointment.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Ausências justificadas
                      </p>
                      <p className="text-xl font-bold text-amber-600">
                        {appointmentSummary.justificadas}
                      </p>
                    </Card>
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Reposições
                      </p>
                      <p className="text-xl font-bold text-blue-600">
                        {appointmentSummary.reposicoes}
                      </p>
                    </Card>
                    <Card>
                      <p className="text-xs font-semibold text-slate-400 uppercase">
                        Canceladas
                      </p>
                      <p className="text-xl font-bold text-slate-600">
                        {appointmentSummary.canceladas}
                      </p>
                    </Card>
                  </div>
                </motion.div>
              )}

              {/* Ficha Clínica */}
              {activeTab === "details" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card title="Dados do Paciente">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InfoField
                        icon={User}
                        label="Nome completo"
                        value={patient.full_name}
                      />
                      <InfoField
                        icon={Calendar}
                        label="Nascimento"
                        value={`${formatarDataNascimento(patient.birth_date)}${idade ? ` (${idade} anos)` : ""}`}
                      />
                      <InfoField
                        icon={Phone}
                        label="Telefone"
                        value={patient.phone ?? "—"}
                      />
                      <InfoField
                        icon={Mail}
                        label="E-mail"
                        value={patient.email ?? "—"}
                      />
                      <InfoField
                        icon={Shield}
                        label="CPF"
                        value={patient.cpf ?? "—"}
                      />
                      <InfoField
                        icon={User}
                        label="Gênero"
                        value={patient.gender ?? "—"}
                      />
                      {patient.procedures && patient.procedures.length > 0 && (
                        <div className="sm:col-span-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4">
                          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                            <ClipboardList size={16} />
                            <span>Créditos de procedimentos</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {patient.procedures.map((procedure) => (
                              <div
                                key={procedure.type}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-950"
                              >
                                <span className="truncate text-slate-600 dark:text-slate-300">
                                  {procedure.name}
                                  <span className="ml-1 text-xs text-slate-400">
                                    ({procedureQuantity(procedure)}x)
                                  </span>
                                </span>
                                <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                                  {currencyFormatter.format(procedureTotal(procedure))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {patient.address && (
                        <div className="sm:col-span-2">
                          <InfoField
                            icon={FileText}
                            label="Endereço"
                            value={formatPatientAddress(patient.address)}
                          />
                        </div>
                      )}
                      {patient.clinical_notes && (
                        <div className="sm:col-span-2">
                          <InfoField
                            icon={FileText}
                            label="Observações Clínicas"
                            value={patient.clinical_notes}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Documentos */}
              {activeTab === "files" && (
                <motion.div
                  key="files"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {documentos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                        <Paperclip size={28} className="text-slate-400" />
                      </div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Nenhum documento ainda
                      </p>
                      <p className="text-sm text-slate-400 mt-1 mb-5 max-w-xs">
                        Use "Anexar Exame" na área de nova evolução para
                        adicionar arquivos.
                      </p>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setUploadAberto(true)}
                      >
                        <Plus size={16} /> Adicionar Documento
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documentos.map((doc, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-brand-200 dark:hover:border-brand-800 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
                            <IconeArquivo url={doc.url} size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {doc.nome}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {formatarData(doc.evolutionDate)} •{" "}
                              {doc.profissional}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-brand-600 transition-colors"
                              title="Abrir"
                            >
                              <ExternalLink size={15} />
                            </a>
                            <a
                              href={doc.url}
                              download
                              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-brand-600 transition-colors"
                              title="Download"
                            >
                              <Download size={15} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Coluna lateral ── */}
          <div className="space-y-6">
            {/* Informações */}
            <Card title="Informações">
              <div className="space-y-3">
                <QuickInfo label="Telefone" value={patient.phone ?? "—"} />
                <QuickInfo label="E-mail" value={patient.email ?? "—"} />
                <QuickInfo label="Gênero" value={patient.gender ?? "—"} />
                {patient.birth_date && (
                  <QuickInfo
                    label="Nascimento"
                    // ✅ Usa formatarDataNascimento para evitar o bug de timezone
                    value={`${formatarDataNascimento(patient.birth_date)}${idade ? ` (${idade} anos)` : ""}`}
                  />
                )}
              </div>
            </Card>

            {/* Estatísticas */}
            <Card title="Evoluções">
              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Total" value={evolutions.length} color="blue" />
                <StatBox
                  label="Este mês"
                  value={
                    evolutions.filter((e) => {
                      const d = new Date(e.created_at),
                        now = new Date();
                      return (
                        d.getMonth() === now.getMonth() &&
                        d.getFullYear() === now.getFullYear()
                      );
                    }).length
                  }
                  color="emerald"
                />
              </div>
              {evolutions.length > 0 && (
                <p className="text-xs text-slate-400 mt-3">
                  Última em {formatarData(evolutions[0].created_at)}
                </p>
              )}
            </Card>

            {/* Ações rápidas */}
            <Card title="Ações Rápidas">
              <div className="space-y-2">
                {/* ✅ Abre modal de upload */}
                <Button
                  variant="outline"
                  className="w-full gap-2 justify-start text-sm"
                  onClick={() => setUploadAberto(true)}
                >
                  <Paperclip size={16} /> {messages.clinicalHub.quickActions.addExam}
                </Button>

                {/* ✅ Vai direto para aba de documentos */}
                <Button
                  variant="outline"
                  className="w-full gap-2 justify-start text-sm"
                  onClick={() => setActiveTab("files")}
                >
                  <FileText size={16} /> {messages.clinicalHub.quickActions.viewDocuments}
                  {documentos.length > 0 && (
                    <span className="ml-auto bg-brand-100 text-brand-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {documentos.length}
                    </span>
                  )}
                </Button>

                {/* ✅ Foca no textarea para escrever uma evolução */}
                <Button
                  variant="outline"
                  className="w-full gap-2 justify-start text-sm"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    setTimeout(
                      () => evolutionTextareaRef.current?.focus(),
                      400,
                    );
                  }}
                >
                  <Plus size={16} /> {messages.clinicalHub.quickActions.newEvolution}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

const InfoField = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) => (
  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={13} className="text-slate-400" />
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
        {label}
      </p>
    </div>
    <p className="text-sm font-medium text-slate-900 dark:text-white">
      {value}
    </p>
  </div>
);

const QuickInfo = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-400 font-medium">{label}</span>
    <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[55%] text-right">
      {value}
    </span>
  </div>
);

const StatBox = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "emerald";
}) => {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50 text-blue-600",
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50 text-emerald-600",
  };
  return (
    <div className={clsx("p-3 rounded-xl border", colors[color])}>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
        {value}
      </p>
    </div>
  );
};

const EmptyState = ({
  icon: Icon,
  titulo,
  sub,
}: {
  icon: React.ElementType;
  titulo: string;
  sub: string;
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
      <Icon size={28} className="text-slate-400" />
    </div>
    <p className="font-semibold text-slate-700 dark:text-slate-300">{titulo}</p>
    <p className="text-sm text-slate-400 mt-1">{sub}</p>
  </div>
);
