import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  Clock,
  CreditCard,
  Hash,
  Mail,
  Phone,
  User,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { NewPatientForm, Patient } from "./types";
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formFromPatient(patient: Patient | null | undefined): NewPatientForm {
  if (!patient) return emptyForm;

  const activePackage = patient.lesson_packages?.[0];

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
      activePackage?.total_lessons ?? patient.contracted_lessons ?? 8,
    fixed_weekdays:
      activePackage?.fixed_weekdays ?? patient.fixed_weekdays ?? [2, 4],
    fixed_time: activePackage?.fixed_time?.slice(0, 5) ?? patient.fixed_time?.slice(0, 5) ?? "08:00",
    lesson_duration_minutes: 50,
    responsible_professional_id: patient.responsible_professional_id ?? "",
    lesson_value: Number(activePackage?.lesson_value) || 0,
    total_amount: Number(activePackage?.total_amount) || 0,
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
      setFormData(formFromPatient(patient));
    }
  }, [isOpen, patient]);

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
                    ? "Adicione novos créditos e gere as próximas aulas."
                    : isEditing
                    ? "Atualize dados cadastrais, pacote e financeiro."
                    : "Cadastre cliente, pacote e aulas fixas na agenda."}
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
                        disabled={loading}
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
                          disabled={loading}
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
                          disabled={loading}
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
                      disabled={loading}
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
                          disabled={loading}
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
                          disabled={loading}
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
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                    Pacote contratado
                  </h3>

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
                        min={1}
                        required
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.contracted_lessons}
                        onChange={(event) =>
                          updateField(
                            "contracted_lessons",
                            Number(event.target.value),
                          )
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
                            disabled={loading}
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
                          required
                          disabled={loading}
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
                    Financeiro do pacote
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
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.lesson_value}
                        onChange={(event) => {
                          const lessonValue = Number(event.target.value);
                          updateField("lesson_value", lessonValue);
                          updateField(
                            "total_amount",
                            lessonValue * formData.contracted_lessons,
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Valor do pacote
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        value={formData.total_amount}
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
                    ? "Renovar e gerar aulas"
                    : isEditing
                      ? "Salvar alterações"
                      : "Cadastrar e gerar aulas"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
