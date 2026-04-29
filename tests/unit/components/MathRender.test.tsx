import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MathRender } from '@/components/math/MathRender';

describe('MathRender', () => {
  it('renders plain text passthrough', () => {
    const { container } = render(<MathRender>Hello world</MathRender>);
    expect(container.textContent).toContain('Hello world');
  });

  it('renders inline LaTeX', () => {
    const { container } = render(
      <MathRender>{'What is $\\frac{1}{2}$?'}</MathRender>,
    );
    // KaTeX produces span.katex
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('renders block LaTeX in a block element', () => {
    const { container } = render(
      <MathRender>{'$$x^2 + y^2 = z^2$$'}</MathRender>,
    );
    expect(container.querySelector('.katex-display, .katex')).toBeTruthy();
  });

  it('handles malformed LaTeX gracefully', () => {
    const { container } = render(
      <MathRender>{'$\\unknown{'}</MathRender>,
    );
    // throwOnError: false means it still renders
    expect(container.textContent).toBeTruthy();
  });
});
