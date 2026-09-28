# Sistema de aprendizaje — "La mascota aprende"

## 1. Auditoría (estado previo)

| Pieza | Dónde | Reutilizable |
|---|---|---|
| `Neuron` (LIF) | `src/core/neural/Neuron.ts` | sí, sin cambios |
| `Synapse` | `src/core/neural/Synapse.ts` | se **extiende** con campos de plasticidad |
| `Network` | `src/core/neural/Network.ts` | sí; ya tenía el gancho `network.plasticity(net, spiked)` tras cada tick |
| `BrainConfig` v3 | `src/core/brain/BrainConfig.ts` | se amplía a **v4** (sensores y circuitos por objeto + configuración de plasticidad) |
| Pesos por nombre | `BrainWeights.ts` (export/import) | sí: los saves guardan pesos por nombre, así que añadir neuronas no rompe saves |
| Ticks | `TickEngine` → `GameSession.tick()` → `Simulation.step()` | sí |
| Acciones | `ActionSystem` (handlers de posibilidad física) | sí; PLAY/PICK_UP usan ahora el foco atencional |
| Estado de mascota | `Pet` (8 necesidades) | sí; se usa para **recompensas naturales** (reducción de necesidad) |
| Memoria | `PetMemory` + `ExperienceRecorder` | se amplía: `reward`, `actions`, historial por objeto, episodios con resultado |
| Descubrimientos / personalidad | `DiscoveryEvaluator`, `Personality` | se amplían con evidencia del cerebro |
| Persistencia | `SaveGame` v1 + migraciones | **v2** con pesos iniciales y estado de aprendizaje |
| Brain View / traza | `SpikeTrace`, `explainAction` | sí; base de `DecisionTrace` |
| Plasticidad | `learning/Plasticity.ts` (solo interfaz, sin regla) | se implementa la primera regla |

### Hallazgo que condiciona el diseño

La red **no distinguía objetos**: `toyAvailable` e `interestingObjectVisible` son genéricos y el mundo elegía el foco por novedad + interés. Con eso, ningún cambio de pesos podría producir “prefiere la pelota al peluche”. Hace falta:

1. **Estímulos identificables**: sensores `seesBall`, `seesTeddy`, `seesRope`, `seesDuck`.
2. **Atención dirigida por la red**: circuitos `ballAttention`, `teddyAttention`, … La actividad (spikes recientes) de cada neurona de atención sesga qué objeto se convierte en foco, y por tanto hacia dónde van LOOK_AT_OBJECT / INVESTIGATE / PLAY / PICK_UP_OBJECT. Es una salida motora de orientación, no una preferencia guardada.

## 2. Cuatro responsabilidades separadas

```
WORLD → SENSORS → SNN → SPIKES → ACTION → OUTCOME        (decisión inmediata: Simulation)
                                     ↓
                                EXPERIENCE               (memoria: ExperienceRecorder, PetMemory)
                                     ↓
                                REWARD SIGNAL            (RewardModel: experiencia → [-1, 1])
                                     ↓
                                PLASTICITY               (SynapticPlasticity: eligibility × reward)
                                     ↓
                                SYNAPTIC WEIGHTS → futuras decisiones
                                     ↓
                     INTERPRETATION (PersonalityInterpreter, DiscoveryEvaluator: solo UI)
```

- La **memoria** registra *qué pasó*; el **cerebro** decide *cómo reacciona*. La memoria nunca elige acciones.
- La **personalidad** se interpreta de pesos + historial; nunca se consulta para decidir.

## 3. Regla de plasticidad (primera versión)

Hebb modulado por recompensa con trazas de elegibilidad (eligibility traces):

```
cada tick, para cada sinapsis plástica pre→post:
    si pre disparó en t−1 y post dispara en t:   e ← min(1, e + eligibilityIncrement)
    e ← e × eligibilityDecay

al llegar una experiencia con reward r ≠ 0:
    Δw = learningRate × rate_sinapsis × e × r
    |Δw| ≤ maxDeltaPerSynapse
    Σ|Δw| ≤ maxWeightChangePerExperience   (si se supera, se escalan todos)
    w ← clamp(w + Δw, minWeight, maxWeight)
    e ← e × 0.5                              (la traza se "consume": no se cobra dos veces)
```

Solo las sinapsis que **participaron** en la cadena causal reciente (pre → post con un tick de retardo, como la propagación real) pueden cambiar. Las demás se quedan igual.

## 4. Qué sinapsis son plásticas

