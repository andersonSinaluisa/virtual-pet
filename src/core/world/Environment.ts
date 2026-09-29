/*
 * ENVIRONMENT STATE — el estado ambiental de la ubicación actual
 * --------------------------------------------------------------
 *   light            luz real (día × nubes, o lámpara si hay techo)
 *   ambientActivity  movimiento de fondo (hojas, pájaros, gente a lo lejos)
 *   noiseLevel       ruido de fondo + lo que suena ahora
 *   weatherState     'clear' | 'cloudy' | 'breezy' (simulado, sin API)
 *   timeOfDay        del WorldClock
 *   novelty          1 − familiaridad de ESTE lugar para ESTA mascota
 *
 * No todas son neuronas: WorldSensorSystem deriva de aquí los sensores
 * `lightLevel`, `darkness`, `ambientActivity`, `openSpace` y `unfamiliarPlace`.
 */
import { clamp01 } from '../random';
import type { TimeOfDay } from '../time/WorldClock';
import type { LocationDef, LocationId } from './Locations';

export type WeatherState = 'clear' | 'cloudy' | 'breezy';

export interface EnvironmentState {
  locationId: LocationId;
  light: number;
  ambientActivity: number;
  noiseLevel: number;
  weatherState: WeatherState;
  cloudCover: number; // 0..1 (una nube pasa → la luz baja un poco fuera)
  wind: number; // 0..1 (ráfaga: mueve hojas y objetos ligeros fuera)
  timeOfDay: TimeOfDay;
  novelty: number;
}

// Solo lo persistente del ambiente (el resto se deriva cada tick)
export interface EnvironmentSave {
  weatherState: WeatherState;
  cloudCover: number;
}

const LAMP_LEVEL = 0.8;
const PARK_LAMPS = 0.2; // farolas del parque de noche

export function initialEnvironment(locationId: LocationId): EnvironmentState {
  return { locationId, light: 1, ambientActivity: 0, noiseLevel: 0, weatherState: 'clear', cloudCover: 0, wind: 0, timeOfDay: 'MORNING', novelty: 0 };
}

// Luz real en una ubicación: dentro manda max(día, lámpara); fuera, el día (menos las nubes) y alguna farola
export function lightIn(loc: LocationDef, daylight: number, lampOn: boolean, cloudCover: number): number {
  if (loc.sensoryProfile.shelter >= 0.5) return Math.max(daylight, lampOn ? LAMP_LEVEL : 0);
  const sky = daylight * (1 - 0.35 * cloudCover);
  return clamp01(Math.max(sky, loc.id === 'park' ? PARK_LAMPS : 0));
}

// Actividad de fondo: más de día que de noche; los microeventos la suben un rato (bump)
export function ambientActivityIn(loc: LocationDef, daylight: number, bump: number, wind: number): number {
  const base = loc.sensoryProfile.baseActivity * (0.35 + 0.65 * daylight);
  return clamp01(base + bump + (loc.sensoryProfile.shelter < 0.5 ? wind * 0.25 : 0));
}
