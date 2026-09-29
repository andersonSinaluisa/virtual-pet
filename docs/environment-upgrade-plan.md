# Plan: escenarios 3D con assets reales

## Auditoría (estado de partida)

| Pieza | Dónde | Estado |
|---|---|---|
| Dominio del mundo | `core/simulation/World.ts`, `core/world/Locations.ts` | Cada ubicación es un suelo normalizado 0..1 con `size` en unidades de habitación (1 ≈ 5.2 m). Tiene límites, zonas, salidas y obstáculos **circulares** |
| Navegación | `core/world/Navigation.ts` | Rodeo de **un** obstáculo circular; sin colisión real (vagando podía atravesar un árbol) |
| Movimiento | `core/simulation/MovementSystem.ts` | Intenciones con prioridad por tasa de disparo; limita a los bordes |
| Percepción | `core/world/Perception.ts`, `Attention.ts` | FOV, distancia y luz; **solo los `WorldObject`** son estímulos |
| Microeventos | `core/world/AmbientEventDirector.ts` | Hojas, mariposas, pájaros, viento → objetos o sonidos del dominio |
| Render | `render3d/PetScene.ts`, `Environments.ts`, `Studio.ts` | Entornos de **primitivas** reconstruidos al cambiar de ubicación. `toX = (x-0.5)·5.2·size.w`, `toZ = (y-0.5)·3.8·size.h`. Una cámara con parámetros fijos |
| Carga de modelos | — | **No había**: sin GLTFLoader y sin `glb` en Metro |
| Persistencia | `WorldState` | Ubicación, alijo por ubicación, puertas. **Nada visual** (y así sigue) |

## Arquitectura

```
core/world/EnvironmentLayouts.ts   (DOMINIO, sin three)
  props: asset, posición normalizada, orientación, clase
         DECORATIVE | SEMANTIC | INTERACTIVE, huella física (círculo/caja),
         semántica (WINDOW, DOOR, LAMP, SOFA…), vínculos (salida, lámpara)
  → locationObstacles(loc): obstáculos de Locations + huellas de los props
  → Navigation (rodeo de círculos y cajas) + MovementSystem (colisión real)

render3d/  (REPRESENTACIÓN)
  EnvironmentAssetRegistry   id de asset → módulo, pack, metros por unidad
  EnvironmentAssetManager    precarga / caché / clonado / dispose; bytes inyectados
                             (RN: expo-asset + expo-file-system; tests: fs)
  EnvironmentMaterials       paleta cozy unificada por nombre de material (sin tocar el GLB)
  EnvironmentBuilder         casco (suelo/paredes) + props GLB; lotes estáticos por material
                             (menos draw calls); si falla → entorno procedural (fallback)
  EnvironmentLighting        perfiles HOME/GARDEN/PARK × día/atardecer/noche
                             (interpolación continua con el daylight del WorldClock)
  CameraProfiles             encuadre por ubicación (retrato)
  Occlusion                  desvanece lo que tapa a la mascota
```

**Regla:** el GLB **nunca** es el dominio. La cama, el plato, el agua, la tienda y los juguetes siguen siendo `WorldObject` (con sus props de mascota). El entorno aporta arquitectura, muebles, decoración y la **metadata** que el dominio usa para caminar, interactuar y percibir.

## Convenciones

- **Coordenadas del dominio:** x → derecha, y → hacia la pantalla (0 = fondo). Suelo normalizado 0..1.
- **three.js:** Y arriba; +Z hacia la cámara; origen en el centro del suelo; el suelo en y = 0. `toX/toZ` como arriba.
- **Unidades:** **1 unidad three ≈ 1 m** (la habitación mide 5.2 × 3.8 m). La mascota es estilizada: adulto ≈ 1.2 u, bebé ≈ 0.75 u.
- **Escala de props:** `metros_por_unidad_del_pack × PROP_SCALE (0.8)`. Es una casa «de juguete», un poco más pequeña que la real, para que la mascota protagonista destaque. Quaternius: 0.48 m/u. Kenney: 1.25 m/baldosa.
- **Pivote:** al cargar, cada modelo se recentra en su **base-centro** (el punto más bajo en y = 0, centrado en x/z), salvo excepciones declaradas en el registro (la puerta gira sobre su bisagra).
- **Orientación:** `rot` en grados alrededor de Y; 0 = el frente del modelo mira a +Z (a la cámara).

## Orden

1. **HOME 2.0 completo:** assets, escala, materiales, luz, día/noche, navegación, semántica, cámara, oclusión, rendimiento.
2. **GARDEN 2.0.**
3. **PARK 2.0:** varios puntos de aparición, preparado para lo social.
4. Integración offline, Environment Lab, pruebas y documentación (`docs/environment-results.md`).
