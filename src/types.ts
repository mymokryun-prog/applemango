/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LatLngTuple {
  lat: number;
  lng: number;
}

export interface Friend {
  id: string;
  name: string;
  avatar: string; // Emoji avatar or image icon
  color: string;  // Hex color code or Tailwind color string
  lat: number;
  lng: number;
  statusMsg: string;
  isOnline: boolean;
  battery: number;
  speed: number;       // in km/h
  heading: string;     // direction e.g., 'North-East'
  route: Array<[number, number]>; // Simulated historical or planned route path coordinates
  routeIndex: number;  // Current step in path simulation
  updatedAt: string;
  heartRate?: number;
  heartRateEnabled?: boolean;
  heartRateHistory?: Array<{ timestamp: string; bpm: number }>;
  isSafe?: boolean;
  pedometerEnabled?: boolean;
  stepsToday?: number;
  dailyStepGoal?: number;
  phone?: string;
  realName?: string;
  alias?: string;
  isPendingInvite?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: string;
  locationShared?: {
    lat: number;
    lng: number;
    placeName: string;
  };
  isSystem?: boolean;
  isInviteCard?: boolean;
  inviteId?: string;
}

export interface Appointment {
  id: string;
  title: string;
  placeName: string;
  lat: number;
  lng: number;
  datetime: string;
  creatorName: string;
  attendees: string[]; // List of Friend names attending
  votes: Record<string, 'yes' | 'no' | 'maybe'>; // Friend ID to vote mapping
}

export interface NotificationAlert {
  id: string;
  type: 'chat' | 'promise' | 'arrival' | 'invite' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface Room {
  id: string;
  name: string;
  emoji: string;
  type: 'friends' | 'family' | 'work' | 'care' | 'custom';
  memberCount: number;
  trackingStyle?: 'continuous' | 'temporary';
  isDisbanded?: boolean;
  ownerId?: string;
}
