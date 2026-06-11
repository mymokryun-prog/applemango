/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocationSocket } from '../realtime/socketClient';
import type { GpsStatus, LocationUpdatedPayload } from '../realtime/types';
import { isNativeApp, startNativeBackgroundWatch } from '../native/backgroundLocation';

const MIN_SEND_INTERVAL_MS = 3500;
const MIN_MOVE_METERS = 12;

/** PC·노트북: Wi-Fi/IP 위치 (빠르고 성공률 높음) */
const GEO_RELAXED: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60_000,
  timeout: 30_000,
};

/** 스마트폰: GPS 정밀 (느리고 PC에서는 자주 실패) */
const GEO_ACCURATE: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 45_000,
};

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

function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function geoErrorMessage(code: number): { status: GpsStatus; message: string } {
  if (code === 1) {
    return {
      status: 'denied',
      message:
        '위치 권한이 거부되었습니다. 주소창 왼쪽 🔒 → 사이트 설정 → 위치 → 「허용」으로 바꿔 주세요.',
    };
  }
  if (code === 2) {
    return {
      status: 'error',
      message:
        '위치 센서를 사용할 수 없습니다. Windows: 설정 → 개인정보 및 보안 → 위치 → 「위치 서비스」를 켜 주세요.',
    };
  }
  return {
    status: 'error',
    message:
      '위치 요청 시간이 초과되었습니다. PC는 GPS 대신 Wi-Fi 위치를 씁니다. 아래 [위치 다시 시도]를 눌러 주세요.',
  };
}

export interface UseRealtimeLocationOptions {
  roomId: string;
  userId: string;
  enabled?: boolean;
  shareLocation?: boolean;
  privacyMode?: 'precise' | 'approximate';
  onLocationUpdated?: (payload: LocationUpdatedPayload) => void;
}

export interface UseRealtimeLocationResult {
  isSocketConnected: boolean;
  gpsStatus: GpsStatus;
  gpsError: string | null;
  myCoords: { lat: number; lng: number; accuracy?: number } | null;
  lastSentAt: string | null;
  requestGpsPermission: () => void;
  stepsToday: number;
  pedometerAvailable: boolean;
  requestPedometerPermission: () => Promise<boolean>;
}

// 만보기 — DeviceMotionEvent 가속도 크기로 걸음 감지
const STEP_THRESHOLD = 11.5;
const STEP_COOLDOWN_MS = 300;

// 로컬 날짜 문자열(YYYY-MM-DD) — 하루 기준 걸음 카운팅
function pedometerTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function saveStepsToday(steps: number) {
  try {
    localStorage.setItem('aemang_steps_today', JSON.stringify({ date: pedometerTodayStr(), steps }));
  } catch {}
}

