/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import MobileFrame from './components/MobileFrame';
import MapComponent from './components/MapComponent';
import ChatRoom from './components/ChatRoom';
import SchedulePanel from './components/SchedulePanel';
import FriendListPanel from './components/FriendListPanel';
import NotificationPanel from './components/NotificationPanel';
import GroupRoomsPanel from './components/GroupRoomsPanel';
import OnboardingScreen, { ApmtLogo } from './components/OnboardingScreen';
import { Friend, Message, Appointment, NotificationAlert } from './types';
import { Map, MessageSquare, Calendar, Bell, RefreshCw, LayoutList, Settings, Gamepad2, Footprints, Music, Utensils, BookOpen, Contact } from 'lucide-react';
import GamePanel from './components/GamePanel';
import PedometerPanel from './components/PedometerPanel';
import MusicPanel from './components/MusicPanel';
import RestaurantPanel from './components/RestaurantPanel';
import BookPanel from './components/BookPanel';
import ContactsPanel from './components/ContactsPanel';

import {
  queueOfflineAction,
  getOutboxCount,
  registerBackgroundSync,
  requestNotificationPermission,
  showLocalNotification,
  syncOutbox,
  getAllOutboxEntries,
  deleteOutboxEntry
} from './offlineSync';
import {
  getPushSubscription,
  subscribeToPushManager,
  unsubscribeFromPushManager
} from './pushSubscription';
import { useRealtimeLocation } from './hooks/useRealtimeLocation';
import type { LocationUpdatedPayload } from './realtime/types';
import { getLocationSocket } from './realtime/socketClient';

// 앱 로고 — ApmtLogo를 OnboardingScreen에서 재사용
export { ApmtLogo as AppleMangoLogo };


