# Rutinas y hábitos emergentes — resultados medidos

Todos los números salen de `npm run report:routines` (`src/core/__tests__/routineReport.test.ts`).
Las regresiones permanentes están en `src/core/__tests__/routines.test.ts` (27 tests; sus umbrales solo fijan la **dirección** del efecto medido aquí).

La mascota nunca recibe «son las 22:00, duerme». La hora llega como seis neuronas de reloj (código en anillo), la luz como `lightLevel`/`darkness`, y lo demás lo decide la SNN.

## Montaje

| | |
|---|---|
| Reloj | `SimulationClock`, 1 minuto de mundo por tick neural (1 día = 1440 ticks) |
| Fisiología | perfil `day` (hambre, sed, aburrimiento y cariño ×0.35 por tick); el cansancio igual que en la app |
| Cerebro | el mismo cerebro inicial en cada par A/B (misma semilla) |
| A · consistente | jugador presente de 07:00 a 21:30, 8 sesiones de juego de día y noches oscuras y tranquilas |
| B · irregular | **mismo** cuidado total (8 sesiones al día, comida y agua), pero a horas al azar; de noche enciende la lámpara al llegar (a veces la deja encendida) y hay ruidos ocasionales |
| Evaluación | sobre **clones congelados** en el mismo contexto: sonda (23:00 oscuro / 14:00 de día / 23:00 con lámpara; cansancio 0.4, 20 × 60 ticks) y *free run* (4 días en un mundo neutro idéntico) |

`selectividad = (descanso de noche − descanso de día) / (suma)` en la sonda.

## 1. Sueño: A (consistente) vs B (irregular), 30 días, 5 semillas

| semilla | régimen | sueño de noche en su vida* | constancia de la hora (r) | hábito de hora | titular | sonda noche/día (descanso) | selectividad | free run: sueño de noche |
|---|---|---|---|---|---|---|---|---|
| 1 | A | **0.44** | **0.51** | – | Todavía no… | 0.60 / **0.18** | **0.54** | 0.27 |
| 1 | B | 0.39 | 0.25 | – | Todavía no… | 0.89 / 0.41 | 0.37 | 0.36 |
| 2 | A | **0.46** | 0.41 | – | Todavía no… | 0.75 / **0.29** | **0.44** | 0.35 |
| 2 | B | 0.37 | 0.46 | – | Todavía no… | 0.94 / 0.38 | 0.42 | 0.40 |
| 3 | A | **0.49** | 0.64 | 0.37 | Todavía no… | 0.86 / **0.29** | **0.50** | 0.36 |
| 3 | B | 0.30 | 0.64 | 0.57 | *parece dormir a horas parecidas* (≈17 h) | 0.94 / 0.39 | 0.41 | 0.37 |
| 4 | A | **0.45** | **0.71** | **0.54** | **rutina nocturna** | 0.83 / **0.31** | **0.46** | 0.42 |
| 4 | B | 0.35 | 0.43 | 0.40 | Todavía no… | 0.82 / 0.35 | 0.40 | 0.31 |
| 5 | A | **0.43** | **0.71** | **0.61** | **rutina nocturna** | 0.81 / **0.27** | **0.50** | 0.40 |
| 5 | B | 0.30 | 0.62 | 0.46 | Todavía no… | 0.95 / 0.37 | 0.44 | 0.47 |

\* fracción del sueño entre las 22:00 y las 06:00, días 15–30 (con sueño uniforme sería 0.33).

**Qué se cumple**

- **En su vida**, A concentra más sueño en la noche en 5 de 5 semillas (0.43–0.49 frente a 0.30–0.39). Su hora de dormir es más constante en 3 semillas, igual en 1 y menor en 1.
- **Aprendido, en el mismo contexto** (clones congelados): A es más selectiva noche/día en 5 de 5 semillas (0.44–0.54 frente a 0.37–0.44). La diferencia está sobre todo en que **A descansa menos de día** (0.18–0.31 frente a 0.35–0.41) y menos a las 23:00 con la lámpara encendida. Aprendió que el día es para estar activo, y no solo «oscuro → dormir».
- El titular «parece haber desarrollado una rutina nocturna» aparece en A en 2 de 5 semillas y en B nunca. B obtuvo una vez «parece dormir a horas parecidas» con una media de 17 h; es verdad para esa vida: se dormía al atardecer.

**Qué NO se cumple (honesto)**

