import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { GameService } from './services/gameService';
import { VoiceSignalingService } from './services/voice_signaling_service';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const gameService = new GameService(io);
const voiceSignalingService = new VoiceSignalingService(io);

app.get('/', (req, res) => {
  res.send('Beggar Card Game Server');
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle voice signaling
  voiceSignalingService.handleVoiceSignaling(socket);

  // Updated join event handler to fix TypeError
  socket.on('join', (data) => {
    const { gameId, playerId, playerName, isTestMode } = data;
    console.log(`Join request: gameId=${gameId}, playerId=${playerId}, playerName=${playerName}, isTestMode=${isTestMode}`);
    // Validate input data
    if (!gameId || !playerName) {
      socket.emit('error', 'Missing gameId or playerName');
      console.log(`Join failed: Missing gameId or playerName`);
      return;
    }
    let game = gameService.getGame(gameId);
    if (!game) {
      // Create new game if it doesn't exist
      game = gameService.createGame(gameId, playerName, isTestMode);
    } else {
      // Join existing game, passing socket
      game = gameService.joinGame(gameId, playerName, socket);
    }
    if (game) {
      // Emit game update to the player and room
      socket.emit('gameUpdate', game);
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Player ${playerName} joined game ${gameId}. Players: ${game.players.length}`);
    } else {
      socket.emit('error', gameService.getGame(gameId)?.status === 'playing' ? 'Game has already started' : 'Game is full');
      console.log(`Join failed for ${playerName} in game ${gameId}`);
    }
  });

  socket.on('requestGameState', (data) => {
    const { gameId } = data;
    console.log(`Game state requested for game ${gameId}`);
    const game = gameService.getGame(gameId);
    if (game) {
      socket.emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Game not found');
    }
  });

  socket.on('startGame', (data) => {
    const { gameId, playerId } = data;
    console.log(`Start game request: gameId=${gameId}, playerId=${playerId}`);
    const game = gameService.startGameManually(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Game ${gameId} started by ${playerId}`);
    } else {
      socket.emit('error', 'Failed to start game: Invalid conditions');
      console.log(`Start game failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('restartGame', (data) => {
    const { gameId, playerId } = data;
    console.log(`Restart game request: gameId=${gameId}, playerId=${playerId}`);
    const restartResult = gameService.restartGame(gameId, playerId);
    const game = restartResult && 'game' in restartResult ? restartResult.game : restartResult;
    const dismissDialog = restartResult && 'dismissDialog' in restartResult ? restartResult.dismissDialog : undefined;
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      if (dismissDialog) {
        io.to(gameId).emit('dismissDialog');
      }
      console.log(`Game ${gameId} restarted by ${playerId}`);
    } else {
      socket.emit('error', 'Failed to restart game');
      console.log(`Restart game failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('playPattern', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log(`Play pattern request: gameId=${gameId}, playerId=${playerId}, cards=${cards.length}`);
    const game = gameService.playPattern(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Play successful by ${playerId} in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid play');
      console.log(`Play failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('pass', (data) => {
    const { gameId, playerId } = data;
    console.log(`Pass request: gameId=${gameId}, playerId=${playerId}`);
    const game = gameService.pass(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Pass successful by ${playerId} in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid pass');
      console.log(`Pass failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('updateHandOrder', (data) => {
    const { gameId, playerId, hand } = data;
    console.log(`Update hand order request: gameId=${gameId}, playerId=${playerId}, handLength=${hand.length}`);
    const game = gameService.updateHandOrder(gameId, playerId, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Hand order updated for ${playerId} in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid hand order update');
      console.log(`Hand order update failed for ${playerId} in game ${gameId}`);
    }
  });

  // Updated disconnect handler to integrate with GameService
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Notify GameService to handle disconnection with 30-second timeout
    gameService.handleDisconnect(socket);
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});