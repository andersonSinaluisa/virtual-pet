# Escenarios 2.0: resultados

Las cifras salen de:

- `npm run report:environments` (`src/render3d/__tests__/environmentReport.test.ts`);
- `npm run inspect:glb <carpeta>` (inspector de GLB);
- los tests `src/render3d/__tests__/environments.test.ts` (24).

Métricas medidas en Node salvo que se indique otra cosa. **Los FPS reales no se han medido en un dispositivo** (ver §7).

## 1. Assets evaluados, elegidos y descartados

Detalle y licencias en `docs/environment-assets.md`.

| Fuente | Resultado |
|---|---|
| **Arcadium** (arcadium3d.com) | ❌ Es un editor de interiores, no una tienda. Sus términos prohíben copiar o distribuir su contenido y extraer su output, y no dan licencia de uso en otro producto. El usuario eligió la alternativa CC0 |
| Quaternius · Ultimate House Interior | ✅ CASA. 82 GLB, 1.59 MB, ~500 tri/modelo, **sin texturas** |
| Quaternius · Furniture Pack | ❌ Redundante y más pesado (500–2 200 tri) |
| Quaternius · Stylized Nature MegaKit | ❌ 85 MB. Texturas de 1024² **duplicadas en cada modelo** y árboles de 10 000 tri |
| Quaternius · Ultimate Stylized Nature | ❌ 24 MB, texturas de hasta 2048² |
| Kenney · Nature Kit 2.1 | ✅ JARDÍN y PARQUE. 329 GLB, 2.89 MB, 2–200 tri/modelo, **sin texturas** |

**Selección:** 44 modelos (17 de casa y 27 de exterior), **620 KB** en el repositorio.

## 2. Tamaño y contenido por escenario

| Lugar | GLB | Peso | Tri (plantillas) | Carga + parseo (Node) |
|---|---|---|---|---|
| HOME | 16 | 241 KB | 5 775 | 198 ms |
| GARDEN | 20 | 244 KB | 3 625 | 118 ms |
| PARK | 21 | 193 KB | 2 220 | 99 ms |

### Escena construida (solo el entorno, sin mascota ni objetos)

| Lugar | Calidad | Props | Mallas (≈ draw calls) | Fusionadas desde | Triángulos | Construir |
|---|---|---|---|---|---|---|
| HOME | low | 16 | **31** | 28 | 6 439 | 281 ms¹ |
| HOME | medium/high | 16 | 39 | 13 | 6 439 | 93–101 ms |
| GARDEN | low | 20 | **30** | 64 | 5 053 | 185 ms¹ |
| GARDEN | medium/high | 26 | 45 | 50 | 6 029 | 100–150 ms |
| PARK | low | 27 | **30** | 50 | 4 550 | 231 ms¹ |
| PARK | medium/high | 34 | 43 | 42 | 5 658 | 118–167 ms |

¹ La primera construcción incluye el calentamiento del JIT.

- **Presupuesto** (verificado en test): ≤ 60 mallas y ≤ 12 000 triángulos de entorno. El margen es amplio: la mascota con pelaje pesa más que la casa.
- **Hoy medium = high:** ningún prop exige detalle 3; el nivel queda preparado. En **low** no hay plantas que se mezan ni luz de lámpara extra, y todo lo estático se fusiona.
- **Texturas del entorno: 0.** Todo es color de material, con una paleta común.

## 3. Optimizaciones

- **Solo lo necesario:** 44 de más de 400 modelos evaluados.
- **Sin texturas:** sin cargador de imágenes en React Native y sin memoria de textura del entorno.
- **Lotes estáticos:** lo que no se mueve se fusiona por material (`mergeGeometries`). En el jardín se pasa de 64 mallas a 30 en low.
- **Materiales cozy compartidos** por nombre de material: un material por color para ambos packs.
- **Clonado barato:** geometría y materiales compartidos con la plantilla. Solo tienen material propio los que cambian por instancia (lámparas y oclusores).
- **Descartado: Draco/Meshopt.** Los 44 GLB suman 0.5 MB, y descomprimir costaría CPU en móvil para ahorrar casi nada.
- **Carga sin pantalla de espera:**
  - el entorno procedural aparece al instante y el GLB lo sustituye al estar listo;
  - se precarga el lugar al arrancar y el lugar contiguo cuando la mascota se acerca a la salida;
  - al cambiar de lugar se liberan los assets que ya no hacen falta.
- **Respaldo:** si falla la carga, se queda el entorno procedural anterior y se registra el error (visible en el Environment Lab). La app no se cae.

## 4. Capa semántica y navegación

| Lugar | Sólidos (cajas) | Zonas | Salidas | Caminable (bebé / adulto) |
|---|---|---|---|---|
| HOME | 7 (4: sofá, chimenea, cómoda, mesilla) | 4 | 1 (puerta ↔ `room>garden`) | 80 % / 74 % |
| GARDEN | 5 (árbol, macizo, roca, tronco, tocón) | 3 | 2 (puerta de casa, verja) | 87 % / 83 % |
| PARK | 8 (3 árboles, tronco, roca, tocón, estanque, banco) | 4 | 1 | 85 % / 81 % |

**Navegación.** Se evaluó un NavMesh y se descartó: una rejilla de 10 cm por tamaño de cuerpo, con A* y suavizado por línea de visión, basta para estancias de 5–15 m.

- Cada lugar tiene **dos rejillas**, bebé (radio 0.19 m) y adulto (0.31 m), porque pasan por huecos distintos.

**60 destinos al azar por lugar y cuerpo:**

