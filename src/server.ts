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
  console.log('Client connected:', socket.id);

  socket.on('join', (data) => {
    console.log('Join request:', data);
    const game = gameService.joinGame(data.gameId, data.playerId, data.playerName, data.isTestMode || false);
    if (game) {
      socket.join(data.gameId);
      console.log(`Emitting update to ${data.gameId}:`, game);
      io.to(data.gameId).emit('update', game);
    } else {
      console.log('Join failed');
      socket.emit('error', 'Cannot join game');
    }
  });

  socket.on('playPattern', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log('Received playPattern:', { gameId, playerId, cards, hand });
    const game = gameService.playPattern(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid play');
    }
  });

  socket.on('pass', (data) => {
    const { gameId, playerId } = data;
    const game = gameService.pass(gameId, playerId);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid pass');
    }
  });

  socket.on('takeChance', (data) => {
    const { gameId, playerId, cards, hand } = data;
    console.log('Received takeChance:', { gameId, playerId, cards, hand });
    const game = gameService.takeChance(gameId, playerId, cards, hand);
    if (game) {
      io.to(gameId).emit('gameUpdate', game);
    } else {
      socket.emit('error', 'Invalid take chance');
    }
  });

   // Fix: Handle hand order updates from drag-and-drop
   socket.on('updateHandOrder', (data) => {
    const { gameId, playerId, hand } = data;
    console.log('Received updateHandOrder:', { gameId, playerId, hand });
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
  

app.get('/', (req, res) => {
  res.send('Card Game Backend');
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});