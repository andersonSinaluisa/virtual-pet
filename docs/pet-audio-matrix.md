# Matriz de audio de mascotas (cobertura real)

> Generado por `npm run report:audio` desde el manifest (`src/core/audio/petAudioAssets.generated.ts`). Solo aparece lo que EXISTE en `assets/audio/pets/`.
> **p** = probabilidad de vocalizar cuando surge la intención (el resto es silencio) · **cd** = cooldown de esa intención · — = la especie calla (silencio válido).

## Perro (`dog`) — cooldown global 2 s · máx. 6/min

| Intención | p | cd | Variantes | Assets | Fuentes (licencia) |
|---|---|---|---|---|---|
| GREETING | 0.85 | 25 s | 10 | `dog_yip_01` `dog_yip_02` `dog_yip_03` `dog_yip_04` `dog_yip_05` `dog_yip_06` `dog_yip_07` `dog_yipyip_01` `dog_yipyip_02` `dog_yipyip_03` | MisterTood (CC0-1.0) |
| ATTENTION | 0.7 | 30 s | 5 | `dog_whine_01` `dog_whine_02` `dog_whine_03` `dog_whine_04` `dog_whine_05` | jedg (CC0-1.0); qubodup (CC0-1.0) |
| HAPPY | 0.45 | 7 s | 7 | `dog_yip_01` `dog_yip_02` `dog_yip_03` `dog_yip_04` `dog_yip_05` `dog_yip_06` `dog_yip_07` | MisterTood (CC0-1.0) |
| EXCITED | 0.8 | 5 s | 12 | `dog_yip_01` `dog_yip_02` `dog_yip_03` `dog_yip_04` `dog_yip_05` `dog_yip_06` `dog_yip_07` `dog_yipyip_01` `dog_yipyip_02` `dog_yipyip_03` `dog_bark_01` `dog_bark_02` | MisterTood (CC0-1.0) |
| AFFECTION | 0.4 | 12 s | 7 | `dog_yip_01` `dog_yip_02` `dog_yip_03` `dog_yip_04` `dog_yip_05` `dog_yip_06` `dog_yip_07` | MisterTood (CC0-1.0) |
| RELAXED | 0.5 | 60 s | 3 | `dog_sigh_01` `dog_sigh_02` `dog_sigh_03` | felix.blume (CC0-1.0) |
| CURIOUS | 0.45 | 20 s | 4 | `dog_sniff_01` `dog_sniff_02` `dog_sniff_03` `dog_sniff_04` | felix.blume (CC0-1.0) |
| PLAYFUL | 0.55 | 4.5 s | 13 | `dog_yip_01` `dog_yip_02` `dog_yip_03` `dog_yip_04` `dog_yip_05` `dog_yip_06` `dog_yip_07` `dog_yipyip_01` `dog_yipyip_02` `dog_yipyip_03` `dog_growl_play_01` `dog_growl_play_02` `dog_growl_play_03` | MisterTood (CC0-1.0); Mystikuum (CC0-1.0) |
| SCARED | 0.6 | 12 s | 2 | `dog_whimper_01` `dog_whimper_02` | jedg (CC0-1.0) |
| ALERT | 0.35 | 15 s | 2 | `dog_bark_01` `dog_bark_02` | MisterTood (CC0-1.0) |
| UNCOMFORTABLE | 0.5 | 15 s | 3 | `dog_whimper_01` `dog_whimper_02` `dog_whimper_03` | jedg (CC0-1.0) |
| SLEEPY | 0.5 | 180 s | 3 | `dog_sigh_01` `dog_sigh_02` `dog_sigh_03` | felix.blume (CC0-1.0) |

Capas continuas:

- **pant**: `dog_pant_loop` (8.0 s) · entra 900 ms · sale 1800 ms · nivel máx. 0.5
- **sleep**: `dog_sleep_loop` (20.0 s) · entra 4000 ms · sale 2500 ms · nivel máx. 0.55

## Gato (`cat`) — cooldown global 2.5 s · máx. 5/min

