/*
 * PET ANIMATOR (portado de js/pet3d/PetAnimator.js)
 * -------------------------------------------------
 * Canales independientes que se combinan:
 *   LOCOMOTION  idle | walk | run | sleep | rest | crouch
 *   HEAD        mirar a un objetivo (look-at con límites) + inclinación
 *   ARMS        none | wave | raise | reach | hold | dance | cover
 *   TAIL        idle | wag | slowWag | fastWag | down | scared | sleeping
 *   SPECIAL     varios a la vez: jump, tremble, dance, sniff, lookAround, munch, lap, bark, alert
 *   EXPRESSION  delegada a PetExpressions
 *
 * Cada estado aporta desplazamientos a una "pose" con un peso que sube/baja
 * suavemente, así walk + smile + wag se suman y nada cambia de golpe.
 * El animador SOLO toca los pivotes del rig.
 */
import * as THREE from 'three';

import { PetExpressions, type ExpressionName } from './PetExpressions';
import type { AnimationStyle } from '@/core/growth/GrowthConfig';

import type { PetModel } from './PetModel';

const POSE_KEYS = ['motionY', 'motionX', 'motionRotX', 'motionRotZ', 'bodyScaleY', 'bodyScaleXZ', 'bodyRotY', 'bodyRotZ',
  'headPitch', 'headYaw', 'headRoll', 'earUp', 'earBack', 'earFlap',
  'armLRotX', 'armLRotZ', 'armRRotX', 'armRRotZ', 'legLRotX', 'legRRotX', 'legLLift', 'legRLift', 'tailYaw', 'tailPitch'] as const;
type PoseKey = (typeof POSE_KEYS)[number];
type Pose = Record<PoseKey, number>;

export type Locomotion = 'idle' | 'walk' | 'run' | 'sleep' | 'rest' | 'crouch';
export type Arms = 'none' | 'wave' | 'raise' | 'reach' | 'hold' | 'dance' | 'cover';
export type Tail = 'idle' | 'wag' | 'slowWag' | 'fastWag' | 'down' | 'scared' | 'sleeping';
export type Special = 'jump' | 'tremble' | 'dance' | 'sniff' | 'lookAround' | 'munch' | 'lap' | 'bark' | 'alert';
type ChannelName = 'locomotion' | 'arms' | 'tail' | 'special';

interface Channel {
  active: Set<string>;
  weights: Record<string, number>;
  rate: number;
}

const zeroPose = (): Pose => Object.fromEntries(POSE_KEYS.map((k) => [k, 0])) as Pose;

