# Plan de migración móvil — Milo (tamagotchi-snn → Expo)

Fuentes:

- **Proyecto base** (`tamagotchi-snn/`): fuente de verdad de la lógica (SNN, sensores, 22 acciones, mundo, 3D).
- **Diseños Stitch** (`stitch_milo_living_neural_companion/`): fuente de verdad de UX/UI.
- **App destino**: este repositorio (`virtual-pet/`, Expo SDK 57, RN 0.86, Expo Router, TypeScript strict, React Compiler activado).

---

## 1. Arquitectura actual (prototipo web)

Scripts clásicos (`<script>`, sin módulos) cargados por `index.html`, con clases globales.

| Capa | Archivos | Depende del navegador |
|---|---|---|
| Config física | `js/config.js` (`CONFIG`) | No |
| Red neuronal | `js/neural/Neuron.js`, `Synapse.js`, `Network.js` | No |
| Genoma | `js/brain/BrainConfig.js` (sensores, circuitos, matrices, presets, `BrainWeights`), `Actions.js`, `BrainBuilder.js` (`Brain`), `BrainAudit.js` | No |
| Simulación | `js/simulation/Pet.js`, `World.js`, `Sensors.js`, `ActionTranslator.js`, `ActionSystem.js`, `MovementSystem.js`, `ConflictMonitor.js`, `Simulation.js` | No (usa `Math.random`) |
| 3D | `js/pet3d/*` (Three.js r169 empaquetado como `window.THREE`) | **Sí**: `document.createElement('canvas')` para texturas de ruido, sprites de texto (Zzz, !, ?, ♥, ♪, ✋, “TÚ”), `window.matchMedia`, `devicePixelRatio`, `ResizeObserver`, pointer events, `requestAnimationFrame` |
| UI | `js/ui/*` (BrainVisualizer canvas 2D, DebugPanel, Inspector, Timeline, StatusPanel, SceneRenderer 2D, SpritePet) | **Sí**: DOM completo |
| Orquestación | `js/app.js`: reloj con acumulador (3 ticks/s × velocidad), render a 60 fps, controles, `localStorage` solo para la especie | **Sí** |
| Pruebas | `tools/harness.js`: carga los scripts en Node (`vm`) y corre escenarios + checks | No |

Respuestas a las preguntas de inspección:

- **¿Dónde vive la SNN?** `js/neural/*` (motor genérico) + `js/brain/*` (genoma con nombres). La `Network` sólo ve IDs y números.
- **Regla temporal**: `Network.tick()` lee `inputs`, escribe spikes en `nextInputs`, y sólo al final hace `inputs = nextInputs`. Un spike tarda un tick por capa (sensor → circuito → salida = 2 ticks).
- **22 acciones**: una neurona de salida por acción (`ACTION_LIST`). `ActionTranslator` mapea spikes → acciones; `ActionSystem` las mantiene activas `hold` ticks (un spike nuevo renueva el hold: la frecuencia sostiene la conducta). Los handlers comprueban *posibilidad física*, nunca *deseo*.
- **Sensores**: `World.perceive()` → valores 0..1 → `Sensors.feed()` inyecta `gain × valor` como corriente externa en las neuronas sensoriales.
- **Game loop**: `requestAnimationFrame` a 60 fps; ticks neuronales con acumulador a `3 × speed` ticks/s (máx. 8 por frame).
- **Persistencia**: no existe (sólo la especie en `localStorage`).
- **Memoria**: no existe (sólo `ConflictMonitor.stats` y la línea de tiempo en UI).
- **Plasticidad**: no existe; hay un gancho `network.plasticity = null` y todas las sinapsis inter‑capa existen con peso 0 “para que una futura regla pueda crearlas”.
- **Personalidad**: presets de pesos (`equilibrado`, `curioso`, `miedoso`, `apegado`). No hay etiqueta guardada: la personalidad *es* la matriz.

## 2. Diseños Stitch disponibles

