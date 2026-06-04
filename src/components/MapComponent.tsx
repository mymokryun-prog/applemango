/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Friend, Appointment } from '../types';
import { Search, Loader2, X, MapPin } from 'lucide-react';

declare global {
  interface Window { kakao: any; }
}

interface MapComponentProps {
  friends: Friend[];
  appointments: Appointment[];
  activeProfileId: string;
  selectedFriendId: string | null;
  selectedPromiseId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  tempPromiseCoords: [number, number] | null;
  myGpsCoords?: [number, number] | null;
  centerOnMyGpsOnce?: boolean;
  onMyGpsCentered?: () => void;
}

interface PlaceResult { name: string; address: string; lat: number; lng: number; }

// ─── Kakao SDK 싱글턴 로더 ───────────────────────────────────────────────────
// 키를 서버 /api/config 에서 런타임에 가져옴 → Koyeb 환경변수 변경 시 재빌드 불필요
let sdkPromise: Promise<void> | null = null;

async function fetchKakaoKey(): Promise<string> {
  // 1순위: 빌드 타임 변수 (로컬 개발용)
  const buildKey = (import.meta as any).env?.VITE_KAKAO_MAP_KEY as string | undefined;
  if (buildKey) return buildKey;
  // 2순위: 서버 런타임 설정 API
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    return data.kakaoMapKey || '';
  } catch {
    return '';
  }
}

function loadKakaoSDK(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    if (window.kakao?.maps) return;
    const appKey = await fetchKakaoKey();
    if (!appKey) throw new Error('카카오맵 키가 없습니다. Koyeb 환경변수에 KAKAO_MAP_KEY를 설정하세요.');
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
      script.async = true;
      script.onload = () => window.kakao.maps.load(resolve);
      script.onerror = () => { sdkPromise = null; reject(new Error('카카오맵 SDK 로드 실패')); };
      document.head.appendChild(script);
    });
  })();
  sdkPromise.catch(() => { sdkPromise = null; });
  return sdkPromise;
}

