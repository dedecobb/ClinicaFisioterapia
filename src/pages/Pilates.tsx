import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  Users, 
  Calendar, 
  Clock, 
  Plus, 
  UserPlus,
  ChevronRight,
  Activity
} from 'lucide-react';

const classes = [
  { id: 1, time: '08:00', instructor: 'Dra. Beatriz', students: ['Ana Silva', 'Marcos Lima'], capacity: 3, type: 'Reformer' },
  { id: 2, time: '09:00', instructor: 'Dra. Beatriz', students: ['Carla Souza', 'Pedro Costa', 'Julia M.'], capacity: 3, type: 'Solo' },
  { id: 3, time: '10:00', instructor: 'Dr. Ricardo', students: ['Roberto F.'], capacity: 3, type: 'Mixed' },
];

export const Pilates = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Estúdio Pilates</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gestão de turmas, horários e créditos dos alunos.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Calendar size={18} /> Ver Grade
          </Button>
          <Button className="gap-2">
            <Plus size={18} /> Nova Turma
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3" title="Turmas de Hoje">
          <div className="space-y-4">
            {classes.map((c) => (
              <div key={c.id} className="group p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-brand-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex flex-col items-center justify-center text-brand-600">
                    <Clock size={20} />
                    <span className="text-xs font-bold mt-1">{c.time}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{c.type}</h4>
                    <p className="text-sm text-slate-500">Instrutor: {c.instructor}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {c.students.map((_, i) => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                        S{i+1}
                      </div>
                    ))}
                    {c.capacity > c.students.length && (
                      <div className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                        <Plus size={12} />
                      </div>
                    )}
                  </div>
                  <Badge variant={c.students.length === c.capacity ? 'danger' : 'success'}>
                    {c.students.length}/{c.capacity} Vagas
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">Presença</Button>
                  <Button variant="secondary" size="sm" className="p-2">
                    <ChevronRight size={18} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Ações Rápidas">
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3 h-12">
                <UserPlus size={18} /> Matricular Aluno
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12">
                <Activity size={18} /> Reposições Pendentes
              </Button>
            </div>
          </Card>

          <Card title="Vencimentos" subtitle="Próximos 7 dias">
            <div className="space-y-3">
              {[
                { name: 'Julia Mendes', days: '2 dias' },
                { name: 'Ricardo F.', days: '5 dias' },
              ].map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{p.name}</span>
                  <Badge variant="warning">{p.days}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
