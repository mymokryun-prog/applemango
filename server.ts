/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import CryptoJS from 'crypto-js';
import webpush from 'web-push';
import axios from 'axios';

dotenv.config();

// Constants
const PORT = Number(process.env.PORT) || 3000;
const VITE_HMR_PORT = Number(process.env.VITE_HMR_PORT) || 24679;
const HONGDAE_LAT = 37.5565;
const HONGDAE_LNG = 126.9242;
const JWT_SECRET = process.env.JWT_SECRET || 'aemang-secret-key-change-this-in-production';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'aemang-location-encryption-key-2026';
const EMERGENCY_API_KEY = process.env.EMERGENCY_API_KEY || 'fake-119-api-key'; // For production: real 119 API key
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@applemangotalk.app';

// Emergency service config (simulation)
const EMERGENCY_API_ENDPOINT = process.env.EMERGENCY_API_ENDPOINT || 'https://api.119emergency.go.kr/v1/dispatch';

// Initialize Google GenAI if API key exists
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    console.log('Gemini API success: Google GenAI initialized.');
  } catch (err) {
    console.error('Error initializing Gemini client:', err);
  }
} else {
  console.log('No GEMINI_API_KEY found, running AI in fallback/simulated mode.');
}

const ensureVapidKeys = () => {
  let publicKey = VAPID_PUBLIC_KEY;
  let privateKey = VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    const generatedKeys = webpush.generateVAPIDKeys();
    publicKey = generatedKeys.publicKey;
    privateKey = generatedKeys.privateKey;
    process.env.VAPID_PUBLIC_KEY = publicKey;
    process.env.VAPID_PRIVATE_KEY = privateKey;
    console.warn('Generated temporary VAPID keys for development. Persist these in production environment variables.');
  }

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  return { publicKey, privateKey };
};

const vapidKeys = ensureVapidKeys();

const pushSubscriptions: any[] = [];

// 지오펜스 안심 구역: friendId → { lat, lng, radiusM }
const geofences: Record<string, { lat: number; lng: number; radiusM: number }> = {};

const broadcastPushNotification = async (title: string, body: string, data: any = {}) => {
  const payload = JSON.stringify({ title, body, data });
  const results = await Promise.allSettled(
    pushSubscriptions.map(async (subscription, index) => {
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (error: any) {
        console.warn('Push send failed, removing subscription if invalid:', error?.statusCode || error?.message);
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          pushSubscriptions.splice(index, 1);
        }
      }
    })
  );
  return results;
};

// ============= SECURITY & VALIDATION MIDDLEWARE =============

// 1. Validation Schemas (Zod)
const MessageSchema = z.object({
  senderId: z.string().min(1).max(100),
  senderName: z.string().min(1).max(100),
  senderAvatar: z.string().max(10),
  senderColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  text: z.string().max(5000).optional(),
  locationShared: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    placeName: z.string().max(200)
  }).optional(),
  roomId: z.string().optional()
});

const FriendInviteSchema = z.object({
  name: z.string().min(1).max(50),
  avatar: z.string().max(10),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  phone: z.string().regex(/^0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}$/, 'Invalid phone format'),
  roomId: z.string().optional(),
  creatorName: z.string().optional()
});

const AppointmentSchema = z.object({
  title: z.string().min(1).max(200),
  placeName: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  datetime: z.string().max(100),
  creatorName: z.string().max(100),
  roomId: z.string().optional()
});

const LocationUpdateSchema = z.object({
  id: z.string(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  statusMsg: z.string().max(500).optional(),
  roomId: z.string().optional()
});

const PedometerSchema = z.object({
  id: z.string(),
  pedometerEnabled: z.boolean().optional(),
  stepsToday: z.number().min(0).optional(),
  roomId: z.string().optional()
});

const HeartRateSchema = z.object({
  id: z.string(),
  heartRateEnabled: z.boolean().optional(),
  heartRate: z.number().min(30).max(220).optional(),
  roomId: z.string().optional()
});

const ProfileSchema = z.object({
  phone: z.string().regex(/^\d{2,3}-\d{3,4}-\d{4}$/, 'Invalid phone format').optional(),
  realName: z.string().min(1).max(50).optional(),
  alias: z.string().min(1).max(50).optional()
});

const RoomSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().min(1).max(10),
  type: z.enum(['friends', 'family', 'work', 'care', 'custom']),
  trackingStyle: z.enum(['continuous', 'temporary']).optional()
});

// 2. Authentication Middleware
export interface AuthRequest extends Request {
  user?: { userId: string };
}

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // 토큰 없으면 헤더의 x-user-id 사용 (프론트에서 전화번호 기반 ID 전송)
  if (!token) {
    const userId = (req.headers['x-user-id'] as string) || 'guest-' + Date.now();
    req.user = { userId };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      console.warn('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Generate token for user (used for login/registration)
const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

// 3. Validation Middleware Factory — safeParse 사용 (Zod v4 호환)
const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = (result.error?.issues || []).map((e: any) => ({
        field: (e.path || []).join('.'),
        message: e.message
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.body = result.data;
    next();
  };
};

// 4. Error Handling Middleware
const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.issues
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(403).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(403).json({ error: 'Token expired' });
  }

  res.status(err.statusCode || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message
  });
};

// 5. Safe Response Wrapper
const tryCatch = (fn: Function) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

// ============= ENCRYPTION & SECURITY UTILITIES =============

// Encrypt location data for transmission
const encryptLocation = (lat: number, lng: number): string => {
  const data = JSON.stringify({ lat, lng, timestamp: Date.now() });
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
};

// Decrypt location data
const decryptLocation = (encrypted: string): { lat: number; lng: number; timestamp: number } | null => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

// Hash sensitive data (phone numbers)
const hashPhoneNumber = (phone: string): string => {
  return CryptoJS.SHA256(phone + ENCRYPTION_KEY).toString();
};

// ============= EMERGENCY 119 SERVICE INTEGRATION =============

