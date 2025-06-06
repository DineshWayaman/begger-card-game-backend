import { Card } from './card';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  title: 'King' | 'Wise' | 'Beggar' | 'Civilian' | 'Citizen' | null;
  isBot?: boolean;
  socketId?: string; // Added to store the socket ID for disconnection handling
}