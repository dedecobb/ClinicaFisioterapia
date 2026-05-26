import React from 'react';
import { clsx } from 'clsx';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Plus, 
  Download, 
  Filter,
  Search,
  MoreHorizontal
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

const data = [
  { name: 'Jan', value: 4500 },
  { name: 'Fev', value: 5200 },
  { name: 'Mar', value: 4800 },
  { name: 'Abr', value: 6100 },
  { name: 'Mai', value: 5900 },
  { name: 'Jun', value: 7200 },
];

const transactions = [
  { id: 1, patient: 'Ana Oliveira', category: 'Sessão Pilates', amount: 150.00, status: 'paid', date: '20 Mai, 2025' },
  { id: 2, patient: 'Carlos Lima', category: 'Fisioterapia', amount: 220.00, status: 'pending', date: '21 Mai, 2025' },
  { id: 3, patient: 'Fornecedor XYZ', category: 'Equipamentos', amount: -850.00, status: 'paid', date: '19 Mai, 2025' },
  { id: 4, patient: 'Beatriz Silva', category: 'Sessão Pilates', amount: 150.00, status: 'overdue', date: '15 Mai, 2025' },
];

export const Financial = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Financeiro</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Controle seu fluxo de caixa e faturamento.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Download size={18} /> Exportar
          </Button>
          <Button className="gap-2">
            <Plus size={18} /> Nova Transação
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Receita Total</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">R$ 12.450,00</h3>
            </div>
            <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-lg shadow-emerald-200 dark:shadow-none">
              <TrendingUp size={24} />
            </div>
          </div>
        </Card>

        <Card className="bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Despesas</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">R$ 4.120,00</h3>
            </div>
            <div className="p-3 bg-rose-500 rounded-2xl text-white shadow-lg shadow-rose-200 dark:shadow-none">
              <TrendingDown size={24} />
            </div>
          </div>
        </Card>

        <Card className="bg-brand-50/50 dark:bg-brand-900/10 border-brand-100 dark:border-brand-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-600 dark:text-brand-400">Saldo Líquido</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">R$ 8.330,00</h3>
            </div>
            <div className="p-3 bg-brand-600 rounded-2xl text-white shadow-lg shadow-brand-200 dark:shadow-none">
              <DollarSign size={24} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Crescimento Mensal" className="lg:col-span-2">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === data.length - 1 ? '#0ea5e9' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Resumo de Status">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Pagos</span>
              </div>
              <span className="font-bold text-slate-900 dark:text-white">85%</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Pendentes</span>
              </div>
              <span className="font-bold text-slate-900 dark:text-white">12%</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Atrasados</span>
              </div>
              <span className="font-bold text-slate-900 dark:text-white">3%</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Últimas Transações</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none w-64"
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter size={16} />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Paciente / Descrição</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.patient}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{t.category}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{t.date}</td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      "text-sm font-bold",
                      t.amount > 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {t.amount > 0 ? '+' : ''} R$ {Math.abs(t.amount).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={t.status === 'paid' ? 'success' : t.status === 'pending' ? 'warning' : 'danger'}>
                      {t.status === 'paid' ? 'Pago' : t.status === 'pending' ? 'Pendente' : 'Atrasado'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
