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
  friends?: Friend[];
  appointments?: Appointment[];
  activeProfileId: string;
  selectedFriendId?: string | null;
  selectedPromiseId?: string | null;
  onMapClick?: (lat: number, lng: number) => void;
  tempPromiseCoords?: [number, number] | null;
  mapViewCoords?: [number, number] | null;
  isPersonalRoom?: boolean;
  myGpsCoords?: [number, number] | null;
  centerOnMyGpsOnce?: boolean;
  onMyGpsCentered?: () => void;
  onUpdateStatusMsg?: (id: string, text: string) => void;
  isLobbyBusMode?: boolean;
  isLobbySubwayMode?: boolean;
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
  friends = [], appointments = [], activeProfileId,
  selectedFriendId = null, selectedPromiseId = null,
  onMapClick = () => {}, tempPromiseCoords = null, mapViewCoords = null, isPersonalRoom = false,
  myGpsCoords = null, centerOnMyGpsOnce = false, onMyGpsCentered = () => {},
  onUpdateStatusMsg = () => {},
  isLobbyBusMode = false,
  isLobbySubwayMode = false,
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
  useEffect(() => {
    if (isLobbyBusMode) {
      setBusPanelOpen(true);
    }
  }, [isLobbyBusMode]);

  const [busCities, setBusCities] = useState<Array<{ cityCode: string; cityName: string }>>([]);
  const [busCityCode, setBusCityCode] = useState<string>(() => {
    try { return localStorage.getItem('aemang_bus_city') || 'AUTO'; } catch { return 'AUTO'; }
  });
  const [busRouteNo, setBusRouteNo] = useState('');
  const [busRoutes, setBusRoutes] = useState<Array<{ routeId: string; routeNo: string; routeType: string; start: string; end: string; cityCode?: string; region?: string }>>([]);
  const [busSearching, setBusSearching] = useState(false);
  const [busTracking, setBusTracking] = useState<{ routeId: string; routeNo: string; cityCode: string; routeType?: string } | null>(null);
  const [busLocations, setBusLocations] = useState<Array<{ lat: number; lng: number; vehicleNo: string; nodeName: string; nextLat?: number | null; nextLng?: number | null }>>([]);
  const [busError, setBusError] = useState<string | null>(null);
  const busKakaoOverlaysRef = useRef<any[]>([]);
  const busLeafletMarkersRef = useRef<L.Marker[]>([]);

  // ─── 버스 정류소 관련 상태 ─────────────────────────────────────────────────
  const [busTab, setBusTab] = useState<'route' | 'station'>('route');
  const [busStationKeyword, setBusStationKeyword] = useState('');
  const [busStations, setBusStations] = useState<Array<{ stationId: string; stationName: string; stationNo: string; nextStationName?: string; lat: number; lng: number; cityCode: string; region?: string }>>([]);
  const [busStationSearching, setBusStationSearching] = useState(false);
  const [selectedStation, setSelectedStation] = useState<{ stationId: string; stationName: string; stationNo: string; nextStationName?: string; lat: number; lng: number; cityCode: string } | null>(null);
  const [busArrivals, setBusArrivals] = useState<Array<{ routeNo: string; predictTime: number; remainStations: number; msg: string }>>([]);
  const [busArrivalLoading, setBusArrivalLoading] = useState(false);
  const busStationKakaoOverlaysRef = useRef<any[]>([]);
  const busStationLeafletMarkersRef = useRef<L.Marker[]>([]);

  // 최근 추적한 노선 (원탭 재추적) — 전체 노선 목록 로딩 대신 트래픽 효율적인 방식
  const [busRecent, setBusRecent] = useState<Array<{ cityCode: string; routeId: string; routeNo: string; routeType?: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('aemang_bus_recent') || '[]'); } catch { return []; }
  });
  const saveBusRecent = (entry: { cityCode: string; routeId: string; routeNo: string; routeType?: string }) => {
    setBusRecent(prev => {
      const next = [entry, ...prev.filter(r => r.routeId !== entry.routeId)].slice(0, 6);
      try { localStorage.setItem('aemang_bus_recent', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const startBusTracking = (entry: { cityCode: string; routeId: string; routeNo: string; routeType?: string }) => {
    saveBusRecent(entry);
    setBusTracking({ routeId: entry.routeId, routeNo: entry.routeNo, cityCode: entry.cityCode, routeType: entry.routeType });
    setBusPanelOpen(false);
  };

  // ===== 🚇 실시간 지하철 위치 및 도착 정보 레이어 =====
  const [subwayPanelOpen, setSubwayPanelOpen] = useState(false);
  useEffect(() => {
    if (isLobbySubwayMode) {
      setSubwayPanelOpen(true);
    }
  }, [isLobbySubwayMode]);

  const [subwayTab, setSubwayTab] = useState<'station' | 'line'>('station');
  const [subwayKeyword, setSubwayKeyword] = useState('');
  const [subwayStations, setSubwayStations] = useState<Array<{ stationId: string; stationName: string; lat: number; lng: number }>>([]);
  const [subwaySearching, setSubwaySearching] = useState(false);
  const [selectedSubwayStation, setSelectedSubwayStation] = useState<{ stationId: string; stationName: string; lat: number; lng: number } | null>(null);
  const [subwayArrivals, setSubwayArrivals] = useState<Array<{ subwayId: string; updnLine: string; trainLineNm: string; arvlMsg2: string; arvlMsg3: string; barvlDt: number; trainNo: string; statnNm: string }>>([]);
  const [subwayArrivalLoading, setSubwayArrivalLoading] = useState(false);
  const [subwayError, setSubwayError] = useState<string | null>(null);
  const subwayKakaoOverlaysRef = useRef<any[]>([]);
  const subwayLeafletMarkersRef = useRef<L.Marker[]>([]);

  // 호선별 실시간 열차 위치 추적 관련 상태 및 Ref
  const [activeSubwayLine, setActiveSubwayLine] = useState<string | null>(null);
  const [subwayLineTrains, setSubwayLineTrains] = useState<Array<{ subwayId: string; subwayNm: string; statnId: string; statnNm: string; trainNo: string; updnLine: string; statnTnm: string; trainSttus: string; directAt: string }>>([]);
  const [subwayLineTrainsLoading, setSubwayLineTrainsLoading] = useState(false);
  const [subwayStationCoords, setSubwayStationCoords] = useState<Record<string, { lat: number; lng: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('aemang_subway_coords_cache') || '{}'); } catch { return {}; }
  });
  const subwayTrainKakaoOverlaysRef = useRef<any[]>([]);
  const subwayTrainLeafletMarkersRef = useRef<L.Marker[]>([]);

  const saveSubwayCoords = (stationName: string, lat: number, lng: number) => {
    setSubwayStationCoords(prev => {
      const cleanName = stationName.replace(/역$/, '').trim();
      const next = { ...prev, [cleanName]: { lat, lng } };
      try { localStorage.setItem('aemang_subway_coords_cache', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const stopSubwayTracking = () => {
    setSelectedSubwayStation(null);
    setSubwayArrivals([]);
    setSubwayStations([]);
    setSubwayKeyword('');
    setActiveSubwayLine(null);
    setSubwayLineTrains([]);
  };

  // 선택 지하철역 실시간 도착 정보 조회 및 폴링 (15초)
  useEffect(() => {
    if (!selectedSubwayStation) {
      setSubwayArrivals([]);
      return;
    }
    let cancelled = false;
    const loadSubwayArrivals = async () => {
      setSubwayArrivalLoading(true);
      try {
        const res = await fetch(`/api/subway/arrivals?stationName=${encodeURIComponent(selectedSubwayStation.stationName)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setSubwayError(data?.error || '지하철 도착 정보 조회 실패'); return; }
        setSubwayError(null);
        setSubwayArrivals(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSubwayError('지하철 도착 정보 조회 실패 (네트워크)');
      }
      setSubwayArrivalLoading(false);
    };
    loadSubwayArrivals();
    const timer = setInterval(loadSubwayArrivals, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedSubwayStation]);

  // 선택 지하철역 마커 렌더링 및 카메라 이동
  useEffect(() => {
    subwayKakaoOverlaysRef.current.forEach(o => { try { o.setMap(null); } catch {} });
    subwayKakaoOverlaysRef.current = [];
    subwayLeafletMarkersRef.current.forEach(m => { try { m.remove(); } catch {} });
    subwayLeafletMarkersRef.current = [];

    if (!selectedSubwayStation) return;

    const stationHtml = `
      <div style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;pointer-events:none">
        <div style="background:#10B981;color:#fff;font-size:11px;font-weight:900;padding:4.5px 9px;border-radius:20px;border:1.5px solid #39FF14;box-shadow:0 0 8px rgba(57,255,20,0.8);white-space:nowrap;display:flex;align-items:center;gap:4px">
          <span>🚇</span> <span>${selectedSubwayStation.stationName}</span>
        </div>
      </div>
    `;

    const latLng = { lat: selectedSubwayStation.lat, lng: selectedSubwayStation.lng };

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const moveLatlng = new window.kakao.maps.LatLng(latLng.lat, latLng.lng);
      kakaoMapInstanceRef.current.setCenter(moveLatlng);
      
      const overlay = new window.kakao.maps.CustomOverlay({
        position: moveLatlng,
        content: stationHtml,
        yAnchor: 0.5,
        zIndex: 5,
      });
      overlay.setMap(kakaoMapInstanceRef.current);
      subwayKakaoOverlaysRef.current.push(overlay);
    } else if (leafletMapInstanceRef.current) {
      leafletMapInstanceRef.current.setView([latLng.lat, latLng.lng], 16);
      
      const marker = L.marker([latLng.lat, latLng.lng], {
        icon: L.divIcon({ className: '', html: stationHtml, iconSize: [0, 0] }),
        interactive: false,
      });
      marker.addTo(leafletMapInstanceRef.current!);
      subwayLeafletMarkersRef.current.push(marker);
    }
  }, [selectedSubwayStation, isKakaoReady, useFallbackMap]);

  // 1. 선택 호선 실시간 열차 위치 조회 및 폴링 (15초)
  useEffect(() => {
    if (!activeSubwayLine) {
      setSubwayLineTrains([]);
      return;
    }
    let cancelled = false;
    const loadLineTrains = async () => {
      setSubwayLineTrainsLoading(true);
      try {
        const res = await fetch(`/api/subway/line-positions?lineName=${encodeURIComponent(activeSubwayLine)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setSubwayError(data?.error || '열차 위치 조회 실패'); return; }
        setSubwayError(null);
        setSubwayLineTrains(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSubwayError('열차 위치 조회 실패 (네트워크)');
      }
      setSubwayLineTrainsLoading(false);
    };

    loadLineTrains();
    const timer = setInterval(loadLineTrains, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeSubwayLine]);

  // 2. 미등록 역 위/경도 좌표 순차적 해결 (150ms 스로틀링)
  useEffect(() => {
    if (!activeSubwayLine || subwayLineTrains.length === 0) return;

    const missing = Array.from(new Set(subwayLineTrains.map(t => t.statnNm.replace(/역$/, '').trim())))
      .filter(name => !subwayStationCoords[name]) as string[];

    if (missing.length === 0) return;

    let cancelled = false;
    const resolveAll = async () => {
      for (const name of missing) {
        if (cancelled) break;
        
        // Kakao Places SW8 search
        if (isKakaoReady && !useFallbackMap && window.kakao?.maps?.services) {
          try {
            const ps = new window.kakao.maps.services.Places();
            ps.keywordSearch(name + '역', (data: any, status: any) => {
              if (status === window.kakao.maps.services.Status.OK) {
                const match = data.find((item: any) => item.category_group_code === 'SW8' || item.place_name.includes(name));
                if (match) {
                  saveSubwayCoords(name, parseFloat(match.y), parseFloat(match.x));
                }
              }
            });
          } catch (err) {
            console.warn('Subway station search error:', err);
          }
        } else {
          // Nominatim
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name + '역')}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              saveSubwayCoords(name, parseFloat(data[0].lat), parseFloat(data[0].lon));
            }
          } catch {}
        }
        await new Promise(r => setTimeout(r, 150));
      }
    };

    resolveAll();
    return () => { cancelled = true; };
  }, [subwayLineTrains, subwayStationCoords, activeSubwayLine, isKakaoReady, useFallbackMap]);

  // 3. 지하철 실시간 열차 마커 렌더링 (방향 회전 + 헤드라이트 빔)
  useEffect(() => {
    // 기존 마커 제거
    subwayTrainKakaoOverlaysRef.current.forEach(o => { try { o.setMap(null); } catch {} });
    subwayTrainKakaoOverlaysRef.current = [];
    subwayTrainLeafletMarkersRef.current.forEach(m => { try { m.remove(); } catch {} });
    subwayTrainLeafletMarkersRef.current = [];

    if (!activeSubwayLine || subwayLineTrains.length === 0) return;

    subwayLineTrains.forEach(t => {
      const cleanName = t.statnNm.replace(/역$/, '').trim();
      const coords = subwayStationCoords[cleanName];
      if (!coords) return;

      const rotation = getSubwayTrainRotation(t.subwayNm, t.updnLine);
      const lineColor = getSubwayLineColor(t.subwayId);
      const neonDetails = getSubwayLineNeonDetails(t.subwayId);

      // train status msg (진입, 도착, 출발, 전역출발)
      let statusLabel = '';
      if (t.trainSttus === '0') statusLabel = '진입';
      else if (t.trainSttus === '1') statusLabel = '도착';
      else if (t.trainSttus === '2') statusLabel = '출발';
      else if (t.trainSttus === '3') statusLabel = '전역출발';

      const trainHtml = `
        <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;font-family:sans-serif;">
          <!-- Rotated container wrapping side-view train SVG, headlight, connector and card -->
          <div style="transform:rotate(${rotation}deg);position:relative;display:flex;align-items:center;flex-shrink:0;">
            
            <!-- Details Card wrapper (Counter-rotated) -->
            <div style="position:absolute;right:calc(100% + 18px);top:50%;transform:translateY(-50%) rotate(${-rotation}deg);transform-origin:right center;z-index:10;">
              <div style="background:rgba(15, 23, 42, 0.92);color:#fff;font-size:7.5px;font-weight:700;padding:4px 7px;border-radius:6px;box-shadow:0 3px 8px rgba(0,0,0,0.25);white-space:nowrap;display:flex;align-items:center;gap:3px;border:1px solid ${neonDetails.neon};">
                <span style="color:#39FF14;font-weight:900;">${statusLabel || '운행'}</span>
                <span>${t.trainNo}</span>
                <span style="color:#94a3b8;font-weight:500;">(${t.statnTnm.replace('종착', '')}행)</span>
              </div>
            </div>

            <!-- Dashed connector -->
            <div style="position:absolute;right:100%;top:50%;width:18px;border-top:1.5px dashed ${neonDetails.neon};transform:translateY(-50%);z-index:1;"></div>

            <!-- Side-view Subway SVG -->
            <svg viewBox="0 0 64 32" width="46" height="23" style="z-index:5;position:relative;overflow:visible;filter:drop-shadow(0 0 3px ${neonDetails.neon});">
              <!-- Subway Body -->
              <rect x="2" y="6" width="60" height="20" rx="4" fill="${lineColor}" stroke="${neonDetails.neon}" stroke-width="1.8" />
              <!-- Front curved windshield (Right side) -->
              <path d="M50 6h10c1 0 2 1 2 2v8c0 1-1 2-2 2h-10V6z" fill="#D1E8FF" stroke="${neonDetails.neon}" stroke-width="1.2" opacity="0.85" />
              <!-- Cabin Windows -->
              <rect x="6" y="9" width="9" height="6" rx="1.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1" opacity="0.8" />
              <rect x="17" y="9" width="9" height="6" rx="1.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1" opacity="0.8" />
              <rect x="28" y="9" width="9" height="6" rx="1.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1" opacity="0.8" />
              <rect x="39" y="9" width="9" height="6" rx="1.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1" opacity="0.8" />
              <!-- Wheels -->
              <circle cx="14" cy="26" r="3.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1.2" />
              <circle cx="22" cy="26" r="3.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1.2" />
              <circle cx="42" cy="26" r="3.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1.2" />
              <circle cx="50" cy="26" r="3.5" fill="#1E293B" stroke="${neonDetails.neon}" stroke-width="1.2" />
              <!-- Tail Lights (Left) -->
              <circle cx="4" cy="10" r="1.5" fill="#EF4444" />
              <circle cx="4" cy="18" r="1.5" fill="#EF4444" />
              <!-- Train Number Text Overlay -->
              <text x="28" y="21" fill="#FFFFFF" font-size="8" font-weight="900" font-family="'Space Grotesk',sans-serif" text-anchor="middle" style="letter-spacing:-0.2px;">${t.trainNo}</text>
            </svg>

            <!-- Headlight beam -->
            <div style="
              width: 30px;
              height: 18px;
              background: linear-gradient(90deg, ${neonDetails.neon} 0%, rgba(${neonDetails.rgb}, 0.45) 45%, rgba(${neonDetails.rgb}, 0) 100%);
              clip-path: polygon(0 35%, 100% 0, 100% 100%, 0 65%);
              margin-left: -2px;
              flex-shrink: 0;
              z-index: 1;
              filter: blur(0.5px);
            "></div>
          </div>
        </div>
      `;

      if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(coords.lat, coords.lng),
          content: trainHtml,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 15,
        });
        overlay.setMap(kakaoMapInstanceRef.current);
        subwayTrainKakaoOverlaysRef.current.push(overlay);
      } else if (useFallbackMap && leafletMapInstanceRef.current) {
        const marker = L.marker([coords.lat, coords.lng], {
          icon: L.divIcon({ className: '', html: trainHtml, iconSize: [0, 0] }),
          zIndexOffset: 1500,
        });
        marker.addTo(leafletMapInstanceRef.current);
        subwayTrainLeafletMarkersRef.current.push(marker);
      }
    });
  }, [subwayLineTrains, subwayStationCoords, activeSubwayLine, isKakaoReady, useFallbackMap]);

  const handleSubwayStationSearch = async () => {
    if (!subwayKeyword.trim()) { setSubwayError('지하철역 이름을 입력해 주세요.'); return; }
    setSubwaySearching(true);
    setSubwayError(null);
    setSubwayStations([]);
    
    const query = subwayKeyword.trim();

    if (isKakaoReady && !useFallbackMap && window.kakao?.maps?.services) {
      try {
        const ps = new window.kakao.maps.services.Places();
        ps.keywordSearch(query, (data: any, status: any) => {
          setSubwaySearching(false);
          if (status === window.kakao.maps.services.Status.OK) {
            const filtered = data.filter((item: any) => item.category_group_code === 'SW8' || item.place_name.endsWith('역'));
            if (filtered.length > 0) {
              setSubwayStations(filtered.map((item: any) => ({
                stationId: item.id,
                stationName: item.place_name,
                lat: parseFloat(item.y),
                lng: parseFloat(item.x),
              })));
            } else {
              setSubwayError('검색어에 매칭되는 지하철역을 찾지 못했습니다.');
            }
          } else {
            setSubwayError('지하철역 검색 결과가 없습니다.');
          }
        });
      } catch (err) {
        setSubwaySearching(false);
        setSubwayError('지하철역 검색 중 오류가 발생했습니다.');
      }
    } else {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + '역')}`);
        const data = await res.json();
        setSubwaySearching(false);
        if (Array.isArray(data) && data.length > 0) {
          setSubwayStations(data.slice(0, 8).map((item: any) => ({
            stationId: String(item.place_id),
            stationName: item.display_name.split(',')[0],
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          })));
        } else {
          setSubwayError('지하철역 검색 결과가 없습니다.');
        }
      } catch {
        setSubwaySearching(false);
        setSubwayError('지하철역 검색 중 오류가 발생했습니다. (네트워크)');
      }
    }
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

  // 선택 노선 실시간 위치 폴링 (15초) — 노선이 속한 공급자(cityCode)를 사용
  useEffect(() => {
    if (!busTracking) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/bus/locations?cityCode=${encodeURIComponent(busTracking.cityCode)}&routeId=${encodeURIComponent(busTracking.routeId)}`);
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
  }, [busTracking]);

  // 버스 마커 렌더링 (카카오/Leaflet 양쪽 지원)
  useEffect(() => {
    // 기존 마커 제거
    busKakaoOverlaysRef.current.forEach(o => { try { o.setMap(null); } catch {} });
    busKakaoOverlaysRef.current = [];
    busLeafletMarkersRef.current.forEach(m => { try { m.remove(); } catch {} });
    busLeafletMarkersRef.current = [];

    if (!busTracking || busLocations.length === 0) return;

    const busHtml = (b: typeof busLocations[0]) => {
      let rotation = 0;
      if (b.nextLat && b.nextLng) {
        const dy = b.nextLat - b.lat;
        const dx = Math.cos(Math.PI / 180 * b.lat) * (b.nextLng - b.lng);
        const bearingAngle = Math.atan2(dx, dy) * 180 / Math.PI;
        rotation = bearingAngle - 90;
      }

      const busColor = getBusTypeColor(busTracking.routeType, busTracking.routeNo);

      const parts = b.nodeName.split('→');
      let flowHtml = '';
      if (parts.length >= 2) {
        const fromSt = parts[0].trim();
        const toSt = parts[1].trim();
        flowHtml = `
          <div style="display:flex;align-items:center;justify-content:center;gap:3px;font-weight:700;width:100%;">
            <span style="color:#64748b;font-size:8px;max-width:55px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${fromSt}">${fromSt}</span>
            <span style="color:#10b981;font-size:7px;font-weight:bold;flex-shrink:0;">➔</span>
            <span style="color:#0f172a;font-size:9px;max-width:65px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:900" title="${toSt}">${toSt}</span>
          </div>
        `;
      } else {
        flowHtml = `
          <div style="color:#0f172a;font-size:8.5px;font-weight:800;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.nodeName}">
            ${b.nodeName || b.vehicleNo}
          </div>
        `;
      }

      return `
        <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;font-family:sans-serif;">
          <!-- Rotated container wrapping side-view bus SVG, headlight, connector and card -->
          <div style="transform:rotate(${rotation}deg);position:relative;display:flex;align-items:center;flex-shrink:0;">
            
            <!-- Details Card wrapper (Counter-rotated) -->
            <div style="position:absolute;right:calc(100% + 18px);top:50%;transform:translateY(-50%) rotate(${-rotation}deg);transform-origin:right center;z-index:10;">
              <div style="background:rgba(255, 255, 255, 0.98);color:#1e293b;font-size:8px;font-weight:700;padding:4.5px 8px;border-radius:6px;box-shadow:0 3px 8px rgba(0,0,0,0.15);white-space:nowrap;min-width:110px;max-width:160px;display:flex;flex-direction:column;align-items:center;gap:2px;border:1.2px solid ${busColor.neon};">
                ${flowHtml}
                <div style="color:#64748b;font-size:7px;font-weight:500;letter-spacing:-0.1px;">${b.vehicleNo}</div>
              </div>
            </div>

            <!-- Dashed connector -->
            <div style="position:absolute;right:100%;top:50%;width:18px;border-top:1.5px dashed ${busColor.neon};transform:translateY(-50%);z-index:1;"></div>

            <!-- Side-view Bus SVG -->
            <svg viewBox="0 0 64 32" width="48" height="24" style="z-index:5;position:relative;overflow:visible;filter:drop-shadow(0 0 3px ${busColor.neon});">
              <!-- Roof AC unit -->
              <rect x="22" y="2" width="20" height="3" rx="1.5" fill="${busColor.main}" stroke="${busColor.neon}" stroke-width="1.2" />
              <!-- Bus Body -->
              <rect x="2" y="5" width="60" height="22" rx="5" fill="${busColor.main}" stroke="${busColor.neon}" stroke-width="1.8" />
              <!-- Front windshield (Right side) -->
              <path d="M50 5h10c1 0 2 1 2 2v10c0 1-1 2-2 2h-10V5z" fill="#D1E8FF" stroke="${busColor.neon}" stroke-width="1.2" opacity="0.85" />
              <!-- Windows -->
              <rect x="6" y="8" width="9" height="7" rx="1.5" fill="#D1E8FF" stroke="${busColor.neon}" stroke-width="1.2" opacity="0.85" />
              <rect x="17" y="8" width="9" height="7" rx="1.5" fill="#D1E8FF" stroke="${busColor.neon}" stroke-width="1.2" opacity="0.85" />
              <rect x="28" y="8" width="9" height="7" rx="1.5" fill="#D1E8FF" stroke="${busColor.neon}" stroke-width="1.2" opacity="0.85" />
              <rect x="39" y="8" width="9" height="7" rx="1.5" fill="#D1E8FF" stroke="${busColor.neon}" stroke-width="1.2" opacity="0.85" />
              <!-- Wheels -->
              <circle cx="16" cy="27" r="4.5" fill="#1E293B" stroke="${busColor.neon}" stroke-width="1.2" />
              <circle cx="16" cy="27" r="1.5" fill="#FFFFFF" />
              <circle cx="48" cy="27" r="4.5" fill="#1E293B" stroke="${busColor.neon}" stroke-width="1.2" />
              <circle cx="48" cy="27" r="1.5" fill="#FFFFFF" />
              <!-- Passenger Door outline -->
              <line x1="49" y1="5" x2="49" y2="27" stroke="${busColor.neon}" stroke-width="1.2" />
              <!-- Tail Light (Left) -->
              <rect x="0.5" y="10" width="1.5" height="5" rx="0.5" fill="#EF4444" />
              <!-- Route Number Overlay (on the side of the bus body) -->
              <text x="28" y="21" fill="#FFFFFF" font-size="8.5" font-weight="900" font-family="'Space Grotesk',sans-serif" text-anchor="middle" style="letter-spacing:-0.2px;">${busTracking.routeNo}</text>
            </svg>

            <!-- Fluorescent Headlight Beam -->
            <div style="
              width: 35px;
              height: 22px;
              background: linear-gradient(90deg, ${busColor.neon} 0%, rgba(${busColor.rgb}, 0.45) 40%, rgba(${busColor.rgb}, 0) 100%);
              clip-path: polygon(0 35%, 100% 0, 100% 100%, 0 65%);
              margin-left: -2px;
              flex-shrink: 0;
              z-index: 1;
              filter: blur(0.5px);
            "></div>
          </div>
        </div>
      `;
    };

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

  // 선택 정류소의 버스 도착 정보 폴링 (30초)
  useEffect(() => {
    if (!selectedStation) {
      setBusArrivals([]);
      return;
    }
    let cancelled = false;
    const loadArrivals = async () => {
      setBusArrivalLoading(true);
      try {
        const res = await fetch(`/api/bus/arrivals?cityCode=${encodeURIComponent(selectedStation.cityCode)}&stationId=${encodeURIComponent(selectedStation.stationId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setBusError(data?.error || '버스 도착 정보 조회 실패'); return; }
        setBusError(null);
        setBusArrivals(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setBusError('버스 도착 정보 조회 실패 (네트워크)');
      }
      setBusArrivalLoading(false);
    };
    loadArrivals();
    const timer = setInterval(loadArrivals, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedStation]);

  // 선택 정류소 마커 렌더링 및 카메라 이동
  useEffect(() => {
    busStationKakaoOverlaysRef.current.forEach(o => { try { o.setMap(null); } catch {} });
    busStationKakaoOverlaysRef.current = [];
    busStationLeafletMarkersRef.current.forEach(m => { try { m.remove(); } catch {} });
    busStationLeafletMarkersRef.current = [];

    if (!selectedStation) return;

    const stationHtml = `<div style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif">
      <div style="background:#10B981;color:#fff;font-size:10px;font-weight:900;padding:4px 8px;border-radius:10px;box-shadow:0 1.5px 5px rgba(0,0,0,0.4);white-space:nowrap">🏓 ${selectedStation.stationName}</div>
    </div>`;

    const latLng = { lat: selectedStation.lat, lng: selectedStation.lng };

    if (isKakaoReady && !useFallbackMap && kakaoMapInstanceRef.current) {
      const moveLatlng = new window.kakao.maps.LatLng(latLng.lat, latLng.lng);
      kakaoMapInstanceRef.current.setCenter(moveLatlng);
      
      const overlay = new window.kakao.maps.CustomOverlay({
        position: moveLatlng,
        content: stationHtml,
        yAnchor: 0.5,
        zIndex: 5,
      });
      overlay.setMap(kakaoMapInstanceRef.current);
      busStationKakaoOverlaysRef.current.push(overlay);
    } else if (leafletMapInstanceRef.current) {
      leafletMapInstanceRef.current.setView([latLng.lat, latLng.lng], 16);
      
      const marker = L.marker([latLng.lat, latLng.lng], {
        icon: L.divIcon({ className: '', html: stationHtml, iconSize: [0, 0] }),
        interactive: false,
      });
      marker.addTo(leafletMapInstanceRef.current!);
      busStationLeafletMarkersRef.current.push(marker);
    }
  }, [selectedStation, isKakaoReady, useFallbackMap]);

  const handleBusStationSearch = async () => {
    if (!busCityCode || !busStationKeyword.trim()) { setBusError('도시와 정류소 이름을 입력해 주세요.'); return; }
    setBusStationSearching(true);
    setBusError(null);
    setBusStations([]);
    try {
      localStorage.setItem('aemang_bus_city', busCityCode);
      const res = await fetch(`/api/bus/stations?cityCode=${encodeURIComponent(busCityCode)}&keyword=${encodeURIComponent(busStationKeyword.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '검색 실패');
      if (!Array.isArray(data) || data.length === 0) setBusError('해당 이름의 정류소를 찾지 못했습니다.');
      else setBusStations(data.slice(0, 15));
    } catch (e: any) {
      setBusError(e?.message || '정류소 검색에 실패했습니다.');
    }
    setBusStationSearching(false);
  };

  // 정류소 검색어 실시간 디바운스 자동 검색 (2글자 이상 입력 시 500ms 지연 자동 검색)
  useEffect(() => {
    if (busTab !== 'station') return;
    const kw = busStationKeyword.trim();
    if (kw.length < 2) {
      setBusStations([]);
      return;
    }
    const timer = setTimeout(() => {
      handleBusStationSearch();
    }, 500);
    return () => clearTimeout(timer);
  }, [busStationKeyword, busTab, busCityCode]); // busCityCode도 변경 시 자동 검색 트리거되게 의존성 추가

  const stopBusStationTracking = () => {
    setSelectedStation(null);
    setBusArrivals([]);
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
      {!isLobbyBusMode && !isLobbySubwayMode && (
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
      )}

      {/* 🚌 실시간 버스 정보 버튼 */}
      {!isLobbySubwayMode && (
        <button
          type="button"
          onClick={() => setBusPanelOpen(o => !o)}
          className={`absolute left-4 z-30 font-black text-[10px] px-3.5 py-2.5 rounded-2xl shadow-lg flex items-center gap-1.5 transition active:translate-y-0.5 ${
            isLobbyBusMode ? 'bottom-4' : 'bottom-[68px]'
          } ${
            busTracking ? 'bg-sky-500 text-white' : selectedStation ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800'
          }`}
        >
          <span>🚌</span>
          <span>
            {busTracking
              ? `${busTracking.routeNo}번 추적 중 (${busLocations.length}대)`
              : selectedStation
              ? `${selectedStation.stationName} 도착 정보`
              : '버스 정보 보기'}
          </span>
        </button>
      )}

      {/* 🚌 버스 정보 선택 및 도착 패널 */}
      {busPanelOpen && !isLobbySubwayMode && (
        <div className={`absolute left-4 z-30 bg-white rounded-2xl shadow-xl p-4 w-[310px] max-w-[calc(100%-32px)] font-sans space-y-2.5 ${
          isLobbyBusMode ? 'bottom-[60px]' : 'bottom-[116px]'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-black text-slate-800">
              🚌 {busTracking ? '버스 위치 추적' : selectedStation ? '정류소 도착 정보' : '실시간 버스 정보'}
            </p>
            <button onClick={() => setBusPanelOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm w-6 h-6">✕</button>
          </div>

          {busTracking ? (
            // 1) 노선 추적 중일 때 UI (추적 취소 버튼)
            <div className="space-y-2.5">
              <div className="bg-sky-50 rounded-xl p-2.5 text-left">
                <p className="text-[13px] font-black text-sky-800">
                  {busTracking.routeNo}번 버스 위치 추적 중
                </p>
                <p className="text-[10px] text-sky-600 font-bold">실시간 차량 정보</p>
              </div>
              <p className="text-[11px] text-slate-500 font-bold leading-normal text-left pl-1">
                <b className="text-sky-600">{busTracking.routeNo}번</b> 버스 <b>{busLocations.length}대</b> 표시 중 (15초마다 갱신)
              </p>
              <button onClick={stopBusTracking} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-black py-2.5 rounded-xl transition">
                추적 중지
              </button>
            </div>
          ) : selectedStation ? (
            // 2) 정류소 추적 중일 때 UI (실시간 도착 버스 목록)
            <div className="space-y-2.5">
              <div className="bg-emerald-50 rounded-xl p-2.5 text-left">
                <p className="text-[13px] font-black text-emerald-800">
                  {selectedStation.stationName}
                  {selectedStation.nextStationName && (
                    <span className="ml-1 text-[11px] text-emerald-600 font-normal">
                      (→ {selectedStation.nextStationName} 방면)
                    </span>
                  )}
                </p>
                <p className="text-[10.5px] text-emerald-600 font-bold">{selectedStation.stationNo ? `정류소 번호: ${selectedStation.stationNo}` : '정류소 상세'}</p>
              </div>
              
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-0.5">
                {busArrivalLoading && busArrivals.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-4">도착 정보를 불러오는 중입니다…</p>
                ) : busArrivals.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-4">도착 예정인 버스가 없습니다.</p>
                ) : (
                  busArrivals.map((a, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 text-left">
                      <span className="text-[13px] font-black text-slate-800">{a.routeNo}번</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        a.predictTime <= 3 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {a.msg}
                      </span>
                    </div>
                  ))
                )}
              </div>
              
              <p className="text-[9.5px] text-slate-400 text-center">30초마다 자동으로 갱신됩니다.</p>
              <div className="flex gap-1.5">
                <button onClick={() => {
                  const st = selectedStation;
                  setSelectedStation(null);
                  setTimeout(() => setSelectedStation(st), 50);
                }} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[12px] font-bold py-2 rounded-xl transition">
                  새로고침
                </button>
                <button onClick={stopBusStationTracking} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[12px] font-bold py-2 rounded-xl transition">
                  추적 중지
                </button>
              </div>
            </div>
          ) : (
            // 3) 검색 탭 UI (노선 검색 vs 정류소 검색)
            <>
              {/* 탭 헤더 */}
              <div className="flex border-b border-slate-100 pb-1.5 gap-2.5">
                <button
                  onClick={() => setBusTab('route')}
                  className={`text-[12px] font-black pb-1.5 transition ${
                    busTab === 'route' ? 'text-sky-600 border-b-2 border-sky-500' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  노선 번호로 검색
                </button>
                <button
                  onClick={() => setBusTab('station')}
                  className={`text-[12px] font-black pb-1.5 transition ${
                    busTab === 'station' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  정류소명으로 검색
                </button>
              </div>

              {/* 공통 도시 선택 드롭다운 */}
              <select
                value={busCityCode}
                onChange={e => setBusCityCode(e.target.value)}
                className="w-full bg-slate-50 text-[13px] font-bold rounded-xl px-3 py-2.5 focus:outline-none"
              >
                <option value="AUTO">🔍 자동 검색 (서울+경기 동시)</option>
                {busCities.map(c => (
                  <option key={c.cityCode} value={c.cityCode}>{c.cityName}</option>
                ))}
              </select>

              {busTab === 'route' ? (
                // 3-A) 노선 검색 탭 바디
                <>
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
                          key={`${r.cityCode || busCityCode}-${r.routeId}`}
                          onClick={() => startBusTracking({ cityCode: r.cityCode || busCityCode, routeId: r.routeId, routeNo: r.routeNo, routeType: r.routeType })}
                          className="w-full bg-sky-50 hover:bg-sky-100 rounded-xl px-3 py-2 text-left transition"
                        >
                          <p className="text-[13px] font-black text-sky-700">
                            {r.routeNo}번
                            {r.region && <span className="ml-1 text-[9px] bg-white text-slate-500 font-bold px-1.5 py-0.5 rounded-full align-middle">{r.region}</span>}
                            <span className="ml-1 text-[10px] text-slate-400 font-bold">{r.routeType}</span>
                          </p>
                          <p className="text-[10.5px] text-slate-500 truncate">{r.start} ↔ {r.end}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 최근 추적 노선 */}
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
                </>
              ) : (
                // 3-B) 정류소 검색 탭 바디
                <>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={busStationKeyword}
                      onChange={e => setBusStationKeyword(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleBusStationSearch(); }}
                      placeholder="정류소 이름 (예: 강남역, 수원역)"
                      className="flex-1 bg-slate-50 text-[13px] font-bold rounded-xl px-3 py-2.5 focus:outline-none min-w-0"
                    />
                    <button
                      onClick={handleBusStationSearch}
                      disabled={busStationSearching}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white text-[13px] font-black px-4 rounded-xl transition shrink-0"
                    >
                      {busStationSearching ? '…' : '검색'}
                    </button>
                  </div>

                  {busStations.length > 0 && (
                    <div className="space-y-1 max-h-[160px] overflow-y-auto pr-0.5">
                      {busStations.map(s => (
                        <button
                          key={`${s.cityCode}-${s.stationId}`}
                          onClick={() => {
                            setSelectedStation({
                              stationId: s.stationId,
                              stationName: s.stationName,
                              stationNo: s.stationNo,
                              nextStationName: s.nextStationName,
                              lat: s.lat,
                              lng: s.lng,
                              cityCode: s.cityCode,
                            });
                          }}
                          className="w-full bg-emerald-50 hover:bg-emerald-100 rounded-xl px-3 py-2 text-left transition"
                        >
                          <p className="text-[13px] font-black text-emerald-700">
                            {s.stationName}
                            {s.nextStationName && (
                              <span className="ml-1 text-[10.5px] text-slate-500 font-normal">
                                (→ {s.nextStationName} 방면)
                              </span>
                            )}
                            {s.region && <span className="ml-1 text-[9px] bg-white text-slate-500 font-bold px-1.5 py-0.5 rounded-full align-middle">{s.region}</span>}
                          </p>
                          <p className="text-[10.5px] text-slate-500 truncate">{s.stationNo ? `정류소 번호: ${s.stationNo}` : '정류소 ID: ' + s.stationId}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <p className="text-[10px] text-slate-400 leading-tight text-left">
                서울·경기 포함 전국 지원. 버스 도착 예정 정보 조회를 위해서는 공공데이터포털 정류소 및 도착정보 관련 API의 사전 승인이 필요합니다.
              </p>
            </>
          )}
          {busError && <p className="text-[11px] text-rose-500 font-bold leading-tight text-left">⚠️ {busError}</p>}
        </div>
      )}

      {/* 🚇 실시간 지하철 정보 버튼 */}
      {!isLobbyBusMode && (
        <button
          type="button"
          onClick={() => setSubwayPanelOpen(o => !o)}
          className={`absolute left-4 z-30 font-black text-[10px] px-3.5 py-2.5 rounded-2xl shadow-lg flex items-center gap-1.5 transition active:translate-y-0.5 ${
            isLobbySubwayMode ? 'bottom-4' : 'bottom-[120px]'
          } ${
            selectedSubwayStation ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800'
          }`}
        >
          <span>🚇</span>
          <span>
            {selectedSubwayStation
              ? `${selectedSubwayStation.stationName} 도착 정보`
              : '지하철 정보 보기'}
          </span>
        </button>
      )}

      {/* 🚇 지하철 정보 선택 및 도착 패널 */}
      {subwayPanelOpen && !isLobbyBusMode && (
        <div className={`absolute left-4 z-30 bg-white rounded-2xl shadow-xl p-4 w-[310px] max-w-[calc(100%-32px)] font-sans space-y-2.5 ${
          isLobbySubwayMode ? 'bottom-[60px]' : 'bottom-[176px]'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-black text-slate-800">
              🚇 {selectedSubwayStation ? '지하철 도착 정보' : activeSubwayLine ? '실시간 열차 위치' : '실시간 지하철 정보'}
            </p>
            <button onClick={() => setSubwayPanelOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm w-6 h-6">✕</button>
          </div>

          {subwayError && (
            <div className="bg-rose-50 text-rose-600 text-[11px] font-bold p-2.5 rounded-xl text-left">
              ⚠️ {subwayError}
            </div>
          )}

          {/* Sub-tabs (only show when not actively tracking a station or a line) */}
          {!selectedSubwayStation && !activeSubwayLine && (
            <div className="flex border-b border-slate-100 pb-1">
              <button
                type="button"
                onClick={() => setSubwayTab('station')}
                className={`flex-1 pb-1.5 text-[12px] font-black transition text-center ${
                  subwayTab === 'station' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                역 검색
              </button>
              <button
                type="button"
                onClick={() => setSubwayTab('line')}
                className={`flex-1 pb-1.5 text-[12px] font-black transition text-center ${
                  subwayTab === 'line' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                노선 추적
              </button>
            </div>
          )}

          {selectedSubwayStation ? (
            // 지하철 도착 예정 정보 출력
            <div className="space-y-2.5">
              <div className="bg-emerald-50 rounded-xl p-2.5 text-left">
                <p className="text-[13px] font-black text-emerald-800">
                  {selectedSubwayStation.stationName}
                </p>
                <p className="text-[10px] text-emerald-600 font-bold">실시간 도착 안내</p>
              </div>

              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                {subwayArrivalLoading && subwayArrivals.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">도착 정보를 불러오는 중입니다…</p>
                ) : subwayArrivals.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">도착 예정인 열차가 없습니다.</p>
                ) : (
                  // Group arrivals by subwayId (line)
                  Array.from(new Set(subwayArrivals.map(a => a.subwayId))).map((lineId: string) => {
                    const lineArrivals = subwayArrivals.filter(a => a.subwayId === lineId);
                    const lineName = getSubwayLineName(lineId);
                    const lineColor = getSubwayLineColor(lineId);
                    return (
                      <div key={lineId} className="border border-slate-100 rounded-xl p-2 space-y-1.5 bg-slate-50/50">
                        <div className="flex items-center gap-1.5 text-left">
                          <span style={{ backgroundColor: lineColor }} className="w-2.5 h-2.5 rounded-full inline-block"></span>
                          <span className="text-[11px] font-black text-slate-700">{lineName}</span>
                        </div>
                        <div className="space-y-1">
                          {lineArrivals.map((a, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 text-left">
                              <div className="flex flex-col">
                                <span className="text-[11.5px] font-extrabold text-slate-800">{a.trainLineNm}</span>
                                <span className="text-[8.5px] text-slate-400 font-bold">열차번호 {a.trainNo} ({a.updnLine})</span>
                              </div>
                              <span className={`text-[10.5px] font-black px-2 py-0.5 rounded-full ${
                                a.arvlMsg2.includes('진입') || a.arvlMsg2.includes('도착') || a.arvlMsg2.includes('전역')
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {a.arvlMsg2}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 지하철 편의성/해맴방지 팁 (화장실 위치 등) */}
              {getRestroomTip(selectedSubwayStation.stationName) && (
                <div className="bg-sky-50 text-sky-800 text-[10px] font-bold p-2.5 rounded-xl text-left border border-sky-100 leading-relaxed">
                  <span className="font-extrabold text-sky-900 block mb-0.5">💡 해맴 방지 지하철 꿀팁!</span>
                  <span>{getRestroomTip(selectedSubwayStation.stationName)}</span>
                </div>
              )}

              <p className="text-[9.5px] text-slate-400 text-center">15초마다 자동으로 갱신됩니다.</p>
              <div className="flex gap-1.5">
                <button onClick={() => {
                  const st = selectedSubwayStation;
                  setSelectedSubwayStation(null);
                  setTimeout(() => setSelectedSubwayStation(st), 50);
                }} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[12px] font-bold py-2 rounded-xl transition">
                  새로고침
                </button>
                <button onClick={stopSubwayTracking} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[12px] font-bold py-2 rounded-xl transition">
                  추적 중지
                </button>
              </div>
            </div>
          ) : activeSubwayLine ? (
            // 2. 호선 실시간 열차 위치 추적 출력
            <div className="space-y-2.5">
              <div className="bg-emerald-50 rounded-xl p-2.5 text-left flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-black text-emerald-800">
                    🚇 {activeSubwayLine}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold">실시간 열차 위치 ({subwayLineTrains.length}대)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSubwayLine(null)}
                  className="text-[10px] bg-white text-slate-500 font-black px-2 py-1 rounded-lg border border-slate-100 hover:bg-slate-50 transition"
                >
                  노선 변경
                </button>
              </div>

              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                {subwayLineTrainsLoading && subwayLineTrains.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">열차 위치 정보를 불러오는 중입니다…</p>
                ) : subwayLineTrains.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">현재 운행 중인 열차가 없습니다.</p>
                ) : (
                  subwayLineTrains.map((t, idx) => {
                    let statusLabel = '운행';
                    if (t.trainSttus === '0') statusLabel = '진입';
                    else if (t.trainSttus === '1') statusLabel = '도착';
                    else if (t.trainSttus === '2') statusLabel = '출발';
                    else if (t.trainSttus === '3') statusLabel = '전역출발';

                    const cleanName = t.statnNm.replace(/역$/, '').trim();
                    const coords = subwayStationCoords[cleanName];

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (coords) {
                            setSearchFocusCoords([coords.lat, coords.lng]);
                          }
                        }}
                        className={`flex items-center justify-between bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl px-3 py-2 text-left cursor-pointer transition ${
                          coords ? '' : 'opacity-85'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-[12px] font-extrabold text-slate-800">{t.statnNm}역 <span className="text-[9px] text-emerald-600 font-bold">({statusLabel})</span></span>
                          <span className="text-[8.5px] text-slate-400 font-bold">열차번호 {t.trainNo} ({t.updnLine === '0' || t.updnLine.includes('상행') || t.updnLine.includes('내선') ? '상행/내선' : '하행/외선'})</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-black bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                            {t.statnTnm.replace('종착', '')}행
                          </span>
                          {coords && (
                            <span className="text-[8px] text-emerald-600 font-bold">📍 지도 포커스</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <p className="text-[9.5px] text-slate-400 text-center">15초마다 자동으로 갱신됩니다.</p>
              <button onClick={stopSubwayTracking} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-[12px] font-bold py-2 rounded-xl transition">
                추적 중지
              </button>
            </div>
          ) : subwayTab === 'station' ? (
            // 3. 지하철역 검색 UI
            <>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={subwayKeyword}
                  onChange={e => setSubwayKeyword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubwayStationSearch(); }}
                  placeholder="지하철역 이름 (예: 강남, 신도림)"
                  className="flex-1 bg-slate-50 text-[13px] font-bold rounded-xl px-3 py-2.5 focus:outline-none min-w-0"
                />
                <button
                  type="button"
                  onClick={handleSubwayStationSearch}
                  disabled={subwaySearching}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white text-[13px] font-black px-4 rounded-xl transition shrink-0"
                >
                  {subwaySearching ? '…' : '검색'}
                </button>
              </div>

              {subwayStations.length > 0 && (
                <div className="space-y-1 max-h-[180px] overflow-y-auto pr-0.5">
                  {subwayStations.map(s => (
                    <button
                      key={s.stationId}
                      onClick={() => {
                        setSelectedSubwayStation(s);
                        setSearchFocusCoords([s.lat, s.lng]);
                      }}
                      className="w-full bg-emerald-50 hover:bg-emerald-100 rounded-xl px-3 py-2 text-left transition"
                    >
                      <p className="text-[13px] font-black text-emerald-800">
                        🚇 {s.stationName}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            // 4. 노선 선택 UI
            <div className="space-y-2.5">
              <p className="text-[10.5px] font-bold text-slate-400">실시간 위치를 추적할 호선 선택</p>
              <div className="grid grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto pr-0.5">
                {[
                  { id: '1호선', name: '1호선', color: '#0052A4' },
                  { id: '2호선', name: '2호선', color: '#00A84D' },
                  { id: '3호선', name: '3호선', color: '#EF7C1C' },
                  { id: '4호선', name: '4호선', color: '#00A5DE' },
                  { id: '5호선', name: '5호선', color: '#996CAC' },
                  { id: '6호선', name: '6호선', color: '#CD7C2F' },
                  { id: '7호선', name: '7호선', color: '#747F00' },
                  { id: '8호선', name: '8호선', color: '#E6186C' },
                  { id: '9호선', name: '9호선', color: '#BDB092' },
                  { id: '수인분당선', name: '수인분당', color: '#F5A200' },
                  { id: '신분당선', name: '신분당선', color: '#D4003B' },
                  { id: '경의중앙선', name: '경의중앙', color: '#77C4A3' },
                  { id: '공항철도', name: '공항철도', color: '#0090D2' },
                  { id: '경춘선', name: '경춘선', color: '#0C8E72' },
                  { id: '우이신설선', name: '우이신설', color: '#B7C452' }
                ].map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setActiveSubwayLine(l.id)}
                    style={{ borderLeft: `3px solid ${l.color}` }}
                    className="bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-bold py-2 px-1 rounded-xl transition text-center shadow-sm border border-slate-100"
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 🚇 지하철 실시간 정보 보조 헬퍼 함수 =====
const getSubwayLineName = (subwayId: string): string => {
  switch (subwayId) {
    case '1001': return '1호선';
    case '1002': return '2호선';
    case '1003': return '3호선';
    case '1004': return '4호선';
    case '1005': return '5호선';
    case '1006': return '6호선';
    case '1007': return '7호선';
    case '1008': return '8호선';
    case '1009': return '9호선';
    case '1061': return '경의중앙선';
    case '1063': return '경의선';
    case '1065': return '공항철도';
    case '1067': return '경춘선';
    case '1075': return '수인분당선';
    case '1077': return '신분당선';
    case '1092': return '우이신설선';
    case '1093': return '서해선';
    case '1081': return '경강선';
    case '1032': return 'GTX-A';
    default: return '지하철';
  }
};

const getSubwayLineColor = (subwayId: string): string => {
  switch (subwayId) {
    case '1001': return '#0052A4';
    case '1002': return '#00A84D';
    case '1003': return '#EF7C1C';
    case '1004': return '#00A5DE';
    case '1005': return '#996CAC';
    case '1006': return '#CD7C2F';
    case '1007': return '#747F00';
    case '1008': return '#E6186C';
    case '1009': return '#BDB092';
    case '1061':
    case '1063': return '#77C4A3';
    case '1065': return '#0090D2';
    case '1067': return '#0C8E72';
    case '1075': return '#F5A200';
    case '1077': return '#D4003B';
    case '1092': return '#B7C452';
    case '1093': return '#81A914';
    case '1081': return '#003DA5';
    case '1032': return '#9B1B30';
    default: return '#475569';
  }
};

const getRestroomTip = (stationName: string): string => {
  const name = stationName.replace(/역$/, '').trim();
  if (name.includes('강남')) {
    return '개찰구 내부(안쪽) 지하 1층 2호선 승강장 및 7/8번 출구 근처에 화장실이 있습니다.';
  }
  if (name.includes('신도림')) {
    return '1호선 승강장 내부 및 2호선 개찰구 밖(1, 5번 출구 지하 광장)에 화장실이 있어 편리합니다.';
  }
  if (name.includes('서울')) {
    return '공항철도 지하 2층 개찰구 안쪽, 1/4호선 지하 대합실 개찰구 바깥 대합실 중앙(공항철도 연결통로 부근)에 위치해 있습니다.';
  }
  if (name.includes('홍대입구')) {
    return '2호선 개찰구 바깥(8/9번 출구 방향) 및 공항철도/경의중앙선 환승통로 부근(개찰구 내부)에 있습니다.';
  }
  if (name.includes('고속터미널')) {
    return '3/7/9호선 환승 통로 개찰구 내부와 7호선 대합실 개찰구 밖(3/4번 출구 방향)에 화장실이 있습니다.';
  }
  if (name.includes('사당')) {
    return '2/4호선 환승 통로(개찰구 내부) 및 4호선 지하 대합실 개찰구 바깥(13/14번 출구 방향)에 있습니다.';
  }
  if (name.includes('신촌')) {
    return '2호선 개찰구 바깥(7/8번 출구 방향) 대합실 쪽에 화장실이 있습니다.';
  }
  if (name.includes('혜화')) {
    return '4호선 개찰구 안쪽 승강장 화장실이 없으므로, 개찰구 밖 대합실 중앙 화장실을 이용해 주세요.';
  }
  if (name.includes('건대입구')) {
    return '2호선 개찰구 안(승강장 연결통로) 및 7호선 지하 대합실 개찰구 밖(3/4번 출구 방향)에 있습니다.';
  }
  if (name.includes('잠실')) {
    return '2호선 개찰구 안(대합실 내부) 및 8호선 개찰구 밖(9/10번 출구 방향 지하상가)에 화장실이 있습니다.';
  }
  if (name.includes('여의도')) {
    return '5/9호선 지하 2층 환승 통로(개찰구 내부) 및 5호선 대합실 개찰구 밖(3/4번 출구 쪽)에 있습니다.';
  }
  if (name.includes('명동')) {
    return '4호선 지하 대합실 개찰구 바깥(1~10번 출구 방향 대합실 남단)에 화장실이 있습니다.';
  }
  if (name.includes('동대문역사문화공원')) {
    return '2호선 개찰구 밖(1/2/14번 출구 방향) 및 4/5호선 환승통로(개찰구 내부)에 있습니다.';
  }
  return '역내 대합실(개찰구 주변) 또는 개찰구 안팎 연결 통로의 이정표를 따라 이동하시면 화장실을 이용할 수 있습니다.';
};

// ===== 버스 종류별 고유 색상 및 네온 정보 매핑 헬퍼 =====
function getBusTypeColor(routeType?: string, routeNo?: string): { main: string; neon: string; rgb: string; label: string } {
  const type = (routeType || '').trim();
  const no = (routeNo || '').trim();

  // 1. 광역 / 직행좌석 (Red)
  if (
    type.includes('광역') ||
    type.includes('직행좌석') ||
    no.startsWith('M') ||
    (no.length >= 4 && no.startsWith('9') && !type.includes('마을'))
  ) {
    return { main: '#E11D48', neon: '#FF4560', rgb: '255, 69, 96', label: '광역' };
  }

  // 2. 간선 / 일반좌석 (Blue)
  if (type.includes('간선') || type.includes('좌석') || (no.length === 3 && !isNaN(Number(no)))) {
    return { main: '#1D4ED8', neon: '#39D4FF', rgb: '57, 212, 255', label: '간선' };
  }

  // 3. 순환 (Yellow/Orange)
  if (type.includes('순환')) {
    return { main: '#D97706', neon: '#FFE239', rgb: '255, 226, 57', label: '순환' };
  }

  // 4. 지선 / 마을 / 일반 (Green)
  // Default for others is Green (마을/지선)
  return { main: '#047857', neon: '#39FF14', rgb: '57, 255, 20', label: '지선/마을' };
}

// ===== 지하철 열차 진행 방향각 추정 헬퍼 =====
function getSubwayTrainRotation(lineName: string, updnLine: string): number {
  const isNorthSouth = 
    lineName.includes('1호선') ||
    lineName.includes('3호선') ||
    lineName.includes('4호선') ||
    lineName.includes('7호선') ||
    lineName.includes('8호선') ||
    lineName.includes('신분당선') ||
    lineName.includes('수인분당선') ||
    lineName.includes('우이신설선') ||
    lineName.includes('서해선') ||
    lineName.includes('GTX');
    
  if (isNorthSouth) {
    // 0 (상행): North (-90 deg), 1 (하행): South (90 deg)
    return updnLine === '0' || updnLine.includes('상행') || updnLine.includes('내선') ? -90 : 90;
  } else {
    // East-West or Circular
    // 0 (상행): West (180 deg), 1 (하행): East (0 deg)
    return updnLine === '0' || updnLine.includes('상행') || updnLine.includes('내선') ? 180 : 0;
  }
}

// ===== 지하철 호선별 네온 데코레이션 디테일 헬퍼 =====
function getSubwayLineNeonDetails(subwayId: string): { neon: string; rgb: string } {
  switch (subwayId) {
    case '1001': return { neon: '#39D4FF', rgb: '57, 212, 255' };
    case '1002': return { neon: '#39FF14', rgb: '57, 255, 20' };
    case '1003': return { neon: '#FFA339', rgb: '255, 163, 57' };
    case '1004': return { neon: '#39E6FF', rgb: '57, 230, 255' };
    case '1005': return { neon: '#E699FF', rgb: '230, 153, 255' };
    case '1006': return { neon: '#D4A373', rgb: '212, 163, 115' };
    case '1007': return { neon: '#D4FF39', rgb: '212, 255, 57' };
    case '1008': return { neon: '#FF579F', rgb: '255, 87, 159' };
    case '1009': return { neon: '#FFE239', rgb: '255, 226, 57' };
    case '1077': return { neon: '#FF397F', rgb: '255, 57, 127' };
    default: return { neon: '#39FF14', rgb: '57, 255, 20' }; // Default neon green
  }
}
