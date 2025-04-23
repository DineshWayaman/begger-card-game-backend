import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { GameService } from './services/gameService';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const gameService = new GameService();

app.get('/', (req, res) => {
  res.send('Beggar Card Game Server');
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('join', (data) => {
    const { gameId, playerId, playerName, isTestMode } = data;
    console.log(`Join request: gameId=${gameId}, playerId=${playerId}, playerName=${playerName}, isTestMode=${isTestMode}`);
    let game = gameService.getGame(gameId);
    if (!game) {
      game = gameService.createGame(gameId, playerName, isTestMode);
    } else {
      game = gameService.joinGame(gameId, playerName);
    }
    if (game) {
      socket.join(gameId);
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
    console.log(`Start game requested by ${playerId} for game ${gameId}`);
    const game = gameService.startGameManually(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Game ${gameId} started`);
    } else {
      socket.emit('error', 'Cannot start game');
      console.log(`Start game failed for ${gameId}`);
    }
  });

  socket.on('restartGame', (data) => {
    const { gameId, playerId } = data;
    console.log(`Restart game requested by ${playerId} for game ${gameId}`);
    const { game, dismissDialog } = gameService.restartGame(gameId, playerId);
    if (game) {
      if (dismissDialog) {
        io.to(gameId).emit('dismissDialog');
        console.log(`Broadcasted dismissDialog to game ${gameId}`);
      }
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Game ${gameId} restarted`);
    } else {
      socket.emit('error', 'Cannot restart game');
      console.log(`Restart game failed for ${gameId}`);
    }
  });

  socket.on('playPattern', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log(`Play pattern by ${playerId} in game ${gameId}: ${cards.map((c: any) => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`).join(', ')}`);
    const game = gameService.playPattern(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Play successful in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid play');
      console.log(`Play failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('pass', (data) => {
    const { gameId, playerId } = data;
    console.log(`Pass by ${playerId} in game ${gameId}`);
    const game = gameService.pass(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Pass successful in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid pass');
      console.log(`Pass failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('takeChance', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log(`Take chance by ${playerId} in game ${gameId}: ${cards.map((c: any) => c.isJoker ? `${c.assignedRank} of ${c.assignedSuit}` : c.isDetails ? 'Details' : `${c.rank} of ${c.suit}`).join(', ')}`);
    const game = gameService.takeChance(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Take chance successful in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid take chance');
      console.log(`Take chance failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('updateHandOrder', (data) => {
    const { gameId, playerId, hand } = data;
    console.log(`Update hand order by ${playerId} in game ${gameId}`);
    const game = gameService.updateHandOrder(gameId, playerId, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
      console.log(`Hand order updated in game ${gameId}`);
    } else {
      socket.emit('error', 'Invalid hand order');
      console.log(`Hand order update failed for ${playerId} in game ${gameId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});