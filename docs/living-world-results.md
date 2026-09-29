# Mundo vivo — resultados medidos

Números reales de la simulación (Node, Jest, semillas fijas). Reproducibles:

```bash
npm run test:world      # 23 tests del mundo vivo
npm run report:world    # informe completo → docs/living-world-report.txt
```

Diseño en `docs/living-world.md`. Lo que **no** está verificado aquí (FPS en
dispositivo, audio, gestos) se indica al final.

**Criterio de terminado**: el mundo produce experiencias que cambian el
cerebro. Se cumple (secciones 4–6): una misma escena produce conductas
distintas según la historia y el genoma, y cada conducta se puede explicar de
la percepción a la sinapsis que cambió.

---

## 1. Percepción: FOV y distancia (Prueba A)

Pelota; mascota en (0.5, 0.5) mirando al frente. `seesBall` = lo que llega a la SNN.

| caso | distancia | ángulo | en FOV | día | noche |
|---|---|---|---|---|---|
| delante, cerca | 0.62 m | 0° | sí | **0.91** | 0.41 |
| delante, lejos | 2.00 m | 0° | sí | 0.71 | 0.32 |
| al lado (periferia) | 1.82 m | −90° | sí | 0.47 | 0.21 |
| detrás, cerca (olfato/bigotes) | 0.33 m | 180° | no | 0.43 | 0.43 |
| detrás, lejos | 1.66 m | 180° | no | **0.00** | 0.00 |

Sin omnisciencia: detrás y lejos no existe para ella; muy cerca se nota
aunque esté detrás y a oscuras (sentido cercano, independiente de la luz).

## 2. Oído

Una pelota cae **detrás** (fuera del FOV): se oye con intensidad 0.26,
dirección 180°, `behind = true`; la atención pasa al sonido (`sonido:thud`) y
la mascota termina mirándola (el objeto entra en su visión a los 19 ticks,
semilla 1). No hay "si suena → mira": la SNN produjo LOOK_AT_OBJECT y la
orientación se giró hacia la fuente.

## 3. Novedad y familiaridad (Prueba B)

Caja; 12 exposiciones de 60 ticks separadas por 300 ticks sin verla.

| exposición | 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12 | +21 días sin verla |
|---|---|---|---|---|---|---|---|---|---|
| novedad | **1.00** | 0.39 | 0.26 | 0.16 | 0.09 | 0.05 | 0.01 | **0.00** | 0.07 |
| familiaridad | **0.00** | 0.38 | 0.47 | 0.58 | 0.67 | 0.77 | 0.84 | **0.89** | 0.89 |

- En la 1.ª exposición la abrió (etapa INTERACTED): por eso la novedad cae tanto de golpe.
- Las dos señales se separan: tras semanas sin verla la novedad vuelve algo, la familiaridad no se pierde.
- Persisten exactamente al guardar/cargar (test).
- Lo que nunca vio (espejo) sigue con novedad 1; sus muebles de casa, familiares desde la adopción.

## 4. 📦 Caja misteriosa — vertical slice

Test `📦 Vertical slice` (semilla 11), cadena completa comprobada paso a paso:

```
jugador coloca la caja → OBJECT_APPEARED en los eventos del tick
→ la percibe (señal > umbral) con novedad 1 (su memoria)
→ seesBox y newObjectDetected > 0 llegan a la SNN
→ la red produce conducta sobre la caja (LOOK / INVESTIGATE / MOVE_AWAY / …)
→ experiencias (approached_object, investigated, mystery_opened o scared)
→ memoria de exploración (VIO → SE ACERCÓ → INVESTIGÓ → INTERACTUÓ)
→ eventos de aprendizaje que tocan seesBox / boxAttention / newObjectDetected
→ DecisionTrace sobre la caja con su vía de sinapsis (explicable)
```

Primer ensayo (semilla 11, 150 ticks): la percibe en el tick 0, primera
acción LOOK_AT_OBJECT, la mira en el 8, se acerca en el 23, 18 ticks de
investigación → **la abre** (dentro: una cuerda que se queda en la habitación).

### Explicación completa de un episodio (Milo vs Luna, misma escena 📦 ⚽ 🧸)

Milo: genoma equilibrado, 10 ensayos previos con la caja sin sustos.
Luna: genoma miedoso, 10 ensayos previos en los que acercarse a la caja coincidió con un golpe fuerte.

