import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HintLadder } from '@/components/practice/HintLadder';
import type { Hint } from '@/types/core';

const HINTS: [Hint, Hint, Hint] = [
  { level: 1, text: 'Think about the place values.' },
  { level: 2, text: 'Try breaking it into tens and ones.' },
  { level: 3, text: 'Add the tens column carefully — there might be a carry.' },
];

describe('HintLadder', () => {
  it('shows the prompt button initially', () => {
    render(<HintLadder hints={HINTS} onHintRevealed={() => {}} />);
    expect(screen.getByRole('button', { name: /need a hint/i })).toBeInTheDocument();
  });

  it('reveals hints progressively', () => {
    const onHintRevealed = vi.fn();
    render(<HintLadder hints={HINTS} onHintRevealed={onHintRevealed} />);
    fireEvent.click(screen.getByRole('button', { name: /need a hint/i }));
    expect(screen.getByText(HINTS[0].text)).toBeInTheDocument();
    expect(onHintRevealed).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: /more help/i }));
    expect(screen.getByText(HINTS[1].text)).toBeInTheDocument();
    expect(onHintRevealed).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: /one last nudge/i }));
    expect(screen.getByText(HINTS[2].text)).toBeInTheDocument();
    expect(onHintRevealed).toHaveBeenCalledWith(3);
  });

  it('hides the reveal button after all hints shown', () => {
    render(<HintLadder hints={HINTS} onHintRevealed={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /need a hint/i }));
    fireEvent.click(screen.getByRole('button', { name: /more help/i }));
    fireEvent.click(screen.getByRole('button', { name: /one last nudge/i }));
    expect(screen.queryByRole('button', { name: /hint|help|nudge/i })).not.toBeInTheDocument();
  });

  it('does not give away the answer in any hint', () => {
    // Sanity: hints should never mention "answer is" or specific final values.
    for (const h of HINTS) {
      expect(h.text.toLowerCase()).not.toContain('answer is');
    }
  });
});