| Lugar | Bebé | Adulto | Ticks dentro de un sólido | Coste por tick de navegación |
|---|---|---|---|---|
| HOME | 58/60 | 58/60 | **0** | 0.29 / 0.50 ms |
| GARDEN | 60/60 | 59/60 | **0** | 0.88 / 0.69 ms |
| PARK | 60/60 | 59/60 | **0** | 1.86 / 1.56 ms |

- Los destinos no alcanzados están en **bolsillos más estrechos que el cuerpo** (por ejemplo, entre la cómoda y la planta de la esquina, un hueco de 0.43 m para un adulto de 0.62 m). La mascota va al punto alcanzable más cercano y se para: no se atasca ni atraviesa nada.
- **Puntos de interacción:** cama, comida, agua, ventana y puerta son alcanzables para el bebé y el adulto (test).
- **Colisión real:** la mascota se desliza a lo largo de los muebles sin superar su paso por tick. Una pelota lanzada rebota en el sofá. Los objetos no pueden quedar dentro de un mueble (al colocarlos, arrastrarlos, cargarlos o al aparecer ambientales).

## 5. Percepción, luz y offline

- **Percepción** (test): la pelota delante se ve, con distancia en metros correcta (±0.6 m) y ángulo correcto (±10°). A la espalda queda fuera del campo visual. Tiene novedad la primera vez.
- **Presupuesto de estímulos:** la decoración **no** es estímulo. `percepts` solo contiene `WorldObject`, así que 40 props no añaden nada a la SNN.
- **Día/noche** (24 h minuto a minuto, test):
  - salto máximo de brillo < 0.03 por minuto;
  - correlación brillo visual ↔ sensor `lightLevel` > 0.9 en HOME, GARDEN y PARK;
  - encender la lámpara de noche sube el sensor **y** la escena (tono cálido, luz puntual).
- **Offline** (6 h, test): en los tres lugares la mascota nunca acaba dentro de un mueble y solo hay objetos permitidos del lugar.

## 6. Problemas encontrados (y arreglos)

1. **Arcadium no se puede usar legalmente:** se descartó y se documentó (§1).
2. **La lámpara de pie tapaba el agua** en el primer layout: el agua se movió junto a la comida. Ahora un test comprueba que ningún sólido tapa spawn, salidas, ventana, zonas ni muebles del dominio.
3. **Objetivos de exploración inalcanzables:** un punto al azar pegado a la mesilla dejaba a la mascota intentando llegar para siempre, y en la «Prueba C» dejó de acercarse a la caja. Los objetivos ahora se proyectan a espacio alcanzable.
4. **Rodeo de un solo obstáculo insuficiente:** el adulto se atascaba en bolsillos y rincones (3 de 40 destinos). Se sustituyó por la rejilla de navegación.
5. **Empujón de colisión mayor que el paso:** incumplía «nunca se teletransporta». El deslizamiento ahora está limitado al paso del tick.
6. **Evaluaciones que dependían de la hora real de la máquina:** `evaluatePreference` clonaba sin reloj. Ahora se evalúa siempre a mediodía.
7. **Efectos de conducta sensibles al nuevo espacio:**
   - La «Prueba C» (miedo aprendido a la caja) necesita **25 ensayos** en vez de 15, porque en la casa amueblada visita menos la caja. Con 15: Δ 0.073; con 25: Δ 0.133. Con 25 se cumplen también «se acerca menos» y «más miedo en la escena compartida».
   - Milo/Luna: las **vías aprendidas** se conservan (Milo, pelota +0.074 y atención +0.051; Luna, peluche +0.084). La preferencia **conductual** en la escena de prueba no se sostiene en la casa amueblada: 0.32 frente a 0.39, y 0.48 frente a 0.39 sin muebles, con los mismos cerebros. Se analizó y no es sistemática: los ensayos son casi idénticos y la diferencia se acumula caóticamente. El test exige ahora la diferencia en el cerebro.
   - Rutinas: la selectividad noche/día aprendida ya no se sostiene (`docs/routine-results.md` §8); la diferencia en la vida real sí (5 de 5).

## 7. Lo que NO se ha podido verificar (honesto)

- **FPS, tiempo de frame y memoria de GPU en un dispositivo real:** este entorno no tiene móvil ni emulador. El **Environment Lab** (Ajustes → Herramientas de desarrollo) los mide en vivo junto con draw calls, triángulos, geometrías, texturas del renderer y el tiempo de carga del escenario. Es lo primero que hay que mirar en un dispositivo **LOW** (por ejemplo, un Android de gama baja) con cada lugar y calidad.
- **Prueba visual en retrato:** los perfiles de cámara (HOME cercana; GARDEN y PARK más altas y abiertas) y el fundido de oclusores y paredes están implementados. El encuadre final hay que validarlo en pantalla.
- **La selección automática de calidad** (§49 del encargo) no se hizo: faltan métricas del dispositivo. La calidad es manual (Ajustes) y el valor por defecto es *Medio*.

## 8. Arquitectura resultante

```
EnvironmentLayouts (dominio)   props · huellas físicas · semántica · vínculos · cámara · luz · spawns
        │  locationSolids / NavGrid / resolveCollision
        ▼
World · Navigation · Movement · Perception   (la SNN sigue decidiendo igual; el espacio es real)
        │
        ▼
render3d: EnvironmentAssetRegistry → EnvironmentAssetManager → EnvironmentMaterials
          → EnvironmentBuilder (casco + props + lotes + vínculos) → EnvironmentLighting → PetScene
```

**Preparado para el futuro:** un bosque, una playa o la nieve serán un `EnvironmentLayout` más en `ENVIRONMENT_LAYOUTS` (y sus assets en el registro). El parque ya declara 4 puntos de aparición y zonas amplias para lo social, con una sola mascota por ahora.