export function useRealtimeLocation({
  roomId,
  userId,
  enabled = true,
  shareLocation = true,
  privacyMode = 'precise',
  onLocationUpdated,
}: UseRealtimeLocationOptions): UseRealtimeLocationResult {
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  // 오늘 걸음수를 날짜별로 localStorage에 영속화 — 앱을 나갔다 들어와도 누적 유지
  const [stepsToday, setStepsToday] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('aemang_steps_today');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.date === pedometerTodayStr()) return Number(d.steps) || 0;
      }
    } catch {}
    return 0;
  });
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const stepMagnitudeRef = useRef(0);
  const stepLastTimeRef = useRef(0);
  const pedometerCleanupRef = useRef<(() => void) | null>(null);

  const onLocationUpdatedRef = useRef(onLocationUpdated);
  const lastEmitRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const nativeWatchCleanupRef = useRef<(() => void) | null>(null); // 네이티브(Capacitor) 워처
  const joinedRoomRef = useRef<string | null>(null);
  const hasCoordsRef = useRef(false);
  const geoAttemptRef = useRef(0);
  const watchErrorCountRef = useRef(0);

  useEffect(() => {
    onLocationUpdatedRef.current = onLocationUpdated;
  }, [onLocationUpdated]);

  const applyLocationPrivacy = useCallback((lat: number, lng: number) => {
    if (privacyMode !== 'approximate') return { lat, lng };

    // 약 500m 단위 격자 중심으로 보정한다. 청소년/친구 테스트에서 "근처만 공유"를
    // 체감할 수 있게 하되 도착/이탈 알림은 방 안의 정확 공유 모드에서 사용하도록 분리한다.
    const grid = 0.0045;
    return {
      lat: Math.round(lat / grid) * grid,
      lng: Math.round(lng / grid) * grid,
    };
  }, [privacyMode]);

  const emitLocation = useCallback(
    (lat: number, lng: number, accuracy?: number) => {
      const socket = getLocationSocket();
      if (!roomId || !userId || !shareLocation) return;
      const shared = applyLocationPrivacy(lat, lng);
      // 웹: 소켓 필수 / 네이티브: 소켓 끊김 시 HTTP 폴백 허용
      if (!socket.connected && !isNativeApp()) return;

      const now = Date.now();
      const prev = lastEmitRef.current;
      if (prev) {
        const moved = haversineMeters(prev.lat, prev.lng, lat, lng);
        const elapsed = now - prev.time;
        if (moved < MIN_MOVE_METERS && elapsed < MIN_SEND_INTERVAL_MS) {
          return;
        }
      }

      lastEmitRef.current = { lat, lng, time: now };

      // 네이티브 백그라운드 모드에서 소켓이 끊겨 있으면 HTTP로 폴백 전송
      if (!socket.connected && isNativeApp()) {
        fetch('/api/friends/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId, lat: shared.lat, lng: shared.lng, roomId }),
        }).then(() => setLastSentAt(new Date().toISOString())).catch(() => {});
        return;
      }

      socket.emit(
        'update-location',
        { roomId, friendId: userId, lat: shared.lat, lng: shared.lng, accuracy },
        (response: { error?: string; success?: boolean }) => {
          if (response?.error) {
            console.warn('Location update rejected:', response.error);
            return;
          }
          if (response?.success) {
            setLastSentAt(new Date().toISOString());
          }
        }
      );
    },
    [roomId, userId, shareLocation, applyLocationPrivacy]
  );

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      hasCoordsRef.current = true;
      watchErrorCountRef.current = 0;
      setMyCoords({ lat, lng, accuracy });
      setGpsError(null);

      const isDegraded = typeof accuracy === 'number' && accuracy > 150;
      setGpsStatus(isDegraded ? 'degraded' : 'watching');
      emitLocation(lat, lng, accuracy);
    },
    [emitLocation]
  );

  const handleGeoError = useCallback((err: GeolocationPositionError, fromWatch = false) => {
    if (fromWatch && hasCoordsRef.current && err.code === err.TIMEOUT) {
      return;
    }

    watchErrorCountRef.current += 1;

    if (err.code === err.PERMISSION_DENIED) {
      const { status, message } = geoErrorMessage(err.code);
      setGpsStatus(status);
      setGpsError(message);
      return;
    }

    if (fromWatch && watchErrorCountRef.current < 4 && !hasCoordsRef.current) {
      setGpsStatus('requesting');
      setGpsError('위치 확인 중… (PC는 Wi-Fi·IP 기반 위치를 사용합니다)');
      return;
    }

    const { status, message } = geoErrorMessage(err.code);
    setGpsStatus(status);
    setGpsError(message);
  }, []);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (nativeWatchCleanupRef.current) {
      nativeWatchCleanupRef.current();
      nativeWatchCleanupRef.current = null;
    }
  }, []);

  const startWatch = useCallback(
    (options: PositionOptions) => {
      clearWatch();
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        (err) => handleGeoError(err, true),
        options
      );
    },
    [clearWatch, handlePosition, handleGeoError]
  );

  const startGpsWatch = useCallback(() => {
    // 네이티브 앱(Capacitor): 화면이 꺼져도 동작하는 백그라운드 워처 우선 사용
    if (isNativeApp() && !nativeWatchCleanupRef.current) {
      setGpsStatus('requesting');
      setGpsError('네이티브 위치 권한을 확인하는 중…');
      startNativeBackgroundWatch(
        (lat, lng, accuracy) => {
          hasCoordsRef.current = true;
          watchErrorCountRef.current = 0;
          setMyCoords({ lat, lng, accuracy });
          setGpsError(null);
          setGpsStatus(typeof accuracy === 'number' && accuracy > 150 ? 'degraded' : 'watching');
          emitLocation(lat, lng, accuracy);
        },
        (message) => {
          setGpsStatus('error');
          setGpsError(message);
        }
      ).then((cleanup) => {
        if (cleanup) {
          nativeWatchCleanupRef.current = cleanup;
        } else {
          // 네이티브 워처 시작 실패 → 웹 geolocation 경로로 폴백
          startWebGpsWatchRef.current?.();
        }
      });
      return;
    }

    startWebGpsWatchRef.current?.();
  }, [emitLocation]);

  // 기존 웹(PWA) geolocation 경로 — 네이티브 폴백을 위해 ref로 분리
  const startWebGpsWatchRef = useRef<(() => void) | null>(null);
  const startWebGpsWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      setGpsError('이 브라우저는 위치 기능을 지원하지 않습니다.');
      return;
    }

    geoAttemptRef.current += 1;
    watchErrorCountRef.current = 0;
    setGpsStatus('requesting');
    setGpsError('위치 확인 중… 잠시만 기다려 주세요.');

    clearWatch();

    const tryAccurate = isLikelyMobile() && geoAttemptRef.current <= 2;
    const primaryOptions = tryAccurate ? GEO_ACCURATE : GEO_RELAXED;
    const fallbackOptions = GEO_RELAXED;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlePosition(position);
        startWatch(primaryOptions);
      },
      (firstErr) => {
        if (firstErr.code === firstErr.PERMISSION_DENIED) {
          handleGeoError(firstErr, false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            handlePosition(position);
            startWatch(fallbackOptions);
          },
          (secondErr) => {
            if (tryAccurate && secondErr.code !== secondErr.PERMISSION_DENIED) {
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  handlePosition(position);
                  startWatch(GEO_RELAXED);
                },
                (thirdErr) => handleGeoError(thirdErr, false),
                GEO_RELAXED
              );
              startWatch(GEO_RELAXED);
              return;
            }
            handleGeoError(secondErr, false);
            startWatch(fallbackOptions);
          },
          fallbackOptions
        );
      },
      primaryOptions
    );
  }, [clearWatch, handlePosition, handleGeoError, startWatch]);

  // 네이티브 경로에서 폴백할 수 있도록 웹 watch 함수를 ref에 연결
  useEffect(() => {
    startWebGpsWatchRef.current = startWebGpsWatch;
  }, [startWebGpsWatch]);

  const requestGpsPermission = useCallback(() => {
    hasCoordsRef.current = false;
    geoAttemptRef.current = 0;
    startGpsWatch();
  }, [startGpsWatch]);

  // Socket connection + room join
  useEffect(() => {
    if (!enabled || !roomId || !userId) return;

    const socket = getLocationSocket();

    const onConnect = () => {
      setIsSocketConnected(true);
      socket.emit('join-room', { roomId, userId }, (res: { error?: string; success?: boolean }) => {
        if (res?.error) {
          console.warn('join-room failed:', res.error);
        } else {
          joinedRoomRef.current = roomId;
        }
      });
    };

    const onDisconnect = () => setIsSocketConnected(false);

    const onLocationUpdated = (payload: LocationUpdatedPayload) => {
      onLocationUpdatedRef.current?.(payload);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('location-updated', onLocationUpdated);

    if (socket.connected) {
      onConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('location-updated', onLocationUpdated);
    };
  }, [enabled, roomId, userId]);

  useEffect(() => {
    if (!enabled || !roomId || !userId) return;
    const socket = getLocationSocket();
    if (!socket.connected) return;

    if (joinedRoomRef.current !== roomId) {
      socket.emit('join-room', { roomId, userId }, (res: { error?: string }) => {
        if (!res?.error) joinedRoomRef.current = roomId;
      });
    }
  }, [enabled, roomId, userId]);

  useEffect(() => {
    if (!enabled) {
      setGpsStatus('idle');
      return;
    }

    const timer = setTimeout(() => startGpsWatch(), 400);

    return () => {
      clearTimeout(timer);
      clearWatch();
    };
  }, [enabled, roomId, userId, startGpsWatch, clearWatch]);

  // DeviceMotion 만보기 활성화 함수
  const startPedometer = useCallback(() => {
    if (pedometerCleanupRef.current) return; // 이미 실행 중

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      const now = Date.now();

      // 임계값 상향 통과 + 쿨다운 후 걸음 카운트
      if (mag > STEP_THRESHOLD && stepMagnitudeRef.current <= STEP_THRESHOLD &&
          now - stepLastTimeRef.current > STEP_COOLDOWN_MS) {
        stepLastTimeRef.current = now;
        setStepsToday(prev => {
          const todayStr = pedometerTodayStr();
          let currentSteps = prev;

          // 자정 날짜 변경(롤오버) 감지 및 이전 기록 아카이빙
          try {
            const raw = localStorage.getItem('aemang_steps_today');
            if (raw) {
              const d = JSON.parse(raw);
              if (d && d.date && d.date !== todayStr) {
                const phoneDigits = (userId || '').replace(/\D/g, '') || 'guest';
                const hKey = `aemang_pedometer_history_${phoneDigits}`;
                const storedHistory = localStorage.getItem(hKey);
                let historyList: any[] = [];
                if (storedHistory) {
                  try { historyList = JSON.parse(storedHistory); } catch {}
                }
                const found = historyList.find(r => r.date === d.date);
                if (!found) {
                  historyList.push({ date: d.date, steps: Number(d.steps) || 0 });
                  historyList.sort((a, b) => b.date.localeCompare(a.date));
                  if (historyList.length > 365) {
                    historyList = historyList.slice(0, 365);
                  }
                  localStorage.setItem(hKey, JSON.stringify(historyList));
                }
                currentSteps = 0;
              }
            }
          } catch (e) {
            console.error('Pedometer rollover error:', e);
          }

          const next = currentSteps + 1;
          saveStepsToday(next);
          // 50걸음마다 혹은 자정 리셋 후 첫 걸음 시점에 서버 동기화
          if (next % 50 === 0 || next === 1) {
            fetch('/api/friends/pedometer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: userId, pedometerEnabled: true, stepsToday: next, roomId }),
            }).catch(() => {});
          }
          return next;
        });
      }
      stepMagnitudeRef.current = mag;
    };

    window.addEventListener('devicemotion', handleMotion, true);
    setPedometerAvailable(true);
    pedometerCleanupRef.current = () => window.removeEventListener('devicemotion', handleMotion, true);
  }, [userId, roomId]);

  const requestPedometerPermission = useCallback(async (): Promise<boolean> => {
    // iOS 13+ 권한 요청
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const result = await (DeviceMotionEvent as any).requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }

    // DeviceMotion 지원 여부 확인
    if (!window.DeviceMotionEvent) {
      setPedometerAvailable(false);
      return false;
    }

    startPedometer();
    return true;
  }, [startPedometer]);

  // 앱 시작 시 Android / PC 에서 자동 활성화 시도 (권한 필요 없음)
  useEffect(() => {
    if (!enabled) return;
    if (typeof (DeviceMotionEvent as any).requestPermission !== 'function' && window.DeviceMotionEvent) {
      startPedometer();
    }
    return () => {
      if (pedometerCleanupRef.current) {
        pedometerCleanupRef.current();
        pedometerCleanupRef.current = null;
      }
    };
  }, [enabled, startPedometer]);

  return {
    isSocketConnected,
    gpsStatus,
    gpsError,
    myCoords,
    lastSentAt,
    requestGpsPermission,
    stepsToday,
    pedometerAvailable,
    requestPedometerPermission,
  };
}