| Carpeta Stitch | Pantalla | Ruta Expo |
|---|---|---|
| `primer_encuentro` | Onboarding “Milo todavía no te conoce” | `src/app/onboarding/index.tsx` |
| — (no existe en Stitch) | Elegir mascota | `src/app/onboarding/choose.tsx` (construida con el design system) |
| — (no existe en Stitch) | Nombrar mascota | `src/app/onboarding/name.tsx` (input pill del DESIGN.md) |
| `home_habitaci_n_de_milo` | Home / Mundo | `src/app/(tabs)/index.tsx` |
| `nuestros_recuerdos` | Nuestros recuerdos (timeline, filtros, favoritos, captura) | `src/app/(tabs)/memories.tsx` + `src/app/memory/[id].tsx` |
| — (no existe en Stitch) | Mochila | `src/app/(tabs)/backpack.tsx` (ObjectSlots del DESIGN.md) |
| `descubriendo_a_milo` | Descubriendo a Milo (personalidad) | `src/app/(tabs)/milo.tsx` |
| `jugar_juntos_hub_de_actividades` | Selector de minijuegos | `src/app/games/index.tsx` |
| `trae_la_pelota_jugando_con_milo` | Trae la pelota | `src/app/games/[gameId].tsx` (`fetch`) |
| `caja_misteriosa_curiosidad_adorable` | Caja misteriosa | `src/app/games/[gameId].tsx` (`mystery-box`) |
| `cu_l_prefieres_preferencias_de_milo` | ¿Cuál prefieres? | `src/app/games/[gameId].tsx` (`choice`) |
| — (Ven aquí aparece como tarjeta del hub) | Ven aquí | `src/app/games/[gameId].tsx` (`come-here`), mismo layout de sesión que “Trae la pelota” |
| `brain_view_mente_de_milo` | Brain View (Flujo cognitivo / Red SNN) | `src/app/brain.tsx` |
| — | Mientras no estabas | `src/app/away.tsx` (modal, estilo “Último descubrimiento”) |
| `milo_friends/DESIGN.md` | Design system | `src/theme/*` |
| `milo_brand_emblem`, `adorable_3d_…puppy` | Assets | `assets/images/brand/*`, `assets/images/pets/*` |

Navegación: la mayoría de pantallas Stitch usan la barra **Mundo · Recuerdos · Mochila · Milo** (el hub muestra otra variante “Juegos/Cuidados/Amigos”; se adopta la mayoritaria, coherente con el brief). Juegos, Brain View y el detalle de recuerdo son pantallas de stack encima de las tabs; “Mientras no estabas” y el inventario rápido son modal/bottom sheet.

Assets Stitch: las fotos de `code.html` apuntan a `lh3.googleusercontent.com` (remotas). **No se usan** (la app no debe depender de internet). En su lugar: la mascota 3D real, capturas del GLView para los recuerdos, y los dos renders locales de Stitch (emblema y cachorro chibi) como avatar/fallback.

Iconos: Stitch usa Material Symbols. `expo-symbols` (SDK 57) usa Material Symbols en Android/web y SF Symbols en iOS → un componente `Icon` con un mapa semántico `{ ios, android }`.

Tipografías: Quicksand (títulos/labels) + Nunito Sans (cuerpo) vía `@expo-google-fonts/*` (empaquetadas, funcionan offline).

## 3. Arquitectura objetivo

```
src/
  core/            TypeScript puro. PROHIBIDO importar react, react-native, expo, three, DOM.
    neural/        Neuron, Synapse, Network (idénticos en semántica al prototipo)
    brain/         Actions, BrainConfig (genoma), BrainWeights, Brain (builder), BrainAudit, presets
    simulation/    PetBody, World, Sensors, ActionTranslator, ActionSystem, MovementSystem,
                   ConflictMonitor, Simulation, TickEngine, OfflineSimulation, SpikeTrace
    memory/        Experience, ExperienceRecorder, PetMemory (LTM, preferencias, estadísticas)
    discovery/     DiscoveryEvaluator, Personality (derivada de pesos + historia)
    learning/      Plasticity (interfaz; sin implementación, ver §6)
    games/         MiniGame (interfaz), catálogo de 12, 4 implementados
    session/       GameSession: une simulación, memoria, juegos, eventos y guardado
    persistence/   SaveGame (saveVersion), migraciones, serialización, repositorios (interfaces)
    explain/       Narrator (texto del pensamiento), explicación causal real de spikes
    random.ts      RNG inyectable (tests deterministas; en producción Math.random)
  render3d/        Three.js sin React: PetModel, PetMaterials, PetAnimator, PetExpressions,
                   PetController, PetFX, Props, Studio, PetScene (antes World3D)
  platform/        Adaptadores Expo: almacenamiento (expo-sqlite/kv-store), audio (expo-audio),
                   hápticos (expo-haptics), archivos (expo-file-system), ciclo de vida (AppState)
  state/           Stores mínimos con useSyncExternalStore (sin librerías nuevas)
  theme/           Tokens Stitch: colors, spacing, typography, radius, shadows
  components/      UI RN (design system) + scene/PetCanvas (GLView + gestos)
  app/             Rutas Expo Router (sólo pantallas; sin lógica de dominio)
```

