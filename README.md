# Milo — mascota virtual con cerebro de spikes (Expo)

App iOS/Android (Expo SDK 57, React Native, TypeScript strict, Expo Router) migrada del prototipo web `tamagotchi-snn` con los diseños de Stitch.

La mascota decide con una **red neuronal de spikes (LIF)**: 21 sensores → 12 circuitos → 22 acciones. Ningún botón ni minijuego controla a la mascota: solo cambian su mundo.

```bash
npm install
npx expo start          # Expo Go o development build
npm test                # tests del core (sin Expo)
npm run validate:brain  # validación de la SNN (miles de ticks)
npm run typecheck
npx expo lint
```

## Estructura

```
src/core/       dominio puro (SNN, simulación, memoria, juegos, persistencia) — sin React/Expo/Three
src/render3d/   Three.js sin React (mascota procedural, animador, escena)
src/services/   adaptadores Expo (SessionController, almacenamiento, audio, hápticos, capturas)
src/state/      stores pequeños (useSyncExternalStore)
src/theme/      tokens del design system de Stitch
src/components/ UI (design system, escena, juegos, cerebro, recuerdos)
src/app/        rutas de Expo Router
```

Documentación: `docs/mobile-migration-plan.md` (arquitectura y decisiones) y `docs/implementation-status.md` (estado y verificación).

Herramientas de investigación (solo desarrollo): Ajustes → *Herramientas de desarrollo* (velocidad, pausa, paso, forzar sensor, crear objetos, estado, exportar/importar save) y Brain View → *Red Neuronal SNN*.
