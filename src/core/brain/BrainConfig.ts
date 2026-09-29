/*
 * BRAIN CONFIG — el "genoma" de la mascota
 * ----------------------------------------
 * Aquí viven TODOS los parámetros del cerebro: qué sensores hay, qué
 * circuitos internos, y los pesos entre capas. Con el mismo código,
 * cambiar estas matrices produce otra personalidad.
 *
 * Los nombres (hunger, socialCircuit, APPROACH...) solo existen aquí y en
 * la aplicación. La Network recibe matrices de números y ve IDs.
 *
 * Los pesos son PARÁMETROS EXPERIMENTALES, no valores óptimos.
 * Referencia rápida (threshold 1, leak 0.9):
 *   - un peso ≥ 1.0 hace disparar al destino con un solo spike;
 *   - 0.5–0.9 necesita dos o más spikes cercanos en el tiempo;
 *   - < 0.3 solo influye si se suma a otras entradas;
 *   - negativo = inhibición; 0 (u omitido) = sin conexión.
 *
 * VERSIÓN 3 (app móvil): se añade el sensor `playerCalling` (el jugador
 * llama a la mascota: "¡Milo, aquí!"). Va al final de la capa de sensores y
 * NO modifica ningún peso existente. Ver docs/mobile-migration-plan.md §6.
 *
 * VERSIÓN 6 (mundo vivo, docs/living-world.md): sensores nuevos al FINAL de
 * la capa (movimiento, oído, novedad del sonido, familiaridad, lugar poco
 * familiar, espacio abierto, actividad ambiental), un canal de objeto para
 * la caja (`seesBox` → `boxAttention`, igual que los demás: sin preferencia
 * de nacimiento) y un segundo modulador de plasticidad: AMENAZA (el miedo
 * puede aprenderse y extinguirse). Ningún peso existente cambia.
 */
import type { Action } from './Actions';

export const SENSOR_KEYS = [
  'hunger', 'thirst', 'fatigue', 'boredom', 'affectionNeed', 'energy', 'fear', 'curiosity',
  'playerNear', 'playerTouching', 'playerMoving', 'foodAvailable', 'waterAvailable', 'bedAvailable',
  'toyAvailable', 'interestingObjectVisible', 'hidingPlaceAvailable', 'darkness', 'loudSound',
  'newObjectDetected', 'playerCalling',
  'seesBall', 'seesTeddy', 'seesRope', 'seesDuck',
  // v5: contexto (ver docs/emergent-routines.md)
  'time00', 'time04', 'time08', 'time12', 'time16', 'time20',
  'lightLevel', 'zoneBed', 'zoneFood', 'zonePlay', 'zoneWindow', 'playerReturned', 'recentActivity',
  // v6: mundo vivo (ver docs/living-world.md)
  'seesBox', 'objectMoving', 'soundHeard', 'soundNovelty', 'familiarObject', 'unfamiliarPlace', 'openSpace', 'ambientActivity',
] as const;
export type SensorKey = (typeof SENSOR_KEYS)[number];

export const CIRCUIT_KEYS = [
  'feedingCircuit', 'drinkingCircuit', 'restCircuit', 'activityCircuit', 'playCircuit', 'socialCircuit',
  'lonelinessCircuit', 'followCircuit', 'joyCircuit', 'distressCircuit', 'curiosityCircuit', 'fearCircuit',
  'ballAttention', 'teddyAttention', 'ropeAttention', 'duckAttention',
  'boxAttention', // v6
] as const;
export type CircuitKey = (typeof CIRCUIT_KEYS)[number];

export type SensorGroup = 'interno' | 'entorno' | 'contexto';

export interface SensorDef {
  key: SensorKey;
  label: string;
  group: SensorGroup;
  gain: number; // corriente inyectada = gain × valor (0..1)
  event?: boolean; // sensores transitorios
}

export interface CircuitDef {
  key: CircuitKey;
  label: string;
}

export type SensorToCircuit = Partial<Record<SensorKey, Partial<Record<CircuitKey, number>>>>;
export type CircuitToAction = Partial<Record<CircuitKey, Partial<Record<Action, number>>>>;

export interface BrainWeightsData {
  sensorToCircuit: SensorToCircuit;
  circuitToAction: CircuitToAction;
}

