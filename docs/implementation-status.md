# Estado de implementación — primera entrega

Complementa `docs/mobile-migration-plan.md`.

## Verificación automática (ejecutada)

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` (strict) | 0 errores |
| `npx expo lint` | 0 problemas |
| `npm test` (Jest, sin Expo) | 131/131 tests, 10 suites |
| `npm run validate:brain` | miles de ticks × 11 escenarios × 4 genomas: sin NaN, potenciales acotados, 22/22 acciones alcanzables, pesos serializables |
| `npx expo export --platform ios --platform android` | ambos bundles Hermes compilan |
| `npx expo-doctor` | 21/21 |

**No verificado por mí en dispositivo**: render real de expo-gl, gestos, hápticos, audio y rendimiento. Ver “Pendiente de probar en dispositivo”.

## Definición de terminado (brief)

| # | Requisito | Estado |
|---|---|---|
| 1 | Abrir en iOS/Android | Bundles compilan; falta prueba en dispositivo |
| 2–4 | Onboarding, elegir mascota (4 especies 3D), nombrarla | `src/app/onboarding/*` |
| 5–6 | Home con mascota 3D | `src/app/(tabs)/index.tsx` + `PetScene` |
| 7 | Tocar / acariciar / arrastrar / lanzar / pinch / órbita | `PetCanvas` (gesture-handler → mundo) |
| 8–9 | SNN real y acciones espontáneas | `TickEngine` 3 ticks/s → `GameSession.tick()` |
| 10 | Colocar objetos | Mochila (hoja y pestaña), chips del escenario |
| 11 | Persistencia al cerrar/reabrir | `SaveGameStore` + autosave + AppState |
| 12 | 4 minijuegos MVP | Trae la pelota, Caja misteriosa, ¿Cuál prefieres?, Ven aquí |
| 13 | Recuerdos básicos | primeras veces, juegos, descubrimientos, capturas |
| 14 | Preferencias | `PetMemory` + Diario de preferencias |
| 15 | Brain View | simple (cadena causal real) + técnico (estado real de la red) |
| 16 | Pause/Step en desarrollo | Brain View técnico y `/dev` |

## Decisiones tomadas durante la implementación

1. **Sensor `playerCalling` (genoma v3)**: “Ven aquí” y “Llamar” necesitaban un estímulo PLAYER_CALL. Se añadió al final de la capa de sensores sin tocar ningún peso existente (test `brain.test.ts`). Una llamada de intensidad 1 produce ~2 spikes del sensor; la voz baja (0.7) solo suma si ya hay otras entradas.
2. **El jugador “está” delante de la pantalla** (`playerHome` y = 0.98) mientras la app está activa; al ir a background sale del mundo y al volver entra (evento real `PLAYER_ENTERED` → la red puede saludar).
3. **Explicaciones con suma temporal**: la primera versión del Brain View solo miraba el tick del disparo; la validación mostró que el miedo disparaba por **suma temporal** (el ruido llegó un tick antes, bajo umbral). `SpikeTrace.contributions()` ahora recupera todas las entradas desde el último reset con el factor de fuga λᵏ.
4. **“Aprendizaje asociativo” (Stitch)** se muestra como “Te trajo la pelota” / “huellas”: no hay plasticidad todavía y la UI no debe insinuar aprendizaje sináptico que no existe. La interfaz `PlasticityRule` está preparada (`src/core/learning/Plasticity.ts`).
5. **Porcentajes “SNN: Curiosidad X% > Cautela Y%”** = fracción de ticks recientes en que disparó cada circuito (dato real), no una escala inventada.
6. **Typed routes desactivado**: el generador de tipos de rutas del dev server produjo en este equipo Windows rutas inválidas (incluía `src/core/**` como rutas y no colapsaba `index`). Se desactivó `experiments.typedRoutes`; las rutas siguen siendo las mismas.
7. **Paleta del escenario 3D**: el prototipo usaba un estudio azul; se cambió a tonos cálidos de Stitch (solo colores, misma geometría).
8. **Pantallas sin diseño Stitch** (elegir mascota, nombre, Mochila, Ajustes, “Mientras no estabas”, Laboratorio): construidas solo con los tokens y componentes extraídos de Stitch.

## Incompatibilidades reales encontradas (y capa adaptada)

| Problema | Solución (solo en `render3d/Studio.ts`) |
|---|---|
| three ≥ r163 lanza “WebGL 1 is not supported” si `context instanceof WebGLRenderingContext`; expo-gl hace que sus contextos **WebGL2** hereden de esa clase | si `gl.supportsWebGL2`, se oculta el global solo durante el constructor síncrono del renderer; en WebGL1 real se muestra la ilustración de respaldo |
| `PCFSoftShadowMap` eliminado en r18x | `PCFShadowMap` |
| Sin `<canvas>` 2D en RN (texturas de ruido, sprites de texto) | `DataTexture` con los mismos algoritmos; símbolos FX como mallas 3D |
| expo-gl no implementa `renderbufferStorageMultisample`, `fenceSync`… | no se usan render targets MSAA ni lecturas asíncronas; PMREM desactivado por defecto |

## Pendiente de probar en dispositivo

- Rendimiento del pelaje por capas en Android de gama baja (ajuste “Pelaje detallado”).
- `GLView.takeSnapshotAsync` para capturas de recuerdos.
- Sensación de los gestos (umbral de pan 6 px, factor de lanzamiento 0.35).
- Audio con el interruptor de silencio de iOS (`playsInSilentMode: false`).

## Siguientes pasos

- Fase 8: implementar los 8 juegos restantes sobre `MiniGame` (catálogo en `src/core/games/catalog.ts`).
- Música de fondo (la categoría `music` del `AudioManager` está lista, sin pista).
- Plasticidad: implementar una `PlasticityRule` (p. ej. Hebb con recompensa por caricias) con tests deterministas.
