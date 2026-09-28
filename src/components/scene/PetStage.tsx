/*
 * PetStage = PetCanvas protegido por un Error Boundary. Si Three.js falla,
 * se muestra la ilustración y la partida sigue intacta.
 */
import type { ComponentProps } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';

import { PetCanvas } from './PetCanvas';
import { SceneFallback } from './SceneFallback';

export function PetStage(props: ComponentProps<typeof PetCanvas>) {
  return (
    <ErrorBoundary fallback={(e) => <SceneFallback reason={e.message} />}>
      <PetCanvas {...props} />
    </ErrorBoundary>
  );
}
