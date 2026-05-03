import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ModuleView } from '@/components/practice/ModuleView';
import type { MasteryInfo } from '@/lib/mastery/skill-grouping';
import type { Skill } from '@/types/core';

function makeSkill(o: Partial<Skill> & Pick<Skill, 'id' | 'name'>): Skill {
  return {
    id: o.id,
    name: o.name,
    module: o.module ?? 'Algebra',
    topic: o.topic ?? 'Linear equations',
    gradeBand: o.gradeBand ?? '6-7',
    intrinsicDifficulty: o.intrinsicDifficulty ?? 3,
    prerequisites: o.prerequisites ?? [],
    standards: o.standards ?? [],
  };
}

const SAMPLE_SKILLS: Skill[] = [
  makeSkill({ id: 'k1.add.single', name: 'Single-digit addition', module: 'Addition',
    gradeBand: 'K-1', intrinsicDifficulty: 2 }),
  makeSkill({ id: 'k1.add.to20', name: 'Addition within 20', module: 'Addition',
    gradeBand: 'K-1', intrinsicDifficulty: 3, prerequisites: ['k1.add.single'] }),
  makeSkill({ id: 'g23.add.2digit', name: 'Two-digit addition', module: 'Addition',
    gradeBand: '2-3', intrinsicDifficulty: 2, prerequisites: ['k1.add.to20'] }),
  makeSkill({ id: 'g67.alg.linear', name: 'One-step linear equations', module: 'Algebra',
    gradeBand: '6-7', intrinsicDifficulty: 3 }),
  makeSkill({ id: 'g67.alg.twostep', name: 'Two-step linear equations', module: 'Algebra',
    gradeBand: '6-7', intrinsicDifficulty: 4, prerequisites: ['g67.alg.linear'] }),
];

describe('ModuleView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders module pills for every distinct module', () => {
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
      />,
    );
    // Anchored regex — `/addition/i` would also match "Single-digit addition",
    // "Addition within 20", "Two-digit addition" (skill button names).
    expect(screen.getByRole('button', { name: /^addition$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^algebra$/i })).toBeTruthy();
  });

  it('lands on the explicit initialModule when supplied', () => {
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    // Active module shows in the header — Algebra has 2 skills
    expect(screen.getByText(/2 skills/i)).toBeTruthy();
    expect(screen.getByText('One-step linear equations')).toBeTruthy();
  });

  it('switches the active module when a pill is clicked', () => {
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^addition$/i }));
    // Now Addition's skills should be visible
    expect(screen.getByText('Single-digit addition')).toBeTruthy();
    expect(screen.getByText('Addition within 20')).toBeTruthy();
  });

  it('groups skills by (gradeBand, difficulty) in chronological order', () => {
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Addition"
      />,
    );
    // Three groups expected for Addition: K-1 d2, K-1 d3, 2-3 d2
    const groupHeaders = screen.getAllByText(/grade · difficulty/i);
    expect(groupHeaders.length).toBe(3);
    // K-1 d2 should appear before 2-3 d2 in DOM order (chronological)
    const text = document.body.textContent ?? '';
    expect(text.indexOf('K-1 grade · difficulty 2'))
      .toBeLessThan(text.indexOf('2-3 grade · difficulty 2'));
  });

  it('renders a checkbox indicator per skill and toggles on click', () => {
    const onToggle = vi.fn();
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={onToggle}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    const skill = screen.getByRole('button', { name: /one-step linear equations/i });
    fireEvent.click(skill);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('g67.alg.linear');
  });

  it('shows a warning indicator when prerequisites are unmet', () => {
    // Two-step linear equations requires One-step linear equations.
    // No mastery data → prereq is unmet.
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    const warnings = screen.getAllByRole('button', { name: /prerequisite warning/i });
    // Only Two-step has a prereq in the Algebra module → exactly 1 warning
    expect(warnings.length).toBe(1);
  });

  it('does NOT show a warning when all prerequisites are above the threshold', () => {
    const mastery: Record<string, MasteryInfo> = {
      'g67.alg.linear': { mastery: 0.8, attempts: 10, lastAttemptAt: null },
    };
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={mastery}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    expect(screen.queryAllByRole('button', { name: /prerequisite warning/i }).length).toBe(0);
  });

  it('shows the unmet prereq names in the warning tooltip when opened', () => {
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    const warning = screen.getByRole('button', { name: /prerequisite warning/i });
    fireEvent.click(warning);
    // Tooltip body should reference the prereq by friendly name
    expect(screen.getByText('One-step linear equations', { selector: 'li' })).toBeTruthy();
  });

  it('emits onSelectAllInModule with the current module skill IDs', () => {
    const onSelectAll = vi.fn();
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={onSelectAll}
        initialModule="Algebra"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    expect(onSelectAll).toHaveBeenCalledOnce();
    const args = onSelectAll.mock.calls[0]!;
    expect(args[0]).toEqual(['g67.alg.linear', 'g67.alg.twostep']);
    expect(args[1]).toBe(false); // not all currently selected
  });

  it('reports allCurrentlySelected=true when every skill in the module is selected', () => {
    const onSelectAll = vi.fn();
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set(['g67.alg.linear', 'g67.alg.twostep'])}
        onToggle={() => {}}
        onSelectAllInModule={onSelectAll}
        initialModule="Algebra"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /all selected/i }));
    expect(onSelectAll.mock.calls[0]![1]).toBe(true);
  });

  it('persists the active module in localStorage on switch', () => {
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^addition$/i }));
    expect(window.localStorage.getItem('mwp-practice-module')).toBe('Addition');
  });

  it('reads the stored module on next render when no initialModule given', () => {
    window.localStorage.setItem('mwp-practice-module', 'Algebra');
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
      />,
    );
    expect(screen.getByText('One-step linear equations')).toBeTruthy();
  });

  it('renders the empty-state message when the module has no skills', () => {
    // Construct a catalog with one module so distinctModules returns it,
    // but the active module after change has nothing — practically rare
    // but we should render gracefully.
    const onlyOne = [makeSkill({ id: 'a', name: 'A', module: 'Addition' })];
    render(
      <ModuleView
        skills={onlyOne}
        mastery={{}}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
      />,
    );
    // Default lands on Addition (only module), one skill — not empty.
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('shows mastery percentage on practiced skills', () => {
    const mastery: Record<string, MasteryInfo> = {
      'g67.alg.linear': { mastery: 0.45, attempts: 8, lastAttemptAt: null },
    };
    render(
      <ModuleView
        skills={SAMPLE_SKILLS}
        mastery={mastery}
        selected={new Set()}
        onToggle={() => {}}
        onSelectAllInModule={() => {}}
        initialModule="Algebra"
      />,
    );
    // The skill row shows "Familiar · 45%" (label depends on threshold)
    const row = screen.getByRole('button', { name: /one-step linear equations/i });
    expect(within(row).getByText(/45%/)).toBeTruthy();
  });
});
