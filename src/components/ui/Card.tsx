import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export const Card = ({ children, className, title, subtitle }: CardProps) => {
  return (
    <div className={cn("bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden", className)}>
      {(title || subtitle) && (
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 dark:border-slate-800">
          {title && <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
};
