'use client';

import * as React from 'react';
import { ModuleSelector } from '@/components/practice/ModuleSelector';
import { PracticeScreen } from '@/components/practice/PracticeScreen';
import type { GradeBand } from '@/types/core';

type Mode = 'practice' | 'test';

interface SessionConfig {
  gradeBand: GradeBand;
  skillIds: string[];
  mode: Mode;
}

export function PracticeClient({
  studentName,
  gradeBand,
}: {
  studentName: string;
  gradeBand: GradeBand;
}) {
  const [active, setActive] = React.useState<SessionConfig | null>(null);

  if (active) {
    return (
      <PracticeScreen
        studentName={studentName}
        gradeBand={active.gradeBand}
        mode={active.mode}
        skillIds={active.skillIds}
        onEnd={() => setActive(null)}
      />
    );
  }

  return (
    <ModuleSelector
      studentName={studentName}
      defaultGradeBand={gradeBand}
      onStart={(cfg) => setActive(cfg)}
    />
  );
}