| Intención | p | cd | Variantes | Assets | Fuentes (licencia) |
|---|---|---|---|---|---|
| GREETING | 0.6 | 25 s | 22 | `cat_meow_short_01` `cat_meow_short_02` `cat_meow_short_03` `cat_meow_short_04` `cat_meow_short_05` `cat_meow_short_06` `cat_meow_short_07` `cat_meow_short_08` `cat_meow_soft_01` `cat_meow_soft_02` `cat_kitten_01` `cat_kitten_02` `cat_kitten_03` `cat_kitten_04` `cat_trill_01` `cat_trill_02` `cat_trill_03` `cat_trill_04` `cat_trill_05` `cat_trill_06` `cat_trill_07` `cat_trill_08` | Benjamin Burnes (abstractionmusic) (CC0-1.0); Mafon2 (CC0-1.0); steffcaffrey (CC0-1.0); lolamadeus (CC0-1.0); jsbarrett (CC0-1.0) |
| ATTENTION | 0.7 | 40 s | 14 | `cat_meow_01` `cat_meow_02` `cat_meow_03` `cat_meow_04` `cat_meow_05` `cat_meow_06` `cat_meow_07` `cat_meow_08` `cat_meow_09` `cat_meow_soft_02` `cat_kitten_01` `cat_kitten_02` `cat_kitten_03` `cat_kitten_04` | Benjamin Burnes (abstractionmusic) (CC0-1.0); steffcaffrey (CC0-1.0); lolamadeus (CC0-1.0) |
| HAPPY | 0.35 | 10 s | 20 | `cat_meow_short_01` `cat_meow_short_02` `cat_meow_short_03` `cat_meow_short_04` `cat_meow_short_05` `cat_meow_short_06` `cat_meow_short_07` `cat_meow_short_08` `cat_kitten_01` `cat_kitten_02` `cat_kitten_03` `cat_kitten_04` `cat_trill_01` `cat_trill_02` `cat_trill_03` `cat_trill_04` `cat_trill_05` `cat_trill_06` `cat_trill_07` `cat_whirr_01` | Benjamin Burnes (abstractionmusic) (CC0-1.0); lolamadeus (CC0-1.0); jsbarrett (CC0-1.0); steffcaffrey (CC0-1.0) |
| EXCITED | 0.5 | 8 s | 1 | `cat_whirr_01` | steffcaffrey (CC0-1.0) |
| AFFECTION | 0.25 | 20 s | 7 | `cat_meow_soft_01` `cat_trill_01` `cat_trill_02` `cat_trill_03` `cat_trill_04` `cat_trill_05` `cat_trill_08` | Mafon2 (CC0-1.0); jsbarrett (CC0-1.0); steffcaffrey (CC0-1.0) |
| RELAXED | 0 | 60 s | — (silencio) |  |  |
| CURIOUS | 0.4 | 25 s | 5 | `cat_chirp_01` `cat_chirp_02` `cat_sniff_01` `cat_sniff_02` `cat_sniff_03` | dreamstobecome (CC0-1.0); 14FPanskaZummer_Jakub (CC0-1.0); Sadiquecat (CC0-1.0) |
| PLAYFUL | 0.35 | 8 s | 8 | `cat_trill_01` `cat_trill_02` `cat_trill_03` `cat_trill_04` `cat_trill_05` `cat_whirr_01` `cat_chirp_01` `cat_chirp_02` | jsbarrett (CC0-1.0); steffcaffrey (CC0-1.0); dreamstobecome (CC0-1.0) |
| SCARED | 0.35 | 20 s | 1 | `cat_hiss_soft_01` | patchytherat (CC0-1.0) |
| ALERT | 0.25 | 15 s | 1 | `cat_chirp_01` | dreamstobecome (CC0-1.0) |
| UNCOMFORTABLE | 0.2 | 20 s | 2 | `cat_meow_02` `cat_meow_soft_01` | Benjamin Burnes (abstractionmusic) (CC0-1.0); Mafon2 (CC0-1.0) |
| SLEEPY | 0.5 | 240 s | 1 | `cat_yawn_01` | designerschoice (CC-BY-4.0) |

Capas continuas:

- **purr**: `cat_purr_loop_01` (24.0 s), `cat_purr_loop_02` (20.0 s) · entra 2500 ms · sale 3500 ms · nivel máx. 0.75
- **sleep**: `cat_sleep_loop` (24.0 s) · entra 4000 ms · sale 2500 ms · nivel máx. 0.55

