'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-wizard-500 text-white shadow-wizard hover:bg-wizard-600 active:bg-wizard-700 focus-visible:ring-wizard-400',
  secondary:
    'bg-white text-ink-900 border border-ink-200 hover:border-wizard-300 hover:bg-wizard-50 active:bg-wizard-100',
  ghost:
    'bg-transparent text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger:
    'bg-ember-500 text-white shadow-sm hover:bg-ember-600 active:bg-ember-700 focus-visible:ring-ember-400',
  success:
    'bg-leaf-500 text-white shadow-sm hover:bg-leaf-600 active:bg-leaf-700 focus-visible:ring-leaf-400',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-5 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
  xl: 'h-14 px-7 text-lg rounded-2xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, iconLeft, iconRight, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
          'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </span>
        ) : null}
        <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0')}>
          {iconLeft}
          {children}
          {iconRight}
        </span>
      </button>
    );
  },
);
Button.displayName = 'Button';

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
