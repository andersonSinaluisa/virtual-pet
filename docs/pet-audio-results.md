# Voz de las mascotas — resultados

## Qué hay

- **135 assets reales** procesados (mono 24 kHz, 16-bit WAV, ~11 MB) a partir de **74 grabaciones** (79 registradas) con licencia verificada en la página de cada sonido: 70 CC0 y 4 CC-BY 4.0 (tres de Yle Archives para el oso y un bostezo de gato). Procedencia, autor, URL, licencia, archivo original y uso de cada asset: [`audio-licenses.md`](audio-licenses.md). Cobertura por especie e intención: [`pet-audio-matrix.md`](pet-audio-matrix.md).
- Ningún sonido sintetizado, TTS, voz humana, imitación ni audio de YouTube/TikTok. Los tres "pitidos" sintetizados que hacían de voz (`pet-happy`, `pet-bark`, `pet-whimper`) se eliminaron.

## Arquitectura

```
SNN → acciones (onsets) · estado · contexto (caricia, vuelves, ruido, caja…)
  → VocalizationSystem (core)            intención + intensidad; silencio válido
  → SpeciesVocalizationProfile (core)     probabilidad · cooldown · volumen · capas
  → personalidad (solo frecuencia/intensidad) × PetVoiceProfile (voz propia, guardada)
  → SoundVariantSelector (core)           ponderado + penalización del historial
  → GameSession emite 'vocalization' / 'audioLayers'
  → PetVoiceBridge (services)             → PetAudioManager (one-shots, precarga, LRU)
                                          → Purr/Pant/TeethPurr/SleepAudio (ContinuousLayer: fundidos, sin reinicios)
                                          → reacción breve en cara/cabeza (PetController)
  PetAnimator (contacto del pie / aterrizaje) → FoleySystem (superficie + peso de la especie)
  Mixer: master × VOCAL/FOLEY/AMBIENCE/UI/MUSIC, ducking del ambiente al vocalizar
```

- La SNN no se tocó y no reproduce archivos ni aprende de audio. Se registra intención → contexto → respuesta (`session.vocal.log`) solo para depurar.
- Offline no se genera audio (solo `offlineTally`): al volver no suena nada de lo que "dijo".
- La voz puede emitirse como estímulo `voice` del mundo (`vocal.config.emitWorldStimulus`, desactivado: la mascota no se asusta de sí misma). Audio ≠ estímulo.
- Save **v6**: `audio.voice` (tono 0.95–1.05, volumen 0.85–1, frecuencia 0.8–1.2, variantes favoritas) se genera una vez y se guarda. Ajustes: volumen general, voz de la mascota, ambiente, música e interfaz (la migración reparte los volúmenes antiguos sin perder lo que el jugador eligió).
- Crecimiento: los gatitos (BABY/CHILD) tienen maullidos propios de un gatito real; además la etapa ajusta la voz muy poco (×1.08 bebé … ×0.97 adulto).
- Hápticos: hasta 5 pulsos suaves al empezar a ronronear (no una vibración continua).

## Ajuste (tuning) con la simulación de 30 min

Primera pasada (cooldowns cortos): perro **3.83/min**, gato **2.73/min** (27 bostezos en 30 min), oso **2.43/min**, conejo **0.87/min**; el oso repetía el mismo gorgoteo 6 veces seguidas entre intenciones. Cambios:

1. Cooldowns por intención más largos (saludo 25 s, atención 30–40 s, curiosidad 20–30 s, sueño 3–4 min) y techo por minuto (perro 6, gato 5, oso 4, conejo 3). El oso además bajó sus probabilidades (era el más "hablador": 2.67/min tras la primera ronda).
2. Las respuestas al JUGADOR (caricia, volver a casa, premio) solo respetan 0.9 s tras el último sonido y van antes que lo espontáneo: la caricia siempre tiene respuesta rápida, lo espontáneo espera.
3. Historial del selector compartido por especie (no por intención) y penalización ×0.02 para la última variante.
4. El cooldown de una intención corre aunque la mascota elija callar (si no, lo reintentaba cada tick).

Resultado final (abajo, sesión muy activa con juego constante): perro 2.2/min, gato 1.8, oso 2.1, conejo 0.6; 0 solapes, ≤1 repetición inmediata en 30 min, ningún minuto por encima del techo de su especie. En una sesión tranquila (sin lanzar la pelota cada 90 s) la cifra baja mucho: casi todo lo que dicen responde a algo que pasó.

## Pendiente / límites

- No hay panorama estéreo en expo-audio (SDK 57): la posición es solo atenuación por distancia (hasta −6 dB al fondo del lugar).
- Oso: no hay grabaciones CC0 de osezno ni ronquidos de oso con licencia apta (ver matriz, "Huecos").
- La escucha final en dispositivo (volúmenes relativos entre especies, que el bufido suave y el gruñido de juego no resulten agresivos) queda para una prueba en un móvil real; aquí se verificó con espectrogramas, niveles RMS/pico y tests.
- `npm run audio:fetch` usa `fetch` de Node; en el entorno de desarrollo en la nube el proxy devolvía 403 a Node para `cdn.freesound.org` (curl sí funcionaba). En un equipo normal descarga sin cuenta.

## Informe reproducible (`npm run report:audio`)

<!-- report:start -->

## 30 minutos por especie (mismo guion de jugador)

Guion: el jugador está presente, sale 40 s cada 5 min, acaricia 8 s cada 2 min (15 caricias), lanza la pelota cada 90 s, hace un ruido fuerte en los min 7 y 22 y trae la caja misteriosa en el min 10. Simulación completa (SNN, mundo, memoria) a 3 ticks/s.

