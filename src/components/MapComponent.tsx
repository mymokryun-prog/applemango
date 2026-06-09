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
function friendMarkerHtml(friend: Friend, isSelected: boolean, isMe: boolean): string {
  const isOffline = friend.isOnline === false;
  // 로그아웃/앱종료(오프라인) 친구는 마지막 위치에 고정 표시 — 어둡게 + 굵은 검정 테두리
  const markerBg = isOffline ? '#4B5563' : friend.color;
  const ring = isSelected ? 'outline:3px solid #111;outline-offset:2px;transform:scale(1.18)' : '';
  const border = isMe ? 'border:2px dashed #EAB308' : (isOffline ? 'border:3px solid #000' : 'border:2px solid #111');
  const hrBadge = friend.heartRate
    ? `<div style="position:absolute;top:-4px;left:-10px;background:#EF4444;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2">♥${friend.heartRate}</div>`
    : '';
  const statusSnippet = friend.statusMsg
    ? `<div style="background:#fff;color:#374151;font-size:7px;font-weight:600;border:1px solid #E5E7EB;border-radius:5px;padding:1px 4px;margin-bottom:2px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${friend.statusMsg.slice(0, 9)}${friend.statusMsg.length > 9 ? '…' : ''}</div>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    ${statusSnippet}
    <div style="position:relative;width:28px;height:28px;background:${markerBg};${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;${ring}">
      ${friend.avatar}
      ${hrBadge}
      <div style="position:absolute;bottom:-4px;right:-7px;background:#1F2937;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2">${friend.battery}%</div>
      <div style="position:absolute;top:0;right:0;width:8px;height:8px;background:${friend.isOnline ? '#34D399' : '#9CA3AF'};border:1.5px solid #fff;border-radius:50%"></div>
    </div>
    <div style="background:#fff;border:1px solid #D1D5DB;color:#111;font-size:7px;font-weight:600;padding:1px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:sans-serif">${friend.name.split(' ')[0]}${friend.speed > 0 ? ` ·${Math.round(friend.speed)}k` : ''}</div>
  </div>`;
}

function appointmentMarkerHtml(app: Appointment): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div style="width:36px;height:36px;background:#FBBF24;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:2px 2px 0 #111">📍</div>
    <div style="background:#111;color:#FDE68A;font-size:9px;font-weight:900;padding:2px 6px;border-radius:5px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${app.title.length > 9 ? app.title.slice(0, 9) + '…' : app.title}</div>
  </div>`;
}

function tempPromiseMarkerHtml(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;animation:bounce 1s infinite;cursor:pointer">
    <div style="width:32px;height:32px;background:#EF4444;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px">⭐️</div>
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
function computeSpread<T extends { lat: number; lng: number }>(items: T[]) {
  const groups: Record<string, T[]> = {};
  items.forEach(it => {
    const key = `${it.lat.toFixed(4)},${it.lng.toFixed(4)}`;
    (groups[key] = groups[key] || []).push(it);
  });
  const out: Array<T & { dLat: number; dLng: number; grouped: boolean; gLat: number; gLng: number }> = [];
  Object.values(groups).forEach(group => {
    const n = group.length;
    group.forEach((it, i) => {
      if (n === 1) {
        out.push({ ...it, dLat: it.lat, dLng: it.lng, grouped: false, gLat: it.lat, gLng: it.lng });
      } else {
        const step = 0.00020;
        const dLng = it.lng + (i - (n - 1) / 2) * step;
        out.push({ ...it, dLat: it.lat + 0.00014, dLng, grouped: true, gLat: it.lat, gLng: it.lng });
      }
    });
  });
  return out;
}

function selfMarkerHtml(myProfile: { avatar: string; color: string; name: string }): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div style="position:relative;width:30px;height:30px;background:${myProfile.color};border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:2px 2px 0px 0px rgba(0,0,0,1)">
      ${myProfile.avatar}
      <div style="position:absolute;bottom:-4px;right:-7px;background:#3B82F6;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2;border:1px solid #111">내 위치</div>
    </div>
  </div>`;
}

export default function MapComponent({
  friends, appointments, activeProfileId,
  selectedFriendId, selectedPromiseId,
  onMapClick, tempPromiseCoords, mapViewCoords = null, isPersonalRoom = false,
  myGpsCoords = null, centerOnMyGpsOnce = false, onMyGpsCentered,
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
  // 지도 클릭 리스너는 1회만 등록되므로 최신 onMapClick을 ref로 참조(stale 클로저 방지)
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

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

    const myProfile = friends.find(f => f.id === activeProfileId) || {
      avatar: localStorage.getItem('aemang_fruit') || '🍎',
      color: '#EF4444',
      name: '나'
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
        className={`absolute bottom-4 left-4 z-30 font-black border-2 border-black text-[10px] px-3 py-2 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1.5 transition active:translate-y-0.5 ${
          placeSelectMode ? 'bg-rose-500 text-white animate-pulse' : 'bg-yellow-400 text-slate-950'
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full border border-white ${placeSelectMode ? 'bg-white' : 'bg-black'}`} />
        <span>{placeSelectMode ? '지도를 터치해 장소를 지정하세요 (취소하려면 다시 탭)' : '📍 소집 장소 지정하기'}</span>
      </button>
    </div>
  );
}
