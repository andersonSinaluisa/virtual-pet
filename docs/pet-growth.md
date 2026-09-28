# Crecimiento y etapas de vida — auditoría y estrategia

> Misma mascota + mismo cerebro + más experiencias + cambios de desarrollo = mascota adulta única.

## 1. Auditoría (qué existe y qué toca el crecimiento)

| Pieza | Dónde | Relación con el crecimiento |
|---|---|---|
| Pet / PetState | `core/simulation/Pet.ts` (`PetBodyState`) | necesidades y cuerpo; la deriva viene de `SimConfig.pet.drift` → las etapas la **modulan** vía configuración |
| Brain / Network / BrainConfig | `core/brain/*`, `core/neural/*` | **no se tocan**: ni se recrean ni se reinician los pesos al crecer |
| Plasticidad | `core/learning/Plasticity.ts` | `applyReward` recibe un **multiplicador de etapa** (`stageMultiplier`) |
| Memoria / Experience / Moment | `core/memory/*` | se añade `lifeStage` (etapa en la que ocurrió) a experiencias, momentos y episodios nuevos |
| PersonalityInterpreter | `core/discovery/PersonalityInterpreter.ts` | interpreta pesos y conducta: como no se tocan, la personalidad se conserva |
| HabitDetector / RoutineInterpreter | `core/routines/*` | los episodios sobreviven al crecer; el detector sigue con su recencia |
| OfflineSimulation | `core/simulation/OfflineSimulation.ts` | el desarrollo offline se acumula con multiplicador y tope, y nunca aplica una transición: la deja **pendiente** |
| WorldClock | `core/time/WorldClock.ts` | la edad cronológica sale del reloj del mundo |
| ActionSystem | `core/simulation/ActionSystem.ts` | punto de corte para **capacidades** (¿puede físicamente?) |
| Pet3D / PetModel / PetAnimator / PetAppearance | `render3d/*` | el animador reinicia cada pivote a su **pose de reposo** en cada frame, así que el crecimiento edita esas poses (piernas, orejas, cabeza, cuello) sin reconstruir el modelo |
| Persistencia | `core/persistence/*` | `growth: { xp }` era un nivel tipo XP mostrado como «Nivel N» → pasa a ser el estado de crecimiento (save v4) |

«Nivel N» (xp) se retira de la UI: contradice el principio de «no XP visible». El campo `xp` se conserva en el save por compatibilidad, pero ya no se muestra.

## 2. Modelo

```
LifeStage (lógica, sin texto):  BABY → CHILD → YOUNG → ADULT      (SENIOR reservado, no implementado)
Etiquetas por especie (solo UI): perro Bebé/Cachorro/Joven/Adulto · gato Bebé/Gatito/…
```

`GrowthState` (en el save):

- `bornAt`: la edad **cronológica** sale del reloj del mundo.
- `stage` y `stageStartedAt`.
- `development`: puntos y progreso ∈ [0, 1] **dentro de la etapa**, más contadores de novedad para el rendimiento decreciente.
- `modifiers`: variación individual pequeña y reproducible (`growthRate`, `size`, `development` ∈ 1 ± 0.08, derivados del id).
- `milestones`: hitos reales.
- `pending`: transición pendiente.

### Transición = edad mínima Y desarrollo

```
elegible = (ahora − stageStartedAt ≥ minDuration[etapa]) ∧ (progress ≥ 1)
```

Cerrar la app dos semanas no basta: el desarrollo offline tiene un multiplicador bajo y un **tope por ausencia**. Tampoco hay saltos de etapa: el progreso se reinicia en cada etapa y una transición solo avanza un paso. Ambos valores viven en `GrowthConfig`.

### DevelopmentSystem (sin clics ni XP)

Suma puntos por **experiencias significativas** (jugar, explorar, investigar, descubrir, aprender, crear recuerdos, desarrollar hábitos, descansar tras cansarse, interactuar), con **rendimiento decreciente** por clave `tipo:sujeto`:

