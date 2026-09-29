# Ajuste de la red: «a cada momento sale "Qué rica el agua fresquita"»

## Diagnóstico (medido en la app: 3 ticks/s, 1 hora real)

La red no tenía «obsesión» por el agua. La mascota **vivía sedienta y casi nunca conseguía beber**:

| | antes |
|---|---|
| Tiempo con DRINK activo | 35–44 % |
| Tiempo bebiendo de verdad | 0.3–3 % |
| Sed media | 0.66–0.95 |
| Inicios de DRINK | ~6 por minuto |
| Pensamiento «qué rica el agua fresquita» | 10–16 % del tiempo (también yendo al agua o con el bebedero vacío) |

Hubo cinco causas encadenadas:

1. **Sed demasiado rápida para la app:** 0.0025/tick a 3 ticks/s, así que de 0 a 1 en unos 2 minutos reales.
2. **La pelota secuestraba el camino:** el movimiento seguía a la acción disparada más recientemente, y la curiosidad dispara sin parar. Tardaba 75 ticks en recorrer 0.49 hasta el agua.
3. **EXPLORE sumaba un paseo aleatorio al trayecto** hacia el agua.
4. **Un spike suelto lanzaba 8 ticks de «ir al agua»,** aunque la neurona DRINK solo dispara cada 12–16 ticks con sed 0.9 (y cada 28 con sed 0.6). La conducta se encendía y se apagaba entre spikes.
5. **El pensamiento no miraba lo que pasaba:** decía «qué rica» con solo tener DRINK activo.

## Cambios

- **Genoma v7:** la sed y el hambre inhiben curiosidad y juego (como ya hacía el cansancio), y los circuitos de beber y comer inhiben INVESTIGATE, PICK_UP y PLAY. Las mascotas existentes reciben **solo** estas conexiones nuevas (`GENOME_ADDITIONS`); sus pesos aprendidos no se tocan.
- **Motivación por tasa de disparo** (`ActionSystem.drive`, ventana de ~20 ticks):
  - el cuerpo va hacia el destino de la acción que **más insiste**, no hacia la última;
  - quien va a algún sitio no deambula por el camino.
- **Histéresis en comer/beber:** empieza con tasa ≥ 1.6 (una necesidad real, no un spike suelto) y sigue mientras la tasa sea ≥ 0.6. Al saciarse la tasa baja y **se detiene sola**.
- **Sed en la app:** 0.0008/tick, unos 3 minutos entre ratos de beber. El perfil `day` de las simulaciones queda en valores absolutos y no cambia.
- **Pensamiento veraz:**
  - «Tengo sed… voy a por agua.»
  - «Mi bebedero está vacío… ¿me pones agua?»
  - «Qué rica el agua fresquita.» solo mientras bebe.
  - Lo mismo para la comida.

## Resultado (misma prueba, con un cuidador que rellena)

| | antes | después |
|---|---|---|
| Inicios de beber por minuto | 5.8–7.6 | **0.3** |
| Inicios de comer por minuto | 3.0–3.3 | **0.4** |
| Sed media | 0.66 | **0.45** |
| «Qué rica el agua fresquita» | 13.6 % | **0.8 %** (siempre bebiendo de verdad) |

Tests: `src/core/__tests__/needs.test.ts`. Comprueban:

- una hora real;
- con sed y la pelota al lado, llega al agua y bebe hasta saciarse;
- sin sed no bebe;
- la migración del genoma conserva lo aprendido.

Los otros 270 tests (aprendizaje, rutinas, crecimiento…) siguen pasando.