// ─── 마커 HTML 빌더 ─────────────────────────────────────────────────────────
function buildFriendHTML(friend: Friend, isSelected: boolean, isMe: boolean): string {
  const ring = isSelected
    ? 'outline:3px solid #111;outline-offset:2px;transform:scale(1.18)'
    : '';
  const border = isMe ? 'border:2px dashed #EAB308' : 'border:2px solid #111';
  const statusSnippet = friend.statusMsg
    ? `<div style="background:#fff;color:#374151;font-size:8px;font-weight:600;border:1px solid #E5E7EB;border-radius:6px;padding:1px 5px;margin-bottom:2px;max-width:72px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${friend.statusMsg.slice(0, 9)}${friend.statusMsg.length > 9 ? '…' : ''}</div>`
    : '';
  const hrBadge = friend.heartRate
    ? `<div style="position:absolute;top:-3px;left:-10px;background:#EF4444;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1">♥${friend.heartRate}</div>`
    : '';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none">
      ${statusSnippet}
      <div style="position:relative;width:28px;height:28px;background:${friend.color};${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;${ring}">
        ${friend.avatar}
        ${hrBadge}
        <div style="position:absolute;bottom:-3px;right:-7px;background:#1F2937;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1">${friend.battery}%</div>
        <div style="position:absolute;top:0;right:0;width:8px;height:8px;background:${friend.isOnline ? '#34D399' : '#9CA3AF'};border:1.5px solid #fff;border-radius:50%"></div>
      </div>
      <div style="background:#fff;border:1px solid #D1D5DB;color:#111;font-size:8px;font-weight:600;padding:1px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:sans-serif">${friend.name.split(' ')[0]}${friend.speed > 0 ? ` ·${Math.round(friend.speed)}k` : ''}</div>
    </div>`;
}

function buildAppointmentHTML(title: string, isSelected: boolean): string {
  const scale = isSelected ? 'transform:scale(1.12)' : '';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${scale}">
      <div style="width:36px;height:36px;background:#FBBF24;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:2px 2px 0 #111">📍</div>
      <div style="background:#111;color:#FDE68A;font-size:10px;font-weight:900;padding:2px 6px;border-radius:6px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${title.length > 9 ? title.slice(0, 9) + '…' : title}</div>
    </div>`;
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export default function MapComponent({
  friends, appointments, activeProfileId,
  selectedFriendId, selectedPromiseId,
  onMapClick, tempPromiseCoords,
  myGpsCoords = null, centerOnMyGpsOnce = false, onMyGpsCentered,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  const [sdkState, setSdkState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SDK 로드
  useEffect(() => {
    loadKakaoSDK()
      .then(() => setSdkState('ready'))
      .catch(() => setSdkState('error'));
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (sdkState !== 'ready' || !mapContainerRef.current || mapRef.current) return;
    const { kakao } = window;
    const map = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(37.5565, 126.9242),
      level: 4,
    });
    mapRef.current = map;

    kakao.maps.event.addListener(map, 'click', (e: any) => {
      onMapClick(e.latLng.getLat(), e.latLng.getLng());
    });
  }, [sdkState, onMapClick]);

  // 마커/경로 업데이트
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sdkState !== 'ready') return;
    const { kakao } = window;

    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    // 친구 이동 경로
    friends.forEach(friend => {
      if (!friend.route || friend.route.length < 2) return;
      const path = friend.route.map(([la, ln]: [number, number]) => new kakao.maps.LatLng(la, ln));
      const poly = new kakao.maps.Polyline({
        path,
        strokeWeight: selectedFriendId === friend.id ? 3 : 1.5,
        strokeColor: friend.color,
        strokeOpacity: selectedFriendId === friend.id ? 0.85 : 0.35,
        strokeStyle: 'solid',
      });
      poly.setMap(map);
      polylinesRef.current.push(poly);
    });

    // 약속 마커
    appointments.forEach(app => {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(app.lat, app.lng),
        content: buildAppointmentHTML(app.title, selectedPromiseId === app.id),
        yAnchor: 1,
        zIndex: 3,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // 임시 핀 (약속 위치 지정)
    if (tempPromiseCoords) {
      const content = `
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:32px;height:32px;background:#EF4444;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;animation:bounce 1s infinite">⭐️</div>
          <div style="background:#111;color:#FCA5A5;font-size:9px;font-weight:900;padding:1px 5px;border-radius:5px;margin-top:2px;font-family:sans-serif">여기 소집</div>
        </div>`;
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(tempPromiseCoords[0], tempPromiseCoords[1]),
        content, yAnchor: 1, zIndex: 4,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 친구 마커
    friends.forEach(friend => {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(friend.lat, friend.lng),
        content: buildFriendHTML(friend, selectedFriendId === friend.id, friend.id === activeProfileId),
        yAnchor: 1,
        zIndex: selectedFriendId === friend.id ? 5 : 2,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });
  }, [friends, appointments, activeProfileId, selectedFriendId, selectedPromiseId, tempPromiseCoords, sdkState]);

  // 선택된 항목으로 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sdkState !== 'ready') return;
    const { kakao } = window;

    if (selectedFriendId) {
      const f = friends.find(fr => fr.id === selectedFriendId);
      if (f) { map.panTo(new kakao.maps.LatLng(f.lat, f.lng)); map.setLevel(4); }
    } else if (selectedPromiseId) {
      const a = appointments.find(ap => ap.id === selectedPromiseId);
      if (a) { map.panTo(new kakao.maps.LatLng(a.lat, a.lng)); map.setLevel(4); }
    } else if (tempPromiseCoords) {
      map.panTo(new kakao.maps.LatLng(tempPromiseCoords[0], tempPromiseCoords[1]));
    }
  }, [selectedFriendId, selectedPromiseId, tempPromiseCoords, sdkState]);

  // GPS 위치로 최초 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sdkState !== 'ready' || !myGpsCoords || !centerOnMyGpsOnce) return;
    if (selectedFriendId || selectedPromiseId) return;
    const { kakao } = window;
    map.panTo(new kakao.maps.LatLng(myGpsCoords[0], myGpsCoords[1]));
    map.setLevel(4);
    onMyGpsCentered?.();
  }, [myGpsCoords, centerOnMyGpsOnce, sdkState, selectedFriendId, selectedPromiseId, onMyGpsCentered]);

  // 카카오 장소 검색
  const searchPlaces = useCallback((query: string) => {
    if (!query.trim() || sdkState !== 'ready') {
      setMapResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    setShowResults(true);
    const ps = new window.kakao.maps.services.Places();
    const center = mapRef.current?.getCenter();
    ps.keywordSearch(
      query,
      (data: any[], status: string) => {
        setIsSearching(false);
        if (status === window.kakao.maps.services.Status.OK) {
          setMapResults(data.slice(0, 8).map((item: any) => ({
            name: item.place_name,
            address: item.road_address_name || item.address_name,
            lat: parseFloat(item.y),
            lng: parseFloat(item.x),
          })));
        } else {
          setMapResults([]);
        }
      },
      { location: center, sort: window.kakao.maps.services.SortBy?.DISTANCE }
    );
  }, [sdkState]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!mapSearch.trim()) { setMapResults([]); setShowResults(false); return; }
    searchDebounce.current = setTimeout(() => searchPlaces(mapSearch), 500);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [mapSearch, searchPlaces]);

  const handleSelectResult = (place: PlaceResult) => {
    const map = mapRef.current;
    if (map && sdkState === 'ready') {
      map.panTo(new window.kakao.maps.LatLng(place.lat, place.lng));
      map.setLevel(3);
    }
    onMapClick(place.lat, place.lng);
    setMapSearch('');
    setShowResults(false);
  };

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  if (sdkState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-500 gap-3 p-8 text-center">
        <span className="text-4xl">🗺️</span>
        <p className="text-sm font-semibold leading-relaxed">카카오맵을 불러오지 못했습니다.</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Koyeb 대시보드 → 서비스 → Environment Variables<br />
          <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">KAKAO_MAP_KEY</code> 추가 후 Redeploy
        </p>
        <button
          onClick={() => { sdkPromise = null; setSdkState('loading'); loadKakaoSDK().then(() => setSdkState('ready')).catch(() => setSdkState('error')); }}
          className="mt-2 bg-amber-400 hover:bg-amber-500 text-black font-bold px-4 py-2 rounded-xl text-sm transition"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (sdkState === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm">카카오맵 불러오는 중…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* 지도 컨테이너 */}
      <div ref={mapContainerRef} className="w-full h-full" />

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
            placeholder="장소 검색 (카카오맵)"
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

      {/* 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 bg-yellow-400 text-slate-950 font-black border-2 border-black text-[9.5px] px-3 py-2 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] z-20 pointer-events-none flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-black border border-white animate-pulse" />
        <span>지도를 터치하면 소집 장소로 지정됩니다 🧭</span>
      </div>
    </div>
  );
}
