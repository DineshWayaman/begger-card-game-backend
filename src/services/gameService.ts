import { Card } from '../models/card';
import { Game } from '../models/game';
import { Player } from '../models/player';

export class GameService {
  private games: { [key: string]: Game } = {};
  private readonly MIN_PLAYERS = 2;
  private readonly MAX_PLAYERS = 6;

  createDeck(): Card[] {
    console.log('Creating deck');
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    return [
      ...suits.flatMap(suit => ranks.map(rank => ({
        suit,
        rank,
        isJoker: false,
        isDetails: false,
        assignedRank: null,
        assignedSuit: null,
      }))),
      {
        suit: 'joker1',
        rank: null,
        isJoker: true,
        isDetails: false,
        assignedRank: null,
        assignedSuit: null,
      },
      {
        suit: 'joker2',
        rank: null,
        isJoker: true,
        isDetails: false,
        assignedRank: null,
        assignedSuit: null,
      },
      {
        suit: null,
        rank: null,
        isJoker: false,
        isDetails: true,
        assignedRank: null,
        assignedSuit: null,
      },
    ];
  }

  createGame(gameId: string, playerName: string, isTestMode: boolean): Game {
    console.log(`Creating game ${gameId}`);
    const deck = this.createDeck();
    const playerId = `${gameId}-${playerName}`;
    const players: Player[] = [{
      id: playerId,
      name: playerName,
      hand: [],
      title: null,
    }];
    const game: Game = {
      id: gameId,
      players,
      deck,
      pile: [],
      currentTurn: 0,
      status: isTestMode ? 'playing' : 'waiting',
      passCount: 0,
      currentPattern: null,
      lastPlayedPlayerId: null,
      isTestMode,
    };
    this.games[gameId] = game;
    if (isTestMode) {
      this.startGame(gameId);
    }
    return game;
  }

  getGame(gameId: string): Game | null {
    return this.games[gameId] || null;
  }

