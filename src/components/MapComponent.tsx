/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { Friend, Appointment } from '../types';
import { Search, Loader2, X, MapPin, Crosshair } from 'lucide-react';

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

// ─── 마커 HTML ───────────────────────────────────────────────────────────────
function friendMarkerHtml(friend: Friend, isSelected: boolean, isMe: boolean): string {
  const ring = isSelected ? 'outline:3px solid #111;outline-offset:2px;transform:scale(1.18)' : '';
  const border = isMe ? 'border:2px dashed #EAB308' : 'border:2px solid #111';
  const hrBadge = friend.heartRate
    ? `<div style="position:absolute;top:-4px;left:-10px;background:#EF4444;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2">♥${friend.heartRate}</div>`
    : '';
  const statusSnippet = friend.statusMsg
    ? `<div style="background:#fff;color:#374151;font-size:7px;font-weight:600;border:1px solid #E5E7EB;border-radius:5px;padding:1px 4px;margin-bottom:2px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${friend.statusMsg.slice(0, 9)}${friend.statusMsg.length > 9 ? '…' : ''}</div>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    ${statusSnippet}
    <div style="position:relative;width:28px;height:28px;background:${friend.color};${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;${ring}">
      ${friend.avatar}
      ${hrBadge}
      <div style="position:absolute;bottom:-4px;right:-7px;background:#1F2937;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2">${friend.battery}%</div>
      <div style="position:absolute;top:0;right:0;width:8px;height:8px;background:${friend.isOnline ? '#34D399' : '#9CA3AF'};border:1.5px solid #fff;border-radius:50%"></div>
    </div>
    <div style="background:#fff;border:1px solid #D1D5DB;color:#111;font-size:7px;font-weight:600;padding:1px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:sans-serif">${friend.name.split(' ')[0]}${friend.speed > 0 ? ` ·${Math.round(friend.speed)}k` : ''}</div>
  </div>`;
}

