import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  ClipboardList,
  CreditCard,
  Edit3,
  Filter,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Search,
  StickyNote,
  Trash2,
  User,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import { getFisioterapeutas } from "../Agenda/Agendamentoservice";
import { Fisioterapeuta } from "../Agenda/types";
import {
  atualizarPaciente,
  atualizarObservacaoPaciente,
  criarPaciente,
  encerrarPaciente,
  listarPacientes,
  repararAgendamentosPendentes,
  renovarPacotePaciente,
} from "./PacientesService";
import { NovoPacienteModal } from "./NovoPacienteModal";
import { NewPatientForm, Patient, PatientProcedure } from "./types";

const STATUS_LABEL = {
  ativo: "Ativo",
  pausado: "Pausado",
  inadimplente: "Inadimplente",
  encerrado: "Encerrado",
} as const;

const WEEKDAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function formatDateBr(value: string | null | undefined): string {
  if (!value) return "N/A";

  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getProcedureQuantity(procedure: PatientProcedure): number {
  return Number(procedure.quantity) || 1;
}

function getProcedureTotal(procedure: PatientProcedure): number {
  return (Number(procedure.agreed_value) || 0) * getProcedureQuantity(procedure);
}

function getPatientProcedureCredits(patient: Patient): PatientProcedure[] {
  const byType = new Map<string, PatientProcedure>();

  [...(patient.procedures ?? []), ...(patient.lesson_packages?.[0]?.procedure_credits ?? [])]
    .filter((procedure) => procedure.name?.trim())
    .forEach((procedure) => byType.set(procedure.type, procedure));

  return Array.from(byType.values());
}

function getResponsibleProfessionalName(
  patient: Patient,
  professionals: Fisioterapeuta[],
): string {
  if (!patient.responsible_professional_id) return "Sem fisioterapeuta";

  return (
    professionals.find(
      (professional) => professional.id === patient.responsible_professional_id,
    )?.nome ?? "Fisioterapeuta não encontrado"
  );
}

function openWhatsApp(phone: string | null | undefined, message: string) {
  const digits = onlyDigits(phone);
  if (!digits) return;
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  window.open(
    `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

export const PacientesPage = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [professionalFilterId, setProfessionalFilterId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fisioterapeutas, setFisioterapeutas] = useState<Fisioterapeuta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [repairingAppointments, setRepairingAppointments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [renewingPatient, setRenewingPatient] = useState<Patient | null>(null);
  const [editingNotePatientId, setEditingNotePatientId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSavingPatientId, setNoteSavingPatientId] = useState<string | null>(null);
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    let active = true;

    async function fetchPatients() {
      if (!profile?.clinic_id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await listarPacientes(
          profile.clinic_id,
          searchTerm,
          profile,
          isAdmin ? professionalFilterId : "",
        );
        if (active) setPatients(data);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Erro ao carregar pacientes.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    const debounce = window.setTimeout(fetchPatients, 300);

    return () => {
      active = false;
      window.clearTimeout(debounce);
    };
  }, [searchTerm, profile, isAdmin, professionalFilterId]);

  useEffect(() => {
    let active = true;

    getFisioterapeutas(profile)
      .then((data) => {
        if (active) setFisioterapeutas(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar fisioterapeutas.",
        );
      });

    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => {
    let active = true;

    // Recarrega a lista de pacientes quando o modal fecha
    if (!isModalOpen && profile?.clinic_id && !loading) {
      const currentProfile = profile;

      async function refreshPatients() {
        try {
          const data = await listarPacientes(
            currentProfile.clinic_id,
            searchTerm,
            currentProfile,
            currentProfile.role === "admin" ? professionalFilterId : "",
          );
          if (active) setPatients(data);
        } catch (err) {
          // Erro silencioso para não interromper a navegação
          console.error("Erro ao recarregar pacientes:", err);
        }
      }

      const timer = window.setTimeout(refreshPatients, 300);
      return () => window.clearTimeout(timer);
    }

    return () => {
      active = false;
    };
  }, [isModalOpen, loading, profile, searchTerm, professionalFilterId]);

  const matchesProfessionalFilter = (patient: Patient): boolean => {
    return (
      !isAdmin ||
      !professionalFilterId ||
      patient.responsible_professional_id === professionalFilterId
    );
  };

  const validatePatientForm = (form: NewPatientForm): string | null => {
    const hasLessons = Number(form.contracted_lessons) > 0;
    const hasProcedures = form.procedures.length > 0;
    const lessonsTotal = hasLessons
      ? Number(form.total_amount) ||
        Number(form.lesson_value) * Number(form.contracted_lessons)
      : 0;
    const proceduresTotal = form.procedures.reduce(
      (total, procedure) =>
        total +
        (Number(procedure.agreed_value) || 0) *
          (Number(procedure.quantity) || 0),
      0,
    );
    const financialTotal = lessonsTotal + proceduresTotal;

    if (form.procedures.some((procedure) => Number(procedure.agreed_value) <= 0)) {
      return "Informe o valor unitário de todos os procedimentos selecionados.";
    }

    if (form.procedures.some((procedure) => Number(procedure.quantity) <= 0)) {
      return "Informe a quantidade de créditos de todos os procedimentos selecionados.";
    }

    if (
      form.procedures.some(
        (procedure) =>
          procedure.schedule_mode === "fixed_weekdays" &&
          (!procedure.recurring_start_date ||
            !procedure.recurring_time ||
            !procedure.recurring_weekdays?.length),
      )
    ) {
      return "Informe data inicial, horário e dias fixos dos procedimentos recorrentes.";
    }

    if (
      form.procedures.some(
        (procedure) =>
          procedure.schedule_mode === "fixed_weekdays" &&
          (procedure.recurring_weekdays?.length ?? 0) >
            Number(procedure.quantity),
      )
    ) {
      return "Há procedimento com mais dias fixos do que créditos contratados.";
    }

    if (
      form.procedures.some(
        (procedure) =>
          (procedure.schedule ?? []).filter((item) => item.date && item.time)
            .length > Number(procedure.quantity),
      )
    ) {
      return "Há mais agendamentos do que créditos contratados em um procedimento.";
    }

    if (Number(form.contracted_lessons) < 0) {
      return "A quantidade de sessões não pode ser negativa.";
    }

    if (!hasLessons && !hasProcedures) {
      return "Informe pelo menos uma aula ou um procedimento.";
    }

    if (Number(form.amount_paid) > financialTotal) {
      return "O valor pago não pode ser maior que o total financeiro.";
    }

    if (hasLessons && form.fixed_weekdays.length === 0) {
      return "Selecione pelo menos um dia fixo para as sessões.";
    }

    if (hasLessons && form.fixed_weekdays.length > Number(form.contracted_lessons)) {
      return "A quantidade de dias fixos não pode ser maior que as sessões contratadas.";
    }

    if (hasLessons && !form.fixed_time) {
      return "Informe o horário fixo das sessões.";
    }

    return null;
  };

  const handleSubmitPatient = async (form: NewPatientForm) => {
    if (!profile?.clinic_id) {
      setModalError(
        "Não foi possível identificar a clínica do usuário. Verifique se existe um registro em profiles para este usuário.",
      );
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      const validationError = validatePatientForm(form);
      if (validationError) {
        setModalError(validationError);
        return;
      }

      if (renewingPatient) {
        const patient = await renovarPacotePaciente(
          profile.clinic_id,
          renewingPatient.id,
          form,
        );
        setPatients((current) =>
          current
            .map((item) => (item.id === patient.id ? patient : item))
            .filter(matchesProfessionalFilter)
            .sort((a, b) => a.full_name.localeCompare(b.full_name)),
        );
      } else if (editingPatient) {
        const patient = await atualizarPaciente(editingPatient.id, form);
        setPatients((current) =>
          (current.some((item) => item.id === patient.id)
            ? current.map((item) => (item.id === patient.id ? patient : item))
            : [...current, patient]
          )
            .filter(matchesProfessionalFilter)
            .sort((a, b) => a.full_name.localeCompare(b.full_name)),
        );
      } else {
        const patient = await criarPaciente(profile.clinic_id, form);
        setPatients((current) =>
          matchesProfessionalFilter(patient)
            ? [...current, patient].sort((a, b) =>
                a.full_name.localeCompare(b.full_name),
              )
            : current,
        );
      }

      setIsModalOpen(false);
      setEditingPatient(null);
      setRenewingPatient(null);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Erro ao salvar paciente.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openModal = () => {
    setEditingPatient(null);
    setRenewingPatient(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (patient: Patient) => {
    setEditingPatient(patient);
    setRenewingPatient(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openRenewModal = (patient: Patient) => {
    setRenewingPatient(patient);
    setEditingPatient(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPatient(null);
    setRenewingPatient(null);
    setModalError(null);
  };

  const handleRepairAppointments = async () => {
    if (!profile?.clinic_id) {
      setError("Não foi possível identificar a clínica para reparar a agenda.");
      return;
    }

    if (
      !window.confirm(
        "Deseja reparar automaticamente sessões e procedimentos que ficaram sem agendamento? A rotina só cria itens faltantes e não apaga agendamentos existentes.",
      )
    ) {
      return;
    }

    setRepairingAppointments(true);
    setError(null);
    setRepairMessage(null);

    try {
      const result = await repararAgendamentosPendentes(profile.clinic_id);
      const totalCreated =
        result.packageAppointmentsCreated + result.procedureAppointmentsCreated;

      setRepairMessage(
        totalCreated > 0
          ? `Agenda reparada: ${result.packageAppointmentsCreated} sessão(ões) de pacote e ${result.procedureAppointmentsCreated} procedimento(s) criados.`
          : "Agenda verificada: nenhum agendamento pendente encontrado.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao reparar agendamentos.",
      );
    } finally {
      setRepairingAppointments(false);
    }
  };

  const handleClosePatient = async (patient: Patient) => {
    if (
      !window.confirm(
        `Deseja encerrar o cadastro de ${patient.full_name}? O histórico será preservado.`,
      )
    ) {
      return;
    }

    setError(null);

    try {
      await encerrarPaciente(patient.id);
      setPatients((current) =>
        current.map((item) =>
          item.id === patient.id
            ? {
                ...item,
                status: "encerrado",
                lesson_packages: item.lesson_packages?.map((packageItem) => ({
                  ...packageItem,
                  status: "cancelado",
                })),
              }
            : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao encerrar paciente.",
      );
    }
  };

  const openNoteEditor = (patient: Patient) => {
    setEditingNotePatientId(patient.id);
    setNoteDraft(patient.quick_note ?? "");
  };

  const closeNoteEditor = () => {
    setEditingNotePatientId(null);
    setNoteDraft("");
  };

  const savePatientNote = async (patient: Patient, note = noteDraft) => {
    setNoteSavingPatientId(patient.id);
    setError(null);

    try {
      const updated = await atualizarObservacaoPaciente(patient.id, note);
      setPatients((current) =>
        current.map((item) =>
          item.id === patient.id ? { ...item, quick_note: updated.quick_note } : item,
        ),
      );
      closeNoteEditor();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao atualizar observação.",
      );
    } finally {
      setNoteSavingPatientId(null);
    }
  };

  const deletePatientNote = async (patient: Patient) => {
    await savePatientNote(patient, "");
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Pacientes
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">
            Gerencie clientes, pacotes contratados e sessões fixas.
          </p>
        </div>
        {isAdmin && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              className="w-full gap-2 sm:w-auto"
              onClick={handleRepairAppointments}
              isLoading={repairingAppointments}
            >
              <Wrench size={18} /> Reparar agenda
            </Button>
            <Button className="w-full gap-2 sm:w-auto" onClick={openModal}>
              <Plus size={18} /> Novo Paciente
            </Button>
          </div>
        )}
      </header>

      {!profile?.clinic_id && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
          <p>
            Seu usuário está autenticado, mas a clínica não foi carregada. O
            cadastro no Supabase precisa de um `clinic_id` válido em `profiles`.
          </p>
          <div className="rounded-lg bg-white/70 p-3 font-mono text-xs text-amber-950">
            <div>user.id: {user?.id ?? "sem sessão"}</div>
            <div>profile.id: {profile?.id ?? "não carregado"}</div>
            <div>profile.clinic_id: {profile?.clinic_id ?? "não carregado"}</div>
          </div>
          <Button variant="outline" size="sm" onClick={refreshProfile}>
            Recarregar perfil
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {repairMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {repairMessage}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
          placeholder="Buscar por nome, CPF ou WhatsApp..."
            className="min-h-11 w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {isAdmin && (
          <div className="relative w-full sm:w-72">
            <Filter
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <select
              className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              value={professionalFilterId}
              onChange={(event) => setProfessionalFilterId(event.target.value)}
            >
              <option value="">Todos os fisioterapeutas</option>
              {fisioterapeutas.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p>Carregando pacientes...</p>
        </div>
      ) : patients.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <User className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Nenhum paciente encontrado
          </h3>
          <p className="text-slate-500">
            Comece cadastrando seu primeiro paciente.
          </p>
          {isAdmin && (
            <Button className="mt-6 gap-2" onClick={openModal}>
              <Plus size={18} /> Novo Paciente
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
          {patients.map((patient) => (
            <Card
              key={patient.id}
              className="group hover:border-brand-200 transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                  <User size={24} />
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      className="p-1.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-600 rounded-lg"
                      onClick={() => openEditModal(patient)}
                      title="Editar cadastro"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/10 rounded-lg"
                      onClick={() => handleClosePatient(patient)}
                      title="Encerrar cadastro"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              <h3 className="font-bold text-slate-900 dark:text-white truncate">
                {patient.full_name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {STATUS_LABEL[patient.status] ?? patient.status}
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <UserCheck size={14} />
                <span className="truncate">
                  {getResponsibleProfessionalName(patient, fisioterapeutas)}
                </span>
              </div>

              {editingNotePatientId === patient.id ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <textarea
                    autoFocus
                    rows={3}
                    maxLength={180}
                    className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-900/60 dark:bg-slate-950 dark:text-slate-200"
                    placeholder="Ex: Viajou, retorna dia 15."
                    value={noteDraft}
                    onChange={(event) =>
                      setNoteDraft(event.target.value.slice(0, 180))
                    }
                    disabled={noteSavingPatientId === patient.id}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      {noteDraft.length}/180
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                        onClick={closeNoteEditor}
                        disabled={noteSavingPatientId === patient.id}
                        title="Cancelar"
                      >
                        <X size={16} />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-emerald-700 hover:bg-white hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-slate-900"
                        onClick={() => savePatientNote(patient)}
                        disabled={noteSavingPatientId === patient.id}
                        title="Salvar observação"
                      >
                        {noteSavingPatientId === patient.id ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Save size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : patient.quick_note ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex items-start gap-2">
                    <StickyNote
                      size={16}
                      className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"
                    />
                    <p className="line-clamp-3 flex-1 text-sm text-amber-950 dark:text-amber-100">
                      {patient.quick_note}
                    </p>
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-amber-700 hover:bg-white hover:text-amber-900 dark:text-amber-300 dark:hover:bg-slate-900"
                      onClick={() => openNoteEditor(patient)}
                      title="Editar observação"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-white hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-900"
                      onClick={() => deletePatientNote(patient)}
                      disabled={noteSavingPatientId === patient.id}
                      title="Apagar observação"
                    >
                      {noteSavingPatientId === patient.id ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 text-xs font-semibold text-slate-500 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-800 dark:text-slate-400 dark:hover:border-amber-900/70 dark:hover:bg-amber-950/20 dark:hover:text-amber-300"
                  onClick={() => openNoteEditor(patient)}
                >
                  <StickyNote size={14} />
                  Adicionar observação
                </button>
              )}

              {getPatientProcedureCredits(patient).length > 0 && (
                <details className="mt-4 rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950 md:hidden">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <ClipboardList size={14} />
                      Créditos de procedimentos
                    </span>
                    <span>{getPatientProcedureCredits(patient).length}</span>
                  </summary>
                  <div className="border-t border-slate-100 p-3 dark:border-slate-800 space-y-2">
                    {getPatientProcedureCredits(patient).map((procedure) => (
                      <div
                        key={procedure.type}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="truncate text-slate-600 dark:text-slate-300">
                          {getProcedureQuantity(procedure)}x {procedure.name}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                          {currencyFormatter.format(getProcedureTotal(procedure))}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {getPatientProcedureCredits(patient).length > 0 && (
                <div className="mt-4 hidden rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-2 md:block">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <ClipboardList size={14} />
                    <span>Créditos de procedimentos</span>
                  </div>
                  <div className="space-y-1">
                    {getPatientProcedureCredits(patient).map((procedure) => (
                      <div
                        key={procedure.type}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="truncate text-slate-600 dark:text-slate-300">
                          {getProcedureQuantity(procedure)}x {procedure.name}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                          {currencyFormatter.format(getProcedureTotal(procedure))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {patient.lesson_packages?.[0] && (
                <details className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60 md:hidden">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>Pacote</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {patient.lesson_packages[0].completed_lessons}/
                      {patient.lesson_packages[0].total_lessons} sessões
                    </span>
                  </summary>
                  <div className="border-t border-slate-100 p-3 dark:border-slate-800 space-y-2">
                    <div className="text-xs text-slate-500">
                      Restam{" "}
                      {Math.max(
                        patient.lesson_packages[0].total_lessons -
                          patient.lesson_packages[0].completed_lessons -
                          patient.lesson_packages[0].missed_lessons,
                        0,
                      )}{" "}
                      sessões · termina em{" "}
                      {formatDateBr(patient.lesson_packages[0].expected_end_date)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {patient.lesson_packages[0].fixed_weekdays
                        .map((day) => WEEKDAY_LABEL[day])
                        .join(", ")}{" "}
                      às {patient.lesson_packages[0].fixed_time.slice(0, 5)}
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {currencyFormatter.format(
                        Number(patient.lesson_packages[0].total_amount),
                      )}{" "}
                      · {patient.lesson_packages[0].payment_status}
                    </div>
                  </div>
                </details>
              )}

              {patient.lesson_packages?.[0] && (
                <div className="mt-4 hidden rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3 space-y-2 md:block">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">
                      Pacote
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {patient.lesson_packages[0].completed_lessons}/
                      {patient.lesson_packages[0].total_lessons} sessões
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Restam{" "}
                    {Math.max(
                      patient.lesson_packages[0].total_lessons -
                        patient.lesson_packages[0].completed_lessons -
                        patient.lesson_packages[0].missed_lessons,
                      0,
                    )}{" "}
                    sessões · termina em{" "}
                    {formatDateBr(patient.lesson_packages[0].expected_end_date)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {patient.lesson_packages[0].fixed_weekdays
                      .map((day) => WEEKDAY_LABEL[day])
                      .join(", ")}{" "}
                    às {patient.lesson_packages[0].fixed_time.slice(0, 5)}
                  </div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {currencyFormatter.format(
                      Number(patient.lesson_packages[0].total_amount),
                    )}{" "}
                    · {patient.lesson_packages[0].payment_status}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Phone size={14} />
                  <span>{patient.phone || "Sem telefone"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Calendar size={14} />
                  <span>Nascimento: {formatDateBr(patient.birth_date)}</span>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-w-[140px] flex-[2] gap-2"
                  onClick={() => navigate(`/pacientes/${patient.id}/prontuario`)}
                >
                  Prontuário
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-[140px] flex-1 gap-2"
                    onClick={() => openRenewModal(patient)}
                    title="Renovar pacote"
                  >
                    <CreditCard size={16} />
                    Renovar Pacote
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-11 shrink-0 text-emerald-600 dark:text-emerald-400"
                  disabled={!onlyDigits(patient.phone)}
                  onClick={() =>
                    openWhatsApp(
                      patient.phone,
                      `Olá, ${patient.full_name}! Tudo bem?`,
                    )
                  }
                >
                  <MessageCircle size={18} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovoPacienteModal
        isOpen={isModalOpen}
        loading={saving}
        error={modalError}
        fisioterapeutas={fisioterapeutas}
        patient={editingPatient ?? renewingPatient}
        mode={renewingPatient ? "renew" : editingPatient ? "edit" : "create"}
        onClose={closeModal}
        onSubmit={handleSubmitPatient}
      />
    </div>
  );
};
