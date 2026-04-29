'use client';

import * as React from 'react';
import katex from 'katex';

/**
 * Render a string that may contain inline `$...$` and block `$$...$$`
 * LaTeX along with regular text. Falls back gracefully on parse errors.
 */
export interface MathRenderProps {
  children: string;
  className?: string;
}

const SPLIT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

export function MathRender({ children, className }: MathRenderProps) {
  const parts = React.useMemo(() => {
    const out: Array<{ kind: 'text' | 'math'; display: boolean; value: string }> = [];
    const tokens = children.split(SPLIT_RE);
    for (const t of tokens) {
      if (!t) continue;
      if (t.startsWith('$$') && t.endsWith('$$')) {
        out.push({ kind: 'math', display: true, value: t.slice(2, -2) });
      } else if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
        out.push({ kind: 'math', display: false, value: t.slice(1, -1) });
      } else {
        out.push({ kind: 'text', display: false, value: t });
      }
    }
    return out;
  }, [children]);

  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.value}</span>;
        let html = '';
        try {
          html = katex.renderToString(p.value, {
            displayMode: p.display,
            throwOnError: false,
            output: 'htmlAndMathml',
          });
        } catch {
          html = `<span>${p.value}</span>`;
        }
        return p.display
          ? <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
          : <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