Flujo por tick (idéntico al prototipo):

```
TickEngine (3 ticks/s × velocidad) ──► Simulation.step()
   World.update → perceive → Sensors.feed → Network.tick (inputs/nextInputs)
   → ActionTranslator → ActionSystem (Movement / expresión / mundo) → ConflictMonitor
   ──► GameSession: SpikeTrace, ExperienceRecorder, MiniGame.observe, Discovery, autosave
   ──► stores (snapshot UI throttled, ≤ 4 Hz)

Render loop (requestAnimationFrame de GLView, 60 fps)
   PetScene.update(dt) lee el estado del World (sin React) → PetController → PetAnimator → gl.endFrameEXP()
```

- El cerebro no provoca renders de React: la escena 3D lee el `World` directamente cada frame; la UI recibe snapshots limitados.
- Nunca se guardan objetos `THREE.*` en estado React.

## 4. Código reutilizable, adaptado y reemplazado

**Reutilizado casi literal (portado a TS, misma semántica y mismos números):**
`Neuron`, `Synapse`, `Network`, `BrainConfig` (sensores, circuitos, matrices, conflictos, presets), `Actions`, `Brain`, `BrainAudit`, `Pet`, `World`, `Sensors`, `ActionTranslator`, `ActionSystem`, `MovementSystem`, `ConflictMonitor`, `Simulation`, `CONFIG`.
`PetModel`, `PetAnimator`, `PetExpressions`, `PetController`, `PetAppearance`, `Props`, `Studio` (lógica de pose, rig, expresiones y mapeo acción→animación intactos).

**Adaptado:**

| Qué | Por qué | Cómo |
|---|---|---|
| `Math.random` en World/Action/Movement | tests deterministas | `rng` inyectable en la config (por defecto `Math.random`) |
| `BrainWeights` (singleton global con `_base`) | varias mascotas / persistencia | funciones puras sobre un `BrainConfig` clonado por mascota |
| Texturas de ruido (canvas 2D) | no hay `document` en RN | `THREE.DataTexture` generada con los mismos algoritmos |
| Sprites de texto (Zzz, !, ?, ♥, ♪) | no hay canvas 2D | pequeñas mallas 3D del mismo estilo juguete |
| Pelota (textura canvas a rayas) | idem | textura `DataTexture` a rayas |
| `World3D` | DOM, ResizeObserver, pointer events, chips HTML | `PetScene` (sin DOM) + `PetCanvas` (GLView + react-native-gesture-handler) |
| `WebGLRenderer` | no hay canvas | `new WebGLRenderer({ canvas: shim, context: gl })` + `gl.endFrameEXP()` |
| `PMREMGenerator + RoomEnvironment` | puede fallar en algunos GPUs móviles | intento con `try/catch`; si falla, sólo luces |
| `PetQuality.fur` | coste en móvil | pelaje de 5 capas por defecto, configurable en ajustes |
| Mouse (hover/click/drag) | móvil | tap = interacción/objeto; pan sobre mascota = caricia; pan sobre pelota = lanzamiento con velocidad; pinch = zoom de cámara |
| Nuevo sensor `playerCalling` | “Ven aquí”/“Llamar a Milo” necesitan un estímulo PLAYER_CALL | extensión documentada del genoma (BrainConfig v3), ver §6 |
| Premio (`treat`) | “Mostrar galletita” | objeto de tipo comida colocado junto al jugador; `EAT` busca la fuente de comida más cercana |
| Física de objetos lanzados | “Trae la pelota” | velocidad + fricción en `World.update` (física, no decisión) |

**Reemplazado:**
`js/ui/*` (DOM) → pantallas RN según Stitch. `app.js` → `GameSession` + `TickEngine` + hooks. `SceneRenderer`/`SpritePet` (fallback 2D) → fallback de imagen dentro de un Error Boundary. `PetSelector` (4 canvas) → pantalla de onboarding con un solo GLView.

## 5. Decisiones

