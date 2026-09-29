/*
 * ENVIRONMENT LIGHTING — perfiles por lugar × momento del día.
 *
 * Entradas = las MISMAS que el sensor `lightLevel` del dominio (Environment.lightIn):
 * luz del día (WorldClock), lámpara, nubes. Así lo que se ve y lo que la mascota
 * percibe están sincronizados. `lightingAt()` es una función pura (se prueba
 * sin WebGL); el controlador la aplica a las luces de Studio con suavizado.
 *
 *   HOME    cálida y suave; de noche, luz de luna fría + lámparas y chimenea
 *   GARDEN  natural y luminosa, sombras suaves
 *   PARK    día abierto, más luz ambiental; de noche, farolas
 */
import * as THREE from 'three';

import type { LightingProfileId } from '@/core/world/EnvironmentLayouts';

import type { StudioLights } from './Studio';

interface Keyframe {
  hemiSky: string; hemiGround: string; hemi: number;
  key: number; keyColor: string; fill: number; rim: number;
  bg: string; exposure: number;
}

// Tres momentos por perfil: día pleno, atardecer (luz del día a medias) y noche
const PROFILES: Record<LightingProfileId, { day: Keyframe; dusk: Keyframe; night: Keyframe; lamp: string; lampPower: number }> = {
  HOME: {
    day: { hemiSky: '#FFF6EA', hemiGround: '#E9D4C6', hemi: 1.3, key: 2.0, keyColor: '#FFF1E0', fill: 0.65, rim: 0.8, bg: '#F3E7EC', exposure: 1.05 },
    dusk: { hemiSky: '#FFD9B8', hemiGround: '#E3BFAE', hemi: 1.0, key: 1.5, keyColor: '#FFC08A', fill: 0.5, rim: 0.7, bg: '#F2D4CC', exposure: 1.05 },
    night: { hemiSky: '#8E97D8', hemiGround: '#4A4466', hemi: 0.42, key: 0.35, keyColor: '#AAB4FF', fill: 0.18, rim: 0.4, bg: '#2A2F5A', exposure: 1.1 },
    lamp: '#FFC98A', lampPower: 2.6,
  },
  GARDEN: {
    day: { hemiSky: '#EEF7FF', hemiGround: '#CFE3B8', hemi: 1.5, key: 2.4, keyColor: '#FFF4E0', fill: 0.6, rim: 0.9, bg: '#DCEFFB', exposure: 1.02 },
    dusk: { hemiSky: '#FFD2B0', hemiGround: '#D9C9A0', hemi: 1.05, key: 1.6, keyColor: '#FFB27A', fill: 0.45, rim: 0.8, bg: '#F6CBB0', exposure: 1.05 },
    night: { hemiSky: '#7D86C8', hemiGround: '#3A4A44', hemi: 0.35, key: 0.3, keyColor: '#AAB4FF', fill: 0.12, rim: 0.35, bg: '#232A52', exposure: 1.1 },
    lamp: '#FFC98A', lampPower: 0,
  },
  PARK: {
    day: { hemiSky: '#EAF6FF', hemiGround: '#C9E2B0', hemi: 1.65, key: 2.3, keyColor: '#FFF6E6', fill: 0.7, rim: 0.9, bg: '#D6ECFA', exposure: 1.0 },
    dusk: { hemiSky: '#FFCFAE', hemiGround: '#D4C49A', hemi: 1.1, key: 1.5, keyColor: '#FFAE74', fill: 0.5, rim: 0.8, bg: '#F3C6AA', exposure: 1.05 },
    night: { hemiSky: '#7A84C4', hemiGround: '#34443E', hemi: 0.38, key: 0.28, keyColor: '#AAB4FF', fill: 0.14, rim: 0.35, bg: '#1F2750', exposure: 1.1 },
    lamp: '#FFE3A0', lampPower: 1.4,
  },
};

export interface LightingState {
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number;
  key: number; keyColor: THREE.Color; fill: number; rim: number;
  bg: THREE.Color; exposure: number;
  lamp: number; // 0..1 cuánto brillan las lámparas del lugar
  lampColor: THREE.Color; lampPower: number;
  brightness: number; // estimación de lo "iluminado" que se ve (para validar contra lightLevel)
}

