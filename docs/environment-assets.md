# Assets de escenarios: procedencia y licencias

Todo lo que está en `assets/environments/` es **CC0 1.0** (dominio público). Se puede usar comercialmente y no exige atribución. Aun así se acredita a los autores en Ajustes → Créditos. Las licencias se verificaron el 29-09-2026 en la fuente original, no en agregadores.

## Arcadium: evaluado y descartado

La petición original pedía assets de **Arcadium** (arcadium3d.com). Al investigarlo:

- **No es una tienda de assets.** Es un editor web de interiores y planos, con una biblioteca de más de 10 000 muebles que solo se usan **dentro** del editor.
- **Sus términos** (https://arcadium3d.com/terms, 29-09-2026) dicen:
  - «We and our affiliates own all rights, title, and interest in and to the Services»;
  - prohíben «Modify, copy, lease, sell or distribute any of our Services»;
  - prohíben «Automatically or programmatically extract data or Output».
- No hay ninguna licencia que permita exportar sus modelos y usarlos en otro producto.

**Conclusión:** su licencia **no permite** usarlo en este juego. Se descartó. El usuario eligió como alternativa **Quaternius + Kenney** (CC0 verificable).

## Candidatos evaluados (medidos con `scripts/inspect-glb.mjs`)

| Pack | Autor | Licencia | Modelos | Tamaño | Texturas | Decisión |
|---|---|---|---|---|---|---|
| Ultimate House Interior Pack | Quaternius | CC0 1.0 | 82 GLB | 1.59 MB total, ~500 tri/modelo | **ninguna** (colores planos) | ✅ **CASA** |
| Furniture Pack | Quaternius | CC0 1.0 | 19 GLB | 2.75 MB, 500–2 200 tri | ninguna | ❌ duplica el anterior, con modelos más pesados |
| Stylized Nature MegaKit (2024) | Quaternius | CC0 1.0 | 68 GLB | **85 MB**, árboles de hasta 10 000 tri | 2–3 × 1024² **incrustadas en cada modelo** | ❌ pesado para móvil y con texturas (ver abajo) |
| Ultimate Stylized Nature Pack | Quaternius | CC0 1.0 | 12 GLB | 24 MB, hasta 32 000 tri | 1024–2048² | ❌ mismo motivo |
| Nature Kit 2.1 | Kenney | CC0 1.0 | 329 GLB | **2.89 MB** total, 2–200 tri/modelo | **ninguna** (colores planos) | ✅ **JARDÍN y PARQUE** |

### Por qué no se usaron modelos con texturas

1. **Tamaño:** un pétalo de flor de 15 triángulos pesaba 520 KB por su textura incrustada.
2. **Stack:** en React Native con expo-gl, `GLTFLoader` necesita `Image`/`Blob` del DOM para decodificar texturas, y expo-gl no los proporciona. Habría que añadir un cargador de texturas específico.

Los packs de color plano evitan los dos problemas y **comparten estilo**: formas suaves, colores planos y aspecto de juguete. Por eso son **una sola dirección artística**, no una mezcla de estilos.

## Assets elegidos (solo los necesarios, sin copiar packs completos)

### CASA: Quaternius · Ultimate House Interior Pack

- **Fuente:** https://quaternius.com/packs/ultimatehomeinterior.html
- **Descarga por modelo:** https://poly.pizza/bundle/Ultimate-House-Interior-Pack-2SXnFbwFzm (cada modelo figura como «Licence: CC0 1.0»).
- **Licencia:** CC0 1.0. La FAQ de Quaternius dice: «can be used for free without the need for attribution in commercial, educational, and personal projects».
- **Formato original:** GLB (glTF 2.0), sin animaciones ni texturas. La escala se midió con el inspector: 1 unidad ≈ 0.48 m (una puerta mide 4.19 unidades).
- **Archivos:** `assets/environments/home/`, 17 modelos, **0.26 MB**, 6 519 triángulos.

| Asset | Tri | Tamaño (u) | Uso |
|---|---|---|---|
| couch_medium | 1 012 | 4.69 × 1.91 × 2.20 | sofá (obstáculo, zona tranquila) |
| fireplace | 360 | 3.25 × 2.56 × 1.16 | chimenea: luz cálida de noche |
| window_large + curtains_double | 372 + 320 | 1.83 × 1.70 / 3.47 × 4.34 | ventana semántica (WINDOW_ZONE) |
| door | 456 | 1.74 × 4.19 × 0.42 | puerta del jardín (vinculada a la salida `room>garden`, se abre y se cierra) |
| round_rug, rug | 128, 108 | alfombras | decorativo, transitable |
| houseplant_2 / _3 / _5, cactus | 316–652 | plantas | obstáculo pequeño; se mecen |
| shelf_small, drawer, night_stand | 132–404 | muebles de pared | obstáculo contra la pared |
| table_round_small, table_lamp, light_floor_2 | 244–744 | mesa y lámparas | la lámpara se enciende con la lámpara del dominio |

### JARDÍN y PARQUE: Kenney · Nature Kit 2.1

- **Fuente:** https://kenney.nl/assets/nature-kit (zip oficial `kenney_nature-kit.zip`).
- **Licencia:** CC0 1.0. Su `License.txt` dice: «This content is free to use in personal, educational and commercial projects», y acreditar «is not mandatory». La copia está en `assets/environments/outdoor/LICENSE-kenney-nature-kit.txt`.
- **Formato original:** GLB, sin animaciones ni texturas. 1 unidad = 1 baldosa.
- **Archivos:** `assets/environments/outdoor/`, 27 modelos, **0.25 MB**, 3 170 triángulos.

| Asset | Uso |
|---|---|
| tree_oak, tree_default, tree_fat, tree_small, tree_pineRoundA, tree_pineTallA | árboles (obstáculos) y fondo |
| plant_bush, plant_bushLarge, plant_bushDetailed | setos junto a la valla |
| flower_redA / yellowA / purpleA, grass, grass_large | macizo de flores y hierba (se mece) |
| fence_simple, fence_gate | valla del jardín; la verja es la salida `garden>park` |
| path_stone, path_stoneCircle | caminos |
| rock_largeA, rock_smallA, log, log_large, stump_round, mushroom_redGroup, pot_large | detalles explorables y decoración |
| lily_large, lily_small | nenúfares del estanque del parque |

## Audio ambiente

Las pistas `assets/audio/ambient-room.wav`, `ambient-garden.wav` y `ambient-park.wav`, y los sonidos del mundo (pájaro, hojas, viento…), son **síntesis propias** del repositorio (`scripts/generate-sounds.js`). No son de terceros ni tienen restricciones de licencia. Esta fase no añade audio externo.

## Pipeline

```
FUENTE (web oficial del autor)
  → DESCARGA (zip oficial / GLB por modelo)
  → VERIFICAR LICENCIA (página del autor + fichero de licencia)
  → INSPECCIONAR       node scripts/inspect-glb.mjs <carpeta>
  → SELECCIONAR solo lo necesario → assets/environments/<set>/
  → IMPORTAR (EnvironmentAssetRegistry)
  → METADATA SEMÁNTICA (src/core/world/EnvironmentLayouts.ts)
  → JUEGO
```

- **Originales intactos.** Los ajustes (pivote, escala, paleta, material) se hacen en tiempo de carga (`EnvironmentAssetManager` y `EnvironmentMaterials`).
- **Draco/Meshopt: no se usan.** Todos los modelos juntos pesan 0.5 MB y la descompresión costaría más de lo que ahorra (medido).