1. **Rutas en `src/app/`** (convención de este repo y de AGENTS.md) en lugar de `app/` en la raíz.
2. **Una sola simulación** por mascota; los minijuegos operan sobre el mismo mundo (añaden y retiran sus objetos). El cerebro no se reinicia al entrar a un juego.
3. **Tick base 3 ticks/s** (el valor calibrado del prototipo: `drift`, `hold` y velocidades están en unidades por tick). La velocidad es configurable (0.25×–4×) en modo desarrollo.
4. **Estado global** con stores pequeños (`useSyncExternalStore`): sesión, snapshot de mascota, ajustes, UI. Sin Redux/Zustand.
5. **Persistencia** en `expo-sqlite/kv-store` detrás de la interfaz `KeyValueStore`. Un único documento `SaveGame` (escritura atómica) + copia de respaldo rotada. Los repositorios del dominio (`PetRepository`, `BrainRepository`, `MemoryRepository`, `GameRepository`) son interfaces sobre ese documento.
6. **Offline**: al volver, `OfflineSimulation` ejecuta la SNN real durante un número acotado de ticks (máx. 900) con el tiempo del mundo comprimido (≤ 20× de deriva por tick) y el jugador ausente. Genera el informe “Mientras no estabas” con lo que la red realmente hizo.
7. **Recuerdos con captura**: si hay un GLView activo, el recuerdo guarda una captura (`GLView.takeSnapshotAsync`) copiada a `Paths.document`; si no, una ilustración de respaldo por tipo.
8. **Audio**: `AudioManager` con categorías (music, ambient, pet, effects, ui), volumen, mute y pausa por `AppState`. Se generan efectos cortos sintetizados (`scripts/generate-sounds.js`) para no depender de assets externos.

## 6. Cambios en el genoma (documentados)

- **BrainConfig v3** añade el sensor `playerCalling` (grupo entorno, `event: true`, gain 0.6) con pesos
  `socialCircuit +0.45, followCircuit +0.35, joyCircuit +0.15, curiosityCircuit +0.10, fearCircuit −0.10`.
  Ningún peso existente cambia. Los IDs se siguen calculando por capa (el sensor nuevo desplaza los IDs de circuitos y salidas en 1); los pesos se guardan **por nombre**, por lo que la migración de saves no depende de IDs.
- **Plasticidad**: el prototipo no la implementa. Se define `PlasticityRule` (`learning/Plasticity.ts`) y se conecta al gancho existente `network.plasticity`. No se activa ninguna regla.

## 7. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| expo-gl no implementa todo WebGL2 (p. ej. `getFramebufferAttachmentParameter`) | materiales estándar; PMREM en `try/catch`; sin `transmission` en móvil |
| Rendimiento del pelaje por capas | 5 capas por defecto, ajuste “pelaje” en settings, `setPixelRatio` ≤ 2 |
| Logs `EXGL: gl.pixelStorei() doesn't support this parameter` | inofensivos; documentados |
| Varios GLView montados (Home + juego) | el loop de render se pausa cuando la pantalla no tiene foco o la app está en background |
| React Compiler + objetos mutables | la simulación vive fuera de React; los componentes sólo leen snapshots inmutables |
| Save corrupto | parse → validación → migración; si falla, respaldo; si falla, se preserva la copia corrupta y se empieza de nuevo avisando |
| Tiempo largo en background | simulación offline acotada, en bloques asíncronos para no congelar la UI |
| Material Symbols vs SF Symbols | mapa semántico por plataforma en `Icon` |

## 8. Estrategia (fases)

1. Foundation: dependencias, tokens Stitch, core portado a TS, tests (jest-expo) y validación SNN.
2. Pet: Three.js en GLView, rig/animaciones portados, gestos táctiles, SNN conectada.
3. Home Stitch, objetos, inventario, estado.
4. Persistencia, AppState, offline, memorias, preferencias.
5. Minijuegos MVP: Trae la pelota, Caja misteriosa, ¿Cuál prefieres?, Ven aquí.
6. Descubrimientos, personalidad, recuerdos, “Mientras no estabas”.
7. Brain View simple y técnico (datos reales de la red).
8. Resto de juegos: catálogo y arquitectura listos; se implementan progresivamente.

El proyecto web se conserva **fuera** de este repo como referencia; no hay una segunda implementación de la lógica: `src/core` es la única.

## 9. Estado de implementación

Ver `docs/implementation-status.md` (se actualiza al cerrar cada fase).
