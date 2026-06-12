/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
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
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@applemangotalk.app';
// (BIZ-CORE-8 ④) 119 자동신고 관련 설정 제거 — SOS 보호자 알림으로 대체

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

// ============= BIZ-CORE-8: 안심 장소(이름 있는 다중 지오펜스) =============
// friendId → [{ id, name, lat, lng, radiusM, notifyArrive, notifyLeave }]
interface SafePlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  notifyArrive: boolean;
  notifyLeave: boolean;
}
const dbSafePlaces: Record<string, SafePlace[]> = {};

// BIZ-CORE-8: 오늘의 가족 질문(대화 스타터) — 가족·효도방 DAU 확보용
const FAMILY_QUESTIONS: string[] = [
  '아버지/어머니의 첫 직장 이야기, 들어본 적 있나요?',
  '우리 가족이 함께 갔던 여행 중 가장 기억에 남는 곳은 어디인가요?',
  '어릴 적 부모님께 들었던 말 중 아직도 기억나는 한마디는?',
  '요즘 가장 자주 듣는 노래는 무엇인가요? 🎵',
  '오늘 점심에 뭐 드셨어요? 사진 한 장 올려주세요! 🍚',
  '부모님의 18번(애창곡)은 무슨 노래인가요?',
  '이번 주말에 가족이 함께 걷고 싶은 산책 코스가 있다면?',
  '어릴 때 제일 좋아했던 간식은 무엇이었나요?',
  '가족에게 고맙다고 말하고 싶었지만 못 했던 일이 있나요?',
  '우리 가족만의 별명이나 암호가 있었나요?',
  '최근에 새로 배우거나 도전해 보고 싶은 것이 있나요?',
  '지금 창밖 풍경은 어떤가요? 한 줄로 표현해 주세요 🌤️',
  '가족과 함께 다시 보고 싶은 영화나 드라마가 있다면?',
  '오늘 하루 중 가장 기분 좋았던 순간은 언제였나요?',
  '부모님이 우리 나이였을 때 꿈은 무엇이었을까요?',
  '집 근처 단골 가게가 있나요? 어떤 곳인가요?',
  '올해가 가기 전에 가족이 꼭 함께 하고 싶은 일 한 가지는?',
  '어릴 적 살던 동네에서 가장 그리운 장소는 어디인가요?',
  '요즘 건강을 위해 챙겨 먹는 것이 있나요?',
  '가족 모두의 다음 모임 날짜, 오늘 정해보는 건 어떨까요? 📅',
];

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

const sendPushToUser = async (userId: string, title: string, body: string, data: any = {}) => {
  const payload = JSON.stringify({ title, body, data });
  const targets = pushSubscriptions.filter(sub => sub.userId === userId);
  const results = await Promise.allSettled(
    targets.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (error: any) {
        console.warn('Push send failed for user, removing subscription if invalid:', error?.statusCode || error?.message);
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          const idx = pushSubscriptions.findIndex(s => s.endpoint === subscription.endpoint);
          if (idx !== -1) pushSubscriptions.splice(idx, 1);
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
  senderAvatar: z.string().max(3000000),
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
  name: z.string().max(50).optional().nullable(),
  avatar: z.string().max(3000000).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  phone: z.string().max(50).optional().nullable(),
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
  roomId: z.string().optional(),
  background: z.boolean().optional()
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
  alias: z.string().min(1).max(50).optional(),
  avatar: z.string().max(3000000).optional()
});

const RoomSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().min(1).max(10),
  type: z.enum(['friends', 'family', 'work', 'care', 'custom']),
  trackingStyle: z.enum(['continuous', 'temporary']).optional()
});

// 2. Authentication Middleware
export interface AuthRequest extends Request {
  user?: { userId: string; authed?: boolean };
}

// 실효 JWT 시크릿 — env가 강한 값이면 그것, 아니면 영속 랜덤(아래 ensureJwtSecret에서 설정)
const JWT_DEFAULT_SECRET = 'aemang-secret-key-change-this-in-production';
let effectiveJwtSecret = JWT_SECRET;

const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, effectiveJwtSecret, { expiresIn: '30d' });
};

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  // 1순위: 유효한 JWT → 그 사용자로 인증(authed). x-user-id가 달라도 토큰을 신뢰(사칭 차단).
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded: any = jwt.verify(token, effectiveJwtSecret);
      req.user = { userId: decoded.userId, authed: true } as any;
      // 슬라이딩 갱신 — 활동 중이면 토큰을 새로 발급해 세션 유지
      try { res.setHeader('x-refresh-token', generateToken(decoded.userId)); } catch {}
      return next();
    } catch (err: any) {
      // 토큰 만료/위조 → 아래 호환 경로로
    }
  }
  // 2순위(호환): x-user-id (인증 안 됨 — 읽기/등록 등 비민감 용도만). 민감 API는 requireAuth로 차단됨.
  const xUserId = req.headers['x-user-id'] as string;
  if (xUserId) {
    req.user = { userId: xUserId, authed: false } as any;
    return next();
  }
  req.user = { userId: 'guest-' + Date.now(), authed: false } as any;
  next();
};

// 민감 엔드포인트: 유효한 JWT가 있어야만 통과
const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !(req.user as any).authed) {
    return res.status(401).json({ error: 'authentication required' });
  }
  next();
};

// ============= CLOSED-ROOMS: 그룹방 폐쇄성(멤버 전용 접근) =============
// 정책:
// - 시스템 기본방(단짝·가족·직장·효도): 공용 데모 공간 — 접근 허용 (기존 UX 유지)
// - 커스텀 그룹방: 방 멤버(비대기) 또는 방장만 접근 가능. 빈 방은 부트스트랩용으로 허용.
// - 음악·맛집·책 등 로비 항목은 전체 공개(별도 가드 없음) — 의도된 설계.
const SYSTEM_ROOM_IDS = ['room-friends', 'room-family', 'room-work', 'room-care'];

function canAccessRoom(room: any, userId?: string): boolean {
  if (!room) return false;
  if (SYSTEM_ROOM_IDS.includes(room.id)) return true; // 공용 데모 방
  if (!userId) return false;
  if (room.ownerId === userId) return true;
  const member = room.friends?.[userId];
  if (member && !member.isPendingInvite) return true;
  // 빈 방 부트스트랩은 방장 정보조차 없는 레거시 방에만 허용 (방장 있는 빈 방은 방장 전용)
  if (!room.ownerId && Object.keys(room.friends || {}).length === 0) return true;
  return false;
}

// roomId(query/body/params 순서로 탐색)에 대한 멤버 전용 가드
const requireRoomMember = (req: AuthRequest, res: Response, next: NextFunction) => {
  const roomId =
    (req.query?.roomId as string) ||
    (req.body && (req.body.roomId as string)) ||
    (req.params && (req.params.roomId as string)) ||
    'room-friends';
  const room = dbRooms[roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const userId = req.user?.userId || (req.headers['x-user-id'] as string);
  if (!canAccessRoom(room, userId)) {
    return res.status(403).json({ error: '이 그룹방의 멤버만 접근할 수 있습니다.' });
  }
  next();
};

// 간단 인메모리 속도 제한 (무차별 대입/남용 방지)
const rateBuckets: Record<string, { count: number; reset: number }> = {};
const rateLimit = (maxPerMin: number) => (req: Request, res: Response, next: NextFunction) => {
  const key = `${(req.ip || req.socket.remoteAddress || '')}:${req.path}`;
  const now = Date.now();
  const b = rateBuckets[key];
  if (!b || now > b.reset) { rateBuckets[key] = { count: 1, reset: now + 60000 }; return next(); }
  if (b.count >= maxPerMin) return res.status(429).json({ error: 'too many requests' });
  b.count++;
  next();
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

// 앱 접속 비밀번호 해시 (전화번호 계정에 연동)
const hashAppPassword = (pw: string): string => {
  return CryptoJS.SHA256('aemang-pw::' + pw + ENCRYPTION_KEY).toString();
};

// ============= EMERGENCY 119 SERVICE INTEGRATION (제거됨) =============
// BIZ-CORE-8 ④: 119 자동신고(call119Emergency)는 법적 리스크(거짓신고·미개방 API)로 제거되었습니다.
// 대체 기능: /api/emergency/sos — 보호자 전원 푸시 알림 + 클라이언트에서 119 직접 전화(tel:) 안내.

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

// ── global 사용자 프로필 저장소 ──────────────────────────────────────────────
const dbUserProfiles: Record<string, any> = {
  'user-minsu': {
    id: 'user-minsu',
    name: '민수',
    avatar: '🥭',
    color: '#3B82F6',
    phone: '010-1234-5678',
    realName: '김민수',
    alias: '민수',
    lat: HONGDAE_LAT,
    lng: HONGDAE_LNG,
    statusMsg: '위치 공유 중! 🥭',
    isOnline: true,
    battery: 92,
    speed: 0,
    heading: '정지',
    route: [],
    routeIndex: 0,
    updatedAt: new Date().toISOString()
  }
};

// 맛집·추천도서·음악 (모든 사용자 공유, 영구 저장)
const dbRestaurants: any[] = [];
const dbBooks: any[] = [];
const dbMusic: any[] = [];
const dbLobbyNotices: any[] = [];
const NOTICE_ADMIN_PASSWORD_HASH =
  process.env.NOTICE_ADMIN_PASSWORD_HASH || 'fba37ae0d72e780855128647aa36ebf4b9e2575561eaaf55db2d890623f2233f';
// 일회성 마이그레이션 플래그 등 내부 메타데이터
const dbMeta: Record<string, any> = {};

// ── 기본 빈 룸 (데모 데이터 없음) ──────────────────────────────────────────
const dbRooms: Record<string, any> = {
  'room-friends': {
    id: 'room-friends', name: '애플망고 단짝방', emoji: '🥭',
    type: 'friends', trackingStyle: 'temporary', isDisbanded: false,
    messages: welcomeMsg('friends', '🍎🥭 애플망고 단짝방에 오신 것을 환영합니다! 친구를 초대해서 실시간 위치를 공유해 보세요. 채팅에서 @망고봇 을 부르면 모임 장소도 추천해 드려요!'),
    friends: {}, appointments: [], notifications: [], notices: []
  },
  'room-family': {
    id: 'room-family', name: '애플망고 가족방', emoji: '🏠',
    type: 'family', trackingStyle: 'continuous', isDisbanded: false,
    messages: welcomeMsg('family', '🏠 가족 안심방이 활성화되었습니다. 가족을 초대하여 상시 위치 공유를 시작하세요!'),
    friends: {}, appointments: [], notifications: [], notices: []
  },
  'room-work': {
    id: 'room-work', name: '애플망고 직장방', emoji: '👔',
    type: 'work', trackingStyle: 'temporary', isDisbanded: false,
    messages: welcomeMsg('work', '👔 직장 동료 방이 활성화되었습니다. 외근·미팅 위치를 공유해 보세요!'),
    friends: {}, appointments: [], notifications: [], notices: []
  },
  'room-care': {
    id: 'room-care', name: '애플망고 효도방', emoji: '👵',
    type: 'care', trackingStyle: 'continuous', isDisbanded: false,
    messages: welcomeMsg('care', '👵 부모님 안심 효도방이 활성화되었습니다. 부모님을 초대하여 실시간 위치와 건강 정보를 확인하세요!'),
    friends: {}, appointments: [], notifications: [], notices: []
  }
};

// 데이터 저장 위치
// 1순위: Upstash Redis(영구) — Render처럼 파일시스템이 휘발성이어도 재배포/재시작에 데이터 유지
// 2순위: 파일(DATA_DIR) — 로컬 개발 또는 영구 볼륨이 있는 환경
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_FILE = path.join(DATA_DIR, 'aemang_db.json');

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useRedis = !!(UPSTASH_URL && UPSTASH_TOKEN);
const REDIS_DB_KEY = 'aemang_db';

async function redisSet(key: string, value: string): Promise<void> {
  // 큰 값은 본문(body)에 그대로 실어 보낸다: POST {URL}/set/{key}
  const res = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: value,
  });
  if (!res.ok) throw new Error(`Upstash SET ${res.status}: ${await res.text()}`);
}

