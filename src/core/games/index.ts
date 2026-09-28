import type { GameId } from './catalog';
import { ChoiceGame, type ChoiceView } from './ChoiceGame';
import { ComeHereGame, type ComeHereView } from './ComeHereGame';
import { FetchGame, type FetchView } from './FetchGame';
import type { MiniGame } from './MiniGame';
import { MysteryBoxGame, type MysteryView } from './MysteryBoxGame';

export type AnyGameView = FetchView | MysteryView | ChoiceView | ComeHereView;
export type AnyMiniGame = MiniGame<AnyGameView>;

// Juegos con implementación. El resto del catálogo queda preparado (Fase 8).
export function createGame(id: GameId): AnyMiniGame | null {
  switch (id) {
    case 'fetch': return new FetchGame();
    case 'mystery-box': return new MysteryBoxGame();
    case 'choice': return new ChoiceGame();
    case 'come-here': return new ComeHereGame();
    default: return null;
  }
}

export type { ChoiceView, ComeHereView, FetchView, MysteryView };
