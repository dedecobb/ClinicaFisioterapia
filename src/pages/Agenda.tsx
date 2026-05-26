import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  User, 
  Filter,
  MoreVertical
} from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx } from 'clsx';

export const Agenda = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });

  const weekDays = Array.from({ length: 6 }).map((_, i) => addDays(startDate, i));

  const timeSlots = Array.from({ length: 12 }).map((_, i) => `${i + 8}:00`);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Agenda</h1>
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <span className="px-4 text-sm font-semibold min-w-[140px] text-center">
              {format(startDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Filter size={18} /> Filtrar
          </Button>
          <Button className="gap-2">
            <Plus size={18} /> Novo Horário
          </Button>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          <div className="p-4 border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50" />
          {weekDays.map((day, i) => (
            <div key={i} className="p-4 text-center border-r border-slate-100 dark:border-slate-800 last:border-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {format(day, "eee", { locale: ptBR })}
              </p>
              <p className={clsx(
                "text-lg font-bold mt-1",
                format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') 
                  ? "text-brand-600" 
                  : "text-slate-900 dark:text-white"
              )}>
                {format(day, "dd")}
              </p>
            </div>
          ))}
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {timeSlots.map((time, i) => (
            <div key={i} className="grid grid-cols-7 border-b border-slate-50 dark:border-slate-800/50 last:border-0 group">
              <div className="p-4 border-r border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 text-xs font-medium text-slate-400 flex items-center justify-center">
                {time}
              </div>
              {weekDays.map((_, j) => (
                <div key={j} className="p-2 border-r border-slate-100 dark:border-slate-800 last:border-0 min-h-[80px] relative hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  {/* Mock Appointment */}
                  {i === 2 && j === 0 && (
                    <div className="absolute inset-1 p-2 bg-brand-50 dark:bg-brand-900/20 border-l-4 border-brand-500 rounded-lg shadow-sm cursor-pointer hover:scale-[1.02] transition-transform z-10">
                      <p className="text-[10px] font-bold text-brand-700 dark:text-brand-400 uppercase">Fisioterapia</p>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">Ricardo Mendes</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
