import { Server, Socket } from 'socket.io';

interface VoiceParticipant {
  playerId: string;
  connectionId: string;
  socketId: string;
}

export class VoiceSignalingService {
  private io: Server;
  private voiceParticipants: { [gameId: string]: VoiceParticipant[] } = {};

  constructor(io: Server) {
    this.io = io;
  }

  handleVoiceSignaling(socket: Socket): void {
    socket.on('joinVoice', (data: { gameId: string; playerId: string; connectionId: string }) => {
      const { gameId, playerId, connectionId } = data;
      console.log(`Player ${playerId} joined voice chat for game ${gameId} with connection ${connectionId}`);

      if (!this.voiceParticipants[gameId]) {
        this.voiceParticipants[gameId] = [];
      }

      this.voiceParticipants[gameId].push({
        playerId,
        connectionId,
        socketId: socket.id,
      });

      socket.join(gameId);

      // Notify other participants about the new participant (exclude sender)
      socket.to(gameId).emit('voiceSignal', {
        type: 'newVoiceParticipant',
        fromPlayerId: playerId,
        fromConnectionId: connectionId,
        gameId,
      });

      console.log(`Voice participants in game ${gameId}: ${this.voiceParticipants[gameId].length}`);
    });

    socket.on('voiceSignal', (data: any) => {
      const { gameId, toPlayerId, toConnectionId, fromPlayerId, fromConnectionId } = data;
      const recipient = this.voiceParticipants[gameId]?.find(
        (p) => p.playerId === toPlayerId && p.connectionId === toConnectionId
      );

      if (recipient) {
        this.io.to(recipient.socketId).emit('voiceSignal', {
          ...data,
          fromPlayerId,
          fromConnectionId,
        });
        console.log(`Forwarded voice signal from ${fromPlayerId} to ${toPlayerId} in game ${gameId}`);
      } else {
        console.log(`Recipient ${toPlayerId} not found in game ${gameId}`);
      }
    });

    socket.on('disconnect', () => {
      for (const gameId in this.voiceParticipants) {
        this.voiceParticipants[gameId] = this.voiceParticipants[gameId].filter(
          (p) => p.socketId !== socket.id
        );
        if (this.voiceParticipants[gameId].length === 0) {
          delete this.voiceParticipants[gameId];
        }
      }
      console.log(`Socket ${socket.id} disconnected from voice chat`);
    });
  }
}