export default function MapComponent({
  friends, appointments, activeProfileId,
  selectedFriendId, selectedPromiseId,
  onMapClick, tempPromiseCoords,
  myGpsCoords = null, centerOnMyGpsOnce = false, onMyGpsCentered,
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const polyGroupRef = useRef<L.LayerGroup | null>(null);
  const myMarkerRef = useRef<L.Marker | L.CircleMarker | null>(null);

  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 지도 초기화 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [37.5565, 126.9242],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    // VWorld 한국 공식 지도 (1순위) → CartoDB 폴백
    const vworld = L.tileLayer(
      'https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png',
      { maxZoom: 19, errorTileUrl: '' }
    );

    const carto = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { maxZoom: 19, subdomains: 'abcd' }
    );

    // VWorld 로드 실패 시 CartoDB로 자동 전환
    vworld.on('tileerror', () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(vworld);
        carto.addTo(mapInstanceRef.current);
      }
    });
    vworld.addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerGroupRef.current = L.layerGroup().addTo(map);
    polyGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ── 마커 + 경로 업데이트 ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const mg = markerGroupRef.current;
    const pg = polyGroupRef.current;
    if (!map || !mg || !pg) return;

    mg.clearLayers();
    pg.clearLayers();

    // 경로 선
    friends.forEach(f => {
      if (!f.route || f.route.length < 2) return;
      const validRoute = f.route.filter(coord => 
        coord && typeof coord[0] === 'number' && typeof coord[1] === 'number' && !isNaN(coord[0]) && !isNaN(coord[1])
      );
      if (validRoute.length < 2) return;
      
      const poly = L.polyline(validRoute as L.LatLngTuple[], {
        color: f.color,
        weight: selectedFriendId === f.id ? 4 : 2,
        opacity: selectedFriendId === f.id ? 0.85 : 0.4,
      });
      pg.addLayer(poly);
    });

    // 약속 장소까지 실선 연결 (각 멤버의 색상 사용)
    appointments.forEach(app => {
      if (typeof app.lat !== 'number' || typeof app.lng !== 'number' || isNaN(app.lat) || isNaN(app.lng)) return;
      
      friends.forEach(f => {
        const lat = f.id === activeProfileId && myGpsCoords ? myGpsCoords[0] : f.lat;
        const lng = f.id === activeProfileId && myGpsCoords ? myGpsCoords[1] : f.lng;
        
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
        
        const line = L.polyline([[lat, lng], [app.lat, app.lng]] as L.LatLngTuple[], {
          color: f.color || '#3B82F6',
          weight: selectedFriendId === f.id ? 4 : 2.5,
          opacity: selectedFriendId === f.id ? 0.9 : 0.6,
          dashArray: 'none', // 실선
        });
        line.bindTooltip(`${f.name} → 약속 장소`, { direction: 'top', sticky: true });
        pg.addLayer(line);
      });
    });

    // 약속 마커
    appointments.forEach(app => {
      if (typeof app.lat !== 'number' || typeof app.lng !== 'number' || isNaN(app.lat) || isNaN(app.lng)) return;
      
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:36px;height:36px;background:#FBBF24;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:2px 2px 0 #111">📍</div>
          <div style="background:#111;color:#FDE68A;font-size:9px;font-weight:900;padding:2px 6px;border-radius:5px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;font-family:sans-serif">${app.title.length > 9 ? app.title.slice(0, 9) + '…' : app.title}</div>
        </div>`,
        iconSize: [40, 52],
        iconAnchor: [20, 48],
      });
      const m = L.marker([app.lat, app.lng], { icon });
      m.bindTooltip(`<b>${app.title}</b><br>📍 ${app.placeName}<br>🕒 ${app.datetime}`, { direction: 'top' });
      mg.addLayer(m);
    });

    // 임시 핀
    if (tempPromiseCoords && typeof tempPromiseCoords[0] === 'number' && typeof tempPromiseCoords[1] === 'number' && !isNaN(tempPromiseCoords[0]) && !isNaN(tempPromiseCoords[1])) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center;animation:bounce 1s infinite">
          <div style="width:32px;height:32px;background:#EF4444;border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px">⭐️</div>
          <div style="background:#111;color:#FCA5A5;font-size:8px;font-weight:900;padding:1px 5px;border-radius:4px;margin-top:2px;font-family:sans-serif">여기 소집</div>
        </div>`,
        iconSize: [36, 46],
        iconAnchor: [18, 42],
      });
      mg.addLayer(L.marker(tempPromiseCoords, { icon }));
    }

    // 친구 마커
    friends.forEach(f => {
      // 내 실시간 GPS 마커가 지도 위에 표시되므로 중복 마커 방지를 위해 f.id === activeProfileId 이고 myGpsCoords가 있는 경우는 스킵
      if (f.id === activeProfileId && myGpsCoords) return;
      if (typeof f.lat !== 'number' || typeof f.lng !== 'number' || isNaN(f.lat) || isNaN(f.lng)) return;

      const icon = L.divIcon({
        className: '',
        html: friendMarkerHtml(f, selectedFriendId === f.id, f.id === activeProfileId),
        iconSize: [36, 48],
        iconAnchor: [18, 42],
      });
      const m = L.marker([f.lat, f.lng], { icon, zIndexOffset: selectedFriendId === f.id ? 1000 : 0 });
      m.bindTooltip(
        `<b>${f.avatar} ${f.name}</b><br>"${f.statusMsg}"<br>속도: ${f.speed}km/h · ${f.heading}`,
        { direction: 'top' }
      );
      mg.addLayer(m);
    });
  }, [friends, appointments, activeProfileId, selectedFriendId, selectedPromiseId, tempPromiseCoords]);

  // ── 포커스 이동 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (selectedFriendId) {
      const f = friends.find(fr => fr.id === selectedFriendId);
      if (f) map.flyTo([f.lat, f.lng], 16, { animate: true, duration: 1.2 });
    } else if (selectedPromiseId) {
      const a = appointments.find(ap => ap.id === selectedPromiseId);
      if (a) map.flyTo([a.lat, a.lng], 16, { animate: true, duration: 1.2 });
    } else if (tempPromiseCoords) {
      map.flyTo(tempPromiseCoords, 16, { animate: true, duration: 1.0 });
    }
  }, [selectedFriendId, selectedPromiseId, tempPromiseCoords]);

  // ── 내 위치 프로필 모양 마커 업데이트 ────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !myGpsCoords || typeof myGpsCoords[0] !== 'number' || typeof myGpsCoords[1] !== 'number' || isNaN(myGpsCoords[0]) || isNaN(myGpsCoords[1])) return;

    const myProfile = friends.find(f => f.id === activeProfileId) || {
      avatar: localStorage.getItem('aemang_fruit') || '🍎',
      color: '#EF4444',
      name: '나'
    };

    const myHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
      <div style="position:relative;width:30px;height:30px;background:${myProfile.color};border:2px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:2px 2px 0px 0px rgba(0,0,0,1)">
        ${myProfile.avatar}
        <div style="position:absolute;bottom:-4px;right:-7px;background:#3B82F6;color:#fff;font-size:6px;font-weight:700;padding:1px 3px;border-radius:8px;line-height:1.2;border:1px solid #111">내 위치</div>
      </div>
    </div>`;

    if (myMarkerRef.current && 'setIcon' in myMarkerRef.current) {
      (myMarkerRef.current as L.Marker).setLatLng(myGpsCoords);
      (myMarkerRef.current as L.Marker).setIcon(L.divIcon({
        className: '',
        html: myHtml,
        iconSize: [36, 42],
        iconAnchor: [18, 36],
      }));
    } else {
      // 기존에 circleMarker 등이 생성되어 있었다면 제거
      if (myMarkerRef.current) {
        myMarkerRef.current.remove();
        myMarkerRef.current = null;
      }
      myMarkerRef.current = L.marker(myGpsCoords, {
        icon: L.divIcon({
          className: '',
          html: myHtml,
          iconSize: [36, 42],
          iconAnchor: [18, 36],
        }),
        pane: 'markerPane',
      }).addTo(map) as any;
      myMarkerRef.current.bindTooltip('내 위치', { direction: 'top', permanent: false });
    }
  }, [myGpsCoords, friends, activeProfileId]);

  // ── 최초 GPS 이동 ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !myGpsCoords || !centerOnMyGpsOnce) return;
    if (selectedFriendId || selectedPromiseId) return;
    map.flyTo(myGpsCoords, 16, { animate: true, duration: 1.0 });
    onMyGpsCentered?.();
  }, [myGpsCoords, centerOnMyGpsOnce]);

  // ── 내 위치로 이동 버튼 핸들러 ───────────────────────────────────────────
  const handleGoToMyLocation = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !myGpsCoords) return;
    map.flyTo(myGpsCoords, 17, { animate: true, duration: 0.8 });
  }, [myGpsCoords]);

  // ── 장소 검색 (Nominatim) ────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!mapSearch.trim()) { setMapResults([]); setShowResults(false); return; }

    setIsSearching(true);
    setShowResults(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(mapSearch)}`);
        const data: PlaceResult[] = await res.json();
        setMapResults(data);
      } catch { setMapResults([]); }
      finally { setIsSearching(false); }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mapSearch]);

  const handleSelectResult = (place: PlaceResult) => {
    const map = mapInstanceRef.current;
    if (map) map.flyTo([place.lat, place.lng], 17, { animate: true, duration: 1.0 });
    onMapClick(place.lat, place.lng);
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

      {/* 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 bg-yellow-400 text-slate-950 font-black border-2 border-black text-[9.5px] px-3 py-2 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] z-20 pointer-events-none flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-black border border-white animate-pulse" />
        <span>지도를 터치하면 소집 장소로 지정됩니다 🧭</span>
      </div>
    </div>
  );
}