Assets por etapa: `cat_meow_short_01` → CHILD/YOUNG/ADULT, `cat_meow_short_02` → CHILD/YOUNG/ADULT, `cat_meow_short_03` → CHILD/YOUNG/ADULT, `cat_meow_short_04` → CHILD/YOUNG/ADULT, `cat_meow_short_05` → CHILD/YOUNG/ADULT, `cat_meow_short_06` → CHILD/YOUNG/ADULT, `cat_meow_short_07` → CHILD/YOUNG/ADULT, `cat_meow_short_08` → CHILD/YOUNG/ADULT, `cat_meow_01` → CHILD/YOUNG/ADULT, `cat_meow_02` → CHILD/YOUNG/ADULT, `cat_meow_03` → CHILD/YOUNG/ADULT, `cat_meow_04` → CHILD/YOUNG/ADULT, `cat_meow_05` → CHILD/YOUNG/ADULT, `cat_meow_06` → CHILD/YOUNG/ADULT, `cat_meow_07` → CHILD/YOUNG/ADULT, `cat_meow_08` → CHILD/YOUNG/ADULT, `cat_meow_09` → CHILD/YOUNG/ADULT, `cat_meow_soft_02` → YOUNG/ADULT, `cat_kitten_01` → BABY/CHILD, `cat_kitten_02` → BABY/CHILD, `cat_kitten_03` → BABY/CHILD, `cat_kitten_04` → BABY/CHILD

## Oso (`bear`) — cooldown global 3 s · máx. 4/min

| Intención | p | cd | Variantes | Assets | Fuentes (licencia) |
|---|---|---|---|---|---|
| GREETING | 0.6 | 25 s | 6 | `bear_gurgle_01` `bear_gurgle_02` `bear_gurgle_03` `bear_gurgle_04` `bear_gurgle_05` `bear_gurgle_06` | YleArkisto (CC-BY-4.0) |
| ATTENTION | 0.5 | 35 s | 4 | `bear_cub_call_01` `bear_cub_call_02` `bear_cub_call_03` `bear_cub_call_04` | YleArkisto (CC-BY-4.0) |
| HAPPY | 0.4 | 12 s | 6 | `bear_gurgle_01` `bear_gurgle_02` `bear_gurgle_03` `bear_gurgle_04` `bear_gurgle_05` `bear_gurgle_06` | YleArkisto (CC-BY-4.0) |
| EXCITED | 0.55 | 8 s | 4 | `bear_cub_call_01` `bear_cub_call_02` `bear_cub_call_03` `bear_cub_call_04` | YleArkisto (CC-BY-4.0) |
| AFFECTION | 0.8 | 12 s | 6 | `bear_gurgle_01` `bear_gurgle_02` `bear_gurgle_03` `bear_gurgle_04` `bear_gurgle_05` `bear_gurgle_06` | YleArkisto (CC-BY-4.0) |
| RELAXED | 0.35 | 60 s | 6 | `bear_gurgle_01` `bear_gurgle_02` `bear_gurgle_03` `bear_gurgle_04` `bear_gurgle_05` `bear_gurgle_06` | YleArkisto (CC-BY-4.0) |
| CURIOUS | 0.4 | 25 s | 4 | `bear_sniff_01` `bear_sniff_02` `bear_sniff_03` `bear_sniff_04` | YleArkisto (CC-BY-4.0) |
| PLAYFUL | 0.4 | 10 s | 6 | `bear_gurgle_01` `bear_gurgle_02` `bear_gurgle_03` `bear_gurgle_04` `bear_gurgle_05` `bear_gurgle_06` | YleArkisto (CC-BY-4.0) |
| SCARED | 0.4 | 15 s | 2 | `bear_whimper_01` `bear_whimper_02` | YleArkisto (CC-BY-4.0) |
| ALERT | 0.2 | 20 s | 2 | `bear_sniff_03` `bear_sniff_04` | YleArkisto (CC-BY-4.0) |
| UNCOMFORTABLE | 0.35 | 20 s | 2 | `bear_whimper_01` `bear_whimper_02` | YleArkisto (CC-BY-4.0) |
| SLEEPY | 0.3 | 180 s | 2 | `bear_gurgle_03` `bear_gurgle_06` | YleArkisto (CC-BY-4.0) |