- **Free run:** en un mundo neutro con luz natural, los clones de A y B no difieren de forma consistente. La oscuridad sincroniza a todas las mascotas (vía innata `darkness → descanso`), y lo aprendido sobre la hora es pequeño: `time* → descanso` cambia de 0.05 a 0.01–0.15.
- **Por qué:** la consecuencia de dormir (el alivio del cansancio) depende del cansancio y no de la hora. Con error de predicción, dentro de cada noche el principio (muy cansado) da señal positiva y el final (ya descansado) da señal negativa. A la hora le llega poca señal neta.
- **Laboratorio Milo/Luna (semilla 11):** los dos obtienen «Todavía no observamos una rutina clara». Milo ronda el umbral (0.37). Tiene rutina de mañana y de pelota, pero su hora de dormir se desplaza entre la noche y el atardecer. **El criterio de éxito del titular no se alcanza de forma fiable.** La diferencia que sí se sostiene es la de conducta en su vida y la selectividad aprendida.

## 2. Cambios de modelo que exigieron los experimentos

Cada uno se midió antes y después. Todos son fisiología o percepción; ninguno es un horario.

| problema medido | causa | cambio |
|---|---|---|
| Sueño en siestas de 50 ticks (6 % del tiempo) | la recuperación −0.02/tick no puede sincronizarse con un día de 1440 ticks | cansancio +0.0008/tick; sueño en la cama con caída **exponencial** de la presión de sueño (`0.0045·f + 0.0004`, modelo de dos procesos) |
| Descansaba «despierto» todo el día | REST (−0.003) sustituía a dormir | REST −0.0012: repone energía, apenas quita sueño |
| Iba a la cama y no llegaba | el freno de REST (×0.2) anulaba el paso hacia la cama | REST no frena si también quiere DORMIR |
| Se quedaba entre el agua y la cama | los destinos se sumaban (vectores opuestos) | el movimiento sigue el destino de la decisión **más reciente** |
| Dormía en el borde de la cama y «despertaba» a cada paso | se paraba justo en el umbral de distancia | se acomoda en el centro (umbral 0.1, parada 0.02) |
| Hambre y ruido lo despertaban cada hora | percibía igual dormido que despierto | **dormido siente menos**: vista ×0.15, interocepción ×0.6; ruido, caricia y llamada intactos |
| Con 1 min/tick, el hambre llenaba en 8 h | la fisiología de la app es para 3 ticks/s | perfil `day` en `SimConfig` (necesidades ×0.35) |
| La recompensa de dormir iba al contexto del **despertar** | la traza dura ~15 ticks y la noche 400 | el descanso largo se valora **por tramos de 1 h**, escalado por el cansancio al inicio del tramo (descansar sin cansancio = 0) |
| «Dormir descansado» reforzaba dormir | resultado 0 → sin señal | las recompensas naturales **siempre** pasan por el error de predicción: 0 < lo esperado → señal negativa |
| El detector mezclaba siestas con el sueño principal | varias siestas diarias dispersan la media | `mainSleeps`: el episodio más largo de cada día de sueño (mediodía a mediodía); despertares < 45 min no parten el sueño |

**Variantes probadas y descartadas** (5 semillas):

- Tasa ×3–4 en las vías de contexto: más ruido. Con ×3, B (privada de sueño) aprende más `darkness → descanso` que A y en *free run* duerme más de noche que A.
- Modulación específica por impulso (descanso solo aprende de `rested`, juego de `played`…): separaba **menos** A de B (selectividad 0.46 frente a 0.43; con la regla única, 0.50 frente a 0.40).

## 3. Regreso del jugador (21 días, 3 semillas)

A: el jugador se va a las 09:00 y vuelve hacia las 18:00; si la mascota sale a recibirlo, pulsa ❤️. B: el mismo tiempo fuera, en 3 salidas al azar, y al volver la ignora. La vía `playerReturned → social` aprende a tasa ×3.

| semilla | A: ❤️ | A: sonda antes→después | A: peso social | B: sonda antes→después | B: peso social | hábito en su vida A / B |
|---|---|---|---|---|---|---|
| 1 | 19 | 7→6 /20 | **0.472** | 7→0 /20 | 0.363 | 0.69 / 0.73 |
| 2 | 18 | 7→3 /20 | **0.484** | 7→13 /20 | 0.404 | 0.70 / 0.82 |
| 3 | 16 | 7→0 /20 | **0.439** | 7→0 /20 | 0.389 | 0.56 / 0.89 |

- **Se cumple:** A aprende más asociación «vuelve → social» en 3 de 3 semillas (+0.14 a +0.18 sobre el inicial 0.3, frente a +0.06 a +0.10 en B).
- **NO se cumple:** en la sonda (18:00, mismo contexto) esa diferencia **no se traduce en conducta de forma consistente**. `social → APPROACH` no es plástica a propósito (si lo fuera aprendería «acercarse siempre», medido en la fase 3), y a las 18:00 compite con el descanso del atardecer.
- En su vida, B «sale a recibirte» con más frecuencia (0.73–0.89). Sus regresos caen a cualquier hora, a menudo cuando está despierta, mientras que A siempre recibe al jugador al atardecer. **El hábito observado y la tendencia aprendida son cosas distintas**, y el detector describe la primera.
- Corregido en esta fase: «mirar hacia la puerta» (ASK_ATTENTION) y «estar ya al lado» contaban como recibir. Ahora solo cuenta empezar a acercarse o saludar, o llegar desde lejos (≥ 0.3).

