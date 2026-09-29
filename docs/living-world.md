# Mundo vivo — auditoría y diseño

Complementa `docs/living-world-results.md` (resultados medidos) y los documentos
de aprendizaje, rutinas y crecimiento. Principio que guía todo:

```
MUNDO CAMBIA → MASCOTA PERCIBE → SNN REACCIONA → MASCOTA ACTÚA → MUNDO RESPONDE
      → EXPERIENCIA → MEMORIA + APRENDIZAJE → COMPORTAMIENTO FUTURO DIFERENTE
```

Ningún lugar, objeto ni evento decide la conducta. Producen **estímulos**; decide la SNN.

---

## 1. Auditoría (estado antes de este trabajo)

| Pieza | Dónde | Qué había | Problema para un "mundo vivo" |
|---|---|---|---|
| World / WorldState | `core/simulation/World.ts` | Una sola habitación 1×1, objetos con `interest` y `novelty` **por tipo** (novel = 1), física de lanzamiento, zonas, hora y luz (v5) | Sin ubicaciones. Novedad dada por el TIPO (`novelty: 1` en el catálogo). |
| Percepción | `World.perceive()` | Valores 0..1 por proximidad y luz | **Omnisciente**: veía todo, detrás y lejos. Sin orientación. |
| Sonido | `World.sound` | Un único nivel global que decae | No era un estímulo espacial: sin dirección, sin atenuación, sin novedad. |
| WorldClock | `core/time/WorldClock.ts` | Real / simulación / test, solo informa | Sin cambios (se reutiliza). |
| Renderer | `render3d/PetScene.ts` | Habitación fija, props, luces de estudio | Una sola escena; la mascota "miraba a cámara" al estar quieta (no coincidía con lo que veía). |
| Pet3D / movimiento | `MovementSystem`, `Pet` | Suma de intenciones (seek/flee/wander); `facing` ±1 | Sin orientación en el plano → no se podía definir un campo de visión. |
| Locations | — | No existían | — |
| Objects | `core/world/Items.ts` | Catálogo con interés y novedad por tipo | Sin affordances, sin estado (abierta/vacía), sin propiedades sensoriales. |
| Sensores / SNN | `BrainConfig` v5 | 38 sensores, 17 circuitos, plasticidad con recompensa | El miedo **no era plástico** (una recompensa negativa lo habría debilitado). |
| ActionSystem | `ActionSystem.ts` | Handlers físicos; objetivo = el foco o el más cercano | Objetivos por cercanía; en la práctica `nearest(...)` o el primero. |
| Experience / Memory | `ExperienceRecorder`, `PetMemory` | Experiencias con valencia, preferencias, momentos, descubrimientos | Sin memoria de exposición (lo visto / conocido). |
| Offline | `OfflineSimulation.ts` | La SNN real corre comprimida | Solo la habitación. |
| Growth | `GrowthSystem` | Etapas, capacidades físicas (`gate`) | Nada que "abra" el mundo. |
| Persistencia | `SaveGame` v4 + migraciones | Mundo = objetos de la habitación | Sin ubicación, puertas ni exploración. |

Pruebas previas: 216 tests, **1 ya fallaba** antes de empezar
(`learningSlices` "¿Cuál prefieres?": `eB.share < e0.share`, 0.065 vs 0.019).

---

## 2. Modelo del mundo (dominio, sin Three.js)

```
World (core/simulation/World.ts: fachada, API compatible)
 ├── locations    ubicación actual + objetos guardados de las demás    (world/Locations.ts)
 ├── entities     mascota (con orientación) y jugador
 ├── objects      WorldObject: estado, affordances, propiedades sensoriales (world/Items.ts)
 ├── environment  EnvironmentState: luz, actividad, ruido, clima, hora, novedad (world/Environment.ts)
 ├── events       WorldEventSystem: OBJECT_APPEARED, SOUND_OCCURRED, LEAF_FELL, LOCATION_CHANGED…
 └── pet
```

Módulos nuevos en `src/core/world/`:

| Archivo | Responsabilidad |
|---|---|
| `Locations.ts` | Datos de cada ubicación (sin comportamiento). |
| `Items.ts` | Catálogo físico: `size`, `movable`, `interactive`, `sensory`, `affordances`, `friction`. |
| `Environment.ts` | `EnvironmentState` y cálculo de luz/actividad por ubicación. |
| `Sound.ts` | `SoundStimulus` (dominio) — separado de la reproducción de audio. |
| `ExplorationMemory.ts` | ObjectMemory / LocationMemory / SoundMemory → novedad y familiaridad. |
| `Perception.ts` | `WorldSensorSystem`: FOV, distancia, luz, sentido cercano, oído. |
| `Attention.ts` | `AttentionSystem` (sobre qué estímulo se actúa) y `TargetResolver`. |
| `Navigation.ts` | `PetNavigationSystem`: rodeos y salidas entre ubicaciones. |
| `AmbientEventDirector.ts` | Microeventos discretos, deterministas con semilla o guion. |
| `experiments.ts` | Experimentos reproducibles (tests, informe, herramientas). |

