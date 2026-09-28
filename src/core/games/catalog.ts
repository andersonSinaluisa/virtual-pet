/*
 * CATÁLOGO DE MINIJUEGOS
 * ----------------------
 * Los 12 juegos definidos en el diseño. Todos siguen el mismo principio:
 *
 *   JUGADOR → ESTÍMULO → MUNDO → SENSORES → SNN → ACCIÓN DE LA MASCOTA
 *
 * Un minijuego NUNCA controla a la mascota: solo cambia el mundo y observa.
 * `implemented: false` = pendiente (Fase 8); el hub lo muestra como "Próximamente".
 */
export const GAME_IDS = [
  'fetch', 'mystery-box', 'choice', 'come-here',
  'treasure-hunt', 'bubbles', 'hide-and-seek', 'circuit', 'dance', 'imitation', 'night-adventure', 'follow-steps',
] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameInfo {
  id: GameId;
  title: string;
  emoji: string;
  icon: string;
  tagline: string;
  description: string;
  short: string; // frase corta para niños (UI principal)
  skill: string; // lo que estimula (texto del diseño)
  cta: string;
  accent: 'primary' | 'secondary' | 'tertiary';
  implemented: boolean;
}

export const GAMES: readonly GameInfo[] = [
  {
    id: 'fetch', title: 'Trae la Pelota', emoji: '⚽', icon: 'ball', tagline: '¡Le encanta! ⚽',
    short: 'Lanza la pelota. ¿Irá {name} a buscarla?',
    description: 'Lanza la pelota acolchada y observa si {name} decide correr, mordisquearla o traértela corriendo con la colita en movimiento.',
    skill: 'Vínculo + Curiosidad', cta: 'Lanzar ahora', accent: 'primary', implemented: true,
  },
  {
    id: 'mystery-box', title: 'Caja Misteriosa', emoji: '📦', icon: 'box', tagline: 'En observación 📦',
    short: 'Apareció una caja. ¿Se atreverá a abrirla?',
    description: 'Apareció algo nuevo en la habitación… ¿se atreverá {name} a acercarse, o preferirá inspeccionarla dando pequeños pasos cautelosos?',
    skill: 'Estimulación sensorial', cta: 'Abrir caja', accent: 'secondary', implemented: true,
  },
  {
    id: 'choice', title: '¿Cuál prefieres?', emoji: '🧸', icon: 'interests', tagline: 'Descubrimiento 🧸',
    short: 'Pon 3 juguetes. ¿Cuál le gusta más?',
    description: 'Pon 3 objetos en el suelo y descubre qué despierta su interés natural hoy.',
    skill: 'Preferencias', cta: 'Elegir', accent: 'tertiary', implemented: true,
  },
  {
    id: 'come-here', title: 'Ven aquí', emoji: '👋', icon: 'wave', tagline: 'Aprendiendo juntos 👋',
    short: 'Llámalo. Si viene, ¡dale mimos!',
    description: 'Llámalo suavemente. Él decide si viene; cuando se acerque, puedes acariciarlo.',
    skill: 'Entrenamiento cariñoso', cta: 'Llamar a {name}', accent: 'primary', implemented: true,
  },
  { id: 'treasure-hunt', title: 'Búsqueda del tesoro', emoji: '🔎', icon: 'search', tagline: 'Nuevo', description: 'Esconde un premio bajo mantitas tibias para incentivar su olfato.', short: 'Esconde un premio bajo mantitas tibias para incentivar su olfato.', skill: 'Olfato', cta: 'Preparar pista', accent: 'primary', implemented: false },
  { id: 'bubbles', title: 'Burbujas al viento', emoji: '🫧', icon: 'bubbles', tagline: 'Nuevo', description: 'Sopla pompas brillantes para que las atrape en el aire.', short: 'Sopla pompas brillantes para que las atrape en el aire.', skill: 'Coordinación', cta: 'Probar ahora', accent: 'secondary', implemented: false },
  { id: 'hide-and-seek', title: 'Escondite', emoji: '🙈', icon: 'visibility', tagline: 'Pronto', description: 'Escóndete y deja que te encuentre.', short: 'Escóndete y deja que te encuentre.', skill: 'Vínculo', cta: 'Esconderme', accent: 'tertiary', implemented: false },
  { id: 'circuit', title: 'Circuito', emoji: '🏁', icon: 'route', tagline: 'Pronto', description: 'Un pequeño recorrido de obstáculos acolchados.', short: 'Un pequeño recorrido de obstáculos acolchados.', skill: 'Actividad', cta: 'Montar circuito', accent: 'secondary', implemented: false },
  { id: 'dance', title: 'Baile', emoji: '💃', icon: 'music', tagline: 'Pronto', description: 'Pon música y mira si se anima a bailar contigo.', short: 'Pon música y mira si se anima a bailar contigo.', skill: 'Alegría', cta: 'Poner música', accent: 'primary', implemented: false },
  { id: 'imitation', title: 'Imitación', emoji: '🪞', icon: 'sparkle', tagline: 'Pronto', description: 'Haz gestos y observa si los imita.', short: 'Haz gestos y observa si los imita.', skill: 'Atención', cta: 'Empezar', accent: 'tertiary', implemented: false },
  { id: 'night-adventure', title: 'Aventura nocturna', emoji: '🌙', icon: 'moon', tagline: 'Pronto', description: 'Apaga las luces y exploren juntos con una linterna.', short: 'Apaga las luces y exploren juntos con una linterna.', skill: 'Valentía', cta: 'Apagar luces', accent: 'tertiary', implemented: false },
  { id: 'follow-steps', title: 'Sigue mis pasos', emoji: '🐾', icon: 'paw', tagline: 'Pronto', description: 'Camina por la habitación y mira si te sigue.', short: 'Camina por la habitación y mira si te sigue.', skill: 'Seguimiento', cta: 'Caminar', accent: 'secondary', implemented: false },
];

export function gameInfo(id: GameId): GameInfo {
  const g = GAMES.find((x) => x.id === id);
  if (!g) throw new Error(`Juego desconocido: ${id}`);
  return g;
}

export function isGameId(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
}
