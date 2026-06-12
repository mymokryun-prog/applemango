/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { Friend, Appointment } from '../types';
import { Search, Loader2, X, MapPin, Crosshair } from 'lucide-react';

declare global {
  interface Window {
    kakao: any;
  }
}

interface MapComponentProps {
  friends: Friend[];
  appointments: Appointment[];
  activeProfileId: string;
  selectedFriendId: string | null;
  selectedPromiseId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  tempPromiseCoords: [number, number] | null;
  mapViewCoords?: [number, number] | null;
  isPersonalRoom?: boolean;
  myGpsCoords?: [number, number] | null;
  centerOnMyGpsOnce?: boolean;
  onMyGpsCentered?: () => void;
  onUpdateStatusMsg?: (id: string, text: string) => void;
}

interface PlaceResult { name: string; address: string; lat: number; lng: number; }

const getFruitColor = (fruitEmoji: string): string => {
  switch (fruitEmoji) {
    case '🍎': return '#EF4444'; // Red
    case '🥭': return '#F59E0B'; // Mango
    case '🍊': return '#F97316'; // Orange
    case '🍋': return '#EAB308'; // Yellow
    case '🍇': return '#8B5CF6'; // Purple
    case '🍓': return '#EC4899'; // Pink
    case '🫐': return '#3B82F6'; // Blue
    case '🍑': return '#F472B6'; // Peach Pink
    case '🍉': return '#10B981'; // Green
    case '🍍': return '#F59E0B'; // Gold
    case '🍒': return '#F43F5E'; // Cherry Red
    case '🥝': return '#84CC16'; // Kiwi Green
    case '🍈': return '#22C55E'; // Melon Green
    default: return '#F43F5E'; // rose-500 (유효한 HEX — 잘못된 값이면 선이 안 그려짐)
  }
};

// ─── 마커 HTML ───────────────────────────────────────────────────────────────
function renderAvatar(avatarString: string): string {
  if (avatarString && avatarString.startsWith('data:image/')) {
    return `<img src="${avatarString}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block" />`;
  }
  return avatarString || '👤';
}

