# Milo — mascota virtual con cerebro de spikes (Expo)

App iOS/Android (Expo SDK 57, React Native, TypeScript strict, Expo Router) migrada del prototipo web `tamagotchi-snn` con los diseños de Stitch.

La mascota decide con una **red neuronal de spikes (LIF)**: sensores (incluida la hora, la luz y el lugar como contexto) → circuitos → 22 acciones. Ningún botón ni minijuego controla a la mascota: solo cambian su mundo.

```bash
npm install
npx expo start          # Expo Go o development build
npm test                # tests del core (sin Expo)
npm run validate:brain  # validación de la SNN (miles de ticks)
npm run test:learning   # aprendizaje: unidad, vertical slices, 100k ticks
npm run report:learning # experimento pelota vs peluche y llamada (cifras del informe)
npm run test:routines   # rutinas: reloj, detector, experimentos de 30 días
npm run report:routines # sueño A/B, regreso, deriva, interrupción (cifras del informe)
npm run test:growth     # crecimiento: cerebro/memoria/hábitos se conservan, offline, Milo vs Luna
npm run report:growth   # etapas de vida (cifras del informe)
npm run test:environments   # escenarios GLB: carga, presupuesto, navegación, percepción, día/noche, offline
npm run report:environments # métricas de escenarios (cifras del informe)
npm run inspect:glb <dir>   # inspector de GLB (tri, draw calls, materiales, texturas, caja)
npm run test:world      # mundo vivo: percepción, novedad, caja misteriosa, lugares, offline
npm run report:world    # mundo vivo (cifras del informe → docs/living-world-report.txt)
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

**La mascota aprende**: las experiencias modifican pesos sinápticos reales (Hebb modulado por recompensa con trazas de elegibilidad), que se guardan con la partida. Diseño en `docs/learning-system.md`; resultados medidos en `docs/learning-results.md` (`npm run report:learning`).

**Rutinas emergentes**: la hora del mundo (WorldClock) y la luz son solo contexto sensorial; los hábitos ("suele dormirse por la noche") son una interpretación de episodios reales, nunca una orden. Diseño en `docs/emergent-routines.md`; resultados y limitaciones medidas en `docs/routine-results.md`.

**Crecimiento**: Bebé → Cachorro/Gatito → Joven → Adulto. La misma mascota con el mismo cerebro: crecer exige edad Y experiencias vividas (sin XP), modula plasticidad, cuerpo y capacidades, y nunca reinicia pesos ni borra recuerdos. Diseño en `docs/pet-growth.md`; resultados en `docs/growth-results.md`.

**Mundo vivo**: 🏠 habitación, 🌿 jardín y 🌳 parque (bosque y playa preparados). Cada lugar y objeto produce estímulos; la mascota percibe con campo de visión, oído y memoria de exposición (novedad ≠ familiaridad), sin omnisciencia; la atención y la navegación resuelven sobre qué actuar y cómo llegar; el miedo también se aprende (y se extingue). La caja misteriosa demuestra la cadena completa: mundo → percepción → SNN → conducta → experiencia → memoria → plasticidad → conducta futura distinta. Diseño en `docs/living-world.md`; resultados en `docs/living-world-results.md`.

**Escenarios 2.0**: casa, jardín y parque con modelos reales CC0 (Quaternius y Kenney, sin texturas, 620 KB) sobre una capa semántica del dominio: huellas físicas, navegación por rejilla, colisión, puertas y lámparas vinculadas al mundo, y luz sincronizada con el sensor. Assets y licencias en `docs/environment-assets.md`; resultados en `docs/environment-results.md`.

Herramientas de investigación (solo desarrollo): Ajustes → *Herramientas de desarrollo* (velocidad, pausa, paso, forzar sensor, crear objetos, estado, exportar/importar save, **World Inspector**: FOV, oído, atención, navegación, sensor debug, rendimiento) y Brain View → *Red Neuronal SNN*.
