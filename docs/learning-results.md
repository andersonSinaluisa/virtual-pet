# Resultados del aprendizaje — "La mascota aprende"

Todos los números salen de simulaciones reales de la SNN completa (sin atajos), reproducibles con:

```bash
npm run report:learning     # genera las cifras de este documento
npm run test:learning       # tests del aprendizaje (unidad, vertical slices, estabilidad)
```

Diseño: `docs/learning-system.md`.

## 1. Configuración utilizada

| Parámetro | Valor |
|---|---|
| Regla | Hebb modulado por recompensa con trazas de elegibilidad |
| `learningRate` | 0.015 (× ritmo por vía: 1, 0.5 necesidades, 0.25 atención) |
| `eligibilityDecay` / `eligibilityIncrement` | 0.93 por tick / +0.5 por coincidencia pre(t−1) → post(t) |
| `maxDeltaPerSynapse` | 0.008 por experiencia |
| `maxWeightChangePerExperience` | 0.12 (Σ\|Δw\|) |
| Consumo de traza tras recompensa | ×0.5 |
| Presupuesto sináptico | max(inicial × 1.6, inicial + 0.3), solo sobre lo ganado |
| Sinapsis plásticas | 103 de 752 |
| Límites de peso | ver tabla de `learning-system.md` §4 (p. ej. objeto→juego [−0.2, 0.9]) |
| Genoma | BrainConfig v4 (sensores y atención por objeto) |

**Protocolo** (`src/core/learning/experiments.ts`). El "jugador" coloca **un** objeto cerca de la mascota durante 60 ticks y pulsa ❤️ solo cuando ella ya está implicada con ese objeto (INVESTIGATE / PLAY / PICK_UP / LOOK con el objeto en foco o en la boca). Cada episodio = 60 ticks (20 s).

La **evaluación** se hace sobre un **clon con el aprendizaje congelado**. Se colocan pelota y peluche a la misma distancia, alternando izquierda/derecha, en 40 pruebas de 45 ticks, con las necesidades reiniciadas a un valor fijo. Se mide la implicación con cada objeto: foco + 2·investigar + 2·jugar + 5·recoger. **Cuota ⚽** = implicación con la pelota / total.

## 2. Pelota vs. peluche (mismo cerebro inicial)

Pet A juega con ⚽, Pet B con 🧸, ambos nacidos con **pesos idénticos** (misma semilla). Antes de evaluar se hace un guardar → destruir → cargar.

### Curva de aprendizaje (semilla 11)

| Episodios | Eventos de aprendizaje (A) | Σ\|Δw\| (A) | Cuota ⚽ A | Cuota ⚽ B |
|---|---|---|---|---|
| 0 | 0 | 0.00 | 0.328 | 0.328 |
| 10 | 223 | 0.37 | 0.338 | 0.330 |
| 25 | 530 | 1.13 | **0.511** | **0.216** |
| 50 | 1 235 | 3.06 | 0.516 | 0.234 |
| 100 | 3 153 | 7.36 | 0.483 | 0.220 |
| 150 | 5 205 | 10.90 | 0.463 | 0.252 |

- Sin entrenar, la mascota ya prefiere algo el peluche (cuota ⚽ 0.33): su interés físico es mayor (0.4 frente a 0.3) y es más fácil de recoger. Es el sesgo del mundo, no del cerebro.
- A los 10 episodios (~3 min de juego) no hay cambio observable. A los 25 aparece la divergencia y se estabiliza. **Es gradual.**

### Comportamiento tras 150 episodios

| | ⚽ foco | ⚽ investigar | ⚽ jugar | ⚽ recoger | llegó 1.º a ⚽ | 🧸 foco | 🧸 investigar | 🧸 jugar | 🧸 recoger | llegó 1.º a 🧸 |
|---|---|---|---|---|---|---|---|---|---|---|
| Sin entrenar | 636 | 227 | 99 | 8 | 10 | 1 164 | 402 | 309 | 27 | 30 |
| **A (⚽)** | 800 | **691** | **496** | 16 | **20** | 1 000 | 703 | 626 | 22 | 20 |
| **B (🧸)** | 695 | 545 | 83 | **0** | **0** | 1 105 | 909 | **1 344** | **38** | **40** |