| | Milo | Luna |
|---|---|---|
| **percibió** la caja | señal 0.76 a 1.66 m, 0°, novedad 0.01, familiaridad 0.71 | señal 0.76 a 1.66 m, 0°, novedad 0.04, familiaridad 0.51 |
| **entradas SNN** | seesBox 0.76, newObjectDetected 0.78, familiarObject 0.54 | seesBox 0.76, newObjectDetected 0.78, familiarObject 0.39 |
| **decisión** | PICK_UP_OBJECT ← circuito curiosidad + juego ← `newObjectDetected→curiosityCircuit` 0.70→0.71 | **GET_SCARED** ← circuito miedo ← `newObjectDetected→fearCircuit` **0.60→0.84**, `seesBox→fearCircuit` **0.00→0.15** |
| **acciones** | EXPLORE, LOOK, INVESTIGATE, PICK_UP, PLAY… | CRY, GET_SCARED, LOOK, … MOVE_AWAY, GET_SCARED, HIDE |
| **experiencias** (120 ticks) | investigated(caja), **mystery_opened(cuerda) r = 0.6**, picked_up(cuerda) | scared(caja) ×16, hid(caja) ×1, investigated(caja) ×7 |
| **aprendió** | seesBox→curiosity +0.0003 por investigación; boxAttention→LOOK +0.0004 | amenaza: newObjectDetected→fear +0.008 por susto; −0.002 cuando investigó y no pasó nada (extinción) |
| en 10 ensayos de la escena | llega primero al peluche 9/10, **miedo 0/10** | llega primero a la pelota 9/10, **miedo 9/10** |

Misma escena, conducta distinta, y la diferencia se puede rastrear hasta
sinapsis concretas que cambiaron por experiencias concretas.

## 5. Dos mascotas, mismo genoma, historias distintas (Prueba C)

15 ensayos previos con la caja: A sin sustos; B con un golpe fuerte si se acercaba. Medición con clones congelados (12 ensayos).

| semilla | Δ seesBox→miedo A / B | se acerca: sin historia / A / B | dist. mín. A / B | escena 📦⚽🧸: miedo A / B |
|---|---|---|---|---|
| 11 | 0.000 / **0.251** | 0.58 / 0.50 / **0.17** | 0.15 / 0.21 | 0.00 / **0.38** |
| 12 | 0.000 / **0.262** | 0.58 / 0.50 / **0.33** | 0.16 / 0.19 | 0.00 / **0.25** |
| 13 | 0.000 / **0.339** | 0.58 / 0.75 / **0.25** | 0.09 / 0.20 | 0.00 / **0.50** |

- B aprende miedo a la caja (vía real en el cerebro) y se acerca menos; en la escena compartida muestra miedo en el 25–50 % de los ensayos, A nunca.
- A no se vuelve "adicta" a la caja: se **habitúa** (novedad ~0) y su curiosidad por ella apenas crece (+0.01): solo la abrió 1–2 de 15 veces, así que hubo poca recompensa. Es honesto: sin recompensa, lo conocido deja de tirar.

## 6. Cambio de contexto (Prueba D)

Misma mascota, misma caja (10 ensayos):

| | se acerca | distancia mínima | miedo | investiga (ticks) |
|---|---|---|---|---|
| día + su habitación | 0.60 | 0.15 | 0.00 | 7.1 |
| noche + parque desconocido | **0.00** | 0.41 | **1.00** | 0.0 |

Nada de "si es de noche, miedo": oscuridad (`darkness`), lugar poco
conocido (`unfamiliarPlace`) y espacio abierto entran como contexto y la red hace el resto.

## 7. Movimiento (Prueba E)

16 ensayos, pelota a la misma distancia:

| | `objectMoving` (primeros 8 ticks) | la mira en ≤ 12 ticks | se implica en ≤ 25 ticks |
|---|---|---|---|
| quieta | 0.00 | 7/16 | 16/16 |
| rodando | **0.33** | **13/16** | 16/16 |

La señal es distinta y cambia la conducta (orientación hacia lo que se mueve).
Espejo: con la mascota quieta su imagen no se mueve (0); al moverse, 1.0.

## 8. Selección de objetivo y navegación

- `objects[0]` = un peluche **detrás** (no percibido); la pelota está delante → el resolver elige la pelota y el foco también; el peluche no es "conocido" (test).
- Aprendizaje "¿Cuál prefieres?" (3 semillas, 150 episodios): cuota de la pelota sin historia **0.19**; entrenada con pelota **0.65 / 0.79 / 0.70**; con peluche 0.25 / 0.28 / 0.23.
- "Trae la pelota" (4000 ticks, 4 semillas): cuota entrenada **0.48 / 0.35 / 0.20 / 0.53** frente a 0.16 sin historia; "le fascina la pelota" en las 4.
- Rodeo del árbol del jardín: el waypoint se aparta del árbol (test). Con la puerta cerrada o siendo bebé no hay camino al jardín. La ubicación solo cambia estando en la salida (3000 ticks, test).

### Salidas autónomas (puerta abierta, cachorro cuidado, 6000 ticks ≈ 33 min)

| genoma | semilla 8 | 9 | 10 |
|---|---|---|---|
| equilibrado | 0 salidas | 0 | 0 |
| curioso | 1 salida, 2.2 % del tiempo fuera | 1, 16.9 % | 1, 2.8 % |
| miedoso | 0 | 0 | 0 |

