import { Server, Socket } from 'socket.io';
import { Card } from '../models/card';
import { Game } from '../models/game';
import { Player } from '../models/player';

export class GameService {
  private games: { [key: string]: Game } = {};
  private readonly MIN_PLAYERS = 3;
  private readonly MAX_PLAYERS = 6;
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.io.on('connection', (socket: Socket) => {
      socket.on('leaveGame', (data) => {
        const { gameId, playerId } = data;
        this.leaveGame(gameId, playerId, socket);
      });
      // Home leave update: Handle leave from summary screen
      socket.on('leaveGameFromSummary', (data) => {
        const { gameId, playerId } = data;
        this.leaveGameFromSummary(gameId, playerId, socket);
      });
    });
  }

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
      passedPlayerIds: [],
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
    game.currentTurn = this.getNextValidPlayerIndex(game, 0);
    console.log(`Game ${gameId} started with ${game.players.length} players, starting with player ${game.players[game.currentTurn].name}`);
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

  restartGame(gameId: string, playerId: string): { game: Game | null; dismissDialog: boolean } {
    const game = this.getGame(gameId);
    if (!game) {
      console.log(`Cannot restart game ${gameId}: Game not found`);
      return { game: null, dismissDialog: false };
    }
    if (!game.players.some(p => p.id === playerId)) {
      console.log(`Player ${playerId} not in game ${gameId}`);
      return { game: null, dismissDialog: false };
    }

    const wisePlayerIndex = game.players.findIndex(p => p.title === 'Wise');
    const wisePlayerName = wisePlayerIndex >= 0 ? game.players[wisePlayerIndex].name : 'none';
    console.log(`Wise player index: ${wisePlayerIndex} (player: ${wisePlayerName})`);

    game.players.forEach(player => {
      player.title = null;
      player.hand = [];
    });
    game.deck = this.createDeck();
    game.pile = [];
    game.status = 'playing';
    game.passCount = 0;
    game.currentPattern = null;
    game.lastPlayedPlayerId = null;
    game.passedPlayerIds = [];

    this.shuffle(game.deck);
    this.deal(game);

    game.currentTurn = wisePlayerIndex >= 0 ? wisePlayerIndex : this.getNextValidPlayerIndex(game, 0);
    console.log(`Game ${gameId} restarted with ${game.players.length} players, starting with player index ${game.currentTurn} (${game.players[game.currentTurn].name})`);

    this.io.to(gameId).emit('gameUpdate', game);

    return { game, dismissDialog: true };
  }

  // leaveGame(gameId: string, playerId: string, socket: Socket): Game | null {
  //   const game = this.getGame(gameId);
  //   if (!game) {
  //     console.log(`Cannot leave game ${gameId}: Game not found`);
  //     return null;
  //   }
  //   const player = game.players.find(p => p.id === playerId);
  //   if (!player) {
  //     console.log(`Player ${playerId} not found in game ${gameId}`);
  //     return null;
  //   }
  //   game.status = 'finished';
  //   const message = `Game ended: ${player.name} has left the game.`;
  //   console.log(`Player ${playerId} left game ${gameId}. Ending game for all players.`);
  //   this.io.to(gameId).emit('gameEnded', { message });
  //   delete this.games[gameId];
  //   return game;
  // }
  leaveGame(gameId: string, playerId: string, socket: Socket): Game | null {
    const game = this.getGame(gameId);
    if (!game) {
      console.log(`Cannot leave game ${gameId}: Game not found`);
      return null;
    }
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      console.log(`Player ${playerId} not found in game ${gameId}`);
      return null;
    }
    const player = game.players[playerIndex];
    // Only end the game for all players if it's not in 'finished' state
    if (game.status !== 'finished') {
      game.status = 'finished';
      const message = `Game ended: ${player.name} has left the game.`;
      console.log(`Player ${playerId} left game ${gameId}. Ending game for all players.`);
      this.io.to(gameId).emit('gameEnded', { message });
      delete this.games[gameId];
    } else {
      // Home leave update: Remove player without ending game if in finished state
      game.players.splice(playerIndex, 1);
      console.log(`Player ${playerId} left game ${gameId} (finished state). Remaining players: ${game.players.length}`);
      socket.leave(gameId);
      this.io.to(gameId).emit('playerLeft', { playerId, playerName: player.name });
      if (game.players.length === 0) {
        console.log(`No players left in game ${gameId}. Deleting game.`);
        delete this.games[gameId];
      }
    }
    return game;
  }

  // Home leave update: New method for leaving from summary screen
  leaveGameFromSummary(gameId: string, playerId: string, socket: Socket): Game | null {
    const game = this.getGame(gameId);
    if (!game) {
      console.log(`Cannot leave game ${gameId} from summary: Game not found`);
      return null;
    }
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      console.log(`Player ${playerId} not found in game ${gameId}`);
      return null;
    }
    const player = game.players[playerIndex];
    game.players.splice(playerIndex, 1);
    console.log(`Player ${playerId} left game ${gameId} from summary. Remaining players: ${game.players.length}`);
    socket.leave(gameId);
    this.io.to(gameId).emit('playerLeft', { playerId, playerName: player.name });
    if (game.players.length === 0) {
      console.log(`No players left in game ${gameId}. Deleting game.`);
      delete this.games[gameId];
    }
    return game;
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

    const shuffledPlayerIndices = Array.from({ length: game.players.length }, (_, i) => i);
    for (let i = shuffledPlayerIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPlayerIndices[i], shuffledPlayerIndices[j]] = [shuffledPlayerIndices[j], shuffledPlayerIndices[i]];
    }

    let deckIndex = 0;
    const cardsDealt: number[] = new Array(game.players.length).fill(0);

    for (let i = 0; i < game.players.length; i++) {
      const playerIndex = shuffledPlayerIndices[i];
      game.players[playerIndex].hand = game.deck.slice(deckIndex, deckIndex + baseCardsPerPlayer);
      cardsDealt[playerIndex] = baseCardsPerPlayer;
      deckIndex += baseCardsPerPlayer;
    }

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
      if (this.validatePattern(cards, null, null)) {
        player.hand = hand;
        game.pile.push(cards);
        game.passCount = 0;
        game.passedPlayerIds = [];
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
      console.log(`Invalid play for ${playerId}: Cards not in hand`, { playerId, cards, handCardIds });
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
    if (this.validatePattern(cards, prevPattern, game.currentPattern)) {
      player.hand = hand;
      game.pile.push(cards);
      game.passCount = 0;
      game.passedPlayerIds = [];
      game.lastPlayedPlayerId = playerId;
      this.updatePattern(cards, game);

      if (player.hand.length === 0) {
        this.assignTitles(game);
      }

      if (game.status !== 'finished') {
        game.currentTurn = this.getNextValidPlayerIndex(game, (game.currentTurn + 1) % game.players.length);
        console.log(`Play successful, pile: ${game.pile.length}, pattern: ${game.currentPattern}, next turn: ${game.players[game.currentTurn].name}`);
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
      return game;
    }
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      console.log(`Player ${playerId} not found in game ${gameId}`);
      return null;
    }
    if (game.pile.length === 0 && game.passCount === 0 && player.hand.length > 0) {
      console.log(`Invalid pass attempt: ${playerId} cannot pass as new round starter with cards`);
      return null;
    }

    if (!game.passedPlayerIds.includes(playerId)) {
      game.passedPlayerIds.push(playerId);
      game.passCount++;
    }

    const activePlayers = game.players.filter(p => p.hand.length > 0);
    const activePlayerCount = activePlayers.length;

    const lastPlayedPlayer = game.lastPlayedPlayerId
      ? game.players.find(p => p.id === game.lastPlayedPlayerId)
      : null;
    const activePlayerIds = activePlayers.map(p => p.id);
    const remainingActivePlayers = activePlayerIds.filter(
      id => id !== game.lastPlayedPlayerId && !game.passedPlayerIds.includes(id)
    );

    if (remainingActivePlayers.length === 0 && activePlayerCount > 1) {
      game.pile = [];
      game.passCount = 0;
      game.passedPlayerIds = [];
      game.currentPattern = null;
      let nextPlayerIndex = game.lastPlayedPlayerId
        ? game.players.findIndex(p => p.id === game.lastPlayedPlayerId)
        : game.currentTurn;
      if (nextPlayerIndex < 0 || (lastPlayedPlayer && lastPlayedPlayer.hand.length === 0)) {
        nextPlayerIndex = (game.currentTurn + 1) % game.players.length;
      }
      game.currentTurn = this.getNextValidPlayerIndex(game, nextPlayerIndex);
      console.log(`New round started for game ${gameId}, starting player: ${game.players[game.currentTurn].name}`);
    } else {
      game.currentTurn = this.getNextValidPlayerIndex(game, (game.currentTurn + 1) % game.players.length);
      console.log(`Player ${playerId} passed, passCount: ${game.passCount}, passedPlayers: ${game.passedPlayerIds}, next turn: ${game.players[game.currentTurn].name}`);
    }
    return game;
  }

  private getNextValidPlayerIndex(game: Game, startIndex: number): number {
    const numPlayers = game.players.length;
    let index = startIndex % numPlayers;
    let attempts = 0;

    while (attempts < numPlayers) {
      const player = game.players[index];
      if (player.hand.length > 0) {
        console.log(`Selected next player: ${player.name} at index ${index}`);
        return index;
      }
      index = (index + 1) % numPlayers;
      attempts++;
    }

    console.log(`No players with cards remaining in game ${game.id}, returning startIndex ${startIndex}`);
    return startIndex;
  }

  private updatePattern(cards: Card[], game: Game): void {
    if (game.currentPattern == null) {
      if (cards.length === 1) {
        game.currentPattern = 'single';
      } else if (cards.length >= 2) {
        const effectiveCards = cards.map(c => ({
          ...c,
          rank: c.isJoker ? c.assignedRank : c.rank,
          suit: c.isJoker ? c.assignedSuit : c.suit,
        }));
        const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
        const isConsecutive = sortedCards.every((c, i) => i === 0 || this.getCardValue(c) === this.getCardValue(sortedCards[i - 1]) + 1);
        const sameSuit = sortedCards.every((c, i) => i === 0 || c.suit === sortedCards[0].suit);
        if (isConsecutive && sameSuit) {
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

  validatePattern(cards: Card[], prevPattern: Card[] | null, currentPattern: string | null): boolean {
    if (cards.length === 0) {
      console.log('Invalid pattern: No cards played');
      return false;
    }

    if (cards.some(c => c.isDetails)) {
      if (cards.length !== 1) {
        console.log('Invalid pattern: Details card can only be played alone');
        return false;
      }
      return true; // Details card is always valid when played alone
    }

    // Check if previous pattern contains a Details card
    if (prevPattern && prevPattern.some(c => c.isDetails)) {
      console.log('Invalid pattern: Cannot play over a Details card');
      return false;
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
      const sameSuit = sortedCards.every((c, i) => i === 0 || c.suit === sortedCards[0].suit);
      if (isConsecutive && sameSuit) {
        patternType = 'consecutive';
      } else {
        console.log('Invalid pattern: Cards do not form a consecutive sequence or are not of the same suit');
        return false;
      }
    } else {
      console.log(`Invalid pattern: Unsupported number of cards (${effectiveCards.length})`);
      return false;
    }

    if (!currentPattern || (currentPattern && prevPattern && prevPattern.length === 0)) {
      return true;
    }

    if (currentPattern !== patternType) {
      console.log(`Invalid pattern: Expected ${currentPattern}, got ${patternType}`);
      return false;
    }

    if (prevPattern) {
      const prevEffectiveCards = prevPattern.map(c => ({
        ...c,
        rank: c.isJoker ? c.assignedRank : c.rank,
        suit: c.isJoker ? c.assignedSuit : c.suit,
      }));
      const prevValue = this.getPatternValue(prevEffectiveCards, currentPattern);
      const currentValue = this.getPatternValue(effectiveCards, currentPattern);
      if (currentValue <= prevValue) {
        console.log(`Invalid pattern: Current value (${currentValue}) not greater than previous (${prevValue})`);
        return false;
      }
    }

    return true;
  }

  private getCardValue(card: Card): number {
    if (card.isDetails) {
      return 999; // Assign highest value to Details card
    }
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const rank = card.isJoker ? card.assignedRank : card.rank;
    return rank ? ranks.indexOf(rank) + 3 : 0;
  }

  private getPatternValue(cards: Card[], pattern: string | null): number {
    if (!pattern || cards.length === 0) return 0;
    const sortedCards = [...cards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
    if (pattern === 'single') {
      return this.getCardValue(sortedCards[0]); // Use the card's value directly
    } else if (pattern === 'pair' || pattern.startsWith('group-')) {
      return this.getCardValue(sortedCards[sortedCards.length - 1]);
    } else if (pattern === 'consecutive') {
      return this.getCardValue(sortedCards[0]);
    }
    return 0;
  }

  private cardId(card: Card): string {
    return `${card.suit ?? 'none'}-${card.rank ?? 'none'}-${card.isJoker}-${card.isDetails}`;
  }

  assignTitles(game: Game): void {
    const finishedPlayers = game.players
      .filter(p => p.hand.length === 0 && p.title == null)
      .sort((a, b) => {
        const aIndex = game.players.findIndex(p => p.id === a.id);
        const bIndex = game.players.findIndex(p => p.id === b.id);
        return aIndex - bIndex;
      });

    const remainingPlayers = game.players.filter(p => p.hand.length > 0);

    let titleIndex = game.players.filter(p => p.title != null && p.title !== 'Beggar').length;
    for (const player of finishedPlayers) {
      if (titleIndex === 0) {
        player.title = 'King';
      } else if (titleIndex === 1) {
        player.title = 'Wise';
      } else {
        player.title = 'Civilian';
      }
      this.io.to(game.id).emit('titleUpdate', {
        playerId: player.id,
        playerName: player.name,
        title: player.title,
        isBeggar: false,
      });
      titleIndex++;
    }

    if (remainingPlayers.length === 1 && game.players.length > 2) {
      const beggar = remainingPlayers[0];
      beggar.title = 'Beggar';
      this.io.to(game.id).emit('titleUpdate', {
        playerId: beggar.id,
        playerName: beggar.name,
        title: beggar.title,
        isBeggar: true,
      });
    }

    console.log('Titles assigned:', game.players.map(p => ({ name: p.name, title: p.title })));

    if (game.players.every(p => p.title != null)) {
      const summaryMessage = game.players.map(p => `${p.name}: ${p.title}`).join('\n');
      game.status = 'finished';
      this.io.to(game.id).emit('gameOver', {
        summaryMessage,
      });
      console.log(`Game ${game.id} ended. Summary: ${summaryMessage}`);
    }
  }
}