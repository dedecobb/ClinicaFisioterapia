import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Hash, Mail, Phone, User, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { NewPatientForm } from "./types";

interface NovoPacienteModalProps {
  isOpen: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (form: NewPatientForm) => Promise<void>;
}

const emptyForm: NewPatientForm = {
  full_name: "",
  cpf: "",
  email: "",
  phone: "",
  birth_date: "",
  gender: "other",
};

export const NovoPacienteModal = ({
  isOpen,
  loading = false,
  error,
  onClose,
  onSubmit,
}: NovoPacienteModalProps) => {
  const [formData, setFormData] = useState<NewPatientForm>(emptyForm);

  useEffect(() => {
    if (isOpen) {
      setFormData(emptyForm);
    }
  }, [isOpen]);

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
                  Novo Paciente
                </h2>
                <p className="text-sm text-slate-500">
                  Cadastre um novo aluno ou paciente na clínica.
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
                  Cadastrar Paciente
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