| Especie | Vocalizaciones | por minuto | máx. en 1 min | silencios elegidos | bloqueadas (cooldown/techo) | repeticiones inmediatas | solapes < 400 ms | assets distintos | ronroneo/jadeo (s) | dormido (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| Perro | 65 | 2.17 | 6 | 77 | 1127 | 1 | 0 | 25 | 268 | 149 |
| Gato | 54 | 1.80 | 5 | 75 | 1140 | 0 | 0 | 27 | 208 | 149 |
| Oso | 63 | 2.10 | 4 | 52 | 1154 | 0 | 0 | 15 | 0 | 149 |
| Conejo | 19 | 0.63 | 3 | 58 | 1192 | 0 | 0 | 12 | 101 | 0 |

Por intención:

- **Perro**: CURIOUS 20 · GREETING 11 · PLAYFUL 10 · ATTENTION 8 · SLEEPY 6 · AFFECTION 4 · UNCOMFORTABLE 3 · RELAXED 2 · HAPPY 1
- **Gato**: CURIOUS 16 · GREETING 9 · AFFECTION 7 · ATTENTION 7 · HAPPY 6 · PLAYFUL 5 · SLEEPY 3 · UNCOMFORTABLE 1
- **Oso**: AFFECTION 15 · GREETING 11 · CURIOUS 9 · ATTENTION 9 · PLAYFUL 5 · RELAXED 4 · UNCOMFORTABLE 4 · HAPPY 3 · ALERT 1 · SCARED 1 · SLEEPY 1
- **Conejo**: CURIOUS 7 · PLAYFUL 5 · GREETING 4 · HAPPY 2 · SCARED 1

Primeros 10 minutos del perro (qué dijo y por qué):

- 0 s · GREETING · vuelves a casa → `dog_yipyip_01` (gain 0.61, rate 1.019)
- 13 s · PLAYFUL · juega → `dog_yipyip_03` (gain 0.61, rate 1.024)
- 24 s · PLAYFUL · juega → `dog_growl_play_02` (gain 0.59, rate 1.018)
- 50 s · CURIOUS · investiga ball → `dog_sniff_04` (gain 0.51, rate 1.012)
- 81 s · CURIOUS · investiga ball → `dog_sniff_02` (gain 0.51, rate 1.035)
- 101 s · SLEEPY · se va a dormir → `dog_sigh_01` (gain 0.42, rate 1.016)
- 140 s · AFFECTION · caricia → `dog_yip_02` (gain 0.41, rate 1.026)
- 144 s · GREETING · saluda → `dog_yipyip_01` (gain 0.65, rate 1.025)
- 154 s · CURIOUS · investiga → `dog_sniff_01` (gain 0.51, rate 1.032)
- 183 s · PLAYFUL · juega → `dog_growl_play_03` (gain 0.70, rate 1.013)
- 219 s · CURIOUS · investiga ball → `dog_sniff_03` (gain 0.51, rate 1.007)
- 247 s · UNCOMFORTABLE · llora → `dog_whimper_02` (gain 0.27, rate 1.007)
- 260 s · CURIOUS · investiga → `dog_sniff_04` (gain 0.51, rate 1.014)
- 384 s · GREETING · saluda → `dog_yip_01` (gain 0.65, rate 1.022)
- 395 s · PLAYFUL · juega → `dog_yip_05` (gain 0.70, rate 1.023)
- 479 s · SLEEPY · cansancio → `dog_sigh_03` (gain 0.44, rate 1.023)
- 489 s · RELAXED · descansa a gusto → `dog_sigh_02` (gain 0.39, rate 1.026)
- 494 s · ATTENTION · pide atención → `dog_whine_01` (gain 0.71, rate 1.015)

## Caricia (6 s): cuatro especies, cuatro respuestas

- **Perro**: one-shots: AFFECTION→`dog_yip_06`, PLAYFUL→`dog_yip_04`
  - capa por segundo: pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → pant 0.50 → · → · → · → · → ·
- **Gato**: one-shots: AFFECTION→`cat_trill_01`, PLAYFUL→`cat_trill_03`
  - capa por segundo: · → purr 0.19 → purr 0.37 → purr 0.56 → purr 0.75 → purr 0.75 → purr 0.75 → purr 0.75 → purr 0.26 → purr 0.26 → purr 0.26 → purr 0.26 → purr 0.26 → purr 0.26 → purr 0.26 → purr 0.26
- **Oso**: one-shots: AFFECTION→`bear_gurgle_02`, HAPPY→`bear_gurgle_01`
  - capa por segundo: · → · → · → · → · → · → · → · → · → · → · → · → · → · → · → ·
- **Conejo**: one-shots: (ninguno)
  - capa por segundo: · → · → · → · → · → · → · → · → · → · → · → · → · → · → · → ·

## Dos gatos (mismos sonidos, distinta personalidad; 20 min)

- **Sociable**: 42 vocalizaciones (2.10/min) · GREETING 12 · PLAYFUL 2 · AFFECTION 3 · HAPPY 4 · CURIOUS 10 · ATTENTION 7 · SLEEPY 4 · silencios 35
- **Reservado**: 29 vocalizaciones (1.45/min) · GREETING 7 · PLAYFUL 6 · AFFECTION 2 · HAPPY 2 · CURIOUS 7 · ATTENTION 4 · SLEEPY 1 · silencios 53

## 100 GREETING por especie (selector)

- **Perro**: 10 variantes · usadas 10 · la más usada 14/100 · repeticiones inmediatas 1
- **Gato**: 22 variantes · usadas 21 · la más usada 8/100 · repeticiones inmediatas 0
- **Oso**: 6 variantes · usadas 6 · la más usada 20/100 · repeticiones inmediatas 0
- **Conejo**: 5 variantes · usadas 5 · la más usada 21/100 · repeticiones inmediatas 1

<!-- report:end -->
