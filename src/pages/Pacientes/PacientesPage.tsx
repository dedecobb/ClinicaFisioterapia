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
  Search,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import { getFisioterapeutas } from "../Agenda/Agendamentoservice";
import { Fisioterapeuta } from "../Agenda/types";
import {
  atualizarPaciente,
  criarPaciente,
  encerrarPaciente,
  listarPacientes,
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

const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fisioterapeutas, setFisioterapeutas] = useState<Fisioterapeuta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [renewingPatient, setRenewingPatient] = useState<Patient | null>(null);
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
        const data = await listarPacientes(profile.clinic_id, searchTerm, profile);
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
  }, [searchTerm, profile?.clinic_id]);

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

  const validatePatientForm = (form: NewPatientForm): string | null => {
    const hasLessons = Number(form.contracted_lessons) > 0;
    const hasProcedures = form.procedures.length > 0;

    if (form.procedures.some((procedure) => Number(procedure.agreed_value) <= 0)) {
      return "Informe o valor unitário de todos os procedimentos selecionados.";
    }

    if (form.procedures.some((procedure) => Number(procedure.quantity) <= 0)) {
      return "Informe a quantidade de créditos de todos os procedimentos selecionados.";
    }

    if (
      form.procedures.some(
        (procedure) => !procedure.scheduled_date || !procedure.scheduled_time,
      )
    ) {
      return "Informe data e horário de todos os procedimentos selecionados.";
    }

    if (Number(form.contracted_lessons) < 0) {
      return "A quantidade de aulas não pode ser negativa.";
    }

    if (!hasLessons && !hasProcedures) {
      return "Informe pelo menos uma aula ou um procedimento.";
    }

    if (hasLessons && form.fixed_weekdays.length === 0) {
      return "Selecione pelo menos um dia fixo para as aulas.";
    }

    if (hasLessons && !form.fixed_time) {
      return "Informe o horário fixo das aulas.";
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
            .sort((a, b) => a.full_name.localeCompare(b.full_name)),
        );
      } else if (editingPatient) {
        const patient = await atualizarPaciente(editingPatient.id, form);
        setPatients((current) =>
          current
            .map((item) => (item.id === patient.id ? patient : item))
            .sort((a, b) => a.full_name.localeCompare(b.full_name)),
        );
      } else {
        const patient = await criarPaciente(profile.clinic_id, form);
        setPatients((current) =>
          [...current, patient].sort((a, b) =>
            a.full_name.localeCompare(b.full_name),
          ),
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Pacientes
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gerencie clientes, pacotes contratados e aulas fixas.
          </p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={openModal}>
            <Plus size={18} /> Novo Paciente
          </Button>
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

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
          placeholder="Buscar por nome, CPF ou WhatsApp..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter size={18} /> Filtros
        </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

              {getPatientProcedureCredits(patient).length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-2">
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
                <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">
                      Pacote
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {patient.lesson_packages[0].completed_lessons}/
                      {patient.lesson_packages[0].total_lessons} aulas
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
                    aulas · termina em{" "}
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

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => navigate(`/pacientes/${patient.id}/prontuario`)}
                >
                  Prontuário
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => openRenewModal(patient)}
                    title="Renovar pacote"
                  >
                    <CreditCard size={16} />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-emerald-600 dark:text-emerald-400"
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
