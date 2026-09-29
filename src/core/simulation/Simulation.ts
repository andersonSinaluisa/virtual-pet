/*
 * SIMULACIÓN: un tick completo del ciclo
 *
 *   WORLD (el tiempo pasa) → PET STATE
 *     → perceive()        mundo → valores 0..1
 *     → Sensors           valores → corriente en neuronas sensoriales
 *     → Network.tick()    leak, integración, spikes, nextInputs
 *     → ActionTranslator  spikes de salida → acciones
 *     → ActionSystem      ejecuta: Movement / Expression / World
 *     → ConflictMonitor   registra acciones incompatibles
 *     → Attention         spikes de las neuronas de atención → foco del próximo tick (v4)
 *     → SpikeTrace        guarda la causalidad real para explicarla
 *     → WORLD (nuevo ciclo)
 *
 * No depende de React, Expo ni Three.js: se prueba con Jest en Node.
 */
import type { Action } from '../brain/Actions';
import { Brain } from '../brain/Brain';
import { OBJECT_CHANNELS, getSensorWeight, type BrainConfig, type CircuitKey, type SensorKey } from '../brain/BrainConfig';
import type { Network } from '../neural/Network';
import type { NeuronId } from '../neural/Neuron';
import { ActionSystem } from './ActionSystem';
import { ActionTranslator, type FiredAction } from './ActionTranslator';
import { ConflictMonitor, type ConflictCheck } from './ConflictMonitor';
import { MovementSystem } from './MovementSystem';
import { Sensors } from './Sensors';
import type { SimConfig } from './SimConfig';
import { SpikeTrace } from './SpikeTrace';
import { World, type Perception, type WorldEvent } from './World';

const MOTIVE_CIRCUITS: readonly CircuitKey[] = ['playCircuit', 'curiosityCircuit', 'joyCircuit', 'fearCircuit'];

export interface StepEvent extends WorldEvent {
  value: number;
}

export interface StepResult {
  tick: number;
  events: StepEvent[];
  perception: Perception;
  spiked: NeuronId[];
  actions: FiredAction[];
  active: Action[];
  status: Partial<Record<Action, string>>;
  conflicts: ConflictCheck;
  focusObjectId: number | null;
  offline: boolean;
}

export interface StepOptions {
  timeScale?: number; // > 1 solo en simulación offline
  offline?: boolean;
}

// Herramienta de desarrollo: fija un sensor durante N ticks (Force Sensor).
export interface SensorOverride {
  value: number;
  ticksLeft: number;
}

export class Simulation {
  readonly world: World;
  brain!: Brain;
  network!: Network;
  sensors!: Sensors;
  translator!: ActionTranslator;
  readonly actionSystem: ActionSystem;
  readonly movement: MovementSystem;
  readonly conflicts: ConflictMonitor;
  readonly trace = new SpikeTrace(120);
  last: StepResult;
  overrides: Partial<Record<SensorKey, SensorOverride>> = {};
  // Actividad reciente de las neuronas de atención por objeto (v4)
  readonly attention: Partial<Record<(typeof OBJECT_CHANNELS)[number]['kind'], number>> = {};
  // v7: actividad reciente de los circuitos de motivación (EMA de spikes) → atención "de arriba abajo"
  readonly motives: Partial<Record<CircuitKey, number>> = {};

  constructor(readonly config: SimConfig, readonly brainConfig: BrainConfig) {
    this.world = new World(config);
    this.buildBrain();
    this.actionSystem = new ActionSystem(config);
    this.movement = new MovementSystem(config);
    this.conflicts = new ConflictMonitor(brainConfig.conflicts);
    this.last = this.empty();
  }

  // (Re)construye la red desde BrainConfig (al iniciar y al cambiar la topología).
  buildBrain(): void {
    this.brain = new Brain(this.brainConfig);
    this.network = this.brain.network;
    this.sensors = new Sensors(this.brain);
    this.translator = new ActionTranslator(this.brain.outputNeuronToAction);
    this.trace.clear();
  }

