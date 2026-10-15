import { useId, type ReactNode } from 'react';
import { Card } from './ui/card';

/** Standard CHS card used by every portal page. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card className="panel gap-0 p-6 sm:p-8" role="region" aria-labelledby={titleId}>
      <h1 id={titleId}>{title}</h1>
      {children}
    </Card>
  );
}