const mix = (a: Keyframe, b: Keyframe, t: number, out: LightingState): void => {
  out.hemiSky.set(a.hemiSky).lerp(new THREE.Color(b.hemiSky), t);
  out.hemiGround.set(a.hemiGround).lerp(new THREE.Color(b.hemiGround), t);
  out.keyColor.set(a.keyColor).lerp(new THREE.Color(b.keyColor), t);
  out.bg.set(a.bg).lerp(new THREE.Color(b.bg), t);
  out.hemi = a.hemi + (b.hemi - a.hemi) * t;
  out.key = a.key + (b.key - a.key) * t;
  out.fill = a.fill + (b.fill - a.fill) * t;
  out.rim = a.rim + (b.rim - a.rim) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
};

export function newLightingState(): LightingState {
  return {
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemi: 1, key: 1, keyColor: new THREE.Color(), fill: 1, rim: 1,
    bg: new THREE.Color(), exposure: 1, lamp: 0, lampColor: new THREE.Color(), lampPower: 0, brightness: 1,
  };
}

/*
 * daylight 0..1 (WorldClock), lampOn (lámpara del dominio; en exteriores, farolas de noche),
 * cloudCover 0..1. Interpolación continua: noche → atardecer → día sin saltos.
 */
export function lightingAt(profile: LightingProfileId, daylight: number, lampOn: boolean, cloudCover: number, out = newLightingState()): LightingState {
  const p = PROFILES[profile];
  const d = Math.max(0, Math.min(1, daylight * (1 - 0.35 * cloudCover)));
  if (d < 0.5) mix(p.night, p.dusk, d / 0.5, out);
  else mix(p.dusk, p.day, (d - 0.5) / 0.5, out);
  // Lámparas: dentro, la lámpara del mundo; fuera (parque), farolas cuando oscurece
  const lamp = profile === 'HOME' ? (lampOn ? 1 : 0) : Math.max(0, Math.min(1, (0.35 - daylight) / 0.25));
  out.lamp = lamp;
  out.lampColor.set(p.lamp);
  out.lampPower = p.lampPower * lamp * (1 - d);
  // Con la lámpara encendida de noche, la casa se ve cálida (sube la ambiental hacia el tono de la lámpara)
  if (profile === 'HOME' && lamp > 0) {
    const warm = lamp * (1 - d);
    out.hemi += 0.55 * warm;
    out.hemiSky.lerp(out.lampColor, 0.45 * warm);
    out.fill += 0.25 * warm;
  }
  out.brightness = Math.min(1, (out.hemi + out.key * 0.35) / (p.day.hemi + p.day.key * 0.35));
  return out;
}

export class EnvironmentLightingController {
  private readonly target = newLightingState();
  private readonly cur = newLightingState();
  private first = true;

  apply(dt: number, profile: LightingProfileId, daylight: number, lampOn: boolean, cloudCover: number, lights: StudioLights, bg: THREE.Color, renderer?: THREE.WebGLRenderer): LightingState {
    lightingAt(profile, daylight, lampOn, cloudCover, this.target);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 2.5); // sin saltos (encender la lámpara también se funde)
    this.first = false;
    const c = this.cur, t = this.target;
    c.hemiSky.lerp(t.hemiSky, k); c.hemiGround.lerp(t.hemiGround, k); c.keyColor.lerp(t.keyColor, k); c.bg.lerp(t.bg, k); c.lampColor.lerp(t.lampColor, k);
    for (const f of ['hemi', 'key', 'fill', 'rim', 'exposure', 'lamp', 'lampPower', 'brightness'] as const) c[f] += (t[f] - c[f]) * k;
    lights.hemi.color.copy(c.hemiSky);
    lights.hemi.groundColor.copy(c.hemiGround);
    lights.hemi.intensity = c.hemi;
    lights.key.color.copy(c.keyColor);
    lights.key.intensity = c.key;
    lights.fill.intensity = c.fill;
    lights.rim.intensity = c.rim;
    bg.copy(c.bg);
    if (renderer) renderer.toneMappingExposure = c.exposure;
    return c;
  }

  reset(): void { this.first = true; }
}
