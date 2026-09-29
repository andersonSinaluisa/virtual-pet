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
import type { Discovery } from '@/core/memory/types';
import { DEFAULT_SETTINGS, type SettingsData } from '@/core/persistence/SaveGame';
import type { GrowthEvent, PetSnapshot } from '@/core/session/GameSession';
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

// Descubrimiento pendiente de mostrar ("✨ Descubriste algo" / "❤️ está aprendiendo...")
export const discoveryStore = createStore<{ discovery: Discovery; momentId: string | null } | null>(null);

// v6: "🌱 está creciendo" pendiente de mostrar (se enseña después de "Mientras no estabas")
export const growthStore = createStore<GrowthEvent | null>(null);
// Versión del aprendizaje (sube como mucho 1 vez/s: la UI no se redibuja por cada Δw)
export const learningStore = createStore(0);

// v7: capas del World Inspector (FOV, oído, percibidos, atención, navegación) y objeto seleccionado
export interface WorldDebugState {
  fov: boolean;
  hearing: boolean;
  perceived: boolean;
  attention: boolean;
  navigation: boolean;
  labels: boolean; // novedad / familiaridad sobre cada objeto
}

export const devStore = createStore<{
  running: boolean; speed: number; debugScene: boolean; clockSpeed: number; growthPreview: number | null;
  world: WorldDebugState; inspectId: number | null; perf: { fps: number; frameMs: number; tickMs: number } | null; perfMeter: boolean;
}>({
  running: true, speed: 1, debugScene: false, clockSpeed: 1, growthPreview: null,
  world: { fov: false, hearing: false, perceived: false, attention: false, navigation: false, labels: false }, inspectId: null, perf: null, perfMeter: false,
});
