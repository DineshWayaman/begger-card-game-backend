export interface Card {
    suit: string | null;
    rank: string | null;
    isJoker: boolean;
    isDetails: boolean;
    assignedRank: string | null; // Joker Update: Store assigned rank
    assignedSuit: string | null; // Joker Update: Store assigned suit
  }