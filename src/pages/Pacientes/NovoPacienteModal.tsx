import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  Clock,
  ClipboardList,
  CreditCard,
  Hash,
  Mail,
  Phone,
  User,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  NewPatientForm,
  Patient,
  PROCEDURE_OPTIONS,
  ProcedureType,
} from "./types";
import { Fisioterapeuta } from "../Agenda/types";

interface NovoPacienteModalProps {
  isOpen: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (form: NewPatientForm) => Promise<void>;
  fisioterapeutas: Fisioterapeuta[];
  patient?: Patient | null;
  mode?: "create" | "edit" | "renew";
}

const emptyForm: NewPatientForm = {
  full_name: "",
  cpf: "",
  email: "",
  phone: "",
  birth_date: "",
  gender: "other",
  status: "ativo",
  plan_start_date: "",
  contracted_lessons: 8,
  fixed_weekdays: [2, 4],
  fixed_time: "08:00",
  lesson_duration_minutes: 50,
  responsible_professional_id: "",
  procedures: [],
  lesson_value: 0,
  total_amount: 0,
  amount_paid: 0,
  payment_method: "",
  payment_status: "pendente",
  installments: 1,
};

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function getProceduresTotal(procedures: NewPatientForm["procedures"]): number {
  return procedures.reduce(
    (total, item) =>
      total + (Number(item.agreed_value) || 0) * (Number(item.quantity) || 0),
    0,
  );
}

