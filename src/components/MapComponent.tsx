/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Friend, Appointment } from '../types';
import { Search, Loader2, X } from 'lucide-react';

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

export default function MapComponent({
  friends,
  appointments,
  activeProfileId,
  selectedFriendId,
  selectedPromiseId,
  onMapClick,
  tempPromiseCoords,
  myGpsCoords = null,
  centerOnMyGpsOnce = false,
  onMyGpsCentered,
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const polylineGroupRef = useRef<L.LayerGroup | null>(null);

  // 지도 내 장소 검색 상태
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState<PlaceResult[]>([]);
  const [isMapSearching, setIsMapSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const mapSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mapSearchDebounce.current) clearTimeout(mapSearchDebounce.current);
    if (!mapSearch.trim()) { setMapResults([]); setShowResults(false); return; }

    setIsMapSearching(true);
    setShowResults(true);
    mapSearchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(mapSearch)}`);
        const data: PlaceResult[] = await res.json();
        setMapResults(data);
      } catch { setMapResults([]); }
      finally { setIsMapSearching(false); }
    }, 600);

    return () => { if (mapSearchDebounce.current) clearTimeout(mapSearchDebounce.current); };
  }, [mapSearch]);

  const handleSelectMapResult = (place: PlaceResult) => {
    const map = leafletMapInstanceRef.current;
    if (map) map.flyTo([place.lat, place.lng], 17, { animate: true, duration: 1.0 });
    onMapClick(place.lat, place.lng);
    setMapSearch('');
    setShowResults(false);
    setMapResults([]);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || leafletMapInstanceRef.current) return;

    // Centered around Hongdae (Seoul, South Korea)
    const initialLat = 37.5565;
    const initialLng = 126.9242;

    const map = L.map(mapRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: false, // Position customly later
      attributionControl: false // keep tidy
    });

    // Elegant Light-colored Tile layer working beautifully in Korea
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    leafletMapInstanceRef.current = map;
    markerGroupRef.current = L.layerGroup().addTo(map);
    polylineGroupRef.current = L.layerGroup().addTo(map);

    // Map click listener
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      if (leafletMapInstanceRef.current) {
        leafletMapInstanceRef.current.remove();
        leafletMapInstanceRef.current = null;
      }
    };
  }, []);

  // Sync / render markers and route tracks
  useEffect(() => {
    const map = leafletMapInstanceRef.current;
    const markerGroup = markerGroupRef.current;
    const polylineGroup = polylineGroupRef.current;

    if (!map || !markerGroup || !polylineGroup) return;

    // Clear previous elements
    markerGroup.clearLayers();
    polylineGroup.clearLayers();

    // 1. Draw Simulated Paths/Route Tracing (경로 추적 기능)
    friends.forEach(friend => {
      // If we are tracking or if they have more routes
      if (friend.route && friend.route.length > 0) {
        const isSelected = selectedFriendId === friend.id;
        const color = friend.color;
        const polyline = L.polyline(friend.route, {
          color: color,
          weight: isSelected ? 4 : 2,
          opacity: isSelected ? 0.9 : 0.45,
          dashArray: isSelected ? '5, 8' : '1, 5',
          lineCap: 'round'
        });
        polylineGroup.addLayer(polyline);

        // Add visual direction arrows or dots at track nodes for gorgeous look
        friend.route.forEach((coord, idx) => {
          if (idx === friend.routeIndex) return; // skip current
          const dot = L.circleMarker(coord, {
            radius: isSelected ? 3 : 2,
            color: color,
            fillColor: '#FFFFFF',
            fillOpacity: 1,
            weight: 1.5
          });
          polylineGroup.addLayer(dot);
        });
      }
    });

    // 2. Add appointments on map (약속 위치 공유)
    appointments.forEach(app => {
      const isSelected = selectedPromiseId === app.id;
      const pulseClass = isSelected ? 'scale-110 shadow-lg' : '';

      const promiseIcon = L.divIcon({
        className: 'custom-promise-marker',
        html: `
          <div class="flex flex-col items-center ${pulseClass}">
            <div class="relative flex items-center justify-center w-9 h-9 bg-yellow-400 text-black rounded-full border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <span class="text-base text-black">📍</span>
              <div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border border-black animate-ping"></div>
            </div>
            <div class="px-2 py-0.5 bg-black text-yellow-450 text-yellow-400 text-[10px] rounded-lg shadow-[1.5px_1.5px_0px_0px_rgba(251,191,36,1)] whitespace-nowrap mt-1 border border-black font-black">
              ${app.title.length > 10 ? app.title.substring(0, 10) + '...' : app.title}
            </div>
          </div>
        `,
        iconSize: [40, 50],
        iconAnchor: [20, 45]
      });

      const marker = L.marker([app.lat, app.lng], { icon: promiseIcon });
      marker.bindTooltip(`
        <div class="font-sans text-xs p-1">
          <p class="font-black text-yellow-600">${app.title}</p>
          <p class="text-slate-900 font-bold">📍 ${app.placeName}</p>
          <p class="text-slate-700 font-mono text-[10px] font-bold">🕒 ${app.datetime}</p>
        </div>
      `, { permanent: false, direction: 'top' });

      markerGroup.addLayer(marker);
    });

    // 3. Add temporary flag marker for click promise creation
    if (tempPromiseCoords) {
      const tempIcon = L.divIcon({
        className: 'temp-marker',
        html: `
          <div class="flex flex-col items-center animate-bounce">
            <div class="flex items-center justify-center w-8 h-8 bg-rose-500 text-white rounded-full border-2 border-black shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]">
              <span class="text-sm">⭐️</span>
            </div>
            <div class="px-2 py-0.5 bg-black text-rose-300 text-[9.5px] rounded-lg shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] font-black border border-black mt-1">
              여기 소집
            </div>
          </div>
        `,
        iconSize: [36, 46],
        iconAnchor: [18, 41]
      });

      const tempMarker = L.marker(tempPromiseCoords, { icon: tempIcon });
      markerGroup.addLayer(tempMarker);
    }

    // 4. Draw customizable Friends markers dynamically
    friends.forEach(friend => {
      const isSelected = selectedFriendId === friend.id;
      const isActiveUser = friend.id === activeProfileId;
      const ringColorClass = isSelected ? 'ring-4 ring-offset-2 ring-black scale-110 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : '';
      const borderClass = isActiveUser ? 'border-dashed border-yellow-500' : 'border-black';

      const friendIcon = L.divIcon({
        className: 'custom-friend-marker',
        html: `
          <div class="flex flex-col items-center transition-all duration-300">
            <!-- Bubble Message (상태메시지 - 작게) -->
            ${friend.statusMsg ? `
              <div class="absolute bottom-11 bg-white text-[8px] font-semibold text-gray-700 border border-gray-200 shadow-sm rounded-lg px-1.5 py-0.5 max-w-[80px] truncate text-center select-none font-sans z-50" style="white-space:nowrap">
                ${friend.statusMsg.substring(0, 8)}${friend.statusMsg.length > 8 ? '…' : ''}
              </div>
            ` : ''}

            <!-- Avatar (작게) -->
            <div class="relative w-7 h-7 rounded-full ${ringColorClass} flex items-center justify-center shadow-sm border-2 ${borderClass}" style="background-color: ${friend.color}">
              <div class="text-sm">${friend.avatar}</div>

              <!-- Battery Badge -->
              <div class="absolute -bottom-1 -right-1.5 px-0.5 bg-gray-800 text-white rounded-full text-[6px] font-bold leading-none">
                ${friend.battery}%
              </div>

              <!-- Heartrate Badge -->
              ${friend.heartRate ? `
                <div class="absolute -top-0.5 -left-2.5 px-1 py-0 bg-rose-500 text-white rounded-full text-[6px] font-bold leading-none animate-pulse">
                  ♥${friend.heartRate}
                </div>
              ` : ''}

              <!-- Online status -->
              <div class="absolute top-0 right-0 w-2 h-2 rounded-full border border-white ${friend.isOnline ? 'bg-emerald-400' : 'bg-gray-400'}"></div>
            </div>

            <!-- Name Tag (작게) -->
            <div class="px-1.5 py-0.5 mt-0.5 bg-white text-black border border-gray-300 text-[8px] font-semibold rounded-md shadow-sm whitespace-nowrap font-sans select-none">
              ${friend.name.split(' ')[0]}${friend.speed > 0 ? ` ·${Math.round(friend.speed)}k` : ''}
            </div>
          </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 38]
      });

      const marker = L.marker([friend.lat, friend.lng], { icon: friendIcon });
      
      marker.bindTooltip(`
        <div class="font-sans text-xs p-1 select-none">
          <p class="font-bold flex items-center gap-1">
            <span>${friend.avatar} ${friend.name}</span>
            <span class="text-[9px] bg-amber-100 text-amber-800 rounded px-1">${friend.isOnline ? '온라인' : '오프라인'}</span>
          </p>
          <p class="text-gray-500 font-serif text-[10px] mt-0.5">“${friend.statusMsg}”</p>
          <div class="grid grid-cols-2 gap-x-2 mt-1 pt-1 border-t border-gray-100 text-[10px] text-gray-400 font-mono">
            <span>속도: ${friend.speed} km/h</span>
            <span>방향: ${friend.heading}</span>
          </div>
        </div>
      `, { permanent: false, direction: 'top' });

      markerGroup.addLayer(marker);
    });

  }, [friends, appointments, activeProfileId, selectedFriendId, selectedPromiseId, tempPromiseCoords]);

  // Center / fly to selected item dynamically
  useEffect(() => {
    const map = leafletMapInstanceRef.current;
    if (!map) return;

    if (selectedFriendId) {
      const friend = friends.find(f => f.id === selectedFriendId);
      if (friend) {
        map.flyTo([friend.lat, friend.lng], 16, { animate: true, duration: 1.2 });
      }
    } else if (selectedPromiseId) {
      const app = appointments.find(a => a.id === selectedPromiseId);
      if (app) {
        map.flyTo([app.lat, app.lng], 16, { animate: true, duration: 1.2 });
      }
    } else if (tempPromiseCoords) {
      map.flyTo(tempPromiseCoords, 16, { animate: true, duration: 1.0 });
    }
  }, [selectedFriendId, selectedPromiseId, tempPromiseCoords]);

  // First GPS fix: center map on my location
  useEffect(() => {
    const map = leafletMapInstanceRef.current;
    if (!map || !myGpsCoords || !centerOnMyGpsOnce) return;
    if (selectedFriendId || selectedPromiseId) return;

    map.flyTo(myGpsCoords, 16, { animate: true, duration: 1.0 });
    onMyGpsCentered?.();
  }, [myGpsCoords, centerOnMyGpsOnce, selectedFriendId, selectedPromiseId, onMyGpsCentered]);

  return (
    <div className="relative w-full h-full">
      {/* 지도 컨테이너 */}
      <div id="banana-talk-leaflet-map" ref={mapRef} className="w-full h-full z-10" />

      {/* 지도 내 장소 검색바 */}
      <div className="absolute top-3 left-3 right-12 z-30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          {isMapSearching
            ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 animate-spin pointer-events-none" />
            : mapSearch
              ? <button onClick={() => { setMapSearch(''); setShowResults(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              : null
          }
          <input
            type="text"
            value={mapSearch}
            onChange={e => setMapSearch(e.target.value)}
            placeholder="장소 검색 (예: 강남역, 카페)"
            className="w-full bg-white/95 backdrop-blur border border-gray-200 shadow-md rounded-2xl py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* 검색 결과 드롭다운 */}
        {showResults && mapResults.length > 0 && (
          <div className="mt-1 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            {mapResults.map((place, idx) => (
              <button key={idx} type="button" onClick={() => handleSelectMapResult(place)}
                className="w-full text-left px-4 py-2.5 hover:bg-amber-50 border-b border-gray-50 last:border-0 flex items-start gap-2.5 transition">
                <span className="text-amber-400 mt-0.5 shrink-0">📍</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{place.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{place.address}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {showResults && !isMapSearching && mapSearch && mapResults.length === 0 && (
          <div className="mt-1 bg-white border border-gray-100 rounded-2xl shadow-lg px-4 py-3 text-center text-xs text-gray-400">
            검색 결과가 없습니다
          </div>
        )}
      </div>

      {/* 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 bg-yellow-400 text-slate-950 font-black border-2 border-black text-[9.5px] px-3 py-2 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] z-20 pointer-events-none flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-black border border-white animate-pulse"></span>
        <span>지도를 터치하면 소집 장소로 지정됩니다 🧭</span>
      </div>
    </div>
  );
}