Three.js (`render3d/`) **representa** el mundo: lee `world.location`, objetos y
estados; nunca es la fuente del estado. `render3d/Environments.ts` construye
habitación, jardín y parque y los desecha al cambiar de lugar.

### 2.1 Coordenadas

Cada ubicación es un suelo normalizado 0..1 × 0..1. `size` lo escala a
**unidades de habitación** (1 ≈ 5.2 m). `World.distance()` mide siempre en
esas unidades, así "estar al lado" (0.1) significa lo mismo en todas partes y
el parque (2.8 × 2.2) es de verdad más grande. En la habitación todo es
numéricamente idéntico a antes (compatibilidad con los experimentos previos).

---

## 3. Ubicaciones

```
🏠 CASA
   ├── room    habitación   (1 × 1)     segura, familiar: cama, juguetes, comida, ventana
   └── garden  jardín       (1.7 × 1.4) más espacio, plantas, movimiento, sonidos, objetos ocasionales
🌳 park        parque       (2.8 × 2.2) gran espacio, objetos desconocidos, más estímulos
🌲 forest / 🏖️ beach        declaradas (available: false): arquitectura lista, sin contenido
```

Cada `LocationDef` define `id, type, availableObjects, environment
(sensoryProfile), navigationBounds, spawnPoints, interactionPoints (salidas,
ventana), zones, obstacles, furniture, minStage`. **Nada** sobre cómo reacciona
Milo allí.

| | habitación | jardín | parque |
|---|---|---|---|
| openness (→ `openSpace`) | 0 | 0.55 | 1 |
| actividad de fondo | 0 | 0.35 | 0.6 |
| ruido de fondo | 0.03 | 0.10 | 0.20 |
| alcance visual | 1.3 | 2.2 | 3.2 |
| microeventos | sonido fuera, pájaro por la ventana | hojas, mariposas, pájaros, viento, nubes | lo mismo, más frecuente + plumas |
| etapa mínima | — | CHILD (cachorro) | YOUNG |

**Zonas** semánticas (BED_ZONE, PLAY_ZONE, WINDOW_ZONE, FOOD_ZONE, LAWN,
FLOWERBED, POND, MEADOW…) son contexto espacial: alimentan los sensores de
zona existentes o solo la memoria ("rincones familiares"); nunca conducta.

**Salidas**: `room>garden` (puerta; la mascota puede cruzarla sola si está
abierta y su cuerpo puede) y `garden>park` (verja: no la cruza sola; al parque
se va de paseo con el jugador).

---

## 4. Objetos

| Objeto | Affordances | Estados | Sensorial |
|---|---|---|---|
| ⚽ pelota | canPush, canCarry, canPlay, canRoll, canInspect | stationary / rolling | visual 0.3, suena al rebotar |
| 🧸 peluche | canPush, canCarry, canPlay, canInspect | | visual 0.4 |
| 📦 caja misteriosa | canInspect, canEnter, canHide, canPush | closed / open / occupied (+ contenido) | visual 0.9, cruje |
| 🛏 cama | canRest, canSleep | | |
| 🥣 comida | canEat | available / empty | |
| 💧 agua | canDrink | | |
| 🪞 espejo | canInspect | | **reflective**: su imagen se mueve cuando la mascota se mueve delante |
| 🍂 hoja · 🪶 pluma | canCarry, canInspect, canPlay | drifting (caen planeando), vida limitada | suave |
| 🦋 mariposa | canInspect | vuela (entidad ambiental) | se mueve |

Una affordance dice **"es físicamente posible"**. Ejemplos de uso: jugar solo
con lo que `canPlay`; esconderse solo en lo que `canHide` **y** está abierto
(una caja cerrada no); la tienda sigue siendo el escondite conocido.

La novedad **ya no está en el catálogo**. Colocar cualquier objeto produce la
misma señal transitoria "apareció algo" (0.5). Lo que la hace nueva o conocida
es la memoria de cada mascota.

### Física simplificada