function normalizeProceduresForForm(
  procedures: Patient["procedures"] | undefined | null,
): NewPatientForm["procedures"] {
  return (procedures ?? []).map((procedure) => ({
    ...procedure,
    quantity: Number(procedure.quantity) || 1,
    agreed_value: Number(procedure.agreed_value) || 0,
  }));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formFromPatient(
  patient: Patient | null | undefined,
  mode: NovoPacienteModalProps["mode"] = "create",
): NewPatientForm {
  if (!patient) return emptyForm;

  const activePackage = patient.lesson_packages?.[0];
  const packageProcedures = normalizeProceduresForForm(
    activePackage?.procedure_credits,
  );
  const patientProcedures = normalizeProceduresForForm(patient.procedures);
  const procedures = packageProcedures.length > 0 ? packageProcedures : patientProcedures;
  const storedTotalAmount = Number(activePackage?.total_amount) || 0;
  const storedProcedureAmount = Number(activePackage?.procedure_amount) || 0;
  const storedLessons =
    activePackage?.total_lessons ?? patient.contracted_lessons ?? 0;
  const hasStoredLessons = storedLessons > 0;

  if (mode === "renew") {
    return {
      ...emptyForm,
      full_name: patient.full_name ?? "",
      cpf: patient.cpf ?? "",
      email: patient.email ?? "",
      phone: patient.phone ?? "",
      birth_date: patient.birth_date ?? "",
      gender: patient.gender ?? "other",
      status: "ativo",
      plan_start_date: today(),
      contracted_lessons: 0,
      fixed_weekdays: [],
      fixed_time: "",
      responsible_professional_id: patient.responsible_professional_id ?? "",
    };
  }

  return {
    full_name: patient.full_name ?? "",
    cpf: patient.cpf ?? "",
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    birth_date: patient.birth_date ?? "",
    gender: patient.gender ?? "other",
    status: patient.status ?? "ativo",
    plan_start_date:
      activePackage?.start_date ?? patient.plan_start_date ?? today(),
    contracted_lessons:
      hasStoredLessons || procedures.length > 0 ? storedLessons : 8,
    fixed_weekdays:
      activePackage?.fixed_weekdays ??
      patient.fixed_weekdays ??
      (hasStoredLessons ? [2, 4] : []),
    fixed_time:
      activePackage?.fixed_time?.slice(0, 5) ??
      patient.fixed_time?.slice(0, 5) ??
      (hasStoredLessons ? "08:00" : ""),
    lesson_duration_minutes: 50,
    responsible_professional_id: patient.responsible_professional_id ?? "",
    procedures,
    lesson_value: Number(activePackage?.lesson_value) || 0,
    total_amount:
      !hasStoredLessons
        ? 0
        : storedProcedureAmount > 0
        ? Math.max(storedTotalAmount - storedProcedureAmount, 0)
        : storedTotalAmount,
    amount_paid: Number(activePackage?.amount_paid) || 0,
    payment_method: activePackage?.payment_method ?? "",
    payment_status: activePackage?.payment_status ?? "pendente",
    installments: activePackage?.installments ?? 1,
  };
}

export const NovoPacienteModal = ({
  isOpen,
  loading = false,
  error,
  onClose,
  onSubmit,
  fisioterapeutas,
  patient,
  mode = "create",
}: NovoPacienteModalProps) => {
  const [formData, setFormData] = useState<NewPatientForm>(emptyForm);
  const isEditing = mode === "edit";
  const isRenewing = mode === "renew";

  useEffect(() => {
    if (isOpen) {
      setFormData(formFromPatient(patient, mode));
    }
  }, [isOpen, mode, patient]);

  const updateField = <K extends keyof NewPatientForm>(
    field: K,
    value: NewPatientForm[K],
  ) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(formData);
  };

  const toggleWeekday = (weekday: number) => {
    setFormData((current) => {
      const fixed_weekdays = current.fixed_weekdays.includes(weekday)
        ? current.fixed_weekdays.filter((item) => item !== weekday)
        : [...current.fixed_weekdays, weekday].sort((a, b) => a - b);

      return { ...current, fixed_weekdays };
    });
  };

  const toggleProcedure = (type: ProcedureType) => {
    const option = PROCEDURE_OPTIONS.find((item) => item.type === type);
    if (!option) return;

    setFormData((current) => {
      const selected = current.procedures.some((item) => item.type === type);

      return {
        ...current,
        procedures: selected
          ? current.procedures.filter((item) => item.type !== type)
          : [
              ...current.procedures,
              { type, name: option.name, agreed_value: 0, quantity: 1 },
            ],
      };
    });
  };

  const updateProcedureValue = (type: ProcedureType, value: number) => {
    setFormData((current) => ({
      ...current,
      procedures: current.procedures.map((item) =>
        item.type === type ? { ...item, agreed_value: value } : item,
      ),
    }));
  };

  const updateProcedureQuantity = (type: ProcedureType, value: number) => {
    setFormData((current) => ({
      ...current,
      procedures: current.procedures.map((item) =>
        item.type === type ? { ...item, quantity: value } : item,
      ),
    }));
  };

  const proceduresTotal = getProceduresTotal(formData.procedures);
  const hasLessons = Number(formData.contracted_lessons) > 0;
  const lessonsTotal = hasLessons ? Number(formData.total_amount) || 0 : 0;
  const financialTotal = lessonsTotal + proceduresTotal;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-full max-w-xl h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {isRenewing
                    ? "Renovar Pacote"
                    : isEditing
                      ? "Editar Paciente"
                      : "Novo Paciente"}
                </h2>
                <p className="text-sm text-slate-500">
                  {isRenewing
                    ? "Adicione novos créditos e gere as próximas aulas, se houver."
                    : isEditing
                    ? "Atualize dados cadastrais, procedimentos, pacote e financeiro."
                    : "Cadastre cliente, procedimentos e aulas fixas quando contratadas."}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X size={20} />
              </button>
            </div>

            <form
              id="novo-paciente-form"
              onSubmit={handleSubmit}
              className="flex-1 min-h-0 flex flex-col"
            >
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                    Dados Pessoais
                  </h3>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nome Completo
                    </label>
                    <div className="relative">
                      <User
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                      />
                      <input
                        required
                        disabled={loading || isRenewing}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Ex: João da Silva"
                        value={formData.full_name}
                        onChange={(event) =>
                          updateField("full_name", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        CPF
                      </label>
                      <div className="relative">
                        <Hash
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          disabled={loading || isRenewing}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="000.000.000-00"
                          value={formData.cpf}
                          onChange={(event) =>
                            updateField("cpf", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Data de Nascimento
                      </label>
                      <div className="relative">
                        <Calendar
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          type="date"
                          disabled={loading || isRenewing}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          value={formData.birth_date}
                          onChange={(event) =>
                            updateField("birth_date", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Status do cliente
                    </label>
                    <select
                      disabled={loading || isRenewing}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      value={formData.status}
                      onChange={(event) =>
                        updateField(
                          "status",
                          event.target.value as NewPatientForm["status"],
                        )
                      }
                    >
                      <option value="ativo">Ativo</option>
                      <option value="pausado">Pausado</option>
                      <option value="inadimplente">Inadimplente</option>
                      <option value="encerrado">Encerrado</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                    Contato
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        WhatsApp / Celular
                      </label>
                      <div className="relative">
                        <Phone
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          required
                          disabled={loading || isRenewing}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="(00) 00000-0000"
                          value={formData.phone}
                          onChange={(event) =>
                            updateField("phone", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Email
                      </label>
                      <div className="relative">
                        <Mail
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          type="email"
                          disabled={loading || isRenewing}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="paciente@email.com"
                          value={formData.email}
                          onChange={(event) =>
                            updateField("email", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={16} className="text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Procedimentos
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {PROCEDURE_OPTIONS.map((procedure) => {
                      const selectedProcedure = formData.procedures.find(
                        (item) => item.type === procedure.type,
                      );
                      const selected = Boolean(selectedProcedure);

                      return (
                        <div
                          key={procedure.type}
                          className={`rounded-xl border px-3 py-3 transition-colors ${
                            selected
                              ? "border-brand-500 bg-brand-50/70"
                              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <label className="flex min-w-0 flex-1 items-center gap-3">
                              <input
                                type="checkbox"
                                disabled={loading}
                                checked={selected}
                                onChange={() => toggleProcedure(procedure.type)}
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                              <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {procedure.name}
                              </span>
                            </label>

                            <div className="w-full sm:w-28">
                              <input
                                type="number"
                                min={1}
                                disabled={loading || !selected}
                                aria-label={`Créditos para ${procedure.name}`}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="Qtd."
                                value={selectedProcedure?.quantity ?? ""}
                                onChange={(event) =>
                                  updateProcedureQuantity(
                                    procedure.type,
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </div>

                            <div className="relative w-full sm:w-40">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                                R$
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                disabled={loading || !selected}
                                aria-label={`Valor unitário para ${procedure.name}`}
                                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="Valor unit."
                                value={selectedProcedure?.agreed_value ?? ""}
                                onChange={(event) =>
                                  updateProcedureValue(
                                    procedure.type,
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {formData.procedures.length > 0 && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <span className="font-medium text-slate-500">
                        Total dos procedimentos
                      </span>
                      <strong className="text-slate-900 dark:text-white">
                        {currencyFormatter.format(proceduresTotal)}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                    Aulas contratadas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Informe 0 aulas quando o paciente contratar somente procedimentos.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Início do plano
                      </label>
                      <div className="relative">
                        <Calendar
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          type="date"
                          required
                          disabled={loading}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          value={formData.plan_start_date}
                          onChange={(event) =>
                            updateField("plan_start_date", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Aulas contratadas
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.contracted_lessons}
                        onChange={(event) =>
                          setFormData((current) => {
                            const contractedLessons = Number(event.target.value);
                            const withLessons = contractedLessons > 0;

                            return {
                              ...current,
                              contracted_lessons: contractedLessons,
                              total_amount: withLessons
                                ? current.lesson_value * contractedLessons
                                : 0,
                            };
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Dias fixos das aulas
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {WEEKDAYS.map((day) => {
                        const selected = formData.fixed_weekdays.includes(
                          day.value,
                        );
                        return (
                          <button
                            key={day.value}
                            type="button"
                            disabled={loading || !hasLessons}
                            onClick={() => toggleWeekday(day.value)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                              selected
                                ? "border-brand-500 bg-brand-50 text-brand-700"
                                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Horário fixo
                      </label>
                      <div className="relative">
                        <Clock
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          type="time"
                          required={hasLessons}
                          disabled={loading || !hasLessons}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          value={formData.fixed_time}
                          onChange={(event) =>
                            updateField("fixed_time", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Fisioterapeuta responsável
                      </label>
                      <select
                        required
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.responsible_professional_id}
                        onChange={(event) =>
                          updateField(
                            "responsible_professional_id",
                            event.target.value,
                          )
                        }
                      >
                        <option value="">Selecione</option>
                        {fisioterapeutas.map((professional) => (
                          <option key={professional.id} value={professional.id}>
                            {professional.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                    Financeiro
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Valor por aula
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={loading || !hasLessons}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.lesson_value}
                        onChange={(event) => {
                          const lessonValue = Number(event.target.value);
                          updateField("lesson_value", lessonValue);
                          updateField(
                            "total_amount",
                            hasLessons
                              ? lessonValue * formData.contracted_lessons
                              : 0,
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Valor das aulas
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={loading || !hasLessons}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={lessonsTotal}
                        onChange={(event) =>
                          updateField("total_amount", Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Valor pago
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.amount_paid}
                        onChange={(event) =>
                          updateField("amount_paid", Number(event.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-slate-100 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                    <div>
                      <span className="block text-xs font-semibold uppercase text-slate-400">
                        Aulas
                      </span>
                      <strong className="text-slate-900 dark:text-white">
                        {currencyFormatter.format(lessonsTotal)}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold uppercase text-slate-400">
                        Procedimentos
                      </span>
                      <strong className="text-slate-900 dark:text-white">
                        {currencyFormatter.format(proceduresTotal)}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold uppercase text-slate-400">
                        Total financeiro
                      </span>
                      <strong className="text-slate-900 dark:text-white">
                        {currencyFormatter.format(financialTotal)}
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Forma de pagamento
                      </label>
                      <div className="relative">
                        <CreditCard
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          disabled={loading}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Pix, cartão..."
                          value={formData.payment_method}
                          onChange={(event) =>
                            updateField("payment_method", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Status pagamento
                      </label>
                      <select
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.payment_status}
                        onChange={(event) =>
                          updateField(
                            "payment_status",
                            event.target.value as NewPatientForm["payment_status"],
                          )
                        }
                      >
                        <option value="pago">Pago</option>
                        <option value="pendente">Pendente</option>
                        <option value="parcial">Parcial</option>
                        <option value="inadimplente">Inadimplente</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Parcelas
                      </label>
                      <input
                        type="number"
                        min={1}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.installments}
                        onChange={(event) =>
                          updateField("installments", Number(event.target.value))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="flex-[2]" isLoading={loading}>
                  {isRenewing
                    ? hasLessons
                      ? "Renovar e gerar aulas"
                      : "Adicionar procedimentos"
                    : isEditing
                      ? "Salvar alterações"
                      : hasLessons
                        ? "Cadastrar e gerar aulas"
                        : "Cadastrar procedimentos"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
