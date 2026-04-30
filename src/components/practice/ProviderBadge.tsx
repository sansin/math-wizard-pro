'use client';

import { cn } from '@/lib/utils';
import { PROVIDER_INFO } from '@/lib/ai/provider-info';
import type { AIProviderId } from '@/types/core';

/**
 * Small badge that shows which AI provider generated (or which cache served)
 * the current question. Renders nothing if no provider info is available
 * (e.g., for curated bank questions).
 */
export interface ProviderBadgeProps {
  provider: string | null;
  source: string | null; // 'user' | 'admin' | 'cache' | null
  className?: string;
}

export function ProviderBadge({ provider, source, className }: ProviderBadgeProps) {
  if (!provider) return null;
  const info = PROVIDER_INFO[provider as AIProviderId];
  const label = info?.name ?? provider;

  // Different visual cue per source:
  //   user → "Your <Provider> key"
  //   admin → "<Provider> (shared)"
  //   cache → "<Provider> (cached)"
  let suffix = '';
  let tone: 'leaf' | 'spell' | 'wizard' = 'wizard';
  if (source === 'user') { suffix = '· your key'; tone = 'leaf'; }
  else if (source === 'admin') { suffix = '· shared'; tone = 'spell'; }
  else if (source === 'cache') { suffix = '· cached'; tone = 'wizard'; }

  const colors = {
    leaf:  'bg-leaf-50 text-leaf-700 border-leaf-200',
    spell: 'bg-spell-50 text-spell-700 border-spell-200',
    wizard:'bg-wizard-50 text-wizard-700 border-wizard-200',
  };

  return (
    <span
      title={`Powered by ${label}${suffix ? ' (' + suffix.replace('· ', '') + ')' : ''}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold',
        colors[tone],
        className,
      )}
    >
      <span aria-hidden>✨</span>
      <span>{label}</span>
      {suffix && <span className="opacity-70 font-normal">{suffix}</span>}
    </span>
  );
}