/*
 * PLASTICIDAD (v4). Solo las sinapsis que cumplen alguna regla son
 * plásticas. Límites absolutos (min/max) o relativos al peso inicial (span).
 */
/*
 * Canal de modulación: qué recompensas pueden cambiar la vía.
 *   'natural' → solo resultados homeostáticos (comer con hambre, descansar...)
 *   'all'     → también las del jugador y los eventos del juego
 * Sin canales, cada ❤️ reforzaba cualquier vía tónica activa (medido).
 */
export type ModulationChannel = 'natural' | 'all' | 'threat';
/*
 *   'threat'  → v6: SEGUNDO modulador, independiente de la recompensa. Un susto real
 *               (reflejo de miedo con causa en el mundo) REFUERZA las vías de estímulo →
 *               miedo que acababan de participar; acercarse/investigar sin que pase nada
 *               las DEBILITA (extinción). Con recompensa (Δw ∝ r) el miedo no podría
 *               aprenderse: un susto negativo lo debilitaría. Ver docs/living-world.md §Aprendizaje.
 */

type RuleBase = { min?: number; max?: number; span?: number; rate?: number; channel?: ModulationChannel };
export type PlasticityRule =
  | (RuleBase & { layer: 'sensorToCircuit'; from: readonly SensorKey[]; to: readonly CircuitKey[] | '*' })
  | (RuleBase & { layer: 'circuitToAction'; from: readonly CircuitKey[]; to: readonly Action[] | '*' });

export interface PlasticityConfig {
  enabled: boolean;
  learningRate: number;
  eligibilityDecay: number; // por tick
  eligibilityIncrement: number; // por coincidencia pre(t−1) → post(t)
  maxDeltaPerSynapse: number; // por experiencia
  maxWeightChangePerExperience: number; // Σ|Δw| por experiencia
  eligibilityConsumption: number; // fracción de la traza que queda tras una recompensa
  incomingBudgetFactor: number; // homeostasis: Σw+ entrante ≤ inicial × factor
  rules: PlasticityRule[];
}

export interface BrainConfig extends BrainWeightsData {
  version: number;
  neuron: { threshold: number; leak: number };
  sensors: SensorDef[];
  circuits: CircuitDef[];
  conflicts: [Action, Action][];
  lateralInhibition: { enabled: boolean; weight: number };
  plasticity: PlasticityConfig;
}

export const BRAIN_CONFIG_VERSION = 6;

// v5: neuronas de reloj (código de población en anillo) en el orden de CLOCK_PHASES_HOURS
export const CLOCK_SENSORS = ['time00', 'time04', 'time08', 'time12', 'time16', 'time20'] as const satisfies readonly SensorKey[];
export const ZONE_SENSORS = ['zoneBed', 'zoneFood', 'zonePlay', 'zoneWindow'] as const satisfies readonly SensorKey[];
const CONTEXT_SENSORS: readonly SensorKey[] = [...CLOCK_SENSORS, 'lightLevel', 'darkness', ...ZONE_SENSORS, 'recentActivity', 'openSpace', 'ambientActivity'];

/*
 * CANALES DE OBJETO (v4): cada objeto identificable tiene un sensor propio y
 * una neurona de atención. La actividad reciente de la neurona de atención
 * sesga qué objeto se convierte en foco (orientación dirigida por la red).
 */
export const OBJECT_CHANNELS = [
  { kind: 'ball', sensor: 'seesBall', attention: 'ballAttention' },
  { kind: 'teddy', sensor: 'seesTeddy', attention: 'teddyAttention' },
  { kind: 'rope', sensor: 'seesRope', attention: 'ropeAttention' },
  { kind: 'duck', sensor: 'seesDuck', attention: 'duckAttention' },
  { kind: 'mysteryBox', sensor: 'seesBox', attention: 'boxAttention' }, // v6
] as const satisfies readonly { kind: string; sensor: SensorKey; attention: CircuitKey }[];

const OBJECT_SENSORS = OBJECT_CHANNELS.map((c) => c.sensor);
const ATTENTION_CIRCUITS = OBJECT_CHANNELS.map((c) => c.attention);

