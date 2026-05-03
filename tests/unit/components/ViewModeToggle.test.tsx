import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewModeToggle } from '@/components/practice/ViewModeToggle';

describe('ViewModeToggle', () => {
  it('renders two segmented options', () => {
    render(<ViewModeToggle value="grade" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /by grade/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /by module/i })).toBeTruthy();
  });

  it('marks the active value with aria-checked=true', () => {
    render(<ViewModeToggle value="grade" onChange={() => {}} />);
    const grade = screen.getByRole('radio', { name: /by grade/i });
    const module = screen.getByRole('radio', { name: /by module/i });
    expect(grade.getAttribute('aria-checked')).toBe('true');
    expect(module.getAttribute('aria-checked')).toBe('false');
  });

  it("emits onChange('module') when the user clicks 'By module'", () => {
    const onChange = vi.fn();
    render(<ViewModeToggle value="grade" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /by module/i }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('module');
  });

  it("emits onChange('grade') when the user clicks 'By grade'", () => {
    const onChange = vi.fn();
    render(<ViewModeToggle value="module" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /by grade/i }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('grade');
  });

  it('exposes radiogroup role with a label', () => {
    render(<ViewModeToggle value="grade" onChange={() => {}} />);
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-label')).toMatch(/layout/i);
  });
});
