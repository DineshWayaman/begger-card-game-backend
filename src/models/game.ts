import { Player } from './player';
import { Card } from './card';

export interface Game {
  id: string;
  deck: Card[];
  players: Player[];
  pile: Card[][];
  currentTurn: number;
  status: 'waiting' | 'playing' | 'finished';
  isTestMode: boolean;
  passCount: number;
  lastPlayedPlayerId: string | null;
  currentPattern: 'single' | 'pair' | 'consecutive' | `group-${number}` | null;
}