const BASE_BRAIN_CONFIG: BrainConfig = {
  version: BRAIN_CONFIG_VERSION,

  neuron: { threshold: 1.0, leak: 0.9 },

  // ---- CAPA 1: sensores (el orden define los IDs N0, N1, ...) ----
  sensors: [
    { key: 'hunger', label: 'hambre', group: 'interno', gain: 0.35 },
    { key: 'thirst', label: 'sed', group: 'interno', gain: 0.35 },
    { key: 'fatigue', label: 'cansancio', group: 'interno', gain: 0.35 },
    { key: 'boredom', label: 'aburrimiento', group: 'interno', gain: 0.35 },
    { key: 'affectionNeed', label: 'falta de afecto', group: 'interno', gain: 0.35 },
    { key: 'energy', label: 'energía', group: 'interno', gain: 0.3 },
    { key: 'fear', label: 'miedo', group: 'interno', gain: 0.4 },
    { key: 'curiosity', label: 'curiosidad', group: 'interno', gain: 0.35 },
    { key: 'playerNear', label: 'jugador cerca', group: 'entorno', gain: 0.4, event: true },
    { key: 'playerTouching', label: 'jugador toca', group: 'entorno', gain: 0.5, event: true },
    { key: 'playerMoving', label: 'jugador se mueve', group: 'entorno', gain: 0.4, event: true },
    { key: 'foodAvailable', label: 'hay comida', group: 'entorno', gain: 0.3 },
    { key: 'waterAvailable', label: 'hay agua', group: 'entorno', gain: 0.3 },
    { key: 'bedAvailable', label: 'cama cerca', group: 'entorno', gain: 0.3 },
    { key: 'toyAvailable', label: 'juguete cerca', group: 'entorno', gain: 0.3 },
    { key: 'interestingObjectVisible', label: 'objeto interesante', group: 'entorno', gain: 0.35 },
    { key: 'hidingPlaceAvailable', label: 'escondite cerca', group: 'entorno', gain: 0.3 },
    { key: 'darkness', label: 'oscuridad', group: 'entorno', gain: 0.3, event: true },
    { key: 'loudSound', label: 'ruido fuerte', group: 'entorno', gain: 0.7, event: true },
    { key: 'newObjectDetected', label: 'objeto nuevo', group: 'entorno', gain: 0.6, event: true },
    { key: 'playerCalling', label: 'te llama', group: 'entorno', gain: 0.6, event: true },
    // v4: estímulos identificables (qué objeto concreto ve)
    { key: 'seesBall', label: 've la pelota', group: 'entorno', gain: 0.35 },
    { key: 'seesTeddy', label: 've el peluche', group: 'entorno', gain: 0.35 },
    { key: 'seesRope', label: 've la cuerda', group: 'entorno', gain: 0.35 },
    { key: 'seesDuck', label: 've el patito', group: 'entorno', gain: 0.35 },
    // v5: contexto. El reloj es INFORMACIÓN, no una orden (6 neuronas en anillo, 00/04/08/12/16/20 h)
    { key: 'time00', label: 'hora ~00 h', group: 'contexto', gain: 0.35 },
    { key: 'time04', label: 'hora ~04 h', group: 'contexto', gain: 0.35 },
    { key: 'time08', label: 'hora ~08 h', group: 'contexto', gain: 0.35 },
    { key: 'time12', label: 'hora ~12 h', group: 'contexto', gain: 0.35 },
    { key: 'time16', label: 'hora ~16 h', group: 'contexto', gain: 0.35 },
    { key: 'time20', label: 'hora ~20 h', group: 'contexto', gain: 0.35 },
    { key: 'lightLevel', label: 'luz', group: 'contexto', gain: 0.3 },
    { key: 'zoneBed', label: 'zona de la cama', group: 'contexto', gain: 0.3 },
    { key: 'zoneFood', label: 'zona de comida', group: 'contexto', gain: 0.3 },
    { key: 'zonePlay', label: 'zona de juego', group: 'contexto', gain: 0.3 },
    { key: 'zoneWindow', label: 'zona de la ventana', group: 'contexto', gain: 0.3 },
    { key: 'playerReturned', label: 'acabas de volver', group: 'contexto', gain: 0.5, event: true },
    { key: 'recentActivity', label: 'actividad reciente', group: 'contexto', gain: 0.3 },
    // v6: mundo vivo. Percepción espacial (FOV/oído) y memoria de exposición, nunca "si es una caja…"
    { key: 'seesBox', label: 've la caja', group: 'entorno', gain: 0.35 },
    { key: 'objectMoving', label: 'algo se mueve', group: 'entorno', gain: 0.4 },
    { key: 'soundHeard', label: 'oye algo', group: 'entorno', gain: 0.5, event: true },
    { key: 'soundNovelty', label: 'sonido desconocido', group: 'entorno', gain: 0.5, event: true },
    { key: 'familiarObject', label: 'objeto conocido', group: 'entorno', gain: 0.3 },
    { key: 'unfamiliarPlace', label: 'lugar poco conocido', group: 'contexto', gain: 0.35 },
    { key: 'openSpace', label: 'espacio abierto', group: 'contexto', gain: 0.3 },
    { key: 'ambientActivity', label: 'actividad alrededor', group: 'contexto', gain: 0.3 },
  ],

  // ---- CAPA 2: circuitos internos (una neurona LIF cada uno) ----
  circuits: [
    { key: 'feedingCircuit', label: 'alimentación' },
    { key: 'drinkingCircuit', label: 'hidratación' },
    { key: 'restCircuit', label: 'descanso' },
    { key: 'activityCircuit', label: 'actividad' },
    { key: 'playCircuit', label: 'juego' },
    { key: 'socialCircuit', label: 'social' },
    { key: 'lonelinessCircuit', label: 'soledad' },
    { key: 'followCircuit', label: 'seguimiento' },
    { key: 'joyCircuit', label: 'alegría' },
    { key: 'distressCircuit', label: 'malestar' },
    { key: 'curiosityCircuit', label: 'curiosidad' },
    { key: 'fearCircuit', label: 'miedo' },
    // v4: atención por objeto (todas nacen iguales: sin preferencias)
    { key: 'ballAttention', label: 'atención a la pelota' },
    { key: 'teddyAttention', label: 'atención al peluche' },
    { key: 'ropeAttention', label: 'atención a la cuerda' },
    { key: 'duckAttention', label: 'atención al patito' },
    { key: 'boxAttention', label: 'atención a la caja' }, // v6
  ],

  // ---- CAPA 3: salidas = ACTION_LIST (una neurona por acción) ----

  /*
   * MATRIZ Sensores → Circuitos
   * Cada fila es un sensor; cada clave, un circuito destino. Lo que no aparece vale 0.
   */
  sensorToCircuit: {
    hunger: { feedingCircuit: 0.7, distressCircuit: 0.25, playCircuit: -0.2, joyCircuit: -0.3 },
    thirst: { drinkingCircuit: 0.7, distressCircuit: 0.25, joyCircuit: -0.3 },
    fatigue: { restCircuit: 1.0, activityCircuit: -0.35, playCircuit: -0.4, followCircuit: -0.3, curiosityCircuit: -0.2 },
    boredom: { playCircuit: 0.6, activityCircuit: 0.35, lonelinessCircuit: 0.2, curiosityCircuit: 0.2 },
    affectionNeed: { lonelinessCircuit: 0.6, socialCircuit: 0.3, followCircuit: 0.25, distressCircuit: 0.25, joyCircuit: -0.3 },
    energy: { activityCircuit: 0.45, playCircuit: 0.3, joyCircuit: 0.2, restCircuit: -0.05, distressCircuit: -0.1 },
    fear: {
      fearCircuit: 0.7, distressCircuit: 0.4, feedingCircuit: -0.4, drinkingCircuit: -0.4, socialCircuit: -0.5,
      playCircuit: -0.5, curiosityCircuit: -0.4, joyCircuit: -0.6, restCircuit: -0.3, followCircuit: -0.3,
    },
    curiosity: { curiosityCircuit: 0.6, activityCircuit: 0.15 },
    playerNear: { socialCircuit: 0.6, joyCircuit: 0.3, followCircuit: 0.3, lonelinessCircuit: -0.5 },
    playerTouching: { socialCircuit: 0.5, joyCircuit: 0.6, fearCircuit: -0.4, distressCircuit: -0.5, restCircuit: -0.2 },
    playerMoving: { followCircuit: 0.7, socialCircuit: 0.1 },
    foodAvailable: { feedingCircuit: 0.3 },
    waterAvailable: { drinkingCircuit: 0.3 },
    bedAvailable: { restCircuit: 0.2 },
    toyAvailable: { playCircuit: 0.35, joyCircuit: 0.1 },
    interestingObjectVisible: { curiosityCircuit: 0.35 },
    hidingPlaceAvailable: { fearCircuit: 0.05 },
    darkness: { restCircuit: 0.4, fearCircuit: 0.3, activityCircuit: -0.3 },
    loudSound: { fearCircuit: 0.9, restCircuit: -0.6, socialCircuit: -0.2 },
    newObjectDetected: { curiosityCircuit: 0.7, fearCircuit: 0.15 },
    // v3: una voz conocida llamando. Pesos moderados: no garantiza que venga.
    playerCalling: { socialCircuit: 0.45, followCircuit: 0.35, joyCircuit: 0.15, curiosityCircuit: 0.1, fearCircuit: -0.1 },
    // v4: idénticos para todos los objetos → ninguna preferencia de nacimiento
    seesBall: { ballAttention: 0.55, curiosityCircuit: 0.1, playCircuit: 0.1 },
    seesTeddy: { teddyAttention: 0.55, curiosityCircuit: 0.1, playCircuit: 0.1 },
    seesRope: { ropeAttention: 0.55, curiosityCircuit: 0.1, playCircuit: 0.1 },
    seesDuck: { duckAttention: 0.55, curiosityCircuit: 0.1, playCircuit: 0.1 },
    // v5: el reloj nace SIN preferencia horaria: las 6 fases pesan igual (0.05 a descanso y actividad)
    time00: { restCircuit: 0.05, activityCircuit: 0.05 },
    time04: { restCircuit: 0.05, activityCircuit: 0.05 },
    time08: { restCircuit: 0.05, activityCircuit: 0.05 },
    time12: { restCircuit: 0.05, activityCircuit: 0.05 },
    time16: { restCircuit: 0.05, activityCircuit: 0.05 },
    time20: { restCircuit: 0.05, activityCircuit: 0.05 },
    lightLevel: { activityCircuit: 0.15, curiosityCircuit: 0.05 },
    zoneBed: { restCircuit: 0.1 },
    zoneFood: { feedingCircuit: 0.1, drinkingCircuit: 0.05 },
    zonePlay: { playCircuit: 0.1 },
    zoneWindow: { curiosityCircuit: 0.1 },
    playerReturned: { socialCircuit: 0.3, joyCircuit: 0.2, followCircuit: 0.1 },
    recentActivity: { restCircuit: 0.1, activityCircuit: -0.1 },
    // v6: mundo vivo. Mismos pesos para todas las mascotas; lo que cambie será aprendido
    seesBox: { boxAttention: 0.55, curiosityCircuit: 0.1, playCircuit: 0.1 },
    objectMoving: { curiosityCircuit: 0.3, playCircuit: 0.25 },
    soundHeard: { curiosityCircuit: 0.3, fearCircuit: 0.1, restCircuit: -0.25 },
    soundNovelty: { curiosityCircuit: 0.2, fearCircuit: 0.3 },
    familiarObject: { playCircuit: 0.15, curiosityCircuit: -0.1, fearCircuit: -0.25 },
    unfamiliarPlace: { fearCircuit: 0.25, curiosityCircuit: 0.3, followCircuit: 0.25, restCircuit: -0.2 },
    openSpace: { activityCircuit: 0.25, playCircuit: 0.1 },
    ambientActivity: { curiosityCircuit: 0.15, restCircuit: -0.15 },
  },

  /*
   * MATRIZ Circuitos → Acciones
   */
  circuitToAction: {
    feedingCircuit: { EAT: 0.9, DRINK: -0.2, SLEEP: -0.2 },
    drinkingCircuit: { DRINK: 0.9, EAT: -0.2, SLEEP: -0.2 },
    restCircuit: { REST: 0.9, SLEEP: 0.8, RUN: -0.8, PLAY: -0.5, EXPLORE: -0.5, WALK: -0.4, DANCE: -0.5, EAT: -0.3 },
    activityCircuit: { WALK: 0.8, EXPLORE: 0.6, RUN: 0.4, REST: -0.4, SLEEP: -0.3, INVESTIGATE: 0.2 },
    playCircuit: { PLAY: 0.9, RUN: 0.4, PICK_UP_OBJECT: 0.6, DANCE: 0.4, MAKE_SOUND: 0.3, EXPLORE: 0.2, SLEEP: -0.2 },
    socialCircuit: { APPROACH: 0.8, GREET: 0.6, SMILE: 0.3, ASK_ATTENTION: 0.2, FOLLOW_PLAYER: 0.2, MOVE_AWAY: -0.4, SLEEP: -0.3, HIDE: -0.3 },
    lonelinessCircuit: { ASK_ATTENTION: 0.9, CRY: 0.3, MAKE_SOUND: 0.4, APPROACH: 0.3 },
    followCircuit: { FOLLOW_PLAYER: 0.9, WALK: 0.4, APPROACH: 0.3 },
    joyCircuit: { SMILE: 0.9, DANCE: 0.6, GREET: 0.3, PLAY: 0.3, MAKE_SOUND: 0.3, CRY: -0.6 },
    distressCircuit: { CRY: 0.8, MAKE_SOUND: 0.4, ASK_ATTENTION: 0.3, SMILE: -0.6, DANCE: -0.4 },
    curiosityCircuit: { LOOK_AT_OBJECT: 0.9, INVESTIGATE: 0.6, EXPLORE: 0.4, PICK_UP_OBJECT: 0.4, SLEEP: -0.3 },
    fearCircuit: {
      GET_SCARED: 1.0, MOVE_AWAY: 0.8, HIDE: 0.75, RUN: 0.5, LOOK_AT_OBJECT: 0.2,
      APPROACH: -0.8, GREET: -0.5, SMILE: -0.5, DANCE: -0.6, PLAY: -0.6, EAT: -0.6,
      DRINK: -0.6, SLEEP: -0.5, INVESTIGATE: -0.5, PICK_UP_OBJECT: -0.4, FOLLOW_PLAYER: -0.5,
    },
    ballAttention: { LOOK_AT_OBJECT: 0.35, INVESTIGATE: 0.25, PLAY: 0.2, PICK_UP_OBJECT: 0.2 },
    teddyAttention: { LOOK_AT_OBJECT: 0.35, INVESTIGATE: 0.25, PLAY: 0.2, PICK_UP_OBJECT: 0.2 },
    ropeAttention: { LOOK_AT_OBJECT: 0.35, INVESTIGATE: 0.25, PLAY: 0.2, PICK_UP_OBJECT: 0.2 },
    duckAttention: { LOOK_AT_OBJECT: 0.35, INVESTIGATE: 0.25, PLAY: 0.2, PICK_UP_OBJECT: 0.2 },
    boxAttention: { LOOK_AT_OBJECT: 0.35, INVESTIGATE: 0.25, PLAY: 0.2, PICK_UP_OBJECT: 0.2 },
  },

  /*
   * CONFLICTOS FÍSICOS: pares de acciones que no pueden ejecutarse bien a la
   * vez. Solo se REGISTRAN (ConflictMonitor) para estudiarlos.
   */
  conflicts: [
    ['SLEEP', 'RUN'], ['APPROACH', 'MOVE_AWAY'], ['EAT', 'SLEEP'], ['HIDE', 'APPROACH'],
    ['REST', 'RUN'], ['SLEEP', 'PLAY'], ['SLEEP', 'DANCE'], ['SMILE', 'CRY'],
    ['DRINK', 'SLEEP'], ['HIDE', 'DANCE'], ['FOLLOW_PLAYER', 'MOVE_AWAY'], ['REST', 'EXPLORE'],
  ],

  // PREPARADO, APAGADO: inhibición lateral entre acciones en conflicto (dentro de la red).
  lateralInhibition: { enabled: false, weight: -0.6 },

  // Ver docs/learning-system.md §3–§5
  plasticity: {
    enabled: true,
    learningRate: 0.015,
    eligibilityDecay: 0.93,
    eligibilityIncrement: 0.5,
    maxDeltaPerSynapse: 0.008,
    maxWeightChangePerExperience: 0.12,
    eligibilityConsumption: 0.5,
    incomingBudgetFactor: 1.6,
    rules: [
      // Solo destinos plausibles: con '*' aparecían asociaciones espurias (ver docs/learning-results.md)
      { layer: 'sensorToCircuit', from: OBJECT_SENSORS, to: ['curiosityCircuit', 'playCircuit', 'joyCircuit'], min: -0.2, max: 0.9 },
      // La atención decide el FOCO por "el que más tira" (winner-take-all): pequeños cambios
      // aquí cambian mucho la conducta, así que aprende 4 veces más despacio (medido)
      { layer: 'sensorToCircuit', from: OBJECT_SENSORS, to: ATTENTION_CIRCUITS, min: -0.2, max: 0.9, rate: 0.25 },
      { layer: 'circuitToAction', from: ATTENTION_CIRCUITS, to: ['LOOK_AT_OBJECT', 'INVESTIGATE', 'PLAY', 'PICK_UP_OBJECT'], min: 0, max: 0.8 },
      { layer: 'sensorToCircuit', from: ['playerCalling'], to: ['socialCircuit', 'followCircuit', 'joyCircuit'], min: 0, max: 1.0 },
      // Nota: social/seguimiento → APPROACH NO es plástica: si lo fuera, la mascota aprendería
      // "acercarse siempre" en vez de la asociación con la llamada (medido: docs/learning-results.md)
      { layer: 'sensorToCircuit', from: ['hunger', 'thirst', 'fatigue', 'boredom'], to: ['feedingCircuit', 'drinkingCircuit', 'restCircuit', 'playCircuit'], span: 0.2, rate: 0.5, channel: 'natural' },
      // v5: contexto (hora, luz, lugar, actividad reciente) → circuitos de conducta, aprendido del RESULTADO
      // (canal natural: solo consecuencias sobre necesidades; ver docs/routine-results.md para las variantes medidas)
      { layer: 'sensorToCircuit', from: CONTEXT_SENSORS, to: ['restCircuit', 'activityCircuit', 'playCircuit', 'curiosityCircuit', 'feedingCircuit'], min: -0.3, max: 0.6, channel: 'natural' },
      // v6: lo nuevo y lo que se mueve → curiosidad/juego: explorar y que salga BIEN refuerza la curiosidad
      { layer: 'sensorToCircuit', from: ['newObjectDetected', 'objectMoving', 'soundNovelty'], to: ['curiosityCircuit', 'playCircuit'], min: 0, max: 1.0, rate: 0.5 },
      // v6: AMENAZA. Estímulos del mundo → miedo: un susto real los refuerza; la exposición sin consecuencias los extingue
      { layer: 'sensorToCircuit', from: [...OBJECT_SENSORS, 'newObjectDetected', 'objectMoving', 'soundHeard', 'soundNovelty', 'unfamiliarPlace'], to: ['fearCircuit'], min: 0, max: 1.0, rate: 3, channel: 'threat' },
      // v5: volver a casa → recibirte (lo refuerzan tus ❤️)
      { layer: 'sensorToCircuit', from: ['playerReturned'], to: ['socialCircuit', 'joyCircuit', 'followCircuit'], min: 0, max: 0.9, rate: 3 },
      {
        layer: 'circuitToAction', from: ['feedingCircuit', 'drinkingCircuit', 'restCircuit', 'playCircuit', 'curiosityCircuit'],
        to: ['EAT', 'DRINK', 'REST', 'SLEEP', 'PLAY', 'INVESTIGATE', 'LOOK_AT_OBJECT', 'PICK_UP_OBJECT'], span: 0.2, rate: 0.5, channel: 'natural',
      },
    ],
  },
};