Puede salir sola si tiene capacidad y contexto, y **no** lo hace siempre: la
personalidad decide. Las curiosas salen, exploran y vuelven solas (comer,
dormir: la navegación las devuelve por la puerta).

## 9. Primera visita

- Jardín (cachorro, 3 semillas): "🌿 Primera mañana en el jardín — Exploró hasta la otra punta, olfateándolo todo. Algo le dio miedo y buscó refugio. Hasta se animó a jugar. Vio por primera vez la mariposa." Se aleja 0.65–1.0 u de la entrada; 4–8 sustos en el primer minuto.
- Cachorros curiosos que salieron solos: "Exploró los alrededores, olfateándolo todo. Hasta se animó a jugar." (sin sustos).
- Parque (joven): "🌳 Primera mañana en el parque — Exploró hasta la otra punta… Se sobresaltó una vez, pero siguió… Vio por primera vez la hoja."
- Hito `FIRST_OUTING` / `FIRST_PARK`, experiencia `first_visit`, "Lugares y descubrimientos" lo refleja.

## 10. Offline (Prueba F)

8 horas con pelota y caja en la habitación:

- Puerta cerrada: lugares visitados = `room`. Nada aparece de la nada: los objetos siguen o salieron de la caja.
- Puerta abierta (curioso y equilibrado): en las 3 pruebas se quedó en la habitación (el offline corre como máximo 900 ticks reales de SNN) y **nunca** al parque (test).
- "Mientras no estabas" cuenta salidas reales si las hubo ("Salió al jardín por su cuenta y luego volvió").

## 11. Rendimiento (Prueba G)

Tick completo (mundo + percepción + SNN + memoria), Node:

| objetos | tick medio | p95 | solo percepción |
|---|---|---|---|
| 14 | 0.32 ms | 1 ms | 0.16 ms |
| 29 | 0.53 ms | 1 ms | 0.26 ms |
| 54 | 0.89 ms | 2 ms | 0.61 ms |

A 3 ticks/s el presupuesto es 333 ms: la simulación no es el cuello de
botella. Por eso no se optimizó (sin índices espaciales ni LOD).
**FPS en dispositivo/emulador: sin medir** (no había dispositivo en esta
sesión). Para medirlo: Ajustes → Herramientas → World Inspector → "Medidor de
FPS" + "+10 / +25 / +50 objetos" + "Medir tick".

## 12. Microeventos

Deterministas con semilla y guion ("hoja en T, sonido en T+20" reproducido
exactamente, test), nunca dos espontáneos a menos de 150 ticks, menos
frecuentes si la mascota acaba de asustarse. Producen estímulos (hoja = objeto
nuevo + susurro), nunca acciones.

## 13. Bugs encontrados y corregidos durante el trabajo

1. **Tests no deterministas**: el rng de los microeventos se sembraba con el id de la mascota (que lleva `Date.now()`). Ahora: nombre + especie + fecha de adopción.
2. **Primera visita con fecha 0**: `firstVisitAt` era 0 si se salía antes del primer tick (el reloj del mundo aún no estaba puesto). El mundo recibe la hora al construirse.
3. **Caja abierta sin contenido revelado**: los eventos de las acciones de un tick llegaban al siguiente. Ahora se entregan en el mismo tick.
4. **La novedad arrastraba la atención** (0.5): una mascota entrenada con la pelota prefería el peluche solo porque era nuevo. Se bajó a 0.05; la novedad llega al cerebro por sus sensores.
5. **El miedo no podía aprenderse** con recompensa (un susto la debilitaba). Segundo modulador de amenaza.
6. **Aprendizaje de la pelota invisible con FOV estrecho** (220°/100°): "Trae la pelota" dejaba de mostrar aprendizaje (0.47 vs 0.47). FOV 250°/140° + atención de arriba abajo con los pesos aprendidos → 0.48 vs 0.16.
7. **Evaluación injusta con FOV**: `evaluatePreference` no fijaba la orientación; ahora empieza mirando al frente con ambos objetos a la vista.
8. Test preexistente que ya fallaba (`eB.share < e0.share`, 0.065 vs 0.019): sustituido por una condición que sí expresa el aprendizaje (ver el test).
9. `LOOK_AT_OBJECT` sin nada concreto no giraba la cabeza: ahora mira a un lado y a otro (lo de detrás puede entrar en su campo de visión).

## 14. Pendiente de probar en dispositivo

Render real de jardín y parque (expo-gl), fundido al cambiar de lugar,
sombras que siguen a la mascota, capas del World Inspector, audio ambiente por
lugar, FPS con 10/25/50 objetos. Todo compila (`tsc`, `eslint`) y la escena
3D pasa la prueba de humo sin GPU.
