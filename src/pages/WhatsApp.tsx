import React from 'react';
import { clsx } from 'clsx';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  MessageSquare, 
  Settings, 
  CheckCircle2, 
  Clock, 
  Cake, 
  AlertTriangle,
  Zap,
  Play,
  Pause
} from 'lucide-react';

const automations = [
  { id: 1, title: 'Lembrete 24h', description: 'Enviado automaticamente um dia antes da consulta.', active: true, icon: Clock, type: 'Agendamento' },
  { id: 2, title: 'Confirmação Instantânea', description: 'Enviado assim que o horário é marcado.', active: true, icon: Zap, type: 'Agendamento' },
  { id: 3, title: 'Feliz Aniversário', description: 'Mensagem personalizada no dia do aniversário.', active: false, icon: Cake, type: 'Relacionamento' },
  { id: 4, title: 'Cobrança Automática', description: 'Lembrete de faturas pendentes ou atrasadas.', active: true, icon: AlertTriangle, type: 'Financeiro' },
];

export const WhatsApp = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">WhatsApp Business</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Automações inteligentes e relacionamento com pacientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="gap-2 py-1.5 px-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Conectado: (11) 99876-5432
          </Badge>
          <Button variant="outline" size="sm">
            <Settings size={18} />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {automations.map((a) => (
          <Card key={a.id} className="relative group">
            <div className="flex items-start justify-between mb-4">
              <div className={clsx(
                "p-3 rounded-2xl",
                a.active ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              )}>
                <a.icon size={24} />
              </div>
              <Badge variant={a.active ? 'success' : 'neutral'}>
                {a.active ? 'Ativo' : 'Pausado'}
              </Badge>
            </div>
            
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{a.title}</h3>
            <p className="text-sm text-slate-500 mt-1 mb-6">{a.description}</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{a.type}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm">Editar Template</Button>
                <Button variant={a.active ? 'outline' : 'primary'} size="sm" className="p-2">
                  {a.active ? <Pause size={18} /> : <Play size={18} />}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Métricas de Engajamento">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">1.240</p>
            <p className="text-sm text-slate-500 mt-1">Mensagens este mês</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-emerald-600">98%</p>
            <p className="text-sm text-slate-500 mt-1">Taxa de entrega</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-brand-600">82%</p>
            <p className="text-sm text-slate-500 mt-1">Taxa de confirmação</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