/*
 * PERSONALIDADES: el mismo código, otros pesos.
 * Cada preset es un parche sobre los pesos base: [capa, origen, destino, peso].
 */
export type WeightPatch =
  | ['sensorToCircuit', SensorKey, CircuitKey, number]
  | ['circuitToAction', CircuitKey, Action, number];

export type PresetKey = 'equilibrado' | 'curioso' | 'miedoso' | 'apegado';

export const BRAIN_PRESETS: Readonly<Record<PresetKey, { label: string; patch: WeightPatch[] }>> = {
  equilibrado: { label: 'Equilibrado', patch: [] },
  curioso: {
    label: 'Curioso',
    patch: [
      ['sensorToCircuit', 'curiosity', 'curiosityCircuit', 0.9],
      ['sensorToCircuit', 'newObjectDetected', 'curiosityCircuit', 1.0],
      ['sensorToCircuit', 'newObjectDetected', 'fearCircuit', 0.0],
      ['circuitToAction', 'curiosityCircuit', 'EXPLORE', 0.8],
      ['circuitToAction', 'curiosityCircuit', 'INVESTIGATE', 0.9],
      ['circuitToAction', 'curiosityCircuit', 'PICK_UP_OBJECT', 0.6],
      ['sensorToCircuit', 'loudSound', 'fearCircuit', 0.6],
      ['sensorToCircuit', 'objectMoving', 'curiosityCircuit', 0.5],
      ['sensorToCircuit', 'unfamiliarPlace', 'curiosityCircuit', 0.5],
    ],
  },
  miedoso: {
    label: 'Miedoso',
    patch: [
      ['sensorToCircuit', 'loudSound', 'fearCircuit', 1.2],
      ['sensorToCircuit', 'darkness', 'fearCircuit', 0.6],
      ['sensorToCircuit', 'fear', 'fearCircuit', 0.9],
      ['sensorToCircuit', 'newObjectDetected', 'fearCircuit', 0.6],
      ['circuitToAction', 'fearCircuit', 'HIDE', 1.0],
      ['circuitToAction', 'fearCircuit', 'GET_SCARED', 1.1],
      ['circuitToAction', 'socialCircuit', 'APPROACH', 0.5],
      ['sensorToCircuit', 'soundNovelty', 'fearCircuit', 0.5],
      ['sensorToCircuit', 'unfamiliarPlace', 'fearCircuit', 0.45],
    ],
  },
  apegado: {
    label: 'Apegado',
    patch: [
      ['sensorToCircuit', 'playerNear', 'socialCircuit', 0.9],
      ['sensorToCircuit', 'affectionNeed', 'lonelinessCircuit', 0.8],
      ['circuitToAction', 'socialCircuit', 'APPROACH', 1.0],
      ['circuitToAction', 'socialCircuit', 'GREET', 0.8],
      ['circuitToAction', 'followCircuit', 'FOLLOW_PLAYER', 1.1],
      ['sensorToCircuit', 'playerMoving', 'followCircuit', 0.9],
    ],
  },
};

