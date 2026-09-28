# Rutinas y hábitos emergentes — diseño

## 1. Auditoría (estado previo)

| Pieza | Estado | Qué se reutiliza / cambia |
|---|---|---|
| Sensores (25) | internos + entorno; `darkness` binario (luz on/off); ningún tiempo, lugar ni "volviste" | se añaden sensores de **contexto** (§3) y `darkness` pasa a continuo |
| Circuitos (16) / salidas (22) | `restCircuit → REST, SLEEP` ya existe | sin circuitos ni acciones nuevas: **no existe `NIGHT_SLEEP`**; se reutiliza `SLEEP` |
| Plasticidad | Hebb × recompensa, trazas, canales `natural`/`all`, error de predicción, presupuesto | se añaden reglas para las vías de contexto |
| Recompensa natural | al terminar el episodio: ∝ reducción de la necesidad, aprendida como `r − r̄` | se corrige: un episodio **sin** resultado útil (dormir descansado) también cuenta (→ señal negativa) |
| `Experience` | tipo, sujeto, valencia, reward, acciones | se añade un **contexto compacto** |
| `PetMemory` | experiencias (máx. 400), recuerdos, preferencias | se añade un **registro de episodios** compacto (evidencia de hábitos, meses) |
| Tiempo | `GameSession` usa `now()`; el mundo no conoce la hora | `WorldClock` inyectable |
| Mundo | `lightOn` = luz de la habitación | pasa a ser la **lámpara**; la luz real es `lightLevel = max(luz del día, lámpara)` |
| Offline | ≤ 900 ticks con deriva comprimida | cada tick offline avanza también el reloj (la noche pasa de verdad) |
| Renderer | oscurece según `lightOn` | lee `daylight` y `lightLevel` e interpola |
| DecisionTrace / Why | cadena real sensores → circuitos → acción | se añaden contexto y "contexto familiar" solo si la vía aprendida lo respalda |

### Hallazgo: tick neural ≠ tiempo del mundo

En la app, un tick dura 1/3 s de tiempo real y las necesidades están calibradas **por tick**. Si el reloj del mundo estuviera atado al tick, un día duraría 259 200 ticks. Se separan:

```
tiempo real ─► WorldClock (RealWorldClock / SimulationClock / TestClock) ─► hora del mundo
TickEngine  ─► tick neural (3/s en la app)                               ─► SNN
render      ─► 60 fps (interpola la luz)
UI          ─► snapshots ≤ 4 Hz
```

En simulación y tests, `SimulationClock` avanza **1 minuto de mundo por tick**: un día son 1 440 ticks y 30 días son 43 200. Con esa escala, la fisiología existente queda razonable (el hambre se llena en ~8 h y el cansancio en ~14 h de vigilia).

## 2. Principio

El tiempo **no ejecuta acciones**. Es información sensorial:

```
reloj ─► codificación cíclica ─┐
luz (día + lámpara) ───────────┼─► SENSORES ─► SNN ─► SPIKES ─► ACCIONES
lugar, volviste, actividad ────┘         ▲
                                         │ plasticidad (resultado de la experiencia)
```

## 3. Codificación temporal y sensores de contexto

- `angle = 2π · minuteOfDay / 1440`, con `timeSin = sin(angle)` y `timeCos = cos(angle)`: 23:59 y 00:01 quedan juntos.
- Las neuronas LIF solo integran corriente positiva (una tasa de disparo no puede ser negativa), así que sin/cos se proyectan sobre **6 neuronas de reloj con sintonía de fase** (código de población en anillo):

  `time_k = max(0, cos(angle − φ_k))³`, con φ_k = 00, 04, 08, 12, 16, 20 h.

  Es circular, suave, y en cada momento se activan 1–2 neuronas.
- `lightLevel` (0..1) y `darkness = 1 − lightLevel`: se separa la hora de la luz (23:00 con la lámpara encendida ≠ 23:00 a oscuras).
- Lugar: `zoneBed`, `zoneFood`, `zonePlay`, `zoneWindow` (proximidad a zonas del mundo, no reglas).
- `playerReturned`: evento que decae tras volver el jugador.
- `recentActivity`: media móvil de la actividad (no se envían las últimas N acciones).

Las necesidades (cansancio, hambre, energía, aburrimiento) ya eran sensores.

## 4. Aprendizaje del contexto

Las vías contexto → circuitos (descanso, actividad, juego, curiosidad, alimentación) son plásticas en el canal **natural**: se refuerzan con el resultado real (dormir **cuando estaba cansado** reduce mucho el cansancio → señal positiva). Dormir descansado no resuelve nada: con el error de predicción, esa señal es **negativa** y debilita la asociación. Esto evita el ciclo patológico SLEEP → recompensa → SLEEP.

`playerReturned` → social / alegría / seguimiento es plástica en el canal `all` (❤️ del jugador al volver).

## 5. Hábitos y rutinas = interpretación

```
comportamiento real (episodios con contexto) ─► HabitDetector ─► Habit (confianza, evidencia, días, recencia)
                                              ─► RoutineInterpreter ─► textos ("Antes de dormir…")
```

Nada de esto se consulta para decidir. Los umbrales son configurables (`HABIT_RULES`), la evidencia se pondera por **recencia** (vida media en días) para permitir la deriva, y los textos viven en el intérprete, no en el detector.

Resultados medidos: `docs/routine-results.md`.