`gain = base / (1 + repeticiones_recientes / k)`, con repeticiones que decaen cada día de mundo.

Hay un **tope diario** de puntos. Repetir mil veces lo mismo apenas aporta; vivir cosas distintas sí.

### El cerebro no se reinicia

La transición no crea cerebro, no restaura pesos iniciales y no borra trazas. Solo cambia:

1. el multiplicador de plasticidad: BABY 1.5 · CHILD 1.25 · YOUNG 1.0 · ADULT 0.7 (nunca 0);
2. los moduladores del cuerpo: deriva de necesidades y velocidad de movimiento, desde `LifeStageModifiers`;
3. las capacidades.

YOUNG = 1.0 es el comportamiento medido en fases anteriores. Los experimentos de aprendizaje y rutinas usan esa etapa para seguir siendo comparables.

### CapabilitySystem: ¿puede físicamente?, no ¿quiere?

```
SNN → spike de RUN → Capabilities.gate(RUN)
        permitido       → se ejecuta RUN
        no permitido    → se ejecuta su forma posible (RUN → WALK, «trota torpe») o nada; se contabiliza
```

**Decisión sobre la «frustración neuronal»:** se **mantiene la salida y se bloquea la ejecución**, con sustitución física cuando existe.

- No hay consecuencias de una acción que no ocurrió, así que no hay recompensa y la plasticidad no aprende nada falso sobre ella. Las vías acción → consecuencia se forman cuando la capacidad aparece.
- La salida sigue compitiendo por inhibición lateral. Es aceptable: el deseo existe aunque el cuerpo no pueda.
- No se modulan pesos por etapa, porque eso sería reescribir el cerebro.
- El DevTools muestra los bloqueos por acción.

Capacidades:

- **BABY:** sin RUN (→ WALK), sin DANCE, sin FOLLOW_PLAYER (→ APPROACH); movimiento a 0.7×.
- **CHILD:** todo salvo DANCE; 0.9×.
- **YOUNG / ADULT:** todo.

### Transición transaccional

`LifeStageTransition`:

1. evaluar;
2. si no es un momento seguro (dormido, jugando, minijuego activo, offline), dejarla **pendiente**;
3. tomar una instantánea (hash de pesos, recuentos de memoria, hábitos);
4. aplicar la etapa y los moduladores, las capacidades y el objetivo visual;
5. añadir hito y recuerdo;
6. emitir `growth`, y el controlador guarda.

Si algo falla, se restaura el estado anterior de crecimiento.

### Visual continuo

`GrowthVisualController` interpola entre fotogramas clave de proporción: escala, cabeza, piernas, orejas, ojos y cuello, con un estilo de animación por etapa.

El valor continuo es `v = índice + 0.6 · min(progreso, fracción de tiempo)`. Dentro de una etapa el cambio es sutil («¿está un poquito más grande?») y al cambiar de etapa se interpola en segundos. El adulto sigue siendo chibi: la cabeza pasa de ×1.2 (bebé) a ×0.92 (adulto) respecto al cuerpo, sin volverse realista.

### Memoria, hábitos, personalidad

No se borra nada. Las nuevas experiencias, momentos y episodios llevan `lifeStage`. La comparación «Antes / Ahora» se deriva del historial real por sujeto (valencia media en la etapa anterior frente a la actual, con evidencia mínima). Los hitos solo se crean a partir de eventos reales.

### Save v4 y mascotas existentes

Una mascota existente **no** pasa a adulta por antigüedad. Empieza como **BEBÉ**, o como **CACHORRO** si ya tiene suficientes experiencias registradas (nunca más), y `stageStartedAt` = momento de la migración. Así toda mascota vive al menos una transición con recuerdos reales. `bornAt` = `adoptedAt`.

Resultados medidos: `docs/growth-results.md`.
