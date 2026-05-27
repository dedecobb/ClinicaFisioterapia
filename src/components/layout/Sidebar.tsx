import React from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  CreditCard, 
  Activity, 
  MessageSquare, 
  LogOut,
  UserCog
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';

export const Sidebar = () => {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Calendar, label: 'Agenda', path: '/agenda' },
    { icon: Users, label: 'Pacientes', path: '/pacientes' },
    { icon: CreditCard, label: 'Financeiro', path: '/financeiro' },
    ...(isAdmin ? [{ icon: MessageSquare, label: 'WhatsApp', path: '/whatsapp' }] : []),
    ...(isAdmin ? [{ icon: UserCog, label: 'Equipe', path: '/equipe' }] : []),
  ];

  return (
    <aside className="w-64 h-screen bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-200 dark:shadow-none">
          <Activity size={24} />
        </div>
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
          Biofisio
        </span>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                "flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group",
                isActive 
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400" 
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={20} className={clsx(isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span className="font-medium">{item.label}</span>
              </div>
              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-brand-600" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800">
        <button
          className="flex items-center gap-3 w-full px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/10 rounded-xl transition-colors"
          onClick={signOut}
        >
          <LogOut size={20} />
          <span className="font-medium">Sair</span>
        </button>
      </div>
    </aside>
  );
};
