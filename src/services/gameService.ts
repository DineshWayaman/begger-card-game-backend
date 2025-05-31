import { Server, Socket } from 'socket.io';
import { Card } from '../models/card';
import { Game } from '../models/game';
import { Player } from '../models/player';

export class GameService {
  private games: { [key: string]: Game } = {};
  private readonly MIN_PLAYERS = 3;
  private readonly MAX_PLAYERS = 6;
  private readonly TURN_TIMEOUT = 40000; // 30 seconds in milliseconds
  private io: Server;
  private turnTimers: { [key: string]: NodeJS.Timeout } = {}; // Store timers for each game
  // autoplay mode: Store bot timers
  private botTimers: { [key: string]: NodeJS.Timeout } = {};

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
      // Pass Timer: Listen for player action to reset timer
      socket.on('playPattern', (data) => {
        const { gameId, playerId } = data;
        
        this.clearTurnTimer(gameId); // Clear timer on action
        // autoplay mode: Clear bot timer
        this.clearBotTimer(gameId);
        
      });
      socket.on('pass', (data) => {
        const { gameId, playerId } = data;
        
        this.clearTurnTimer(gameId); // Clear timer on action
        // autoplay mode: Clear bot timer
        this.clearBotTimer(gameId);
        
      });
      // autoplay mode: Handle single-player join
      socket.on('joinSingle', (data) => {
        const { gameId, playerId, playerName, botNames } = data;
        this.joinSinglePlayer(gameId, playerId, playerName, botNames, socket);
      });
    });
  }
  // autoplay mode: Handle single-player join
  joinSinglePlayer(gameId: string, playerId: string, playerName: string, botNames: string[], socket: Socket): Game | null {
    if (this.games[gameId]) {
      console.log(`Game ${gameId} already exists`);
      return null;
    }
    const game = this.createGame(gameId, playerName, false);
    socket.join(gameId);
    game.isSinglePlayer = true;
    botNames.forEach((name, index) => {
      const botId = `${gameId}-bot${index + 1}`;
      game.players.push({
        id: botId,
        name,
        hand: [],
        title: null,
        isBot: true,
      });
    });
    console.log(`Single-player game ${gameId} created with ${game.players.length} players (${playerName} + ${botNames.length} bots)`);
    this.io.to(gameId).emit('gameUpdate', game);
    return game;
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
    if (!game.isTestMode && !game.isSinglePlayer && (game.players.length < this.MIN_PLAYERS || game.players.length > this.MAX_PLAYERS)) {
      console.log(`Cannot start game ${gameId}: Player count (${game.players.length}) not between ${this.MIN_PLAYERS} and ${this.MAX_PLAYERS}`);
      return null;
    }
    game.status = 'playing';
    this.shuffle(game.deck);
    this.deal(game);
    game.currentTurn = this.getNextValidPlayerIndex(game, 0);
    console.log(`Game ${gameId} started with ${game.players.length} players, starting with player ${game.players[game.currentTurn].name}`);
    if (!game.isTestMode) {
      this.startTurnTimer(gameId);
      // autoplay mode fix: Schedule bot play after turn assignment
      if (game.isSinglePlayer && game.players[game.currentTurn].isBot) {
        this.scheduleBotPlay(gameId);
      }
    }
    this.io.to(gameId).emit('gameUpdate', game);
    return game;
  }
 // autoplay mode fix: Improved bot play scheduling
 // autoplay mode fix: Stricter bot play scheduling
  // restart fix: Stricter bot play scheduling
  private scheduleBotPlay(gameId: string): void {
    this.clearBotTimer(gameId);
    const game = this.getGame(gameId);
    if (!game || game.status !== 'playing' || !game.isSinglePlayer) {
      console.log(`Cannot schedule bot play for game ${gameId}: Invalid game state`);
      return;
    }
    const player = game.players[game.currentTurn];
    if (!player.isBot) {
      console.log(`Cannot schedule bot play for ${player.name}: Not a bot`);
      return;
    }
    // restart fix: Validate current player is bot
    if (game.players[game.currentTurn].id !== player.id) {
      console.log(`Cannot schedule bot play for ${player.name}: Not current player`);
      return;
    }
    console.log(`Scheduling bot play for ${player.name} in game ${gameId}`);
    this.botTimers[gameId] = setTimeout(() => {
      this.playBotTurn(gameId, player.id);
    }, 5000); // 5-second delay
  }

  // restart fix: Enhanced logging for timer clearing
  private clearBotTimer(gameId: string): void {
    if (this.botTimers[gameId]) {
      console.log(`Cleared bot timer for ${gameId}`);
      clearTimeout(this.botTimers[gameId]);
      delete this.botTimers[gameId];
    }
  }

  // autoplay mode fix: Robust bot play logic
  private playBotTurn(gameId: string, botId: string): void {
    const game = this.getGame(gameId);
    if (!game || game.status !== 'playing' || !game.isSinglePlayer || game.players[game.currentTurn].id !== botId) {
      console.log(`Invalid bot turn attempt for ${botId} in game ${gameId}: Not current player or invalid state`);
      return;
    }
    const bot = game.players.find(p => p.id === botId);
    if (!bot || !bot.isBot || bot.hand.length === 0) {
      console.log(`Bot ${botId} cannot play: Invalid state`);
      return;
    }

    const prevPattern = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
    const validPatterns = this.getValidBotPatterns(bot.hand, prevPattern, game.currentPattern);
    if (validPatterns.length === 0) {
      console.log(`Bot ${bot.name} passes in game ${gameId}: No valid patterns`);
      this.pass(gameId, botId);
      return;
    }

    // smart bot fix: Pass game and bot context to chooseSmartPattern
    const selectedPattern = this.chooseSmartPattern(validPatterns, game, bot);
    if (selectedPattern.length === 0) {
      console.log(`Bot ${bot.name} passes in game ${gameId}: Strategic pass`);
      this.pass(gameId, botId);
      return;
    }

    const playedCardIds = selectedPattern.map(c => this.cardId(c));
    const updatedHand = bot.hand.filter(c => !playedCardIds.includes(this.cardId(c)));
    console.log(`Bot ${bot.name} plays pattern: ${selectedPattern.map(c => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`).join(', ')}`);
    
    const result = this.playPattern(gameId, botId, selectedPattern, updatedHand);
    if (!result) {
      console.log(`Bot ${bot.name} play failed, forcing pass`);
      this.pass(gameId, botId);
    }
  }
  // autoplay mode fix: Improved pattern generation
  private getValidBotPatterns(hand: Card[], prevPattern: Card[] | null, currentPattern: string | null): Card[][] {
    const patterns: Card[][] = [];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

    const createJokerCard = (card: Card, rank: string, suit: string): Card => ({
      ...card,
      assignedRank: rank,
      assignedSuit: suit,
    });

    if (!currentPattern || currentPattern === 'single') {
      hand.forEach(card => {
        if (card.isJoker) {
          for (const suit of suits) {
            for (const rank of ranks) {
              const jokerCard = createJokerCard(card, rank, suit);
              if (this.validatePattern([jokerCard], prevPattern, currentPattern)) {
                patterns.push([jokerCard]);
              }
            }
          }
        } else if (this.validatePattern([card], prevPattern, currentPattern)) {
          patterns.push([card]);
        }
      });

      const detailsCard = hand.find(c => c.isDetails);
      if (detailsCard && this.validatePattern([detailsCard], prevPattern, currentPattern)) {
        patterns.push([detailsCard]);
      }
    }

    if (!currentPattern || currentPattern === 'pair') {
      for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
          const cards = [hand[i], hand[j]];
          const effectiveCards = cards.map(c => c.isJoker ? createJokerCard(c, hand[i].rank || '3', hand[i].suit || 'hearts') : c);
          if (this.isValidPair(effectiveCards, prevPattern, currentPattern)) {
            patterns.push(effectiveCards);
          }
        }
      }
    }

    if (!currentPattern || currentPattern?.startsWith('group-')) {
      for (let size = 3; size <= 4; size++) {
        if (!currentPattern || currentPattern === `group-${size}`) {
          const combinations = this.getCombinations(hand, size);
          combinations.forEach(combo => {
            const effectiveCards = combo.map(c => c.isJoker ? createJokerCard(c, combo[0].rank || '3', combo[0].suit || 'hearts') : c);
            if (this.isValidGroup(effectiveCards, prevPattern, currentPattern)) {
              patterns.push(effectiveCards);
            }
          });
        }
      }
    }

    if (!currentPattern || currentPattern === 'consecutive') {
      // consecutive length fix: Use previous pattern length for consecutive
      const requiredLength = currentPattern === 'consecutive' && prevPattern ? prevPattern.length : null;
      const minLength = requiredLength || 2;
      const maxLength = requiredLength || hand.length;
      for (let length = minLength; length <= maxLength; length++) {
        const sequences = this.getConsecutiveSequences(hand, length);
        sequences.forEach(seq => {
          if (this.validatePattern(seq, prevPattern, currentPattern)) {
            patterns.push(seq);
          }
        });
      }
    }

    // Sort patterns to prioritize multi-card patterns over singles, then by value ascending
    return patterns.sort((a, b) => {
      const aValue = this.getPatternValue(a, currentPattern || this.getPatternType(a));
      const bValue = this.getPatternValue(b, currentPattern || this.getPatternType(b));
      const aIsSingle = a.length === 1;
      const bIsSingle = b.length === 1;
      if (aIsSingle && !bIsSingle) return 1;
      if (!aIsSingle && bIsSingle) return -1;
      return aValue - bValue;
    });
  }
  // autoplay mode fix: Validate pair with pattern check
  private isValidPair(cards: Card[], prevPattern: Card[] | null, currentPattern: string | null): boolean {
    if (cards.length !== 2) return false;
    const effectiveRanks = cards.map(c => c.isJoker ? c.assignedRank : c.rank);
    return effectiveRanks[0] === effectiveRanks[1] && this.validatePattern(cards, prevPattern, currentPattern);
  }
  
    // autoplay mode fix: Validate group with pattern check
  private isValidGroup(cards: Card[], prevPattern: Card[] | null, currentPattern: string | null): boolean {
    if (cards.length < 3 || cards.length > 4) return false;
    const effectiveRanks = cards.map(c => c.isJoker ? c.assignedRank : c.rank);
    return effectiveRanks.every(r => r === effectiveRanks[0]) && this.validatePattern(cards, prevPattern, currentPattern);
  }

  // autoplay mode: Get combinations of cards
  private getCombinations(cards: Card[], size: number): Card[][] {
    if (size === 1) return cards.map(c => [c]);
    const result: Card[][] = [];
    for (let i = 0; i < cards.length; i++) {
      const subCombinations = this.getCombinations(cards.slice(i + 1), size - 1);
      subCombinations.forEach(sub => result.push([cards[i], ...sub]));
    }
    return result;
  }

  // autoplay mode: Get consecutive sequences
  private getConsecutiveSequences(hand: Card[], length: number): Card[][] {
    const sequences: Card[][] = [];
    // two-card fix: Allow length of 2 or more
    if (length < 2) return sequences;

    const sortedCards = [...hand].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
    const suits = new Set(sortedCards.map(c => c.suit));

    for (const suit of suits) {
      const suitCards = sortedCards.filter(c => c.suit === suit || c.isJoker);
      if (suitCards.length < length) continue;

      for (let i = 0; i <= suitCards.length - length; i++) {
        const seq = suitCards.slice(i, i + length);
        let isValid = true;
        const effectiveCards = seq.map((c, idx) => {
          if (c.isJoker) {
            // two-card fix: Assign consecutive ranks for Jokers
            const baseRankValue = this.getCardValue(seq[0]) + idx;
            const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
            const assignedRank = ranks[(baseRankValue - 3) % ranks.length];
            return { ...c, assignedRank, assignedSuit: suit };
          }
          return c;
        });

        // two-card fix: Verify consecutiveness
        for (let j = 1; j < effectiveCards.length; j++) {
          if (this.getCardValue(effectiveCards[j]) !== this.getCardValue(effectiveCards[j - 1]) + 1) {
            isValid = false;
            break;
          }
        }

        if (isValid) {
          sequences.push(effectiveCards);
        }
      }
    }

    return sequences;
  }

  // autoplay mode fix: Choose smarter pattern
  // smart bot fix: Strategic pattern selection
  // round start fix: Prioritize low-value multi-card patterns at round start
  private chooseSmartPattern(patterns: Card[][], game: Game, bot: Player): Card[] {
    if (patterns.length === 0) return [];

    const prevPattern = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
    const prevValue = prevPattern ? this.getPatternValue(prevPattern, game.currentPattern) : 0;
    const activePlayers = game.players.filter(p => p.hand.length > 0 && p.id !== bot.id).length;
    const handSize = bot.hand.length;
    const isRoundStarter = game.pile.length === 0 && game.passCount === 0;
    const highCardThreshold = 12; // Value for J, Q, K, A, 2 (11, 12, 13, 14, 15)

    // Strategy weights
    let playThreshold = prevValue + 1; // Minimum value to beat
    const aggressiveFactor = handSize <= 3 || activePlayers === 1 ? 1.5 : 1.0; // Play stronger if low hand or few opponents
    const passChance = !isRoundStarter && Math.random() < 0.2 && prevValue < highCardThreshold && handSize > 5 ? true : false; // 20% chance to pass if pile is weak

    // round start fix: Pass not allowed for round starter
    if (passChance && !isRoundStarter) {
      console.log(`Bot ${bot.name} chooses to pass strategically to conserve high cards`);
      return [];
    }

    // round start fix: Select pattern based on strategy
    let bestPattern: Card[] | null = null;
    let bestScore = Infinity;

    for (const pattern of patterns) {
      const patternValue = this.getPatternValue(pattern, game.currentPattern || this.getPatternType(pattern));
      if (!isRoundStarter && patternValue <= prevValue) continue; // Skip patterns that don't beat previous

      // Calculate strategic score
      let score = patternValue * aggressiveFactor; // Base score is pattern value, adjusted by aggression
      if (handSize <= 3) {
        score -= 10; // Prioritize playing when hand is small to win
      }
      if (pattern.length > 2) {
        score += pattern.length * 2; // Penalize longer patterns to conserve cards
      }

      // round start fix: Adjust score for round start
      if (isRoundStarter) {
        if (pattern.length === 1) {
          score += 50; // Heavily penalize single-card plays
          if (patternValue >= highCardThreshold) {
            score += 20; // Extra penalty for high-value singles (J, Q, K, A, 2)
          }
        } else {
          score -= 10; // Favor multi-card patterns (pairs, consecutive)
          if (patternValue < highCardThreshold) {
            score -= 5; // Extra bonus for low-value multi-card patterns
          }
        }
      } else {
        if (pattern.length === 1 && patternValue >= highCardThreshold) {
          score += 10; // Penalize high-value singles in non-round-start
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestPattern = pattern;
      }
    }

    if (bestPattern) {
      console.log(`Bot ${bot.name} selects pattern with value ${this.getPatternValue(bestPattern, game.currentPattern || this.getPatternType(bestPattern))} (score: ${bestScore}, roundStarter: ${isRoundStarter})`);
      return bestPattern;
    }

    console.log(`Bot ${bot.name} passes: No strategically viable pattern`);
    return [];
  }

  // autoplay mode: Get pattern type
  private getPatternType(cards: Card[]): string {
    if (cards.length === 1) return 'single';
    if (cards.length === 2 && cards.every(c => (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? c.assignedRank : c.rank))) {
      return 'pair';
    }
    if (cards.length >= 3 && cards.length <= 4 && cards.every(c => (c.isJoker ? c.assignedRank : c.rank) === (cards[0].isJoker ? c.assignedRank : c.rank))) {
      return `group-${cards.length}`;
    }
    const sortedCards = [...cards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
    const isConsecutive = sortedCards.every((c, i) => i === 0 || this.getCardValue(c) === this.getCardValue(sortedCards[i - 1]) + 1);
    const sameSuit = sortedCards.every((c, i) => i === 0 || c.suit === sortedCards[0].suit);
    if (isConsecutive && sameSuit) {
      return 'consecutive';
    }
    return '';
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

  // restart fix: Clear timers during restart
  restartGame(gameId: string, playerId: string): Game | null {
    const game = this.getGame(gameId);
    if (!game || game.status !== 'finished') {
      console.log(`Cannot restart game ${gameId}: Game not found or not finished`);
      return null;
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      console.log(`Player ${playerId} not found in game ${gameId}`);
      return null;
    }

    // Find the Wise player to start the new game
    const wisePlayerIndex = game.players.findIndex(p => p.title === 'Wise');
    if (wisePlayerIndex === -1) {
      console.log(`No Wise player found in game ${gameId}`);
      return null;
    }
    console.log(`Wise player index: ${wisePlayerIndex} (player: ${game.players[wisePlayerIndex].name})`);

    // restart fix: Clear all timers before restarting
    this.clearTurnTimer(gameId);
    this.clearBotTimer(gameId);

    // Reset game state
    game.status = 'playing';
    game.pile = [];
    game.passCount = 0;
    game.passedPlayerIds = [];
    game.currentPattern = null;
    game.lastPlayedPlayerId = null;
    game.deck = this.createDeck();
    console.log('Creating deck');
    this.shuffle(game.deck);
    this.deal(game);
    console.log(`Dealt cards: ${game.players.map(p => `${p.hand.length} to ${p.name}`).join(', ')}`);
    game.currentTurn = wisePlayerIndex;
    game.players.forEach(p => p.title = null);

    console.log(`Game ${gameId} restarted with ${game.players.length} players, starting with player index ${wisePlayerIndex} (${game.players[wisePlayerIndex].name})`);
    if (!game.isTestMode) {
      this.startTurnTimer(gameId);
      // restart fix: Schedule bot play for starting player if bot
      if (game.isSinglePlayer && game.players[game.currentTurn].isBot) {
        this.scheduleBotPlay(gameId);
      }
    }
    this.io.to(gameId).emit('gameUpdate', game);
    return game;
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

  // autoplay mode fix: Centralize bot scheduling after play
  // details card fix: Handle Details card as single pattern
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
        this.io.to(gameId).emit('gameUpdate', game);
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

    if (this.validatePattern(cards, game.pile.length > 0 ? game.pile[game.pile.length - 1] : null, game.currentPattern)) {
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
        this.clearTurnTimer(gameId);
        this.clearBotTimer(gameId);
        game.currentTurn = this.getNextValidPlayerIndex(game, (game.currentTurn + 1) % game.players.length);
        console.log(`Play successful, pile: ${game.pile.length}, pattern: ${game.currentPattern}, next turn: ${game.players[game.currentTurn].name}`);
        this.startTurnTimer(gameId);
        if (game.isSinglePlayer && game.players[game.currentTurn].isBot) {
          this.scheduleBotPlay(gameId);
        }
      }

      this.io.to(gameId).emit('gameUpdate', game);
      return game;
    }

    console.log(`Invalid pattern for ${playerId}`);
    return null;
  }


  // autoplay mode fix: Centralize bot scheduling after pass
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
      this.clearTurnTimer(gameId);
      this.clearBotTimer(gameId); // autoplay mode fix: Clear timers
      game.currentTurn = this.getNextValidPlayerIndex(game, nextPlayerIndex);
      console.log(`New round started for game ${gameId}, starting player: ${game.players[game.currentTurn].name}`);
    } else {
      this.clearTurnTimer(gameId);
      this.clearBotTimer(gameId); // autoplay mode fix: Clear timers
      game.currentTurn = this.getNextValidPlayerIndex(game, (game.currentTurn + 1) % game.players.length);
      console.log(`Player ${playerId} passed, passCount: ${game.passCount}, passedPlayers: ${game.passedPlayerIds}, next turn: ${game.players[game.currentTurn].name}`);
    }

    // autoplay mode fix: Start timer and schedule bot play
    this.startTurnTimer(gameId);
    if (game.isSinglePlayer && game.players[game.currentTurn].isBot) {
      this.scheduleBotPlay(gameId);
    }
    this.io.to(gameId).emit('gameUpdate', game);
    return game;
  }
  // autoplay mode fix: Clear bot timer on turn timeout
  // autoplay mode fix: Ensure bot timer is cleared on timeout
  // restart fix: Validate current player in turn timer
  private startTurnTimer(gameId: string): void {
    this.clearTurnTimer(gameId);
    const game = this.getGame(gameId);
    if (!game || game.isTestMode || game.status !== 'playing') {
      console.log(`Cannot start turn timer for game ${gameId}: Invalid state`);
      return;
    }
    const playerId = game.players[game.currentTurn].id;
    this.turnTimers[gameId] = setTimeout(() => {
      // restart fix: Validate current player before timeout pass
      if (game.players[game.currentTurn].id !== playerId) {
        console.log(`Turn timeout skipped for ${playerId} in game ${gameId}: No longer current player`);
        return;
      }
      console.log(`Turn timeout for player ${playerId} in game ${gameId}`);
      this.clearBotTimer(gameId);
      this.pass(gameId, playerId);
    }, this.TURN_TIMEOUT);
    this.io.to(gameId).emit('turnTimerStart', {
      playerId,
      duration: this.TURN_TIMEOUT / 1000,
    });
  }

  // restart fix: Enhanced logging for timer clearing
  private clearTurnTimer(gameId: string): void {
    if (this.turnTimers[gameId]) {
      console.log(`Cleared turn timer for ${gameId}`);
      clearTimeout(this.turnTimers[gameId]);
      delete this.turnTimers[gameId];
    }
  }

  // autoplay mode fix: Remove bot scheduling from turn advancement
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

  // details card fix: Set pattern to single for Details card
  private updatePattern(cards: Card[], game: Game): void {
    if (cards.some(c => c.isDetails)) {
      // details card fix: Details card sets pattern to single
      game.currentPattern = 'single';
      return;
    }

    const effectiveCards = cards.map(c => ({
      ...c,
      rank: c.isJoker ? c.assignedRank : c.rank,
      suit: c.isJoker ? c.assignedSuit : c.suit,
    }));

    if (effectiveCards.length === 1) {
      game.currentPattern = 'single';
    } else if (effectiveCards.length === 2) {
      if (effectiveCards.every(c => c.rank === effectiveCards[0].rank)) {
        game.currentPattern = 'pair';
      } else {
        game.currentPattern = 'consecutive';
      }
    } else if (effectiveCards.length >= 3 && effectiveCards.length <= 4 && effectiveCards.every(c => c.rank === effectiveCards[0].rank)) {
      game.currentPattern = `group-${effectiveCards.length}`;
    } else if (effectiveCards.length >= 2) {
      game.currentPattern = 'consecutive';
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
      // details card fix: Details card must be played as single pattern
      if (currentPattern && currentPattern !== 'single') {
        console.log(`Invalid pattern: Details card can only be played as single, current pattern is ${currentPattern}`);
        return false;
      }
      return true; // Details card is valid as single pattern
    }

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
    } else if (effectiveCards.length === 2) {
      if (effectiveCards.every(c => c.rank === effectiveCards[0].rank)) {
        patternType = 'pair';
      } else {
        const sortedCards = [...effectiveCards].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
        const isConsecutive = this.getCardValue(sortedCards[1]) === this.getCardValue(sortedCards[0]) + 1;
        const sameSuit = sortedCards[0].suit === sortedCards[1].suit;
        if (isConsecutive && sameSuit) {
          patternType = 'consecutive';
        } else {
          console.log('Invalid pattern: Two cards must form a pair (same rank) or consecutive sequence (sequential ranks, same suit)');
          return false;
        }
      }
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

    if (currentPattern === 'consecutive' && prevPattern && prevPattern.length !== cards.length) {
      console.log(`Invalid pattern: Consecutive pattern must have ${prevPattern.length} cards, got ${cards.length}`);
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