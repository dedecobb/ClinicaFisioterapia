import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { NewPatientModal } from '../components/modals/NewPatientModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  Search, 
  Plus, 
  MoreHorizontal, 
  MessageCircle, 
  Phone, 
  Calendar,
  Filter,
  User,
  Loader2
} from 'lucide-react';

export const Patients = () => {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const fetchPatients = async () => {
    if (!profile?.clinic_id) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', profile.clinic_id)
        .order('full_name', { ascending: true });

      if (searchTerm) {
        query = query.ilike('full_name', `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(fetchPatients, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, profile?.clinic_id]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Pacientes</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gerencie o histórico e dados dos seus alunos e pacientes.</p>
        </div>
        <Button className="gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Novo Paciente
        </Button>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder="Buscar por nome, CPF ou telefone..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter size={18} /> Filtros
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p>Carregando pacientes...</p>
        </div>
      ) : patients.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <User className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nenhum paciente encontrado</h3>
          <p className="text-slate-500">Comece cadastrando seu primeiro paciente.</p>
          <Button className="mt-6 gap-2" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Novo Paciente
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {patients.map((patient) => (
            <Card key={patient.id} className="group hover:border-brand-200 transition-all duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                  <User size={24} />
                </div>
                <button className="p-1.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                  <MoreHorizontal size={18} />
                </button>
              </div>
              
              <h3 className="font-bold text-slate-900 dark:text-white truncate">{patient.full_name}</h3>
              <p className="text-xs text-slate-500 mt-1">{patient.status === 'active' ? 'Ativo' : 'Inativo'}</p>
              
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Phone size={14} />
                  <span>{patient.phone || 'Sem telefone'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Calendar size={14} />
                  <span>Nascimento: {patient.birth_date || 'N/A'}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-2"
                  onClick={() => navigate(`/pacientes/${patient.id}/prontuario`)}
                >
                  Prontuário
                </Button>
                <Button variant="secondary" size="sm" className="text-emerald-600 dark:text-emerald-400">
                  <MessageCircle size={18} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewPatientModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchPatients}
      />
    </div>
  );
};
