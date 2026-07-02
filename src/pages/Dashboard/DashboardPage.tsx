import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Cake,
  Calendar as CalendarIcon,
  MessageCircle,
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
        <div className="hidden sm:block h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
      </div>
    ) : (
      <div className="flex items-center justify-between gap-3 sm:items-start">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <h3 className="mt-1 whitespace-nowrap text-lg font-bold leading-tight text-slate-900 dark:text-white min-[360px]:text-xl sm:text-2xl">
            {value}
          </h3>
          <div
            className={clsx(
              "mt-2 hidden items-center gap-1 text-xs font-medium sm:flex",
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
        <div className={clsx("shrink-0 p-3 rounded-xl sm:rounded-2xl text-white", color)}>
          <Icon size={22} />
        </div>
      </div>
    )}
    <div className="hidden sm:block absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
      <Icon size={80} />
    </div>
  </Card>
);

function openWhatsApp(patient: BirthdayPatient) {
  if (!patient.phone) return;
  const digits = patient.phone.replace(/\D/g, "");
  if (!digits) return;

  window.open(`https://wa.me/55${digits}`, "_blank", "noopener,noreferrer");
}

export const Dashboard = () => {
  const { profile } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isPhysio = profile?.role === "physio";

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
  }, [profile]);

  const chartData = useMemo(
    () =>
      dashboard.chartData.length > 0
        ? dashboard.chartData
        : [{ name: "Sem dados", faturamento: 0, despesas: 0, saldo: 0 }],
    [dashboard.chartData],
  );

  return (
    <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
            Olá, {profile?.full_name?.split(" ")[0] || "Doutor(a)"}
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">
            {isPhysio
              ? "Sua agenda e produção estão prontas para os atendimentos de hoje."
              : "Sua clínica está pronta para os atendimentos de hoje."}
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          title="Pacientes Ativos"
          value={dashboard.stats.activePatients}
          icon={Users}
          trend={0}
          color="bg-blue-500"
          loading={loading}
        />
        <StatCard
          title={isPhysio ? "Minha Produção Mês" : "Faturamento Mês"}
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
        {!isPhysio && (
          <StatCard
            title="Inadimplência"
            value={currencyFormatter.format(dashboard.stats.overdueAmount)}
            icon={AlertCircle}
            trend={0}
            color="bg-rose-500"
            loading={loading}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card
          title={isPhysio ? "Minha Produção Financeira" : "Desempenho Financeiro"}
          className="lg:col-span-2"
        >
          <div className="h-[220px] w-full sm:h-[300px]">
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
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  width={42}
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
                  strokeWidth={2.5}
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
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600">
                      <Cake size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {person.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {person.age} anos • {person.label}
                      </p>
                    </div>
                  </div>
                  <button
                    className="min-h-11 min-w-11 shrink-0 p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