  joinGame(gameId: string, playerName: string): Game | null {
    const game = this.getGame(gameId);
    if (!game || game.status !== 'waiting') {
      console.log(`Cannot join game ${gameId}: Game not found or not in waiting state`);
      return null;
    }
    if (game.players.length >= this.MAX_PLAYERS) {
      console.log(`Cannot join game ${gameId}: Maximum players (${this.MAX_PLAYERS}) reached`);
      return null;
    }
    if (game.players.some(p => p.name === playerName)) {
      console.log(`Player ${playerName} already in game ${gameId}`);
      return null;
    }
    const playerId = `${gameId}-${playerName}`;
    game.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      title: null,
    });
    console.log(`Player ${playerName} joined game ${gameId}. Players: ${game.players.length}/${this.MAX_PLAYERS}`);
    return game;
  }

  startGame(gameId: string): Game | null {
    const game = this.getGame(gameId);
    if (!game || (game.status !== 'waiting' && !game.isTestMode)) {
      console.log(`Cannot start game ${gameId}: Game not found or not in waiting state`);
      return null;
    }
    if (!game.isTestMode && (game.players.length < this.MIN_PLAYERS || game.players.length > this.MAX_PLAYERS)) {
      console.log(`Cannot start game ${gameId}: Player count (${game.players.length}) not between ${this.MIN_PLAYERS} and ${this.MAX_PLAYERS}`);
      return null;
    }
    game.status = 'playing';
    this.shuffle(game.deck);
    this.deal(game);
    console.log(`Game ${gameId} started with ${game.players.length} players`);
    return game;
  }

  startGameManually(gameId: string, playerId: string): Game | null {
    const game = this.getGame(gameId);
    if (!game || game.status !== 'waiting') {
      console.log(`Cannot start game ${gameId}: Game not found or not in waiting state`);
      return null;
    }
    if (game.players.length < this.MIN_PLAYERS || game.players.length > this.MAX_PLAYERS) {
      console.log(`Cannot start game ${gameId}: Player count (${game.players.length}) not between ${this.MIN_PLAYERS} and ${this.MAX_PLAYERS}`);
      return null;
    }
    if (!game.players.some(p => p.id === playerId)) {
      console.log(`Player ${playerId} not in game ${gameId}`);
      return null;
    }
    console.log(`Player ${playerId} initiated manual start for game ${gameId}`);
    return this.startGame(gameId);
  }

  shuffle(deck: Card[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  deal(game: Game): void {
    const baseCardsPerPlayer = Math.floor(game.deck.length / game.players.length);
    const totalCards = game.deck.length;
    const extraCards = totalCards % game.players.length;

    // Shuffle players to randomize who gets extra card
    const shuffledPlayerIndices = Array.from({ length: game.players.length }, (_, i) => i);
    for (let i = shuffledPlayerIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPlayerIndices[i], shuffledPlayerIndices[j]] = [shuffledPlayerIndices[j], shuffledPlayerIndices[i]];
    }

    let deckIndex = 0;
    const cardsDealt: number[] = new Array(game.players.length).fill(0);

    // Deal base cards
    for (let i = 0; i < game.players.length; i++) {
      const playerIndex = shuffledPlayerIndices[i];
      game.players[playerIndex].hand = game.deck.slice(deckIndex, deckIndex + baseCardsPerPlayer);
      cardsDealt[playerIndex] = baseCardsPerPlayer;
      deckIndex += baseCardsPerPlayer;
    }

    // Deal remaining cards to first 'extraCards' players
    for (let i = 0; i < extraCards; i++) {
      const playerIndex = shuffledPlayerIndices[i];
      game.players[playerIndex].hand.push(game.deck[deckIndex]);
      cardsDealt[playerIndex]++;
      deckIndex++;
    }

    game.deck = [];
    console.log(`Dealt cards: ${cardsDealt.map((count, i) => `${count} to ${game.players[i].name}`).join(', ')}`);
  }

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
    const currentHandIds = player.hand.map(c => this.cardId(c)).sort();
    const newHandIds = hand.map(c => this.cardId(c)).sort();
    if (currentHandIds.length !== newHandIds.length || currentHandIds.some((id, i) => id !== newHandIds[i])) {
      console.log(`Invalid hand order update for ${playerId}: Hand mismatch`);
      return null;
    }
    player.hand = hand;
    console.log(`Updated hand order for ${playerId}`);
    return game;
  }

  playPattern(gameId: string, playerId: string, cards: Card[], hand: Card[]): Game | null {
    const game = this.getGame(gameId);
    if (!game || (!game.isTestMode && game.players[game.currentTurn].id !== playerId)) {
      console.log('Invalid play attempt', { gameId, playerId });
      return null;
    }

    const player = game.players.find(p => p.id === playerId)!;
    console.log(`Attempting play by ${playerId}: ${cards.map(c => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`).join(', ')}`);

    if (game.isTestMode) {
      if (this.validatePattern(cards, null, null, false)) {
        player.hand = hand;
        game.pile.push(cards);
        game.passCount = 0;
        game.lastPlayedPlayerId = playerId;
        this.updatePattern(cards, game);
        console.log(`Test mode play successful, pile: ${game.pile.length}, pattern: ${game.currentPattern}`);
        if (player.hand.length === 0) {
          this.assignTitles(game);
        }
        return game;
      }
      console.log(`Invalid pattern in test mode for ${playerId}`);
      return null;
    }

    const handCardIds = player.hand.map(c => this.cardId(c));
    const playedCardIds = cards.map(c => this.cardId(c));
    console.log(`Played card IDs: ${playedCardIds.join(', ')}`);
    if (!playedCardIds.every(id => handCardIds.includes(id))) {
      console.log(`Invalid play for ${playerId}: Cards not in hand`, { playedCardIds, handCardIds });
      return null;
    }

    const remainingHand = player.hand.filter(c => !playedCardIds.includes(this.cardId(c)));
    const submittedHandIds = hand.map(c => this.cardId(c)).sort();
    const expectedHandIds = remainingHand.map(c => this.cardId(c)).sort();
    if (submittedHandIds.length !== expectedHandIds.length || submittedHandIds.some((id, i) => id !== expectedHandIds[i])) {
      console.log(`Invalid hand for ${playerId}: Hand mismatch`, {
        submittedHandIds,
        expectedHandIds,
        difference: submittedHandIds.filter(id => !expectedHandIds.includes(id))
      });
      return null;
    }

    const prevPattern = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
    if (this.validatePattern(cards, prevPattern, game.currentPattern, false)) {
      player.hand = hand;
      game.pile.push(cards);
      game.passCount = 0;
      game.lastPlayedPlayerId = playerId;
      this.updatePattern(cards, game);
      game.currentTurn = (game.currentTurn + 1) % game.players.length;
      console.log(`Play successful, pile: ${game.pile.length}, pattern: ${game.currentPattern}`);

      if (player.hand.length === 0) {
        this.assignTitles(game);
      }

      return game;
    }

    console.log(`Invalid pattern for ${playerId}`);
    return null;
  }

  pass(gameId: string, playerId: string): Game | null {
    const game = this.getGame(gameId);
    if (!game) {
      console.log(`Invalid pass attempt: Game ${gameId} not found`);
      return null;
    }
    if (!game.isTestMode && game.players[game.currentTurn].id !== playerId) {
      console.log(`Invalid pass attempt: Not ${playerId}'s turn`, {
        gameId,
        playerId,
        currentTurn: game.currentTurn,
        expectedPlayerId: game.players[game.currentTurn].id
      });
      return null;
    }
    if (game.isTestMode) {
      console.log(`Pass ignored in test mode for ${playerId}`);
      return game; // No-op in test mode
    }
    game.passCount++;
    if (game.passCount >= game.players.length - 1) {
      game.pile = [];
      game.passCount = 0;
      game.currentPattern = null;
      // Start next round with last played player or player 0
      const nextPlayerIndex = game.lastPlayedPlayerId
        ? game.players.findIndex(p => p.id === game.lastPlayedPlayerId)
        : 0;
      game.currentTurn = nextPlayerIndex >= 0 ? nextPlayerIndex : 0;
      console.log(`New round started for game ${gameId}, starting player: ${game.players[game.currentTurn].id}`);
    } else {
      game.currentTurn = (game.currentTurn + 1) % game.players.length;
    }
    console.log(`Player ${playerId} passed, passCount: ${game.passCount}, currentTurn: ${game.players[game.currentTurn].id}`);
    return game;
  }

  takeChance(gameId: string, playerId: string, cards: Card[], hand: Card[]): Game | null {
    const game = this.getGame(gameId);
    if (!game || (!game.isTestMode && game.players[game.currentTurn].id !== playerId)) {
      console.log('Invalid take chance attempt', { gameId, playerId });
      return null;
    }

    const player = game.players.find(p => p.id === playerId)!;
    console.log(`Attempting take chance by ${playerId}: ${cards.map(c => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`).join(', ')}`);

    if (game.isTestMode) {
      if (this.validatePattern(cards, null, null, false)) {
        player.hand = hand;
        game.pile.push(cards);
        game.passCount = 0;
        game.lastPlayedPlayerId = playerId;
        this.updatePattern(cards, game);
        console.log(`Test mode take chance successful, pile: ${game.pile.length}, pattern: ${game.currentPattern}`);
        if (player.hand.length === 0) {
          this.assignTitles(game);
        }
        return game;
      }
      console.log(`Invalid pattern in test mode for ${playerId}`);
      return null;
    }

    const handCardIds = player.hand.map(c => this.cardId(c));
    const playedCardIds = cards.map(c => this.cardId(c));
    console.log(`Played card IDs: ${playedCardIds.join(', ')}`);
    if (!playedCardIds.every(id => handCardIds.includes(id))) {
      console.log(`Invalid take chance for ${playerId}: Cards not in hand`, { playedCardIds, handCardIds });
      return null;
    }

    const remainingHand = player.hand.filter(c => !playedCardIds.includes(this.cardId(c)));
    const submittedHandIds = hand.map(c => this.cardId(c)).sort();
    const expectedHandIds = remainingHand.map(c => this.cardId(c)).sort();
    if (submittedHandIds.length !== expectedHandIds.length || submittedHandIds.some((id, i) => id !== expectedHandIds[i])) {
      console.log(`Invalid hand for ${playerId}: Hand mismatch`, {
        submittedHandIds,
        expectedHandIds,
        difference: submittedHandIds.filter(id => !expectedHandIds.includes(id))
      });
      return null;
    }

    const prevPattern = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
    if (this.validatePattern(cards, prevPattern, game.currentPattern, true)) {
      player.hand = hand;
      game.pile.push(cards);
      game.passCount = 0;
      game.lastPlayedPlayerId = playerId;
      this.updatePattern(cards, game);
      game.currentTurn = (game.currentTurn + 1) % game.players.length;
      console.log(`Take chance successful, pile: ${game.pile.length}, pattern: ${game.currentPattern}`);

      if (player.hand.length === 0) {
        this.assignTitles(game);
      }

      return game;
    }

    console.log(`Invalid pattern for take chance by ${playerId}`);
    return null;
  }

  private updatePattern(cards: Card[], game: Game): void {
    if (game.currentPattern == null) {
      if (cards.length === 1) {
        game.currentPattern = 'single';
      } else if (cards.length >= 2) {
        const effectiveCards = cards.map(c => ({
          ...c,
          rank: c.isJoker ? c.assignedRank : c.rank,
        }));
        const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
        const isConsecutive = sortedCards.every((c, i) => i === 0 || this.getCardValue(c) === this.getCardValue(sortedCards[i - 1]) + 1);
        if (isConsecutive) {
          game.currentPattern = 'consecutive';
        } else if (cards.length === 2 && cards.every(c => (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? c.assignedRank : c.rank))) {
          game.currentPattern = 'pair';
        } else if (cards.length >= 3 && cards.length <= 4 && cards.every(c => (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? c.assignedRank : c.rank))) {
          game.currentPattern = `group-${cards.length}`;
        } else {
          console.log('Invalid pattern: Cards do not form a valid pattern');
        }
      }
    }
  }

  validatePattern(cards: Card[], prevPattern: Card[] | null, currentPattern: string | null, isTakeChance: boolean): boolean {
    if (cards.length === 0) {
      console.log('Invalid pattern: No cards played');
      return false;
    }

    if (cards.some(c => c.isDetails)) {
      if (cards.length !== 1) {
        console.log('Invalid pattern: Details card can only be played alone');
        return false;
      }
      if (prevPattern && prevPattern.some(c => c.isDetails) && !isTakeChance) {
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
    } else if (effectiveCards.length >= 3 && effectiveCards.length <= 4 && effectiveCards.every(c => c.rank === effectiveCards[0].rank)) {
      patternType = `group-${effectiveCards.length}`;
    } else if (effectiveCards.length >= 2 && effectiveCards.length <= 13) {
      const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
      const isConsecutive = sortedCards.every((c, i) => i === 0 || this.getCardValue(c) === this.getCardValue(sortedCards[i - 1]) + 1);
      if (isConsecutive) {
        const sameSuit = effectiveCards.every(c => c.suit === effectiveCards[0].suit);
        if (!sameSuit) {
          console.log('Invalid consecutive pattern: Cards must be same suit');
          return false;
        }
        patternType = 'consecutive';
      } else {
        console.log('Invalid consecutive pattern: Cards do not form a sequence');
        return false;
      }
    } else {
      console.log(`Invalid pattern length: ${effectiveCards.length}`);
      return false;
    }

    // First play validation after pattern checks
    if (prevPattern == null && currentPattern == null) {
      if (patternType === 'consecutive' && !effectiveCards.every(c => c.suit === effectiveCards[0].suit)) {
        console.log('Invalid first play: Consecutive pattern must be same suit');
        return false;
      }
      console.log(`First play detected: ${patternType}`);
      return true;
    }

    if (currentPattern != null && patternType !== currentPattern) {
      console.log(`Invalid pattern: expected ${currentPattern}, got ${patternType}`);
      return false;
    }

    if (prevPattern != null) {
      const effectivePrev = prevPattern.map(c => ({
        ...c,
        rank: c.isJoker ? c.assignedRank : c.rank,
        suit: c.isJoker ? c.assignedSuit : c.suit,
      }));

      if (effectivePrev.some(c => c.isDetails)) {
        console.log('Cannot play over Details card');
        return false;
      }

      if (patternType === 'single' && prevPattern.length === 1) {
        const isValid = this.getCardValue(effectiveCards[0]) > this.getCardValue(effectivePrev[0]);
        if (!isValid) {
          console.log(`Invalid single: ${effectiveCards[0].rank} not higher than ${effectivePrev[0].rank}`);
        }
        return isValid;
      }

      if (patternType === 'pair' && prevPattern.length === 2) {
        const isValid = this.getCardValue(effectiveCards[0]) > this.getCardValue(effectivePrev[0]);
        if (!isValid) {
          console.log(`Invalid pair: ${effectiveCards[0].rank} not higher than ${effectivePrev[0].rank}`);
        }
        return isValid;
      }

      if (patternType.startsWith('group-') && prevPattern.length === effectiveCards.length) {
        const isValid = this.getCardValue(effectiveCards[0]) > this.getCardValue(effectivePrev[0]);
        if (!isValid) {
          console.log(`Invalid group: ${effectiveCards[0].rank} not higher than ${effectivePrev[0].rank}`);
        }
        return isValid;
      }

      if (patternType === 'consecutive' && prevPattern.length === effectiveCards.length) {
        const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
        const sortedPrev = [...effectivePrev].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
        const isValid = this.getCardValue(sortedCards[0]) > this.getCardValue(sortedPrev[sortedPrev.length - 1]);
        if (!isValid) {
          console.log(`Invalid consecutive: Starts at ${sortedCards[0].rank}, needs to be higher than ${sortedPrev[sortedPrev.length - 1].rank}`);
        }
        return isValid;
      }

      console.log('Pattern validation failed: Mismatched pattern types');
      return false;
    }

    if (isTakeChance) {
      if (patternType === 'single' && this.getCardValue(effectiveCards[0]) === 16) {
        return true; // Details card
      }
      if (patternType === 'single' && this.getCardValue(effectiveCards[0]) === 15) {
        return true; // 2 is the highest single
      }
      if (patternType === 'pair' && this.getCardValue(effectiveCards[0]) === 15) {
        return true; // Pair of 2s
      }
      if (patternType.startsWith('group-') && this.getCardValue(effectiveCards[0]) === 15) {
        return true; // Group of 2s
      }
      if (patternType === 'consecutive') {
        const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
        if (this.getCardValue(sortedCards[sortedCards.length - 1]) === 15) {
          return true; // Consecutive ending at 2
        }
      }
      console.log('Take chance failed: Not unbeatable');
      return false;
    }

    return true;
  }

  getCardValue(card: Card): number {
    const effectiveRank = card.isJoker ? card.assignedRank : card.rank;
    if (card.isDetails) return 16; // Highest value
    if (card.isJoker && !effectiveRank) return 0;
    const values: { [key: string]: number } = {
      '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
    };
    return values[effectiveRank!] || 0;
  }

  assignTitles(game: Game): void {
    // Get players who have just finished (hand length = 0 and no title yet)
    const finishedPlayers = game.players
      .filter(p => p.hand.length === 0 && p.title == null)
      .sort((a, b) => {
        const aIndex = game.players.findIndex(p => p.id === a.id);
        const bIndex = game.players.findIndex(p => p.id === b.id);
        return aIndex - bIndex;
      });

    // Get players who still have cards
    const remainingPlayers = game.players.filter(p => p.hand.length > 0);

    // Assign titles to newly finished players
    let titleIndex = game.players.filter(p => p.title != null && p.title !== 'Beggar').length;
    for (const player of finishedPlayers) {
      if (titleIndex === 0) {
        player.title = 'King';
      } else if (titleIndex === 1) {
        player.title = 'Wise';
      } else {
        player.title = 'Civilian';
      }
      titleIndex++;
    }

    // Assign Beggar when exactly one player remains with cards
    if (remainingPlayers.length === 1 && game.players.length > 2) {
      const beggar = remainingPlayers[0];
      beggar.title = 'Beggar';

      // Perform card exchange between King and Beggar
      const king = game.players.find(p => p.title === 'King');
      if (king && beggar && beggar.hand.length > 0) {
        const highestCard = beggar.hand.reduce((max, card) => {
          if (card.isDetails || card.isJoker) return max;
          return this.getCardValue(card) > this.getCardValue(max) ? card : max;
        }, beggar.hand[0]);
        if (highestCard) {
          beggar.hand = beggar.hand.filter(c => c !== highestCard);
          king.hand.push(highestCard);
          console.log(`King took ${highestCard.rank} of ${highestCard.suit} from Beggar`);
        }

        const unwantedCard = king.hand[Math.floor(Math.random() * king.hand.length)];
        if (unwantedCard) {
          king.hand = king.hand.filter(c => c !== unwantedCard);
          beggar.hand.push(unwantedCard);
          console.log(`King gave ${unwantedCard.rank} of ${unwantedCard.suit} to Beggar`);
        }
      }
    }

    console.log('Titles assigned:', game.players.map(p => ({ name: p.name, title: p.title })));
  }

  private cardId(card: Card): string {
    return `${card.suit || 'none'}-${card.rank || 'none'}-${card.isJoker}-${card.isDetails}`;
  }
}