function friendMarkerHtml(friend: Friend, isSelected: boolean, isMe: boolean): string {
  if (isMe) {
    const ring = isSelected ? 'outline:3px solid #111;outline-offset:2px;transform:scale(1.18)' : '';
    const currentMsg = friend.statusMsg || '상태메시지 입력';
    const statusSnippet = `<div onclick="window.editMyStatusMsg()" style="background:#fff;color:#374151;font-size:7px;font-weight:600;border:1px solid #E5E7EB;border-radius:5px;padding:1px 4px;margin-bottom:2px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif;cursor:pointer">${currentMsg.slice(0, 9)}${currentMsg.length > 9 ? '…' : ''}</div>`;

    return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
      ${statusSnippet}
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:22px;filter:drop-shadow(0 0 5px #39FF14) drop-shadow(0 0 9px #39FF14);${ring};z-index:5">
        ${renderAvatar(friend.avatar)}
        <div style="position:absolute;bottom:-8px;right:-10px;background:#3B82F6;color:#fff;font-size:7px;font-weight:900;padding:1.5px 3.5px;border-radius:6px;line-height:1;border:1px solid #111;z-index:10;filter:none">나</div>
      </div>
      <div style="background:#fff;border:1px solid #D1D5DB;color:#111;font-size:7px;font-weight:600;padding:1px 5px;border-radius:4px;margin-top:5px;white-space:nowrap;font-family:sans-serif">${friend.name.replace(' (합류)', '').replace(' (대기)', '').split(' ')[0]}${friend.speed > 0 ? ` ·${Math.round(friend.speed)}k` : ''}</div>
    </div>`;
  }

  const isOffline = friend.isOnline === false;
  // 로그아웃/앱종료(오프라인) 친구는 마지막 위치에 고정 표시 — 어둡게 + 굵은 검정 테두리
  const markerBg = isOffline ? '#4B5563' : friend.color;
  const ring = isSelected ? 'outline:3px solid #111;outline-offset:2px;transform:scale(1.18)' : '';
  const border = isOffline ? 'border:3px solid #000' : 'border:2px solid #39FF14;box-shadow:0 0 6px #39FF14';
  const hrBadge = friend.heartRate
    ? `<div style="position:absolute;top:-4px;left:-10px;background:#EF4444;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2">♥${friend.heartRate}</div>`
    : '';
  const statusSnippet = friend.statusMsg
    ? `<div style="background:#fff;color:#374151;font-size:7px;font-weight:600;border:1px solid #E5E7EB;border-radius:5px;padding:1px 4px;margin-bottom:2px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${friend.statusMsg.slice(0, 9)}${friend.statusMsg.length > 9 ? '…' : ''}</div>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    ${statusSnippet}
    <div style="position:relative;width:28px;height:28px;background:${markerBg};${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;${ring};overflow:hidden">
      ${renderAvatar(friend.avatar)}
      ${hrBadge}
      <div style="position:absolute;bottom:-4px;right:-7px;background:#1F2937;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2;z-index:2">${friend.battery}%</div>
      <div style="position:absolute;top:0;right:0;width:8px;height:8px;background:${friend.isOnline ? '#34D399' : '#9CA3AF'};border:1.5px solid #fff;border-radius:50%;z-index:2"></div>
    </div>
    <div style="background:#fff;border:1px solid #D1D5DB;color:#111;font-size:7px;font-weight:600;padding:1px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:sans-serif">${friend.name.split(' ')[0]}${friend.speed > 0 ? ` ·${Math.round(friend.speed)}k` : ''}</div>
  </div>`;
}

function appointmentMarkerHtml(app: Appointment): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div style="font-size:28px;line-height:1.2;display:flex;align-items:center;justify-content:center">🚩</div>
    <div style="background:#111;color:#FDE68A;font-size:9px;font-weight:900;padding:2px 6px;border-radius:5px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${app.title.length > 9 ? app.title.slice(0, 9) + '…' : app.title}</div>
  </div>`;
}

function tempPromiseMarkerHtml(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;animation:bounce 1s infinite;cursor:pointer">
    <div style="font-size:26px;line-height:1.2;display:flex;align-items:center;justify-content:center">🚩</div>
    <div style="background:#111;color:#FCA5A5;font-size:8px;font-weight:900;padding:1px 5px;border-radius:4px;margin-top:2px;font-family:sans-serif">여기 소집</div>
  </div>`;
}

function viewMarkerHtml(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div style="width:30px;height:30px;background:#2563EB;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:2px 2px 0 #111">📍</div>
    <div style="background:#111;color:#BFDBFE;font-size:8px;font-weight:900;padding:1px 5px;border-radius:4px;margin-top:2px;font-family:sans-serif">검색 위치</div>
  </div>`;
}

function realDotHtml(): string {
  return `<div style="width:10px;height:10px;background:#111827;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #111"></div>`;
}

// 같은 위치(겹침) 마커를 옆으로 분산 배치 — 실제 위치는 dot, 이모티콘은 offset 위치
function computeSpread<T extends { lat: number; lng: number; color?: string }>(items: T[]) {
  const groups: Array<{ centerLat: number; centerLng: number; members: T[] }> = [];
  const threshold = 0.00045; // 약 50미터 반경 내의 친구들을 그룹화

  items.forEach(it => {
    const foundGroup = groups.find(g => {
      const dLat = Math.abs(g.centerLat - it.lat);
      const dLng = Math.abs(g.centerLng - it.lng);
      return dLat < threshold && dLng < threshold;
    });

    if (foundGroup) {
      foundGroup.members.push(it);
      // 그룹 중심 갱신
      foundGroup.centerLat = foundGroup.members.reduce((sum, m) => sum + m.lat, 0) / foundGroup.members.length;
      foundGroup.centerLng = foundGroup.members.reduce((sum, m) => sum + m.lng, 0) / foundGroup.members.length;
    } else {
      groups.push({ centerLat: it.lat, centerLng: it.lng, members: [it] });
    }
  });

  const out: Array<T & { dLat: number; dLng: number; grouped: boolean; gLat: number; gLng: number }> = [];
  groups.forEach(group => {
    const n = group.members.length;
    const anchorLat = group.centerLat;
    const anchorLng = group.centerLng;

    group.members.forEach((it, i) => {
      if (n === 1) {
        out.push({ ...it, dLat: it.lat, dLng: it.lng, grouped: false, gLat: it.lat, gLng: it.lng });
      } else {
        // 부채꼴 형태로 반사하여 고르게 펼쳐 배치
        // 짝수 인덱스는 0.00012(약 13m), 홀수 인덱스는 0.00020(약 22m)으로 분산시켜 꼬리 길이는 대폭 줄이고 겹침 방지
        const radius = (i % 2 === 0) ? 0.00012 : 0.00020;
        let angle = Math.PI / 2; // 기본 90도 (위)
        if (n > 1) {
          const minAngle = Math.PI / 6; // 30도
          const maxAngle = 5 * Math.PI / 6; // 150도
          angle = minAngle + (i / (n - 1)) * (maxAngle - minAngle);
        }
        const dLat = anchorLat + radius * Math.sin(angle);
        const dLng = anchorLng + radius * Math.cos(angle) * 1.25; // 위도 차이 보정을 위한 1.25 배율
        out.push({ ...it, dLat, dLng, grouped: true, gLat: anchorLat, gLng: anchorLng });
      }
    });
  });
  return out;
}

function selfMarkerHtml(myProfile: { avatar: string; color: string; name: string; statusMsg?: string }): string {
  const currentMsg = myProfile.statusMsg || '상태메시지 입력';
  const statusSnippet = `<div onclick="window.editMyStatusMsg()" style="background:#fff;color:#374151;font-size:7px;font-weight:600;border:1px solid #E5E7EB;border-radius:5px;padding:1px 4px;margin-bottom:2px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif;cursor:pointer">${currentMsg.slice(0, 9)}${currentMsg.length > 9 ? '…' : ''}</div>`;

  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    ${statusSnippet}
    <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:22px;filter:drop-shadow(0 0 5px #39FF14) drop-shadow(0 0 9px #39FF14);z-index:5">
      ${renderAvatar(myProfile.avatar)}
      <div style="position:absolute;bottom:-8px;right:-10px;background:#3B82F6;color:#fff;font-size:7px;font-weight:900;padding:1.5px 3.5px;border-radius:6px;line-height:1;border:1px solid #111;z-index:10;filter:none">나</div>
    </div>
  </div>`;
}

export default function MapComponent({
  friends, appointments, activeProfileId,
  selectedFriendId, selectedPromiseId,
  onMapClick, tempPromiseCoords, mapViewCoords = null, isPersonalRoom = false,
  myGpsCoords = null, centerOnMyGpsOnce = false, onMyGpsCentered,
  onUpdateStatusMsg,
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // 지도 검색 결과 '보기'용 좌표 — 컴포넌트가 지도 탭 진입마다 새로 마운트되어 자동 초기화됨(약속 연동 아님)
  const [searchFocusCoords, setSearchFocusCoords] = useState<[number, number] | null>(null);

  // ─── Kakao Map State & Refs ───────────────────────────────────────────────
  const [isKakaoReady, setIsKakaoReady] = useState(false);
  const [useFallbackMap, setUseFallbackMap] = useState(false);
  const kakaoMapInstanceRef = useRef<any>(null);
  const kakaoOverlaysRef = useRef<any[]>([]);
  const kakaoPolylinesRef = useRef<any[]>([]);
  const kakaoMyMarkerRef = useRef<any>(null);

  // ─── Leaflet Map Refs ──────────────────────────────────────────────────────
  const leafletMapInstanceRef = useRef<L.Map | null>(null);
  const leafletMarkerGroupRef = useRef<L.LayerGroup | null>(null);
  const leafletPolyGroupRef = useRef<L.LayerGroup | null>(null);
  const leafletMyMarkerRef = useRef<L.Marker | L.CircleMarker | null>(null);

  // ─── Search States ────────────────────────────────────────────────────────
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 소집 장소 지정 모드 ──────────────────────────────────────────────────
  // 지도를 실수로 눌러 좌표가 찍히는 것을 막기 위해, 버튼을 눌러 선택 모드일 때만 터치로 좌표를 지정한다.
  const [placeSelectMode, setPlaceSelectMode] = useState(false);
  const placeSelectModeRef = useRef(false);
  useEffect(() => { placeSelectModeRef.current = placeSelectMode; }, [placeSelectMode]);

  // ===== 🚌 실시간 버스 위치 레이어 (국토교통부 TAGO) =====
  const [busPanelOpen, setBusPanelOpen] = useState(false);
  const [busCities, setBusCities] = useState<Array<{ cityCode: string; cityName: string }>>([]);
  const [busCityCode, setBusCityCode] = useState<string>(() => {
    try { return localStorage.getItem('aemang_bus_city') || ''; } catch { return ''; }
  });
  const [busRouteNo, setBusRouteNo] = useState('');
  const [busRoutes, setBusRoutes] = useState<Array<{ routeId: string; routeNo: string; routeType: string; start: string; end: string }>>([]);
  const [busSearching, setBusSearching] = useState(false);
  const [busTracking, setBusTracking] = useState<{ routeId: string; routeNo: string } | null>(null);
  const [busLocations, setBusLocations] = useState<Array<{ lat: number; lng: number; vehicleNo: string; nodeName: string }>>([]);
  const [busError, setBusError] = useState<string | null>(null);
  const busKakaoOverlaysRef = useRef<any[]>([]);
  const busLeafletMarkersRef = useRef<L.Marker[]>([]);

  // 최근 추적한 노선 (원탭 재추적) — 전체 노선 목록 로딩 대신 트래픽 효율적인 방식
  const [busRecent, setBusRecent] = useState<Array<{ cityCode: string; routeId: string; routeNo: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('aemang_bus_recent') || '[]'); } catch { return []; }
  });
  const saveBusRecent = (entry: { cityCode: string; routeId: string; routeNo: string }) => {
    setBusRecent(prev => {
      const next = [entry, ...prev.filter(r => r.routeId !== entry.routeId)].slice(0, 6);
      try { localStorage.setItem('aemang_bus_recent', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const startBusTracking = (entry: { cityCode: string; routeId: string; routeNo: string }) => {
    if (entry.cityCode !== busCityCode) setBusCityCode(entry.cityCode);
    try { localStorage.setItem('aemang_bus_city', entry.cityCode); } catch {}
    saveBusRecent(entry);
    setBusTracking({ routeId: entry.routeId, routeNo: entry.routeNo });
    setBusPanelOpen(false);
  };

  // 도시 목록 로드 (패널 처음 열 때)
  useEffect(() => {
    if (!busPanelOpen || busCities.length > 0) return;
    fetch('/api/bus/cities')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setBusCities(data);
        else setBusError(data?.error || '도시 목록을 불러오지 못했습니다.');
      })
      .catch(() => setBusError('도시 목록을 불러오지 못했습니다. (서버 BUS_API_KEY 확인)'));
  }, [busPanelOpen, busCities.length]);

  const handleBusRouteSearch = async () => {
    if (!busCityCode || !busRouteNo.trim()) { setBusError('도시와 버스 번호를 입력해 주세요.'); return; }
    setBusSearching(true);
    setBusError(null);
    setBusRoutes([]);
    try {
      localStorage.setItem('aemang_bus_city', busCityCode);
      const res = await fetch(`/api/bus/routes?cityCode=${encodeURIComponent(busCityCode)}&routeNo=${encodeURIComponent(busRouteNo.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '검색 실패');
      if (!Array.isArray(data) || data.length === 0) setBusError('해당 번호의 노선을 찾지 못했습니다.');
      else setBusRoutes(data.slice(0, 8));
    } catch (e: any) {
      setBusError(e?.message || '노선 검색에 실패했습니다.');
    }
    setBusSearching(false);
  };

  // 선택 노선 실시간 위치 폴링 (15초)
  useEffect(() => {
    if (!busTracking || !busCityCode) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/bus/locations?cityCode=${encodeURIComponent(busCityCode)}&routeId=${encodeURIComponent(busTracking.routeId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setBusError(data?.error || '버스 위치 조회 실패'); return; }
        setBusError(null);
        setBusLocations(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setBusError('버스 위치 조회 실패 (네트워크)');
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [busTracking, busCityCode]);

  // 버스 마커 렌더링 (카카오/Leaflet 양쪽 지원)
  useEffect(() => {
    // 기존 마커 제거
    busKakaoOverlaysRef.current.forEach(o => { try { o.setMap(null); } catch {} });
    busKakaoOverlaysRef.current = [];
    busLeafletMarkersRef.current.forEach(m => { try { m.remove(); } catch {} });
    busLeafletMarkersRef.current = [];

    if (!busTracking || busLocations.length === 0) return;

    const busHtml = (b: { vehicleNo: string; nodeName: string }) =>
      `<div style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif">
        <div style="background:#0EA5E9;color:#fff;font-size:10px;font-weight:900;padding:2px 6px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.35);white-space:nowrap">🚌 ${busTracking.routeNo}</div>
        <div style="background:#fff;color:#334155;font-size:8px;font-weight:700;padding:1px 4px;border-radius:4px;margin-top:2px;box-shadow:0 1px 2px rgba(0,0,0,0.2);white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis">${b.nodeName || b.vehicleNo}</div>
      </div>`;

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      busLocations.forEach(b => {
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(b.lat, b.lng),
          content: busHtml(b),
          yAnchor: 0.5,
          zIndex: 4,
        });
        overlay.setMap(kakaoMapInstanceRef.current);
        busKakaoOverlaysRef.current.push(overlay);
      });
    } else if (leafletMapInstanceRef.current) {
      busLocations.forEach(b => {
        const marker = L.marker([b.lat, b.lng], {
          icon: L.divIcon({ className: '', html: busHtml(b), iconSize: [0, 0] }),
          interactive: false,
        });
        marker.addTo(leafletMapInstanceRef.current!);
        busLeafletMarkersRef.current.push(marker);
      });
    }
  }, [busLocations, busTracking, isKakaoReady, useFallbackMap]);

  const stopBusTracking = () => {
    setBusTracking(null);
    setBusLocations([]);
    setBusRoutes([]);
  };
  // 지도 클릭 리스너는 1회만 등록되므로 최신 onMapClick을 ref로 참조(stale 클로저 방지)
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // Expose global editMyStatusMsg function for clicking on status bubble
  useEffect(() => {
    (window as any).editMyStatusMsg = () => {
      const myProfile = friends.find(f => f.id === activeProfileId) || {
        statusMsg: localStorage.getItem('aemang_status') || '애플망고톡 시작! 🍎🥭'
      };
      const newMsg = prompt('새로운 상태 메시지를 입력하세요:', myProfile.statusMsg || '');
      if (newMsg !== null) {
        onUpdateStatusMsg?.(activeProfileId, newMsg.trim());
      }
    };
    return () => {
      delete (window as any).editMyStatusMsg;
    };
  }, [friends, activeProfileId, onUpdateStatusMsg]);

  // ─── 1. 카카오맵 SDK 동적 로드 ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        const key = data.kakaoMapKey;
        if (!key) {
          console.warn('Kakao Map Key not found in config, using Leaflet fallback.');
          setUseFallbackMap(true);
          return;
        }

        if (window.kakao && window.kakao.maps) {
          setIsKakaoReady(true);
          return;
        }

        const scriptId = 'kakao-map-sdk';
        let script = document.getElementById(scriptId) as HTMLScriptElement;
        if (!script) {
          script = document.createElement('script');
          script.id = scriptId;
          script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`;
          script.async = true;
          document.head.appendChild(script);
        }

        script.onload = () => {
          if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
              setIsKakaoReady(true);
            });
          } else {
            console.warn('Kakao Maps load failed, falling back to Leaflet.');
            setUseFallbackMap(true);
          }
        };

        script.onerror = () => {
          console.warn('Kakao Maps Script load error, falling back to Leaflet.');
          setUseFallbackMap(true);
        };
      })
      .catch(err => {
        console.error('Error fetching Kakao Config:', err);
        setUseFallbackMap(true);
      });
  }, []);

  // ─── 2. 지도 초기화 (카카오맵 vs Leaflet) ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    if (isKakaoReady && !useFallbackMap) {
      // 카카오 맵 초기화
      try {
        const container = mapRef.current;
        // 접속자 본인 GPS 위치를 우선 중심으로 (없으면 홍대입구 기본값)
        const options = {
          center: new window.kakao.maps.LatLng(myGpsCoords?.[0] ?? 37.5565, myGpsCoords?.[1] ?? 126.9242),
          level: 4,
        };
        const map = new window.kakao.maps.Map(container, options);
        
        // 줌 제어기 추가
        const zoomControl = new window.kakao.maps.ZoomControl();
        map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);

        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          if (!placeSelectModeRef.current) return; // 선택 모드일 때만 좌표 지정
          const latlng = mouseEvent.latLng;
          onMapClickRef.current(latlng.getLat(), latlng.getLng());
          setPlaceSelectMode(false);
        });

        kakaoMapInstanceRef.current = map;
      } catch (err) {
        console.error('Error initializing Kakao Map:', err);
        setUseFallbackMap(true);
      }
    } else if (useFallbackMap) {
      // Leaflet 초기화 (기존 VWorld 폴백)
      if (leafletMapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        center: myGpsCoords || [37.5565, 126.9242],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
      });

      const vworld = L.tileLayer(
        'https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png',
        { maxZoom: 19, errorTileUrl: '' }
      );

      const carto = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, subdomains: 'abcd' }
      );

      vworld.on('tileerror', () => {
        if (leafletMapInstanceRef.current) {
          leafletMapInstanceRef.current.removeLayer(vworld);
          carto.addTo(leafletMapInstanceRef.current);
        }
      });
      vworld.addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!placeSelectModeRef.current) return; // 선택 모드일 때만 좌표 지정
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
        setPlaceSelectMode(false);
      });

      leafletMapInstanceRef.current = map;
      leafletMarkerGroupRef.current = L.layerGroup().addTo(map);
      leafletPolyGroupRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      // 정리
      if (leafletMapInstanceRef.current) {
        leafletMapInstanceRef.current.remove();
        leafletMapInstanceRef.current = null;
      }
      kakaoMapInstanceRef.current = null;
    };
  }, [isKakaoReady, useFallbackMap]);

  // 멤버(친구+나) 유효 좌표 목록 — 친구끼리 점선 연결용. 수락 대기 중인 초대는 제외.
  const getMemberPositions = (): { lat: number; lng: number }[] => {
    const positions: { lat: number; lng: number }[] = [];
    friends.forEach(f => {
      if (f.isPendingInvite) return;
      const lat = f.id === activeProfileId && myGpsCoords ? myGpsCoords[0] : f.lat;
      const lng = f.id === activeProfileId && myGpsCoords ? myGpsCoords[1] : f.lng;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        positions.push({ lat, lng });
      }
    });
    return positions;
  };

  // ─── 3. 마커 및 선 그리기 (카카오맵 / Leaflet 동시 분기) ───────────────────
  useEffect(() => {
    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const map = kakaoMapInstanceRef.current;
      
      // 기존 오버레이 및 경로선 초기화
      kakaoOverlaysRef.current.forEach(o => o.setMap(null));
      kakaoOverlaysRef.current = [];
      kakaoPolylinesRef.current.forEach(p => p.setMap(null));
      kakaoPolylinesRef.current = [];

      // 3-1. 친구 경로 그리기
      friends.forEach(f => {
        if (!f.route || f.route.length < 2) return;
        const validRoute = f.route.filter(coord => 
          coord && typeof coord[0] === 'number' && typeof coord[1] === 'number' && !isNaN(coord[0]) && !isNaN(coord[1])
        );
        if (validRoute.length < 2) return;

        const path = validRoute.map(coord => new window.kakao.maps.LatLng(coord[0], coord[1]));
        const polyline = new window.kakao.maps.Polyline({
          path,
          // 개인방: 내 전체 이동경로를 옅게 표시
          strokeWeight: isPersonalRoom ? 3 : (selectedFriendId === f.id ? 4 : 2.5),
          strokeColor: f.color || '#3B82F6',
          strokeOpacity: isPersonalRoom ? 0.3 : (selectedFriendId === f.id ? 0.9 : 0.45),
          strokeStyle: 'solid',
        });
        polyline.setMap(map);
        kakaoPolylinesRef.current.push(polyline);
      });

      // 3-2a. 친구끼리 점선 연결 (멤버 간 네트워크)
      const memberPositions = getMemberPositions();
      for (let i = 0; i < memberPositions.length; i++) {
        for (let j = i + 1; j < memberPositions.length; j++) {
          const dashLine = new window.kakao.maps.Polyline({
            path: [
              new window.kakao.maps.LatLng(memberPositions[i].lat, memberPositions[i].lng),
              new window.kakao.maps.LatLng(memberPositions[j].lat, memberPositions[j].lng),
            ],
            strokeWeight: 1.5,
            strokeColor: '#64748b',
            strokeOpacity: 0.5,
            strokeStyle: 'shortdash',
          });
          dashLine.setMap(map);
          kakaoPolylinesRef.current.push(dashLine);
        }
      }

      // 3-2b. 약속 장소 연결선 — 선택된 약속(또는 약속이 1개뿐일 때)만 굵은 실선
      const appsToConnect = selectedPromiseId
        ? appointments.filter(a => a.id === selectedPromiseId)
        : (appointments.length === 1 ? appointments : []);
      appsToConnect.forEach(app => {
        if (typeof app.lat !== 'number' || typeof app.lng !== 'number' || isNaN(app.lat) || isNaN(app.lng)) return;

        friends.forEach(f => {
          if (f.isPendingInvite) return;
          const lat = f.id === activeProfileId && myGpsCoords ? myGpsCoords[0] : f.lat;
          const lng = f.id === activeProfileId && myGpsCoords ? myGpsCoords[1] : f.lng;

          if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;

          const isMe = f.id === activeProfileId;
          const fruitColor = isMe && f.avatar ? getFruitColor(f.avatar) : (f.color || '#3B82F6');

          const polyline = new window.kakao.maps.Polyline({
            path: [new window.kakao.maps.LatLng(lat, lng), new window.kakao.maps.LatLng(app.lat, app.lng)],
            strokeWeight: 5,
            strokeColor: fruitColor,
            strokeOpacity: 0.95,
            strokeStyle: 'solid',
          });
          polyline.setMap(map);
          kakaoPolylinesRef.current.push(polyline);
        });
      });

      // 3-2.5. 임시 핀 연결선 그리기 (내 위치에서 임시 핀까지 과일색 실선)
      // 내 위치는 myGpsCoords로 이미 알고 있으므로, friends 목록에 내가 없어도 항상 그린다.
      const me = friends.find(f => f.id === activeProfileId);
      const myLat = myGpsCoords ? myGpsCoords[0] : (me ? me.lat : null);
      const myLng = myGpsCoords ? myGpsCoords[1] : (me ? me.lng : null);
      if (tempPromiseCoords && myLat && myLng && typeof tempPromiseCoords[0] === 'number' && typeof tempPromiseCoords[1] === 'number' && !isNaN(tempPromiseCoords[0]) && !isNaN(tempPromiseCoords[1])) {
        const fruitColor = getFruitColor(me?.avatar || localStorage.getItem('aemang_fruit') || '🍎');
        const tempPolyline = new window.kakao.maps.Polyline({
          path: [new window.kakao.maps.LatLng(myLat, myLng), new window.kakao.maps.LatLng(tempPromiseCoords[0], tempPromiseCoords[1])],
          strokeWeight: 4.5,
          strokeColor: fruitColor,
          strokeOpacity: 0.95,
          strokeStyle: 'solid',
        });
        tempPolyline.setMap(map);
        kakaoPolylinesRef.current.push(tempPolyline);
      }

      // 3-3. 약속 마커 그리기
      appointments.forEach(app => {
        if (typeof app.lat !== 'number' || typeof app.lng !== 'number' || isNaN(app.lat) || isNaN(app.lng)) return;

        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(app.lat, app.lng),
          content: appointmentMarkerHtml(app),
          yAnchor: 1.0
        });
        overlay.setMap(map);
        kakaoOverlaysRef.current.push(overlay);
      });

      // 3-4. 임시 핀 마커 그리기
      if (tempPromiseCoords && typeof tempPromiseCoords[0] === 'number' && typeof tempPromiseCoords[1] === 'number' && !isNaN(tempPromiseCoords[0]) && !isNaN(tempPromiseCoords[1])) {
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(tempPromiseCoords[0], tempPromiseCoords[1]),
          content: tempPromiseCoords ? tempPromiseMarkerHtml() : '',
          yAnchor: 1.0
        });
        overlay.setMap(map);
        kakaoOverlaysRef.current.push(overlay);
      }

      // 3-4.5. 보기용 좌표(맛집/검색) 마커+실선 — 지도 나가면 사라짐
      const viewCoords = searchFocusCoords || mapViewCoords;
      if (viewCoords && typeof viewCoords[0] === 'number' && !isNaN(viewCoords[0])) {
        if (myLat && myLng) {
          const fruitColor = getFruitColor(me?.avatar || localStorage.getItem('aemang_fruit') || '🍎');
          const line = new window.kakao.maps.Polyline({
            path: [new window.kakao.maps.LatLng(myLat, myLng), new window.kakao.maps.LatLng(viewCoords[0], viewCoords[1])],
            strokeWeight: 4, strokeColor: fruitColor, strokeOpacity: 0.9, strokeStyle: 'solid',
          });
          line.setMap(map);
          kakaoPolylinesRef.current.push(line);
        }
        const vOverlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(viewCoords[0], viewCoords[1]),
          content: viewMarkerHtml(), yAnchor: 1.0
        });
        vOverlay.setMap(map);
        kakaoOverlaysRef.current.push(vOverlay);
      }

      // 3-5. 친구 마커 그리기
      const drawableFriends = friends.filter(f =>
        !(f.id === activeProfileId && myGpsCoords) &&
        typeof f.lat === 'number' && typeof f.lng === 'number' && !isNaN(f.lat) && !isNaN(f.lng)
      );
      const spread = computeSpread(drawableFriends);
      const dotDrawn = new Set<string>();
      spread.forEach(item => {
        if (item.grouped) {
          const key = `${item.gLat.toFixed(4)},${item.gLng.toFixed(4)}`;
          if (!dotDrawn.has(key)) {
            dotDrawn.add(key);
            const dot = new window.kakao.maps.CustomOverlay({
              position: new window.kakao.maps.LatLng(item.gLat, item.gLng),
              content: realDotHtml(), yAnchor: 0.5, xAnchor: 0.5, zIndex: 5,
            });
            dot.setMap(map);
            kakaoOverlaysRef.current.push(dot);
          }

          // 실제 위치(점)와 오프셋 마커(말풍선) 간의 실선(꼬리) 연결
          const stemLine = new window.kakao.maps.Polyline({
            path: [
              new window.kakao.maps.LatLng(item.gLat, item.gLng),
              new window.kakao.maps.LatLng(item.dLat, item.dLng)
            ],
            strokeWeight: 1.5,
            strokeColor: item.color || '#4B5563',
            strokeOpacity: 0.85,
            strokeStyle: 'solid',
          });
          stemLine.setMap(map);
          kakaoPolylinesRef.current.push(stemLine);
        }
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(item.dLat, item.dLng),
          content: friendMarkerHtml(item as Friend, selectedFriendId === item.id, item.id === activeProfileId),
          yAnchor: 1.0,
          zIndex: selectedFriendId === item.id ? 100 : 10
        });
        overlay.setMap(map);
        kakaoOverlaysRef.current.push(overlay);
      });

    } else if (useFallbackMap && leafletMapInstanceRef.current) {
      // Leaflet 마커/경로 업데이트 (기존 코드와 완벽히 동일)
      const map = leafletMapInstanceRef.current;
      const mg = leafletMarkerGroupRef.current;
      const pg = leafletPolyGroupRef.current;
      if (!map || !mg || !pg) return;

      mg.clearLayers();
      pg.clearLayers();

      const me = friends.find(f => f.id === activeProfileId);

      // 경로 선
      friends.forEach(f => {
        if (!f.route || f.route.length < 2) return;
        const validRoute = f.route.filter(coord => 
          coord && typeof coord[0] === 'number' && typeof coord[1] === 'number' && !isNaN(coord[0]) && !isNaN(coord[1])
        );
        if (validRoute.length < 2) return;
        
        const poly = L.polyline(validRoute as L.LatLngTuple[], {
          color: f.color,
          weight: isPersonalRoom ? 3 : (selectedFriendId === f.id ? 4 : 2),
          opacity: isPersonalRoom ? 0.3 : (selectedFriendId === f.id ? 0.85 : 0.4),
        });
        pg.addLayer(poly);
      });

      // 친구끼리 점선 연결 (멤버 간 네트워크)
      const memberPositionsL = getMemberPositions();
      for (let i = 0; i < memberPositionsL.length; i++) {
        for (let j = i + 1; j < memberPositionsL.length; j++) {
          const dash = L.polyline([
            [memberPositionsL[i].lat, memberPositionsL[i].lng],
            [memberPositionsL[j].lat, memberPositionsL[j].lng],
          ] as L.LatLngTuple[], {
            color: '#64748b',
            weight: 1.5,
            opacity: 0.5,
            dashArray: '6 6',
          });
          pg.addLayer(dash);
        }
      }

      // 약속 장소 연결선 — 선택된 약속(또는 약속이 1개뿐일 때)만 굵은 실선
      const appsToConnectL = selectedPromiseId
        ? appointments.filter(a => a.id === selectedPromiseId)
        : (appointments.length === 1 ? appointments : []);
      appsToConnectL.forEach(app => {
        if (typeof app.lat !== 'number' || typeof app.lng !== 'number' || isNaN(app.lat) || isNaN(app.lng)) return;

        friends.forEach(f => {
          if (f.isPendingInvite) return;
          const lat = f.id === activeProfileId && myGpsCoords ? myGpsCoords[0] : f.lat;
          const lng = f.id === activeProfileId && myGpsCoords ? myGpsCoords[1] : f.lng;

          if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;

          const isMe = f.id === activeProfileId;
          const fruitColor = isMe && f.avatar ? getFruitColor(f.avatar) : (f.color || '#3B82F6');

          const line = L.polyline([[lat, lng], [app.lat, app.lng]] as L.LatLngTuple[], {
            color: fruitColor,
            weight: 5,
            opacity: 0.95,
          });
          pg.addLayer(line);
        });
      });

      // 임시 핀 연결선 (내 위치에서 임시 핀까지 과일색 실선)
      // 내 위치는 myGpsCoords로 이미 알고 있으므로, friends 목록에 내가 없어도 항상 그린다.
      const myLatL = myGpsCoords ? myGpsCoords[0] : (me ? me.lat : null);
      const myLngL = myGpsCoords ? myGpsCoords[1] : (me ? me.lng : null);
      if (tempPromiseCoords && myLatL && myLngL && typeof tempPromiseCoords[0] === 'number' && typeof tempPromiseCoords[1] === 'number' && !isNaN(tempPromiseCoords[0]) && !isNaN(tempPromiseCoords[1])) {
        const fruitColor = getFruitColor(me?.avatar || localStorage.getItem('aemang_fruit') || '🍎');
        const tempLine = L.polyline([[myLatL, myLngL], tempPromiseCoords] as L.LatLngTuple[], {
          color: fruitColor,
          weight: 4,
          opacity: 0.9,
        });
        pg.addLayer(tempLine);
      }

      // 약속 마커
      appointments.forEach(app => {
        if (typeof app.lat !== 'number' || typeof app.lng !== 'number' || isNaN(app.lat) || isNaN(app.lng)) return;
        
        const icon = L.divIcon({
          className: '',
          html: appointmentMarkerHtml(app),
          iconSize: [40, 52],
          iconAnchor: [20, 48],
        });
        const m = L.marker([app.lat, app.lng], { icon });
        mg.addLayer(m);
      });

      // 임시 핀
      if (tempPromiseCoords && typeof tempPromiseCoords[0] === 'number' && typeof tempPromiseCoords[1] === 'number' && !isNaN(tempPromiseCoords[0]) && !isNaN(tempPromiseCoords[1])) {
        const icon = L.divIcon({
          className: '',
          html: tempPromiseMarkerHtml(),
          iconSize: [36, 46],
          iconAnchor: [18, 42],
        });
        mg.addLayer(L.marker(tempPromiseCoords, { icon }));
      }

      // 보기용 좌표(맛집/검색) 마커+실선 — 지도 나가면 사라짐
      const viewCoordsL = searchFocusCoords || mapViewCoords;
      if (viewCoordsL && typeof viewCoordsL[0] === 'number' && !isNaN(viewCoordsL[0])) {
        if (myLatL && myLngL) {
          const fruitColor = getFruitColor(me?.avatar || localStorage.getItem('aemang_fruit') || '🍎');
          pg.addLayer(L.polyline([[myLatL, myLngL], viewCoordsL] as L.LatLngTuple[], { color: fruitColor, weight: 4, opacity: 0.9 }));
        }
        mg.addLayer(L.marker(viewCoordsL, { icon: L.divIcon({ className: '', html: viewMarkerHtml(), iconSize: [34, 44], iconAnchor: [17, 40] }) }));
      }

      // 친구 마커 — 겹치면 옆으로 분산(실제 위치는 점)
      const drawableFriendsL = friends.filter(f =>
        !(f.id === activeProfileId && myGpsCoords) &&
        typeof f.lat === 'number' && typeof f.lng === 'number' && !isNaN(f.lat) && !isNaN(f.lng)
      );
      const spreadL = computeSpread(drawableFriendsL);
      const dotDrawnL = new Set<string>();
      spreadL.forEach(item => {
        if (item.grouped) {
          const key = `${item.gLat.toFixed(4)},${item.gLng.toFixed(4)}`;
          if (!dotDrawnL.has(key)) {
            dotDrawnL.add(key);
            mg.addLayer(L.marker([item.gLat, item.gLng], { icon: L.divIcon({ className: '', html: realDotHtml(), iconSize: [10, 10], iconAnchor: [5, 5] }) }));
          }

          // 실제 위치(점)와 오프셋 마커(말풍선) 간의 실선(꼬리) 연결
          const stem = L.polyline([[item.gLat, item.gLng], [item.dLat, item.dLng]] as L.LatLngTuple[], {
            color: item.color || '#4B5563',
            weight: 1.5,
            opacity: 0.85,
          });
          pg.addLayer(stem);
        }
        const icon = L.divIcon({
          className: '',
          html: friendMarkerHtml(item as Friend, selectedFriendId === item.id, item.id === activeProfileId),
          iconSize: [36, 48],
          iconAnchor: [18, 42],
        });
        mg.addLayer(L.marker([item.dLat, item.dLng], { icon, zIndexOffset: selectedFriendId === item.id ? 1000 : 0 }));
      });
    }
  }, [friends, appointments, activeProfileId, selectedFriendId, selectedPromiseId, tempPromiseCoords, mapViewCoords, searchFocusCoords, isPersonalRoom, myGpsCoords, isKakaoReady, useFallbackMap]);

  // ─── 4. 내 GPS 위치 마커 실시간 업데이트 ──────────────────────────────────
  useEffect(() => {
    if (!myGpsCoords || typeof myGpsCoords[0] !== 'number' || typeof myGpsCoords[1] !== 'number' || isNaN(myGpsCoords[0]) || isNaN(myGpsCoords[1])) return;

    const foundFriend = friends.find(f => f.id === activeProfileId);
    const myProfile = foundFriend ? {
      ...foundFriend,
      avatar: localStorage.getItem('aemang_fruit') || foundFriend.avatar || '🍎',
      statusMsg: foundFriend.statusMsg || localStorage.getItem('aemang_status') || ''
    } : {
      avatar: localStorage.getItem('aemang_fruit') || '🍎',
      color: '#EF4444',
      name: '나',
      statusMsg: localStorage.getItem('aemang_status') || ''
    };

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const map = kakaoMapInstanceRef.current;
      
      if (kakaoMyMarkerRef.current) {
        kakaoMyMarkerRef.current.setMap(null);
      }

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(myGpsCoords[0], myGpsCoords[1]),
        content: selfMarkerHtml(myProfile),
        yAnchor: 1.0,
        zIndex: 200
      });
      overlay.setMap(map);
      kakaoMyMarkerRef.current = overlay;

    } else if (useFallbackMap && leafletMapInstanceRef.current) {
      const map = leafletMapInstanceRef.current;
      const myHtml = selfMarkerHtml(myProfile);

      if (leafletMyMarkerRef.current && 'setLatLng' in leafletMyMarkerRef.current) {
        (leafletMyMarkerRef.current as L.Marker).setLatLng(myGpsCoords);
        (leafletMyMarkerRef.current as L.Marker).setIcon(L.divIcon({
          className: '',
          html: myHtml,
          iconSize: [36, 42],
          iconAnchor: [18, 36],
        }));
      } else {
        if (leafletMyMarkerRef.current) {
          leafletMyMarkerRef.current.remove();
        }
        leafletMyMarkerRef.current = L.marker(myGpsCoords, {
          icon: L.divIcon({
            className: '',
            html: myHtml,
            iconSize: [36, 42],
            iconAnchor: [18, 36],
          }),
          pane: 'markerPane',
        }).addTo(map) as any;
      }
    }
  }, [myGpsCoords, friends, activeProfileId, isKakaoReady, useFallbackMap]);

  // ─── 5. 포커스 이동 (flyTo/panTo) ──────────────────────────────────────────
  useEffect(() => {
    let targetCoords: [number, number] | null = null;
    
    if (selectedFriendId) {
      const f = friends.find(fr => fr.id === selectedFriendId);
      if (f) targetCoords = [f.lat, f.lng];
    } else if (selectedPromiseId) {
      const a = appointments.find(ap => ap.id === selectedPromiseId);
      if (a) targetCoords = [a.lat, a.lng];
    } else if (searchFocusCoords) {
      targetCoords = searchFocusCoords;
    } else if (mapViewCoords) {
      targetCoords = mapViewCoords;
    } else if (tempPromiseCoords) {
      targetCoords = tempPromiseCoords;
    }

    if (!targetCoords) return;

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const map = kakaoMapInstanceRef.current;
      const latlng = new window.kakao.maps.LatLng(targetCoords[0], targetCoords[1]);
      map.panTo(latlng);
    } else if (useFallbackMap && leafletMapInstanceRef.current) {
      const map = leafletMapInstanceRef.current;
      map.flyTo(targetCoords, 16, { animate: true, duration: 1.2 });
    }
  }, [selectedFriendId, selectedPromiseId, tempPromiseCoords, mapViewCoords, searchFocusCoords, isKakaoReady, useFallbackMap]);

  // ─── 6. 지도 진입(마운트) 시 내 위치로 1회 중심 맞추기 ─────────────────────
  // MapComponent는 지도 탭에 들어올 때마다 마운트되므로, 마운트당 1회만 내 위치로 중심을 잡는다.
  // (매 GPS 갱신마다 재중심되면 사용자가 지도를 못 움직이므로 ref로 1회 제한)
  const didCenterOnGpsRef = useRef(false);
  useEffect(() => {
    if (didCenterOnGpsRef.current) return;
    if (selectedFriendId || selectedPromiseId || mapViewCoords || searchFocusCoords) { didCenterOnGpsRef.current = true; return; }
    if (!myGpsCoords) return;

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      kakaoMapInstanceRef.current.setCenter(new window.kakao.maps.LatLng(myGpsCoords[0], myGpsCoords[1]));
      didCenterOnGpsRef.current = true;
      onMyGpsCentered?.();
    } else if (useFallbackMap && leafletMapInstanceRef.current) {
      leafletMapInstanceRef.current.flyTo(myGpsCoords, 16, { animate: true, duration: 1.0 });
      didCenterOnGpsRef.current = true;
      onMyGpsCentered?.();
    }
  }, [myGpsCoords, selectedFriendId, selectedPromiseId, mapViewCoords, searchFocusCoords, isKakaoReady, useFallbackMap]);

  // ─── 7. 내 위치 바로가기 핸들러 ────────────────────────────────────────────
  const handleGoToMyLocation = useCallback(() => {
    if (!myGpsCoords) return;

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const map = kakaoMapInstanceRef.current;
      map.panTo(new window.kakao.maps.LatLng(myGpsCoords[0], myGpsCoords[1]));
    } else if (useFallbackMap && leafletMapInstanceRef.current) {
      const map = leafletMapInstanceRef.current;
      map.flyTo(myGpsCoords, 17, { animate: true, duration: 0.8 });
    }
  }, [myGpsCoords, isKakaoReady, useFallbackMap]);

  // ─── 8. 장소 검색 (카카오 검색 서비스 vs Nominatim 폴백) ────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!mapSearch.trim()) { setMapResults([]); setShowResults(false); return; }

    setIsSearching(true);
    setShowResults(true);

    debounceRef.current = setTimeout(async () => {
      if (isKakaoReady && !useFallbackMap && window.kakao && window.kakao.maps && window.kakao.maps.services) {
        // 카카오 장소(키워드) 검색 + 주소 검색 병행
        try {
          const ps = new window.kakao.maps.services.Places();
          const geocoder = new window.kakao.maps.services.Geocoder();
          const Status = window.kakao.maps.services.Status;
          const merged: PlaceResult[] = [];
          const pushUnique = (r: PlaceResult) => {
            if (isNaN(r.lat) || isNaN(r.lng)) return;
            if (!merged.some(m => Math.abs(m.lat - r.lat) < 1e-7 && Math.abs(m.lng - r.lng) < 1e-7)) merged.push(r);
          };
          let done = 0;
          const finish = () => {
            if (++done < 2) return;
            setIsSearching(false);
            if (merged.length > 0) setMapResults(merged.slice(0, 10));
            else fallbackSearch();
          };
          ps.keywordSearch(mapSearch, (data: any, status: any) => {
            if (status === Status.OK) {
              data.forEach((item: any) => pushUnique({
                name: item.place_name,
                address: item.road_address_name || item.address_name,
                lat: parseFloat(item.y),
                lng: parseFloat(item.x),
              }));
            }
            finish();
          });
          geocoder.addressSearch(mapSearch, (data: any, status: any) => {
            if (status === Status.OK) {
              data.forEach((item: any) => pushUnique({
                name: item.road_address?.building_name || item.address_name,
                address: item.road_address?.address_name || item.address_name,
                lat: parseFloat(item.y),
                lng: parseFloat(item.x),
              }));
            }
            finish();
          });
        } catch (err) {
          console.warn('Kakao places search error, using Nominatim fallback:', err);
          fallbackSearch();
        }
      } else {
        fallbackSearch();
      }
    }, 450);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };

    async function fallbackSearch() {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(mapSearch)}`);
        const data: PlaceResult[] = await res.json();
        setMapResults(data);
      } catch {
        setMapResults([]);
      } finally {
        setIsSearching(false);
      }
    }
  }, [mapSearch, isKakaoReady, useFallbackMap]);

  const handleSelectResult = (place: PlaceResult) => {
    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const map = kakaoMapInstanceRef.current;
      map.panTo(new window.kakao.maps.LatLng(place.lat, place.lng));
    } else if (useFallbackMap && leafletMapInstanceRef.current) {
      const map = leafletMapInstanceRef.current;
      map.flyTo([place.lat, place.lng], 17, { animate: true, duration: 1.0 });
    }

    // 지도 검색은 '위치 보기'만 — 약속방 좌표로 연동하지 않음. 지도를 나가면 자동으로 사라짐.
    setSearchFocusCoords([place.lat, place.lng]);
    setMapSearch('');
    setShowResults(false);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full z-10" />

      {/* 검색바 */}
      <div className="absolute top-3 left-3 right-12 z-30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          {isSearching
            ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 animate-spin pointer-events-none" />
            : mapSearch
              ? <button onClick={() => { setMapSearch(''); setShowResults(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              : null
          }
          <input
            type="text"
            value={mapSearch}
            onChange={e => setMapSearch(e.target.value)}
            placeholder="장소 검색 (예: 강남역, 홍대 카페)"
            className="w-full bg-white/95 backdrop-blur border border-gray-200 shadow-md rounded-2xl py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        {showResults && mapResults.length > 0 && (
          <div className="mt-1 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            {mapResults.map((place, idx) => (
              <button key={idx} type="button" onClick={() => handleSelectResult(place)}
                className="w-full text-left px-4 py-2.5 hover:bg-amber-50 border-b border-gray-50 last:border-0 flex items-start gap-2.5 transition">
                <MapPin className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{place.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{place.address}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {showResults && !isSearching && mapSearch && mapResults.length === 0 && (
          <div className="mt-1 bg-white border border-gray-100 rounded-2xl shadow-lg px-4 py-3 text-center text-xs text-gray-400">
            검색 결과가 없습니다
          </div>
        )}
      </div>

      {/* 내 위치 버튼 */}
      {myGpsCoords && (
        <button
          type="button"
          onClick={handleGoToMyLocation}
          className="absolute bottom-14 right-3 z-30 w-10 h-10 bg-white border-2 border-gray-200 rounded-full shadow-md flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition"
          title="내 위치로 이동"
        >
          <Crosshair className="w-5 h-5 text-blue-500" />
        </button>
      )}

      {/* 소집 장소 지정 버튼 / 모드 안내 */}
      <button
        type="button"
        onClick={() => setPlaceSelectMode(m => !m)}
        className={`absolute bottom-4 left-4 z-30 font-black text-[10px] px-3.5 py-2.5 rounded-2xl shadow-lg flex items-center gap-1.5 transition active:translate-y-0.5 ${
          placeSelectMode ? 'bg-rose-500 text-white animate-pulse' : 'bg-yellow-300 text-slate-900'
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${placeSelectMode ? 'bg-white' : 'bg-rose-500'}`} />
        <span>{placeSelectMode ? '지도를 터치해 장소를 지정하세요 (취소하려면 다시 탭)' : '📍 소집 장소 지정하기'}</span>
      </button>

      {/* 🚌 실시간 버스 위치 버튼 (소집 장소 버튼 위) */}
      <button
        type="button"
        onClick={() => setBusPanelOpen(o => !o)}
        className={`absolute bottom-[68px] left-4 z-30 font-black text-[10px] px-3.5 py-2.5 rounded-2xl shadow-lg flex items-center gap-1.5 transition active:translate-y-0.5 ${
          busTracking ? 'bg-sky-500 text-white' : 'bg-white text-slate-800'
        }`}
      >
        <span>🚌</span>
        <span>{busTracking ? `${busTracking.routeNo}번 추적 중 (${busLocations.length}대)` : '버스 위치 보기'}</span>
      </button>

      {/* 🚌 버스 노선 선택 패널 */}
      {busPanelOpen && (
        <div className="absolute bottom-[116px] left-4 z-30 bg-white rounded-2xl shadow-xl p-4 w-[310px] max-w-[calc(100%-32px)] font-sans space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-black text-slate-800">🚌 실시간 버스 위치</p>
            <button onClick={() => setBusPanelOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm w-6 h-6">✕</button>
          </div>

          {busTracking ? (
            <div className="space-y-2">
              <p className="text-[12px] text-slate-500">
                <b className="text-sky-600">{busTracking.routeNo}번</b> 버스 <b>{busLocations.length}대</b> 표시 중 (15초마다 갱신)
              </p>
              <button onClick={stopBusTracking} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-black py-2.5 rounded-xl transition">
                추적 중지
              </button>
            </div>
          ) : (
            <>
              <select
                value={busCityCode}
                onChange={e => setBusCityCode(e.target.value)}
                className="w-full bg-slate-50 text-[13px] font-bold rounded-xl px-3 py-2.5 focus:outline-none"
              >
                <option value="">도시 선택</option>
                {busCities.map(c => (
                  <option key={c.cityCode} value={c.cityCode}>{c.cityName}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={busRouteNo}
                  onChange={e => setBusRouteNo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBusRouteSearch(); }}
                  placeholder="버스 번호 (예: 102, M5107)"
                  autoCapitalize="characters"
                  className="flex-1 bg-slate-50 text-[13px] font-bold rounded-xl px-3 py-2.5 focus:outline-none min-w-0"
                />
                <button
                  onClick={handleBusRouteSearch}
                  disabled={busSearching}
                  className="bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 text-white text-[13px] font-black px-4 rounded-xl transition shrink-0"
                >
                  {busSearching ? '…' : '검색'}
                </button>
              </div>

              {busRoutes.length > 0 && (
                <div className="space-y-1 max-h-[160px] overflow-y-auto">
                  {busRoutes.map(r => (
                    <button
                      key={r.routeId}
                      onClick={() => startBusTracking({ cityCode: busCityCode, routeId: r.routeId, routeNo: r.routeNo })}
                      className="w-full bg-sky-50 hover:bg-sky-100 rounded-xl px-3 py-2 text-left transition"
                    >
                      <p className="text-[13px] font-black text-sky-700">{r.routeNo}번 <span className="text-[10px] text-slate-400 font-bold">{r.routeType}</span></p>
                      <p className="text-[10.5px] text-slate-500 truncate">{r.start} ↔ {r.end}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* 최근 추적 노선 — 원탭 재추적 */}
              {busRecent.length > 0 && busRoutes.length === 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 mb-1">최근 노선</p>
                  <div className="flex flex-wrap gap-1.5">
                    {busRecent.map(r => (
                      <button
                        key={r.routeId}
                        onClick={() => startBusTracking(r)}
                        className="bg-sky-50 hover:bg-sky-100 text-sky-700 text-[12px] font-black px-3 py-1.5 rounded-full transition"
                      >
                        🚌 {r.routeNo}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-slate-400 leading-tight">
                서울·경기 포함 전국 지원. 경기 버스는 정류장 단위 위치로 표시됩니다.
              </p>
            </>
          )}
          {busError && <p className="text-[11px] text-rose-500 font-bold leading-tight">⚠️ {busError}</p>}
        </div>
      )}
    </div>
  );
}
