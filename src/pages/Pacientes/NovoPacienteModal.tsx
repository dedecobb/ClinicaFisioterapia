import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  Clock,
  ClipboardList,
  CreditCard,
  Hash,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  NewPatientForm,
  Patient,
  PatientAddress,
  PatientAddressForm,
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
  address: {
    postalCode: "",
    street: "",
    number: "",
    additionalInformation: "",
    district: "",
    cityCode: "",
    cityName: "",
    state: "",
  },
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

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  complemento?: string;
  erro?: boolean;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function uppercaseState(value: string): string {
  return value
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

function emptyAddressForm(): PatientAddressForm {
  return {
    postalCode: "",
    street: "",
    number: "",
    additionalInformation: "",
    district: "",
    cityCode: "",
    cityName: "",
    state: "",
  };
}

function addressField(value: unknown, aliases: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;

  for (const alias of aliases) {
    const field = record[alias];
    if (typeof field === "string" || typeof field === "number") {
      return String(field);
    }
  }

  return "";
}

function addressFormFromPatientAddress(
  value: PatientAddress | string | null | undefined,
): PatientAddressForm {
  if (!value) return emptyAddressForm();

  if (typeof value === "string") {
    return {
      ...emptyAddressForm(),
      street: value,
    };
  }

  const cityValue = value.city;

  return {
    postalCode: addressField(value, [
      "postalCode",
      "postal_code",
      "zip",
      "cep",
    ]),
    street: addressField(value, ["street", "logradouro", "rua", "address"]),
    number: addressField(value, ["number", "numero"]),
    additionalInformation: addressField(value, [
      "additionalInformation",
      "complement",
      "complemento",
    ]),
    district: addressField(value, ["district", "neighborhood", "bairro"]),
    cityCode:
      cityValue && typeof cityValue === "object"
        ? addressField(cityValue, ["code", "ibgeCode", "cityCode"])
        : addressField(value, ["cityCode", "city_code", "ibgeCode"]),
    cityName:
      cityValue && typeof cityValue === "object"
        ? addressField(cityValue, ["name", "city"])
        : addressField(value, ["cityName", "city_name", "city", "cidade"]),
    state: addressField(value, ["state", "uf"]),
  };
}

function getProceduresTotal(procedures: NewPatientForm["procedures"]): number {
  return procedures.reduce(
    (total, item) =>
      total + (Number(item.agreed_value) || 0) * (Number(item.quantity) || 0),
    0,
  );
}

function clinicNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function today(): string {
  return clinicNowParts().date;
}

function nextAvailableTime(): string {
  const [, hour = "0", minute = "0"] =
    clinicNowParts().time.match(/^(\d{2}):(\d{2})$/) ?? [];
  const totalMinutes = Number(hour) * 60 + Number(minute);
  const roundedMinutes = Math.min(
    Math.max(Math.ceil(totalMinutes / 5) * 5, totalMinutes),
    23 * 60 + 59,
  );

  return `${pad2(Math.floor(roundedMinutes / 60))}:${pad2(
    roundedMinutes % 60,
  )}`;
}

function addMinutesToSchedule(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute + minutes, 0);

  return {
    date: `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(
      value.getDate(),
    )}`,
    time: value.toTimeString().slice(0, 5),
  };
}

function defaultProcedureSchedule(offsetSlots = 0, durationMinutes = 50) {
  return addMinutesToSchedule(
    today(),
    nextAvailableTime(),
    offsetSlots * durationMinutes,
  );
}

function normalizeProcedureTimeForDate(date: string, time: string): string {
  const minTime = nextAvailableTime();

  if (date === today() && time < minTime) return minTime;
  return time;
}

