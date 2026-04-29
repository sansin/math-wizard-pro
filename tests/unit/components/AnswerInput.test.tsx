import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnswerInput } from '@/components/math/AnswerInput';

describe('AnswerInput', () => {
  it('renders a text input for numeric questions', () => {
    render(
      <AnswerInput expectedType="numeric" value="" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(screen.getByRole('textbox', { name: /your answer/i })).toBeInTheDocument();
  });

  it('calls onChange as user types', () => {
    const onChange = vi.fn();
    render(<AnswerInput expectedType="numeric" value="" onChange={onChange} onSubmit={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith('42');
  });

  it('calls onSubmit on Enter', () => {
    const onSubmit = vi.fn();
    render(<AnswerInput expectedType="numeric" value="42" onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('renders option buttons for multipleChoice', () => {
    render(
      <AnswerInput
        expectedType="multipleChoice"
        choices={['Apple', 'Banana', 'Cherry']}
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Apple/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cherry/ })).toBeInTheDocument();
  });

  it('selects an option on click', () => {
    const onChange = vi.fn();
    render(
      <AnswerInput
        expectedType="multipleChoice"
        choices={['One', 'Two', 'Three']}
        value=""
        onChange={onChange}
        onSubmit={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Two/ }));
    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('shows correct status styling', () => {
    const { container } = render(
      <AnswerInput expectedType="numeric" value="42" onChange={() => {}} onSubmit={() => {}} status="correct" />,
    );
    expect(container.querySelector('input')?.className).toContain('border-leaf-500');
  });

  it('shows wrong status styling', () => {
    const { container } = render(
      <AnswerInput expectedType="numeric" value="42" onChange={() => {}} onSubmit={() => {}} status="wrong" />,
    );
    expect(container.querySelector('input')?.className).toContain('border-ember-500');
  });
});
