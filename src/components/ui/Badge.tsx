import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  className?: string;
}

export const Badge = ({ children, variant = 'neutral', className }: BadgeProps) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-100 dark:border-amber-800',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border-rose-100 dark:border-rose-800',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-800',
    neutral: 'bg-slate-50 text-slate-700 dark:bg-slate-900/20 dark:text-slate-400 border-slate-100 dark:border-slate-800',
  };

  return (
    <span className={clsx(
      "notranslate px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors",
      variants[variant],
      className
    )} translate="no">
      {children}
    </span>
  );
};