No todo el cerebro cambia: **103 de 752** sinapsis. Reglas en `BrainConfig.plasticity.rules`:

| Vía | Para qué | Límites | Ritmo | Canal |
|---|---|---|---|---|
| sensor de objeto → curiosidad / juego / alegría | preferencias por objeto | [−0.2, 0.9] | 1 | todas |
| sensor de objeto → atención de objeto | orientarse hacia lo que gusta | [−0.2, 0.9] | **0.25** | todas |
| atención → LOOK / INVESTIGATE / PLAY / PICK_UP | actuar sobre lo que atiende | [0, 0.8] | 1 | todas |
| `playerCalling` → social / seguimiento / alegría | aprender la llamada | [0, 1.0] | 1 | todas |
| necesidades → circuitos de necesidad | recompensas naturales | inicial ± 0.2 | 0.5 | **natural** |
| circuitos de necesidad y curiosidad → acciones | recompensas naturales | inicial ± 0.2 | 0.5 | **natural** |

Fijas a propósito: el miedo, **social/seguimiento → APPROACH** (si fuese plástica, la mascota aprendería "acercarse siempre" en vez de la asociación con la llamada) y el resto del genoma.

Configuración final: `learningRate 0.015`, `eligibilityDecay 0.93`, `eligibilityIncrement 0.5`, `maxDeltaPerSynapse 0.008`, `maxWeightChangePerExperience 0.12`, `eligibilityConsumption 0.5`, `incomingBudgetFactor 1.6`.

## 5. Homeostasis

Riesgos analizados (y observados en las mediciones, ver `learning-results.md`):

| Riesgo | Protección |
|---|---|
| Saturación de pesos | límites por sinapsis, tope por sinapsis y por experiencia |
| Deriva positiva (comer/descansar casi siempre “sale bien”) | **error de predicción** en recompensas naturales: se aprende de `r − r̄` por tipo |
| Crédito inespecífico (cada ❤️ reforzaba vías tónicas como aburrimiento→juego) | **canales de modulación**: las vías de necesidad solo aprenden de recompensas naturales |
| Una neurona que satura | **presupuesto sináptico** por neurona: Σ pesos positivos plásticos ≤ max(inicial × 1.6, inicial + 0.3) |
| Olvidar lo innato por competencia | el presupuesto solo recorta lo **ganado** por encima del peso inicial |
| Un único objeto domina el foco | la atención aprende 4 veces más despacio (el foco es winner-take-all y amplifica diferencias pequeñas) |

No se usa azar ni se reinician pesos. La prueba de estabilidad (100 000 ticks) lo verifica.

## 6. Recompensas (`RewardModel`)

| Fuente | Reward |
|---|---|
| ❤️ Recompensar (jugador, contextual) | +0.8 |
| Caricia | +0.3 |
| Te trajo la pelota | +0.8 · persiguió +0.3 · la recogió +0.2 |
| Vino al llamarlo | +0.6 |
| Abrió la caja | +0.6 · investigó +0.05 |
| **Natural** (fin del episodio EAT/DRINK/REST+SLEEP/PLAY) | `relief × 3 × (0.5 + necesidad inicial)`, aprendida como `r − r̄` |
| Fue a comer/beber y no había | −0.1 |
| Susto, elección en evaluación | 0 (se recuerda, no se aprende) |

## 7. Modo evaluación

`GameSession.setEvaluation(true)` congela los pesos (las experiencias se siguen registrando). “¿Cuál prefieres?” lo activa mientras observa, para no contaminar la medida con lo que ocurre durante la propia prueba.

## 8. Persistencia (save v2)

- `brain.weights`: pesos actuales (aprendidos), por nombre.
- `brain.initialWeights`: pesos con los que nació (para Δ, límites relativos y reset).
- `learning`: activado, learningRate, estadísticas acumuladas y los últimos eventos de aprendizaje.
- La elegibilidad y los spikes **no** se guardan (son transitorios).

Migración v1 → v2: los pesos existentes pasan a ser a la vez los iniciales y los actuales.

## 9. Explicabilidad

`DecisionTrace` guarda, en el inicio de cada acción relevante, la cadena causal real (sensores → circuitos → acción, con pesos iniciales y actuales). “¿Por qué hizo eso?” muestra la última. La frase *“ha tenido buenas experiencias con este juguete”* solo aparece si la vía de ese objeto aumentó realmente **y** su historial es positivo.

Resultados medidos de las simulaciones: `docs/learning-results.md`.