`impulso → velocidad → rozamiento (objeto × suelo) → parada`, rebote en los
límites con un `thud` proporcional a la velocidad. La pelota rueda (0.85), el
peluche casi no (0.6), la hierba frena más (0.9 / 0.85). PLAY empuja la pelota
con un impulso (antes la teletransportaba ±0.06). El viento empuja hojas y
objetos ligeros fuera.

---

## 5. Percepción (`WorldSensorSystem`)

```
WORLD → percepción espacial → señales 0..1 normalizadas → Sensors → SNN
```

- **Orientación**: `pet.orientation` (radianes en el suelo). Gira hacia lo que
  mira o hacia donde camina, como máximo 0.9 rad/tick. El render usa esa misma
  orientación: lo que se ve en pantalla es lo que "ve".
- **FOV configurable** (`SimConfig.perception`): 250° en total, 140° nítidos
  (campo visual de un perro ≈ 240–250°). Fuera del cono nítido la señal cae
  linealmente hasta 0; detrás (110° a cada lado de la nuca) no se ve.
- **Distancia**: `(0.4 + 0.6·proximidad)` como antes, y desaparece más allá
  del alcance visual del lugar.
- **Luz**: `0.45 + 0.55·luz` (a oscuras se intuyen siluetas).
- **Sentido cercano** (olfato, bigotes, tacto): 0.15 u (~0.8 m) en todas las
  direcciones, sin depender de la luz.
- **Oído**: fuera del FOV también. `oído = intensidad · 1/(1+(d/1)²)`, con
  dirección (ángulo respecto a la cabeza), `behind` y novedad del tipo de
  sonido. Los sonidos fuertes siguen yendo a `loudSound`; los demás a
  `soundHeard` / `soundNovelty`.
- **Movimiento**: velocidad del objeto; para el espejo, la velocidad de la
  propia mascota si está delante (estímulo correlacionado con su movimiento —
  **no** se afirma que "se reconozca").
- Muy importante: los recursos conocidos (su plato, su cama, su tienda) se
  siguen "sabiendo" aunque no se vean (memoria espacial); lo nuevo solo existe
  para ella si lo percibe.

Sensores nuevos (BrainConfig v6, al final de la capa; ningún peso existente cambia):

| Sensor | De dónde sale |
|---|---|
| `seesBox` | canal propio de la caja (como pelota/peluche/cuerda/patito), con su neurona `boxAttention` |
| `objectMoving` | movimiento percibido (× señal) |
| `soundHeard`, `soundNovelty` | oído (no fuertes) y su novedad |
| `familiarObject` | familiaridad (memoria) del objeto atendido |
| `unfamiliarPlace` | 1 − familiaridad del lugar |
| `openSpace`, `ambientActivity` | perfil sensorial + microeventos |

Los pesos de nacimiento son **iguales para todas las mascotas**; los presets
(curioso, miedoso) añaden parches igual que antes.

---

## 6. Novedad y familiaridad (`ExplorationMemory`)

Dos señales **separadas**, calculadas de la experiencia real de ESTA mascota:

```
exposición += 0.015·señal por tick visto   + 0.12 por tick investigando   + 0.35 por interacción
novelty     = exp(−exposición_efectiva / 2.5)
              exposición_efectiva = exposición · (1 − 0.5·(1 − e^(−días_sin_verlo/4)))   ← recuperación parcial
familiarity = 1 − exp(−(0.35·encuentros + 0.08·ticks_investigando + 0.5·interacciones + min(4, 0.5·exposición)) / 6)
```

Encuentro = volver a verlo tras ≥ 90 s de mundo sin verlo. La novedad baja
deprisa (habituación) y vuelve en parte tras días sin verlo; la familiaridad
sube despacio y no se olvida. Etapas de conocimiento separadas:
**SAW → APPROACHED → INVESTIGATED → INTERACTED** (ver ≠ conocer).

Los muebles de casa (cama, plato, agua, tienda) y la habitación se registran
como vividos el día de la adopción; todo lo demás empieza desconocido. Para
las mascotas existentes, la migración v4→v5 reconstruye la memoria SOLO con
evidencia real (`objectStats`, tiempo vivido).

La novedad de memoria tira **poco** de la atención de abajo arriba
(`NOVELTY_PULL = 0.05`): llega al cerebro por `newObjectDetected` y
`familiarObject`, y es la red (curiosa o miedosa según su historia) la que
decide acercarse o no. Con 0.5 la novedad arrastraba la atención ella sola y
tapaba lo aprendido (medido, ver resultados).

---

## 7. Atención y selección de objetivo

**AttentionSystem** decide sobre qué estímulo se está actuando:

```
score(objeto) = saliencia percibida (señal × (transitorio + 0.05·novedad + 0.6·visual + 0.5·movimiento))
              + 0.2 · atención neuronal (EMA de spikes de su neurona de atención)
              + 0.3 · Σ_c w_aprendido(ve X → c) · actividad(c)      ← competencia sesgada (arriba abajo)
              + 0.08 si ya era el objetivo (histéresis)
score(sonido) = 1.2 · oído · (0.5 + 0.5·novedad) · 0.7^edad
```

El término de arriba abajo es la **asociación aprendida**: si el circuito de
juego está activo, los objetos cuya vía sensorial alimenta el juego (según los
pesos de ESA mascota) ganan atención. No hay reglas por tipo.

**TargetResolver** traduce una intención ya decidida en un objetivo:
`best(affordance)` usa señal percibida, atención neuronal, asociación
aprendida, foco actual, distancia y novedad — nunca `objects[0]`. Los recursos
(comer, beber, dormir, esconderse) usan lo **conocido**, también en otra
ubicación alcanzable (vuelve a casa a comer). `threat()` para alejarse: el
sonido fuerte reciente, si no lo que estaba mirando, si no el jugador.

## 8. Navegación

```
SNN → INVESTIGATE/EXPLORE/APPROACH/MOVE_AWAY → ActionSystem → TargetResolver → objetivo
                                                            → PetNavigationSystem → waypoint → MovementSystem
```

Sin pathfinding en la red. La navegación rodea obstáculos del lugar (árbol,
estanque, banco) y, si el objetivo está en otra ubicación, va a la salida que
las conecta. Cruzar solo si la puerta está abierta, la salida es de las que
puede cruzar sola y su etapa de vida lo permite. **Cruzar es físico**: la
ubicación solo cambia estando en la salida (test).

EXPLORE elige entre puntos del lugar (más peso a zonas poco conocidas) y las
salidas cruzables (más peso cuanto más desconocido el otro lado, si está cerca
de la puerta o si algo acaba de sonar allí). Por una puerta abierta se cuelan
sonidos del jardín (con `origin`): investigar ese sonido puede llevarla fuera.

## 9. Eventos y microeventos

`WorldEventSystem` = los eventos del mundo (`drainEvents`): `OBJECT_APPEARED`,
`OBJECT_MOVED`, `OBJECT_OPENED`, `SOUND_OCCURRED`, `LOUD_SOUND`,
`LIGHT_CHANGED`, `LEAF_FELL`, `BUTTERFLY_APPEARED`, `WIND_GUST`,
`CLOUD_PASSED`, `PLAYER_ENTERED`, `PLAYER_LEFT`, `LOCATION_CHANGED`,
`DOOR_OPENED/CLOSED`. Producen cambios sensoriales, no acciones. Los que
provocan las acciones de un tick (la caja se abre, cruza la puerta) se
entregan en el mismo tick.

`AmbientEventDirector`: tasas por ubicación, solo de día para mariposas y
pájaros, período refractario de 150 ticks, reduce la tasa si la mascota acaba
de asustarse (no amontonar estímulos, nunca provocar una acción concreta).
Usa **su propio rng con semilla** (nombre + especie + adopción) y admite guion:
`director.script([{ at: T, type: 'LEAF_FELL' }, { at: T + 20, type: 'SOUND_OUTSIDE' }])`.

## 10. Aprendizaje: dos moduladores

- **Recompensa** (como antes): Hebb modulado con trazas de elegibilidad.
  Nueva regla: `newObjectDetected / objectMoving / soundNovelty → curiosidad,
  juego` (explorar y que salga bien refuerza la curiosidad).
- **Amenaza** (nuevo, `channel: 'threat'`): con recompensa (Δw ∝ r) el miedo
  no podía aprenderse — un susto (r < 0) habría **debilitado** estímulo→miedo.
  Ahora un susto real con causa en el mundo (`scared`, `hid`) refuerza las
  vías estímulo→miedo que acababan de coincidir; la exposición sin
  consecuencias (se acercó, investigó, abrió, jugó y no pasó nada) las
  extingue. Mismas trazas, mismos topes, `rate 3` (el miedo se aprende rápido).

`threatFor(experiencia)` está en `RewardModel.ts`. Es la experiencia la que
modula; no hay ninguna regla "la caja da miedo".

## 11. Experiencias, memoria y descubrimientos

- `approached_object` (primera vez que se acerca a un tipo): experiencia +
  recuerdo "La primera vez que Milo se acercó a la caja misteriosa".
