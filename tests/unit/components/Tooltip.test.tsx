import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '@/components/ui/Tooltip';

describe('Tooltip', () => {
  it('hides the popover content by default', () => {
    render(
      <Tooltip content={<span>Help text</span>} triggerLabel="Help">
        <span>!</span>
      </Tooltip>,
    );
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('shows content on mouse enter and hides on mouse leave', () => {
    render(
      <Tooltip content={<span>Help text</span>} triggerLabel="Help">
        <span>!</span>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: /help/i });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Help text')).toBeTruthy();
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('toggles open on click for touch devices', () => {
    render(
      <Tooltip content={<span>Help text</span>} triggerLabel="Help">
        <span>!</span>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: /help/i });
    fireEvent.click(trigger);
    expect(screen.getByText('Help text')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('shows on focus and hides on blur', () => {
    render(
      <Tooltip content={<span>Help text</span>} triggerLabel="Help">
        <span>!</span>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: /help/i });
    fireEvent.focus(trigger);
    expect(screen.getByText('Help text')).toBeTruthy();
    fireEvent.blur(trigger);
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('closes on Escape key', () => {
    render(
      <Tooltip content={<span>Help text</span>} triggerLabel="Help">
        <span>!</span>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: /help/i });
    fireEvent.click(trigger);
    expect(screen.getByText('Help text')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Help text')).toBeNull();
  });

  it('sets aria-describedby on the trigger when open', () => {
    render(
      <Tooltip content={<span>Help text</span>} triggerLabel="Help">
        <span>!</span>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: /help/i });
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
    fireEvent.click(trigger);
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // The id should resolve to the tooltip element.
    if (describedBy) {
      expect(document.getElementById(describedBy)).not.toBeNull();
    }
  });

  it('does not bubble click to parent onClick', () => {
    const parentClick = (e: React.MouseEvent) => {
      // If this fires, e.defaultPrevented is the canary the test would
      // miss — we rely on stopPropagation.
      throw new Error('Parent onClick should not fire');
    };
    render(
      <div onClick={parentClick}>
        <Tooltip content={<span>Help</span>} triggerLabel="Help">
          <span>!</span>
        </Tooltip>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: /help/i });
    // Should not throw — stopPropagation prevents the parent handler.
    expect(() => fireEvent.click(trigger)).not.toThrow();
  });
});
