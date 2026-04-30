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

/**
 * Inline math `$...$` is matched only when:
 *   - content is at most 60 chars (typical inline math is short),
 *   - the first char after `$` is non-whitespace,
 *   - the char before the closing `$` is non-whitespace,
 *   - the content does not look like a full English sentence (we reject if
 *     it contains 3+ "word-like" tokens of 3+ alphabetic chars separated
 *     by spaces — otherwise `$12 more than twice ... $26` would render the
 *     middle as math and strip the spaces).
 *
 * Block math `$$...$$` is matched permissively (any length).
 */
const BLOCK_MATH = /\$\$[\s\S]+?\$\$/g;
const INLINE_MATH = /\$(?=\S)[^$\n]{0,60}?(?<=\S)\$/g;
const SPLIT_RE = new RegExp(`(${BLOCK_MATH.source}|${INLINE_MATH.source})`, 'g');

/** Heuristic: is `content` an English sentence rather than math? */
function looksLikeProse(content: string): boolean {
  const words = content.match(/[a-zA-Z]{3,}/g) ?? [];
  return words.length >= 3;
}

export function MathRender({ children, className }: MathRenderProps) {
  const parts = React.useMemo(() => {
    const out: Array<{ kind: 'text' | 'math'; display: boolean; value: string }> = [];
    const tokens = children.split(SPLIT_RE);
    for (const t of tokens) {
      if (!t) continue;
      if (t.startsWith('$$') && t.endsWith('$$')) {
        out.push({ kind: 'math', display: true, value: t.slice(2, -2) });
      } else if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
        const inner = t.slice(1, -1);
        // Final guard: even if the regex matched, if the content looks like
        // English prose (e.g., the AI emitted `$12 more than twice...$`),
        // render it as plain text instead of stripping whitespace.
        if (looksLikeProse(inner)) {
          out.push({ kind: 'text', display: false, value: t });
        } else {
          out.push({ kind: 'math', display: false, value: inner });
        }
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
