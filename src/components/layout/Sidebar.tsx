import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  CreditCard, 
  ReceiptText,
  FileText,
  Activity, 
  MessageSquare, 
  LogOut,
  UserCog,
  MoreHorizontal,
  X
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { messages } from '../../i18n';

export const Sidebar = () => {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isAdmin = profile?.role === "admin";
  const menuItems = [
    { icon: LayoutDashboard, label: messages.nav.dashboard, path: '/' },
    { icon: Calendar, label: messages.nav.agenda, path: '/agenda' },
    { icon: Users, label: messages.nav.patients, path: '/pacientes' },
    { icon: FileText, label: messages.nav.certificates, path: '/atestados' },
    { icon: CreditCard, label: messages.nav.financial, path: '/financeiro' },
    ...(isAdmin ? [{ icon: ReceiptText, label: messages.nav.invoices, path: '/notas-fiscais' }] : []),
    ...(isAdmin ? [{ icon: MessageSquare, label: messages.nav.whatsapp, path: '/whatsapp' }] : []),
    ...(isAdmin ? [{ icon: UserCog, label: messages.nav.team, path: '/equipe' }] : []),
  ];
  const primaryMobileItems = menuItems.slice(0, 4);
  const secondaryMobileItems = menuItems.slice(4);
  const isActivePath = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const closeMore = () => setIsMoreOpen(false);

  return (
    <>
    <aside className="hidden lg:flex w-64 h-screen bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex-col fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-200 dark:shadow-none">
          <Activity size={24} />
        </div>
        <span className="notranslate text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400" translate="no">
          {messages.app.brandName}
        </span>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        {menuItems.map((item) => {
          const isActive = isActivePath(item.path);
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
          <span className="font-medium">{messages.nav.logout}</span>
        </button>
      </div>
    </aside>
    {isMoreOpen && (
      <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true">
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/40"
          aria-label="Fechar menu"
          onClick={closeMore}
        />
        <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center text-white">
                <Activity size={20} />
              </div>
              <span className="notranslate text-base font-bold text-slate-900 dark:text-white" translate="no">
                {messages.app.brandName}
              </span>
            </div>
            <button
              type="button"
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
              aria-label="Fechar menu"
              onClick={closeMore}
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {secondaryMobileItems.map((item) => {
              const isActive = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMore}
                  className={clsx(
                    "min-h-12 rounded-xl border px-3 py-3 flex items-center gap-3 text-sm font-semibold",
                    isActive
                      ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-900/20 dark:text-brand-300"
                      : "border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300"
                  )}
                >
                  <item.icon size={18} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              className="min-h-12 rounded-xl border border-rose-100 px-3 py-3 flex items-center gap-3 text-sm font-semibold text-rose-600 dark:border-rose-900/40"
              onClick={() => {
                closeMore();
                signOut();
              }}
            >
              <LogOut size={18} />
              <span>{messages.nav.logout}</span>
            </button>
          </div>
        </div>
      </div>
    )}

    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200/90 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {primaryMobileItems.map((item) => {
          const isActive = isActivePath(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                "min-h-14 rounded-xl px-1 py-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <item.icon size={21} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={clsx(
            "min-h-14 rounded-xl px-1 py-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
            secondaryMobileItems.some((item) => isActivePath(item.path))
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
              : "text-slate-500 dark:text-slate-400"
          )}
          onClick={() => setIsMoreOpen(true)}
        >
          <MoreHorizontal size={21} />
          <span>Mais</span>
        </button>
      </div>
    </nav>
    </>
  );
};