## 4. Deriva del hábito: la cama cambia de sitio el día 20

| semilla | d8 | d12 | d16 | d20 | d24 | d28 | d32 | d40 |
|---|---|---|---|---|---|---|---|---|
| 1 | rincón 0.56 | 0.58 | 0.65 | 0.69 | rincón 0.44 | **ventana 0.56** | 0.69 | 0.79 |
| 2 | rincón 0.42 | 0.56 | 0.63 | 0.68 | **ventana 0.43** | 0.60 | 0.70 | 0.80 |

El hábito cambia de 4 a 8 días después del cambio real, por recencia (vida media de 5 días), sin reglas de «olvido». «Cómo ha cambiado» registra: *[28] Ahora suele dormir junto a la ventana.*

La evolución tiene histéresis: empieza con 0.5 y solo se «deja» por debajo de 0.35. Aun así, la hora media de dormir de la semilla 2 oscila entre «por la noche» y «al atardecer». Eso refleja con honestidad que su hora está en el límite entre ambas franjas.

## 5. Interrupción: de noche, descansado y curioso, con un regalo nuevo

| semilla | descansado + curioso | + regalo | cansado (control) |
|---|---|---|---|
| 1 | descanso 0.29, dormido 0.00 | **investiga 20/20**, dormido 0.00 | descanso 0.94, dormido 0.59 |
| 2 | descanso 0.22, dormido 0.00 | **investiga 20/20**, dormido 0.00 | descanso 1.00, dormido 0.59 |

La noche no obliga a dormir: con 40 días de rutina nocturna, una mascota descansada y curiosa se queda despierta investigando.

## 6. Persistencia, offline y rendimiento

- **Save v3:** se guardan episodios con contexto (máx. 4000) e instantáneas diarias de hábitos (máx. 120). Los hábitos no se guardan: se recalculan. La migración 2→3 deja la rutina vacía, porque no se inventan hábitos con datos sin contexto, y apaga la lámpara, porque antes `lightOn` era «la luz de la habitación». El test comprueba que guardar y cargar da los mismos hábitos.
- **Offline:** cada tick ocurre a su hora del mundo (`setTimeOverride`), así que la noche y la luz pasan de verdad. Los episodios offline se marcan y el detector los ignora, porque la simulación comprimida no es evidencia de hábito. «Mientras no estabas» usa solo episodios reales: *Durmió en su camita (unas N horas)*, *Jugó con la pelota*.
- **Rendimiento:** 30 días (43 200 ticks) tardan 3.5–13 s en Node (la primera semilla calienta el JIT). En la app el reloj solo entra en el snapshot, que se publica a ≤ 4 Hz: no hay renders por cambio de minuto.

## 7. Limitaciones conocidas

1. **Escala de tiempo en la app:** a 3 ticks/s, un día real son unos 260 000 ticks, así que en tiempo real la mascota tiene muchos ciclos de sueño por día. La hora y la luz sí son reales y el cerebro las percibe, pero una rutina de 24 h emerge en las simulaciones a 1 min/tick: laboratorio de desarrollo, «Vivir días» y la sección de este informe. Hacer que la fisiología de la app funcione en minutos de mundo es una decisión de producto pendiente.
2. El componente horario aprendido es débil (sección 1). El siguiente paso con sentido sería una consecuencia que dependa de la hora, por ejemplo perderse las sesiones de juego por dormir de día. No lo son más tasa ni más recompensa: medido, eso solo añade ruido.
3. Los resultados varían entre semillas. Por eso los tests usan sumas de 3 semillas y la dirección del efecto, no valores exactos.

## 8. Revalidación tras HOME 2.0 (casa amueblada con obstáculos reales)

Con la casa nueva (sofá, chimenea, cómoda, plantas y lámpara con colisión física), sueño A/B durante 30 días, 5 semillas:

| | A consistente | B irregular |
|---|---|---|
| Sueño de noche en su vida | **0.41–0.51** | 0.34–0.40 (A > B en 5/5) |
| Selectividad aprendida (mismo contexto) | 0.48–0.57 | 0.48–0.65 (**B > A en 3/5**) |
| Referencia sin obstáculos (mismo código) | 0.56–0.63 | 0.50–0.57 (A ≥ B en 5/5) |

- **Se sostiene:** la diferencia de conducta en su vida.
- **Ya no se sostiene:** la selectividad noche/día aprendida, que ya era débil. Los caminos y los rodeos del nuevo espacio cambian lo que se vive y, con ello, lo que se aprende. El test solo exige ahora lo robusto.