Capas continuas:

- **sleep**: `bear_sleep_loop` (24.4 s) · entra 4000 ms · sale 2500 ms · nivel máx. 0.5

## Conejo (`rabbit`) — cooldown global 6 s · máx. 3/min

| Intención | p | cd | Variantes | Assets | Fuentes (licencia) |
|---|---|---|---|---|---|
| GREETING | 0.2 | 20 s | 5 | `rabbit_snuffle_01` `rabbit_snuffle_02` `rabbit_snuffle_03` `rabbit_snuffle_04` `rabbit_snuffle_05` | lucyve (CC0-1.0) |
| ATTENTION | — | — | — (silencio) |  |  |
| HAPPY | 0.25 | 15 s | 5 | `rabbit_honk_01` `rabbit_honk_02` `rabbit_honk_03` `rabbit_honk_04` `rabbit_honk_05` | kessir (CC0-1.0) |
| EXCITED | 0.35 | 12 s | 5 | `rabbit_honk_01` `rabbit_honk_02` `rabbit_honk_03` `rabbit_honk_04` `rabbit_honk_05` | kessir (CC0-1.0) |
| AFFECTION | — | — | — (silencio) |  |  |
| RELAXED | — | — | — (silencio) |  |  |
| CURIOUS | 0.3 | 30 s | 6 | `rabbit_snuffle_01` `rabbit_snuffle_02` `rabbit_snuffle_03` `rabbit_snuffle_04` `rabbit_snuffle_05` `rabbit_sneeze_01` | lucyve (CC0-1.0) |
| PLAYFUL | 0.3 | 20 s | 5 | `rabbit_honk_01` `rabbit_honk_02` `rabbit_honk_03` `rabbit_honk_04` `rabbit_honk_05` | kessir (CC0-1.0) |
| SCARED | 0.45 | 15 s | 2 | `rabbit_thump_01` `rabbit_thump_02` | kessir (CC0-1.0) |
| ALERT | 0.4 | 15 s | 2 | `rabbit_thump_01` `rabbit_thump_02` | kessir (CC0-1.0) |
| UNCOMFORTABLE | — | — | — (silencio) |  |  |
| SLEEPY | — | — | — (silencio) |  |  |

Capas continuas:

- **teethPurr**: `rabbit_purr_loop_01` (12.0 s), `rabbit_purr_loop_02` (12.0 s) · entra 2000 ms · sale 2500 ms · nivel máx. 0.35
- **sleep**: — (silencio: un conejo dormido no se oye) · entra 4000 ms · sale 2500 ms · nivel máx. 0

## Foley (todas las especies; ganancia y tono según el peso de la especie)

| Tipo | Variantes | Fuente |
|---|---|---|
| drink | 1 | Mystikuum |
| step_floor | 5 | Kenney (kenney.nl) |
| step_grass | 5 | Kenney (kenney.nl) |
| step_dirt | 5 | Kenney (kenney.nl) |
| land | 5 | Kenney (kenney.nl) |
| scratch | 3 | Benjamin Burnes (abstractionmusic) |
| body | 5 | Benjamin Burnes (abstractionmusic) |

## Huecos conocidos (no inventados)

- **Oso**: no existe grabación CC0 de osezno; se usan grabaciones reales CC-BY 4.0 de Yle Archives (1975) con el tono subido ×1.08–1.12. Para dormir se usa la respiración de un perro dormido con el tono bajado ×0.82 (documentado en `docs/audio-licenses.md`).
- **Perro**: no hay bostezo real con licencia apta; SLEEPY usa suspiros. Los ladridos son de un terrier pequeño (no hay aullidos ni gruñidos de ataque a propósito).
- **Gato**: no hay "chattering" (castañeteo a los pájaros) con licencia apta. El bufido es un recorte corto y bajo de una pelea real (solo para SCARED).
- **Conejo**: la mayor parte del tiempo es silencio a propósito; su "voz" son resoplidos, honks muy bajos, ronroneo dental y el golpe de pata.
- **Total**: 135 assets de 74 fuentes.
