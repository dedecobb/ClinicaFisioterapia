import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  ArrowLeft, 
  Mic, 
  FileText, 
  Clock, 
  Plus, 
  Paperclip, 
  History,
  Stethoscope,
  Activity,
  ChevronRight,
  Save,
  Trash2
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const mockTimeline = [
  { id: 1, date: '20 Mai, 2025', type: 'Evolução', professional: 'Dra. Beatriz', content: 'Paciente apresenta melhora na amplitude de movimento do ombro direito. Realizado exercícios de fortalecimento de manguito rotador.', category: 'Fisioterapia' },
  { id: 2, date: '15 Mai, 2025', type: 'Avaliação', professional: 'Dra. Beatriz', content: 'Avaliação inicial: Dor aguda em escala 8/10. Limitação funcional severa.', category: 'Fisioterapia' },
  { id: 3, date: '10 Mai, 2025', type: 'Anexo', professional: 'Secretaria', content: 'Upload de Ressonância Magnética do Ombro.', category: 'Exames' },
];

export const ClinicalHub = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [evolutionText, setEvolutionText] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'details' | 'files'>('timeline');

  const simulateVoiceToText = () => {
    setIsRecording(true);
    setTimeout(() => {
      setEvolutionText(prev => prev + "Paciente relata diminuição da dor após a última sessão. Realizamos mobilização articular grau II e exercícios de estabilização escapular. ");
      setIsRecording(false);
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/pacientes')}
            className="p-2 hover:bg-white dark:hover:bg-slate-900 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ricardo Mendes</h1>
            <p className="text-sm text-slate-500">CPF: 123.456.789-00 • 28 anos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Ativo</Badge>
          <Badge variant="info">Fisioterapia</Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: New Evolution Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Nova Evolução Clínica" subtitle="Registre o progresso da sessão de hoje">
            <div className="space-y-4">
              <div className="relative">
                <textarea 
                  className="w-full h-48 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none text-slate-700 dark:text-slate-300"
                  placeholder="Descreva o atendimento, condutas e observações..."
                  value={evolutionText}
                  onChange={(e) => setEvolutionText(e.target.value)}
                />
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button 
                    onClick={simulateVoiceToText}
                    className={clsx(
                      "p-3 rounded-full transition-all shadow-lg",
                      isRecording ? "bg-rose-500 text-white animate-pulse" : "bg-white dark:bg-slate-900 text-brand-600 hover:bg-brand-50"
                    )}
                  >
                    <Mic size={20} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Paperclip size={16} /> Anexar Exame
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Activity size={16} /> Protocolos
                  </Button>
                </div>
                <Button className="gap-2 px-8">
                  <Save size={18} /> Salvar Evolução
                </Button>
              </div>
            </div>
          </Card>

          <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800">
            {[
              { id: 'timeline', label: 'Linha do Tempo', icon: History },
              { id: 'details', label: 'Ficha Clínica', icon: FileText },
              { id: 'files', label: 'Documentos', icon: Paperclip },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                  activeTab === tab.id ? "text-brand-600" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600" />
                )}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {activeTab === 'timeline' && (
              <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {mockTimeline.map((item) => (
                  <div key={item.id} className="relative">
                    <div className="absolute -left-[29px] top-1 w-6 h-6 rounded-full bg-white dark:bg-slate-950 border-4 border-brand-500 z-10" />
                    <Card className="hover:border-brand-200 transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">{item.type}</span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500">{item.date}</span>
                          </div>
                          <h4 className="font-bold text-slate-900 dark:text-white mt-1">{item.category}</h4>
                        </div>
                        <Badge variant="neutral">{item.professional}</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {item.content}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <Button variant="ghost" size="sm" className="text-slate-400">Editar</Button>
                        <Button variant="ghost" size="sm" className="text-rose-400"><Trash2 size={16} /></Button>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quick Info */}
        <div className="space-y-6">
          <Card title="Resumo Clínico">
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-bold text-slate-400 uppercase">Queixa Principal</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white mt-1">Dor lombar crônica irradiada para membro inferior esquerdo.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-bold text-slate-400 uppercase">Diagnóstico</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white mt-1">Hérnia de disco L4-L5.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50">
                  <p className="text-xs font-bold text-blue-600 uppercase">Sessões</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">12/20</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50">
                  <p className="text-xs font-bold text-emerald-600 uppercase">Presença</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">95%</p>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Próximos Passos">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="p-2 bg-brand-50 dark:bg-brand-900/20 text-brand-600 rounded-lg">
                  <Stethoscope size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Reavaliação</p>
                  <p className="text-xs text-slate-500">Agendada para 05 Jun</p>
                </div>
              </div>
              <Button variant="outline" className="w-full gap-2">
                <Plus size={18} /> Novo Alerta
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
