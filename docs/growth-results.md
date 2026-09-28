# Crecimiento y etapas de vida — resultados medidos

Los números salen de `npm run report:growth` (`src/core/__tests__/growthReport.test.ts`). Las regresiones permanentes están en `src/core/__tests__/growth.test.ts` (16 tests). El diseño está en `docs/pet-growth.md`.

**Qué hay que demostrar:** que identidad, cerebro, memoria y aprendizaje sobreviven al crecimiento. Que el modelo cambie de tamaño no basta.

## 1. Configuración usada (`GrowthConfig`, valores de balance iniciales)

| Etapa | Edad mínima | Desarrollo | Plasticidad | Movilidad | No puede todavía (sustituto) | Necesidades |
|---|---|---|---|---|---|---|
| BABY | 2 días | 30 | ×1.5 | ×0.7 | RUN (→ WALK), DANCE, FOLLOW_PLAYER (→ APPROACH) | cansancio ×1.3, hambre ×1.15, sed ×1.1, cariño ×1.2 |
| CHILD | 5 días | 60 | ×1.25 | ×0.9 | DANCE | cansancio ×1.1, aburrimiento ×1.1 |
| YOUNG | 10 días | 100 | ×1.0 | ×1.0 | — | — (= comportamiento de referencia de fases anteriores) |
| ADULT | — | — | ×0.7 | ×1.0 | — | cansancio ×0.95, aburrimiento ×0.9 |

- **Desarrollo:** puntos por experiencias significativas, con rendimiento decreciente (`base / (1 + repeticiones/2)`, las repeticiones decaen ×0.5 al día) y un tope de 12 puntos por día de mundo.
- **Offline:** ×0.35, con un tope por ausencia del 50 % de lo que pide la etapa.
- **Variación individual:** ±8 % (ritmo, tamaño, desarrollo), reproducible por semilla.

## 2. Milo y Luna: mismo cerebro, infancias distintas (30 días, 3 semillas)

- **Milo (explorer):** jugador presente de 8 a 20 h, pelota, un objeto nuevo cada 3 h, llamadas y caricias.
- **Luna (calm):** peluche, dos ratos cortos de compañía al día, nada nuevo.

Las dos nacen BEBÉ con la misma semilla, así que empiezan con distancia 0.0000 entre cerebros y el mismo hash de pesos.

| Semilla | Milo: transiciones (día) | Luna: transiciones (día) | Distancia final Σ\|wA−wB\| | Pelota frente a peluche (misma prueba) |
|---|---|---|---|---|
| 3 | BABY→CHILD 3 · →YOUNG 8 · →ADULT 17 | 3 · 11 · 28 | 2.642 | Milo **0.49** · Luna 0.32 |
| 4 | 3 · 8 · 18 | 4 · 13 · (YOUNG a los 30 días) | 2.951 | Milo **0.51** · Luna 0.21 |
| 5 | 3 · 8 · 19 | 3 · 11 · 29 | 2.629 | Milo **0.47** · Luna 0.31 |

- **En las 18 transiciones:** `cerebro intacto = true`, es decir, el mismo hash de pesos antes y después. Las experiencias y los recuerdos se conservan: en cada transición se suma exactamente un recuerdo, «está creciendo». No se salta ninguna etapa.
- **A' ≠ B':** empiezan en distancia 0 y terminan en 2.6–3.0. Con la misma prueba de clones congelados, Milo prefiere la pelota más que Luna en 3 de 3 semillas.
- **Crecer depende de la vida vivida:**
  - Milo llega antes a cada etapa, limitado por la **edad mínima**: 3 días = 2 + un día de tope diario; YOUNG a los 3 + 5 días.
  - Luna, con una vida tranquila y repetitiva, llega más tarde, limitada por el **desarrollo**, porque repetir el peluche rinde menos. En la semilla 4 aún es joven a los 30 días.
- **Hitos reales** (semilla 3, Milo): ARRIVED d1, FIRST_PLAY d1, FIRST_EXPLORE d1, FIRST_DISCOVERY d1, FIRST_SLEEP_ALONE d2, GREW d3, FIRST_HABIT d6, GREW d8, GREW d17.
- **«¿Recuerdas?» usa recuerdos reales de la etapa que termina.** Semilla 3, Milo:
  - al pasar de bebé: «La primera caricia», «Te saludó por primera vez», «Confía en ti»;
  - de cachorro a joven: «¡Le fascina la seta!», «…el yoyó!», «…la bola de cristal!»;
  - de joven a adulto: «Milo jugó con el patito», «Nuevo hábito».

### Lo que NO salió como se esperaba (honesto)