export class PetAnimator {
  readonly expressions: PetExpressions;
  private t = 0;
  private phase = 0; // ciclo de pasos (avanza con la distancia recorrida)
  private speed = 0;
  private readonly channels: Record<ChannelName, Channel> = {
    locomotion: { active: new Set(['idle']), weights: { idle: 1 }, rate: 6 },
    arms: { active: new Set(['none']), weights: { none: 1 }, rate: 8 },
    tail: { active: new Set(['idle']), weights: { idle: 1 }, rate: 5 },
    special: { active: new Set(), weights: {}, rate: 7 },
  };
  private readonly look = { target: null as THREE.Vector3 | null, weight: 0, yaw: 0, pitch: 0, tilt: 0, tiltTarget: 0 };
  private pose = zeroPose();
  // v6: estilo por edad (misma acción, distinto cuerpo): lo fija GrowthVisualController
  private style: AnimationStyle = { stepRate: 1, bounce: 1, wobble: 0, curl: 0 };
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly model: PetModel) {
    this.expressions = new PetExpressions(model);
  }

  // ---- API ----
  setLocomotion(name: Locomotion): void { this.channels.locomotion.active = new Set([name]); }
  setArms(name: Arms): void { this.channels.arms.active = new Set([name]); }
  setTail(name: Tail): void { this.channels.tail.active = new Set([name]); }
  setSpecial(names: readonly Special[]): void { this.channels.special.active = new Set(names); }
  setExpression(names: ExpressionName | readonly ExpressionName[]): void { this.expressions.set(names); }
  setHeadTilt(v: number): void { this.look.tiltTarget = v; }
  // target en coordenadas del mundo 3D, o null
  lookAt(target: THREE.Vector3 | null): void { this.look.target = target; }
  setStyle(style: AnimationStyle): void { this.style = style; }

  // Variantes por edad sobre la misma contribución: el bebé anda a pasitos, rebota y se tambalea;
  // se acurruca más al dormir. El adulto da pasos largos y estables.
  private styled(channel: ChannelName, state: string, part: Partial<Pose>): Partial<Pose> {
    const st = this.style;
    if (channel !== 'locomotion') return part;
    if (state === 'walk' || state === 'run') {
      const ph = this.phase;
      return {
        ...part,
        motionY: (part.motionY ?? 0) * st.bounce,
        motionRotZ: (part.motionRotZ ?? 0) + st.wobble * 0.08 * Math.sin(ph * 0.5),
        legLRotX: (part.legLRotX ?? 0) / Math.max(0.6, st.stepRate),
        legRRotX: (part.legRRotX ?? 0) / Math.max(0.6, st.stepRate),
      };
    }
    if (state === 'sleep') {
      return { ...part, headPitch: (part.headPitch ?? 0) + 0.2 * st.curl, bodyScaleY: (part.bodyScaleY ?? 0) - 0.05 * st.curl, headRoll: (part.headRoll ?? 0) + 0.15 * st.curl };
    }
    return part;
  }

  // ---- Contribuciones de cada estado a la pose ----
  private contrib(channel: ChannelName, state: string, t: number): Partial<Pose> {
    const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    switch (`${channel}:${state}`) {
      case 'locomotion:idle': return { bodyScaleY: 0.018 * Math.sin(t * 2.1), headPitch: 0.03 * Math.sin(t * 1.05), earFlap: 0.06 * Math.sin(t * 1.7) };
      case 'locomotion:walk': return {
        legLRotX: -0.55 * s, legRRotX: 0.55 * s, legLLift: 0.035 * Math.max(0, s), legRLift: 0.035 * Math.max(0, -s),
        armLRotX: 0.4 * s, armRRotX: -0.4 * s, motionRotZ: 0.07 * s, motionY: 0.025 * Math.abs(c), headPitch: 0.03 * Math.abs(s), earFlap: 0.15 * c };
      case 'locomotion:run': return {
        legLRotX: -1.0 * s, legRRotX: 1.0 * s, legLLift: 0.06 * Math.max(0, s), legRLift: 0.06 * Math.max(0, -s),
        armLRotX: 0.8 * s, armRRotX: -0.8 * s, motionRotX: 0.2, motionRotZ: 0.05 * s, motionY: 0.06 * Math.abs(c),
        bodyScaleY: 0.04 * Math.abs(c) - 0.02, earUp: -0.35, earFlap: 0.4 * c, headPitch: -0.12 };
      case 'locomotion:sleep': return { motionY: -0.05, bodyScaleY: -0.1 + 0.03 * Math.sin(t * 1.2), bodyScaleXZ: 0.05, headPitch: 0.38, headRoll: 0.28, earUp: -0.6, armLRotX: -0.3, armRRotX: -0.3, legLRotX: -0.6, legRRotX: -0.6 };
      case 'locomotion:rest': return { motionY: -0.03, bodyScaleY: -0.07 + 0.02 * Math.sin(t * 1.4), bodyScaleXZ: 0.04, headPitch: 0.1, earUp: -0.2, legLRotX: -0.9, legRRotX: -0.9 };
      case 'locomotion:crouch': return { motionY: -0.06, bodyScaleY: -0.18, bodyScaleXZ: 0.06, headPitch: 0.18, earUp: -0.5, earBack: 0.7, armLRotX: -0.5, armRRotX: -0.5 };

      case 'arms:wave': return { armRRotZ: -2.3 - 0.35 * Math.sin(t * 10), armRRotX: -0.3, headRoll: 0.12 };
      case 'arms:raise': return { armLRotX: -1.25 + 0.12 * Math.sin(t * 6), armLRotZ: 0.2, headRoll: -0.18 };
      case 'arms:reach': return { armLRotX: -1.35, armRRotX: -1.35, armLRotZ: -0.2, armRRotZ: 0.2 };
      case 'arms:hold': return { armLRotX: -1.1, armRRotX: -1.1, armLRotZ: -0.35, armRRotZ: 0.35 };
      case 'arms:dance': return { armLRotZ: 1.2 + 0.9 * Math.sin(t * 6), armRRotZ: -1.2 - 0.9 * Math.sin(t * 6 + Math.PI) };
      case 'arms:cover': return { armLRotX: -2.3, armRRotX: -2.3, armLRotZ: -0.45, armRRotZ: 0.45, headPitch: 0.2 };

      case 'tail:idle': { const burst = Math.max(0, Math.sin(t * 0.7)) ** 6; return { tailYaw: 0.35 * burst * Math.sin(t * 9) }; }
      case 'tail:slowWag': return { tailYaw: 0.3 * Math.sin(t * 4) };
      case 'tail:wag': return { tailYaw: 0.45 * Math.sin(t * 9), tailPitch: 0.1 };
      case 'tail:fastWag': return { tailYaw: 0.6 * Math.sin(t * 17), tailPitch: 0.2, bodyRotY: 0.04 * Math.sin(t * 17) };
      case 'tail:down': return { tailPitch: -0.9, tailYaw: 0.08 * Math.sin(t * 2) };
      case 'tail:scared': return { tailPitch: -1.2, tailYaw: 0.05 * Math.sin(t * 40) };
      case 'tail:sleeping': return { tailPitch: -0.5, tailYaw: 0.9 };

      case 'special:jump': { const h = Math.abs(Math.sin(t * 6.5)); return { motionY: 0.16 * h, bodyScaleY: 0.08 * h - 0.05 * (1 - h), earUp: 0.4 * h - 0.2, earFlap: 0.3 * Math.cos(t * 6.5) }; }
      case 'special:tremble': return { motionX: 0.012 * Math.sin(t * 70), earBack: 0.8, earUp: -0.3, earFlap: 0.12 * Math.sin(t * 55) };
      case 'special:dance': return { motionRotZ: 0.22 * Math.sin(t * 6), bodyRotY: 0.3 * Math.sin(t * 3), motionY: 0.05 * Math.abs(Math.sin(t * 6)), headRoll: -0.15 * Math.sin(t * 6) };
      case 'special:sniff': return { headPitch: 0.22 + 0.05 * Math.sin(t * 16), earUp: 0.4 };
      case 'special:lookAround': return { headYaw: 0.55 * Math.sin(t * 1.3), earUp: 0.3 };
      case 'special:munch': return { headPitch: 0.45 + 0.08 * Math.sin(t * 13), motionRotX: 0.12 };
      case 'special:lap': return { headPitch: 0.42 + 0.05 * Math.sin(t * 11), motionRotX: 0.12 };
      case 'special:bark': return { headPitch: -0.15 + 0.06 * Math.sin(t * 9), earUp: 0.3 };
      case 'special:alert': return { earUp: 0.8 };
      default: return {};
    }
  }

  update(dt: number, speed: number): void {
    dt = Math.max(0, Math.min(0.1, dt || 0)); // nunca negativo: evita que el suavizado diverja
    this.t += dt;
    const t = this.t;
    this.speed = speed || 0;
    // Los pasos avanzan con la distancia: los pies no "patinan"
    this.phase += (this.speed * dt * 14 + (this.channels.locomotion.active.has('run') ? dt * 2 : 0)) * this.style.stepRate;

    const target = zeroPose();
    for (const name of Object.keys(this.channels) as ChannelName[]) {
      const ch = this.channels[name];
      const k = 1 - Math.exp(-dt * ch.rate);
      const states = new Set([...Object.keys(ch.weights), ...ch.active]);
      for (const st of states) {
        const w = (ch.weights[st] ?? 0) + ((ch.active.has(st) ? 1 : 0) - (ch.weights[st] ?? 0)) * k;
        ch.weights[st] = w;
        if (w < 0.002) { if (!ch.active.has(st)) delete ch.weights[st]; continue; }
        const part = this.styled(name, st, this.contrib(name, st, t));
        for (const key in part) target[key as PoseKey] += (part[key as PoseKey] ?? 0) * w;
      }
    }

    // Look-at: rotación suave y limitada de la cabeza
    const L = this.look;
    let yaw = 0, pitch = 0;
    if (L.target) {
      const local = this.model.root.worldToLocal(this.tmp.copy(L.target));
      const hx = local.x, hy = local.y - 0.85, hz = local.z;
      yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(hx, Math.max(0.05, hz))));
      pitch = Math.max(-0.45, Math.min(0.5, -Math.atan2(hy, Math.hypot(hx, hz))));
      if (hz < -0.2) yaw = Math.sign(hx || 1) * 1.0; // detrás: gira lo máximo permitido
    }
    const kl = 1 - Math.exp(-dt * 6);
    L.weight += ((L.target ? 1 : 0) - L.weight) * kl;
    L.yaw += (yaw - L.yaw) * kl;
    L.pitch += (pitch - L.pitch) * kl;
    L.tilt += (L.tiltTarget - L.tilt) * kl;
    target.headYaw += L.yaw * L.weight;
    target.headPitch += L.pitch * L.weight * 0.8;
    target.headRoll += L.tilt;

    // Suavizado final (movimiento secundario)
    const kp = 1 - Math.exp(-dt * 18);
    for (const key of POSE_KEYS) this.pose[key] += (target[key] - this.pose[key]) * kp;
    this.apply(this.pose);
    this.expressions.update(dt);
  }

  private apply(p: Pose): void {
    const m = this.model, rest = m.rest, P = m.pivots;
    const set = (name: string, fn: (g: THREE.Group) => void) => {
      const piv = P[name], r = rest[name];
      if (!piv || !r) return;
      piv.position.copy(r.pos); piv.rotation.copy(r.rot); piv.scale.copy(r.scale);
      fn(piv);
    };

    set('Motion', (g) => { g.position.y += p.motionY; g.position.x += p.motionX; g.rotation.x += p.motionRotX; g.rotation.z += p.motionRotZ; });
    set('BodyPivot', (g) => { g.scale.set(1 + p.bodyScaleXZ - p.bodyScaleY * 0.4, 1 + p.bodyScaleY, 1 + p.bodyScaleXZ - p.bodyScaleY * 0.4); g.rotation.y += p.bodyRotY; g.rotation.z += p.bodyRotZ; });
    set('HeadPivot', (g) => {
      g.rotation.x += p.headPitch; g.rotation.y += p.headYaw; g.rotation.z += p.headRoll;
      // compensa el aplastado del cuerpo para que la cabeza no se deforme
      const sy = 1 + p.bodyScaleY, sxz = 1 + p.bodyScaleXZ - p.bodyScaleY * 0.4;
      g.scale.set(1 / sxz, 1 / sy, 1 / sxz);
    });
    set('LeftArmPivot', (g) => { g.rotation.x += p.armLRotX; g.rotation.z += p.armLRotZ; });
    set('RightArmPivot', (g) => { g.rotation.x += p.armRRotX; g.rotation.z += p.armRRotZ; });
    set('LeftLegPivot', (g) => { g.rotation.x += p.legLRotX; g.position.y += p.legLLift; });
    set('RightLegPivot', (g) => { g.rotation.x += p.legRRotX; g.position.y += p.legRLift; });
    set('TailPivot', (g) => { g.rotation.y += p.tailYaw; g.rotation.x += -p.tailPitch; });

    // Orejas: cada tipo interpreta "arriba / atrás / aleteo" a su manera
    const type = m.cfg.earType;
    (['Left', 'Right'] as const).forEach((side, i) => {
      const s = i === 0 ? 1 : -1, flap = p.earFlap * (i === 0 ? 1 : -0.8);
      set(`${side}EarPivot`, (g) => {
        if (type === 'floppy') { g.rotation.z += s * (0.7 * p.earUp + flap); g.rotation.x += -0.5 * p.earBack; }
        else if (type === 'long') { g.rotation.x += -1.1 * Math.max(0, -p.earUp) - 0.6 * p.earBack + flap * 0.5; g.rotation.z += s * 0.15 * p.earUp; }
        else { g.rotation.z += s * 0.35 * p.earUp + flap * 0.4 * s; g.rotation.x += -0.6 * p.earBack; }
      });
    });
  }
}
