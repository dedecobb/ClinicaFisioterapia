import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Loader2,
  MessageCircle,
  Search,
  Send,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type PatientContact = {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  lesson_packages: {
    id: string;
    total_lessons: number;
    completed_lessons: number;
    missed_lessons: number;
    total_amount: number | string;
    amount_paid: number | string;
    payment_status: string;
    status: string;
    package_installments: {
      id: string;
      installment_number: number;
      amount: number | string;
      amount_paid: number | string;
      due_date: string;
      status: string;
    }[];
  }[];
  appointments: {
    id: string;
    start_time: string;
    status: string;
    package_lesson_number: number | null;
    profiles: { full_name: string } | null;
  }[];
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function getActivePackage(patient: PatientContact) {
  return patient.lesson_packages.find((item) => item.status === "ativo");
}

function getCurrentInstallment(patient: PatientContact) {
  const activePackage = getActivePackage(patient);
  if (!activePackage) return null;

  return [...(activePackage.package_installments ?? [])]
    .sort((a, b) => a.installment_number - b.installment_number)
    .find((item) => item.status !== "pago") ?? null;
}

function getRemainingInstallment(
  installment: ReturnType<typeof getCurrentInstallment>,
) {
  if (!installment) return 0;
  return Math.max(money(installment.amount) - money(installment.amount_paid), 0);
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function getNextAppointment(patient: PatientContact) {
  return patient.appointments
    .filter((item) => ["agendada", "confirmada"].includes(item.status))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
}

export const WhatsApp = () => {
  const { profile } = useAuth();
  const [patients, setPatients] = useState<PatientContact[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      if (!profile?.clinic_id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("patients")
        .select(
          `
          id,
          full_name,
          phone,
          status,
          lesson_packages (
            id,
            total_lessons,
            completed_lessons,
            missed_lessons,
            total_amount,
            amount_paid,
            payment_status,
            status,
            package_installments (
              id,
              installment_number,
              amount,
              amount_paid,
              due_date,
              status
            )
          ),
          appointments (
            id,
            start_time,
            status,
            package_lesson_number,
            profiles (full_name)
          )
        `,
        )
        .eq("clinic_id", profile.clinic_id)
        .order("full_name", { ascending: true });

      if (!active) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setPatients((data ?? []) as unknown as PatientContact[]);
      setLoading(false);
    }

    loadContacts();

    return () => {
      active = false;
    };
  }, [profile?.clinic_id]);

  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return patients;

    return patients.filter(
      (patient) =>
        patient.full_name.toLowerCase().includes(term) ||
        onlyDigits(patient.phone).includes(onlyDigits(term)),
    );
  }, [patients, searchTerm]);

  const metrics = useMemo(() => {
    const withPhone = patients.filter((patient) => onlyDigits(patient.phone));
    const openPayments = patients.filter((patient) => {
      return Boolean(getCurrentInstallment(patient));
    });
    const upcoming = patients.filter((patient) => getNextAppointment(patient));

    return {
      contacts: withPhone.length,
      openPayments: openPayments.length,
      upcoming: upcoming.length,
    };
  }, [patients]);

  if (profile?.role !== "admin") {
    return (
      <Card>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Acesso restrito
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Apenas a administradora pode enviar mensagens gerais e cobranças.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            WhatsApp
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Converse com pacientes usando o WhatsApp cadastrado.
          </p>
        </div>
        <Badge variant="info" className="gap-2 py-1.5 px-4">
          <MessageCircle size={14} />
          Abertura via WhatsApp Web
        </Badge>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard label="Contatos com WhatsApp" value={metrics.contacts} />
        <MetricCard label="Com pagamento em aberto" value={metrics.openPayments} />
        <MetricCard label="Com próxima aula" value={metrics.upcoming} />
      </div>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={20}
        />
        <input
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
          placeholder="Buscar paciente ou telefone..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p>Carregando contatos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredPatients.map((patient) => {
            const activePackage = getActivePackage(patient);
            const nextAppointment = getNextAppointment(patient);
            const currentInstallment = getCurrentInstallment(patient);
            const remainingPayment = getRemainingInstallment(currentInstallment);
            const remainingLessons = activePackage
              ? Math.max(
                  activePackage.total_lessons -
                    activePackage.completed_lessons -
                    activePackage.missed_lessons,
                  0,
                )
              : 0;

            const hasPhone = Boolean(onlyDigits(patient.phone));

            return (
              <Card key={patient.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      {patient.full_name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {patient.phone || "Sem WhatsApp cadastrado"}
                    </p>
                  </div>
                  <Badge variant={hasPhone ? "success" : "warning"}>
                    {hasPhone ? "WhatsApp OK" : "Sem telefone"}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase">
                      Próxima aula
                    </p>
                    <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                      {nextAppointment
                        ? formatDateTime(nextAppointment.start_time)
                        : "Sem aula agendada"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase">
                      Pacote
                    </p>
                    <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                      {activePackage
                        ? `${remainingLessons} aulas restantes`
                        : "Sem pacote ativo"}
                    </p>
                  </div>
                </div>

                {remainingPayment > 0 && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle size={16} />
                    Parcela atual em aberto:{" "}
                    {currencyFormatter.format(remainingPayment)}
                    {currentInstallment
                      ? ` · vence em ${formatDate(currentInstallment.due_date)}`
                      : ""}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={!hasPhone}
                    onClick={() =>
                      openWhatsApp(
                        patient.phone,
                        `Olá, ${patient.full_name}! Tudo bem?`,
                      )
                    }
                  >
                    <Send size={15} /> Conversar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={!hasPhone || !nextAppointment}
                    onClick={() =>
                      openWhatsApp(
                        patient.phone,
                        `Olá, ${patient.full_name}! Confirmando sua aula de Pilates em ${nextAppointment ? formatDateTime(nextAppointment.start_time) : ""}. Responda: 1 para confirmar presença ou 2 para informar ausência.`,
                      )
                    }
                  >
                    <Calendar size={15} /> Confirmar aula
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={!hasPhone || remainingPayment <= 0}
                    onClick={() =>
                      openWhatsApp(
                        patient.phone,
                        `Olá, ${patient.full_name}! A parcela ${currentInstallment?.installment_number ?? ""} do seu pacote de Pilates vence em ${currentInstallment ? formatDate(currentInstallment.due_date) : ""} no valor de ${currencyFormatter.format(remainingPayment)}. Posso te enviar os dados para pagamento?`,
                      )
                    }
                  >
                    <AlertTriangle size={15} /> Cobrar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {value}
      </p>
    </Card>
  );
}