- **Objeto nuevo en la misma prueba:** los dos lo investigan 20 de 20 veces. La prueba satura (la novedad es muy fuerte en cualquier cerebro), así que la diferencia aprendida se mide con la preferencia pelota/peluche.
- **«Antes / Ahora»** apareció en 1 de 6 primeros crecimientos: «Le encantaba el plato → Ahora el plato es de lo primero que busca». No apareció entre etapas en estas vidas. Pide al menos 3 experiencias por etapa con el mismo sujeto y un cambio de valencia ≥ 0.25, y aquí las relaciones con los objetos se **mantuvieron** entre etapas. Es coherente con conservar la personalidad, pero hace que la comparación sea rara. No se inventa ninguna.
- **Salidas bloqueadas:** RUN, DANCE y FOLLOW_PLAYER casi no se disparan en un bebé (1–4 veces en 30 días). La «frustración neuronal» no es un problema práctico con este cerebro. Aun así, la política queda documentada: se mantiene la salida, se bloquea la ejecución y se sustituye por la forma posible.

## 3. Plasticidad según la etapa (misma recompensa, mismos clones)

| | BABY | CHILD | YOUNG | ADULT |
|---|---|---|---|---|
| Σ\|Δw\| por una recompensa de 0.8 | 0.0427 | 0.0356 | 0.0285 | 0.0199 |

Las proporciones coinciden con los multiplicadores (1.5 : 1.25 : 1 : 0.7). El multiplicador escala también el tope por sinapsis, porque si no el tope ocultaría el efecto. **El adulto sigue aprendiendo.**

## 4. Offline: el tiempo pasa, el desarrollo tiene límites

| Ausencia | Ticks simulados | Etapa al volver | Progreso de la etapa | Edad |
|---|---|---|---|---|
| 7 días | 900 | BABY | 0.16 | 7.0 d |
| 30 días | 900 | BABY | 0.21 | 30.0 d |
| 90 días | 900 | BABY | 0.23 | 90.0 d |

- **Ningún adulto instantáneo.** La edad cronológica avanza entera; el desarrollo no pasa del tope por ausencia (50 %).
- **Si ya tocaba crecer al irse:** la transición queda **pendiente**, no se aplica offline y se vive al volver, un solo paso y después de «Mientras no estabas». Lo cubre un test.
- **Rendimiento:** 64–111 ms por ausencia (el simulador offline está acotado a 900 ticks).

## 5. Rendimiento

- Una vida de 30 días (43 200 ticks) con crecimiento tarda 3.4–4.1 s en Node, igual que sin crecimiento. El sistema añade O(1) por experiencia y una evaluación cada 30 ticks.
- **Visual:** `GrowthVisualController` solo modifica la pose de reposo, sin reconstruir mallas. La transición visual dura unos 3 s.

## 6. Bugs encontrados en esta fase

1. **La infancia se perdía con el tiempo.** El registro de experiencias es acotado (400 y rota), así que a los 30 días no quedaba ninguna experiencia de bebé y «Cuando era bebé…» habría quedado vacío para siempre. **Arreglo:** un resumen compacto por sujeto y etapa en el estado de crecimiento, persistido en el save v4. Los recuerdos (Moments) de bebé sí se conservaban: 13–28 por mascota.
2. **La celebración repetía siempre los mismos 3 recuerdos.** **Arreglo:** se priorizan los recuerdos de la etapa que termina.
3. **La variación individual no era reproducible:** dependía de la hora de creación incluida en el id. **Arreglo:** se deriva solo de la parte sembrada del id.
4. **Gramática:** «acercarse a el agua» → «al agua».
5. **Test de plasticidad:** un clon no tiene trazas de elegibilidad, porque son transitorias y no se guardan. La prueba vive 20 ticks idénticos antes de recompensar.

## 7. Decisiones arquitectónicas

- **Etapas lógicas genéricas** (`BABY/CHILD/YOUNG/ADULT`) con nombres por especie solo en la UI (Cachorro, Gatito, Osezno, Gazapo). SENIOR queda reservado.
- **Edad cronológica ≠ desarrollo.** Crecer exige las dos cosas. No hay XP ni números en la UI: «Nivel N» se retiró y ahora se muestra la etapa.
- **Transición transaccional** con rollback (probado forzando un fallo). **Momentos seguros:** no crece dormido, jugando, comiendo, asustado ni en un minijuego; queda pendiente.
- **Los moduladores de etapa se recalculan desde la base** (`applyPhysiology(perfil, etapa)`), así que nunca se acumulan.
- **Capacidades:** se mantiene la salida y se bloquea la ejecución, con sustitución física.
- **Migración de mascotas existentes:** BEBÉ, o CACHORRO si tenía ≥ 150 experiencias, nunca más. La edad mínima empieza a contar al migrar.
- **Voz por edad:** tono más agudo o más grave en la reproducción de los sonidos de la mascota. `VOICE_RATE` está preparado para assets por etapa.
- **Preparado para más adelante, sin implementar:** SENIOR (se añade una etapa al config) y parámetros heredados (`IndividualModifiers` sería el punto de entrada de la genética).
