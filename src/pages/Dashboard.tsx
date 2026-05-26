import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  AlertCircle,
  MessageCircle,
  Cake,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';

const chartData = [
  { name: 'Seg', faturamento: 4000 },
  { name: 'Ter', faturamento: 3000 },
  { name: 'Qua', faturamento: 5000 },
  { name: 'Qui', faturamento: 2780 },
  { name: 'Sex', faturamento: 1890 },
  { name: 'Sab', faturamento: 2390 },
];

const StatCard = ({ title, value, icon: Icon, trend, color, loading }: any) => (
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
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <h3 className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{value}</h3>
          <div className={clsx(
            "flex items-center gap-1 mt-2 text-xs font-medium",
            trend >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
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

export const Dashboard = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    patients: 0,
    appointments: 0,
    revenue: 0,
    overdue: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!profile?.clinic_id) return;

      try {
        // Fetch patient count for this clinic
        const { count: patientCount } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', profile.clinic_id);

        // Fetch today's appointments for this clinic
        const today = new Date().toISOString().split('T')[0];
        const { count: appointmentCount } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', profile.clinic_id)
          .gte('start_time', `${today}T00:00:00`)
          .lte('start_time', `${today}T23:59:59`);

        // Fetch revenue (paid transactions this month) for this clinic
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('clinic_id', profile.clinic_id)
          .eq('status', 'paid')
          .gte('created_at', firstDayOfMonth.toISOString());

        const totalRevenue = transactions?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

        setStats({
          patients: patientCount || 0,
          appointments: appointmentCount || 0,
          revenue: totalRevenue,
          overdue: 0
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [profile?.clinic_id]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
            Olá, {profile?.full_name?.split(' ')[0] || 'Doutor(a)'} 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Sua clínica está pronta para os atendimentos de hoje.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            Relatório PDF
          </button>
          <button className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 shadow-lg shadow-brand-200 dark:shadow-none transition-all">
            Novo Agendamento
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Pacientes Ativos" value={stats.patients} icon={Users} trend={12} color="bg-blue-500" loading={loading} />
        <StatCard title="Faturamento Mês" value={`R$ ${stats.revenue.toLocaleString()}`} icon={TrendingUp} trend={8} color="bg-emerald-500" loading={loading} />
        <StatCard title="Consultas Hoje" value={stats.appointments} icon={CalendarIcon} trend={-2} color="bg-violet-500" loading={loading} />
        <StatCard title="Inadimplência" value="R$ 0" icon={AlertCircle} trend={0} color="bg-rose-500" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Desempenho Financeiro" className="lg:col-span-2">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="faturamento" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorFat)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Próximos Aniversariantes" subtitle="Esta semana">
          <div className="space-y-4">
            {[
              { name: 'João Silva', date: 'Hoje', age: 28 },
              { name: 'Maria Santos', date: 'Amanhã', age: 34 },
              { name: 'Pedro Costa', date: '22 Mai', age: 45 },
            ].map((person, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600">
                    <Cake size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{person.name}</p>
                    <p className="text-xs text-slate-500">{person.age} anos • {person.date}</p>
                  </div>
                </div>
                <button className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors">
                  <MessageCircle size={18} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