function normalizeProceduresForForm(
  procedures: Patient["procedures"] | undefined | null,
): NewPatientForm["procedures"] {
  return (procedures ?? []).map((procedure, index) => {
    const fallback = defaultProcedureSchedule(index);

    return {
      ...procedure,
      quantity: Number(procedure.quantity) || 1,
      agreed_value: Number(procedure.agreed_value) || 0,
      scheduled_date: procedure.scheduled_date ?? fallback.date,
      scheduled_time: procedure.scheduled_time ?? fallback.time,
    };
  });
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
  const procedures =
    packageProcedures.length > 0 ? packageProcedures : patientProcedures;
  const storedTotalAmount = Number(activePackage?.total_amount) || 0;
  const storedProcedureAmount = Number(activePackage?.procedure_amount) || 0;
  const storedLessons =
    activePackage?.total_lessons ?? patient.contracted_lessons ?? 0;
  const hasStoredLessons = storedLessons > 0;
  const address = addressFormFromPatientAddress(patient.address);

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
      address,
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
    address,
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
    total_amount: !hasStoredLessons
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
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const lastFetchedCep = useRef("");
  const isEditing = mode === "edit";
  const isRenewing = mode === "renew";
  const cepDigits = onlyDigits(formData.address.postalCode);

  useEffect(() => {
    if (isOpen) {
      setFormData(formFromPatient(patient, mode));
      setCepError(null);
      lastFetchedCep.current = "";
    }
  }, [isOpen, mode, patient]);

  useEffect(() => {
    if (
      !isOpen ||
      cepDigits.length !== 8 ||
      lastFetchedCep.current === cepDigits
    ) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setCepLoading(true);
      setCepError(null);

      try {
        const response = await fetch(
          `https://viacep.com.br/ws/${cepDigits}/json/`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Não foi possível consultar o CEP.");
        }

        const data = (await response.json()) as ViaCepResponse;
        if (data.erro) {
          throw new Error("CEP não encontrado.");
        }

        // Auto-preenchimento do IBGE para Cuiabá
        const cityName = data.localidade?.trim() || current.address.cityName;
        const isCuiaba =
          cityName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") === "cuiaba";
        const ibgeCode = isCuiaba
          ? "5103403"
          : onlyDigits(data.ibge ?? current.address.cityCode);

        lastFetchedCep.current = cepDigits;
        setFormData((current) => ({
          ...current,
          address: {
            ...current.address,
            postalCode: onlyDigits(data.cep ?? cepDigits),
            street: data.logradouro?.trim() || current.address.street,
            additionalInformation:
              current.address.additionalInformation ||
              data.complemento?.trim() ||
              "",
            district: data.bairro?.trim() || current.address.district,
            cityName: cityName,
            cityCode: ibgeCode,
            state: uppercaseState(data.uf ?? current.address.state),
          },
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setCepError(
          err instanceof Error
            ? err.message
            : "Não foi possível consultar o CEP.",
        );
      } finally {
        if (!controller.signal.aborted) setCepLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cepDigits, isOpen]);

  const updateField = <K extends keyof NewPatientForm>(
    field: K,
    value: NewPatientForm[K],
  ) => {
    let formattedValue = value;

    if (field === "cpf" && typeof value === "string") {
      formattedValue = formatCpf(value) as NewPatientForm[K];
    } else if (field === "phone" && typeof value === "string") {
      formattedValue = formatPhone(value) as NewPatientForm[K];
    }

    setFormData((current) => ({ ...current, [field]: formattedValue }));
  };

  const updateAddressField = <K extends keyof PatientAddressForm>(
    field: K,
    value: PatientAddressForm[K],
  ) => {
    setFormData((current) => ({
      ...current,
      address: {
        ...current.address,
        [field]:
          field === "postalCode"
            ? onlyDigits(value).slice(0, 8)
            : field === "state"
              ? uppercaseState(value)
              : value,
      },
    }));
    if (field === "postalCode") setCepError(null);
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
          : (() => {
              const selectedCredits = current.procedures.reduce(
                (total, item) => total + (Number(item.quantity) || 1),
                0,
              );
              const schedule = defaultProcedureSchedule(
                selectedCredits,
                Number(current.lesson_duration_minutes) || 50,
              );

              return [
                ...current.procedures,
                {
                  type,
                  name: option.name,
                  agreed_value: 0,
                  quantity: 1,
                  scheduled_date: schedule.date,
                  scheduled_time: schedule.time,
                },
              ];
            })(),
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

  const updateProcedureSchedule = (
    type: ProcedureType,
    field: "scheduled_date" | "scheduled_time",
    value: string,
  ) => {
    setFormData((current) => ({
      ...current,
      procedures: current.procedures.map((item) => {
        if (item.type !== type) return item;

        const nextDate =
          field === "scheduled_date" ? value : (item.scheduled_date ?? today());
        const nextTime =
          field === "scheduled_time"
            ? value
            : (item.scheduled_time ?? nextAvailableTime());

        return {
          ...item,
          scheduled_date: nextDate,
          scheduled_time: normalizeProcedureTimeForDate(nextDate, nextTime),
        };
      }),
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
            className="w-full max-w-3xl h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col"
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
                    <MapPin size={16} className="text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Endereço
                    </h3>
                    {cepLoading && (
                      <Loader2
                        size={14}
                        className="animate-spin text-slate-400"
                      />
                    )}
                  </div>

                  {cepError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      {cepError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        CEP
                      </label>
                      <input
                        inputMode="numeric"
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="00000-000"
                        value={formatCep(formData.address.postalCode)}
                        onChange={(event) =>
                          updateAddressField("postalCode", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Logradouro
                      </label>
                      <input
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Rua, avenida..."
                        value={formData.address.street}
                        onChange={(event) =>
                          updateAddressField("street", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Número
                      </label>
                      <input
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Nº"
                        value={formData.address.number}
                        onChange={(event) =>
                          updateAddressField("number", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Bairro
                      </label>
                      <input
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Bairro"
                        value={formData.address.district}
                        onChange={(event) =>
                          updateAddressField("district", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Complemento
                      </label>
                      <input
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Sala, bloco..."
                        value={formData.address.additionalInformation}
                        onChange={(event) =>
                          updateAddressField(
                            "additionalInformation",
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        UF
                      </label>
                      <input
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="UF"
                        value={formData.address.state}
                        onChange={(event) =>
                          updateAddressField("state", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cidade
                      </label>
                      <input
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Cidade"
                        value={formData.address.cityName}
                        onChange={(event) =>
                          updateAddressField("cityName", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        IBGE
                      </label>
                      <input
                        inputMode="numeric"
                        disabled={loading || isRenewing}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Código"
                        value={formData.address.cityCode}
                        onChange={(event) =>
                          updateAddressField("cityCode", event.target.value)
                        }
                      />
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

                          {selectedProcedure && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase text-slate-400">
                                  Data
                                </label>
                                <div className="relative">
                                  <Calendar
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    size={16}
                                  />
                                  <input
                                    type="date"
                                    min={today()}
                                    disabled={loading}
                                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                                    value={
                                      selectedProcedure.scheduled_date ??
                                      today()
                                    }
                                    onChange={(event) =>
                                      updateProcedureSchedule(
                                        procedure.type,
                                        "scheduled_date",
                                        event.target.value,
                                      )
                                    }
                                    required
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase text-slate-400">
                                  Horário
                                </label>
                                <div className="relative">
                                  <Clock
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    size={16}
                                  />
                                  <input
                                    type="time"
                                    step={300}
                                    min={
                                      (selectedProcedure.scheduled_date ??
                                        today()) === today()
                                        ? nextAvailableTime()
                                        : undefined
                                    }
                                    disabled={loading}
                                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                                    value={
                                      selectedProcedure.scheduled_time ??
                                      nextAvailableTime()
                                    }
                                    onChange={(event) =>
                                      updateProcedureSchedule(
                                        procedure.type,
                                        "scheduled_time",
                                        event.target.value,
                                      )
                                    }
                                    required
                                  />
                                </div>
                              </div>
                            </div>
                          )}
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
                    Agenda e aulas contratadas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aulas usam dias e horário fixos. Procedimentos avulsos usam
                    a data e o horário definidos em cada procedimento.
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
                          required={hasLessons}
                          disabled={loading || !hasLessons}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          value={hasLessons ? formData.plan_start_date : ""}
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
                            const contractedLessons = Number(
                              event.target.value,
                            );
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
                      Dias fixos
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
                        Horário fixo das aulas
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
                          updateField(
                            "total_amount",
                            Number(event.target.value),
                          )
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
                            event.target
                              .value as NewPatientForm["payment_status"],
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
                          updateField(
                            "installments",
                            Number(event.target.value),
                          )
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
                      : "Adicionar e agendar procedimentos"
                    : isEditing
                      ? "Salvar alterações"
                      : hasLessons
                        ? "Cadastrar e gerar aulas"
                        : "Cadastrar e agendar procedimentos"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