// Copia profunda del genoma base: cada mascota tiene el suyo (preparado para plasticidad).
export function createBrainConfig(preset: PresetKey = 'equilibrado'): BrainConfig {
  const config = cloneBrainConfig(BASE_BRAIN_CONFIG);
  for (const patch of BRAIN_PRESETS[preset].patch) applyWeightPatch(config, patch);
  return config;
}

export function cloneBrainConfig(config: BrainConfig): BrainConfig {
  return JSON.parse(JSON.stringify(config)) as BrainConfig;
}

export function baseBrainConfig(): Readonly<BrainConfig> {
  return BASE_BRAIN_CONFIG;
}

export function applyWeightPatch(config: BrainConfig, patch: WeightPatch): void {
  if (patch[0] === 'sensorToCircuit') setSensorWeight(config, patch[1], patch[2], patch[3]);
  else setCircuitWeight(config, patch[1], patch[2], patch[3]);
}

export function getSensorWeight(config: BrainWeightsData, from: SensorKey, to: CircuitKey): number {
  return config.sensorToCircuit[from]?.[to] ?? 0;
}

export function getCircuitWeight(config: BrainWeightsData, from: CircuitKey, to: Action): number {
  return config.circuitToAction[from]?.[to] ?? 0;
}

export function setSensorWeight(config: BrainWeightsData, from: SensorKey, to: CircuitKey, weight: number): void {
  const row = (config.sensorToCircuit[from] ??= {});
  if (weight === 0) delete row[to];
  else row[to] = weight;
}

export function setCircuitWeight(config: BrainWeightsData, from: CircuitKey, to: Action, weight: number): void {
  const row = (config.circuitToAction[from] ??= {});
  if (weight === 0) delete row[to];
  else row[to] = weight;
}