async function redisGet(key: string): Promise<string | null> {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash GET ${res.status}`);
  const data: any = await res.json();
  return data?.result ?? null;
}

// TTL(만료시간) 포함 저장 — 채팅 이미지처럼 일정 기간 후 자동 삭제할 값에 사용
async function redisSetEx(key: string, value: string, ttlSec: number): Promise<void> {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value, 'EX', String(ttlSec)]),
  });
  if (!res.ok) throw new Error(`Upstash SETEX ${res.status}: ${await res.text()}`);
}

// 채팅 이미지 저장/로드 — 메인 DB와 분리(별도 키), 30일 후 자동 만료. Redis 미사용 시 파일.
const IMG_DIR = path.join(DATA_DIR, 'images');
const IMG_TTL_SEC = 30 * 24 * 60 * 60;
async function saveImage(id: string, dataUrl: string): Promise<void> {
  if (useRedis) {
    await redisSetEx(`aemang_img:${id}`, dataUrl, IMG_TTL_SEC);
  } else {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, `${id}.txt`), dataUrl, 'utf8');
  }
}
async function loadImage(id: string): Promise<string | null> {
  if (useRedis) return redisGet(`aemang_img:${id}`);
  try { return fs.readFileSync(path.join(IMG_DIR, `${id}.txt`), 'utf8'); } catch { return null; }
}

function saveDatabase() {
  const payload = JSON.stringify({ dbRooms, dbUserProfiles, dbRestaurants, dbBooks, dbMusic, dbLobbyNotices, dbMeta, dbSafePlaces });
  // 1) 영구 저장소(Upstash Redis) — 비동기 fire-and-forget
  if (useRedis) {
    redisSet(REDIS_DB_KEY, payload).catch(err =>
      console.error('Failed to save database to Upstash:', err?.message || err));
  }
  // 2) 파일 — 로컬/폴백
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, payload, 'utf8');
  } catch (err) {
    console.error('Failed to save database to file:', err);
  }
}

let saveTimeout: NodeJS.Timeout | null = null;
function saveDatabaseDebounced() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveDatabase();
  }, 2000);
}

function applyLoadedData(data: any, source: string) {
  if (!data) return false;
  if (data.dbRooms) {
    Object.keys(dbRooms).forEach(key => delete dbRooms[key]);
    Object.assign(dbRooms, data.dbRooms);
  }
  if (data.dbUserProfiles) {
    Object.keys(dbUserProfiles).forEach(key => delete dbUserProfiles[key]);
    Object.assign(dbUserProfiles, data.dbUserProfiles);
  }
  if (Array.isArray(data.dbRestaurants)) {
    dbRestaurants.length = 0;
    dbRestaurants.push(...data.dbRestaurants);
  }
  if (Array.isArray(data.dbBooks)) {
    dbBooks.length = 0;
    dbBooks.push(...data.dbBooks);
  }
  if (Array.isArray(data.dbMusic)) {
    dbMusic.length = 0;
    dbMusic.push(...data.dbMusic);
  }
  if (Array.isArray(data.dbLobbyNotices)) {
    dbLobbyNotices.length = 0;
    dbLobbyNotices.push(...data.dbLobbyNotices);
  }
  if (data.dbMeta && typeof data.dbMeta === 'object') {
    Object.keys(dbMeta).forEach(k => delete dbMeta[k]);
    Object.assign(dbMeta, data.dbMeta);
  }
  if (data.dbSafePlaces && typeof data.dbSafePlaces === 'object') {
    Object.keys(dbSafePlaces).forEach(k => delete dbSafePlaces[k]);
    Object.assign(dbSafePlaces, data.dbSafePlaces);
  }

  // 기존에 '이름 미등록'으로 저장되어 표시되던 가입 멤버들의 이름 복원 마이그레이션
  let repairedCount = 0;
  Object.keys(dbRooms).forEach(rId => {
    const room = dbRooms[rId];
    if (room && room.friends) {
      Object.keys(room.friends).forEach(fId => {
        const friend = room.friends[fId];
        if (friend && ((friend.name && friend.name.includes('이름 미등록')) || friend.realName === '이름 미등록')) {
          const profile = dbUserProfiles[fId];
          if (profile) {
            const actualName = profile.alias || profile.realName || profile.name || friend.phone || '친구';
            friend.realName = profile.realName || friend.realName;
            friend.alias = profile.alias || friend.alias;
            friend.avatar = profile.avatar || friend.avatar;
            friend.color = profile.color || friend.color;
            friend.name = friend.isPendingInvite ? `${actualName} (대기)` : `${actualName} (합류)`;
            repairedCount++;
          }
        }
      });
    }
  });
  if (repairedCount > 0) {
    console.log(`🛠️ Repaired ${repairedCount} '이름 미등록' friend records to their registered profile details.`);
    saveDatabaseDebounced();
  }

  console.log(`Database loaded successfully from ${source}.`);
  return true;
}

function loadDatabase() {
  // 파일에서 로드(로컬/폴백). Redis 사용 시에는 startServer에서 비동기로 덮어씀.
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      applyLoadedData(JSON.parse(raw), 'file');
    }
  } catch (err) {
    console.error('Failed to load database from file:', err);
  }
}

// 서버 시작 시 Redis에서 우선 로드(있으면 파일 데이터를 덮어씀)
async function loadDatabaseFromRedis(): Promise<void> {
  if (!useRedis) return;
  try {
    const raw = await redisGet(REDIS_DB_KEY);
    if (raw) {
      applyLoadedData(JSON.parse(raw), 'Upstash Redis');
    } else {
      console.log('Upstash Redis is empty — starting fresh (will persist on first change).');
    }
  } catch (err: any) {
    console.error('Failed to load database from Upstash (using file fallback):', err?.message || err);
  }
}

// 30일 지난 데이터 자동 정리 — 단, 약속(appointments) 설정은 보존
function cleanupOldData() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let changed = false;
  Object.values(dbRooms).forEach((room: any) => {
    if (Array.isArray(room.messages)) {
      const before = room.messages.length;
      room.messages = room.messages.filter((m: any) => {
        const t = new Date(m.timestamp).getTime();
        return isNaN(t) || t >= cutoff;
      });
      if (room.messages.length !== before) changed = true;
    }
    if (Array.isArray(room.notifications)) {
      const before = room.notifications.length;
      room.notifications = room.notifications.filter((n: any) => {
        const t = new Date(n.timestamp).getTime();
        if (!isNaN(t) && t < cutoff) return false;           // 30일 경과 제거
        if ((n.title || '').includes('배터리')) return false; // 배터리 경고 알림 제거(기능 폐지)
        return true;
      });
      if (room.notifications.length !== before) changed = true;
    }
    // room.appointments(약속 설정)는 의도적으로 보존 — 삭제하지 않음
  });
  if (changed) saveDatabase();
}

// 일회성 데이터 정리 — '신정강'을 애플망고 가족방(room-family) 제외 모든 방에서 제거
function migrateRemoveSinjeonggang() {
  if (dbMeta.mig_remove_sinjeong_v1) return;
  let changed = false;
  Object.keys(dbRooms).forEach(rId => {
    if (rId === 'room-family') return;
    const room = dbRooms[rId];
    if (!room || !room.friends) return;
    Object.keys(room.friends).forEach(fid => {
      const f = room.friends[fid];
      const nm = `${f?.name || ''}${f?.realName || ''}${f?.alias || ''}`;
      if (nm.includes('신정강')) { delete room.friends[fid]; changed = true; }
    });
  });
  dbMeta.mig_remove_sinjeong_v1 = true;
  if (changed) console.log('Migration: removed 신정강 from non-family rooms.');
  saveDatabase();
}

// 사용자별 개인방 보장 (시작 방 + 이동경로 기록용)
function ensurePersonalRoom(userId: string) {
  if (!userId || !userId.startsWith('user-')) return;
  const roomId = `room-personal-${userId}`;
  const profile = dbUserProfiles[userId] || findUserProfile(userId);
  if (!dbRooms[roomId]) {
    dbRooms[roomId] = {
      id: roomId,
      name: '나의 개인방',
      emoji: '🧍',
      type: 'personal',
      trackingStyle: 'continuous',
      isDisbanded: false,
      ownerId: userId,
      messages: welcomeMsg('personal', '🧍 나만의 개인방입니다. 지도에서 내가 이동한 경로가 옅게 기록됩니다.'),
      friends: {},
      appointments: [],
      notifications: [],
      notices: [],
    };
  }
  if (!dbRooms[roomId].friends[userId]) {
    dbRooms[roomId].friends[userId] = {
      ...(profile || { id: userId, name: '나', avatar: '🍎', color: '#EF4444' }),
      id: userId,
      route: [],
      routeIndex: 0,
    };
  }
}

// 일회성: 모든 사용자 개인방 생성 + 공유 시스템방 멤버 비우기(더 이상 모두에게 노출 안 됨)
function migratePersonalRooms() {
  if (dbMeta.mig_personal_rooms_v1) return;
  Object.keys(dbUserProfiles).forEach(uid => ensurePersonalRoom(uid));
  ['room-friends', 'room-family', 'room-work', 'room-care'].forEach(rid => {
    if (dbRooms[rid]) dbRooms[rid].friends = {};
  });
  dbMeta.mig_personal_rooms_v1 = true;
  console.log('Migration: personal rooms ensured, shared system rooms emptied.');
  saveDatabase();
}

// JWT 시크릿 보장 — env가 강한 값이 아니면 영속 랜덤 시크릿을 생성/사용(토큰 위조 방지)
function ensureJwtSecret() {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret !== JWT_DEFAULT_SECRET) {
    effectiveJwtSecret = envSecret;
    return;
  }
  if (dbMeta.jwtSecret) {
    effectiveJwtSecret = dbMeta.jwtSecret;
  } else {
    effectiveJwtSecret = CryptoJS.lib.WordArray.random(48).toString();
    dbMeta.jwtSecret = effectiveJwtSecret;
    saveDatabase();
    console.warn('⚠️ JWT_SECRET 환경변수가 없어 영속 랜덤 시크릿을 생성했습니다. (운영에서는 JWT_SECRET 설정 권장)');
  }
  if (process.env.NODE_ENV === 'production' && (!envSecret || envSecret === JWT_DEFAULT_SECRET)) {
    console.warn('⚠️ 운영 환경인데 JWT_SECRET이 미설정/기본값입니다. Render 환경변수에 강한 JWT_SECRET 설정을 권장합니다.');
  }
}

loadDatabase();
// 하루에 한 번 오래된 데이터 정리 (최초 정리는 Redis 로드 후 startServer에서 수행)
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

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
  return dbUserProfiles[userId] || null;
}

/** Last GPS sample per room+friend — used for speed/heading */
const lastGpsPosition: Record<string, { lat: number; lng: number; time: number }> = {};

let broadcastLocationToRoom: ((roomId: string, payload: Record<string, unknown>) => void) | null = null;
let broadcastRoomUpdate: ((roomId: string, eventName: string, payload?: any) => void) | null = null;
let broadcastToUser: ((userId: string, eventName: string, payload?: any) => void) | null = null;

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

// ============= BIZ-CORE-8: 이동 타임라인 기록 =============
// 5분 경과 또는 30m 이상 이동 시에만 기록(저장량 억제), 최대 2,000개(약 1주일치)
function recordTimelinePoint(friend: any, lat: number, lng: number) {
  if (!Array.isArray(friend.timeline)) friend.timeline = [];
  const last = friend.timeline[friend.timeline.length - 1];
  const now = Date.now();
  if (last) {
    const dt = now - new Date(last.t).getTime();
    const dist = haversineMeters(last.lat, last.lng, lat, lng);
    if (dt < 5 * 60 * 1000 && dist < 30) return;
  }
  friend.timeline.push({ lat, lng, t: new Date(now).toISOString() });
  while (friend.timeline.length > 2000) friend.timeline.shift();
}

// ============= BIZ-CORE-8: 안심 장소 도착·출발 자동 알림 =============
function checkSafePlaces(room: any, friendId: string, lat: number, lng: number) {
  const places = dbSafePlaces[friendId];
  if (!places || places.length === 0) return;
  const friend = room.friends[friendId];
  if (!friend) return;
  if (!friend.placeStates || typeof friend.placeStates !== 'object') friend.placeStates = {};

  places.forEach((place) => {
    const dist = haversineMeters(lat, lng, place.lat, place.lng);
    const inside = dist <= place.radiusM;
    const wasInside = !!friend.placeStates[place.id];
    if (inside === wasInside) return;
    friend.placeStates[place.id] = inside;

    if (inside && place.notifyArrive) {
      room.notifications.unshift({
        id: `notif-place-arr-${Date.now()}-${friendId}`,
        type: 'arrival',
        title: `🏁 ${place.name} 도착`,
        message: `${friend.name} 님이 [${place.name}]에 안전하게 도착했습니다. 🍎`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      broadcastPushNotification(
        `🏁 ${place.name} 도착`,
        `${friend.name} 님이 ${place.name}에 도착했습니다.`,
        { type: 'place_arrive', friendId, placeId: place.id }
      ).catch(() => {});
    } else if (!inside && place.notifyLeave && wasInside) {
      room.notifications.unshift({
        id: `notif-place-dep-${Date.now()}-${friendId}`,
        type: 'system',
        title: `🚶 ${place.name} 출발`,
        message: `${friend.name} 님이 [${place.name}]에서 출발했습니다.`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      broadcastPushNotification(
        `🚶 ${place.name} 출발`,
        `${friend.name} 님이 ${place.name}에서 출발했습니다.`,
        { type: 'place_leave', friendId, placeId: place.id }
      ).catch(() => {});
    }
  });
}

// ============= BIZ-CORE-8 ⑤: 가족 걸음 챌린지 달성 체크 =============
function checkChallengeProgress() {
  const today = new Date().toISOString().slice(0, 10);
  Object.values(dbRooms).forEach((room: any) => {
    const ch = room.challenge;
    if (!ch || !ch.goalSteps) return;
    const total = Object.values(room.friends || {}).reduce((sum: number, f: any) =>
      sum + (f.stepsTodayDate === today ? (f.stepsToday || 0) : 0), 0);
    if (total >= ch.goalSteps && ch.achievedDate !== today) {
      ch.achievedDate = today;
      room.notifications.unshift({
        id: `notif-challenge-${Date.now()}`,
        type: 'system',
        title: `🏆 [${room.name}] 걸음 챌린지 달성!`,
        message: `[${room.name}] 오늘 합산 ${total.toLocaleString()}걸음으로 목표 ${ch.goalSteps.toLocaleString()}걸음을 달성했습니다! 🎉`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      room.messages.push({
        id: `msg-challenge-${Date.now()}`,
        senderId: 'system', senderName: '걸음 챌린지', senderAvatar: '🏆', senderColor: '#F59E0B',
        text: `🏆 오늘의 [${room.name}] 걸음 챌린지 달성! 모두 합쳐 ${total.toLocaleString()}걸음을 걸었어요. 내일도 함께 걸어요! 🥭`,
        timestamp: new Date().toISOString(), isSystem: true,
      });
      broadcastPushNotification(`🏆 [${room.name}] 걸음 챌린지 달성!`,
        `${room.name}: 오늘 목표 ${ch.goalSteps.toLocaleString()}걸음 달성!`,
        { type: 'challenge_achieved', roomId: room.id }).catch(() => {});
      saveDatabaseDebounced();
    }
  });
}

// ============= BIZ-CORE-8 ①: 부모님 무활동 감지 =============
// 케어·가족방 멤버 중 careWatch가 켜진 멤버의 위치·걸음 활동이 임계 시간 이상 없으면 보호자 알림
function checkInactivity() {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  Object.values(dbRooms).forEach((room: any) => {
    if (room.type !== 'care' && room.type !== 'family') return;
    Object.values(room.friends || {}).forEach((friend: any) => {
      const watch = friend.careWatch;
      if (!watch || !watch.enabled) return;
      const thresholdMs = (watch.thresholdHours || 6) * 60 * 60 * 1000;
      const lastLoc = friend.updatedAt ? new Date(friend.updatedAt).getTime() : 0;
      const lastStep = friend.lastActivityAt ? new Date(friend.lastActivityAt).getTime() : 0;
      const lastActive = Math.max(lastLoc, lastStep);
      if (!lastActive) return;
      if (now - lastActive > thresholdMs && friend.inactivityAlertDate !== today) {
        friend.inactivityAlertDate = today;
        const hours = Math.round((now - lastActive) / (60 * 60 * 1000));
        room.notifications.unshift({
          id: `notif-inactive-${Date.now()}-${friend.id}`,
          type: 'system',
          title: '⚠️ 장시간 무활동 감지',
          message: `${friend.name} 님의 위치·걸음 활동이 약 ${hours}시간 동안 감지되지 않았습니다. 안부 전화를 권해 드립니다. 📞`,
          timestamp: new Date().toISOString(),
          read: false,
        });
        room.messages.push({
          id: `msg-inactive-${Date.now()}`,
          senderId: 'system', senderName: '안심 케어', senderAvatar: '⚠️', senderColor: '#DC2626',
          text: `⚠️ [무활동 감지] ${friend.name} 님의 활동이 약 ${hours}시간 동안 없습니다. 가족 여러분, 안부를 확인해 주세요.`,
          timestamp: new Date().toISOString(), isSystem: true,
        });
        broadcastPushNotification('⚠️ 장시간 무활동 감지',
          `${friend.name} 님의 활동이 ${hours}시간 동안 감지되지 않았습니다.`,
          { type: 'inactivity', roomId: room.id, friendId: friend.id }).catch(() => {});
        saveDatabaseDebounced();
      }
    });
  });
}
setInterval(checkInactivity, 10 * 60 * 1000); // 10분 간격

// ============= BIZ-CORE-8 ⑬: 오늘의 가족 질문(대화 스타터) =============
function postDailyQuestions() {
  const now = new Date();
  if (now.getHours() < 9) return; // 오전 9시 이후에만 발송
  const today = now.toISOString().slice(0, 10);
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  Object.values(dbRooms).forEach((room: any) => {
    if (room.type !== 'family' && room.type !== 'care') return;
    if (Object.keys(room.friends || {}).length < 2) return; // 멤버 2명 이상일 때만
    const metaKey = `dailyQuestion:${room.id}`;
    if (dbMeta[metaKey] === today) return;
    dbMeta[metaKey] = today;
    const question = FAMILY_QUESTIONS[dayOfYear % FAMILY_QUESTIONS.length];
    room.messages.push({
      id: `msg-dq-${Date.now()}-${room.id}`,
      senderId: 'system', senderName: '오늘의 가족 질문', senderAvatar: '💬', senderColor: '#8B5CF6',
      text: `💬 [오늘의 가족 질문]\n${question}\n\n답글로 가족과 이야기를 나눠보세요 🥭`,
      timestamp: new Date().toISOString(), isSystem: true,
    });
    if (broadcastRoomUpdate) broadcastRoomUpdate(room.id, 'room-refresh');
    saveDatabaseDebounced();
  });
}
setInterval(postDailyQuestions, 30 * 60 * 1000); // 30분 간격 체크(하루 1회 발송)

/**
 * Apply GPS/manual location to a friend and optionally broadcast via Socket.IO
 */
function applyFriendLocationUpdate(
  roomId: string,
  friendId: string,
  lat: number,
  lng: number,
  statusMsg?: string,
  options: { broadcast?: boolean; source?: 'gps' | 'manual' | 'background' } = {}
): Record<string, unknown> | null {
  const room = dbRooms[roomId] || dbRooms['room-friends'];
  if (!room?.friends[friendId]) return null;

  const friend = room.friends[friendId];
  const profile = dbUserProfiles[friendId];
  if (profile) {
    friend.name = profile.alias || profile.realName || profile.name || friend.name;
    friend.realName = profile.realName || friend.realName;
    friend.alias = profile.alias || friend.alias;
    friend.avatar = profile.avatar || friend.avatar;
    friend.color = profile.color || friend.color;
    friend.phone = profile.phone || friend.phone;
  }
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
  friend.isOnline = options.source === 'background' ? false : true;
  friend.loggedOut = false; // 다시 활동하면 로그아웃 숨김 해제
  friend.located = true; // 실제 위치를 한 번이라도 공유함 → 지도에 표시
  friend.updatedAt = new Date().toISOString();
  if (statusMsg !== undefined) friend.statusMsg = statusMsg;

  if (!Array.isArray(friend.route)) friend.route = [];
  const lastCoord = friend.route[friend.route.length - 1];
  if (!lastCoord || lastCoord[0] !== lat || lastCoord[1] !== lng) {
    friend.route.push([lat, lng]);
    // 개인방은 전체 이동경로 기록(상한 1000), 일반 방은 최근 60
    const cap = room.type === 'personal' ? 1000 : 60;
    while (friend.route.length > cap) friend.route.shift();
  }
  friend.routeIndex = Math.max(0, friend.route.length - 1);

  if (false) {  // 레거시 제거
    syncUserAllRooms(friendId, lat, lng, statusMsg);
  }

  checkAppointmentArrival(room, friendId, lat, lng);
  recordTimelinePoint(friend, lat, lng);   // BIZ-CORE-8 ③ 이동 타임라인
  checkSafePlaces(room, friendId, lat, lng); // BIZ-CORE-8 ② 안심 장소 도착·출발

  const payload = {
    friendId,
    lat,
    lng,
    statusMsg: friend.statusMsg,
    speed: friend.speed,
    heading: friend.heading,
    battery: friend.battery,
    name: friend.name,
    avatar: friend.avatar,
    color: friend.color,
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

  saveDatabaseDebounced();
  return payload;
}

function simulateMovement() {
  Object.keys(dbRooms).forEach(roomId => {
    const room = dbRooms[roomId];
    Object.keys(room.friends).forEach(id => {
      if (id.startsWith('user-')) return; // Skip all real users
      const friend = room.friends[id];
      if (!friend || !friend.route || friend.route.length <= 1) return;

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
        const today = new Date().toISOString().slice(0, 10);
        const hour = new Date().getHours();
        const isActiveTime = hour >= 8 && hour < 22;
        const walkProbability = isActiveTime ? 0.08 : 0.005; // 8% during active hours, 0.5% during night
        
        if (Math.random() < walkProbability) {
          const stepIncrement = friend.speed > 1 ? Math.floor(8 + Math.random() * 14) : Math.floor(1 + Math.random() * 4);
          
          // 날짜가 변경되었으면 오늘 걸음 0으로 초기화
          if (friend.stepsTodayDate !== today) {
            friend.stepsToday = 0;
            friend.stepsTodayDate = today;
          }
          
          friend.stepsToday = (friend.stepsToday || 0) + stepIncrement;
          friend.stepsTodayDate = today;
          
          if (!friend.stepsHistory || typeof friend.stepsHistory !== 'object') friend.stepsHistory = {};
          friend.stepsHistory[today] = Math.max(friend.stepsHistory[today] || 0, friend.stepsToday);
        }
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
      
      // (배터리 부족 경고 알림 기능 제거됨 — 오작동으로 비활성화)

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
  // 영구 저장소(Upstash Redis)에서 데이터 로드 후 최초 정리 (파일 데이터를 덮어씀)
  await loadDatabaseFromRedis();
  ensureJwtSecret();
  cleanupOldData();
  migrateRemoveSinjeonggang();
  migratePersonalRooms();

  const app = express();
  app.set('trust proxy', true); // Render 등 프록시 뒤에서 실제 클라이언트 IP 사용(rate limit 정확화)
  app.use(express.json({ limit: '10mb' }));

  // Auto-save database on any state-changing request
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          saveDatabaseDebounced();
        }
      });
    }
    next();
  });

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
  const sendConfig = (_req: Request, res: Response) => {
    res.json({
      kakaoMapKey: process.env.KAKAO_MAP_KEY || process.env.VITE_KAKAO_MAP_KEY || '',
    });
  };
  app.get('/api/config', sendConfig);
  app.get('/api/places/config', sendConfig);

  // Link pending invitations by phone number to the actual registered userId
  function linkPendingInvitations(phone: string, userId: string, realName: string, alias: string, avatar: string, color: string) {
    if (!phone) return;
    const targetPhone = phone.trim().replace(/\D/g, '');
    if (!targetPhone) return;

    Object.keys(dbRooms).forEach(roomId => {
      const r = dbRooms[roomId];
      
      // Find if there is any pending invite in this room with the matching phone number
      const pendingKey = Object.keys(r.friends).find(fid => {
        const f = r.friends[fid];
        return f.isPendingInvite && f.phone && f.phone.trim().replace(/\D/g, '') === targetPhone;
      });

      if (pendingKey) {
        if (pendingKey !== userId) {
          const pendingFriend = r.friends[pendingKey];
          // Convert/rename the key to the real userId
          delete r.friends[pendingKey];
          
          r.friends[userId] = {
            ...pendingFriend,
            id: userId,
            name: alias || realName || pendingFriend.name.replace(' (대기)', ''),
            realName: realName || pendingFriend.realName,
            alias: alias || pendingFriend.alias,
            avatar: avatar || pendingFriend.avatar,
            color: color || pendingFriend.color,
            isOnline: true,
            updatedAt: new Date().toISOString()
          };

          // Also ensure any interactive system messages point to the new userId
          r.messages.forEach(m => {
            if (m.isInviteCard && m.inviteId === pendingKey) {
              m.inviteId = userId;
            }
          });
        }

        // Update inviteId in all notifications from pendingKey to userId across all rooms
        Object.keys(dbRooms).forEach(rid => {
          const roomObj = dbRooms[rid];
          if (roomObj.notifications) {
            roomObj.notifications.forEach((n: any) => {
              if (n.type === 'invite' && n.inviteId === pendingKey) {
                n.inviteId = userId;
              }
            });
          }
        });

        // Add a notification directly to the room's notifications list
        const alreadyExistsInRoom = r.notifications.some((n: any) => n.roomId === r.id && n.inviteId === userId);
        if (!alreadyExistsInRoom) {
          r.notifications.unshift({
            id: `notif-invite-direct-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            type: 'invite',
            title: '✉️ 그룹 초대장이 도착했습니다!',
            message: `[${r.name}] 그룹방에 초대되었습니다. 수락하여 참여해 보세요.`,
            timestamp: new Date().toISOString(),
            read: false,
            roomId: r.id, // For routing / accepting
            inviteId: userId // The pending user ID to accept
          });
        }
        
        // Also sync copy to room-friends so they see it
        const defaultRoom = dbRooms['room-friends'];
        if (defaultRoom && defaultRoom !== r) {
          const alreadyExists = defaultRoom.notifications.some((n: any) => n.roomId === r.id && n.inviteId === userId);
          if (!alreadyExists) {
            defaultRoom.notifications.unshift({
              id: `notif-invite-direct-${Date.now()}-${Math.floor(Math.random()*1000)}`,
              type: 'invite',
              title: '✉️ 그룹 초대장이 도착했습니다!',
              message: `회원님을 [${r.name}] 그룹방에 초대했습니다.`,
              timestamp: new Date().toISOString(),
              read: false,
              roomId: r.id,
              inviteId: userId
            });
          }
        }
      }
    });
  }

  // API Endpoints

  // 0. Rooms Catalog Endpoints
  app.get('/api/rooms', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId || 'user-minsu';

    // Link pending invitations if the user's profile phone is set
    const userProfile = findUserProfile(userId);
    if (userProfile && userProfile.phone) {
      linkPendingInvitations(userProfile.phone, userId, userProfile.realName || '', userProfile.alias || '', userProfile.avatar || '🍎', userProfile.color || '#EC4899');
    }

    if (Object.keys(dbRooms).length === 0) {
      dbRooms['room-friends'] = {
        id: 'room-friends', name: '애플망고 단짝방', emoji: '🥭',
        type: 'friends', trackingStyle: 'temporary', isDisbanded: false,
        messages: welcomeMsg('friends', '🍎🥭 애플망고 단짝방에 오신 것을 환영합니다! 친구를 초대해서 실시간 위치를 공유해 보세요. 채팅에서 @애망봇 을 부르면 모임 장소도 추천해 드려요!'),
        friends: {}, appointments: [], notifications: []
      };
    }

    // member 또는 owner인 방만 보임 (기본 시스템방을 모두에게 노출하지 않음 → 방 공유 문제 해결)
    const filteredRooms = Object.values(dbRooms).filter(r => {
      const isMember = r.friends && r.friends[userId] && !r.friends[userId].isPendingInvite;
      const isOwner = r.ownerId === userId;
      return isMember || isOwner;
    });

    const summary = filteredRooms.map(r => ({
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
      // Explicitly remove isPendingInvite to ensure owner is immediately active
      delete customFriends[ownerId].isPendingInvite;
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

    saveDatabaseDebounced();
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

  // Disband temporary rooms automatically
  app.post('/api/rooms/disband', requireAuth, (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });
    const room = dbRooms[roomId];
    if (room) {
      room.isDisbanded = true;
      delete dbRooms[roomId];
      saveDatabaseDebounced();
      if (broadcastRoomUpdate) {
        broadcastRoomUpdate(roomId, 'rooms-updated');
        broadcastRoomUpdate('room-friends', 'rooms-updated');
      }
      return res.json({ success: true, isDisbanded: true, deleted: true });
    }
    res.status(404).json({ error: 'Room not found' });
  });

  // 방 폭파 / 완전히 삭제 — 모든 방 삭제 가능 (시스템 방 포함)
  app.post('/api/rooms/delete', requireAuth, (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

    if (dbRooms[roomId]) {
      delete dbRooms[roomId];
      saveDatabaseDebounced();
      if (broadcastRoomUpdate) {
        broadcastRoomUpdate(roomId, 'rooms-updated');
        broadcastRoomUpdate('room-friends', 'rooms-updated');
      }
      return res.json({ success: true, deletedRoomId: roomId });
    }
    res.status(404).json({ error: 'Room not found' });
  });

  // 대화방 기록 초기화 (안심방 초기화)
  app.post('/api/rooms/reset', (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });
    const room = dbRooms[roomId];
    if (room) {
      let welcomeText = '';
      if (roomId === 'room-friends') welcomeText = '🍎🥭 애플망고 단짝방에 오신 것을 환영합니다! 친구를 초대해서 실시간 위치를 공유해 보세요. 채팅에서 @망고봇 을 부르면 모임 장소도 추천해 드려요!';
      else if (roomId === 'room-family') welcomeText = '🏠 가족 안심방이 활성화되었습니다. 가족을 초대하여 상시 위치 공유를 시작하세요!';
      else if (roomId === 'room-work') welcomeText = '👔 직장 동료 방이 활성화되었습니다. 외근·미팅 위치를 공유해 보세요!';
      else if (roomId === 'room-care') welcomeText = '👵 부모님 안심 효도방이 활성화되었습니다. 부모님을 초대하여 실시간 위치와 건강 정보를 확인하세요!';
      else welcomeText = '방이 초기화되었습니다.';

      room.messages = welcomeMsg(room.type || 'system', welcomeText);
      room.friends = {};
      room.appointments = [];
      room.notifications = [];
      saveDatabaseDebounced();
      if (broadcastRoomUpdate) {
        broadcastRoomUpdate(roomId, 'rooms-updated');
      }
      return res.json({ success: true, resetRoomId: roomId });
    }
    res.status(404).json({ error: 'Room not found' });
  });

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
  app.get('/api/places/search', rateLimit(40), async (req, res) => {
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

  // Invite member by Phone Number endpoint
  app.post('/api/friends/invite', validateRequest(FriendInviteSchema), (req: AuthRequest, res: Response) => {
    const { name, avatar, color, phone, roomId, creatorName } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const cleanPhone = (phone || '').trim() || '번호 미등록';
    const cleanName = (name || '').trim() || '이름 미등록';

    const digits = cleanPhone.replace(/\D/g, '');
    const registeredUserId = digits ? `user-${digits}` : '';
    // Look up if she's already registered in ANY room in dbRooms
    const isAlreadyRegistered = registeredUserId && findUserProfile(registeredUserId);
    const userProfile = isAlreadyRegistered ? findUserProfile(registeredUserId) : null;

    let finalName = '';
    if (cleanName && cleanName !== '이름 미등록') {
      finalName = cleanName;
    } else if (userProfile) {
      finalName = userProfile.alias || userProfile.realName || userProfile.name || cleanPhone;
    } else {
      finalName = cleanPhone;
    }

    const finalRealName = userProfile ? (userProfile.realName || cleanName) : cleanName;
    const finalAvatar = userProfile ? (userProfile.avatar || avatar || '👵') : (avatar || '👵');
    const finalColor = userProfile ? (userProfile.color || color || '#EC4899') : (color || '#EC4899');

    const targetFriendId = isAlreadyRegistered ? registeredUserId : `friend-invited-${Date.now()}`;

    const newFriend = {
      id: targetFriendId,
      name: isAlreadyRegistered ? finalName : `${finalName} (대기)`,
      realName: finalRealName,
      avatar: finalAvatar,
      color: finalColor,
      lat: HONGDAE_LAT + (Math.random() - 0.5) * 0.008,
      lng: HONGDAE_LNG + (Math.random() - 0.5) * 0.008,
      statusMsg: `초대 메시지 수락 대기 중... 📨`,
      isOnline: isAlreadyRegistered ? true : false,
      battery: Math.floor(55 + Math.random() * 40),
      phone: cleanPhone,
      speed: 0,
      heading: '수락대기',
      route: [],
      routeIndex: 0,
      isPendingInvite: true, // Marker to indicate accept is needed
      updatedAt: new Date().toISOString()
    };

    room.friends[targetFriendId] = newFriend;

    // Create a special invitation notification in the custom room
    room.notifications.unshift({
      id: `notif-invite-pending-${Date.now()}`,
      type: 'invite',
      title: '초대장 발송됨 📨',
      message: `[${creatorName || '호스트'}] 님이 ${finalName} 님에게 그룹 가입 초대를 발송했습니다. 수락 시 활성화됩니다.`,
      timestamp: new Date().toISOString(),
      read: false,
      roomId: room.id,
      inviteId: targetFriendId
    });

    // Also push a global invitation notification to 'room-friends' for the target user to see on main screen
    const defaultRoom = dbRooms['room-friends'];
    if (defaultRoom && defaultRoom.id !== room.id) {
      defaultRoom.notifications.unshift({
        id: `notif-invite-direct-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        type: 'invite',
        title: '✉️ 그룹 초대장이 도착했습니다!',
        message: `[${creatorName || '호스트'}] 님이 회원님을 [${room.name}] 그룹방에 초대했습니다.`,
        timestamp: new Date().toISOString(),
        read: false,
        roomId: room.id,
        inviteId: targetFriendId
      });
    }

    // Create an interactive invitation system message in chat
    room.messages.push({
      id: `msg-invite-card-${Date.now()}`,
      senderId: 'system',
      senderName: '초대 안심봇',
      senderAvatar: '✉️',
      senderColor: '#3B82F6',
      text: `✉️ [초대장 도착]\n- 초청자: ${creatorName || '그룹장'}\n- 대상: ${finalName}\n- 연락처: ${cleanPhone}\n👉 아래의 [초대 수락] 버튼을 터치하시면 이 그룹 약속방에 안전하게 입장 완료됩니다!`,
      timestamp: new Date().toISOString(),
      isSystem: true,
      inviteId: targetFriendId,
      isInviteCard: true
    });

    if (broadcastRoomUpdate) {
      broadcastRoomUpdate(activeRoomId, 'rooms-updated');
      broadcastRoomUpdate('room-friends', 'rooms-updated');
    }
    if (broadcastToUser) {
      broadcastToUser(targetFriendId, 'rooms-updated');
    }

    // Web Push 알림 즉시 발송
    void sendPushToUser(
      targetFriendId,
      '✉️ 그룹 초대장이 도착했습니다!',
      `[${creatorName || '호스트'}] 님이 회원님을 [${room.name}] 그룹방에 초대했습니다.`,
      { roomId: room.id, type: 'invite' }
    ).catch(() => {});

    res.json(newFriend);
  });

  // Accept Invitation to Room endpoint
  app.post('/api/friends/accept', (req, res) => {
    const { id, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const friend = room.friends[id];
    if (friend && friend.isPendingInvite) {
      const userProfile = dbUserProfiles[id];
      let actualName = '';
      if (userProfile) {
        actualName = userProfile.alias || userProfile.realName || userProfile.name || friend.name.replace(' (대기)', '');
        friend.realName = userProfile.realName || friend.realName;
        friend.alias = userProfile.alias || friend.alias;
        friend.avatar = userProfile.avatar || friend.avatar;
        friend.color = userProfile.color || friend.color;
      } else {
        actualName = (friend.realName && friend.realName !== '이름 미등록') ? friend.realName : friend.name.replace(' (대기)', '');
      }

      friend.isPendingInvite = false;
      friend.isOnline = true;
      friend.name = `${actualName} (합류)`;
      friend.statusMsg = `안심 애플망고톡 가입완료! 실시간 이동 감지 중 🧭`;
      friend.updatedAt = new Date().toISOString();

      // Send accept notification
      room.notifications.unshift({
        id: `notif-invite-accepted-${Date.now()}`,
        type: 'arrival',
        title: '초대 수락 완료 💖',
        message: `${actualName} 님이 초대를 수락하고 안심 그룹방에 입장했습니다.`,
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
        text: `🎉 [가입 완료] ${actualName} 님이 초대를 수락하고 이 그룹 모임에 합류했습니다! 실시간 전송 센서가 연동되었습니다.`,
        timestamp: new Date().toISOString(),
        isSystem: true
      });

      if (broadcastRoomUpdate) {
        broadcastRoomUpdate(activeRoomId, 'rooms-updated');
        broadcastRoomUpdate('room-friends', 'rooms-updated');
      }

      // 방장에게 푸시 알림 전송
      if (room.ownerId) {
        void sendPushToUser(
          room.ownerId,
          '초대 수락 완료 💖',
          `${friend.realName || friend.name} 님이 초대를 수락하고 안심 그룹방에 입장했습니다.`,
          { roomId: room.id, type: 'arrival' }
        ).catch(() => {});
      }

      return res.json({ success: true, friend });
    }
    res.status(404).json({ error: 'Invited friend not found or already accepted' });
  });

  // Profile Lookup by Phone Number
  app.get('/api/profile-lookup', (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const digits = (phone as string).replace(/\D/g, '');
    const userId = `user-${digits}`;
    const profile = dbUserProfiles[userId];
    if (profile) {
      return res.json({
        exists: true,
        realName: profile.realName || '',
        alias: profile.alias || '',
        avatar: profile.avatar || '🍎'
      });
    }
    res.json({ exists: false });
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

    // global 사용자 프로필 저장 및 업데이트
    if (!dbUserProfiles[userId]) {
      dbUserProfiles[userId] = {
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
      dbUserProfiles[userId].name = displayName;
      if (avatar) {
        dbUserProfiles[userId].avatar = avatar;
      }
      dbUserProfiles[userId].phone = phone;
      dbUserProfiles[userId].realName = realName;
      dbUserProfiles[userId].alias = alias;
      dbUserProfiles[userId].updatedAt = new Date().toISOString();
    }

    // Transfer guest/old user ID records to the new user ID
    const oldUserId = req.user?.userId;
    if (oldUserId && oldUserId !== userId) {
      Object.keys(dbRooms).forEach(roomId => {
        const r = dbRooms[roomId];
        if (r.ownerId === oldUserId) {
          r.ownerId = userId;
        }
        if (r.friends[oldUserId]) {
          r.friends[userId] = {
            ...r.friends[oldUserId],
            id: userId,
            name: displayName,
            avatar: userAvatar,
            phone,
            realName,
            alias,
            isOnline: true,
            updatedAt: new Date().toISOString()
          };
          delete r.friends[oldUserId];
        }
      });
      // Also delete old profile from global storage if it was a temporary guest profile
      if ((oldUserId.startsWith('guest-') || oldUserId.startsWith('user-guest-')) && dbUserProfiles[oldUserId]) {
        delete dbUserProfiles[oldUserId];
      }
    }

    // 이미 속한 방은 프로필만 갱신 (자동 가입하지 않음 — 초대받은 방에만 추가되도록)
    let isMemberAnywhere = false;
    Object.keys(dbRooms).forEach(roomId => {
      const r = dbRooms[roomId];
      if (r.friends[userId] && !r.friends[userId].isPendingInvite) {
        isMemberAnywhere = true;
        r.friends[userId].name = displayName;
        if (avatar) r.friends[userId].avatar = avatar;
        r.friends[userId].phone = phone;
        r.friends[userId].realName = realName;
        r.friends[userId].alias = alias;
        r.friends[userId].updatedAt = new Date().toISOString();
        
        if (broadcastRoomUpdate) {
          broadcastRoomUpdate(roomId, 'rooms-updated');
        }
      }
    });

    // 이 전화번호로 받은 초대(대기)가 있는지 확인 — 있으면 초대된 방에만 합류시킴
    const digitsForInvite = digits;
    const hasPendingInvite = Object.values(dbRooms).some((r: any) =>
      Object.values(r.friends).some((f: any) =>
        f.isPendingInvite && f.phone && f.phone.replace(/\D/g, '') === digitsForInvite
      )
    );

    if (phone) {
      linkPendingInvitations(phone, userId, realName || '', alias || '', userAvatar, color);
    }

    // 모든 사용자에게 본인 전용 개인방을 보장 (시작 방 + 이동경로 기록용)
    ensurePersonalRoom(userId);
    void isMemberAnywhere; void hasPendingInvite; // (시스템방 자동가입 폐지)

    const token = generateToken(userId);
    saveDatabaseDebounced();
    res.json({ success: true, userId, token });
  });

  // ===== 앱 접속 비밀번호 (전화번호 계정 연동 — 다른 기기에서 같은 번호로 접속해도 비번 필요) =====
  app.get('/api/auth/has-password', rateLimit(60), (req, res) => {
    const digits = String(req.query.phone || '').replace(/\D/g, '');
    const profile = dbUserProfiles[`user-${digits}`];
    res.json({ hasPassword: !!(profile && profile.passwordHash) });
  });

  app.post('/api/auth/verify-password', rateLimit(15), (req, res) => {
    const { phone, password } = req.body;
    const digits = String(phone || '').replace(/\D/g, '');
    const userId = `user-${digits}`;
    const profile = dbUserProfiles[userId];
    if (!profile || !profile.passwordHash) return res.json({ success: true, token: generateToken(userId) });
    const ok = hashAppPassword(String(password || '')) === profile.passwordHash;
    // 비번 확인 성공 시 새 토큰 발급(세션 인증 갱신)
    res.json({ success: ok, token: ok ? generateToken(userId) : undefined });
  });

  // 토큰 재발급 — 유효 토큰이면 갱신, 토큰 없으면 비번 없는 계정만 x-user-id로 발급(비번 계정은 잠금화면 필요)
  app.post('/api/auth/refresh', rateLimit(60), (req: AuthRequest, res: Response) => {
    if (req.user?.authed) {
      return res.json({ token: generateToken(req.user.userId) });
    }
    const userId = String(req.headers['x-user-id'] || '');
    const profile = dbUserProfiles[userId];
    if (profile && !profile.passwordHash) {
      return res.json({ token: generateToken(userId) });
    }
    return res.status(401).json({ error: 'auth required' });
  });

  app.post('/api/auth/set-password', rateLimit(15), (req: AuthRequest, res: Response) => {
    const { phone, password, currentPassword } = req.body;
    const digits = String(phone || '').replace(/\D/g, '');
    const userId = digits ? `user-${digits}` : req.user?.userId;
    const profile = userId ? dbUserProfiles[userId] : null;
    if (!profile) return res.status(404).json({ error: 'profile not found' });
    if (profile.passwordHash) {
      if (!currentPassword || hashAppPassword(String(currentPassword)) !== profile.passwordHash) {
        return res.status(403).json({ error: 'wrong current password' });
      }
    }
    if (!password || String(password).length < 4) return res.status(400).json({ error: 'too short' });
    profile.passwordHash = hashAppPassword(String(password));
    saveDatabaseDebounced();
    res.json({ success: true, token: userId ? generateToken(userId) : undefined });
  });

  app.post('/api/auth/remove-password', rateLimit(15), requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId; // 인증된 본인만
    const profile = dbUserProfiles[userId];
    const { currentPassword } = req.body;
    if (!profile) return res.status(404).json({ error: 'profile not found' });
    if (profile.passwordHash && (!currentPassword || hashAppPassword(String(currentPassword)) !== profile.passwordHash)) {
      return res.status(403).json({ error: 'wrong current password' });
    }
    delete profile.passwordHash;
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  // 비밀번호 재설정 — 등록된 실명(realName) 확인으로 본인 인증 후 새 비번 설정
  app.post('/api/auth/reset-password', rateLimit(10), (req, res) => {
    const { phone, realName, password } = req.body;
    const digits = String(phone || '').replace(/\D/g, '');
    const userId = `user-${digits}`;
    const profile = dbUserProfiles[userId];
    if (!profile) return res.status(404).json({ error: 'profile not found' });
    const norm = (s: string) => String(s || '').replace(/\s/g, '').toLowerCase();
    if (!realName || norm(realName) !== norm(profile.realName)) {
      return res.status(403).json({ error: 'name mismatch' });
    }
    if (!password || String(password).length < 4) return res.status(400).json({ error: 'too short' });
    profile.passwordHash = hashAppPassword(String(password));
    saveDatabaseDebounced();
    res.json({ success: true, token: generateToken(userId) });
  });

  // 1. Chat Endpoints
  app.get('/api/chat', requireRoomMember, (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    res.json(room.messages);
  });

  // 채팅 이미지 업로드 — dataURL을 별도 저장(30일 만료)하고 메시지에 이미지 ID만 보관
  app.post('/api/chat/image', requireRoomMember, tryCatch(async (req: AuthRequest, res: Response) => {
    const { senderId, senderName, senderAvatar, senderColor, image, roomId } = req.body;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'invalid image' });
    }
    if (image.length > 1_000_000) {
      return res.status(413).json({ error: 'image too large' });
    }
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const imgId = `img-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    await saveImage(imgId, image);

    const newMsg = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      senderId: senderId || 'user-minsu',
      senderName: senderName || '나 (민수)',
      senderAvatar: senderAvatar || '🟢',
      senderColor: senderColor || '#3B82F6',
      text: '📷 사진',
      image: imgId,
      timestamp: new Date().toISOString(),
    };
    room.messages.push(newMsg);
    saveDatabaseDebounced();
    res.json(newMsg);
  }));

  // 채팅 이미지 서빙 — 저장된 dataURL을 실제 이미지 바이너리로 반환
  app.get('/api/image/:id', tryCatch(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!/^img-\d+-\d+$/.test(id)) return res.status(400).end();
    const dataUrl = await loadImage(id);
    if (!dataUrl) return res.status(404).end();
    const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
    if (!m) return res.status(404).end();
    res.set('Content-Type', m[1]);
    res.set('Cache-Control', 'public, max-age=2592000');
    res.send(Buffer.from(m[2], 'base64'));
  }));

  // ===== 맛집 (모든 사용자 공유) =====
  app.get('/api/restaurants', (_req, res) => {
    res.json(dbRestaurants);
  });

  app.post('/api/restaurants', (req: AuthRequest, res: Response) => {
    const { name, placeName, lat, lng, description, creatorName } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const item = {
      id: `rest-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: String(name).trim(),
      placeName: placeName || '',
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      description: description || '',
      creatorId: req.user?.userId || 'user-minsu',
      creatorName: creatorName || '익명',
      reviews: [] as any[],
      timestamp: new Date().toISOString(),
    };
    dbRestaurants.unshift(item);
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/restaurants/review', (req: AuthRequest, res: Response) => {
    const { id, text, authorName } = req.body;
    const item = dbRestaurants.find(r => r.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    item.reviews.push({
      id: `rev-${Date.now()}`,
      text: String(text).trim(),
      authorId: req.user?.userId || 'user-minsu',
      authorName: authorName || '익명',
      timestamp: new Date().toISOString(),
    });
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/restaurants/update', (req: AuthRequest, res: Response) => {
    const { id, name, placeName, lat, lng, description } = req.body;
    const item = dbRestaurants.find(r => r.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.creatorId !== (req.user?.userId || 'user-minsu')) return res.status(403).json({ error: 'not owner' });
    if (name && name.trim()) item.name = String(name).trim();
    if (placeName !== undefined) item.placeName = placeName;
    if (typeof lat === 'number') item.lat = lat;
    if (typeof lng === 'number') item.lng = lng;
    if (description !== undefined) item.description = description;
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/restaurants/delete', (req: AuthRequest, res: Response) => {
    const { id } = req.body;
    const idx = dbRestaurants.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    if (dbRestaurants[idx].creatorId !== (req.user?.userId || 'user-minsu')) return res.status(403).json({ error: 'not owner' });
    dbRestaurants.splice(idx, 1);
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  // ===== 추천 도서 (모든 사용자 공유) =====
  app.get('/api/books', (_req, res) => {
    res.json(dbBooks);
  });

  app.post('/api/books', (req: AuthRequest, res: Response) => {
    const { title, author, description, creatorName } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    const item = {
      id: `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: String(title).trim(),
      author: author || '',
      description: description || '',
      creatorId: req.user?.userId || 'user-minsu',
      creatorName: creatorName || '익명',
      likes: [] as string[],
      timestamp: new Date().toISOString(),
    };
    dbBooks.unshift(item);
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/books/like', (req: AuthRequest, res: Response) => {
    const { id } = req.body;
    const userId = req.user?.userId || 'user-minsu';
    const item = dbBooks.find(b => b.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!Array.isArray(item.likes)) item.likes = [];
    const i = item.likes.indexOf(userId);
    if (i === -1) item.likes.push(userId); else item.likes.splice(i, 1);
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/books/update', (req: AuthRequest, res: Response) => {
    const { id, title, author, description } = req.body;
    const item = dbBooks.find(b => b.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.creatorId !== (req.user?.userId || 'user-minsu')) return res.status(403).json({ error: 'not owner' });
    if (title && title.trim()) item.title = String(title).trim();
    if (author !== undefined) item.author = author;
    if (description !== undefined) item.description = description;
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/books/delete', (req: AuthRequest, res: Response) => {
    const { id } = req.body;
    const idx = dbBooks.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    if (dbBooks[idx].creatorId !== (req.user?.userId || 'user-minsu')) return res.status(403).json({ error: 'not owner' });
    dbBooks.splice(idx, 1);
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  // 맛집 좋아요(토글)
  app.post('/api/restaurants/like', (req: AuthRequest, res: Response) => {
    const { id } = req.body;
    const userId = req.user?.userId || 'user-minsu';
    const item = dbRestaurants.find(r => r.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!Array.isArray(item.likes)) item.likes = [];
    const i = item.likes.indexOf(userId);
    if (i === -1) item.likes.push(userId); else item.likes.splice(i, 1);
    saveDatabaseDebounced();
    res.json(item);
  });

  // 책 후기 댓글
  app.post('/api/books/review', (req: AuthRequest, res: Response) => {
    const { id, text, authorName } = req.body;
    const item = dbBooks.find(b => b.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    if (!Array.isArray(item.reviews)) item.reviews = [];
    item.reviews.push({
      id: `rev-${Date.now()}`,
      text: String(text).trim(),
      authorId: req.user?.userId || 'user-minsu',
      authorName: authorName || '익명',
      timestamp: new Date().toISOString(),
    });
    saveDatabaseDebounced();
    res.json(item);
  });

  // ===== 음악 (모든 사용자 공유) =====
  app.get('/api/music', (_req, res) => { res.json(dbMusic); });

  app.post('/api/music', (req: AuthRequest, res: Response) => {
    const { title, url, creatorName } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: 'url required' });
    const item = {
      id: `music-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: (title && title.trim()) || '내 음악',
      url: String(url).trim(),
      creatorId: req.user?.userId || 'user-minsu',
      creatorName: creatorName || '익명',
      likes: [] as string[],
      reviews: [] as any[],
      timestamp: new Date().toISOString(),
    };
    dbMusic.unshift(item);
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/music/update', (req: AuthRequest, res: Response) => {
    const { id, title, url } = req.body;
    const item = dbMusic.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.creatorId !== (req.user?.userId || 'user-minsu')) return res.status(403).json({ error: 'not owner' });
    if (title && title.trim()) item.title = String(title).trim();
    if (url && url.trim()) item.url = String(url).trim();
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/music/delete', (req: AuthRequest, res: Response) => {
    const { id } = req.body;
    const idx = dbMusic.findIndex(m => m.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    if (dbMusic[idx].creatorId !== (req.user?.userId || 'user-minsu')) return res.status(403).json({ error: 'not owner' });
    dbMusic.splice(idx, 1);
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  app.post('/api/music/like', (req: AuthRequest, res: Response) => {
    const { id } = req.body;
    const userId = req.user?.userId || 'user-minsu';
    const item = dbMusic.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!Array.isArray(item.likes)) item.likes = [];
    const i = item.likes.indexOf(userId);
    if (i === -1) item.likes.push(userId); else item.likes.splice(i, 1);
    saveDatabaseDebounced();
    res.json(item);
  });

  app.post('/api/music/review', (req: AuthRequest, res: Response) => {
    const { id, text, authorName } = req.body;
    const item = dbMusic.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    if (!Array.isArray(item.reviews)) item.reviews = [];
    item.reviews.push({
      id: `rev-${Date.now()}`,
      text: String(text).trim(),
      authorId: req.user?.userId || 'user-minsu',
      authorName: authorName || '익명',
      timestamp: new Date().toISOString(),
    });
    saveDatabaseDebounced();
    res.json(item);
  });

  app.get('/api/notices/lobby', (_req, res) => {
    res.json(dbLobbyNotices.slice(0, 100));
  });

  app.post('/api/notices/lobby', (req: AuthRequest, res: Response) => {
    const { title, body, authorName, password } = req.body || {};
    const passwordHash = CryptoJS.SHA256(String(password || '')).toString();
    if (passwordHash !== NOTICE_ADMIN_PASSWORD_HASH) {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    const cleanTitle = String(title || '').trim().slice(0, 80);
    const cleanBody = String(body || '').trim().slice(0, 1500);
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ error: '제목과 내용을 입력해 주세요.' });
    }
    const notice = {
      id: `lobby-notice-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      scope: 'lobby',
      title: cleanTitle,
      body: cleanBody,
      authorId: req.user?.userId || 'guest',
      authorName: String(authorName || '공지 작성자').trim().slice(0, 60),
      timestamp: new Date().toISOString(),
    };
    dbLobbyNotices.unshift(notice);
    if (dbLobbyNotices.length > 100) dbLobbyNotices.length = 100;
    saveDatabaseDebounced();
    io.emit('lobby-notices-updated');
    res.json(notice);
  });

  app.post('/api/notices/lobby/update', (req: AuthRequest, res: Response) => {
    const { id, title, body, password } = req.body || {};
    const passwordHash = CryptoJS.SHA256(String(password || '')).toString();
    if (passwordHash !== NOTICE_ADMIN_PASSWORD_HASH) {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    const notice = dbLobbyNotices.find(n => n.id === id);
    if (!notice) return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    const cleanTitle = String(title || '').trim().slice(0, 80);
    const cleanBody = String(body || '').trim().slice(0, 1500);
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ error: '제목과 내용을 입력해 주세요.' });
    }
    notice.title = cleanTitle;
    notice.body = cleanBody;
    notice.updatedAt = new Date().toISOString();
    saveDatabaseDebounced();
    io.emit('lobby-notices-updated');
    res.json(notice);
  });

  app.get('/api/notices/room', requireRoomMember, (req: AuthRequest, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    room.notices = Array.isArray(room.notices) ? room.notices : [];
    res.json(room.notices.slice(0, 100));
  });

  app.post('/api/notices/room', requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, title, body, authorName } = req.body || {};
    const room = dbRooms[roomId || 'room-friends'];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const cleanTitle = String(title || '').trim().slice(0, 80);
    const cleanBody = String(body || '').trim().slice(0, 1500);
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ error: '제목과 내용을 입력해 주세요.' });
    }
    room.notices = Array.isArray(room.notices) ? room.notices : [];
    const notice = {
      id: `room-notice-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      scope: 'room',
      roomId: room.id,
      title: cleanTitle,
      body: cleanBody,
      authorId: req.user?.userId || 'guest',
      authorName: String(authorName || '멤버').trim().slice(0, 60),
      timestamp: new Date().toISOString(),
    };
    room.notices.unshift(notice);
    if (room.notices.length > 100) room.notices.length = 100;
    room.messages.push({
      id: `msg-notice-${Date.now()}`,
      senderId: 'system',
      senderName: '공지',
      senderAvatar: '📢',
      senderColor: '#F59E0B',
      text: `📢 새 공지: ${notice.title}`,
      timestamp: notice.timestamp,
      isSystem: true,
    });
    saveDatabaseDebounced();
    if (broadcastRoomUpdate) broadcastRoomUpdate(room.id, 'room-refresh');
    res.json(notice);
  });

  app.post('/api/notices/room/update', requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, id, title, body } = req.body || {};
    const room = dbRooms[roomId || 'room-friends'];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    room.notices = Array.isArray(room.notices) ? room.notices : [];
    const notice = room.notices.find((n: any) => n.id === id);
    if (!notice) return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    const userId = req.user?.userId || 'guest';
    if (notice.authorId && notice.authorId !== userId) {
      return res.status(403).json({ error: '작성자만 수정할 수 있습니다.' });
    }
    const cleanTitle = String(title || '').trim().slice(0, 80);
    const cleanBody = String(body || '').trim().slice(0, 1500);
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ error: '제목과 내용을 입력해 주세요.' });
    }
    notice.title = cleanTitle;
    notice.body = cleanBody;
    notice.updatedAt = new Date().toISOString();
    saveDatabaseDebounced();
    if (broadcastRoomUpdate) broadcastRoomUpdate(room.id, 'room-refresh');
    res.json(notice);
  });

  app.get('/api/personal/memo', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId || (req.headers['x-user-id'] as string);
    if (!userId) return res.status(400).json({ error: 'no user' });
    const profile = dbUserProfiles[userId] || {};
    res.json({ memo: profile.privateMemo || '', updatedAt: profile.privateMemoUpdatedAt || null });
  });

  app.post('/api/personal/memo', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId || (req.headers['x-user-id'] as string);
    if (!userId) return res.status(400).json({ error: 'no user' });
    if (!dbUserProfiles[userId]) dbUserProfiles[userId] = { id: userId, name: '나', avatar: '🍎', color: '#EF4444' };
    const memo = String(req.body?.memo || '').slice(0, 5000);
    dbUserProfiles[userId].privateMemo = memo;
    dbUserProfiles[userId].privateMemoUpdatedAt = new Date().toISOString();
    saveDatabaseDebounced();
    res.json({ memo, updatedAt: dbUserProfiles[userId].privateMemoUpdatedAt });
  });

  app.get('/api/personal/diary', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId || (req.headers['x-user-id'] as string);
    if (!userId) return res.status(400).json({ error: 'no user' });
    const profile = dbUserProfiles[userId] || {};
    const diaries = profile.privateDiaries && typeof profile.privateDiaries === 'object' ? profile.privateDiaries : {};
    res.json({ diaries });
  });

  app.post('/api/personal/diary', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId || (req.headers['x-user-id'] as string);
    const { date, text } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'no user' });
    const cleanDate = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return res.status(400).json({ error: '날짜가 올바르지 않습니다.' });
    if (!dbUserProfiles[userId]) dbUserProfiles[userId] = { id: userId, name: '나', avatar: '🍎', color: '#EF4444' };
    if (!dbUserProfiles[userId].privateDiaries || typeof dbUserProfiles[userId].privateDiaries !== 'object') {
      dbUserProfiles[userId].privateDiaries = {};
    }
    dbUserProfiles[userId].privateDiaries[cleanDate] = {
      date: cleanDate,
      text: String(text || '').slice(0, 5000),
      updatedAt: new Date().toISOString(),
    };
    saveDatabaseDebounced();
    res.json(dbUserProfiles[userId].privateDiaries[cleanDate]);
  });

  app.post('/api/chat', requireRoomMember, validateRequest(MessageSchema), tryCatch(async (req: AuthRequest, res: Response) => {
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

    // AI Mentions Handler (@애망봇 / @망고봇)
    if (text && (text.includes('@애망봇') || text.includes('@망고봇') || text.includes('@ai') || text.includes('@애망bot'))) {
      const prompt = `사용자가 실시간 친구 모임 및 안심 가로등 앱 '애플망고톡' 내에서 다음과 같은 메시지를 보냈습니다: "${text}".
      이전 대화 목록: ${JSON.stringify(room.messages.slice(-5))}
      참여 친구들의 현재 위치: ${JSON.stringify(Object.values(room.friends).map((f: any) => ({ name: f.name, lat: f.lat, lng: f.lng, status: f.statusMsg })))}
      질문에 맞게 친절하고 위트 있는 @애망봇 캐릭터(말투에 '🍎' 이나 '🥭' 를 섞어서 친근한 한국어로 작성)로 다음 질문에 매장 추천, 안심 조율 팁, 또는 피드백을 제공해 주세요. 3문장 이내로 컴팩트하고 유익하게 조언해주세요.`;

      let aiText = '';
      if (ai) {
        try {
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              systemInstruction: 'You are the playful and smart assistant chatbot of "Amang Signal" (AppleMango Signal) named @애망봇. You suggest meeting spots, coordinate plans, check elder companion safety, and speak in a sweet fruits loving tone in Korean!',
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
        senderName: '애망봇 🤖',
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
          title: '@애망봇 멘션 답변',
          message: '@애망봇이 채팅방에 기발한 귀가/모임 조율 조언을 남겼습니다! 🍎',
          timestamp: new Date().toISOString(),
          read: false,
          });
        }, 1000);
      }

      res.json(newMsg);
    }));

  // 2. Friends/Locations Endpoints
  app.get('/api/friends', requireRoomMember, (req: AuthRequest, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const userId = (req.headers['x-user-id'] as string) || req.user?.userId;
    // 보안 검증: 해당 방의 멤버가 아니라면 친구 및 만보기 정보 반환을 거부
    if (userId && !room.friends[userId]) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this room' });
    }

    // 위치를 숨겨야 하는 경우 좌표(lat/lng/route)를 제거 (멤버 목록에는 남음)
    //  - 위치공유 OFF(프라이버시) / 로그아웃 / 아직 실제 위치를 한 번도 공유 안 함(located 아님)
    //  ※ 단순 앱 종료(offline)는 숨기지 않음 → 마지막 위치를 계속 정상 표시
    const list = Object.values(room.friends).map((f: any) => {
      const locationHidden = f.shareLocation === false || f.loggedOut === true || !f.located;
      if (locationHidden) {
        return { ...f, lat: null, lng: null, route: [], locationHidden: true };
      }
      return f;
    });
    res.json(list);
  });

  // 내 위치 공유 ON/OFF (사용자별, 모든 방에 반영)
  app.post('/api/friends/location-sharing', (req: AuthRequest, res: Response) => {
    const { enabled } = req.body;
    const userId = req.user?.userId;
    if (!userId) return res.status(400).json({ error: 'no user' });
    Object.keys(dbRooms).forEach(rId => {
      const fr = dbRooms[rId].friends[userId];
      if (fr) fr.shareLocation = !!enabled;
    });
    if (dbUserProfiles[userId]) dbUserProfiles[userId].shareLocation = !!enabled;
    saveDatabaseDebounced();
    res.json({ success: true, enabled: !!enabled });
  });

  // 로그아웃 — 위치정보 숨김 처리(앱 미사용 오프라인과 구분)
  app.post('/api/friends/logout', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(400).json({ error: 'no user' });
    Object.keys(dbRooms).forEach(rId => {
      const fr = dbRooms[rId].friends[userId];
      if (fr) { fr.loggedOut = true; fr.isOnline = false; }
    });
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  app.post('/api/friends/move', validateRequest(LocationUpdateSchema), (req: AuthRequest, res: Response) => {
    const { id, lat, lng, statusMsg, roomId, background } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const friendId = id || 'user-minsu';

    if (lat !== undefined && lng !== undefined && room.friends[friendId]) {
      const payload = applyFriendLocationUpdate(activeRoomId, friendId, lat, lng, statusMsg, {
        broadcast: true,
        source: background ? 'background' : 'manual'
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
  app.post('/api/friends/delete', requireAuth, (req, res) => {
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
  app.get('/api/appointments', requireRoomMember, (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    res.json(room.appointments);
  });

  app.post('/api/appointments', requireRoomMember, validateRequest(AppointmentSchema), (req: AuthRequest, res: Response) => {
    const { title, placeName, lat, lng, datetime, creatorName, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    // 생성자를 실제 userId로 참가 처리 (하드코딩 'user-minsu' 제거 → 생성자 참가 클릭 시 중복 카운트 방지)
    const creatorId = req.user?.userId || 'user-minsu';

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
        [creatorId]: 'yes'
      } as Record<string, string>
    };

    room.appointments.push(newApp);
    saveDatabaseDebounced();

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

  app.post('/api/appointments/delete', (req, res) => {
    const { id, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    const index = room.appointments.findIndex((a: any) => a.id === id);
    if (index !== -1) {
      const deletedApp = room.appointments[index];
      room.appointments.splice(index, 1);
      saveDatabaseDebounced();

      room.messages.push({
        id: `msg-app-deleted-${Date.now()}`,
        senderId: 'system',
        senderName: '시스템',
        senderAvatar: '📅',
        senderColor: '#3B82F6',
        text: `📅 [약속 취소] [${deletedApp.title}] 약속 일정이 취소/삭제되었습니다.`,
        timestamp: new Date().toISOString(),
        isSystem: true
      });

      if (broadcastRoomUpdate) {
        broadcastRoomUpdate(activeRoomId, 'rooms-updated');
      }
      return res.json({ success: true });
    }
    res.status(404).json({ error: 'Appointment not found' });
  });

  app.post('/api/appointments/vote', (req, res) => {
    const { id, friendId, vote, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const app = room.appointments.find(a => a.id === id);
    if (!app) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // 의사표시는 한 번이면 충분 — 직전과 동일한 투표면 알림/채팅 중복 생성하지 않고 그대로 반환
    const prevVote = app.votes[friendId];
    if (prevVote === vote) {
      return res.json({ ...app, unchanged: true });
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

    saveDatabaseDebounced();
    res.json(app);
  });

  // 1:1 Game Match Requests global registry
  const dbGameInvites: Record<string, { from: string; to: string; game: 'drone_battle' | 'yut_nori' | 'tetris' | 'rps' | 'omok' | 'baseball'; roomId: string; timestamp: number; tetrisTerrain?: string }> = {};

  // POST /api/games/invite — 대결 신청 (+ 옵션: spectators 관전 초대)
  app.post('/api/games/invite', requireRoomMember, (req: AuthRequest, res: Response) => {
    const { from, to, game, roomId, tetrisTerrain, spectators } = req.body;
    if (!from || !to || !game || !roomId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const inviteId = `game-invite-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    dbGameInvites[inviteId] = {
      from,
      to,
      game,
      roomId,
      timestamp: Date.now(),
      tetrisTerrain
    };

    const senderProfile = findUserProfile(from);
    const senderName = senderProfile ? (senderProfile.alias || senderProfile.realName || senderProfile.name) : '친구';
    const GAME_LABELS: Record<string, string> = { drone_battle: '드론 전쟁', tetris: '테트리스 대전', yut_nori: '윷놀이', rps: '가위바위보', omok: '오목', baseball: '숫자야구' };
    const gameLabel = GAME_LABELS[game] || '게임';

    // 알림: 상대가 어느 방을 보고 있어도 발견하도록, 상대가 멤버인 모든 방에 추가
    // (수락 시 /api/games/accept가 모든 방에서 해당 알림을 일괄 제거함)
    const inviteNotif = {
      id: inviteId,
      type: 'invite',
      title: '🎮 1:1 대결 신청 도착!',
      message: `[${senderName}] 님이 [${gameLabel}] 대결을 신청했습니다.`,
      timestamp: new Date().toISOString(),
      read: false,
      roomId,
      game,
      from,
      to
    };
    let notified = false;
    Object.values(dbRooms).forEach((r: any) => {
      const member = r.friends?.[to];
      if (member && !member.isPendingInvite) {
        r.notifications.unshift({ ...inviteNotif });
        notified = true;
      }
    });
    if (!notified && dbRooms[roomId]) {
      dbRooms[roomId].notifications.unshift({ ...inviteNotif });
    }

    // 실시간 팝업: 대결 방 채널 + 상대방 개인 채널(다른 방에 있어도 수신)
    const invitePayload = {
      type: 'invite',
      from,
      fromName: senderName,
      to,
      game,
      roomId,
      tetrisTerrain
    };
    broadcastToRoom(roomId, 'game-relayed', invitePayload);
    if (broadcastToUser) broadcastToUser(to, 'game-relayed', invitePayload);

    // 관전 초대 (옵션): 선택된 친구들에게 알림 + 개인 채널 푸시
    const spectatorIds: string[] = Array.isArray(spectators) ? spectators.filter((s: any) => typeof s === 'string' && s !== to && s !== from) : [];
    spectatorIds.forEach(sid => {
      const spectateNotif = {
        id: `spectate-${inviteId}-${sid}`,
        type: 'system',
        title: '👀 관전 초대 도착!',
        message: `[${senderName}] 님이 [${gameLabel}] 대결 관전에 초대했습니다. 게임방 탭에서 지켜보세요!`,
        timestamp: new Date().toISOString(),
        read: false,
      };
      Object.values(dbRooms).forEach((r: any) => {
        const member = r.friends?.[sid];
        if (member && !member.isPendingInvite) r.notifications.unshift({ ...spectateNotif });
      });
      if (broadcastToUser) {
        broadcastToUser(sid, 'game-relayed', {
          type: 'spectate-invite',
          from,
          fromName: senderName,
          to: sid,
          game,
          roomId,
        });
      }
    });

    saveDatabaseDebounced();
    res.json({ success: true, inviteId, spectatorsInvited: spectatorIds.length });
  });

  // POST /api/games/accept
  app.post('/api/games/accept', (req: AuthRequest, res: Response) => {
    const { inviteId } = req.body;
    if (!inviteId) {
      return res.status(400).json({ error: 'Invite ID required' });
    }

    const invite = dbGameInvites[inviteId];
    if (!invite) {
      return res.status(404).json({ error: 'Game invitation not found or expired' });
    }

    const { from: senderId, to: receiverId, game, roomId, tetrisTerrain } = invite;
    const senderProfile = findUserProfile(senderId);
    const senderName = senderProfile ? (senderProfile.alias || senderProfile.realName || senderProfile.name) : '친구';
    const receiverProfile = findUserProfile(receiverId);
    const receiverName = receiverProfile ? (receiverProfile.alias || receiverProfile.realName || receiverProfile.name) : '친구';

    // Trigger Socket.IO real-time match accept broadcast to transition both clients
    const acceptPayload = {
      type: 'accept',
      from: receiverId, // The receiver accepted it
      fromName: receiverName,
      to: senderId,     // The sender should match
      game,
      roomId,           // 신청자가 다른 방을 보고 있어도 대결 방으로 전환할 수 있게
      tetrisTerrain
    };
    broadcastToRoom(roomId, 'game-relayed', acceptPayload);
    if (broadcastToUser) broadcastToUser(senderId, 'game-relayed', acceptPayload);

    // GAME-SOCIAL ②: 매치 시작을 방 채팅에 공지 → 다른 멤버들의 관전 유도
    const matchRoom = dbRooms[roomId];
    if (matchRoom) {
      const MATCH_NAMES: Record<string, string> = { drone_battle: '🛸 드론 전쟁', tetris: '🧱 테트리스 대전', yut_nori: '🎲 윷놀이', rps: '✌️ 가위바위보', omok: '⚫ 오목', baseball: '⚾ 숫자야구' };
      const gName = MATCH_NAMES[game] || '🎮 게임';
      matchRoom.messages.push({
        id: `msg-match-${Date.now()}`,
        senderId: 'system', senderName: '게임 리그', senderAvatar: '🎮', senderColor: '#8B5CF6',
        text: `🎮 [대결 시작] ${gName} — ${senderName} vs ${receiverName}!\n게임방 탭에서 실시간 관전과 응원이 가능합니다 👀`,
        timestamp: new Date().toISOString(), isSystem: true,
      });
      if (broadcastRoomUpdate) broadcastRoomUpdate(roomId, 'room-refresh');
      saveDatabaseDebounced();
    }

    // Remove the notification from lists
    Object.values(dbRooms).forEach(r => {
      r.notifications = r.notifications.filter(n => n.id !== inviteId);
    });

    // Clean up registry
    delete dbGameInvites[inviteId];

    res.json({
      success: true,
      game,
      roomId, // 수락자도 대결 방으로 전환
      opponentId: senderId,
      opponentName: senderName,
      role: 'p2', // The receiver acts as Player 2
      tetrisTerrain
    });
  });

  // ============= GAME-SOCIAL ①: 방 게임 리그 (주간 승점 + 결과 채팅 카드) =============
  // 주간 키: 해당 주 월요일 날짜 (YYYY-MM-DD)
  const leagueWeekKey = (): string => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // 월=0
    const monday = new Date(now.getTime() - day * 86400000);
    return monday.toISOString().slice(0, 10);
  };
  const GAME_EMOJI: Record<string, string> = { drone_battle: '🛸', tetris: '🧱', yut_nori: '🎲', rps: '✌️', omok: '⚫', baseball: '⚾' };
  const GAME_NAME: Record<string, string> = { drone_battle: '드론 전쟁', tetris: '테트리스 대전', yut_nori: '윷놀이', rps: '가위바위보', omok: '오목', baseball: '숫자야구' };
  const recentResultKeys: Record<string, number> = {}; // 중복 신고 방지 (10초)

  app.post('/api/games/result', requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, game, winnerId, winnerName, loserId, loserName, draw } = req.body;
    const room = dbRooms[roomId];
    if (!room || !game || (!draw && (!winnerId || !loserId))) {
      return res.status(400).json({ error: 'roomId, game, winnerId, loserId are required' });
    }

    // 양쪽 클라이언트 동시 신고 중복 제거
    const dedupeKey = `${roomId}:${game}:${winnerId}:${loserId}`;
    const now = Date.now();
    if (recentResultKeys[dedupeKey] && now - recentResultKeys[dedupeKey] < 10000) {
      return res.json({ success: true, deduped: true });
    }
    recentResultKeys[dedupeKey] = now;
    Object.keys(recentResultKeys).forEach(k => { if (now - recentResultKeys[k] > 60000) delete recentResultKeys[k]; });

    // 주간 리그 갱신 (주가 바뀌면 자동 리셋)
    const week = leagueWeekKey();
    if (!room.gameLeague || room.gameLeague.week !== week) {
      room.gameLeague = { week, standings: {} };
    }
    const standings = room.gameLeague.standings;
    const ensure = (id: string, name: string) => {
      if (!standings[id]) standings[id] = { name, wins: 0, losses: 0, points: 0 };
      standings[id].name = name || standings[id].name;
      return standings[id];
    };
    if (!draw) {
      const w = ensure(winnerId, winnerName || '승자');
      const l = ensure(loserId, loserName || '상대');
      w.wins += 1; w.points += 3;
      l.losses += 1; l.points += 1; // 참가 점수
    }

    // 순위 요약 (상위 3명)
    const top = Object.values(standings as Record<string, any>)
      .sort((a: any, b: any) => b.points - a.points)
      .slice(0, 3)
      .map((s: any, i: number) => `${['🥇','🥈','🥉'][i]} ${s.name} ${s.points}점`)
      .join(' · ');

    const emoji = GAME_EMOJI[game] || '🎮';
    const gName = GAME_NAME[game] || '게임';
    const cardText = draw
      ? `🏆 [게임 리그] ${emoji} ${gName} — 무승부! (${winnerName} vs ${loserName})\n이번 주 리그: ${top || '집계 중'}`
      : `🏆 [게임 리그] ${emoji} ${gName} — ${winnerName} 승리! (vs ${loserName})\n이번 주 리그: ${top || '집계 중'}`;

    room.messages.push({
      id: `msg-league-${Date.now()}`,
      senderId: 'system', senderName: '게임 리그', senderAvatar: '🏆', senderColor: '#F59E0B',
      text: cardText,
      timestamp: new Date().toISOString(), isSystem: true,
    });
    if (broadcastRoomUpdate) broadcastRoomUpdate(roomId, 'room-refresh');
    saveDatabaseDebounced();
    res.json({ success: true, league: room.gameLeague });
  });

  // ============= 🚌 실시간 버스 위치 (국토교통부 TAGO) =============
  // 키는 환경변수 BUS_API_KEY 로만 주입 (코드·저장소에 키를 두지 않음)
  // 참고: TAGO는 전국 참여 지자체 통합이지만 서울(TOPIS)·경기(GBIS)는 별도 API라 v1에서는 미지원
  const BUS_API_KEY = process.env.BUS_API_KEY || '';

  async function tagoGet(servicePath: string, params: Record<string, string>): Promise<any[]> {
    if (!BUS_API_KEY) throw new Error('BUS_API_KEY 환경변수가 설정되지 않았습니다.');
    const qs = new URLSearchParams({
      serviceKey: BUS_API_KEY,
      _type: 'json',
      numOfRows: '200',
      pageNo: '1',
      ...params,
    });
    const url = `http://apis.data.go.kr/1613000/${servicePath}?${qs.toString()}`;
    const resp = await fetch(url);
    const text = await resp.text();
    // 키 오류 등은 XML로 응답됨
    if (text.trim().startsWith('<')) {
      const errMsg = (text.match(/<returnAuthMsg>([^<]+)</) || text.match(/<errMsg>([^<]+)</))?.[1] || 'TAGO API 오류';
      throw new Error(errMsg);
    }
    const data = JSON.parse(text);
    const header = data?.response?.header;
    if (header && header.resultCode !== '00') {
      throw new Error(header.resultMsg || 'TAGO API 오류');
    }
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  }

  // 도시코드 목록 (24시간 메모리 캐시)
  let busCityCache: { at: number; list: any[] } | null = null;
  app.get('/api/bus/cities', rateLimit(20), tryCatch(async (_req: Request, res: Response) => {
    if (busCityCache && Date.now() - busCityCache.at < 24 * 60 * 60 * 1000) {
      return res.json(busCityCache.list);
    }
    const items = await tagoGet('BusLcInfoInqireService/getCtyCodeList', {});
    const list = items.map((i: any) => ({ cityCode: String(i.citycode), cityName: String(i.cityname) }));
    busCityCache = { at: Date.now(), list };
    res.json(list);
  }));

  // 노선번호로 노선 검색 (TAGO 버스노선정보 서비스 — 공공데이터포털에서 별도 활용신청 필요)
  app.get('/api/bus/routes', rateLimit(30), tryCatch(async (req: Request, res: Response) => {
    const cityCode = String(req.query.cityCode || '');
    const routeNo = String(req.query.routeNo || '').trim();
    if (!cityCode || !routeNo) return res.status(400).json({ error: 'cityCode, routeNo가 필요합니다.' });
    const items = await tagoGet('BusRouteInfoInqireService/getRouteNoList', { cityCode, routeNo });
    res.json(items.map((i: any) => ({
      routeId: String(i.routeid),
      routeNo: String(i.routeno),
      routeType: String(i.routetp || ''),
      start: String(i.startnodenm || ''),
      end: String(i.endnodenm || ''),
    })));
  }));

  // 노선별 실시간 버스 위치
  app.get('/api/bus/locations', rateLimit(60), tryCatch(async (req: Request, res: Response) => {
    const cityCode = String(req.query.cityCode || '');
    const routeId = String(req.query.routeId || '');
    if (!cityCode || !routeId) return res.status(400).json({ error: 'cityCode, routeId가 필요합니다.' });
    const items = await tagoGet('BusLcInfoInqireService/getRouteAcctoBusLcList', { cityCode, routeId });
    res.json(items.map((i: any) => ({
      lat: Number(i.gpslati),
      lng: Number(i.gpslong),
      vehicleNo: String(i.vehicleno || ''),
      nodeName: String(i.nodenm || ''),
      nodeOrder: Number(i.nodeord || 0),
      routeNo: String(i.routenm || ''),
    })).filter((b: any) => !isNaN(b.lat) && !isNaN(b.lng)));
  }));

  // 내 위치를 볼 수 있는 전체 멤버 — 내가 속한 모든 방의 멤버를 방 이름과 함께 반환
  app.get('/api/friends/all-viewers', (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId || (req.headers['x-user-id'] as string);
    if (!userId) return res.json([]);
    const viewers: Record<string, { id: string; name: string; avatar: string; rooms: string[] }> = {};
    Object.values(dbRooms).forEach((room: any) => {
      if (room.isDisbanded) return;
      const me = room.friends?.[userId];
      const isMember = (me && !me.isPendingInvite) || room.ownerId === userId;
      if (!isMember) return;
      Object.values(room.friends || {}).forEach((f: any) => {
        if (!f || f.id === userId || f.isPendingInvite) return;
        if (!viewers[f.id]) {
          viewers[f.id] = { id: f.id, name: f.alias || f.name || '멤버', avatar: f.avatar || '👤', rooms: [] };
        }
        if (!viewers[f.id].rooms.includes(room.name)) viewers[f.id].rooms.push(room.name);
      });
    });
    res.json(Object.values(viewers));
  });

  // 그룹방 이미지(이모지)·이름 변경 — 방장(또는 시스템방 멤버)만 가능
  app.post('/api/rooms/update', requireAuth, requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, emoji, name } = req.body;
    const room = dbRooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const userId = req.user?.userId;
    const isSystemRoom = ['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId);
    if (!isSystemRoom && room.ownerId && room.ownerId !== userId) {
      return res.status(403).json({ error: '방장만 방 정보를 변경할 수 있습니다.' });
    }
    if (emoji && typeof emoji === 'string') room.emoji = emoji.slice(0, 8);
    if (name && typeof name === 'string') room.name = name.slice(0, 30);
    if (broadcastRoomUpdate) broadcastRoomUpdate(roomId, 'rooms-updated');
    saveDatabaseDebounced();
    res.json({ success: true, room: { id: room.id, emoji: room.emoji, name: room.name } });
  });

  app.get('/api/games/league', requireRoomMember, (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const week = leagueWeekKey();
    if (!room.gameLeague || room.gameLeague.week !== week) {
      return res.json({ week, standings: [] });
    }
    const list = Object.entries(room.gameLeague.standings as Record<string, any>)
      .map(([id, s]: [string, any]) => ({ id, ...s }))
      .sort((a: any, b: any) => b.points - a.points);
    res.json({ week, standings: list });
  });

  // 4. Notifications Endpoints
  app.get('/api/notifications', (req: AuthRequest, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId];
    const userId = (req.headers['x-user-id'] as string) || req.user?.userId || 'user-minsu';

    if (!room) {
      return res.json([]);
    }

    // 보안 검증: 현재 방의 가입 멤버일 때만 해당 방의 일반 알림을 가져옴
    const isMember = room.friends && !!room.friends[userId];
    let roomNotifications: any[] = [];

    if (isMember) {
      roomNotifications = room.notifications.filter(n => {
        // 1. If it's a room invite: only return if inviteId matches requesting userId
        if (n.type === 'invite' && n.inviteId && !n.game) {
          return n.inviteId === userId;
        }
        // 2. If it's a game invite: only return if recipient 'to' matches requesting userId
        if (n.type === 'invite' && n.game) {
          return n.to === userId;
        }
        return true;
      });
    }

    // 타 방에서 수신한 미수락 초대장 목록(room invite, game invite)을 함께 전달
    const otherInvitations: any[] = [];
    Object.keys(dbRooms).forEach(rId => {
      if (rId === roomId && isMember) return;
      const r = dbRooms[rId];
      if (r && r.notifications) {
        r.notifications.forEach(n => {
          if (n.type === 'invite') {
            if (n.game && n.to === userId) {
              if (!otherInvitations.some(x => x.id === n.id)) {
                otherInvitations.push(n);
              }
            } else if (!n.game && n.inviteId === userId) {
              if (!otherInvitations.some(x => x.id === n.id)) {
                otherInvitations.push(n);
              }
            }
          }
        });
      }
    });

    const allNotifs = [...roomNotifications, ...otherInvitations].map(n => ({
      ...n,
      read: n.readBy ? n.readBy.includes(userId) : !!n.read
    }));
    allNotifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(allNotifs);
  });

  app.post('/api/notifications/read', (req: AuthRequest, res) => {
    const { id, roomId } = req.body;
    const userId = (req.headers['x-user-id'] as string) || req.user?.userId || 'user-minsu';
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    
    if (id) {
      const notif = room.notifications.find(n => n.id === id);
      if (notif) {
        notif.readBy = notif.readBy || [];
        if (!notif.readBy.includes(userId)) {
          notif.readBy.push(userId);
        }
      }
    } else {
      room.notifications.forEach(n => {
        n.readBy = n.readBy || [];
        if (!n.readBy.includes(userId)) {
          n.readBy.push(userId);
        }
      });
    }
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  app.post('/api/friends/pedometer', validateRequest(PedometerSchema), (req: AuthRequest, res: Response) => {
    const { id, pedometerEnabled, stepsToday, roomId } = req.body;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (오늘 기준)
    // 사용자 걸음수는 본인이 속한 모든 방에 동기화(친구들이 어디서든 볼 수 있게) + 날짜 기록
    let updatedAny = false;
    Object.keys(dbRooms).forEach(rId => {
      const friend = dbRooms[rId].friends[id];
      if (!friend) return;
      updatedAny = true;
      if (typeof pedometerEnabled === 'boolean') friend.pedometerEnabled = pedometerEnabled;
      if (typeof stepsToday === 'number') {
        friend.stepsToday = stepsToday;
        friend.stepsTodayDate = today;
        // BIZ-CORE-8 ⑧: 서버측 일별 걸음 히스토리(효도 리포트·챌린지 데이터원), 최근 365일 보관
        if (!friend.stepsHistory || typeof friend.stepsHistory !== 'object') friend.stepsHistory = {};
        friend.stepsHistory[today] = Math.max(friend.stepsHistory[today] || 0, stepsToday);
        const dates = Object.keys(friend.stepsHistory).sort();
        while (dates.length > 365) { delete friend.stepsHistory[dates.shift() as string]; }
        // 활동 감지 시각 갱신(무활동 감지 오탐 방지)
        if (stepsToday > (friend.lastStepCount || 0)) friend.lastActivityAt = new Date().toISOString();
        friend.lastStepCount = stepsToday;
      }
      if (friend.pedometerEnabled && friend.stepsToday === undefined) friend.stepsToday = 0;
    });
    // BIZ-CORE-8 ⑤: 걸음 챌린지 달성 체크
    checkChallengeProgress();
    void roomId;
    if (!updatedAny) {
      return res.status(404).json({ error: 'Friend not found' });
    }
    saveDatabaseDebounced();
    res.json({ success: true });
  });

  // 실제 기기 배터리 보고 — 표시용으로만 반영(경고 알림 없음)
  app.post('/api/friends/battery', (req: AuthRequest, res: Response) => {
    const { battery, charging } = req.body;
    const userId = req.user?.userId;
    const level = Math.round(Number(battery));
    if (!userId || isNaN(level)) return res.status(400).json({ error: 'invalid' });
    Object.keys(dbRooms).forEach(rId => {
      const friend = dbRooms[rId].friends[userId];
      if (friend) { friend.battery = level; friend.charging = !!charging; }
    });
    saveDatabaseDebounced();
    res.json({ success: true });
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

  // ============= BIZ-CORE-8 신규 API =============

  // ② 안심 장소(이름 있는 다중 지오펜스) CRUD
  app.get('/api/friends/places/:friendId', (req, res) => {
    res.json(dbSafePlaces[req.params.friendId] || []);
  });

  app.post('/api/friends/places', requireAuth, (req: AuthRequest, res: Response) => {
    const { friendId, name, lat, lng, radiusM, notifyArrive, notifyLeave } = req.body;
    if (!friendId || !name || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'friendId, name, lat, lng are required' });
    }
    if (!dbSafePlaces[friendId]) dbSafePlaces[friendId] = [];
    if (dbSafePlaces[friendId].length >= 10) {
      return res.status(400).json({ error: '안심 장소는 최대 10개까지 등록할 수 있습니다.' });
    }
    const place: SafePlace = {
      id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(name).slice(0, 30),
      lat, lng,
      radiusM: Math.min(Math.max(Number(radiusM) || 300, 100), 5000),
      notifyArrive: notifyArrive !== false,
      notifyLeave: notifyLeave !== false,
    };
    dbSafePlaces[friendId].push(place);
    saveDatabaseDebounced();
    res.json({ success: true, place, places: dbSafePlaces[friendId] });
  });

  app.delete('/api/friends/places/:friendId/:placeId', requireAuth, (req, res) => {
    const { friendId, placeId } = req.params;
    if (!dbSafePlaces[friendId]) return res.status(404).json({ error: 'not found' });
    dbSafePlaces[friendId] = dbSafePlaces[friendId].filter(p => p.id !== placeId);
    saveDatabaseDebounced();
    res.json({ success: true, places: dbSafePlaces[friendId] });
  });

  // ③ 이동 타임라인 조회 (날짜별 동선 + 요약)
  app.get('/api/friends/timeline', requireRoomMember, (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const friendId = req.query.friendId as string;
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const room = dbRooms[roomId] || dbRooms['room-friends'];
    const friend = room?.friends?.[friendId];
    if (!friend) return res.status(404).json({ error: 'Friend not found' });

    const points = (Array.isArray(friend.timeline) ? friend.timeline : [])
      .filter((pt: any) => typeof pt?.t === 'string' && pt.t.slice(0, 10) === date);

    let distanceM = 0;
    for (let i = 1; i < points.length; i++) {
      distanceM += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
    res.json({
      friendId, date, points,
      summary: {
        pointCount: points.length,
        distanceM: Math.round(distanceM),
        firstAt: points[0]?.t || null,
        lastAt: points[points.length - 1]?.t || null,
      },
    });
  });

  // ① 무활동 감지 설정 (케어·가족방 멤버별)
  app.post('/api/care/watch', requireAuth, requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, friendId, enabled, thresholdHours } = req.body;
    const room = dbRooms[roomId || 'room-care'];
    const friend = room?.friends?.[friendId];
    if (!friend) return res.status(404).json({ error: 'Friend not found' });
    friend.careWatch = {
      enabled: !!enabled,
      thresholdHours: Math.min(Math.max(Number(thresholdHours) || 6, 1), 48),
    };
    if (enabled) friend.inactivityAlertDate = undefined; // 재설정 시 당일 알림 초기화
    saveDatabaseDebounced();
    res.json({ success: true, careWatch: friend.careWatch });
  });

  // ⑤ 가족 걸음 챌린지 설정·현황
  app.post('/api/rooms/challenge', requireAuth, requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, goalSteps } = req.body;
    const room = dbRooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const goal = Number(goalSteps);
    if (!goal || goal < 1000) {
      room.challenge = undefined; // 0 또는 미만 값이면 챌린지 해제
    } else {
      room.challenge = { goalSteps: Math.min(goal, 1000000), setAt: new Date().toISOString() };
      room.messages.push({
        id: `msg-ch-set-${Date.now()}`,
        senderId: 'system', senderName: '걸음 챌린지', senderAvatar: '🏆', senderColor: '#F59E0B',
        text: `🏆 [${room.name}] 걸음 챌린지가 설정되었습니다! 오늘 다 함께 ${goal.toLocaleString()}걸음을 걸어봐요. 진행 상황은 만보기 탭에서 확인! 🥾`,
        timestamp: new Date().toISOString(), isSystem: true,
      });
    }
    saveDatabaseDebounced();
    res.json({ success: true, challenge: room.challenge || null });
  });

  app.get('/api/rooms/challenge', requireRoomMember, (req, res) => {
    const roomId = (req.query.roomId as string) || 'room-friends';
    const room = dbRooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const today = new Date().toISOString().slice(0, 10);
    const members = Object.values(room.friends || {}).map((f: any) => ({
      id: f.id, name: f.name, avatar: f.avatar,
      steps: f.stepsTodayDate === today ? (f.stepsToday || 0) : 0,
    }));
    const totalSteps = members.reduce((s, m) => s + m.steps, 0);
    const ch = room.challenge || null;
    res.json({
      challenge: ch,
      totalSteps,
      members,
      progress: ch?.goalSteps ? Math.min(100, Math.round((totalSteps / ch.goalSteps) * 100)) : 0,
      achievedToday: ch?.achievedDate === today,
    });
  });

  // ⑧ 디지털 효도 리포트 — 최근 7일 활동을 따뜻한 문장으로 요약
  app.get('/api/care/report', requireAuth, requireRoomMember, async (req: AuthRequest, res: Response) => {
    const roomId = (req.query.roomId as string) || 'room-care';
    const friendId = req.query.friendId as string;
    const room = dbRooms[roomId];
    const friend = room?.friends?.[friendId];
    if (!friend) return res.status(404).json({ error: 'Friend not found' });

    // 최근 7일 걸음 데이터
    const days: Array<{ date: string; steps: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ date: d, steps: friend.stepsHistory?.[d] || (friend.stepsTodayDate === d ? friend.stepsToday || 0 : 0) });
    }
    const totalSteps = days.reduce((s, d) => s + d.steps, 0);
    const activeDays = days.filter(d => d.steps > 500).length;
    const bestDay = days.reduce((a, b) => (b.steps > a.steps ? b : a), days[0]);
    const avgBpm = Array.isArray(friend.heartRateHistory) && friend.heartRateHistory.length
      ? Math.round(friend.heartRateHistory.reduce((s: number, h: any) => s + h.bpm, 0) / friend.heartRateHistory.length)
      : null;

    const stats = { name: friend.name, totalSteps, activeDays, bestDay, avgBpm, days };

    let reportText =
      `🍎 ${friend.name} 님의 일주일 안심 리포트\n` +
      `이번 주 총 ${totalSteps.toLocaleString()}걸음을 걸으셨고, 7일 중 ${activeDays}일 활동하셨어요.\n` +
      `가장 많이 걸은 날은 ${bestDay.date} (${bestDay.steps.toLocaleString()}걸음)입니다.` +
      (avgBpm ? `\n최근 평균 심박수는 ${avgBpm}bpm으로 기록되었습니다.` : '');

    if (ai) {
      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `아래는 부모님(${friend.name} 님)의 최근 7일 활동 데이터입니다. 자녀에게 보내는 따뜻하고 안심되는 '효도 리포트'를 한국어 3~4문장으로 작성해 주세요. 감시하는 느낌이 아니라 따뜻한 안부 느낌으로, 구체적 수치를 1~2개만 자연스럽게 녹여 주세요. 말끝에 🍎나 🥭를 한 번만 사용하세요.\n데이터: ${JSON.stringify(stats)}`,
        });
        if (result.text) reportText = `🍎 ${friend.name} 님의 일주일 안심 리포트\n${result.text}`;
      } catch (err) {
        console.error('Care report AI generation failed, using template:', err);
      }
    }

    res.json({ success: true, report: reportText, stats });
  });

  // ⑧ 효도 리포트를 방 채팅으로 공유
  app.post('/api/care/report/send', requireAuth, requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId, report } = req.body;
    const room = dbRooms[roomId];
    if (!room || !report) return res.status(400).json({ error: 'roomId and report are required' });
    const msg = {
      id: `msg-care-report-${Date.now()}`,
      senderId: 'system', senderName: '효도 리포트', senderAvatar: '🍎', senderColor: '#10B981',
      text: String(report).slice(0, 2000),
      timestamp: new Date().toISOString(), isSystem: true,
    };
    room.messages.push(msg);
    if (broadcastRoomUpdate) broadcastRoomUpdate(roomId, 'room-refresh');
    saveDatabaseDebounced();
    res.json({ success: true, message: msg });
  });

  // ⑬ 오늘의 가족 질문 수동 발송(테스트·즉시 발송용)
  app.post('/api/rooms/daily-question', requireAuth, requireRoomMember, (req: AuthRequest, res: Response) => {
    const { roomId } = req.body;
    const room = dbRooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const question = FAMILY_QUESTIONS[Math.floor(Math.random() * FAMILY_QUESTIONS.length)];
    room.messages.push({
      id: `msg-dq-${Date.now()}`,
      senderId: 'system', senderName: '오늘의 가족 질문', senderAvatar: '💬', senderColor: '#8B5CF6',
      text: `💬 [오늘의 가족 질문]\n${question}\n\n답글로 가족과 이야기를 나눠보세요 🥭`,
      timestamp: new Date().toISOString(), isSystem: true,
    });
    if (broadcastRoomUpdate) broadcastRoomUpdate(roomId, 'room-refresh');
    saveDatabaseDebounced();
    res.json({ success: true, question });
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
  // BIZ-CORE-8 ④: 119 자동신고 → 보호자 SOS 알림으로 변경
  // 법적 사유: 119는 민간 앱에 개방된 신고 API가 없으며, 자동신고 구조는 거짓신고 리스크가 있음.
  // 동작: 방 전체 멤버에게 긴급 푸시 + 채팅·알림 기록. 119 연결은 사용자가 직접 전화(클라이언트 tel: 링크).
  const handleSosRequest = (roomId: string, friendId: string, requesterName?: string) => {
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];
    const friend = room.friends[friendId];
    if (!friend) return null;

    const sosMsg = {
      id: `msg-sos-${Date.now()}`,
      senderId: 'system',
      senderName: '🆘 SOS 긴급 알림',
      senderAvatar: '🆘',
      senderColor: '#DC2626',
      text: `🆘 [SOS 긴급 호출]\n- 대상: ${friend.name}\n- 현재 위치: (위도 ${friend.lat.toFixed(4)}, 경도 ${friend.lng.toFixed(4)})\n- 심박수: ${friend.heartRate ? `${friend.heartRate}bpm` : '미공유'} / 배터리: ${friend.battery ?? '-'}%\n${requesterName ? `- 호출자: ${requesterName}\n` : ''}- 지도에서 위치를 확인하고, 응급 상황이면 119에 직접 전화해 주세요.`,
      timestamp: new Date().toISOString(),
      isSystem: true
    };
    room.messages.push(sosMsg);

    room.notifications.unshift({
      id: `notif-sos-${Date.now()}`,
      type: 'system',
      title: '🆘 SOS 긴급 호출',
      message: `${friend.name} 님에 대한 SOS가 발신되었습니다. 위치를 확인하고 안부를 확인해 주세요!`,
      timestamp: new Date().toISOString(),
      read: false
    });

    broadcastPushNotification(
      '🆘 SOS 긴급 호출',
      `${friend.name} 님의 SOS! 지금 위치를 확인해 주세요.`,
      { type: 'sos', roomId: activeRoomId, friendId, lat: friend.lat, lng: friend.lng }
    ).catch(() => {});

    saveDatabaseDebounced();
    return { sosMsg, friend };
  };

  app.post('/api/emergency/sos', requireAuth, tryCatch(async (req: AuthRequest, res: Response) => {
    const { friendId, roomId, requesterName } = req.body;
    if (!friendId) {
      return res.status(400).json({ error: 'friendId is required' });
    }
    const result = handleSosRequest(roomId, friendId, requesterName);
    if (!result) return res.status(404).json({ error: 'Friend not found' });
    return res.json({ success: true, message: result.sosMsg });
  }));

  // (구) /api/emergency/dispatch — 하위 호환을 위해 SOS로 동일 처리
  app.post('/api/emergency/dispatch', requireAuth, tryCatch(async (req: AuthRequest, res: Response) => {
    const { friendId, roomId } = req.body;
    if (!friendId) {
      return res.status(400).json({ error: 'friendId is required' });
    }
    const result = handleSosRequest(roomId, friendId);
    if (!result) return res.status(404).json({ error: 'Friend not found' });
    return res.json({ success: true, message: result.sosMsg });
  }));

  // 5. Google GenAI Coordinates Advisor Endpoint (@api/gemini/coordinate)
  // BIZ-CORE-8 ⑦: AI 약속 어드바이저 — 멤버들의 실제 위치 기반 중간지점 추천(홍대 하드코딩 제거)
  app.post('/api/gemini/advisor', rateLimit(20), requireAuth, async (req, res) => {
    const { message, roomId } = req.body;
    const activeRoomId = roomId || 'room-friends';
    const room = dbRooms[activeRoomId] || dbRooms['room-friends'];

    // 위치를 실제로 공유 중인 멤버들의 중간지점(centroid) 계산
    const locatedMembers = Object.values(room.friends || {}).filter(
      (f: any) => f.located && typeof f.lat === 'number' && typeof f.lng === 'number'
    ) as any[];
    let midpoint: { lat: number; lng: number } | null = null;
    if (locatedMembers.length > 0) {
      midpoint = {
        lat: locatedMembers.reduce((s, f) => s + f.lat, 0) / locatedMembers.length,
        lng: locatedMembers.reduce((s, f) => s + f.lng, 0) / locatedMembers.length,
      };
    }
    const memberSummary = locatedMembers
      .map((f: any) => `${f.name}(${f.lat.toFixed(4)}, ${f.lng.toFixed(4)})`)
      .join(', ');

    if (!ai) {
      return res.json({
        advice: midpoint
          ? `🍎 멤버 ${locatedMembers.length}명의 중간지점은 위도 ${midpoint.lat.toFixed(4)}, 경도 ${midpoint.lng.toFixed(4)} 부근입니다. 지도에서 이 근처의 카페나 공원을 약속 장소로 정해보세요! 🥭`
          : '🍎 아직 위치를 공유한 멤버가 없어요. 위치 공유를 켜면 모두에게 공평한 중간지점을 추천해 드립니다! 🥭',
        midpoint,
      });
    }

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `사용자가 모임 장소 추천을 요청했습니다. 메세지: "${message}".
        이 방은 [${room.name}] 방이며 유형은 "${room.type}"입니다.
        ${midpoint
          ? `현재 위치를 공유 중인 멤버: ${memberSummary}. 모두의 중간지점은 대략 위도 ${midpoint.lat.toFixed(4)}, 경도 ${midpoint.lng.toFixed(4)} 입니다. 이 좌표가 속한 한국의 실제 동네/지역을 추정하고, 그 인근에서 모두에게 공평한 만남 장소(카페·공원·역 등)를 추천해 주세요.`
          : '아직 위치를 공유한 멤버가 없으므로, 서울 시내에서 접근성이 좋은 보편적인 만남 장소를 추천해 주세요.'}
        애플망고톡 특유의 산뜻하고 안심 가득한 톤앤매너로(말끝에 과일🍎 이나 🥭을 소량 섞어서) 3문장 이내로, 방의 성격(가족, 친구, 부모님 안심)에 어울리게 추천해 주세요.`
      });
      res.json({
        advice: result.text || '🍎 멤버들의 중간지점 근처 카페나 공원이 조율하기 좋은 만남 장소망고! 🥭',
        midpoint,
      });
    } catch (err: any) {
      console.error(err);
      res.json({
        advice: midpoint
          ? `🥭 멤버들의 중간지점(위도 ${midpoint.lat.toFixed(4)}, 경도 ${midpoint.lng.toFixed(4)}) 근처에서 만나는 것을 추천해요!`
          : '🥭 위치 공유를 켜면 모두에게 공평한 중간지점을 추천해 드릴 수 있어망고!',
        midpoint,
      });
    }
  });

  // 개인정보처리방침 (Privacy Policy) Route
  app.get(['/privacy', '/privacy-policy'], (req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'PRIVACY_POLICY.md');
      if (fs.existsSync(filePath)) {
        const markdown = fs.readFileSync(filePath, 'utf8');
        // Simple Markdown-to-HTML parser for basic rendering
        let htmlContent = markdown
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          // Headings
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          // Bold
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          // Horizontal Rule
          .replace(/^---$/gim, '<hr />')
          // List items
          .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
          .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

        const lines = htmlContent.split('\n');
        let inList = false;
        const processedLines = lines.map(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('<li>')) {
            if (!inList) {
              inList = true;
              return '<ul>' + line;
            }
            return line;
          } else {
            if (inList) {
              inList = false;
              return '</ul>' + (trimmed && !trimmed.startsWith('<h') && !trimmed.startsWith('<hr') ? `<p>${line}</p>` : line);
            }
            if (trimmed && !trimmed.startsWith('<h') && !trimmed.startsWith('<hr') && !trimmed.startsWith('<p') && !trimmed.startsWith('<ul') && !trimmed.startsWith('</ul')) {
              return `<p>${line}</p>`;
            }
            return line;
          }
        });
        if (inList) {
          processedLines.push('</ul>');
        }
        const parsedHtml = processedLines.join('\n');

        res.send(`
          <!DOCTYPE html>
          <html lang="ko">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>애플망고톡 개인정보처리방침</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
              :root {
                --primary: #F97316;
                --primary-hover: #EA580C;
                --mango-grad: linear-gradient(135deg, #F97316 0%, #EC4899 100%);
                --bg-light: #FAFAFA;
                --card-bg: #FFFFFF;
                --text-main: #1F2937;
                --text-muted: #4B5563;
                --border-color: #E5E7EB;
              }
              @media (prefers-color-scheme: dark) {
                :root {
                  --bg-light: #111827;
                  --card-bg: #1F2937;
                  --text-main: #F9FAFB;
                  --text-muted: #9CA3AF;
                  --border-color: #374151;
                }
              }
              body {
                font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: var(--bg-light);
                color: var(--text-main);
                line-height: 1.625;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 800px;
                margin: 0 auto;
                padding: 40px 20px;
              }
              .card {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 40px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
              }
              .header {
                margin-bottom: 20px;
              }
              h1 {
                font-size: 2.25rem;
                font-weight: 700;
                margin-top: 0;
                margin-bottom: 15px;
                background: var(--mango-grad);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: inline-block;
              }
              h2 {
                font-size: 1.5rem;
                font-weight: 600;
                margin-top: 40px;
                margin-bottom: 16px;
                color: var(--primary);
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 8px;
              }
              h3 {
                font-size: 1.15rem;
                font-weight: 600;
                margin-top: 24px;
                margin-bottom: 12px;
              }
              p {
                margin-top: 0;
                margin-bottom: 16px;
                color: var(--text-main);
              }
              ul, ol {
                margin-top: 0;
                margin-bottom: 24px;
                padding-left: 24px;
              }
              li {
                margin-bottom: 8px;
              }
              strong {
                font-weight: 600;
                color: var(--text-main);
              }
              hr {
                border: 0;
                border-top: 1px solid var(--border-color);
                margin: 30px 0;
              }
              .footer {
                text-align: center;
                margin-top: 40px;
                color: var(--text-muted);
                font-size: 0.875rem;
              }
              .back-btn {
                display: inline-block;
                padding: 10px 20px;
                background: var(--mango-grad);
                color: white;
                text-decoration: none;
                border-radius: 9999px;
                font-weight: 500;
                font-size: 0.875rem;
                box-shadow: 0 4px 10px rgba(249, 115, 22, 0.2);
                transition: transform 0.2s, box-shadow 0.2s;
              }
              .back-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 15px rgba(249, 115, 22, 0.3);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="card">
                <div class="header">
                  ${parsedHtml}
                </div>
                <div style="text-align: center; margin-top: 40px;">
                  <a href="/" class="back-btn">애플망고톡으로 돌아가기</a>
                </div>
              </div>
              <div class="footer">
                &copy; 2026 주식회사 애플망고. All rights reserved.
              </div>
            </div>
          </body>
          </html>
        `);
      } else {
        res.status(404).send('개인정보처리방침을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('서버 오류가 발생했습니다.');
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

  broadcastRoomUpdate = (roomId, eventName, payload) => {
    broadcastToRoom(roomId, eventName, payload);
  };

  broadcastToUser = (userId, eventName, payload) => {
    io.to(`user-${userId}`).emit(eventName, payload);
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

        // CLOSED-ROOMS: 커스텀 그룹방은 멤버·방장만 실시간 채널 참여 가능 (위치 브로드캐스트 보호)
        const targetRoom = dbRooms[roomId];
        if (!targetRoom) {
          return callback({ error: 'Room not found' });
        }
        if (!canAccessRoom(targetRoom, userId)) {
          return callback({ error: '이 그룹방의 멤버만 입장할 수 있습니다.' });
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
        socket.join(`user-${userId}`); // Join user-specific channel
        if (!roomSockets[roomId]) roomSockets[roomId] = new Set();
        roomSockets[roomId].add(socket.id);
        socketUsers[socket.id] = { userId, roomId };

        // 접속한 사용자를 모든 방에서 온라인으로 표시 + 로그아웃 숨김 해제
        let onlineChanged = false;
        Object.keys(dbRooms).forEach(rId => {
          const fr = dbRooms[rId].friends[userId];
          if (fr) {
            if (fr.isOnline === false) { fr.isOnline = true; onlineChanged = true; }
            if (fr.loggedOut) { fr.loggedOut = false; onlineChanged = true; }
          }
        });
        if (onlineChanged) saveDatabaseDebounced();

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
        // CLOSED-ROOMS: join-room을 통과한(멤버 검증된) 소켓만 메시지 전송 가능
        const senderInfo = socketUsers[socket.id];
        if (!senderInfo || senderInfo.roomId !== (room?.id || roomId)) {
          return callback({ error: '방에 입장한 멤버만 메시지를 보낼 수 있습니다.' });
        }
        const newMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...message,
          timestamp: new Date().toISOString()
        };

        room.messages.push(newMsg);

        // Broadcast to all in room
        broadcastToRoom(roomId, 'new-message', newMsg);
        saveDatabaseDebounced();
        callback({ success: true, message: newMsg });
      } catch (error) {
        callback({ error: 'Message send failed' });
      }
    });

    // Real-time multiplayer game event relay
    socket.on('game-relay', ({ roomId, payload }, callback) => {
      try {
        broadcastToRoom(roomId, 'game-relayed', payload);
        if (callback) callback({ success: true });
      } catch (error) {
        if (callback) callback({ error: 'Game relay failed' });
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

    // BIZ-CORE-8 ④: (구) 119 자동신고 이벤트 → 보호자 SOS 알림으로 변경 (이벤트명은 하위 호환 유지)
    socket.on('emergency-119', async ({ roomId, friendId }, callback) => {
      try {
        const result = handleSosRequest(roomId, friendId);
        if (!result) {
          return callback({ error: 'Friend not found' });
        }
        broadcastToRoom(roomId, 'emergency-alert', {
          friendId,
          message: result.sosMsg
        });
        callback({ success: true, message: result.sosMsg });
      } catch (error) {
        console.error('SOS call error:', error);
        callback({ error: 'SOS call failed' });
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

        // 같은 userId의 다른 소켓이 남아있지 않으면 오프라인 처리(로그아웃 당시 위치에 고정)
        const stillConnected = Object.values(socketUsers).some(u => u.userId === userId);
        if (!stillConnected) {
          Object.keys(dbRooms).forEach(rId => {
            const fr = dbRooms[rId].friends[userId];
            if (fr) fr.isOnline = false;
          });
          saveDatabaseDebounced();
        }

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