export default function App() {
  // 온보딩 상태
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem('apmt_v3_registered');
  });

  // Navigation active state
  const [activeTab, setActiveTab] = useState<'rooms' | 'map' | 'chat' | 'appointments' | 'notifications' | 'game' | 'pedometer' | 'music' | 'restaurant' | 'book' | 'contacts'>('rooms');
  
  // 전화번호 기반 사용자 ID (로컬 저장)
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const phone = localStorage.getItem('aemang_phone');
    if (phone) return 'user-' + phone.replace(/\D/g, '');
    return 'user-guest-' + Math.random().toString(36).slice(2, 8);
  });

  // Room states
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('room-friends');

  // New room generation form states
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomEmoji, setNewRoomEmoji] = useState('🍎');
  const [newRoomType, setNewRoomType] = useState<'friends' | 'family' | 'work' | 'care' | 'custom'>('friends');
  const [newRoomTrackingStyle, setNewRoomTrackingStyle] = useState<'continuous' | 'temporary'>('temporary');

  // Interactive user registration states — localStorage에서 기존 정보 불러오기
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [regPhone, setRegPhone] = useState(() => localStorage.getItem('aemang_phone') || '');
  const [regRealName, setRegRealName] = useState(() => localStorage.getItem('aemang_name') || '');
  const [regAlias, setRegAlias] = useState(() => localStorage.getItem('aemang_nickname') || '');
  const [regFruit, setRegFruit] = useState(() => localStorage.getItem('aemang_fruit') || '🍎');

  // Call simulation states
  const [callingState, setCallingState] = useState<{
    type: 'voice' | 'video';
    status: 'ringing' | 'connected' | 'ended';
    friend: any;
    duration: number;
    micMuted?: boolean;
    speakerOn?: boolean;
    cameraOff?: boolean;
  } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // 내 프로필 설정 모달 드래그다운(Swipe-down) 닫기 제스처 상태
  const [profileDragY, setProfileDragY] = useState(0);
  const profileDragStartRef = useRef<number | null>(null);

  const handleProfileTouchStart = (e: React.TouchEvent) => {
    profileDragStartRef.current = e.touches[0].clientY;
  };

  const handleProfileTouchMove = (e: React.TouchEvent) => {
    if (profileDragStartRef.current === null) return;
    
    // 모달 내부가 아래로 스크롤되어 있다면 드래그다운으로 모달을 닫지 않고 정상 스크롤되도록 함
    if (e.currentTarget.scrollTop > 0) {
      return;
    }
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - profileDragStartRef.current;
    if (deltaY > 0) {
      setProfileDragY(deltaY);
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleProfileTouchEnd = () => {
    if (profileDragStartRef.current === null) return;
    profileDragStartRef.current = null;
    
    if (profileDragY > 100) {
      setShowProfileModal(false);
    }
    setProfileDragY(0);
  };

  const [activeGameInvite, setActiveGameInvite] = useState<{
    from: string;
    fromName: string;
    game: 'drone_battle' | 'yut_nori';
  } | null>(null);
  const [multiplayerGameConfig, setMultiplayerGameConfig] = useState<{
    game: 'drone_battle' | 'yut_nori';
    opponentId: string;
    role: 'p1' | 'p2';
  } | null>(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // 앱 접속 비밀번호 (전화번호 계정에 연동 — 서버 확인)
  const [accountHasPassword, setAccountHasPassword] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false); // 최초/미설정 시 강제 설정 화면
  const [lockInput, setLockInput] = useState('');
  const [lockError, setLockError] = useState('');
  const [setupPw1, setSetupPw1] = useState('');
  const [setupPw2, setSetupPw2] = useState('');
  const [setupError, setSetupError] = useState('');

  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    return localStorage.getItem('aemang_sound_enabled') !== 'false';
  });
  // 내 위치 공유 여부 (off면 다른 사람에게 내 위치가 안 보임)
  const [shareLocation, setShareLocation] = useState(() => {
    return localStorage.getItem('aemang_share_location') !== 'false';
  });
  const [selectedSoundIdx, setSelectedSoundIdx] = useState<number>(() => {
    const saved = localStorage.getItem('aemang_sound_idx');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [recentCreatedRoomName, setRecentCreatedRoomName] = useState<string | null>(null);
  const [pendingDeleteRoomId, setPendingDeleteRoomId] = useState<string | null>(null);
  const [deleteRoomConfirmKey, setDeleteRoomConfirmKey] = useState('');
  const [isRoomEditMode, setIsRoomEditMode] = useState(false); // 방 편집 모드
  const roomNavRef = useRef<HTMLDivElement | null>(null);
  const sheetTouchStartY = useRef<number | null>(null); // 바텀시트 아래로 밀어 닫기

  // Precision remote heart rate check simulator states ("할머니 심박수 체크")
  const [measuringTarget, setMeasuringTarget] = useState<Friend | null>(null);
  const [isMeasuringHeartRate, setIsMeasuringHeartRate] = useState(false);
  const [measurementProgress, setMeasurementProgress] = useState(0);
  const [measuredBpm, setMeasuredBpm] = useState<number | null>(null);

  // Application Data States
  const [friends, setFriends] = useState<Friend[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<NotificationAlert[]>([]);
  
  // Selection states (for focusing on specific people or appointments)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedPromiseId, setSelectedPromiseId] = useState<string | null>(null);
  
  // Leaflet map selected coordinate for potential appointment creation
  const [tempPromiseCoords, setTempPromiseCoords] = useState<[number, number] | null>(null);
  // 지도에서 '위치만 잠깐 보기'용 좌표 (맛집/지도보기) — 지도 탭을 나가면 초기화됨(약속 연동 아님)
  const [mapViewCoords, setMapViewCoords] = useState<[number, number] | null>(null);
  
  // Promise (Appointment) Form Creation States
  const [promiseTitle, setPromiseTitle] = useState('');
  const [promiseSearchQuery, setPromiseSearchQuery] = useState('');
  const [promiseConfirmedPlace, setPromiseConfirmedPlace] = useState<any | null>(null);
  const [promiseDateValue, setPromiseDateValue] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [promiseTimeValue, setPromiseTimeValue] = useState('19:00');

  // Outbox modal states
  const [showOutboxModal, setShowOutboxModal] = useState(false);
  const [outboxEntries, setOutboxEntries] = useState<any[]>([]);
  
  // Manual refreshing spin indicators
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [vapidPublicKey, setVapidPublicKey] = useState<string>('');
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const lastNotifiedIdRef = useRef<string | null>(null);
  const hasCenteredOnGpsRef = useRef(false);

  // 119 Emergency calling states
  const [emergencyTarget, setEmergencyTarget] = useState<Friend | null>(null);
  const [isDialing119, setIsDialing119] = useState(false);
  const [dialingStatus, setDialingStatus] = useState<'calling' | 'connected' | 'completed'>('calling');
  const [dialingTimeCounter, setDialingTimeCounter] = useState(0);

  // BIZ-CORE-8 ④: 119 자동신고 시뮬레이션 → 보호자 SOS 알림으로 변경
  // 가족·친구 전원에게 위치 포함 긴급 푸시를 보내고, 119 연결은 사용자가 직접 전화(tel:119)
  const handleEmergency119 = async (friend: Friend) => {
    if (!window.confirm(`🆘 SOS를 발신하시겠습니까?\n대상: ${friend.name}\n\n같은 방 가족·친구 전원에게 긴급 알림과 현재 위치가 전송됩니다.\n(119 신고가 필요하면 SOS 화면에서 직접 전화할 수 있습니다)`)) return;

    setEmergencyTarget(friend);
    setIsDialing119(true);
    setDialingStatus('calling');
    setDialingTimeCounter(0);

    try {
      const res = await fetch('/api/emergency/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: friend.id, roomId: activeRoomId })
      });
      if (res.ok) setDialingStatus('connected'); // 'connected' = SOS 발송 완료 상태로 재사용
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestNotificationPermission = async () => {
    try {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        await showLocalNotification('애플망고톡 알림 허용 완료', {
          body: '중요한 알림을 실시간으로 받을 수 있습니다.',
          icon: '/icons/icon-192.svg'
        });
        await initializePushSubscription();
      }
    } catch (error) {
      console.error('Notification permission request failed:', error);
    }
  };

  const fetchVapidPublicKey = async (): Promise<string> => {
    try {
      const response = await fetch('/api/push/vapidPublicKey');
      if (!response.ok) {
        throw new Error('Failed to fetch VAPID key');
      }
      const data = await response.json();
      return data.publicKey || '';
    } catch (error) {
      console.error('VAPID public key fetch error:', error);
      return '';
    }
  };

  const registerPushSubscription = async (subscription: PushSubscription) => {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, roomId: activeRoomId, userId: activeProfileId })
      });
      setIsPushSubscribed(true);
    } catch (error) {
      console.error('Push subscription registration failed:', error);
      setIsPushSubscribed(false);
    }
  };

  const initializePushSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || notificationPermission !== 'granted') {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await getPushSubscription(registration);
      const publicKey = vapidPublicKey || await fetchVapidPublicKey();
      if (!publicKey) {
        return;
      }
      setVapidPublicKey(publicKey);

      if (existingSubscription) {
        await registerPushSubscription(existingSubscription);
        setIsPushSubscribed(true);
        return;
      }

      const newSubscription = await subscribeToPushManager(registration, publicKey);
      await registerPushSubscription(newSubscription);
    } catch (error) {
      console.error('Push initialization failed:', error);
      setIsPushSubscribed(false);
    }
  };

  const unsubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const unsubscribed = await unsubscribeFromPushManager(registration);
      if (unsubscribed) {
        setIsPushSubscribed(false);
      }
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
    }
  };

  // Helper to append Authorization headers and user ID identification
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem('aemang_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    if (activeProfileId) {
      headers.set('x-user-id', activeProfileId);
    }

    const res = await fetch(url, { ...options, headers });
    // 슬라이딩 세션 — 서버가 갱신 토큰을 주면 저장(세션 유지)
    const refreshed = res.headers.get('x-refresh-token');
    if (refreshed) localStorage.setItem('aemang_token', refreshed);
    return res;
  }, [activeProfileId]);

  // 비핵심(실시간/빈번) 요청 — 오프라인 시 큐에 쌓지 않고 버림 (만보기/위치/배터리 등)
  const NON_QUEUEABLE = ['/api/friends/pedometer', '/api/friends/move', '/api/friends/battery', '/api/friends/heartRate'];

  const queueOrSend = async (endpoint: string, body: any, showQueuedNotification = true) => {
    const queueable = !NON_QUEUEABLE.includes(endpoint);
    if (!isOnline) {
      if (!queueable) return; // 비핵심 요청은 오프라인이면 그냥 건너뜀
      await queueOfflineAction(endpoint, body);
      await registerBackgroundSync();
      setOutboxCount(await getOutboxCount());
      if (notificationPermission === 'granted' && showQueuedNotification) {
        await showLocalNotification('오프라인 큐에 저장됨', {
          body: '네트워크 연결 복구 시 자동으로 전송됩니다.',
          icon: '/icons/icon-192.svg'
        });
      }
      return;
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error('Request failed');
      }
    } catch (err) {
      if (!queueable) return; // 비핵심 요청 실패는 큐에 쌓지 않음
      console.warn('Direct send failed, queuing for later sync:', err);
      await queueOfflineAction(endpoint, body);
      await registerBackgroundSync();
      setOutboxCount(await getOutboxCount());
    }
  };

  // 온보딩 완료 핸들러
  const handleOnboardingComplete = async (phone: string, name: string, nickname: string, fruit: string) => {
    const newUserId = 'user-' + phone.replace(/\D/g, '');
    try {
      const res = await fetch('/api/friends/profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': newUserId
        },
        body: JSON.stringify({ phone, realName: name, alias: nickname, avatar: fruit })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) localStorage.setItem('aemang_token', data.token);
      }
    } catch (_) { /* 서버 없어도 로컬 진행 */ }
    localStorage.setItem('apmt_v3_registered', 'true');
    localStorage.setItem('aemang_phone', phone);
    localStorage.setItem('aemang_name', name);
    localStorage.setItem('aemang_nickname', nickname);
    localStorage.setItem('aemang_fruit', fruit);
    
    setRegPhone(phone);
    setRegRealName(name);
    setRegAlias(nickname);
    setRegFruit(fruit);
    
    setActiveProfileId(newUserId);
    setShowOnboarding(false);
    // 이 계정에 이미 비밀번호가 있으면 잠금(입력) 화면, 없으면 설정 화면
    try {
      const hp = await fetch(`/api/auth/has-password?phone=${encodeURIComponent(phone)}`).then(r => r.json());
      if (hp && hp.hasPassword) {
        setAccountHasPassword(true);
        setIsUnlocked(false);
      } else {
        setNeedsPasswordSetup(true);
      }
    } catch {
      setNeedsPasswordSetup(true);
    }
    fetchAllStates(activeRoomId);
  };

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      try {
        await syncOutbox();
      } catch (err) {
        console.warn('Background sync attempt failed:', err);
      }
      setOutboxCount(await getOutboxCount());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const initializeOfflineState = async () => {
      setNotificationPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
      setOutboxCount(await getOutboxCount());
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        await initializePushSubscription();
      }
    };
    initializeOfflineState();
  }, []);

  useEffect(() => {
    const latestNotification = notifications[0];
    if (!latestNotification || notificationPermission !== 'granted') return;
    if (lastNotifiedIdRef.current === latestNotification.id) return;

    lastNotifiedIdRef.current = latestNotification.id;
    showLocalNotification(latestNotification.title, {
      body: latestNotification.message,
      icon: '/icons/icon-192.svg',
      tag: latestNotification.id
    });
  }, [notifications, notificationPermission]);

  const handleSocketLocationUpdated = useCallback((payload: LocationUpdatedPayload) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === payload.friendId
          ? {
              ...f,
              lat: payload.lat,
              lng: payload.lng,
              ...(payload.statusMsg !== undefined ? { statusMsg: payload.statusMsg } : {}),
              ...(payload.speed !== undefined ? { speed: payload.speed } : {}),
              ...(payload.heading !== undefined ? { heading: payload.heading } : {}),
              ...(payload.battery !== undefined ? { battery: payload.battery } : {}),
              ...(payload.heartRate !== undefined ? { heartRate: payload.heartRate } : {}),
              ...(payload.route !== undefined ? { route: payload.route } : {}),
              ...(payload.routeIndex !== undefined ? { routeIndex: payload.routeIndex } : {}),
              ...(payload.updatedAt !== undefined ? { updatedAt: payload.updatedAt } : {}),
              ...(payload.isOnline !== undefined ? { isOnline: payload.isOnline } : {}),
            }
          : f
      )
    );
  }, []);

  const {
    isSocketConnected,
    gpsStatus,
    gpsError,
    myCoords,
    lastSentAt,
    requestGpsPermission,
    stepsToday,
    pedometerAvailable,
    requestPedometerPermission,
  } = useRealtimeLocation({
    roomId: activeRoomId,
    userId: activeProfileId,
    enabled: !showOnboarding,
    onLocationUpdated: handleSocketLocationUpdated,
  });

  // Active profile object
  const activeProfile = friends.find(f => f.id === activeProfileId) || friends[0] || {
    id: 'user-minsu',
    name: '나 (민수)',
    avatar: '🟢',
    color: '#3B82F6',
    lat: 37.5565,
    lng: 126.9242
  };

  const isSyncingProfileRef = useRef(false);

  const syncProfileWithServer = async () => {
    if (isSyncingProfileRef.current) return;
    isSyncingProfileRef.current = true;
    const registered = localStorage.getItem('apmt_v3_registered') === 'true';
    const phone = localStorage.getItem('aemang_phone');
    const name = localStorage.getItem('aemang_name');
    const nickname = localStorage.getItem('aemang_nickname');
    const fruit = localStorage.getItem('aemang_fruit') || '🍎';

    if (registered && phone && name && nickname) {
      try {
        const res = await authFetch('/api/friends/profile', {
          method: 'POST',
          body: JSON.stringify({ phone, realName: name, alias: nickname, avatar: fruit })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('aemang_token', data.token);
          }
          await fetchAllStates(activeRoomId);
        }
      } catch (err) {
        console.warn('Failed to sync profile on demand:', err);
      } finally {
        isSyncingProfileRef.current = false;
      }
    } else {
      isSyncingProfileRef.current = false;
    }
  };

  // 1. Fetch data from Server
  const fetchAllStates = async (targetRoomId = activeRoomId) => {
    try {
      const [friendsRes, chatRes, appRes, notifRes, roomsRes] = await Promise.all([
        authFetch(`/api/friends?roomId=${targetRoomId}`),
        authFetch(`/api/chat?roomId=${targetRoomId}`),
        authFetch(`/api/appointments?roomId=${targetRoomId}`),
        authFetch(`/api/notifications?roomId=${targetRoomId}`),
        authFetch('/api/rooms')
      ]);

      if (roomsRes.ok) {
        const rData = await roomsRes.json();
        setRooms(rData);
        // 현재 방이 내 방 목록에 없으면(시스템방 등) 개인방(없으면 첫 방)으로 전환
        if (Array.isArray(rData) && rData.length > 0 && !rData.some((r: any) => r.id === targetRoomId)) {
          const nextId = (rData.find((r: any) => r.type === 'personal') || rData[0]).id;
          setActiveRoomId(nextId);
          fetchAllStates(nextId);
          return;
        }
      }
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data);
        
        // 내 프로필이 친구 목록에 없다면 (서버 리셋 등), 백그라운드에서 동기화 진행
        const registered = localStorage.getItem('apmt_v3_registered') === 'true';
        if (registered && !data.some((f: any) => f.id === activeProfileId)) {
          syncProfileWithServer();
        }
      }
      if (chatRes.ok) {
        const data = await chatRes.json();
        setMessages(data);
      }
      if (appRes.ok) {
        const data = await appRes.json();
        setAppointments(data);
      }
      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifications(data);
      }
    } catch (err) {
      console.warn('Real-time API fetch warning (running local simulated fallback):', err);
    }
  };

  // Trigger when active room ID changes
  useEffect(() => {
    fetchAllStates(activeRoomId);
  }, [activeRoomId]);

  useEffect(() => {
    if (!roomNavRef.current) return;
    // active-room 클래스 또는 마지막 버튼으로 스크롤
    const activeButton = roomNavRef.current.querySelector<HTMLButtonElement>('button.active-room');
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } else {
      // active-room 클래스가 없으면 끝으로 스크롤 (새 방 생성 직후)
      roomNavRef.current.scrollLeft = roomNavRef.current.scrollWidth;
    }
  }, [rooms, activeRoomId]);

  // Sync chat/appointments/notifications — slower when Socket is live (locations via GPS events)
  useEffect(() => {
    const pollMs = isSocketConnected ? 20000 : 5000;
    const interval = setInterval(() => fetchAllStates(activeRoomId), pollMs);
    return () => clearInterval(interval);
  }, [activeRoomId, isSocketConnected]);

  useEffect(() => {
    hasCenteredOnGpsRef.current = false;
  }, [activeRoomId]);

  // Web Audio API 기반 다양한 알림 사운드 합성기
  const playBipSound = useCallback((soundIdx: number, force = false) => {
    if (!isSoundEnabled && !force) return;
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    try {
      const ctx = new AudioContextClass();
      
      if (soundIdx === 0) {
        // 1. 애플: A5 (880Hz) -> E5 (659Hz) sine beep.
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        gain1.gain.setValueAtTime(0.15, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659, ctx.currentTime + 0.07);
        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.07);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.16);
        osc2.start(ctx.currentTime + 0.07);
        osc2.stop(ctx.currentTime + 0.25);
      } else if (soundIdx === 1) {
        // 2. 실로폰: C6 (1047Hz) -> G5 (784Hz) -> E5 (659Hz) triangle chime.
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();
        const gain3 = ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(1047, ctx.currentTime);
        gain1.gain.setValueAtTime(0.15, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(784, ctx.currentTime + 0.1);
        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
        gain3.gain.setValueAtTime(0, ctx.currentTime);
        gain3.gain.setValueAtTime(0.15, ctx.currentTime + 0.2);
        gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc3.connect(gain3); gain3.connect(ctx.destination);

        osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.21);
        osc2.start(ctx.currentTime + 0.1); osc2.stop(ctx.currentTime + 0.31);
        osc3.start(ctx.currentTime + 0.2); osc3.stop(ctx.currentTime + 0.41);
      } else if (soundIdx === 2) {
        // 3. 경쾌한 핑: 1200Hz -> 800Hz sine frequency sweep (0.1s).
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.11);
      } else if (soundIdx === 3) {
        // 4. 레이저: 800Hz -> 200Hz sawtooth sweep (0.25s).
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.25);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.26);
      } else if (soundIdx === 4) {
        // 5. 전통 장구: Triangle drum thud (150Hz -> 50Hz) + wood clack (800Hz).
        const oscDrum = ctx.createOscillator();
        const gainDrum = ctx.createGain();
        oscDrum.type = 'triangle';
        oscDrum.frequency.setValueAtTime(150, ctx.currentTime);
        oscDrum.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
        gainDrum.gain.setValueAtTime(0.25, ctx.currentTime);
        gainDrum.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        
        oscDrum.connect(gainDrum);
        gainDrum.connect(ctx.destination);
        oscDrum.start(ctx.currentTime);
        oscDrum.stop(ctx.currentTime + 0.16);
        
        const oscClack = ctx.createOscillator();
        const gainClack = ctx.createGain();
        oscClack.type = 'triangle';
        oscClack.frequency.setValueAtTime(800, ctx.currentTime + 0.08);
        gainClack.gain.setValueAtTime(0, ctx.currentTime);
        gainClack.gain.setValueAtTime(0.2, ctx.currentTime + 0.08);
        gainClack.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
        
        oscClack.connect(gainClack);
        gainClack.connect(ctx.destination);
        oscClack.start(ctx.currentTime + 0.08);
        oscClack.stop(ctx.currentTime + 0.14);
      }
    } catch (e) {
      console.error('AudioContext error:', e);
    }
  }, [isSoundEnabled]);

  // 기존 컴포넌트와의 호환성을 위한 speakText 맵핑 함수 (진동 및 비프음 재생)
  const speakText = useCallback((text: string, force = false) => {
    // 1. 비프음 재생
    playBipSound(selectedSoundIdx, force);
    
    // 2. 스마트폰 진동 피드백 (진동 API 지원 시)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([150, 100, 150]);
    }
  }, [playBipSound, selectedSoundIdx]);

  // 새 채팅 메시지 감지 시 TTS 말하기
  const prevMessagesCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessagesCountRef.current) {
      const newMsg = messages[messages.length - 1];
      if (newMsg && !newMsg.isSystem && prevMessagesCountRef.current > 0) {
        // 방을 전환할 때 과거 메시지들이 스팸처럼 읽히는 것을 방지
        const msgTime = new Date(newMsg.timestamp).getTime();
        const isRecent = Date.now() - msgTime < 3000;
        if (isRecent) {
          speakText(`${newMsg.senderName} 님: ${newMsg.text.slice(0, 30)}`, true);
        }
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages, speakText]);

  // 새 알림 감지 시 TTS 말하기
  const prevNotificationsCountRef = useRef(0);
  useEffect(() => {
    if (notifications.length > prevNotificationsCountRef.current) {
      const latestNotif = notifications[0];
      if (latestNotif && !latestNotif.read && prevNotificationsCountRef.current > 0) {
        speakText(`${latestNotif.title}. ${latestNotif.message}`, true);
      }
    }
    prevNotificationsCountRef.current = notifications.length;
  }, [notifications, speakText]);

  // 실시간 멀티플레이어 초대/수락 소켓 리스너
  useEffect(() => {
    if (showOnboarding || !activeProfileId) return;
    const socket = getLocationSocket();
    
    const handleGameRelayed = (payload: any) => {
      if (payload.type === 'invite' && payload.to === activeProfileId) {
        const sender = friends.find(f => f.id === payload.from) || { name: '친구' };
        setActiveGameInvite({
          from: payload.from,
          fromName: sender.alias || sender.name || '친구',
          game: payload.game
        });
      } else if (payload.type === 'accept' && payload.to === activeProfileId) {
        setMultiplayerGameConfig({
          game: payload.game,
          opponentId: payload.from,
          role: 'p1'
        });
        setActiveTab('game');
      } else if (payload.type === 'decline' && payload.to === activeProfileId) {
        alert('상대방이 초대를 거절했습니다.');
      }
    };

    const handleRoomsUpdated = () => {
      console.log('Realtime rooms/notifications update triggered from socket!');
      fetchAllStates(activeRoomId);
    };

    socket.on('rooms-updated', handleRoomsUpdated);
    socket.on('game-relayed', handleGameRelayed);
    return () => {
      socket.off('rooms-updated', handleRoomsUpdated);
      socket.off('game-relayed', handleGameRelayed);
    };
  }, [showOnboarding, activeProfileId, friends, activeRoomId]);

  // Handle dial timing simulation
  useEffect(() => {
    let timer: any;
    if (isDialing119 && dialingStatus === 'calling') {
      timer = setTimeout(() => {
        setDialingStatus('connected');
      }, 3000);
    } else if (isDialing119 && dialingStatus === 'connected') {
      timer = setInterval(() => {
        setDialingTimeCounter(prev => prev + 1);
      }, 1000);
    }
    return () => {
      clearTimeout(timer);
      clearInterval(timer);
    };
  }, [isDialing119, dialingStatus]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllStates(activeRoomId);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // 2. Action triggers linked to Express REST endpoints
  const handleSendMessage = async (text: string, locationShared?: { lat: number; lng: number; placeName: string }) => {
    let activeFriendObj = friends.find(f => f.id === activeProfileId);
    
    if (!activeFriendObj) {
      const registered = localStorage.getItem('apmt_v3_registered') === 'true';
      if (registered) {
        activeFriendObj = {
          id: activeProfileId,
          name: localStorage.getItem('aemang_nickname') || localStorage.getItem('aemang_name') || '나 (민수)',
          avatar: localStorage.getItem('aemang_fruit') || '🍎',
          color: '#EF4444',
          lat: 37.5568,
          lng: 126.9238,
          isOnline: true,
          battery: 100,
          speed: 0,
          heading: '정지',
          route: [],
          routeIndex: 0,
          updatedAt: new Date().toISOString()
        };
        // 백그라운드 동기화 수행
        syncProfileWithServer();
      } else {
        activeFriendObj = {
          id: activeProfileId,
          name: '나 (민수)',
          avatar: '🍎',
          color: '#EF4444',
          lat: 37.5568,
          lng: 126.9238,
          isOnline: true,
          battery: 100,
          speed: 0,
          heading: '정지',
          route: [],
          routeIndex: 0,
          updatedAt: new Date().toISOString()
        };
      }
    }

    const payload = {
      senderId: activeProfileId,
      senderName: activeFriendObj.name,
      senderAvatar: activeFriendObj.avatar,
      senderColor: activeFriendObj.color,
      text,
      locationShared,
      roomId: activeRoomId
    };

    await queueOrSend('/api/chat', payload);
    fetchAllStates(activeRoomId);
  };

  const handleSendImage = async (imageDataUrl: string) => {
    const me = friends.find(f => f.id === activeProfileId);
    try {
      const res = await authFetch('/api/chat/image', {
        method: 'POST',
        body: JSON.stringify({
          senderId: activeProfileId,
          senderName: me?.name || localStorage.getItem('aemang_nickname') || '나',
          senderAvatar: me?.avatar || localStorage.getItem('aemang_fruit') || '🍎',
          senderColor: me?.color || '#EF4444',
          image: imageDataUrl,
          roomId: activeRoomId,
        })
      });
      if (!res.ok) {
        const t = await res.text();
        alert(res.status === 413 ? '이미지 용량이 너무 큽니다. 더 작은 사진을 선택해 주세요.' : `이미지 전송 실패: ${t}`);
        return;
      }
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
      alert('이미지 전송 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateAppointment = async (id: string, title: string, placeName: string, lat: number, lng: number, datetime: string) => {
    try {
      await queueOrSend('/api/appointments/update', {
        id,
        title,
        placeName,
        lat,
        lng,
        datetime,
        roomId: activeRoomId
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      const res = await authFetch('/api/appointments/delete', {
        method: 'POST',
        body: JSON.stringify({
          id,
          roomId: activeRoomId
        })
      });
      if (res.ok) {
        fetchAllStates(activeRoomId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFriend = async (id: string) => {
    try {
      await authFetch('/api/friends/delete', {
        method: 'POST',
        body: JSON.stringify({
          id,
          roomId: activeRoomId
        })
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAppointment = async (
    title: string, 
    placeName: string, 
    datetime: string,
    customLat?: number,
    customLng?: number
  ) => {
    const activeFriendObj = friends.find(f => f.id === activeProfileId) || { name: '나 (민수)' };
    const finalLat = customLat !== undefined ? customLat : (tempPromiseCoords ? tempPromiseCoords[0] : null);
    const finalLng = customLng !== undefined ? customLng : (tempPromiseCoords ? tempPromiseCoords[1] : null);

    if (finalLat === null || finalLng === null) {
      alert('지도 위를 클릭하여 소집 위치를 지정하거나, 우측 상단의 장소 검색창에서 식당/주소를 검색한 후 생성해 주세요!');
      return;
    }

    try {
      await queueOrSend('/api/appointments', {
        title,
        placeName,
        lat: finalLat,
        lng: finalLng,
        datetime,
        creatorName: activeFriendObj.name,
        roomId: activeRoomId
      });
      setTempPromiseCoords(null);
      setActiveTab('map'); // Switch focus back to Map trace immediately
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleVote = async (promiseId: string, vote: 'yes' | 'no' | 'maybe') => {
    try {
      await authFetch('/api/appointments/vote', {
        method: 'POST',
        body: JSON.stringify({
          id: promiseId,
          friendId: activeProfileId,
          vote,
          roomId: activeRoomId
        })
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInviteFriend = async (name: string, emoji: string, color: string, phone: string) => {
    try {
      const response = await authFetch('/api/friends/invite', {
        method: 'POST',
        body: JSON.stringify({
          name,
          avatar: emoji,
          color,
          phone,
          roomId: activeRoomId,
          creatorName: activeProfile.name
        })
      });
      if (response.ok) {
        alert('📩 초대장이 발송되었습니다! 상대방이 수락하면 그룹에 자동 합류합니다.');
        fetchAllStates(activeRoomId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptInvite = async (id: string) => {
    try {
      const response = await authFetch('/api/friends/accept', {
        method: 'POST',
        body: JSON.stringify({
          id,
          roomId: activeRoomId
        })
      });
      if (response.ok) {
        fetchAllStates(activeRoomId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptRoomInvite = async (id: string, roomId: string) => {
    try {
      const response = await authFetch('/api/friends/accept', {
        method: 'POST',
        body: JSON.stringify({
          id,
          roomId
        })
      });
      if (response.ok) {
        setActiveRoomId(roomId);
        setActiveTab('chat');
        // Refresh room list and states
        authFetch('/api/rooms').then(r => r.json()).then(data => setRooms(data)).catch(() => {});
        fetchAllStates(roomId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptGameInvite = async (inviteId: string) => {
    try {
      const response = await authFetch('/api/games/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteId })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMultiplayerGameConfig({
            game: data.game,
            opponentId: data.opponentId,
            role: 'p2'
          });
          setActiveTab('game');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualMoveFriend = async (id: string, latOffset: number, lngOffset: number) => {
    const friend = friends.find(f => f.id === id);
    if (!friend) return;

    try {
      await authFetch('/api/friends/move', {
        method: 'POST',
        body: JSON.stringify({
          id: friend.id,
          lat: friend.lat + latOffset,
          lng: friend.lng + lngOffset,
          roomId: activeRoomId
        })
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatusMsg = async (id: string, text: string) => {
    try {
      await authFetch('/api/friends/move', {
        method: 'POST',
        body: JSON.stringify({
          id,
          statusMsg: text,
          roomId: activeRoomId
        })
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePedometer = async (id: string, enabled: boolean) => {
    try {
      await queueOrSend('/api/friends/pedometer', {
        id,
        pedometerEnabled: enabled,
        roomId: activeRoomId
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error('Pedometer toggle failed:', err);
    }
  };

  const handleSyncSteps = async (steps: number) => {
    try {
      await queueOrSend('/api/friends/pedometer', {
        id: activeProfileId,
        pedometerEnabled: true,
        stepsToday: steps,
        roomId: activeRoomId
      }, false);
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error('Pedometer sync failed:', err);
    }
  };

  const handleToggleHeartRate = async (id: string, enabled: boolean) => {
    try {
      await queueOrSend('/api/friends/heartRate', {
        id,
        heartRateEnabled: enabled,
        roomId: activeRoomId
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error('Heart rate toggle failed:', err);
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    try {
      await authFetch('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({
          roomId: activeRoomId
        })
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlockApp = async () => {
    const phone = localStorage.getItem('aemang_phone') || '';
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: lockInput })
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) localStorage.setItem('aemang_token', data.token); // 인증 세션 갱신
        localStorage.setItem('aemang_unlocked', 'true'); // 이후 그냥 닫았다 열면 기억
        setIsUnlocked(true);
        setLockInput('');
        setLockError('');
      } else {
        setLockError('비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setLockError('확인 중 오류가 발생했습니다. 네트워크를 확인해 주세요.');
    }
  };

  const handleResetPassword = async () => {
    const phone = localStorage.getItem('aemang_phone') || '';
    const nm = window.prompt('본인 확인 — 가입 시 등록한 실명(이름)을 입력하세요:');
    if (nm === null) return;
    const pw = window.prompt('새 비밀번호를 입력하세요 (4자 이상):');
    if (pw === null) return;
    if (pw.length < 4) { alert('비밀번호는 4자 이상이어야 합니다.'); return; }
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, realName: nm, password: pw })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) localStorage.setItem('aemang_token', data.token);
        localStorage.setItem('aemang_unlocked', 'true');
        setIsUnlocked(true);
        setLockInput('');
        setLockError('');
        alert('비밀번호가 재설정되었습니다.');
      } else if (res.status === 403) {
        setLockError('실명이 일치하지 않습니다. 다시 시도해 주세요.');
      } else {
        setLockError('재설정에 실패했습니다.');
      }
    } catch {
      setLockError('네트워크 오류로 재설정에 실패했습니다.');
    }
  };

  // 최초/미설정 비밀번호 강제 설정
  const handleCompletePasswordSetup = async () => {
    const phone = localStorage.getItem('aemang_phone') || '';
    if (setupPw1.length < 4) { setSetupError('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (setupPw1 !== setupPw2) { setSetupError('비밀번호가 일치하지 않습니다.'); return; }
    try {
      const res = await authFetch('/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ phone, password: setupPw1 })
      });
      if (res.ok) {
        try { const d = await res.json(); if (d.token) localStorage.setItem('aemang_token', d.token); } catch {}
        localStorage.setItem('aemang_unlocked', 'true');
        setAccountHasPassword(true);
        setIsUnlocked(true);
        setNeedsPasswordSetup(false);
        setSetupPw1(''); setSetupPw2(''); setSetupError('');
      } else if (res.status === 403) {
        // 이미 비밀번호가 설정된 계정 → 설정이 아니라 '입력(잠금)' 화면으로 전환
        setNeedsPasswordSetup(false);
        setAccountHasPassword(true);
        setIsUnlocked(false);
        setSetupPw1(''); setSetupPw2(''); setSetupError('');
        alert('이미 비밀번호가 설정된 계정입니다. 기존 비밀번호를 입력해 주세요.');
      } else {
        setSetupError('설정에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch {
      setSetupError('네트워크 오류로 설정에 실패했습니다.');
    }
  };

  // 잠그고 나가기 — 프로필은 유지, 다음 접속 시 비번 요구
  const handleLockAndExit = () => {
    localStorage.removeItem('aemang_unlocked');
    setIsUnlocked(false);
    setShowSettingsModal(false);
  };

  const handleSetLockPassword = async () => {
    const phone = localStorage.getItem('aemang_phone') || '';
    if (!phone) { alert('먼저 프로필(전화번호) 등록이 필요합니다.'); return; }
    let currentPassword = '';
    if (accountHasPassword) {
      const cur = window.prompt('현재 비밀번호를 입력하세요:');
      if (cur === null) return;
      currentPassword = cur;
    }
    const pw = window.prompt(accountHasPassword ? '새 비밀번호 (4자 이상):' : '앱 접속 비밀번호를 설정하세요 (4자 이상):');
    if (pw === null) return;
    if (pw.length < 4) { alert('비밀번호는 4자 이상이어야 합니다.'); return; }
    const pw2 = window.prompt('확인을 위해 다시 입력하세요:');
    if (pw2 === null) return;
    if (pw !== pw2) { alert('비밀번호가 일치하지 않습니다.'); return; }
    try {
      const res = await authFetch('/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ phone, password: pw, currentPassword })
      });
      if (res.ok) {
        localStorage.setItem('aemang_unlocked', 'true');
        setAccountHasPassword(true);
        setIsUnlocked(true);
        alert('앱 접속 비밀번호가 설정되었습니다. 다음 접속부터 (다른 기기 포함) 비밀번호 입력이 필요합니다. 🔒');
      } else if (res.status === 403) {
        alert('현재 비밀번호가 올바르지 않습니다.');
      } else {
        alert('비밀번호 설정에 실패했습니다.');
      }
    } catch {
      alert('네트워크 오류로 설정에 실패했습니다.');
    }
  };

  const handleRemoveLockPassword = async () => {
    const phone = localStorage.getItem('aemang_phone') || '';
    const cur = window.prompt('잠금을 해제하려면 현재 비밀번호를 입력하세요:');
    if (cur === null) return;
    try {
      const res = await authFetch('/api/auth/remove-password', {
        method: 'POST',
        body: JSON.stringify({ phone, currentPassword: cur })
      });
      if (res.ok) {
        localStorage.removeItem('aemang_unlocked');
        setAccountHasPassword(false);
        setIsUnlocked(true);
        alert('앱 접속 비밀번호가 해제되었습니다.');
      } else {
        alert('비밀번호가 올바르지 않습니다.');
      }
    } catch {
      alert('네트워크 오류로 해제에 실패했습니다.');
    }
  };

  const handleToggleLocationSharing = async () => {
    const next = !shareLocation;
    setShareLocation(next);
    localStorage.setItem('aemang_share_location', String(next));
    try {
      await authFetch('/api/friends/location-sharing', {
        method: 'POST',
        body: JSON.stringify({ enabled: next })
      });
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  // 접속 시: 서버에 현재 위치 공유 설정을 동기화 (다른 기기에서도 일관)
  useEffect(() => {
    if (showOnboarding || !activeProfileId) return;
    authFetch('/api/friends/location-sharing', {
      method: 'POST',
      body: JSON.stringify({ enabled: shareLocation })
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, showOnboarding]);

  // 접속 시: 계정 비번 상태 확인
  //  - 비번 있음 + '잠금해제 기억' 플래그 있음 → 그냥 통과(앱만 닫았다 연 경우)
  //  - 비번 있음 + 플래그 없음 → 잠금화면(나가기 했거나 다른 기기)
  //  - 비번 없음(기존 사용자) → 강제 설정 화면
  useEffect(() => {
    const phone = localStorage.getItem('aemang_phone');
    const registered = localStorage.getItem('apmt_v3_registered') === 'true';
    if (!registered || !phone) return;
    (async () => {
      // 인증 토큰 재발급 시도(시크릿 교체/만료 대비). 비번 없는 계정/유효토큰이면 새 토큰 발급됨.
      let refreshOk = false;
      try {
        const token = localStorage.getItem('aemang_token');
        const rr = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-user-id': 'user-' + phone.replace(/\D/g, ''),
          },
        });
        if (rr.ok) { const d = await rr.json(); if (d.token) { localStorage.setItem('aemang_token', d.token); refreshOk = true; } }
      } catch {}

      try {
        const d = await fetch(`/api/auth/has-password?phone=${encodeURIComponent(phone)}`).then(r => r.json());
        if (d.hasPassword) {
          setAccountHasPassword(true);
          const remembered = localStorage.getItem('aemang_unlocked') === 'true';
          // 비번 계정인데 토큰 재발급이 안 됐으면(시크릿 교체 등) 한 번 잠금해제로 토큰을 새로 받음
          setIsUnlocked(remembered && refreshOk);
        } else {
          setNeedsPasswordSetup(true);
        }
      } catch {}
    })();
  }, []);

  const handleMarkNotificationRead = async (id: string) => {
    // 즉시 UI 반영(낙관적 업데이트) — 읽음 카운트에서 바로 제외
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    try {
      await authFetch('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ id, roomId: activeRoomId })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateRoom = async (
    name: string, 
    emoji: string, 
    type: 'friends' | 'family' | 'work' | 'care' | 'custom',
    trackingStyle: 'continuous' | 'temporary'
  ) => {
    if (!name.trim()) {
      alert('새로운 모임 그룹 이름을 입력해 주세요.');
      return;
    }

    try {
      const res = await authFetch('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name,
          emoji,
          type,
          trackingStyle
        })
      });
      if (res.ok) {
        const newRoom = await res.json();
        // 즉시 탭에 추가
        setRooms(prev => [...prev.filter(r => r.id !== newRoom.id), newRoom]);
        setActiveRoomId(newRoom.id);
        setActiveTab('chat');
        setIsCreatingRoom(false);
        setNewRoomName('');
        setNewRoomEmoji('🍎');
        setNewRoomType('friends');
        setNewRoomTrackingStyle('temporary');
        setRecentCreatedRoomName(newRoom.name);
        setTimeout(() => setRecentCreatedRoomName(null), 5000);
        // 서버에서 전체 방 목록 명시적 재조회
        authFetch('/api/rooms').then(r => r.json()).then(data => setRooms(data)).catch(() => {});
        fetchAllStates(newRoom.id);
      } else {
        const errorText = await res.text();
        alert(`그룹 생성에 실패했습니다. ${res.status}: ${errorText}`);
      }
    } catch (err) {
      console.error(err);
      alert('그룹 생성 중 오류가 발생했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
    }
  };

  const handleOpenProfileModal = () => {
    setRegPhone(localStorage.getItem('aemang_phone') || '');
    setRegRealName(localStorage.getItem('aemang_name') || '');
    setRegAlias(localStorage.getItem('aemang_nickname') || '');
    setRegFruit(localStorage.getItem('aemang_fruit') || '🍎');
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (phone: string, realName: string, alias: string, fruit: string) => {
    try {
      const avatar = fruit;
      const res = await authFetch('/api/friends/profile', {
        method: 'POST',
        body: JSON.stringify({ phone, realName, alias, avatar })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('aemang_token', data.token);
        }
      }
      localStorage.setItem('apmt_v3_registered', 'true');
      localStorage.setItem('aemang_phone', phone);
      localStorage.setItem('aemang_name', realName);
      localStorage.setItem('aemang_nickname', alias);
      localStorage.setItem('aemang_fruit', fruit);

      setRegPhone(phone);
      setRegRealName(realName);
      setRegAlias(alias);
      setRegFruit(fruit);

      const newUserId = 'user-' + phone.replace(/\D/g, '');
      setActiveProfileId(newUserId);

      setShowOnboarding(false);
      setShowProfileModal(false);
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisbandRoom = async (roomId: string) => {
    const isSystemRoom = ['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId);
    
    if (!isSystemRoom) {
      const confirmExplode = window.confirm('💣 정말로 이 안심 모임그룹방을 완전히 폭파(삭제)하시겠습니까?\n대화 기록 및 약속 위치 공유 등 방 안의 모든 정보가 복구 불가능하게 파괴됩니다!');
      if (!confirmExplode) return;
    } else {
      const confirmDisband = window.confirm('💣 이 기본 안심 대화방을 완전히 폭파(삭제)하시겠습니까?\n방과 대화 기록, 위치 공유가 완전히 삭제됩니다.');
      if (!confirmDisband) return;
    }

    try {
      const response = await authFetch('/api/rooms/disband', {
        method: 'POST',
        body: JSON.stringify({ roomId })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.deleted) {
          alert('💥 안심 모임그룹방이 완전히 폭파되어 삭제되었습니다!');
          const remain = rooms.filter(r => r.id !== roomId);
          if (remain.length > 0) {
            const nextRoomId = remain[0].id;
            setActiveRoomId(nextRoomId);
            fetchAllStates(nextRoomId);
          } else {
            setActiveRoomId('room-friends');
            fetchAllStates('room-friends');
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!pendingDeleteRoomId) return;
    const roomToRemove = rooms.find((room) => room.id === pendingDeleteRoomId);
    if (!roomToRemove) { setPendingDeleteRoomId(null); return; }
    try {
      const response = await authFetch('/api/rooms/delete', {
        method: 'POST',
        body: JSON.stringify({ roomId: pendingDeleteRoomId })
      });
      if (response.ok || response.status === 404) {
        // 만약 서버에서 404(방 없음)가 반환되더라도 이미 삭제된 것이므로 로컬 UI에서 제거
        const remain = rooms.filter(r => r.id !== pendingDeleteRoomId);
        const nextRoomId = remain.length > 0 ? remain[0].id : 'room-friends';
        setActiveRoomId(nextRoomId);
        setPendingDeleteRoomId(null);
        setDeleteRoomConfirmKey('');
        fetchAllStates(nextRoomId);
      } else {
        const errorText = await response.text();
        alert(`삭제 실패: ${errorText}`);
      }
    } catch (err) {
      console.error(err);
      alert('그룹 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  };

  const cancelDeleteRoom = () => {
    setPendingDeleteRoomId(null);
    setDeleteRoomConfirmKey('');
  };

  const handleDeleteRoom = (roomId: string) => {
    setPendingDeleteRoomId(roomId);
    setDeleteRoomConfirmKey('');
  };

  const handleLeaveRoom = async () => {
    if (!window.confirm('이 그룹에서 탈퇴하시겠습니까?')) return;
    try {
      await authFetch('/api/friends/delete', {
        method: 'POST',
        body: JSON.stringify({ id: activeProfileId, roomId: activeRoomId })
      });
      const otherRoom = rooms.find(r => r.id !== activeRoomId);
      const nextRoomId = otherRoom?.id || 'room-friends';
      setActiveRoomId(nextRoomId);
      fetchAllStates(nextRoomId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAppLogout = () => {
    if (!window.confirm('정말로 로그아웃하고 앱을 나가시겠습니까?')) return;
    // 로그아웃 시 위치정보 숨김 처리(앱 미사용 오프라인과 구분 — 지도에서 사라짐)
    try {
      authFetch('/api/friends/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    } catch {}
    localStorage.removeItem('aemang_unlocked');
    localStorage.removeItem('aemang_token');
    localStorage.removeItem('apmt_v3_registered');
    localStorage.removeItem('aemang_phone');
    localStorage.removeItem('aemang_name');
    localStorage.removeItem('aemang_nickname');
    localStorage.removeItem('aemang_fruit');

    setActiveProfileId('');
    setRooms([]);
    setMessages([]);
    setFriends([]);
    setAppointments([]);
    setNotifications([]);

    setShowSettingsModal(false);
    setShowOnboarding(true);
  };

  // Outbox (Offline Queue) Management Helpers
  const handleOpenOutboxModal = async () => {
    try {
      const entries = await getAllOutboxEntries();
      setOutboxEntries(entries);
      setShowOutboxModal(true);
    } catch (err) {
      console.error('Failed to get outbox entries:', err);
    }
  };

  const handleClearOutbox = async () => {
    if (!window.confirm('오프라인 대기열을 모두 비우시겠습니까? 전송되지 않은 메시지와 약속이 영구히 삭제됩니다.')) return;
    try {
      for (const entry of outboxEntries) {
        await deleteOutboxEntry(entry.id);
      }
      setOutboxEntries([]);
      setOutboxCount(0);
      setShowOutboxModal(false);
      alert('대기열이 비워졌습니다.');
    } catch (err) {
      console.error('Failed to clear outbox:', err);
    }
  };

  const handleRemoveOutboxEntry = async (id: string) => {
    try {
      await deleteOutboxEntry(id);
      const remain = outboxEntries.filter(e => e.id !== id);
      setOutboxEntries(remain);
      setOutboxCount(remain.length);
      if (remain.length === 0) {
        setShowOutboxModal(false);
      }
    } catch (err) {
      console.error('Failed to delete outbox entry:', err);
    }
  };

  const handleForceSyncOutbox = async () => {
    try {
      await syncOutbox();
      const count = await getOutboxCount();
      setOutboxCount(count);
      const entries = await getAllOutboxEntries();
      setOutboxEntries(entries);
      if (count === 0) {
        setShowOutboxModal(false);
        alert('모든 대기 작업이 성공적으로 전송되었습니다! 🎉');
      } else {
        alert(`일부 작업 전송 실패. 여전히 ${count}개의 작업이 대기 중입니다.`);
      }
      fetchAllStates(activeRoomId);
    } catch (err) {
      console.error('Failed to sync outbox:', err);
      alert('전송 중 오류가 발생했습니다. 네트워크 상태를 확인하세요.');
    }
  };

  const handleTriggerHeartRateMeasure = (friend: Friend) => {
    setMeasuringTarget(friend);
    setIsMeasuringHeartRate(true);
    setMeasurementProgress(0);
    setMeasuredBpm(null);

    // Simulate an ECG heart rate check over 4 seconds
    const intervalTime = 100; // ms
    const totalSteps = 30; // 3 seconds
    let currentStep = 0;

    const timer = setInterval(async () => {
      currentStep++;
      const progressPercent = Math.min(Math.round((currentStep / totalSteps) * 100), 100);
      setMeasurementProgress(progressPercent);

      if (currentStep >= totalSteps) {
        clearInterval(timer);
        // Generate valid normal pulse
        const targetBpm = Math.floor(65 + Math.random() * 20); // 65 ~ 84 bpm
        setMeasuredBpm(targetBpm);

        try {
          await queueOrSend('/api/friends/heartRate', {
            id: friend.id,
            heartRateEnabled: true,
            heartRate: targetBpm,
            roomId: activeRoomId
          });
          fetchAllStates(activeRoomId);
        } catch (err) {
          console.error('Heart rate submission failed:', err);
        }

        // Log telemetry message in the Chat
        authFetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            senderId: 'system',
            senderName: '원격 헬스케어',
            senderAvatar: '💓',
            senderColor: '#EC4899',
            text: `💓 [스마트밴드 원격 심박수 측정 결과]\n- 대상: ${friend.name}\n- 분석 결과: 정밀 심박수 ${targetBpm} bpm (안정 범위)\n- 진단 상태: 정상 맥박동 수치 및 양호 부착이 확인되었습니다. 안심하셔도 좋습니다!`,
            roomId: activeRoomId
          })
        }).then(() => fetchAllStates(activeRoomId));
      }
    }, intervalTime);
  };

  // Coordinate interactions (pans map smoothly)
  // 맛집/지도보기 — 위치만 잠깐 표시(약속 좌표 연동 아님). 지도를 나가면 자동으로 사라짐.
  const handleFocusLocation = (lat: number, lng: number) => {
    setSelectedFriendId(null);
    setSelectedPromiseId(null);
    setTempPromiseCoords(null);
    setMapViewCoords([lat, lng]);
    setActiveTab('map');
  };

  // 지도 탭을 벗어나면 '보기용' 실선/좌표를 초기화 (다시 들어오면 실선 없음)
  useEffect(() => {
    if (activeTab !== 'map' && mapViewCoords) {
      setMapViewCoords(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleStartCall = (friend: any, type: 'voice' | 'video') => {
    setCallingState({
      type,
      status: 'ringing',
      friend,
      duration: 0,
      micMuted: false,
      speakerOn: true,
      cameraOff: false,
    });
  };

  const handleEndCall = () => {
    setCallingState(prev => prev ? { ...prev, status: 'ended' } : null);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setTimeout(() => {
      setCallingState(null);
    }, 1200);
  };

  // Ringing to Connected auto-transition
  useEffect(() => {
    let ringTimer: any;
    if (callingState && callingState.status === 'ringing') {
      ringTimer = setTimeout(() => {
        setCallingState(prev => prev ? { ...prev, status: 'connected' } : null);
      }, 3000);
    }
    return () => clearTimeout(ringTimer);
  }, [callingState?.status]);

  // Duration timer
  useEffect(() => {
    let timer: any;
    if (callingState && callingState.status === 'connected') {
      timer = setInterval(() => {
        setCallingState(prev => prev ? { ...prev, duration: prev.duration + 1 } : null);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callingState?.status]);

  // Handle video stream request
  useEffect(() => {
    if (callingState && callingState.type === 'video' && callingState.status === 'connected' && !callingState.cameraOff) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.error("Error accessing camera: ", err);
        });
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    }
  }, [callingState?.status, callingState?.type, callingState?.cameraOff]);

  const handleMapTouchClick = (lat: number, lng: number) => {
    // 약속이 선택된 상태에서 지도를 터치하면, 그 약속의 소집 장소를 이 위치로 변경할지 확인
    if (selectedPromiseId) {
      const appt = appointments.find(a => a.id === selectedPromiseId);
      if (appt) {
        const ok = window.confirm(`[${appt.title}] 약속의 소집 장소를 여기로 수정합니까?`);
        if (ok) {
          const newPlaceName = `📍 지도 지정 위치 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          handleUpdateAppointment(appt.id, appt.title, newPlaceName, lat, lng, appt.datetime);
        }
        // 확인/취소 어느 쪽이든 새 임시 핀은 만들지 않고 선택 유지
        return;
      }
    }
    // Drop potential coordinate pins to make schedule appointment easier
    setTempPromiseCoords([lat, lng]);
    setSelectedFriendId(null);
    setSelectedPromiseId(null);
  };

  // 온보딩 화면 (최초 실행 시)
  if (showOnboarding) {
    return (
      <MobileFrame>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </MobileFrame>
    );
  }

  // 비밀번호 강제 설정 화면 — 최초 접속(또는 미설정 기존 사용자)
  if (needsPasswordSetup) {
    return (
      <MobileFrame>
        <div className="flex flex-col items-center justify-center h-full bg-white p-8 gap-3 font-sans">
          <ApmtLogo size={56} />
          <h2 className="text-lg font-black text-gray-900">🔒 접속 비밀번호 설정</h2>
          <p className="text-xs text-gray-500 text-center -mt-1 leading-relaxed">
            내 전화번호로 다른 사람이 접속하지 못하도록<br />접속 비밀번호를 설정해 주세요. (4자 이상)
          </p>
          <input
            type="password"
            value={setupPw1}
            onChange={(e) => { setSetupPw1(e.target.value); setSetupError(''); }}
            placeholder="비밀번호 (4자 이상)"
            className="w-full max-w-[260px] border-2 border-black rounded-xl px-4 py-3 text-center text-base focus:outline-none focus:border-rose-500"
          />
          <input
            type="password"
            value={setupPw2}
            onChange={(e) => { setSetupPw2(e.target.value); setSetupError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCompletePasswordSetup(); }}
            placeholder="비밀번호 확인"
            className="w-full max-w-[260px] border-2 border-black rounded-xl px-4 py-3 text-center text-base focus:outline-none focus:border-rose-500"
          />
          {setupError && <p className="text-xs text-red-500 font-semibold">{setupError}</p>}
          <button
            type="button"
            onClick={handleCompletePasswordSetup}
            className="w-full max-w-[260px] bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl transition border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
          >
            설정 완료하고 시작하기
          </button>
        </div>
      </MobileFrame>
    );
  }

  // 앱 잠금 화면 — 비밀번호가 설정되어 있으면 접속 시 입력 필요
  if (accountHasPassword && !isUnlocked) {
    return (
      <MobileFrame>
        <div className="flex flex-col items-center justify-center h-full bg-white p-8 gap-4 font-sans">
          <ApmtLogo size={64} />
          <h2 className="text-lg font-black text-gray-900">🔒 앱 잠금</h2>
          <p className="text-xs text-gray-500 -mt-2">비밀번호를 입력해 주세요</p>
          <input
            type="password"
            value={lockInput}
            onChange={(e) => { setLockInput(e.target.value); setLockError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlockApp(); }}
            autoFocus
            className="w-full max-w-[240px] border-2 border-black rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:border-rose-500"
            placeholder="••••"
          />
          {lockError && <p className="text-xs text-red-500 font-semibold">{lockError}</p>}
          <button
            type="button"
            onClick={handleUnlockApp}
            className="w-full max-w-[240px] bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl transition border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
          >
            잠금 해제
          </button>
          <button
            type="button"
            onClick={handleResetPassword}
            className="text-xs text-gray-400 hover:text-rose-500 underline mt-1"
          >
            비밀번호를 잊으셨나요? (재설정)
          </button>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      {/* 1. App Header — KakaoTalk + Apple Find My 스타일 */}
      <div className="bg-white shrink-0 select-none" style={{ boxShadow: '0 1px 0 #f0f0f0' }}>
        {!isOnline && (
          <div className="bg-red-500 text-white text-xs px-4 py-2 font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
            오프라인 모드 — 캐시된 앱으로 실행 중
          </div>
        )}

        {gpsStatus === 'denied' && (
          <div className="bg-amber-500 text-white text-xs px-4 py-2 font-semibold flex items-center justify-between gap-2">
            <span>📍 위치 권한이 꺼져 있어 실시간 공유가 되지 않습니다.</span>
            <button
              type="button"
              onClick={requestGpsPermission}
              className="shrink-0 bg-white text-amber-700 px-2 py-1 rounded-lg text-[10px] font-bold"
            >
              다시 허용
            </button>
          </div>
        )}

        {gpsStatus === 'requesting' && (
          <div className="bg-sky-50 text-sky-800 text-[10px] px-4 py-1.5 font-medium flex items-center gap-2 border-b border-sky-100">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
            <span>{gpsError || '위치 확인 중… (PC는 Wi-Fi 위치를 사용할 수 있습니다)'}</span>
          </div>
        )}

        {(gpsStatus === 'watching' || gpsStatus === 'degraded') && (
          <div className={`text-[10px] px-4 py-1.5 font-semibold flex items-center gap-2 border-b ${
            gpsStatus === 'degraded'
              ? 'bg-sky-50 text-sky-800 border-sky-100'
              : 'bg-emerald-50 text-emerald-800 border-emerald-100'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isSocketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`} />
            <span className="flex-1">
              {gpsStatus === 'degraded'
                ? (isSocketConnected ? '대략적 위치 공유 중 (Wi-Fi/IP)' : '위치 켜짐 · 서버 연결 중…')
                : (isSocketConnected ? 'GPS 실시간 공유 중' : 'GPS 켜짐 · 서버 연결 중…')}
              {lastSentAt
                ? ` · ${new Date(lastSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : ''}
            </span>
            {stepsToday > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold shrink-0 text-emerald-700">
                👣 {stepsToday.toLocaleString()}보
              </span>
            )}
            {stepsToday === 0 && pedometerAvailable === false && (
              <button
                type="button"
                onClick={requestPedometerPermission}
                className="shrink-0 bg-emerald-500 text-white px-1.5 py-0.5 rounded-lg text-[9px] font-bold"
              >
                만보기 허용
              </button>
            )}
          </div>
        )}

        {(gpsStatus === 'error' || gpsStatus === 'unavailable') && gpsError && (
          <div className="bg-amber-50 text-amber-900 text-[10px] px-4 py-2 font-medium flex items-start justify-between gap-2 border-b border-amber-100">
            <span className="leading-relaxed">{gpsError}</span>
            <button
              type="button"
              onClick={requestGpsPermission}
              className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap"
            >
              위치 다시 시도
            </button>
          </div>
        )}

        {/* 앱 타이틀 바 */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <ApmtLogo size={36} />
            <div>
              <h1 className="text-[15px] font-black text-gray-900 leading-tight tracking-tight">애플망고톡</h1>
              <p className="text-[9px] text-orange-400 font-semibold">Apple Mango Talk 🍎🥭</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {outboxCount > 0 && (
              <button
                type="button"
                onClick={handleOpenOutboxModal}
                className="text-[10px] bg-rose-100 hover:bg-rose-200 text-rose-600 px-2.5 py-1 rounded-full font-black border border-rose-300 mr-1 cursor-pointer animate-pulse transition flex items-center gap-1 shadow-sm"
                title="대기 중인 오프라인 작업 보기"
              >
                <span>📥</span>
                <span>{outboxCount}개 대기</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleManualRefresh}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleOpenProfileModal}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full transition text-[11px] font-bold text-slate-700 shadow-sm cursor-pointer"
              title="내 프로필"
            >
              <span className="text-sm leading-none flex items-center justify-center w-5 h-5 rounded-full overflow-hidden shrink-0">
                {(regFruit || activeProfile?.avatar || '👤').startsWith('data:image/') ? (
                  <img src={regFruit || activeProfile?.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  regFruit || activeProfile?.avatar || '👤'
                )}
              </span>
              <span className="max-w-[75px] truncate leading-none">{regAlias || regRealName || '내 프로필'}</span>
            </button>
            {/* 설정 버튼 */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition text-base border border-gray-200"
              title="설정"
            >
              <Settings className="w-4 h-4 text-gray-500" />
            </button>

          </div>
        </div>

        {/* 그룹 생성 드로어 */}
        {isCreatingRoom && (
          <div className="mx-4 mb-3 bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-gray-700">새 모임 그룹 만들기</span>
              <button onClick={() => setIsCreatingRoom(false)} className="text-gray-400 hover:text-gray-600 text-sm w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 transition">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="그룹 이름 (예: 동창회, 부모님 안심)"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="flex-1 bg-white border border-gray-200 text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-rose-400"
              />
              <select
                value={newRoomEmoji}
                onChange={(e) => setNewRoomEmoji(e.target.value)}
                className="bg-white border border-gray-200 text-sm px-2 py-2 rounded-xl focus:outline-none"
              >
                <option value="🍎">🍎</option>
                <option value="🥭">🥭</option>
                <option value="👵">👵</option>
                <option value="🏠">🏠</option>
                <option value="🍻">🍻</option>
                <option value="💼">💼</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newRoomType}
                onChange={(e) => setNewRoomType(e.target.value as any)}
                className="bg-white border border-gray-200 text-xs px-3 py-2 rounded-xl focus:outline-none"
              >
                <option value="friends">🤝 친구 모임</option>
                <option value="family">🏠 가족</option>
                <option value="work">💼 직장 동료</option>
                <option value="care">👵 부모님 안심방</option>
              </select>
              <select
                value={newRoomTrackingStyle}
                onChange={(e) => setNewRoomTrackingStyle(e.target.value as any)}
                className="bg-white border border-gray-200 text-xs px-3 py-2 rounded-xl focus:outline-none"
              >
                <option value="temporary">⏰ 모임 후 자동 종료</option>
                <option value="continuous">👵 상시 위치 공유</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => handleCreateRoom(newRoomName, newRoomEmoji, newRoomType, newRoomTrackingStyle)}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm py-2.5 rounded-xl transition"
            >
              그룹 만들기
            </button>
          </div>
        )}

        {recentCreatedRoomName && (
          <div className="mx-4 mb-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] text-emerald-700 font-semibold">
            <span>✅</span>
            <span>"{recentCreatedRoomName}" 그룹이 생성되었습니다</span>
          </div>
        )}

        {/* 그룹 탭 */}
        {isRoomEditMode && (
          <div className="mx-4 mb-1 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-rose-600 font-semibold">
            <span>🗑️</span>
            <span>삭제할 방을 탭하세요. 우측 ✕로 종료.</span>
            <button onClick={() => setIsRoomEditMode(false)} className="ml-auto text-rose-400 font-bold">✕</button>
          </div>
        )}
        <div ref={roomNavRef} className="flex items-center gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-none">
          {rooms.map((room) => {
            const isActive = activeRoomId === room.id;
            const isOwner = room.ownerId === activeProfileId ||
              ['room-friends', 'room-family', 'room-work', 'room-care'].includes(room.id);
            return (
              <div key={room.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (isRoomEditMode && isOwner) {
                      handleDeleteRoom(room.id);
                    } else {
                      setActiveRoomId(room.id);
                      setSelectedFriendId(null);
                      setSelectedPromiseId(null);
                      setIsRoomEditMode(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
                    isRoomEditMode && isOwner
                      ? 'bg-rose-100 text-rose-600 border border-rose-300 animate-pulse'
                      : isActive
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  } ${isActive && !isRoomEditMode ? 'active-room' : ''}`}
                >
                  <span>{room.emoji}</span>
                  <span>{room.name}</span>
                  {room.isDisbanded && <span className="text-[8px] bg-red-500 text-white px-1 rounded-full">종료</span>}
                  {isRoomEditMode && isOwner && <span className="text-[10px] ml-0.5">🗑</span>}
                </button>
              </div>
            );
          })}
        </div>

        {/* 개발용: 프로필 전환 (접기 가능) */}
        {import.meta.env.DEV && friends.length > 0 && (
          <details className="px-4 pb-2">
            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-500 select-none list-none flex items-center gap-1">
              <span>▸</span><span>프로필 전환 (개발용)</span>
            </summary>
            <div className="flex items-center gap-1 overflow-x-auto pt-1.5 pb-0.5 scrollbar-none">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => { setActiveProfileId(friend.id); setSelectedFriendId(friend.id); setSelectedPromiseId(null); }}
                  className={`px-2.5 py-1 rounded-xl text-[10px] flex items-center gap-1 transition shrink-0 ${
                    activeProfileId === friend.id
                      ? 'bg-gray-900 text-white font-semibold'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{friend.avatar}</span>
                  <span>{friend.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* 2. Main Selected Dynamic Content Area */}
      <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col bg-amber-50/20">
        {activeTab === 'rooms' && (
          <GroupRoomsPanel
            rooms={rooms}
            activeRoomId={activeRoomId}
            activeProfileId={activeProfileId}
            messages={messages.map(m => ({ roomId: activeRoomId, text: m.text, timestamp: m.timestamp }))}
            onSelectRoom={(roomId) => {
              setActiveRoomId(roomId);
              setSelectedFriendId(null);
              setSelectedPromiseId(null);
              setActiveTab('chat');
            }}
            onCreateRoom={handleCreateRoom}
            onDeleteRoom={(roomId) => {
              setPendingDeleteRoomId(roomId);
              setDeleteRoomConfirmKey('');
            }}
          />
        )}

        {activeTab === 'map' && (
          <MapComponent
            friends={friends}
            appointments={appointments}
            activeProfileId={activeProfileId}
            selectedFriendId={selectedFriendId}
            selectedPromiseId={selectedPromiseId}
            onMapClick={handleMapTouchClick}
            tempPromiseCoords={tempPromiseCoords}
            mapViewCoords={mapViewCoords}
            isPersonalRoom={rooms.find(r => r.id === activeRoomId)?.type === 'personal'}
            myGpsCoords={myCoords ? [myCoords.lat, myCoords.lng] : null}
            centerOnMyGpsOnce={!hasCenteredOnGpsRef.current}
            onMyGpsCentered={() => { hasCenteredOnGpsRef.current = true; }}
          />
        )}

        {activeTab === 'chat' && (
          <ChatRoom
            messages={messages}
            friends={friends}
            activeProfileId={activeProfileId}
            onSendMessage={handleSendMessage}
            onSendImage={handleSendImage}
            onFocusLocation={handleFocusLocation}
            onEmergency119={handleEmergency119}
            isCareGroup={activeRoomId === 'room-care' || activeRoomId.includes('care')}
            isDisbanded={rooms.find(r => r.id === activeRoomId)?.isDisbanded || false}
            trackingStyle={rooms.find(r => r.id === activeRoomId)?.trackingStyle || 'temporary'}
            onDisbandRoom={() => handleDisbandRoom(activeRoomId)}
            onAcceptInvite={handleAcceptInvite}
            onInviteFriend={handleInviteFriend}
            onRemoveFriend={(id) => handleDeleteFriend(id)}
            roomId={activeRoomId}
            ownerId={rooms.find(r => r.id === activeRoomId)?.ownerId || ''}
            onCreateAppointment={handleCreateAppointment}
            onStartCall={handleStartCall}
          />
        )}

        {activeTab === 'appointments' && (
          <SchedulePanel
            appointments={appointments}
            friends={friends}
            activeProfileId={activeProfileId}
            tempPromiseCoords={tempPromiseCoords}
            selectedPromiseId={selectedPromiseId}
            onSelectPromise={(id, lat, lng) => {
              // 이미 선택된 약속을 다시 누르면 해제(실선 끄기), 아니면 선택 후 지도로 이동
              if (selectedPromiseId === id) {
                setSelectedPromiseId(null);
                return;
              }
              setSelectedFriendId(null);
              setTempPromiseCoords(null);
              setSelectedPromiseId(id);
              setActiveTab('map');
            }}
            onCreateAppointment={handleCreateAppointment}
            onUpdateAppointment={handleUpdateAppointment}
            onDeleteAppointment={handleDeleteAppointment}
            onVote={handleVote}
            onClearTempCoords={() => setTempPromiseCoords(null)}
            onFocusLocation={handleFocusLocation}
            title={promiseTitle}
            setTitle={setPromiseTitle}
            searchQuery={promiseSearchQuery}
            setSearchQuery={setPromiseSearchQuery}
            confirmedPlace={promiseConfirmedPlace}
            setConfirmedPlace={setPromiseConfirmedPlace}
            dateValue={promiseDateValue}
            setDateValue={setPromiseDateValue}
            timeValue={promiseTimeValue}
            setTimeValue={setPromiseTimeValue}
          />
        )}

        {/* 채팅방 내 멤버 관리: 채팅 탭 하단 버튼으로 접근 가능 */}
        {activeTab === 'chat' && false && (
          <FriendListPanel
            friends={friends}
            activeProfileId={activeProfileId}
            selectedFriendId={selectedFriendId}
            onSelectFriend={(id) => { setSelectedFriendId(id); if (id) setActiveTab('map'); }}
            onInviteFriend={handleInviteFriend}
            onDeleteFriend={handleDeleteFriend}
            onManualMoveFriend={handleManualMoveFriend}
            onUpdateStatusMsg={handleUpdateStatusMsg}
            onEmergency119={handleEmergency119}
            onTogglePedometer={handleTogglePedometer}
            onToggleHeartRate={handleToggleHeartRate}
            isCareGroup={activeRoomId === 'room-care' || activeRoomId.includes('care')}
            onMeasureHeartRate={handleTriggerHeartRateMeasure}
            onAcceptInvite={handleAcceptInvite}
            isRoomOwner={rooms.find(r => r.id === activeRoomId)?.ownerId === activeProfileId || ['room-friends','room-family','room-work','room-care'].includes(activeRoomId)}
            onLeaveRoom={handleLeaveRoom}
            showDevControls={import.meta.env.DEV}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationPanel
            notifications={notifications}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
            onMarkAsRead={handleMarkNotificationRead}
            onAcceptRoomInvite={handleAcceptRoomInvite}
            onAcceptGameInvite={handleAcceptGameInvite}
            activeProfileId={activeProfileId}
          />
        )}

        {activeTab === 'game' && (
          <GamePanel
            friends={friends}
            activeProfileId={activeProfileId}
            activeRoomId={activeRoomId}
            multiplayerConfig={multiplayerGameConfig}
            onResetMultiplayer={() => setMultiplayerGameConfig(null)}
          />
        )}

        {activeTab === 'pedometer' && (
          <PedometerPanel
            phone={regPhone}
            activeProfileId={activeProfileId}
            activeRoomId={activeRoomId}
            liveSteps={stepsToday}
            friends={friends}
            onSyncSteps={handleSyncSteps}
          />
        )}

        {activeTab === 'music' && (
          <MusicPanel
            authFetch={authFetch}
            activeProfileId={activeProfileId}
            myName={friends.find(f => f.id === activeProfileId)?.name || localStorage.getItem('aemang_nickname') || '나'}
          />
        )}

        {activeTab === 'restaurant' && (
          <RestaurantPanel
            authFetch={authFetch}
            activeProfileId={activeProfileId}
            myName={friends.find(f => f.id === activeProfileId)?.name || localStorage.getItem('aemang_nickname') || '나'}
            onFocusLocation={handleFocusLocation}
          />
        )}

        {activeTab === 'book' && (
          <BookPanel
            authFetch={authFetch}
            activeProfileId={activeProfileId}
            myName={friends.find(f => f.id === activeProfileId)?.name || localStorage.getItem('aemang_nickname') || '나'}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsPanel
            currentRoomName={rooms.find(r => r.id === activeRoomId)?.name}
            onInvite={(name, phone) => handleInviteFriend(name, '👤', '#EC4899', phone)}
          />
        )}
      </div>

      {/* BIZ-CORE-8 ④: 보호자 SOS 알림 오버레이 (구 119 시뮬레이션 대체) */}
      {isDialing119 && emergencyTarget && (
        <div className="absolute inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between p-5 animate-fadeIn font-sans">
          {/* SOS Header */}
          <div className="flex flex-col items-center gap-1.5 text-center mt-3 shrink-0">
            <div className="flex gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
              <span className="text-[9.5px] font-black bg-red-700 px-2 py-0.5 rounded-full uppercase tracking-wider select-none">
                SOS GUARDIAN ALERT
              </span>
            </div>
            <h2 className="text-sm font-black text-rose-500">🆘 보호자 SOS 긴급 알림</h2>
            <p className="text-[10px] text-zinc-400 font-bold">
              같은 방 가족·친구 전원에게 긴급 알림과 실시간 위치가 전송됩니다.
            </p>
          </div>

          {/* SOS Target Card */}
          <div className="flex flex-col items-center justify-center gap-4 py-4 my-auto">
            <div className="w-20 h-20 rounded-full bg-red-900/35 border-4 border-red-500 flex items-center justify-center animate-pulse shadow-2xl">
              <span className="text-4xl">🆘</span>
            </div>

            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-1 text-md font-black">
                <span className="text-xl">{emergencyTarget.avatar}</span>
                <span>{emergencyTarget.name}</span>
              </div>
              <p className="text-[11px] text-yellow-400 font-mono font-bold">
                “{emergencyTarget.statusMsg || '상태 메시지 없음'}”
              </p>
            </div>

            {/* SOS Status */}
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-2 text-[10px] text-zinc-300 font-mono">
              <div className="flex justify-between border-b border-zinc-800/80 pb-1.5 font-bold">
                <span className="text-zinc-500">🆘 SOS 발송 상태:</span>
                <span className={`${dialingStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
                  {dialingStatus === 'connected' ? '✅ 보호자 전원 발송 완료' : '발송 중...'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/80 pb-1.5">
                <span className="text-zinc-500">📍 공유된 위치:</span>
                <span>위도 {emergencyTarget.lat.toFixed(5)}, 경도 {emergencyTarget.lng.toFixed(5)}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/80 pb-1.5">
                <span className="text-zinc-500">💓 심박수:</span>
                <span>{emergencyTarget.heartRate ? `${emergencyTarget.heartRate} bpm` : '미공유'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">🔋 배터리 잔량:</span>
                <span>{emergencyTarget.battery}%</span>
              </div>
            </div>

            {/* 안내 문구 */}
            <div className="w-full bg-red-950/20 border border-red-900/30 rounded-xl p-2.5 text-[10px] text-zinc-300 leading-relaxed">
              💡 응급 상황(의식 없음, 호흡 곤란, 부상 등)이라면 아래의 <b className="text-rose-400">119 전화 걸기</b> 버튼으로 직접 신고해 주세요.
              전화가 어려운 상황이면 채팅방에서 가족들이 위치를 보고 대응할 수 있습니다.
            </div>

            {/* 119 직접 전화 — 자동신고가 아닌 사용자 본인의 직접 통화 */}
            <a
              href="tel:119"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-3.5 rounded-2xl text-sm text-center border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:shadow-none active:translate-y-0.5 cursor-pointer"
            >
              📞 119 직접 전화 걸기
            </a>
          </div>

          {/* Close Actions */}
          <div className="grid grid-cols-1 gap-2.5 pb-4 shrink-0 font-sans">
            <button
              type="button"
              onClick={() => {
                setIsDialing119(false);
                setEmergencyTarget(null);
                setDialingStatus('calling');
                setDialingTimeCounter(0);
                setActiveTab('chat');
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold py-2.5 rounded-xl text-xs border border-zinc-650 transition cursor-pointer"
            >
              닫기 (채팅방에서 상황 보기)
            </button>
          </div>
        </div>
      )}

      {/* 3. 하단 내비게이션 */}
      <div className="bg-white border-t border-gray-100 px-1.5 flex items-center gap-0.5 overflow-x-auto scrollbar-none select-none z-40 shrink-0 pt-1.5 pb-3 safe-area-pb" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>
        {/* Core Services Group */}
        {([
          { id: 'rooms' as const, Icon: LayoutList, label: '그룹방', onClick: () => setActiveTab('rooms') },
          { id: 'contacts' as const, Icon: Contact, label: '연락처', onClick: () => setActiveTab('contacts') },
          { id: 'map' as const, Icon: Map, label: '지도', onClick: () => { setActiveTab('map'); setSelectedFriendId(null); } },
          { id: 'chat' as const, Icon: MessageSquare, label: '채팅', onClick: () => setActiveTab('chat') },
          { id: 'appointments' as const, Icon: Calendar, label: '약속', onClick: () => setActiveTab('appointments') },
          { id: 'pedometer' as const, Icon: Footprints, label: '만보기', onClick: () => setActiveTab('pedometer') },
          { id: 'notifications' as const, Icon: Bell, label: '알림', onClick: () => setActiveTab('notifications') },
        ]).map(({ id, Icon, label, onClick }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            className={`relative flex flex-col items-center justify-center gap-0.5 w-[52px] shrink-0 h-12 rounded-xl transition-all ${
              activeTab === id ? 'text-rose-500 bg-rose-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className={`text-[9px] ${activeTab === id ? 'font-bold' : 'font-medium'}`}>{label}</span>
            {id === 'notifications' && notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
            {id === 'appointments' && tempPromiseCoords && (
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}

        {/* 세로 구분선 */}
        <div className="w-[1.5px] h-7 bg-gray-200 mx-1 shrink-0 self-center" />

        {/* Leisure/Entertainment Group */}
        {([
          { id: 'music' as const, Icon: Music, label: '음악', onClick: () => setActiveTab('music') },
          { id: 'restaurant' as const, Icon: Utensils, label: '맛집', onClick: () => setActiveTab('restaurant') },
          { id: 'book' as const, Icon: BookOpen, label: '책', onClick: () => setActiveTab('book') },
          { id: 'game' as const, Icon: Gamepad2, label: '게임방', onClick: () => setActiveTab('game') },
        ]).map(({ id, Icon, label, onClick }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            className={`relative flex flex-col items-center justify-center gap-0.5 w-[52px] shrink-0 h-12 rounded-xl transition-all ${
              activeTab === id ? 'text-indigo-600 bg-indigo-50 border border-indigo-150' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/30'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className={`text-[9px] ${activeTab === id ? 'font-bold' : 'font-medium'}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* C. 오프라인 대기열 모달 */}
      {showOutboxModal && (
        <div className="absolute inset-0 bg-black/40 z-50 flex items-end justify-center font-sans">
          <div className="bg-white rounded-t-3xl w-full p-6 space-y-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto shrink-0" />
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>📥</span>
                <span>오프라인 대기열 ({outboxEntries.length}개)</span>
              </h3>
              <button 
                onClick={() => setShowOutboxModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-gray-500 shrink-0 leading-relaxed">
              네트워크가 불안정할 때 전송되지 못하고 브라우저에 임시 보관된 요청입니다. 
              인터넷이 연결되면 백그라운드에서 자동으로 전송을 시도합니다.
            </p>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 py-2 border-t border-b border-gray-100">
              {outboxEntries.map((entry) => {
                let description = '대기 중인 요청';
                if (entry.endpoint === '/api/chat') {
                  description = `💬 채팅 메시지: "${entry.payload?.text || ''}"`;
                } else if (entry.endpoint === '/api/appointments') {
                  description = `📅 약속 생성: "${entry.payload?.title || ''}" (${entry.payload?.placeName || ''})`;
                } else if (entry.endpoint === '/api/appointments/update') {
                  description = `🔄 약속 수정: "${entry.payload?.title || ''}"`;
                } else if (entry.endpoint === '/api/friends/move') {
                  description = `📍 내 위치 업데이트 전송`;
                } else if (entry.endpoint === '/api/friends/profile') {
                  description = `👤 프로필 수정: "${entry.payload?.alias || entry.payload?.realName || ''}"`;
                } else {
                  description = `${entry.endpoint} (${JSON.stringify(entry.payload || {})})`;
                }

                return (
                  <div key={entry.id} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">
                    <div className="flex-1 truncate mr-2">
                      <p className="truncate text-gray-800">{description}</p>
                      <p className="text-[9px] text-gray-450 font-normal mt-0.5">
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleRemoveOutboxEntry(entry.id)}
                      className="text-rose-500 hover:text-rose-700 px-2 py-1 hover:bg-rose-50 rounded-lg text-[10px] shrink-0"
                    >
                      삭제
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2 shrink-0">
              <button 
                type="button" 
                onClick={handleClearOutbox}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition border border-gray-300"
              >
                🗑️ 대기열 비우기
              </button>
              <button 
                type="button" 
                onClick={handleForceSyncOutbox}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs transition border border-rose-600 shadow-sm"
              >
                ⚡ 즉시 전송 시도
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. 설정 모달 */}
      {showSettingsModal && (
        <div
          className="absolute inset-0 bg-black/40 z-50 flex items-end justify-center font-sans"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-white rounded-t-3xl w-full p-6 space-y-4 shadow-2xl max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { sheetTouchStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (sheetTouchStartY.current != null) {
                const dy = e.changedTouches[0].clientY - sheetTouchStartY.current;
                if (dy > 70) setShowSettingsModal(false);
                sheetTouchStartY.current = null;
              }
            }}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-rose-500 animate-spin-slow" />
              <span>설정</span>
            </h3>
            <p className="text-xs text-gray-500">앱 알림 소리 켜기/끄기 및 방 탈퇴 등 환경설정입니다.</p>

            <div className="space-y-4 py-2 border-t border-b border-gray-100">
              <div className="flex flex-col pb-1 gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">소리 알림</p>
                    <p className="text-[11px] text-gray-400">채팅 및 알림 시 경쾌한 비프음이 울립니다</p>
                  </div>
                  <div className="flex items-center gap-2 font-sans">
                    <button
                      type="button"
                      onClick={() => speakText('애망! 애망!', true)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] whitespace-nowrap font-bold px-2 py-1 rounded-xl transition border border-rose-200"
                    >
                      🔊 소리 테스트
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !isSoundEnabled;
                        setIsSoundEnabled(nextVal);
                        localStorage.setItem('aemang_sound_enabled', String(nextVal));
                      }}
                      className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ${
                        isSoundEnabled ? 'bg-rose-500' : 'bg-gray-200'
                      }`}
                    >
                      <div
                        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${
                          isSoundEnabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 알림 소리 종류 선택 그리드 */}
                <div className="space-y-1.5 mt-1">
                  <p className="text-[10px] font-bold text-gray-400">알림 소리 종류 선택</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { label: '애플 🍎', value: 0 },
                      { label: '실로폰 🎵', value: 1 },
                      { label: '핑 🔔', value: 2 },
                      { label: '레이저 ⚡', value: 3 },
                      { label: '장구 🥁', value: 4 },
                    ].map((theme) => {
                      const isSelected = selectedSoundIdx === theme.value;
                      return (
                        <button
                          key={theme.value}
                          type="button"
                          onClick={() => {
                            setSelectedSoundIdx(theme.value);
                            localStorage.setItem('aemang_sound_idx', String(theme.value));
                            playBipSound(theme.value, true);
                          }}
                          className={`py-2 px-1 text-[10px] font-bold rounded-xl border text-center transition ${
                            isSelected
                              ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-rose-50 hover:text-rose-600'
                          }`}
                        >
                          {theme.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 이 방에서 나가기 — 누구나(멤버 자유 탈퇴). 방은 유지되고 나만 빠짐 */}
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">🚪 이 방에서 나가기</p>
                  <p className="text-[11px] text-gray-400">이 방에서 내 참여를 종료합니다 (방은 유지됨)</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowSettingsModal(false); handleLeaveRoom(); }}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm shrink-0"
                >
                  나가기
                </button>
              </div>

              {(() => {
                const currentRoom = rooms.find(r => r.id === activeRoomId);
                if (!currentRoom) return null;
                const isSystemRoom = ['room-friends', 'room-family', 'room-work', 'room-care'].includes(activeRoomId);
                const isOwner = currentRoom.ownerId === activeProfileId;

                if (isSystemRoom) {
                  return (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">대화방 삭제 (기록 초기화)</p>
                        <p className="text-[11px] text-gray-400">이 안심 대화방의 메시지 및 약속 기록을 삭제하고 초기화합니다</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setShowSettingsModal(false);
                          if (!window.confirm('이 대화방의 모든 기록(대화 및 약속)을 삭제하시겠습니까?')) return;
                          try {
                            const response = await authFetch('/api/rooms/reset', {
                              method: 'POST',
                              body: JSON.stringify({ roomId: activeRoomId })
                            });
                            if (response.ok) {
                              alert('대화방 기록이 초기화되었습니다.');
                              fetchAllStates(activeRoomId);
                            } else {
                              alert('삭제 실패');
                            }
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                      >
                        방 삭제
                      </button>
                    </div>
                  );
                } else if (isOwner) {
                  return (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">이 그룹방 삭제 (폭파)</p>
                        <p className="text-[11px] text-gray-400">이 그룹방을 폭파하고 완전히 삭제합니다</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsModal(false);
                          handleDeleteRoom(activeRoomId);
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                      >
                        방 삭제
                      </button>
                    </div>
                  );
                } else {
                  return (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">이 그룹방 삭제 (탈퇴)</p>
                        <p className="text-[11px] text-gray-400">이 그룹방을 내 화면에서 나가고 삭제합니다</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsModal(false);
                          handleLeaveRoom();
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                      >
                        방 삭제
                      </button>
                    </div>
                  );
                }
              })()}
              
              {/* 내 위치 공유 ON/OFF */}
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">📍 내 위치 공유</p>
                  <p className="text-[11px] text-gray-400">
                    {shareLocation ? '켜짐 — 그룹 멤버에게 내 위치가 보입니다' : '꺼짐 — 앱은 쓰되 내 위치는 공유 안 됨'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleLocationSharing}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 shrink-0 ${shareLocation ? 'bg-rose-500' : 'bg-gray-200'}`}
                >
                  <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${shareLocation ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* 앱 접속 비밀번호 (전화번호 계정) */}
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">🔒 앱 접속 비밀번호</p>
                  <p className="text-[11px] text-gray-400">
                    {accountHasPassword ? '설정됨 — 접속 시(다른 기기 포함) 비밀번호 필요' : '내 번호로 다른 사람이 접속 못 하게 비밀번호 설정'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSetLockPassword}
                    className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    {accountHasPassword ? '변경' : '설정'}
                  </button>
                  {accountHasPassword && (
                    <button
                      type="button"
                      onClick={handleRemoveLockPassword}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-3 py-2 rounded-xl transition"
                    >
                      해제
                    </button>
                  )}
                </div>
              </div>

              {/* 잠그고 나가기 — 프로필 유지, 다음 접속 시 비번 */}
              {accountHasPassword && (
                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">🔒 잠그고 나가기</p>
                    <p className="text-[11px] text-gray-400">다음 접속 때 비밀번호를 입력해야 합니다 (프로필 유지)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLockAndExit}
                    className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                  >
                    잠그기
                  </button>
                </div>
              )}

              {/* 앱 로그아웃 (완전 탈퇴) */}
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">앱 로그아웃 (계정 해제)</p>
                  <p className="text-[11px] text-gray-400">프로필 정보를 지우고 처음(가입)부터 다시 시작합니다</p>
                </div>
                <button
                  type="button"
                  onClick={handleAppLogout}
                  className="bg-gray-500 hover:bg-gray-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                >
                  로그아웃
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-sm font-semibold transition"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* A. 프로필 등록 모달 */}
      {showProfileModal && (
        <div className="absolute inset-0 bg-black/40 z-50 flex items-end justify-center font-sans">
          <div
            className="bg-white rounded-t-3xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
            style={{
              transform: `translateY(${profileDragY}px)`,
              transition: profileDragY === 0 ? 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none',
              touchAction: profileDragY > 0 ? 'none' : 'auto',
              willChange: 'transform'
            }}
            onTouchStart={handleProfileTouchStart}
            onTouchMove={handleProfileTouchMove}
            onTouchEnd={handleProfileTouchEnd}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <h3 className="text-base font-bold text-gray-900">내 프로필 설정</h3>

            {/* 상단 프로필 카드 요약 */}
            <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-14 h-14 bg-white border-2 border-rose-200 rounded-2xl shadow-sm flex items-center justify-center text-3xl shrink-0 overflow-hidden">
                {regFruit.startsWith('data:image/') ? (
                  <img src={regFruit} alt="" className="w-full h-full object-cover" />
                ) : (
                  regFruit
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-rose-500 font-bold tracking-wider uppercase">현재 프로필 정보</p>
                <h4 className="text-sm font-black text-slate-800 truncate">{regAlias || regRealName || '이름 미등록'}</h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{regPhone || '번호 미등록'}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">🍎 아바타 과일 선택 (15종)</label>
                <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                  {['🍎', '🥭', '🍊', '🍑', '🍓', '🍉', '🍇', '🍈', '🍌', '🍒', '🥝', '🍍', '🥥', '🫐', '🍋'].map((fruit) => (
                    <button
                      key={fruit}
                      type="button"
                      onClick={() => setRegFruit(fruit)}
                      className={`text-xl h-9 w-full rounded-xl flex items-center justify-center transition border ${
                        regFruit === fruit
                          ? 'bg-rose-100 border-rose-400 shadow-sm font-bold scale-105'
                          : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                      }`}
                    >
                      {fruit}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">🙋‍♂️ 남성 아바타</label>
                  <div className="grid grid-cols-5 gap-1 pt-0.5">
                    {['👦', '👨', '🧔', '👴', '🧑‍💻'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setRegFruit(emoji)}
                        className={`text-lg h-8 w-full rounded-lg flex items-center justify-center transition border ${
                          regFruit === emoji
                            ? 'bg-rose-100 border-rose-400 shadow-sm font-bold scale-105'
                            : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">👧 여성 아바타</label>
                  <div className="grid grid-cols-5 gap-1 pt-0.5">
                    {['👧', '👩', '👩‍🦱', '👵', '👩‍💻'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setRegFruit(emoji)}
                        className={`text-lg h-8 w-full rounded-lg flex items-center justify-center transition border ${
                          regFruit === emoji
                            ? 'bg-rose-100 border-rose-400 shadow-sm font-bold scale-105'
                            : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-gray-150 pt-2.5">
                <label className="text-xs font-semibold text-gray-600">📷 내 사진 업로드</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => document.getElementById('profile-photo-file-upload')?.click()}
                    className="px-4 py-2 border-2 border-black bg-rose-50 hover:bg-rose-100 text-xs font-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition cursor-pointer"
                  >
                    사진 파일 선택
                  </button>
                  <input
                    id="profile-photo-file-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result && typeof event.target.result === 'string') {
                            setRegFruit(event.target.result); // Base64
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {regFruit.startsWith('data:image/') ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-emerald-600 font-bold">✓ 사진 등록 완료</span>
                      <button
                        type="button"
                        onClick={() => setRegFruit('🍎')}
                        className="text-[9px] text-gray-400 hover:text-rose-500 font-bold underline cursor-pointer"
                      >
                        초기화
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-400">직접 찍은 사진이나 갤러리 이미지 등록 가능</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">휴대전화 번호</label>
                <input
                  type="text"
                  placeholder="010-0000-0000"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-400 font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">실명</label>
                <input
                  type="text"
                  placeholder="김민수"
                  value={regRealName}
                  onChange={(e) => setRegRealName(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">앱 내 닉네임</label>
                <input
                  type="text"
                  placeholder="예: 애플망고"
                  value={regAlias}
                  onChange={(e) => setRegAlias(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-sm font-semibold transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleSaveProfile(regPhone, regRealName, regAlias, regFruit)}
                className="py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-sm font-semibold transition"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. 그룹 삭제 확인 모달 */}
      {pendingDeleteRoomId && (
        <div className="absolute inset-0 bg-black/40 z-50 flex items-end justify-center font-sans">
          <div className="bg-white rounded-t-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <h3 className="text-base font-bold text-gray-900">그룹 삭제</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              정말로 이 그룹방 <span className="font-semibold text-rose-600">"{rooms.find(r => r.id === pendingDeleteRoomId)?.name}"</span>을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={cancelDeleteRoom}
                className="py-3 bg-gray-100 hover:bg-gray-200 rounded-2xl text-sm font-semibold text-gray-700 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDeleteRoom}
                className="py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-sm font-semibold transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. Real-time caregiver bio heart rate ECG tracker diagnostics overlay */}
      {isMeasuringHeartRate && measuringTarget && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-slate-900 border-4 border-red-500 p-4 rounded-2xl w-full max-w-[290px] shadow-[4px_4px_0px_0px_rgba(239,68,68,0.4)] text-white animate-fadeIn">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-3">
              <h3 className="text-xs font-black text-red-500 animate-pulse flex items-center gap-1">
                💓 원격 바이오 심박측정 진단
              </h3>
              <span className="text-[8px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded font-black border border-red-900">
                연결 중
              </span>
            </div>

            <p className="text-[9.5px] text-zinc-400 font-bold mb-3">
              - 측정 대상: <span className="text-white font-extrabold">{measuringTarget.name}</span> 님<br />
              - 연결 경로: LTE-M 무선 원격 스마트 안심밴드 6
            </p>

            <div className="flex flex-col items-center py-4 relative">
              {/* Spinning heart scanner circle */}
              <div className="w-16 h-16 rounded-full bg-red-950/40 border-2 border-dashed border-red-500 flex items-center justify-center animate-spin duration-3000 my-2">
                <span className="text-2xl select-none rotate-90 scale-90">🧬</span>
              </div>
              <span className="text-3xl absolute animate-bounce mt-1">❤️</span>

              {/* Real-time Simulated EEG Green Graph Line */}
              <div className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded mt-3 relative overflow-hidden flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <path
                    d={`M0,15 L20,15 L25,5 L30,25 L35,15 L50,15 L55,0 L60,30 L65,15 L100,15`}
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="2"
                    className="animate-pulse"
                  />
                </svg>
                <span className="text-[7.5px] text-red-400 absolute bottom-0.5 right-1 animate-pulse font-mono font-bold">
                  ECG LIVE SIGNAL
                </span>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              <div className="flex justify-between items-center text-[9.5px]">
                <span className="text-zinc-500">지표 판독 주파수</span>
                <span className="font-mono text-[#FACC15]">{measurementProgress}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-2 border border-zinc-750 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${measurementProgress}%` }}
                ></div>
              </div>

              {measuredBpm !== null ? (
                <div className="p-2 bg-emerald-950/40 border border-emerald-950 rounded-lg text-center mt-3 animate-slideUp">
                  <p className="text-[9.5px] text-emerald-400 font-bold leading-normal">
                    ✅ 측정 진단 결과: <span className="font-black text-white">{measuredBpm} BPM</span>
                  </p>
                  <p className="text-[8px] text-zinc-400 font-medium leading-normal mt-0.5">
                    동방 결절 자율 수치 안정적. 활력 지수 매우 정상입니다.
                  </p>
                </div>
              ) : (
                <p className="text-[8px] text-center text-zinc-500 italic mt-2 animate-pulse">
                  손목 스마트센서 무선 데이터를 원격 판독 중입니다...
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={measurementProgress < 100}
              onClick={() => {
                setIsMeasuringHeartRate(false);
                setMeasuringTarget(null);
              }}
              className={`w-full py-2 border-2 border-black rounded-xl text-xs font-black mt-4 transition cursor-pointer ${
                measurementProgress < 100
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-zinc-700'
                  : 'bg-red-600 border-red-500 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-0.5'
              }`}
            >
              {measurementProgress < 100 ? '측정 판독 중...' : '확인 완료'}
            </button>
          </div>
        </div>
      )}

      {/* 게임 초대 모달 */}
      {activeGameInvite && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 font-sans">
          <div className="bg-slate-900 border-2 border-rose-500 rounded-3xl p-5 w-full max-w-[280px] text-center shadow-2xl text-white">
            <span className="text-4xl block mb-2">🕹️</span>
            <h4 className="text-sm font-black text-rose-400 text-[13px]">게임 초대 도착!</h4>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              <span className="font-bold text-white">[{activeGameInvite.fromName}]</span> 님이 <br />
              <span className="font-extrabold text-yellow-400">
                {activeGameInvite.game === 'drone_battle' ? '드론 전쟁 🛸' : '전통 윷놀이 🎲'}
              </span>
              에 초대하셨습니다!
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  const socket = getLocationSocket();
                  socket.emit('game-relay', {
                    roomId: activeRoomId,
                    payload: {
                      type: 'decline',
                      from: activeProfileId,
                      to: activeGameInvite.from,
                      game: activeGameInvite.game
                    }
                  });
                  setActiveGameInvite(null);
                }}
                className="py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl text-slate-400"
              >
                거절
              </button>
              <button
                type="button"
                onClick={() => {
                  const socket = getLocationSocket();
                  socket.emit('game-relay', {
                    roomId: activeRoomId,
                    payload: {
                      type: 'accept',
                      from: activeProfileId,
                      to: activeGameInvite.from,
                      game: activeGameInvite.game
                    }
                  });
                  setMultiplayerGameConfig({
                    game: activeGameInvite.game,
                    opponentId: activeGameInvite.from,
                    role: 'p2'
                  });
                  setActiveGameInvite(null);
                  setActiveTab('game');
                }}
                className="py-2 bg-rose-500 hover:bg-rose-600 text-xs font-bold rounded-xl text-white shadow-md"
              >
                수락!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모의 음성/화상 통화 전체화면 오버레이 */}
      {callingState && (
        <div className="absolute inset-0 bg-slate-950 z-50 flex flex-col justify-between p-6 text-white font-sans animate-fadeIn select-none">
          {/* Top Info Section */}
          <div className="flex flex-col items-center mt-12 space-y-3">
            <div className="relative">
              <div
                style={{ backgroundColor: callingState.friend.color || '#EC4899' }}
                className="w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center text-4xl shadow-2xl overflow-hidden font-black"
              >
                {callingState.friend.avatar.startsWith('data:image/') ? (
                  <img src={callingState.friend.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  callingState.friend.avatar
                )}
              </div>
              {callingState.status === 'connected' && (
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-950 animate-pulse" />
              )}
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-black">{callingState.friend.name}</h2>
              <p className="text-xs text-slate-400 font-mono tracking-wider">{callingState.friend.phone || '010-0000-0000'}</p>
              <p className="text-xs text-rose-400 font-bold mt-1.5 flex items-center justify-center gap-1">
                {callingState.type === 'voice' ? '📞 음성 통화' : '📹 화상 통화'}
              </p>
            </div>

            {/* Status & Timer */}
            <div className="pt-4 text-center">
              {callingState.status === 'ringing' ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-300 animate-pulse">신호 가는 중...</p>
                  <div className="flex justify-center gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                  </div>
                </div>
              ) : callingState.status === 'connected' ? (
                <p className="text-lg font-extrabold font-mono text-emerald-400">
                  {Math.floor(callingState.duration / 60).toString().padStart(2, '0')}:
                  {(callingState.duration % 60).toString().padStart(2, '0')}
                </p>
              ) : (
                <p className="text-sm font-black text-rose-500 animate-pulse">통화가 종료되었습니다.</p>
              )}
            </div>
          </div>

          {/* Video Preview Center (For Video Calls) */}
          {callingState.type === 'video' && callingState.status === 'connected' && (
            <div className="relative flex-1 my-6 rounded-3xl border-2 border-slate-800 bg-slate-900 overflow-hidden flex items-center justify-center shadow-inner">
              {callingState.cameraOff ? (
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-2xl mx-auto">👤</div>
                  <p className="text-xs text-slate-400 font-semibold">내 카메라 꺼짐</p>
                </div>
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              )}
              <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-[9px] font-bold px-2 py-0.5 rounded-full border border-white/10">내 화면 실시간 전송</span>
            </div>
          )}

          {/* Voice Call Pulse Visualizer Center */}
          {callingState.type === 'voice' && callingState.status === 'connected' && (
            <div className="flex-1 flex items-center justify-center my-6">
              <div className="flex items-center gap-1.5 h-16 w-full justify-center">
                {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((bar, i) => (
                  <span
                    key={i}
                    style={{
                      height: `${15 + Math.sin((callingState.duration * 2) + i) * 35}%`,
                    }}
                    className="w-1.5 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Control Buttons Footer */}
          <div className="mb-6 flex flex-col items-center space-y-6">
            {callingState.status === 'connected' && (
              <div className="flex items-center gap-6">
                {/* Mute Mic */}
                <button
                  type="button"
                  onClick={() => setCallingState(prev => prev ? { ...prev, micMuted: !prev.micMuted } : null)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/10 transition-colors cursor-pointer text-lg ${
                    callingState.micMuted ? 'bg-rose-500 text-white' : 'bg-slate-850 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  🎙️
                </button>

                {/* Toggle Camera (Only for video) */}
                {callingState.type === 'video' && (
                  <button
                    type="button"
                    onClick={() => setCallingState(prev => prev ? { ...prev, cameraOff: !prev.cameraOff } : null)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/10 transition-colors cursor-pointer text-lg ${
                      callingState.cameraOff ? 'bg-rose-500 text-white' : 'bg-slate-855 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    📹
                  </button>
                )}

                {/* Speaker */}
                <button
                  type="button"
                  onClick={() => setCallingState(prev => prev ? { ...prev, speakerOn: !prev.speakerOn } : null)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/10 transition-colors cursor-pointer text-lg ${
                    callingState.speakerOn ? 'bg-indigo-500 text-white' : 'bg-slate-850 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  🔊
                </button>
              </div>
            )}

            {/* Decline/Hang Up Button */}
            <button
              type="button"
              onClick={handleEndCall}
              className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-2xl shadow-xl hover:shadow-red-600/30 active:scale-95 transition cursor-pointer"
            >
              📞
            </button>
          </div>
        </div>
      )}
    </MobileFrame>
  );
}
