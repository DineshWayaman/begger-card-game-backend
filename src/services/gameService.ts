import { Card } from "../models/card";
import { Game } from "../models/game";
import { Player } from "../models/player";


export class GameService {
  private games: { [key: string]: Game } = {};
  private jokerCounter = 0;

  createGame(id: string, isTestMode: boolean = false): Game {
    console.log(`Creating game ${id}, testMode: ${isTestMode}`);
    const game: Game = {
      id,
      players: [],
      pile: [],
      currentTurn: 0,
      status: 'waiting',
      isTestMode,
      passCount: 0,
      lastPlayedPlayerId: null,
      currentPattern: null, // CHANGE: Initialize pattern
     
    };
    this.games[id] = game;
    return game;
  }

  getGame(id: string): Game | null {
    return this.games[id] || null;
  }

  joinGame(gameId: string, playerId: string, playerName: string, isTestMode: boolean = false): Game | null {
    console.log(`Joining game ${gameId}, player ${playerId}, name ${playerName}, testMode: ${isTestMode}`);
    let game = this.getGame(gameId);
    if (!game) {
      game = this.createGame(gameId, isTestMode);
    }
    if (!game.isTestMode && game.players.length >= 5) {
      console.log('Game full');
      return null;
    }
    if (game.players.some(p => p.id === playerId)) {
      console.log('Player already in game');
      return game;
    }

    game.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      title: null,
    });
    console.log(`Player ${playerName} added, total players: ${game.players.length}`);

    if (game.isTestMode || game.players.length >= 2) { // Temporary for 2-player testing
      this.startGame(game);
    }

    return game;
  }

  startGame(game: Game) {
    console.log(`Starting game ${game.id}, testMode: ${game.isTestMode}`);
    game.status = 'playing';
    const deck = this.createDeck();
    this.shuffle(deck);
    this.deal(game, deck);
    game.currentTurn = 0;
    game.passCount = 0;
    game.lastPlayedPlayerId = null;
    game.currentPattern = null; // CHANGE: Reset pattern
    console.log(`Game started, players: ${game.players.length}, deck size: ${deck.length}`);
  }

  createDeck(): Card[] {
    console.log('Creating deck');
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    this.jokerCounter = 0;
    return [
        ...suits.flatMap(suit => ranks.map(rank => ({ 
          suit, 
          rank, 
          isJoker: false, 
          isDetails: false,
          assignedRank: null, // Joker Update: Initialize
          assignedSuit: null, // Joker Update: Initialize
        }))),
        { 
          suit: 'joker1', 
          rank: null, 
          isJoker: true, 
          isDetails: false, 
          assignedRank: null, // Joker Update: Initialize
          assignedSuit: null, // Joker Update: Initialize
        },
        { 
          suit: 'joker2', 
          rank: null, 
          isJoker: true, 
          isDetails: false, 
          assignedRank: null, // Joker Update: Initialize
          assignedSuit: null, // Joker Update: Initialize
        },
        { 
          suit: null, 
          rank: null, 
          isJoker: false, 
          isDetails: true, 
          assignedRank: null, // Joker Update: Initialize
          assignedSuit: null, // Joker Update: Initialize
        },
      ];
  }

  shuffle(deck: Card[]) {
    console.log('Shuffling deck');
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  deal(game: Game, deck: Card[]) {
    console.log(`Dealing cards to ${game.players.length} players`);
    const cardsPerPlayer = Math.floor(deck.length / Math.max(1, game.players.length));
    game.players.forEach((player, i) => {
      player.hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
      console.log(`Dealt ${player.hand.length} cards to ${player.name}`);
    });
  }

  // Fix: Update specific player's hand order without affecting others
  updateHandOrder(gameId: string, playerId: string, hand: Card[]): Game | null {
    const game = this.getGame(gameId);
    if (!game) {
      console.log(`Game ${gameId} not found`);
      return null;
    }
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      console.log(`Player ${playerId} not found in game ${gameId}`);
      return null;
    }
    // Verify hand contains same cards
    const currentHandIds = new Set(player.hand.map(c => this.cardId(c)));
    const newHandIds = new Set(hand.map(c => this.cardId(c)));
    if (currentHandIds.size !== newHandIds.size || 
        [...currentHandIds].some(id => !newHandIds.has(id))) {
      console.log(`Invalid hand order update for ${playerId}, expected ${currentHandIds.size} cards, got ${newHandIds.size}`);
      return null;
    }
    player.hand = hand;
    console.log(`Updated hand order for ${playerId}:`, 
      player.hand.map(c => c.isJoker ? `${c.suit} (${c.assignedRank} of ${c.assignedSuit})` : `${c.rank} of ${c.suit}`));
    return game;
  }
  

  playPattern(gameId: string, playerId: string, cards: Card[], hand: Card[]): Game | null {
    const game = this.getGame(gameId);
    if (!game || (!game.isTestMode && game.players[game.currentTurn].id !== playerId)) {
      console.log('Invalid play attempt', { gameId, playerId });
      return null;
    }

    console.log(`Player ${playerId} playing cards:`, 
      cards.map(c => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`));
    
    // Fix Bug 2: Validate cards are in player's hand and unique
    // Fix Joker: Match Jokers by suit and isJoker, update hand with assigned values
    const player = game.players.find(p => p.id === playerId)!;
    const handCardIds = new Map(player.hand.map(c => [this.jokerCardId(c), c]));
    const playedCardIds = cards.map(c => this.jokerCardId(c));
    const uniquePlayedCardIds = new Set(playedCardIds);
    if (playedCardIds.length !== uniquePlayedCardIds.size) {
      console.log(`Invalid play for ${playerId}: Duplicate cards detected`, playedCardIds);
      return null;
    }
    if (!playedCardIds.every(id => handCardIds.has(id))) {
      console.log(`Invalid play for ${playerId}: Cards not in hand`, playedCardIds);
      return null;
    }

    // Fix Joker: Update player's hand with assigned Joker values
    const updatedHand = hand.map(c => {
      const playedCard = cards.find(pc => this.jokerCardId(pc) === this.jokerCardId(c));
      if (playedCard && playedCard.isJoker) {
        return { ...c, assignedRank: playedCard.assignedRank, assignedSuit: playedCard.assignedSuit };
      }
      return c;
    });
    const playedJokerCardIds = new Set(cards.filter(c => c.isJoker).map(c => this.jokerCardId(c)));
    const remainingHand = updatedHand.filter(c => !playedCardIds.includes(this.jokerCardId(c)));
    if (remainingHand.length !== player.hand.length - cards.length) {
      console.log(`Invalid hand for ${playerId}, expected ${player.hand.length - cards.length} cards, got ${remainingHand.length}`);
      return null;
    }

    const prevPattern = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
    if (this.validatePattern(cards, prevPattern, game.currentPattern)) {
      player.hand = remainingHand;
      console.log(`Player ${playerId} new hand order:`, 
        player.hand.map(c => c.isJoker ? `${c.suit} (${c.assignedRank} of ${c.assignedSuit})` : `${c.rank} of ${c.suit}`));
      game.pile.push(cards);
      game.passCount = 0;
      game.lastPlayedPlayerId = playerId;
      if (game.currentPattern == null) {
        if (cards.length === 1) {
          game.currentPattern = 'single';
        } else if (cards.length === 2 && cards.every(c => 
          (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? cards[0].assignedRank : cards[0].rank)
        )) {
          game.currentPattern = 'pair';
        } else if (cards.length >= 3 && cards.length <= 4 && cards.every(c => 
          (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? c.assignedRank : c.rank)
        )) {
          game.currentPattern = `group-${cards.length}`;
        } else if (cards.length >= 2) {
          game.currentPattern = 'consecutive';
        }
      }
      game.currentTurn = game.isTestMode ? 0 : (game.currentTurn + 1) % game.players.length;
      console.log(`Play successful, pile:`, game.pile, `passCount: ${game.passCount}, pattern: ${game.currentPattern}`);

      if (player.hand.length === 0) {
        this.assignTitles(game);
      }

      return game;
    }

    console.log('Invalid pattern');
    return null;
  }

  pass(gameId: string, playerId: string): Game | null {
    const game = this.getGame(gameId);
    if (!game || (!game.isTestMode && game.players[game.currentTurn].id !== playerId)) {
      console.log('Invalid pass attempt', { gameId, playerId });
      return null;
    }
    game.passCount++;
    game.currentTurn = game.isTestMode ? 0 : (game.currentTurn + 1) % game.players.length;
    if (game.passCount >= game.players.length) {
      game.pile = [];
      game.passCount = 0;
      game.currentPattern = null;
    }
    console.log(`Player ${playerId} passed, passCount: ${game.passCount}`);
    return game;
  }

  takeChance(gameId: string, playerId: string, cards: Card[], hand: Card[]): Game | null {
    const game = this.getGame(gameId);
    if (!game || (!game.isTestMode && game.players[game.currentTurn].id !== playerId)) {
      console.log('Invalid take chance attempt', { gameId, playerId });
      return null;
    }
    console.log(`Player ${playerId} taking chance with cards:`, 
      cards.map(c => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`));
    
    // Fix Bug 2: Validate cards are in player's hand and unique
    // Fix Joker: Match Jokers by suit and isJoker, update hand with assigned values
    const player = game.players.find(p => p.id === playerId)!;
    const handCardIds = new Map(player.hand.map(c => [this.jokerCardId(c), c]));
    const playedCardIds = cards.map(c => this.jokerCardId(c));
    const uniquePlayedCardIds = new Set(playedCardIds);
    if (playedCardIds.length !== uniquePlayedCardIds.size) {
      console.log(`Invalid take chance for ${playerId}: Duplicate cards detected`, playedCardIds);
      return null;
    }
    if (!playedCardIds.every(id => handCardIds.has(id))) {
      console.log(`Invalid take chance for ${playerId}: Cards not in hand`, playedCardIds);
      return null;
    }

    // Fix Joker: Update player's hand with assigned Joker values
    const updatedHand = hand.map(c => {
      const playedCard = cards.find(pc => this.jokerCardId(pc) === this.jokerCardId(c));
      if (playedCard && playedCard.isJoker) {
        return { ...c, assignedRank: playedCard.assignedRank, assignedSuit: playedCard.assignedSuit };
      }
      return c;
    });
    const remainingHand = updatedHand.filter(c => !playedCardIds.includes(this.jokerCardId(c)));
    if (remainingHand.length !== player.hand.length - cards.length) {
      console.log(`Invalid hand for ${playerId}, expected ${player.hand.length - cards.length} cards, got ${remainingHand.length}`);
      return null;
    }

    const prevPattern = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
    if (this.validatePattern(cards, prevPattern, game.currentPattern)) {
      player.hand = remainingHand;
      console.log(`Player ${playerId} new hand order:`, 
        player.hand.map(c => c.isJoker ? `${c.suit} (${c.assignedRank} of ${c.assignedSuit})` : `${c.rank} of ${c.suit}`));
      game.pile.push(cards);
      game.passCount = 0;
      game.lastPlayedPlayerId = playerId;
      if (game.currentPattern == null) {
        if (cards.length === 1) {
          game.currentPattern = 'single';
        } else if (cards.length === 2 && cards.every(c => 
          (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? cards[0].assignedRank : c.rank)
        )) {
          game.currentPattern = 'pair';
        } else if (cards.length >= 3 && cards.length <= 4 && cards.every(c => 
          (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? c.assignedRank : c.rank)
        )) {
          game.currentPattern = `group-${cards.length}`;
        } else if (cards.length >= 2) {
          game.currentPattern = 'consecutive';
        }
      }
      game.currentTurn = game.isTestMode ? 0 : (game.currentTurn + 1) % game.players.length;
      console.log(`Take chance successful, pile:`, game.pile, `passCount: ${game.passCount}, pattern: ${game.currentPattern}`);

      if (player.hand.length === 0) {
        this.assignTitles(game);
      }

      return game;
    }

    console.log('Invalid pattern for take chance');
    return null;
  }
  validatePattern(cards: Card[], prevPattern: Card[] | null, currentPattern: string | null): boolean {
    if (cards.length === 0) return false;
    
    // Fix Bug 1: Details card only valid as single card
    if (cards.some(c => c.isDetails)) {
      if (cards.length !== 1) {
        console.log('Invalid pattern: Details card can only be played as a single card');
        return false;
      }
      if (prevPattern && prevPattern.some(c => c.isDetails)) {
        console.log('Invalid pattern: Cannot play Details card over another Details card');
        return false;
      }
      return true;
    }

    const effectiveCards = cards.map(c => ({
      ...c,
      rank: c.isJoker ? c.assignedRank : c.rank,
      suit: c.isJoker ? c.assignedSuit : c.suit,
    }));

    for (const card of effectiveCards) {
      if (card.isJoker && (!card.assignedRank || !card.assignedSuit)) {
        console.log('Joker missing assigned rank/suit');
        return false;
      }
    }

    let patternType: string;
    if (effectiveCards.length === 1) {
      patternType = 'single';
    } else if (effectiveCards.length === 2 && effectiveCards.every(c => c.rank === effectiveCards[0].rank)) {
      patternType = 'pair';
    } else if (effectiveCards.length >= 3 && effectiveCards.length <= 4 && 
               effectiveCards.every(c => c.rank === effectiveCards[0].rank)) {
      patternType = `group-${effectiveCards.length}`;
    } else if (effectiveCards.length >= 2) {
      const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
      const sameSuit = sortedCards.every(c => c.suit === sortedCards[0].suit);
      const isConsecutive = sortedCards.every((c, i) => 
        i === 0 || this.getCardValue(c) === this.getCardValue(sortedCards[i - 1]) + 1
      );
      if (sameSuit && isConsecutive) {
        patternType = 'consecutive';
      } else {
        return false;
      }
    } else {
      return false;
    }

    if (currentPattern != null && patternType !== currentPattern) {
      console.log(`Invalid pattern: expected ${currentPattern}, got ${patternType}`);
      return false;
    }

    if (prevPattern == null) return true;

    const effectivePrev = prevPattern.map(c => ({
      ...c,
      rank: c.isJoker ? c.assignedRank : c.rank,
      suit: c.isJoker ? c.assignedSuit : c.suit,
    }));

    if (patternType === 'single' && prevPattern.length === 1) {
      return this.getCardValue(effectiveCards[0]) > this.getCardValue(effectivePrev[0]);
    }

    if (patternType === 'pair' && prevPattern.length === 2) {
      return this.getCardValue(effectiveCards[0]) > this.getCardValue(effectivePrev[0]);
    }

    if (patternType.startsWith('group-') && prevPattern.length === effectiveCards.length) {
      return this.getCardValue(effectiveCards[0]) > this.getCardValue(effectivePrev[0]);
    }

    if (patternType === 'consecutive' && prevPattern.length === effectiveCards.length) {
      const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
      const sortedPrev = [...effectivePrev].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
      return this.getCardValue(sortedCards[0]) > this.getCardValue(sortedPrev[sortedPrev.length - 1]);
    }

    return false;
  }



  getCardValue(card: Card): number {
    const effectiveRank = card.isJoker ? card.assignedRank : card.rank;
    if (card.isDetails) return Infinity;
    if (card.isJoker && !effectiveRank) return 0;
    const values: { [key: string]: number } = {
      '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
    };
    return values[effectiveRank!] || 0;
  }

  assignTitles(game: Game) {
    console.log(`Assigning titles for game ${game.id}`);
    game.status = 'finished';
    const finished = game.players.filter(p => p.hand.length === 0);
    if (finished.length === 1) {
      finished[0].title = 'King';
    }
  }

  
  // Fix: Unique card identifier for matching
  private cardId(card: Card): string {
    return JSON.stringify({
      suit: card.suit,
      rank: card.rank,
      isJoker: card.isJoker,
      isDetails: card.isDetails,
      assignedRank: card.assignedRank,
      assignedSuit: card.assignedSuit,
    });
  }
  // Fix Joker: Card identifier for play validation, matching Jokers by suit
  private jokerCardId(card: Card): string {
    if (card.isJoker) {
      return JSON.stringify({
        suit: card.suit,
        isJoker: card.isJoker,
      });
    }
    return this.cardId(card);
  }

}