  step(opts: StepOptions = {}): StepResult {
    this.world.attention = this.attention;
    this.world.topDown = this.topDown();
    this.world.update(opts.timeScale ?? 1);
    const events = this.world.drainEvents();
    const perception = this.applyOverrides(this.world.perceive());
    this.sensors.feed(perception, this.network);

    const spiked = this.network.tick();
    this.trace.record(this.network, spiked);
    this.updateAttention(spiked);

    const actions = this.translator.fromSpikes(spiked);
    this.actionSystem.trigger(actions);
    const active = this.actionSystem.execute(this.world, this.movement);
    const conflicts = this.conflicts.check(active);
    // v7: lo que las acciones cambiaron en el mundo ESTE tick (la caja se abrió, cruzó una puerta)
    events.push(...this.world.drainEvents());

    this.last = {
      tick: this.network.tickCount,
      events: events.map((e) => ({ ...e, value: perception[e.sensor] })),
      perception,
      spiked,
      actions,
      active,
      status: { ...this.actionSystem.status },
      conflicts,
      focusObjectId: this.world.focusObjectId,
      offline: !!opts.offline,
    };
    return this.last;
  }

  // EMA de spikes: la neurona de atención de un objeto que dispara más, más "tira" del foco
  private updateAttention(spiked: readonly number[]): void {
    const decay = this.config.world.attentionDecay;
    for (const ch of OBJECT_CHANNELS) {
      const id = this.brain.circuitKeyToNeuron[ch.attention];
      this.attention[ch.kind] = (this.attention[ch.kind] ?? 0) * decay + (spiked.includes(id) ? 1 : 0);
    }
    for (const c of MOTIVE_CIRCUITS) {
      const id = this.brain.circuitKeyToNeuron[c];
      this.motives[c] = (this.motives[c] ?? 0) * decay + (spiked.includes(id) ? 1 : 0);
    }
  }

  /*
   * v7: COMPETENCIA SESGADA (atención de arriba abajo). Si ahora mismo está activo el
   * circuito de juego (o de curiosidad, alegría, miedo), los objetos cuya vía sensorial
   * alimenta ESE circuito ganan atención: Σ_c w(ve X → c) · actividad(c). Los pesos son
   * los APRENDIDOS: es la "asociación aprendida" de cada mascota, no una regla por tipo.
   */
  private topDown(): Partial<Record<(typeof OBJECT_CHANNELS)[number]['kind'], number>> {
    const out: Partial<Record<(typeof OBJECT_CHANNELS)[number]['kind'], number>> = {};
    for (const ch of OBJECT_CHANNELS) {
      let v = 0;
      for (const c of MOTIVE_CIRCUITS) v += Math.max(0, getSensorWeight(this.brainConfig, ch.sensor, c)) * Math.min(1, this.motives[c] ?? 0);
      out[ch.kind] = v;
    }
    return out;
  }

  reset(): void {
    for (const k of Object.keys(this.attention) as (keyof typeof this.attention)[]) delete this.attention[k];
    for (const k of Object.keys(this.motives) as CircuitKey[]) delete this.motives[k];
    this.world.reset();
    this.network.reset();
    this.actionSystem.reset();
    this.conflicts.reset();
    this.trace.clear();
    this.last = this.empty();
  }

  syncWeights(): void {
    this.brain.syncWeights();
  }

  forceSensor(key: SensorKey, value: number, ticks: number): void {
    this.overrides[key] = { value: Math.max(0, Math.min(1, value)), ticksLeft: Math.max(1, Math.floor(ticks)) };
  }

  clearOverrides(): void {
    this.overrides = {};
  }

  private applyOverrides(p: Perception): Perception {
    const keys = Object.keys(this.overrides) as SensorKey[];
    if (!keys.length) return p;
    for (const k of keys) {
      const o = this.overrides[k];
      if (!o) continue;
      p[k] = o.value;
      if (--o.ticksLeft <= 0) delete this.overrides[k];
    }
    return p;
  }

  private empty(): StepResult {
    return {
      tick: 0, events: [], perception: this.world.perceive(), spiked: [], actions: [], active: [], status: {},
      conflicts: { onsets: [], active: [] }, focusObjectId: null, offline: false,
    };
  }
}
