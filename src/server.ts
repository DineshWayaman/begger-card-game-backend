import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { GameService } from './services/gameService';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const gameService = new GameService();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join', (data) => {
    const { gameId, playerId, playerName, isTestMode } = data;
    console.log(`Join attempt: gameId=${gameId}, playerName=${playerName}, isTestMode=${isTestMode}`);
    let game = gameService.getGame(gameId);
    if (!game) {
      game = gameService.createGame(gameId, playerName, isTestMode);
    } else if (game.players.length >= 6) {
      console.log(`Join failed: Game ${gameId} is full (6 players)`);
      socket.emit('error', 'Game is full');
      return;
    } else if (game.status !== 'waiting') {
      console.log(`Join failed: Game ${gameId} is already started`);
      socket.emit('error', 'Game has already started');
      return;
    } else {
      game = gameService.joinGame(gameId, playerName);
    }
    if (game) {
      socket.join(gameId);
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Player ${playerName} joined game ${gameId}. Players: ${game.players.length}`);
    } else {
      console.log(`Join failed for player ${playerName} in game ${gameId}`);
      socket.emit('error', 'Failed to join game');
    }
  });

  socket.on('startGame', (data) => {
    const { gameId, playerId } = data;
    console.log(`Start game attempt: gameId=${gameId}, playerId=${playerId}`);
    const game = gameService.startGameManually(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Game ${gameId} started by ${playerId}`);
    } else {
      socket.emit('error', 'Failed to start game');
      console.log(`Start game failed for ${gameId} by ${playerId}`);
    }
  });

  socket.on('requestGameState', (data) => {
    const { gameId } = data;
    const game = gameService.getGame(gameId);
    if (game) {
      socket.emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Game not found');
    }
  });

  socket.on('playPattern', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log('Received playPattern:', { gameId, playerId, cards });
    const game = gameService.playPattern(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid play');
    }
  });

  socket.on('pass', (data) => {
    const { gameId, playerId } = data;
    console.log('Received pass:', { gameId, playerId });
    const game = gameService.pass(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid pass');
    }
  });

  socket.on('takeChance', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log('Received takeChance:', { gameId, playerId, cards });
    const game = gameService.takeChance(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid take chance');
    }
  });

  socket.on('updateHandOrder', (data) => {
    const { gameId, playerId, hand } = data;
    console.log('Received updateHandOrder:', { gameId, playerId });
    const game = gameService.updateHandOrder(gameId, playerId, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid hand order update');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});