// Mock 119 Emergency API call 
const call119Emergency = async (friendData: any): Promise<{ success: boolean; dispatchId: string; eta: number }> => {
  try {
    // For development: simulate 119 call
    if (process.env.NODE_ENV !== 'production') {
      console.log('🚨 [DEV MODE] Simulated 119 emergency dispatch:', {
        name: friendData.name,
        location: `${friendData.lat}, ${friendData.lng}`,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        dispatchId: `DISP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eta: Math.floor(Math.random() * 10) + 5 // 5-15분
      };
    }

    // For production: call actual 119 API
    // Example structure (실제 119 API 문서에 따라 조정 필요)
    const dispatchPayload = {
      apiKey: EMERGENCY_API_KEY,
      incident: {
        type: 'MEDICAL_EMERGENCY',
        severity: 'CRITICAL',
        location: {
          latitude: friendData.lat,
          longitude: friendData.lng,
          address: `위도 ${friendData.lat.toFixed(4)}, 경도 ${friendData.lng.toFixed(4)}`
        },
        patient: {
          name: friendData.name,
          contact: friendData.phone,
          vitals: {
            heartRate: friendData.heartRate || 'unknown'
          }
        },
        timestamp: new Date().toISOString()
      }
    };

    // Placeholder for actual HTTP request
    // const response = await fetch(EMERGENCY_API_ENDPOINT, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(dispatchPayload)
    // });

    console.log('🚨 Emergency dispatch initiated:', dispatchPayload);
    return {
      success: true,
      dispatchId: `DISP-${Date.now()}`,
      eta: 7
    };
  } catch (error) {
    console.error('Emergency call failed:', error);
    return { success: false, dispatchId: 'ERROR', eta: 0 };
  }
};

// In-Memory Database State
// 환영 메시지 생성 헬퍼
function welcomeMsg(id: string, text: string) {
  return [{
    id: `msg-welcome-${id}`,
    senderId: 'system',
    senderName: '애플망고톡',
    senderAvatar: '🍎',
    senderColor: '#f59e0b',
    text,
    timestamp: new Date().toISOString(),
    isSystem: true,
  }];
}

// ── 기본 빈 룸 (데모 데이터 없음) ──────────────────────────────────────────
const dbRooms: Record<string, any> = {
  'room-friends': {
    id: 'room-friends', name: '애플망고 단짝방', emoji: '🥭',
    type: 'friends', trackingStyle: 'temporary', isDisbanded: false,
    messages: welcomeMsg('friends', '🍎🥭 애플망고 단짝방에 오신 것을 환영합니다! 친구를 초대해서 실시간 위치를 공유해 보세요. 채팅에서 @망고봇 을 부르면 모임 장소도 추천해 드려요!'),
    friends: {}, appointments: [], notifications: []
  },
  'room-family': {
    id: 'room-family', name: '애플망고 가족방', emoji: '🏠',
    type: 'family', trackingStyle: 'continuous', isDisbanded: false,
    messages: welcomeMsg('family', '🏠 가족 안심방이 활성화되었습니다. 가족을 초대하여 상시 위치 공유를 시작하세요!'),
    friends: {}, appointments: [], notifications: []
  },
  'room-work': {
    id: 'room-work', name: '애플망고 직장방', emoji: '👔',
    type: 'work', trackingStyle: 'temporary', isDisbanded: false,
    messages: welcomeMsg('work', '👔 직장 동료 방이 활성화되었습니다. 외근·미팅 위치를 공유해 보세요!'),
    friends: {}, appointments: [], notifications: []
  },
  'room-care': {
    id: 'room-care', name: '애플망고 효도방', emoji: '👵',
    type: 'care', trackingStyle: 'continuous', isDisbanded: false,
    messages: welcomeMsg('care', '👵 부모님 안심 효도방이 활성화되었습니다. 부모님을 초대하여 실시간 위치와 건강 정보를 확인하세요!'),
    friends: {}, appointments: [], notifications: []
  }
};

const nameOptions = ['애플짱 🍎', '메론이 🍈', '오렌지 🍊', '망고킹 🥭', '피치피치 🍑', '그레이프 🍇'];
const avatarOptions = ['🍎', '🍈', '🍊', '🥭', '🍑', '🍇'];
const colorOptions = ['#EF4444', '#10B981', '#F97316', '#FACC15', '#EC4899', '#8B5CF6'];

// 사용자 위치를 모든 참여 룸에 동기화
function syncUserAllRooms(userId: string, lat: number, lng: number, statusMsg?: string) {
  Object.keys(dbRooms).forEach(rId => {
    const r = dbRooms[rId];
    if (r.friends[userId]) {
      r.friends[userId].lat = lat;
      r.friends[userId].lng = lng;
      if (statusMsg !== undefined) r.friends[userId].statusMsg = statusMsg;
      r.friends[userId].updatedAt = new Date().toISOString();
    }
  });
}

// 사용자 프로필 찾기 헬퍼
function findUserProfile(userId: string): any {
  for (const roomId of Object.keys(dbRooms)) {
    const room = dbRooms[roomId];
    if (room.friends[userId]) {
      return room.friends[userId];
    }
  }
  return null;
}

/** Last GPS sample per room+friend — used for speed/heading */
const lastGpsPosition: Record<string, { lat: number; lng: number; time: number }> = {};

let broadcastLocationToRoom: ((roomId: string, payload: Record<string, unknown>) => void) | null = null;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function headingFromDelta(latDiff: number, lngDiff: number): string {
  if (Math.abs(latDiff) < 0.00001 && Math.abs(lngDiff) < 0.00001) return '정지';
  if (latDiff > 0 && Math.abs(lngDiff) < Math.abs(latDiff)) return '북쪽';
  if (latDiff < 0 && Math.abs(lngDiff) < Math.abs(latDiff)) return '남쪽';
  if (lngDiff > 0 && Math.abs(latDiff) < Math.abs(lngDiff)) return '동쪽';
  if (lngDiff < 0 && Math.abs(latDiff) < Math.abs(lngDiff)) return '서쪽';
  if (latDiff > 0 && lngDiff > 0) return '북동쪽';
  if (latDiff > 0 && lngDiff < 0) return '북서쪽';
  if (latDiff < 0 && lngDiff > 0) return '남동쪽';
  return '남서쪽';
}

function checkAppointmentArrival(room: { appointments: any[]; notifications: any[]; friends: Record<string, any> }, friendId: string, lat: number, lng: number) {
  const friend = room.friends[friendId];
  if (!friend) return;
  room.appointments.forEach((app: { lat: number; lng: number }) => {
    const dist = Math.sqrt(Math.pow(app.lat - lat, 2) + Math.pow(app.lng - lng, 2));
    if (dist < 0.003) {
      const exists = room.notifications.find((n: { message: string }) =>
        n.message.includes(`${friend.name} 님이 약속 장소 반경 300m`)
      );
      if (!exists) {
        room.notifications.unshift({
          id: `notif-dist-${Date.now()}`,
          type: 'arrival',
          title: '약속 장소 거의 도착!',
          message: `${friend.name} 님이 약속 장소 반경 300m 이내로 도달했습니다. 🍎`,
          timestamp: new Date().toISOString(),
          read: false
        });
      }
    }
  });
}

/**
 * Apply GPS/manual location to a friend and optionally broadcast via Socket.IO
 */
function applyFriendLocationUpdate(
  roomId: string,
  friendId: string,
  lat: number,
  lng: number,
  statusMsg?: string,
  options: { broadcast?: boolean; source?: 'gps' | 'manual' } = {}
): Record<string, unknown> | null {
  const room = dbRooms[roomId] || dbRooms['room-friends'];
  if (!room?.friends[friendId]) return null;

  const friend = room.friends[friendId];
  const now = Date.now();
  const posKey = `${roomId}:${friendId}`;
  const prev = lastGpsPosition[posKey];

  let speed = 0;
  let heading = friend.heading || '정지';

  if (prev) {
    const dtSec = (now - prev.time) / 1000;
    const distM = haversineMeters(prev.lat, prev.lng, lat, lng);
    if (dtSec > 0.5 && distM > 2) {
      speed = Math.round(((distM / dtSec) * 3.6) * 10) / 10;
      heading = headingFromDelta(lat - prev.lat, lng - prev.lng);
    } else if (distM <= 2) {
      speed = 0;
      heading = '정지';
    }
  }

  lastGpsPosition[posKey] = { lat, lng, time: now };

  friend.lat = lat;
  friend.lng = lng;
  friend.speed = speed;
  friend.heading = heading;
  friend.isOnline = true;
  friend.updatedAt = new Date().toISOString();
  if (statusMsg !== undefined) friend.statusMsg = statusMsg;

  if (!Array.isArray(friend.route)) friend.route = [];
  const lastCoord = friend.route[friend.route.length - 1];
  if (!lastCoord || lastCoord[0] !== lat || lastCoord[1] !== lng) {
    friend.route.push([lat, lng]);
    if (friend.route.length > 60) friend.route.shift();
  }
  friend.routeIndex = Math.max(0, friend.route.length - 1);

  if (false) {  // 레거시 제거
    syncUserAllRooms(friendId, lat, lng, statusMsg);
  }

  checkAppointmentArrival(room, friendId, lat, lng);

  const payload = {
    friendId,
    lat,
    lng,
    statusMsg: friend.statusMsg,
    speed: friend.speed,
    heading: friend.heading,
    battery: friend.battery,
    heartRate: friend.heartRate,
    route: friend.route,
    routeIndex: friend.routeIndex,
    updatedAt: friend.updatedAt,
    isOnline: true,
    source: options.source || 'gps'
  };

  if (options.broadcast && broadcastLocationToRoom) {
    broadcastLocationToRoom(roomId, payload);
  }

  return payload;
}

function simulateMovement() {
  Object.keys(dbRooms).forEach(roomId => {
    const room = dbRooms[roomId];
    Object.keys(room.friends).forEach(id => {
      const friend = room.friends[id];
      if (id === 'user-minsu') return; // Skip if user
      if (!friend.route || friend.route.length <= 1) return;

      // Advance path
      friend.routeIndex = (friend.routeIndex + 1) % friend.route.length;
      const nextCoords = friend.route[friend.routeIndex];
      
      const prevCoords = friend.route[(friend.routeIndex - 1 + friend.route.length) % friend.route.length];
      const latDiff = nextCoords[0] - prevCoords[0];
      const lngDiff = nextCoords[1] - prevCoords[1];
      
      let heading = '이동 중';
      if (Math.abs(latDiff) > 0.0001 || Math.abs(lngDiff) > 0.0001) {
        if (latDiff > 0 && Math.abs(lngDiff) < Math.abs(latDiff)) heading = '북쪽';
        else if (latDiff < 0 && Math.abs(lngDiff) < Math.abs(latDiff)) heading = '남쪽';
        else if (lngDiff > 0 && Math.abs(latDiff) < Math.abs(lngDiff)) heading = '동쪽';
        else if (lngDiff < 0 && Math.abs(latDiff) < Math.abs(lngDiff)) heading = '서쪽';
        else if (latDiff > 0 && lngDiff > 0) heading = '북동쪽';
        else if (latDiff > 0 && lngDiff < 0) heading = '북서쪽';
        else if (latDiff < 0 && lngDiff > 0) heading = '남동쪽';
        else if (latDiff < 0 && lngDiff < 0) heading = '남서쪽';
      } else {
        heading = '정지';
      }

      friend.lat = nextCoords[0];
      friend.lng = nextCoords[1];
      friend.heading = heading;
      friend.speed = heading === '정지' ? 0 : Math.round((2.5 + Math.random() * 8) * 10) / 10;

      if (friend.pedometerEnabled) {
        const stepIncrement = friend.speed > 1 ? Math.floor(8 + Math.random() * 14) : Math.floor(1 + Math.random() * 4);
        friend.stepsToday = (friend.stepsToday || 0) + stepIncrement;
      }

      if (friend.heartRateEnabled) {
        const variation = Math.round((Math.random() - 0.5) * 8);
        const base = friend.heartRate || 72;
        const nextBpm = Math.max(40, Math.min(140, base + variation));
        friend.heartRate = nextBpm;
        if (!Array.isArray(friend.heartRateHistory)) {
          friend.heartRateHistory = [];
        }
        friend.heartRateHistory.unshift({ timestamp: new Date().toISOString(), bpm: nextBpm });
        if (friend.heartRateHistory.length > 10) {
          friend.heartRateHistory.pop();
        }
      }
      
      // Slightly drain battery
      if (Math.random() > 0.7) {
        friend.battery = Math.max(5, friend.battery - 1);
      }

      // 배터리 부족 경고 알림 (20% 이하 최초 1회)
      if (friend.battery <= 20 && !friend.lowBatteryAlerted) {
        friend.lowBatteryAlerted = true;
        room.notifications.unshift({
          id: `notif-bat-${Date.now()}-${id}`,
          type: 'system',
          title: '🔋 배터리 부족 경고',
          message: `${friend.name} 님의 배터리가 ${friend.battery}%입니다. 충전이 필요합니다!`,
          timestamp: new Date().toISOString(),
          read: false,
        });
        broadcastPushNotification(
          '🔋 배터리 부족',
          `${friend.name} 님의 배터리가 ${friend.battery}%입니다.`,
          { type: 'battery_low', friendId: id, battery: friend.battery }
        ).catch(() => {});
      } else if (friend.battery > 25) {
        friend.lowBatteryAlerted = false;
      }

      // 안심 구역(지오펜스) 이탈 감지
      const fence = geofences[id];
      if (fence) {
        const dist = haversineMeters(friend.lat, friend.lng, fence.lat, fence.lng);
        if (dist > fence.radiusM && !friend.geofenceAlert) {
          friend.geofenceAlert = true;
          room.notifications.unshift({
            id: `notif-geo-${Date.now()}-${id}`,
            type: 'system',
            title: '⚠️ 안심 구역 이탈',
            message: `${friend.name} 님이 안심 구역에서 약 ${Math.round(dist)}m 벗어났습니다! 위치를 확인하세요.`,
            timestamp: new Date().toISOString(),
            read: false,
          });
          broadcastPushNotification(
            '⚠️ 안심 구역 이탈',
            `${friend.name} 님이 안심 구역에서 벗어났습니다.`,
            { type: 'geofence_exit', friendId: id }
          ).catch(() => {});
        } else if (dist <= fence.radiusM && friend.geofenceAlert) {
          friend.geofenceAlert = false;
          room.notifications.unshift({
            id: `notif-geo-ret-${Date.now()}-${id}`,
            type: 'system',
            title: '✅ 안심 구역 복귀',
            message: `${friend.name} 님이 안심 구역으로 안전하게 돌아왔습니다.`,
            timestamp: new Date().toISOString(),
            read: false,
          });
        }
      }

      friend.updatedAt = new Date().toISOString();
    });
  });
}

// Live simulation tick every 6 seconds
setInterval(simulateMovement, 6000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ======= SECURITY MIDDLEWARE =======
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Apply authentication middleware
  app.use(authenticateToken);

  // ======= AUTHENTICATION ENDPOINTS =======
  // Login endpoint (generate token)
  app.post('/api/auth/login', (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
      }
      const token = generateToken(userId);
      res.json({ token, userId, expiresIn: 86400 });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // 헬스체크
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), rooms: Object.keys(dbRooms).length });
  });

  // 프론트엔드 런타임 설정 — 빌드 없이 카카오 키 전달
  app.get('/api/config', (_req, res) => {
    res.json({
      kakaoMapKey: process.env.KAKAO_MAP_KEY || process.env.VITE_KAKAO_MAP_KEY || '',
    });
  });

  // API Endpoints

  // 0. Rooms Catalog Endpoints
  app.get('/api/rooms', (req, res) => {
    const summary = Object.values(dbRooms).map(r => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      type: r.type,
      trackingStyle: r.trackingStyle,
      isDisbanded: r.isDisbanded || false,
      memberCount: Object.keys(r.friends).length,
      ownerId: r.ownerId || 'user-minsu'
    }));
    res.json(summary);
  });

  app.post('/api/rooms', validateRequest(RoomSchema), tryCatch(async (req: AuthRequest, res: Response) => {
    const { name, emoji, type, trackingStyle } = req.body;

    const newRoomId = `room-custom-${Date.now()}`;
    const roomEmoji = emoji || '🍎';
    const roomType = type || 'custom';
    const roomTrackingStyle = trackingStyle || (type === 'care' || type === 'family' ? 'continuous' : 'temporary');

    const ownerId = req.user?.userId || 'user-minsu';

    // 새 그룹은 빈 상태로 시작 (생성자가 가입 후 추가됨)
    const customFriends: Record<string, any> = {};
    const creatorProfile = findUserProfile(ownerId);
    if (creatorProfile) {
      customFriends[ownerId] = {
        ...creatorProfile,
        route: [],
        routeIndex: 0,
        updatedAt: new Date().toISOString()
      };
    } else {
      customFriends[ownerId] = {
        id: ownerId,
        name: '나 (민수)',
        avatar: '🍎',
        color: '#EF4444',
        lat: HONGDAE_LAT,
        lng: HONGDAE_LNG,
        statusMsg: '애플망고톡 시작! 🍎🥭',
        isOnline: true,
        battery: 100,
        speed: 0,
        heading: '정지',
        route: [],
        routeIndex: 0,
        updatedAt: new Date().toISOString()
      };
    }

    const count = 0; // 데모 유저 미생성
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * nameOptions.length);
      const bName = nameOptions[idx] + ` (${roomEmoji})`;
      const bAvatar = avatarOptions[idx];
      const bColor = colorOptions[idx];
      const fId = `friend-custom-${Date.now()}-${i}`;

      const offsetLat = (Math.random() - 0.5) * 0.015;
      const offsetLng = (Math.random() - 0.5) * 0.015;
      const bLat = HONGDAE_LAT + offsetLat;
      const bLng = HONGDAE_LNG + offsetLng;

      const route = [
        [bLat, bLng],
        [bLat + 0.0015, bLng + 0.001],
        [bLat + 0.0025, bLng + 0.003],
        [bLat + 0.0015, bLng + 0.0045],
        [bLat - 0.0005, bLng + 0.002],
        [bLat, bLng]
      ] as Array<[number, number]>;

      customFriends[fId] = {
        id: fId,
        name: bName,
        avatar: bAvatar,
        color: bColor,
        lat: bLat,
        lng: bLng,
        statusMsg: `새로운 방 [${name}]에 합류했습니다! 🙌`,
        isOnline: true,
        battery: Math.floor(60 + Math.random() * 41),
        speed: 3.5,
        heading: '남서쪽',
        route,
        routeIndex: 0,
        updatedAt: new Date().toISOString()
      };
    }

    dbRooms[newRoomId] = {
      id: newRoomId,
      name,
      emoji: roomEmoji,
      type: roomType,
      trackingStyle: roomTrackingStyle,
      isDisbanded: false,
      ownerId: req.user?.userId || 'user-minsu',
      messages: [
        {
          id: `msg-custom-init-${Date.now()}`,
          senderId: 'system',
          senderName: '시스템',
          senderAvatar: '⚙️',
          senderColor: '#6B7280',
          text: `🎉 새로운 그룹 채널 [${name}] 방이 활성화되었습니다! (${roomTrackingStyle === 'continuous' ? '상시 위치공유형 👵' : '모임 후 자동종료형 ⏰'}) 메신저에서 약속을 시작하고 안전한 위치 전송을 시작하세요! 🍎🥭`,
          timestamp: new Date().toISOString(),
          isSystem: true
        }
      ],
      friends: customFriends,
      appointments: [],
      notifications: [
        {
          id: `notif-custom-${Date.now()}`,
          type: 'system',
          title: '방 개설 알림',
          message: `[${name}] 모임방이 새롭게 개설되었습니다. (${roomTrackingStyle === 'continuous' ? '상시형' : '폭파형 약속방'})`,
          timestamp: new Date().toISOString(),
          read: false
        }
      ]
    };

    res.json({
      id: newRoomId,
      name,
      emoji: roomEmoji,
      type: roomType,
      trackingStyle: roomTrackingStyle,
      isDisbanded: false,
      memberCount: Object.keys(customFriends).length,
      ownerId
    });
  }));

  // 현재 온라인 유저 목록
  app.get('/api/users/online', (req, res) => {
    const onlineIds = new Set(Object.values(socketUsers).map(u => u.userId));
    const profiles: any[] = [];
    const seen = new Set<string>();
    for (const uid of onlineIds) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      for (const room of Object.values(dbRooms)) {
        if (room.friends[uid]) {
          profiles.push({ ...room.friends[uid], isOnline: true });
          break;
        }
      }
    }
    res.json(profiles);
  });

  // 전화번호/이름으로 사용자 검색
  app.get('/api/users/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);
    const results: any[] = [];
    const seen = new Set<string>();
    for (const room of Object.values(dbRooms)) {
      for (const user of Object.values(room.friends) as any[]) {
        if (seen.has(user.id)) continue;
        const nameMatch = (user.name || '').toLowerCase().includes(q);
        const phoneMatch = (user.phone || '').replace(/-/g, '').includes(q.replace(/-/g, ''));
        const aliasMatch = (user.alias || '').toLowerCase().includes(q);
        if (nameMatch || phoneMatch || aliasMatch) {
          seen.add(user.id);
          results.push(user);
        }
      }
    }
    res.json(results.slice(0, 10));
  });

  // 장소 검색 — OpenStreetMap Nominatim (API 키 불필요)
  app.get('/api/places/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);

    try {
      const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q, format: 'json', limit: 8, countrycodes: 'kr', 'accept-language': 'ko' },
        headers: { 'User-Agent': 'AppleMangoTalk/1.0 (support@applemangotalk.app)', 'Accept-Language': 'ko,en' },
        timeout: 7000,
      });
      const places = (data as any[]).map((item: any) => {
        const parts = (item.display_name as string).split(', ');
        return {
          name: parts.slice(0, 2).join(' '),
          address: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        };
      });
      res.json(places);
    } catch (err: any) {
      console.warn('Nominatim search failed:', err.message);
      // 로컬 홍대 주변 fallback
      const fallback = [
        { name: '홍대입구역 9번출구', address: '서울 마포구 양화로 160', lat: 37.5568, lng: 126.9238 },
        { name: '경의선숲길 연남동', address: '서울 마포구 연남동 260-15', lat: 37.5595, lng: 126.9262 },
        { name: '망원한강공원', address: '서울 마포구 마포나루길 467', lat: 37.5558, lng: 126.9011 },
        { name: '합정역 카페 거리', address: '서울 마포구 독막로7길 24', lat: 37.5492, lng: 126.9148 },
      ];
      res.json(fallback.filter(p => !q || p.name.includes(q) || p.address.includes(q)));
    }
  });

  // 안심 구역(지오펜스) API
  app.post('/api/friends/geofence', (req, res) => {
    const { friendId, lat, lng, radiusM } = req.body;
    if (!friendId || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'friendId, lat, lng required' });
    }
    geofences[friendId] = { lat, lng, radiusM: Number(radiusM) || 500 };
    res.json({ success: true, geofence: geofences[friendId] });
  });

  app.delete('/api/friends/geofence/:friendId', (req, res) => {
    const { friendId } = req.params;
    delete geofences[friendId];
    res.json({ success: true });
  });

  app.get('/api/friends/geofence/:friendId', (req, res) => {
    const { friendId } = req.params;
    res.json(geofences[friendId] || null);
  });

  // Disband temporary rooms automatically
  app.post('/api/rooms/disband', (req, res) => {
    const { roomId } = req.body;
    if (dbRooms[roomId]) {
      const isSystemRoom = ['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId);
      if (!isSystemRoom) {
        delete dbRooms[roomId];
        return res.json({ success: true, isDisbanded: true, deleted: true });
      } else {
        dbRooms[roomId].isDisbanded = true;
        dbRooms[roomId].messages.push({
          id: `msg-disband-sys-${Date.now()}`,
          senderId: 'system',
          senderName: '시스템',
          senderAvatar: '🔒',
          senderColor: '#EF4444',
          text: '🔒 모임 약속 완료 및 귀가 감지가 완료되어 실시간 위치 동기화 수집이 긴급 해제되었습니다. 프라이버시 보호 상태가 유지됩니다.',
          timestamp: new Date().toISOString(),
          isSystem: true
        });
        return res.json({ success: true, isDisbanded: true, deleted: false });
      }
    }
    res.status(404).json({ error: 'Room not found' });
  });

  // 방 폭파 / 완전히 삭제 — 모든 방 삭제 가능
  app.post('/api/rooms/delete', (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });
    if (dbRooms[roomId]) {
      delete dbRooms[roomId];
      return res.json({ success: true, deletedRoomId: roomId });
    }
    res.status(404).json({ error: 'Room not found' });
  });

  // Invite member by Phone Number endpoint
  app.post('/api/friends/invite', validateRequest(FriendInviteSchema), (req: AuthRequest, res: Response) => {
    const { name, avatar, color, phone, roomId, creatorName } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const newFriendId = `friend-invited-${Date.now()}`;
    const cleanPhone = phone.trim();

    const newFriend = {
      id: newFriendId,
      name: `${name} (대기)`,
      realName: name,
      avatar: avatar || '👵',
      color: color || '#EC4899',
      lat: HONGDAE_LAT + (Math.random() - 0.5) * 0.008,
      lng: HONGDAE_LNG + (Math.random() - 0.5) * 0.008,
      statusMsg: `초대 메시지 수락 대기 중... 📨`,
      isOnline: false,
      battery: Math.floor(55 + Math.random() * 40),
      phone: cleanPhone,
      speed: 0,
      heading: '수락대기',
      route: [],
      routeIndex: 0,
      isPendingInvite: true, // Marker to indicate accept is needed
      updatedAt: new Date().toISOString()
    };

    room.friends[newFriendId] = newFriend;

    // Create a special invitation notification
    room.notifications.unshift({
      id: `notif-invite-pending-${Date.now()}`,
      type: 'invite',
      title: '초대장 발송됨 📨',
      message: `[${creatorName || '호스트'}] 님이 ${name} (${cleanPhone}) 님에게 그룹 가입 초대를 발송했습니다. 수락 시 활성화됩니다.`,
      timestamp: new Date().toISOString(),
      read: false
    });

    // Create an interactive invitation system message in chat
    room.messages.push({
      id: `msg-invite-card-${Date.now()}`,
      senderId: 'system',
      senderName: '초대 안심봇',
      senderAvatar: '✉️',
      senderColor: '#3B82F6',
      text: `✉️ [초대장 도착]\n- 초청자: ${creatorName || '그룹장'}\n- 대상: ${name}\n- 연락처: ${cleanPhone}\n👉 아래의 [초대 수락] 버튼을 터치하시면 이 그룹 약속방에 안전하게 입장 완료됩니다!`,
      timestamp: new Date().toISOString(),
      isSystem: true,
      inviteId: newFriendId,
      isInviteCard: true
    });

    res.json(newFriend);
  });

  // Accept Invitation to Room endpoint
  app.post('/api/friends/accept', (req, res) => {
    const { id, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const friend = room.friends[id];
    if (friend && friend.isPendingInvite) {
      friend.isPendingInvite = false;
      friend.isOnline = true;
      friend.name = `${friend.realName || friend.name} (합류)`;
      friend.statusMsg = `안심 애플망고톡 가입완료! 실시간 이동 감지 중 🧭`;
      friend.updatedAt = new Date().toISOString();

      // Send accept notification
      room.notifications.unshift({
        id: `notif-invite-accepted-${Date.now()}`,
        type: 'arrival',
        title: '초대 수락 완료 💖',
        message: `${friend.realName || friend.name} 님이 초대를 수락하고 안심 그룹방에 입장했습니다.`,
        timestamp: new Date().toISOString(),
        read: false
      });

      // Send chat message
      room.messages.push({
        id: `msg-invite-accept-sys-${Date.now()}`,
        senderId: 'system',
        senderName: '시스템',
        senderAvatar: '🎉',
        senderColor: '#10B981',
        text: `🎉 [가입 완료] ${friend.realName || friend.name} 님이 초대를 수락하고 이 그룹 모임에 합류했습니다! 실시간 전송 센서가 연동되었습니다.`,
        timestamp: new Date().toISOString(),
        isSystem: true
      });

      return res.json({ success: true, friend });
    }
    res.status(404).json({ error: 'Invited friend not found or already accepted' });
  });

  // Profile signup / authentication (Phone number, Real Name, and Pseudonym)
  app.post('/api/friends/profile', validateRequest(ProfileSchema), (req: AuthRequest, res: Response) => {
    const { phone, realName, alias, avatar } = req.body;

    // 전화번호 기반 고유 사용자 ID 생성
    const digits = (phone || '').replace(/\D/g, '');
    const userId = digits ? `user-${digits}` : `user-${Date.now()}`;
    const displayName = alias || realName || '사용자';
    const userAvatar = avatar || '🍎';
    const colors = ['#EF4444','#F97316','#EAB308','#10B981','#3B82F6','#8B5CF6','#EC4899'];
    const color = colors[parseInt(digits.slice(-1) || '0') % colors.length];

    // 모든 기본 룸에 사용자 추가 (없으면 생성)
    Object.keys(dbRooms).forEach(roomId => {
      const r = dbRooms[roomId];
      if (!r.friends[userId]) {
        r.friends[userId] = {
          id: userId,
          name: displayName,
          avatar: userAvatar,
          color,
          phone,
          realName,
          alias,
          lat: HONGDAE_LAT + (Math.random() - 0.5) * 0.01,
          lng: HONGDAE_LNG + (Math.random() - 0.5) * 0.01,
          statusMsg: '애플망고톡 시작! 🍎🥭',
          isOnline: true,
          battery: 100,
          speed: 0,
          heading: '정지',
          pedometerEnabled: false,
          stepsToday: 0,
          route: [],
          routeIndex: 0,
          updatedAt: new Date().toISOString(),
        };
      } else {
        // 기존 사용자 정보 업데이트
        r.friends[userId].name = displayName;
        r.friends[userId].avatar = userAvatar;
        r.friends[userId].phone = phone;
        r.friends[userId].realName = realName;
        r.friends[userId].alias = alias;
        r.friends[userId].updatedAt = new Date().toISOString();
      }
    });

    const token = generateToken(userId);
    res.json({ success: true, userId, token });
  });

  // 1. Chat Endpoints
  app.get('/api/chat', (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    res.json(room.messages);
  });

  app.post('/api/chat', validateRequest(MessageSchema), tryCatch(async (req: AuthRequest, res: Response) => {
    const { senderId, senderName, senderAvatar, senderColor, text, locationShared, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const newMsg = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      senderId: senderId || 'user-minsu',
      senderName: senderName || '나 (민수)',
      senderAvatar: senderAvatar || '🟢',
      senderColor: senderColor || '#3B82F6',
      text: text || '',
      timestamp: new Date().toISOString(),
      locationShared
    };

    room.messages.push(newMsg);

    // AI Mentions Handler (@망고봇)
    if (text && (text.includes('@망고봇') || text.includes('@ai') || text.includes('@애망bot'))) {
      const prompt = `사용자가 실시간 친구 모임 및 안심 가로등 앱 '애플망고톡' 내에서 다음과 같은 메시지를 보냈습니다: "${text}".
      이전 대화 목록: ${JSON.stringify(room.messages.slice(-5))}
      참여 친구들의 현재 위치: ${JSON.stringify(Object.values(room.friends).map((f: any) => ({ name: f.name, lat: f.lat, lng: f.lng, status: f.statusMsg })))}
      질문에 맞게 친절하고 위트 있는 @망고봇 캐릭터(말투에 '🍎' 이나 '🥭' 를 섞어서 친근한 한국어로 작성)로 다음 질문에 매장 추천, 안심 조율 팁, 또는 피드백을 제공해 주세요. 3문장 이내로 컴팩트하고 유익하게 조언해주세요.`;

      let aiText = '';
      if (ai) {
        try {
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              systemInstruction: 'You are the playful and smart assistant chatbot of "Amang Signal" (AppleMango Signal) named @망고봇. You suggest meeting spots, coordinate plans, check elder companion safety, and speak in a sweet fruits loving tone in Korean!',
            }
          });
          aiText = aiResponse.text || '애망! 🍎🥭 머리가 살짝 혼란스럽네요! 근처 상쾌한 "애플망고 피크닉 쉼터"나 디저트 카페에서 소통해볼까요?';
        } catch (err: any) {
          console.error('Error generating with Gemini API:', err);
          aiText = `🍎🥭 애망! 머리가 가동 중입니다! 조율 추천 코스로는 홍대입구역 9번출구 앞 정원 카페나 경의선 책거리 산책길이 쾌적하고 조율하기 아주 안전해요! 🍎`;
        }
      } else {
        const fallbacks = [
          "애망! 🍎🥭 센서 탐지 완료! 다들 안심 반경 내에 잘 모여있군요. 근처 이색 디저트 맛집 '애플망고 레이어 플라자'에서 쾌적하게 모이는 걸 추천해요! 🥭",
          "🍎 삐빅- 실시간 분석 완료! 복잡한 번화가보다는 경의선 숲길 책거리가 다들 만나 가벼운 산책을 나누기에 가장 산뜻하고 안전할 것 같다망고! 🥭",
          "애망-시그널! 🍎 약속 일정이 어긋날 땐 투표 카드를 눌러 일정을 리셋하고 다시 조율해보세요! 다들 안전 가이드 배터리가 충만할 때 결정하자망고! 🥭"
        ];
        aiText = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }

      const botMsg = {
        id: `msg-bot-${Date.now()}`,
        senderId: 'bot-ai',
        senderName: '망고봇 🥭',
        senderAvatar: '🤖',
        senderColor: '#EF4444',
        text: aiText,
        timestamp: new Date().toISOString()
      };
      
      setTimeout(() => {
        room.messages.push(botMsg);
        room.notifications.unshift({
          id: `notif-${Date.now()}`,
          type: 'chat',
          title: '@망고봇 멘션 답변',
          message: '@망고봇이 채팅방에 기발한 귀가/모임 조율 조언을 남겼습니다! 🍎',
          timestamp: new Date().toISOString(),
          read: false,
        });
      }, 1000);
    }

    res.json(newMsg);
  }));

  // 2. Friends/Locations Endpoints
  app.get('/api/friends', (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    res.json(Object.values(room.friends));
  });

  app.post('/api/friends/move', validateRequest(LocationUpdateSchema), (req: AuthRequest, res: Response) => {
    const { id, lat, lng, statusMsg, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const friendId = id || 'user-minsu';

    if (lat !== undefined && lng !== undefined && room.friends[friendId]) {
      const payload = applyFriendLocationUpdate(activeRoomId, friendId, lat, lng, statusMsg, {
        broadcast: true,
        source: 'manual'
      });
      if (payload) {
        return res.json(room.friends[friendId]);
      }
    }

    if (friendId === 'user-minsu' && lat !== undefined && lng !== undefined) {
      syncUserAllRooms(friendId, lat, lng, statusMsg);
      return res.json(room.friends['user-minsu']);
    }

    if (room.friends[friendId]) {
      if (statusMsg !== undefined) room.friends[friendId].statusMsg = statusMsg;
      room.friends[friendId].updatedAt = new Date().toISOString();
      return res.json(room.friends[friendId]);
    }

    if (friendId.startsWith('friend-')) {
      room.friends[friendId] = {
        id: friendId,
        name: req.body.name || '새로운 애망 버디',
        avatar: req.body.avatar || '🍎',
        color: req.body.color || '#F59E0B',
        lat: lat || HONGDAE_LAT + (Math.random() - 0.5) * 0.01,
        lng: lng || HONGDAE_LNG + (Math.random() - 0.5) * 0.01,
        statusMsg: statusMsg || '새로 친구가 초대되었어요!',
        isOnline: true,
        battery: 100,
        speed: 0,
        heading: '정지',
        route: [],
        routeIndex: 0,
        updatedAt: new Date().toISOString()
      };
      
      room.notifications.unshift({
        id: `notif-invite-${Date.now()}`,
        type: 'invite',
        title: '새로운 친구 참가!',
        message: `${room.friends[friendId].name} 님이 애플망고톡에 초대 수락하여 참가했습니다!`,
        timestamp: new Date().toISOString(),
        read: false
      });

      return res.json(room.friends[friendId]);
    }

    res.status(404).json({ error: 'Friend not found' });
  });

  // Delete friend/member endpoint
  app.post('/api/friends/delete', (req, res) => {
    const { id, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    if (room.friends[id]) {
      const removedFriendName = room.friends[id].name;
      delete room.friends[id];

      room.notifications.unshift({
        id: `notif-delete-${Date.now()}`,
        type: 'system',
        title: '멤버가 그룹에서 제외됨',
        message: `${removedFriendName} 님이 그룹에서 안전하게 제외되었습니다.`,
        timestamp: new Date().toISOString(),
        read: false
      });

      room.messages.push({
        id: `msg-sys-del-${Date.now()}`,
        senderId: 'system',
        senderName: '시스템',
        senderAvatar: '⚙️',
        senderColor: '#6B7280',
        text: `⚙️ 멤버 [${removedFriendName}] 이(가) 그룹 방에서 안전하게 퇴장/제외처리 되었습니다.`,
        timestamp: new Date().toISOString(),
        isSystem: true
      });

      return res.json({ success: true, id });
    }
    res.status(404).json({ error: 'Friend not found in room' });
  });

  // 3. Appointments / Schedules Endpoints
  app.get('/api/appointments', (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    res.json(room.appointments);
  });

  app.post('/api/appointments', validateRequest(AppointmentSchema), (req: AuthRequest, res: Response) => {
    const { title, placeName, lat, lng, datetime, creatorName, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const newApp = {
      id: `promise-${Date.now()}`,
      title,
      placeName,
      lat,
      lng,
      datetime: datetime || '미정 (시간 조율 중)',
      creatorName: creatorName || '나 (민수)',
      attendees: [creatorName || '나 (민수)'],
      votes: {
        'user-minsu': 'yes'
      }
    };

    room.appointments.push(newApp);

    room.notifications.unshift({
      id: `notif-app-${Date.now()}`,
      type: 'promise',
      title: '새로운 모임 조율',
      message: `[${newApp.title}] 모임이 새로 생성되었습니다. 마커를 눌러 투표해 주세요!`,
      timestamp: new Date().toISOString(),
      read: false
    });

    room.messages.push({
      id: `msg-sys-${Date.now()}`,
      senderId: 'system',
      senderName: '시스템',
      senderAvatar: '⚙️',
      senderColor: '#6B7280',
      text: `📢 새로운 약속 [${newApp.title}] 이(가) '${newApp.placeName}' 에 등록되었습니다! 지도에서 상세 아이콘을 확인하고 시간 및 참여 여부를 조율하세요.`,
      timestamp: new Date().toISOString(),
      isSystem: true
    });

    res.json(newApp);
  });

  // Update existing appointment's location details continuously
  app.post('/api/appointments/update', (req, res) => {
    const { id, title, placeName, lat, lng, datetime, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const app = room.appointments.find((a: any) => a.id === id);
    if (!app) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const oldPlaceName = app.placeName;
    if (title !== undefined) app.title = title;
    if (placeName !== undefined) app.placeName = placeName;
    if (lat !== undefined) app.lat = lat;
    if (lng !== undefined) app.lng = lng;
    if (datetime !== undefined) app.datetime = datetime;

    room.notifications.unshift({
      id: `notif-app-upd-${Date.now()}`,
      type: 'promise',
      title: '소집 장소 변경 알림 📍',
      message: `[${app.title}]의 소집 장소가 '${oldPlaceName}'에서 '${app.placeName}'(으)로 최종 변경되었습니다!`,
      timestamp: new Date().toISOString(),
      read: false
    });

    room.messages.push({
      id: `msg-sys-upd-${Date.now()}`,
      senderId: 'system',
      senderName: '시스템',
      senderAvatar: '⚙️',
      senderColor: '#6B7280',
      text: `📢 알림: 약속 [${app.title}]의 소집 장소가 기존 [${oldPlaceName}]에서 👉 [${app.placeName}] 로 긴급 변경 변경되었습니다. 수정된 지도 위치를 확인해 주세요!`,
      timestamp: new Date().toISOString(),
      isSystem: true
    });

    res.json(app);
  });

  app.post('/api/appointments/vote', (req, res) => {
    const { id, friendId, vote, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const app = room.appointments.find(a => a.id === id);
    if (!app) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    app.votes[friendId] = vote;
    const friend = room.friends[friendId] || { name: '나 (민수)' };
    const name = friend.name;

    if (vote === 'yes' && !app.attendees.includes(name)) {
      app.attendees.push(name);
    } else if (vote === 'no' && app.attendees.includes(name)) {
      app.attendees = app.attendees.filter((a: string) => a !== name);
    }

    const voteLabel = vote === 'yes' ? '✅ 참가' : vote === 'no' ? '❌ 불참' : '🤔 미정';
    room.notifications.unshift({
      id: `notif-vote-${Date.now()}`,
      type: 'promise',
      title: '약속 참가 의사 업데이트',
      message: `${name} 님이 [${app.title}] 약속에 ${voteLabel} 응답했습니다. 현재 참가: ${app.attendees.length}명`,
      timestamp: new Date().toISOString(),
      read: false
    });
    room.messages.push({
      id: `msg-vote-${Date.now()}`,
      senderId: 'system',
      senderName: '시스템',
      senderAvatar: '📅',
      senderColor: '#F59E0B',
      text: `📅 ${name} 님이 [${app.title}] 약속에 ${voteLabel} 의사를 표명했습니다. (참가 인원: ${app.attendees.join(', ')})`,
      timestamp: new Date().toISOString(),
      isSystem: true
    });

    res.json(app);
  });

  // 4. Notifications Endpoints
  app.get('/api/notifications', (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    res.json(room.notifications);
  });

  app.post('/api/notifications/read', (req, res) => {
    const { id, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    
    if (id) {
      const notif = room.notifications.find(n => n.id === id);
      if (notif) notif.read = true;
    } else {
      room.notifications.forEach(n => n.read = true);
    }
    res.json({ success: true });
  });

  app.post('/api/friends/pedometer', validateRequest(PedometerSchema), (req: AuthRequest, res: Response) => {
    const { id, pedometerEnabled, stepsToday, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const friend = room.friends[id];

    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    if (typeof pedometerEnabled === 'boolean') {
      friend.pedometerEnabled = pedometerEnabled;
    }
    if (typeof stepsToday === 'number') {
      friend.stepsToday = stepsToday;
    }
    if (friend.pedometerEnabled && friend.stepsToday === undefined) {
      friend.stepsToday = 0;
    }

    res.json({ success: true, friend });
  });

  app.post('/api/friends/heartRate', validateRequest(HeartRateSchema), (req: AuthRequest, res: Response) => {
    const { id, heartRateEnabled, heartRate, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const friend = room.friends[id];

    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    if (typeof heartRateEnabled === 'boolean') {
      friend.heartRateEnabled = heartRateEnabled;
    }
    if (typeof heartRate === 'number') {
      friend.heartRate = heartRate;
      if (!Array.isArray(friend.heartRateHistory)) {
        friend.heartRateHistory = [];
      }
      friend.heartRateHistory.unshift({ timestamp: new Date().toISOString(), bpm: heartRate });
      if (friend.heartRateHistory.length > 10) friend.heartRateHistory.pop();
    }
    if (friend.heartRateEnabled && friend.heartRate === undefined) {
      friend.heartRate = 72;
    }

    res.json({ success: true, friend });
  });

  app.get('/api/push/vapidPublicKey', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, roomId, userId } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription object is required' });
    }

    const exists = pushSubscriptions.some((sub) => sub.endpoint === subscription.endpoint);
    if (!exists) {
      pushSubscriptions.push({ ...subscription, roomId, userId });
    }

    res.json({ success: true, subscribed: true });
  });

  app.post('/api/push/send', tryCatch(async (req, res) => {
    const { title, body, data } = req.body;
    await broadcastPushNotification(title || '애플망고톡', body || '알림이 도착했습니다.', data || {});
    res.json({ success: true });
  }));

  // 6. Emergency 119 API Endpoint
  app.post('/api/emergency/dispatch', tryCatch(async (req: AuthRequest, res: Response) => {
    const { friendId, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    if (!friendId) {
      return res.status(400).json({ error: 'friendId is required' });
    }

    const friend = room.friends[friendId];
    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    try {
      // Call 119 emergency service
      const emergencyResult = await call119Emergency(friend);

      if (emergencyResult.success) {
        // Add system message to room
        const emergencyMsg = {
          id: `msg-emergency-${Date.now()}`,
          senderId: 'system',
          senderName: '긴급 알림',
          senderAvatar: '🚨',
          senderColor: '#DC2626',
          text: `🚨 [긴급 상황] 119 구급대 출동 요청됨!\n- 대상: ${friend.name}\n- 위치: (${friend.lat.toFixed(4)}, ${friend.lng.toFixed(4)})\n- 출동 ID: ${emergencyResult.dispatchId}\n- 예상 도착: ${emergencyResult.eta}분\n- 심박수: ${friend.heartRate || '감지 중'}bpm`,
          timestamp: new Date().toISOString(),
          isSystem: true
        };

        room.messages.push(emergencyMsg);

        // Add notification
        room.notifications.unshift({
          id: `notif-emergency-${Date.now()}`,
          type: 'system',
          title: '🚨 119 출동 요청',
          message: `${friend.name} 님을 위해 119 구급대 출동이 요청되었습니다. (ID: ${emergencyResult.dispatchId})`,
          timestamp: new Date().toISOString(),
          read: false
        });

        await broadcastPushNotification(
          '🚨 긴급 출동 요청',
          `${friend.name} 님을 위한 119 출동이 요청되었습니다. 위치를 확인하세요.`,
          {
            type: 'emergency',
            roomId: activeRoomId,
            friendId,
            dispatchId: emergencyResult.dispatchId,
            eta: emergencyResult.eta
          }
        );

        return res.json({
          success: true,
          dispatchId: emergencyResult.dispatchId,
          eta: emergencyResult.eta,
          message: emergencyMsg
        });
      } else {
        throw new Error('Emergency dispatch failed');
      }
    } catch (error) {
      console.error('Emergency dispatch error:', error);
      return res.status(500).json({ error: 'Emergency dispatch failed' });
    }
  }));

  // 5. Google GenAI Coordinates Advisor Endpoint (@api/gemini/coordinate)
  app.post('/api/gemini/advisor', async (req, res) => {
    const { message, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    if (!ai) {
      return res.json({
        advice: '🍎 애플망고톡! 구글 AI가 설정되어 있지 않아 위트 가이드를 출력합니다. 경의선 숲길 책거리가 모임 장소로 산뜻하고 아주 안전합니다! 🍎'
      });
    }

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `사용자가 친구들과 만날 만한 특별한 장소나 코스를 맛깔나게 추천해 달라고 제안했습니다. 메세지: "${message}".
        이 방은 [${room.name}] 방이며 유형은 "${room.type}"입니다.
        서울 홍대 인근이며, 애플망고톡 특유의 산뜻하고 안심 가득한 톤앤매너로(말끝에 과일🍎 이나 🥭을 소량 섞어서) 3문장 이내로 근사하게 추천해주시되, 이 방의 성격(가족, 친구, 혹은 부모님 안심)에 어울리는 추천 코스를 맛집이나 공원 등 구체적인 지명과 함께 묘사해 주세요.`
      });
      res.json({ advice: result.text || '🍎 홍대 맛집 골목 혹은 경의선 숲길 책거리가 조율하기 좋은 최고의 쉼터망고! 🥭' });
    } catch (err: any) {
      console.error(err);
      res.json({ advice: '🥭 애망 서포트 추천: 동교동 근처 오붓한 허브 과일 카페나 산뜻한 정원이 피크닉 장소로 최적이망고!' });
    }
  });

  // Vite Integration for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: VITE_HMR_PORT,
          clientPort: VITE_HMR_PORT,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite dev middleware mounted.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production static files serving mounted.');
  }

  // ======= ERROR HANDLING MIDDLEWARE (Must be last) =======
  app.use(errorHandler);

  // ======= WEBSOCKET INITIALIZATION (Socket.IO) =======
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Store active socket connections per room
  const roomSockets: Record<string, Set<string>> = {};
  const socketUsers: Record<string, { userId: string; roomId: string }> = {};

  // Real-time broadcast helper
  const broadcastToRoom = (roomId: string, event: string, data: any) => {
    io.to(`room-${roomId}`).emit(event, data);
  };

  broadcastLocationToRoom = (roomId, payload) => {
    broadcastToRoom(roomId, 'location-updated', payload);
  };

  // Socket.IO event handlers
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join room event
    socket.on('join-room', ({ roomId, userId }, callback) => {
      try {
        if (!roomId || !userId) {
          return callback({ error: 'roomId and userId required' });
        }

        const previous = socketUsers[socket.id];
        if (previous && previous.roomId !== roomId) {
          socket.leave(`room-${previous.roomId}`);
          if (roomSockets[previous.roomId]) {
            roomSockets[previous.roomId].delete(socket.id);
          }
        }

        // Store connection info
        socket.join(`room-${roomId}`);
        if (!roomSockets[roomId]) roomSockets[roomId] = new Set();
        roomSockets[roomId].add(socket.id);
        socketUsers[socket.id] = { userId, roomId };

        console.log(`✅ User ${userId} joined room ${roomId}`);

        // Notify room members
        broadcastToRoom(roomId, 'user-joined', {
          userId,
          timestamp: new Date().toISOString(),
          activeUsers: roomSockets[roomId]?.size || 0
        });

        callback({ success: true });
      } catch (error) {
        callback({ error: 'Join failed' });
      }
    });

    // Real-time message event
    socket.on('send-message', ({ roomId, message }, callback) => {
      try {
        const room = dbRooms[roomId] || dbRooms['room-friends'];
        const newMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...message,
          timestamp: new Date().toISOString()
        };

        room.messages.push(newMsg);

        // Broadcast to all in room
        broadcastToRoom(roomId, 'new-message', newMsg);
        callback({ success: true, message: newMsg });
      } catch (error) {
        callback({ error: 'Message send failed' });
      }
    });

    // Real-time location update (device GPS)
    socket.on('update-location', ({ roomId, friendId, lat, lng, statusMsg, accuracy }, callback) => {
      try {
        if (!roomId || !friendId || typeof lat !== 'number' || typeof lng !== 'number') {
          return callback({ error: 'roomId, friendId, lat, lng required' });
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return callback({ error: 'Invalid coordinates' });
        }

        const payload = applyFriendLocationUpdate(roomId, friendId, lat, lng, statusMsg, {
          broadcast: true,
          source: 'gps'
        });

        if (!payload) {
          return callback({ error: 'Friend not found in room' });
        }

        if (typeof accuracy === 'number') {
          payload.accuracy = accuracy;
        }

        callback({ success: true, ...payload });
      } catch (error) {
        callback({ error: 'Location update failed' });
      }
    });

    // 119 Emergency call event
    socket.on('emergency-119', async ({ roomId, friendId }, callback) => {
      try {
        const room = dbRooms[roomId] || dbRooms['room-friends'];
        const friend = room.friends[friendId];

        if (!friend) {
          return callback({ error: 'Friend not found' });
        }

        // Call 119 emergency service
        const emergencyResult = await call119Emergency(friend);

        if (emergencyResult.success) {
          // Broadcast emergency alert to room
          const emergencyMsg = {
            id: `msg-emergency-${Date.now()}`,
            senderId: 'system',
            senderName: '긴급 알림',
            senderAvatar: '🚨',
            senderColor: '#DC2626',
            text: `🚨 [긴급 상황] 119 구급대 출동 요청됨!\n- 대상: ${friend.name}\n- 위치: (${friend.lat.toFixed(4)}, ${friend.lng.toFixed(4)})\n- 출동 ID: ${emergencyResult.dispatchId}\n- 예상 도착: ${emergencyResult.eta}분`,
            timestamp: new Date().toISOString(),
            isSystem: true
          };

          room.messages.push(emergencyMsg);
          broadcastToRoom(roomId, 'emergency-alert', {
            friendId,
            dispatchId: emergencyResult.dispatchId,
            eta: emergencyResult.eta,
            message: emergencyMsg
          });

          await broadcastPushNotification(
            '🚨 긴급 출동 요청',
            `${friend.name} 님을 위한 119 출동이 요청되었습니다. 위치를 확인하세요.`,
            {
              type: 'emergency',
              roomId,
              friendId,
              dispatchId: emergencyResult.dispatchId,
              eta: emergencyResult.eta
            }
          );

          callback({ success: true, dispatchId: emergencyResult.dispatchId, eta: emergencyResult.eta });
        } else {
          callback({ error: 'Emergency dispatch failed' });
        }
      } catch (error) {
        console.error('Emergency call error:', error);
        callback({ error: 'Emergency call failed' });
      }
    });

    // Disconnect event
    socket.on('disconnect', () => {
      const userInfo = socketUsers[socket.id];
      if (userInfo) {
        const { roomId, userId } = userInfo;
        if (roomSockets[roomId]) {
          roomSockets[roomId].delete(socket.id);
        }
        delete socketUsers[socket.id];

        broadcastToRoom(roomId, 'user-left', {
          userId,
          timestamp: new Date().toISOString(),
          activeUsers: roomSockets[roomId]?.size || 0
        });

        console.log(`❌ User ${userId} left room ${roomId}`);
      }
    });
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ 포트 ${PORT}이(가) 이미 사용 중입니다.`);
      console.error('   이전에 켜 둔 서버가 아직 실행 중일 수 있습니다.');
      console.error('   PowerShell에서 아래 명령 후 다시 npm run dev 하세요:\n');
      console.error(`   npm run dev:stop\n`);
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
    console.log(`📡 WebSocket ready at ws://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup issue:', err);
});
