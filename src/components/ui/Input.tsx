'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base',
        'placeholder:text-ink-400',
        'focus:border-wizard-400 focus:outline-none focus:ring-4 focus:ring-wizard-100',
        'disabled:bg-ink-50 disabled:text-ink-400',
        'transition-colors',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
