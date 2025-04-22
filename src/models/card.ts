export interface Card {
  suit: string | null;
  rank: string | null;
  isJoker: boolean;
  isDetails: boolean;
  assignedRank: string | null; // Assigned rank for Jokers
  assignedSuit: string | null; // Assigned suit for Jokers
}