- INVESTIGATED / INTERACTED por primera vez → descubrimiento "✨ Milo descubrió…".
- `mystery_opened` lo registra GameSession al ver `OBJECT_OPENED` (una sola
  fuente de verdad, con o sin minijuego): desbloquea el contenido, recuerdo,
  aprendizaje.
- **Primera visita** a un lugar: se observa ~1 min (180 ticks) lo que HACE
  (explorar, quedarse en la entrada, asustarse, jugar, no separarse de ti, lo
  nuevo que vio) y se compone "🌿 Primera mañana en el jardín" con esos hechos
  + hito `FIRST_OUTING` / `FIRST_PARK`.
- Rutinas: los episodios fuera llevan área `jardin` / `parque`;
  `MORNING_EXPLORATION` puede interpretarse como "Suele salir al jardín por
  las mañanas" (el intérprete solo observa).

## 12. Crecimiento, offline, cámara, audio

- **Crecimiento**: `minStage` de la ubicación (BABY → habitación; CHILD →
  jardín; YOUNG → parque). La UI lo dice con frases: "Milo parece listo para
  conocer el jardín", "aún es pequeño para ir tan lejos". Al crecer, un aviso.
- **Offline**: usa el MISMO mundo. Solo cruza lo que online podría cruzar; al
  parque nunca va sola; si la app pasa a segundo plano durante un paseo por el
  parque, volvéis a casa (no se queda sola allí).
- **Cámara**: sigue a la mascota (más en exteriores), órbita limitada, pinch,
  enfoque de objeto (`cameraFocus`), fundido corto al cambiar de lugar.
- **Audio**: `WorldAudio` reproduce para el jugador los `SoundStimulus` y el
  ambiente de cada lugar (`ambient-room/garden/park.wav`, sintetizados en
  `scripts/generate-sounds.js`). Reproducción ≠ estímulo.

## 13. Rendimiento

Pool de hojas/plumas/mariposas, `dispose` del entorno al cambiar de lugar
(materiales/geometrías compartidos protegidos), solo proyectan sombra árboles,
valla, banco y props; la luz principal sigue a la mascota (mismo mapa de
sombras 1024 en sitios grandes); frustum culling por defecto de three.js.
Sin LOD: no hay evidencia de que haga falta (ver resultados).

## 14. Persistencia (save v5)

Se guarda: ubicación actual, objetos de cada ubicación con su estado (caja
cerrada/abierta y su contenido, plato vacío…), puertas, clima persistente,
memoria de exploración, orientación. **No** se guarda nada visual ni derivado
(percepciones, atención, sonidos en curso, luz calculada, microeventos).
Migración v4 → v5 documentada en `migrations.ts` y probada.

## 15. Decisiones de arquitectura

1. `World` sigue siendo la fachada (mucho código y 8 minijuegos/experimentos la usan); la lógica nueva vive en módulos de `core/world/`.
2. `world.objects` = objetos de la ubicación ACTUAL; los demás, guardados por ubicación. Así ActionSystem, juegos y experimentos no cambian.
3. `WorldObject.novelty` se mantiene con significado **transitorio** ("acaba de aparecer/moverse"); la novedad de memoria va aparte.
4. FOV 250°/140° tras medir: con 220°/100° la percepción caía tanto que el aprendizaje de "Trae la pelota" dejaba de verse.
5. Top-down attention con los pesos aprendidos (en vez de subir `attentionGain`): con FOV, lo que no se ve no puede competir, y la asociación aprendida es lo que el enunciado pide para elegir objetivo.
6. Amenaza como segundo modulador con su propio canal (no se mezcla con la recompensa del jugador).
7. `experiments.ts` en `core/world` reutilizado por tests, informe y herramientas.
8. Un test previo cambiado (con justificación en el propio test): `eB.share < e0.share` ya fallaba antes; se sustituye por "B juega con el peluche más que una mascota sin historia".

## 16. Qué NO se implementó (a propósito)

Online, multijugador, NPC humanos, ciudades, mundo abierto, generación
procedural, combate, economía, marketplace, chat, clima real por API.

## 17. Herramientas de desarrollo

Ajustes → Herramientas → **World Inspector**: crear/quitar/mover objetos, caja
misteriosa delante, rodar pelota, soltar hoja, golpe/crujido detrás, pájaro,
ruido fuerte, luz, hora, clima, ubicación, teletransporte (solo DEV), tasa de
microeventos; capas FOV / oído / percibidos / atención / navegación /
etiquetas novedad-familiaridad; **Sensor Debug** de un objeto (distancia,
visible, ángulo, movimiento, novedad, familiaridad, señal) y lo que llega de
verdad a la SNN (valor → corriente); medidor de FPS y de tick, +10/25/50 objetos.
