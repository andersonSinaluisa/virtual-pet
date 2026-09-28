/*
 * Stores de la app, separados por responsabilidad:
 *
 *   sessionStore   ciclo de vida de la partida (arranque, onboarding, aviso de recuperación)
 *   petStore       snapshot de la mascota para la UI (limitado a ~4 Hz)
 *   memoryStore    versión de recuerdos/descubrimientos/inventario (sube al cambiar)
 *   gameStore      vista del minijuego activo
 *   awayStore      informe "Mientras no estabas"
 *   toastStore     avisos efímeros (descubrimientos, recuerdos)
 *   settingsStore  preferencias persistentes
 *   devStore       herramientas de desarrollo (pausa, velocidad)
 *
 * Nunca se guardan objetos THREE ni la simulación en estos stores.
 */
import type { AnyGameView } from '@/core/games';
import { DEFAULT_SETTINGS, type SettingsData } from '@/core/persistence/SaveGame';
import type { PetSnapshot } from '@/core/session/GameSession';
import type { AwayReport } from '@/core/simulation/OfflineSimulation';

import { createStore } from './createStore';

export type SessionStatus = 'booting' | 'onboarding' | 'ready' | 'error';

export const sessionStore = createStore<{ status: SessionStatus; notice: string | null; persistent: boolean; error: string | null }>({
  status: 'booting', notice: null, persistent: true, error: null,
});

export const petStore = createStore<PetSnapshot | null>(null);
export const memoryStore = createStore(0);
export const gameStore = createStore<AnyGameView | null>(null);
export const awayStore = createStore<AwayReport | null>(null);

export interface Toast {
  id: number;
  kind: 'discovery' | 'moment' | 'info';
  title: string;
  text: string;
}
export const toastStore = createStore<Toast[]>([]);

let toastId = 0;
export function pushToast(t: Omit<Toast, 'id'>): void {
  const id = ++toastId;
  toastStore.set((list) => [...list.slice(-2), { ...t, id }]);
  setTimeout(() => toastStore.set((list) => list.filter((x) => x.id !== id)), 4200);
}

export const settingsStore = createStore<SettingsData>({ ...DEFAULT_SETTINGS });

export const devStore = createStore<{ running: boolean; speed: number; debugScene: boolean }>({ running: true, speed: 1, debugScene: false });
