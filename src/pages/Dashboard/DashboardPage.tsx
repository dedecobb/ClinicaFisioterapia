import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Cake,
  Calendar as CalendarIcon,
  FileText,
  MessageCircle,
  Plus,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import { getDashboardData } from "./DashboardService";
import { BirthdayPatient, DashboardData } from "./types";

const emptyData: DashboardData = {
  stats: {
    activePatients: 0,
    todayAppointments: 0,
    monthRevenue: 0,
    overdueAmount: 0,
  },
  chartData: [],
  birthdays: [],
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type StatCardProps = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  loading: boolean;
  trend?: number;
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  trend = 0,
  color,
  loading,
}: StatCardProps) => (
  <Card className="relative overflow-hidden group">
    {loading ? (
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
      </div>
    ) : (
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <h3 className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
            {value}
          </h3>
          <div
            className={clsx(
              "flex items-center gap-1 mt-2 text-xs font-medium",
              trend >= 0 ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {trend >= 0 ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}
            {Math.abs(trend)}% vs mês anterior
          </div>
        </div>
        <div className={clsx("p-3 rounded-2xl text-white", color)}>
          <Icon size={24} />
        </div>
      </div>
    )}
    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
      <Icon size={80} />
    </div>
  </Card>
);

function buildReportHtml(data: DashboardData, clinicName: string): string {
  const rows = data.birthdays
    .map(
      (birthday) =>
        `<li>${birthday.name} - ${birthday.age} anos - ${birthday.label}</li>`,
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>Relatorio Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 32px; }
          h1 { margin-bottom: 4px; }
          .muted { color: #64748b; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 24px 0; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
          .value { font-size: 24px; font-weight: 700; margin-top: 8px; }
        </style>
      </head>
      <body>
        <h1>Relatorio da Clinica</h1>
        <p class="muted">${clinicName} - ${new Date().toLocaleDateString("pt-BR")}</p>
        <div class="grid">
          <div class="card"><span>Pacientes ativos</span><div class="value">${data.stats.activePatients}</div></div>
          <div class="card"><span>Consultas hoje</span><div class="value">${data.stats.todayAppointments}</div></div>
          <div class="card"><span>Faturamento do mes</span><div class="value">${currencyFormatter.format(data.stats.monthRevenue)}</div></div>
          <div class="card"><span>Inadimplencia</span><div class="value">${currencyFormatter.format(data.stats.overdueAmount)}</div></div>
        </div>
        <h2>Proximos aniversariantes</h2>
        <ul>${rows || "<li>Nenhum aniversariante nos proximos 7 dias.</li>"}</ul>
      </body>
    </html>
  `;
}

function openWhatsApp(patient: BirthdayPatient) {
  if (!patient.phone) return;
  const digits = patient.phone.replace(/\D/g, "");
  if (!digits) return;

  window.open(`https://wa.me/55${digits}`, "_blank", "noopener,noreferrer");
}

export const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!profile?.clinic_id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await getDashboardData(profile.clinic_id, profile);
        if (active) setDashboard(data);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Erro ao carregar dashboard.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [profile?.clinic_id]);

  const chartData = useMemo(
    () =>
      dashboard.chartData.length > 0
        ? dashboard.chartData
        : [{ name: "Sem dados", faturamento: 0, despesas: 0, saldo: 0 }],
    [dashboard.chartData],
  );

  const handlePrintReport = () => {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!reportWindow) return;

    reportWindow.document.write(
      buildReportHtml(dashboard, profile?.full_name ?? "Clinica"),
    );
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
            Olá, {profile?.full_name?.split(" ")[0] || "Doutor(a)"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Sua clínica está pronta para os atendimentos de hoje.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Pacientes Ativos"
          value={dashboard.stats.activePatients}
          icon={Users}
          trend={0}
          color="bg-blue-500"
          loading={loading}
        />
        <StatCard
          title="Faturamento Mês"
          value={currencyFormatter.format(dashboard.stats.monthRevenue)}
          icon={TrendingUp}
          trend={0}
          color="bg-emerald-500"
          loading={loading}
        />
        <StatCard
          title="Consultas Hoje"
          value={dashboard.stats.todayAppointments}
          icon={CalendarIcon}
          trend={0}
          color="bg-violet-500"
          loading={loading}
        />
        <StatCard
          title="Inadimplência"
          value={currencyFormatter.format(dashboard.stats.overdueAmount)}
          icon={AlertCircle}
          trend={0}
          color="bg-rose-500"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Desempenho Financeiro" className="lg:col-span-2">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => currencyFormatter.format(Number(value))}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorFat)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Próximos Aniversariantes" subtitle="Próximos 7 dias">
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
                <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : dashboard.birthdays.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum aniversariante nos próximos 7 dias.
              </p>
            ) : (
              dashboard.birthdays.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600">
                      <Cake size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {person.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {person.age} anos • {person.label}
                      </p>
                    </div>
                  </div>
                  <button
                    className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!person.phone}
                    onClick={() => openWhatsApp(person)}
                  >
                    <MessageCircle size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