A investiga la pelota 3× más y juega con ella 5× más que la mascota sin entrenar, y llega primero a cada objeto la mitad de las veces (antes: 1 de cada 4). B no recoge la pelota ni una vez y juega con el peluche 4× más.

### Robustez (5 semillas, 150 episodios)

| Semilla | Sin entrenar | A (⚽) | B (🧸) | A − B |
|---|---|---|---|---|
| 11 | 0.328 | 0.463 | 0.252 | 0.211 |
| 3 | 0.328 | 0.491 | 0.266 | 0.225 |
| 7 | 0.329 | 0.495 | 0.233 | 0.262 |
| 19 | 0.323 | 0.524 | 0.235 | 0.289 |
| 23 | 0.365 | 0.526 | 0.233 | 0.293 |

En las 5 semillas: **A > sin entrenar > B**. La diferencia no proviene de ninguna variable `favoriteToy`: el selector de foco y las acciones son idénticos para ambas; solo cambian los pesos.

### Pesos que más cambiaron

| Pet A (⚽) | inicial → actual | Pet B (🧸) | inicial → actual |
|---|---|---|---|
| ballAttention → PLAY | 0.200 → 0.800 | teddyAttention → PLAY | 0.200 → 0.800 |
| ballAttention → PICK_UP_OBJECT | 0.200 → 0.800 | teddyAttention → PICK_UP_OBJECT | 0.200 → 0.800 |
| seesBall → playCircuit | 0.100 → 0.698 | seesTeddy → playCircuit | 0.100 → 0.695 |
| ballAttention → INVESTIGATE | 0.250 → 0.800 | teddyAttention → INVESTIGATE | 0.250 → 0.800 |
| seesBall → ballAttention | 0.550 → 0.880 | seesTeddy → teddyAttention | 0.550 → 0.880 |
| seesBall → curiosityCircuit | 0.100 → 0.400 | seesTeddy → curiosityCircuit | 0.100 → 0.400 |
| seesBall → joyCircuit | 0.000 → 0.300 | seesTeddy → joyCircuit | 0.000 → 0.300 |
| playCircuit → PLAY | 0.900 → 1.040 | playCircuit → PLAY | 0.900 → 1.026 |

Cada cerebro reforzó **la vía de su objeto**. Las vías del otro objeto no cambiaron.

## 3. "Ven aquí": aprender la llamada

80 llamadas desde posiciones equivalentes. El jugador pulsa ❤️ cuando la mascota empieza a venir. Hubo 78 recompensas. Se evalúa sobre un clon congelado, con **control sin llamar**.

| | Responde (APPROACH/FOLLOW ≤ 10 ticks) | Distancia recorrida hacia ti en 15 ticks | Llegó (< 0.2) en 40 ticks |
|---|---|---|---|
| Sin entrenar, llamando | 19 / 40 | +0.113 | 23 / 40 |
| Sin entrenar, sin llamar | 0 / 40 | −0.014 | 0 / 40 |
| **Entrenada, llamando** | **40 / 40** | **+0.178** | 20 / 40 |
| Entrenada, sin llamar | 0 / 40 | −0.004 | 1 / 40 |

Cambios de peso: `playerCalling→socialCircuit` 0.450 → 0.713, `playerCalling→followCircuit` 0.350 → 0.514. Las vías de necesidad apenas se mueven (±0.01).

- Aprendió la **asociación con la llamada**: responde siempre y recorre +58 % de distancia, pero **sin llamar no se acerca más que antes** (el control sigue en 0).
- Las **llegadas** no mejoraron (23 → 20; dentro del ruido). Lejos del jugador la mascota no lo percibe (`playerNear` bajo umbral) y la llamada es un estímulo breve: responde y se acerca, pero a veces se detiene antes de llegar. Aprender a llegar requeriría una percepción del jugador a distancia o llamadas repetidas.

## 4. Vertical slice ⚽ (test `learningSlices.test.ts`)

4 000 ticks jugando de verdad a **Trae la pelota** (lanzamientos con el `FetchGame` y ❤️ contextual). Cadena verificada:

```
pelota lanzada → seesBall → SNN → INVESTIGATE / PLAY / PICK_UP → experiencias (fetch_chased, played, picked_up, player_rewarded)
→ reward → elegibilidad → Δw (≤ 0.008 por sinapsis y experiencia) → vía seesBall creció
→ save → destruir → load (pesos idénticos al bit) → mayor cuota ⚽ que una mascota sin esa historia
→ descubrimiento likes:ball → recuerdo del juego → DecisionTrace con la vía de la pelota
→ "Milo ha tenido buenas experiencias anteriores con la pelota." (solo si historial Y cerebro lo respaldan)
```

## 5. Estabilidad (test `learningStability.test.ts`)

100 000 ticks con objetos rotando, comida, llamadas, ruidos, luz, el jugador que va y viene, ❤️ del jugador y una recompensa inyectada ±(0.5–1) cada 13 ticks (70 % positivas). Resultado:

- 0 NaN / Infinity en potenciales, pesos y trazas; pesos siempre dentro de [min, max].
- Las 649 sinapsis no plásticas quedan **idénticas** al inicio.
- ≥ 18 de 22 acciones siguen apareciendo, y ninguna supera el 30 % de los inicios de acción.
- Los 16 circuitos siguen disparando.
- save → load conserva **exactamente** todos los pesos.

## 6. Problemas encontrados (y cómo se resolvieron)

| # | Problema medido | Causa | Solución |
|---|---|---|---|
| 1 | La red no podía distinguir objetos | sensores genéricos; foco decidido por el mundo | sensores por objeto + neuronas de atención que sesgan el foco |
| 2 | `seesBall → feedingCircuit 0 → 0.60`, `→ restCircuit 0.75` | un sensor tónico coincide con todo lo recompensado | destinos restringidos a vías plausibles |
| 3 | La llamada nunca se aprendía (0 recompensas) | la mascota no respondía nunca → sin oportunidad de refuerzo | la llamada dura más (decaimiento 0.8 → 0.9, física del mundo) y el ❤️ tras APPROACH |
| 4 | Aprendía "acercarse siempre" (control 23/40) | social→APPROACH era plástica | se dejó fija; ahora el control es 0/40 |
| 5 | Deriva de vías de necesidad hasta el máximo | recompensas naturales casi siempre positivas | error de predicción `r − r̄` + canal de modulación "natural" |
| 6 | La preferencia aparecía en 5 episodios con un peso de juego casi intacto | el foco es winner-take-all: pequeños cambios de atención cambian mucho la conducta | la atención aprende 4× más despacio; learningRate 0.04 → 0.015 |
| 7 | `playerCalling → joyCircuit 0.15 → 0.00` en mascotas que nunca oyeron una llamada | el presupuesto homeostático recortaba también lo innato | el presupuesto solo recorta lo ganado por aprendizaje |
| 8 | Presupuesto superado (1.608 > 1.600) | se escalaba y luego se recortaba al mínimo | se reparte el exceso según el margen de cada peso |
| 9 | Los tests de estabilidad marcaban "soledad muerta" | el escenario de prueba nunca dejaba solo al jugador (`callPet` lo traía de vuelta) | escenario corregido; el cerebro no tenía la culpa |

## 7. Decisiones tomadas

- **Aprender, no programar**: ningún código consulta una preferencia para decidir. `PersonalityInterpreter` y los descubrimientos solo **interpretan** pesos + historial.
- **Solo 103 sinapsis plásticas**, con límites, ritmos y canales por vía.
- **Recompensa ≠ ganar**: `RewardModel` valora la experiencia para la mascota. El susto no es plástico en esta versión (evita “aprender a no tener miedo”).
- **Modo evaluación**: ¿Cuál prefieres? congela los pesos mientras mide.
- **Persistencia**: pesos actuales + iniciales + estado de aprendizaje (save v2, con migración desde v1).

## 8. Posibles mejoras futuras

- **Aprender a llegar**: percepción del jugador a distancia o llamadas repetidas, para que la respuesta a la llamada se convierta en llegada.
- **Miedo plástico** con su propio canal (sensibilización y habituación), para objetos que asustan.
- **Aprendizaje por olvido lento**: una consolidación con decaimiento muy lento hacia lo innato para que las preferencias no usadas se desvanezcan en semanas.
- **Evaluación en la app**: usar `evaluatePreference` para mostrar al jugador cómo cambió su mascota ("hace una semana / hoy").
- **Más objetos con estímulo propio** (burbujas, frisbee) al añadir los juegos restantes.
