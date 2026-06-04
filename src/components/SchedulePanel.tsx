/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Appointment, Friend } from '../types';
import { Calendar, MapPin, Search, CheckCircle2, Flag, Edit3, Users, Clock, Sparkles, Loader2 } from 'lucide-react';

interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// 로컬 fallback — 서버 응답 전 또는 검색어 없을 때 표시
const LOCAL_PLACES: PlaceResult[] = [
  { name: '홍대입구역 9번출구 만남의 광장', address: '서울 마포구 양화로 160', lat: 37.5568, lng: 126.9238 },
  { name: '경의선숲길 연남동 잔디 쉼터', address: '서울 마포구 연남동 260-15', lat: 37.5595, lng: 126.9262 },
  { name: '망원한강공원 마포나루', address: '서울 마포구 마포나루길 467', lat: 37.5558, lng: 126.9011 },
  { name: '합정역 카페 거리', address: '서울 마포구 독막로7길 24', lat: 37.5492, lng: 126.9148 },
  { name: '서교동 카페거리', address: '서울 마포구 와우산로21길', lat: 37.5524, lng: 126.9221 },
  { name: '홍대 조폭떡볶이 본점', address: '서울 마포구 어울마당로 60', lat: 37.5508, lng: 126.9214 },
];

interface SchedulePanelProps {
  appointments: Appointment[];
  friends: Friend[];
  activeProfileId: string;
  tempPromiseCoords: [number, number] | null;
  onCreateAppointment: (title: string, placeName: string, datetime: string, customLat?: number, customLng?: number) => void;
  onUpdateAppointment?: (id: string, title: string, placeName: string, lat: number, lng: number, datetime: string) => void;
  onVote: (id: string, vote: 'yes' | 'no' | 'maybe') => void;
  onClearTempCoords: () => void;
  onFocusLocation: (lat: number, lng: number) => void;
}

export default function SchedulePanel({
  appointments, friends, activeProfileId,
  tempPromiseCoords, onCreateAppointment,
  onUpdateAppointment, onVote, onClearTempCoords, onFocusLocation
}: SchedulePanelProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>(LOCAL_PLACES);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmedPlace, setConfirmedPlace] = useState<PlaceResult | null>(null);
  const [title, setTitle] = useState('');
  const [datetime, setDatetime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 편집 상태
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPlaceName, setEditPlaceName] = useState('');
  const [editDatetime, setEditDatetime] = useState('');
  const [editLat, setEditLat] = useState(37.5568);
  const [editLng, setEditLng] = useState(126.9238);
  const [editSearchQuery, setEditSearchQuery] = useState('');
  const [editResults, setEditResults] = useState<PlaceResult[]>([]);
  const [isEditSearching, setIsEditSearching] = useState(false);

  // 실시간 장소 검색 (디바운스 600ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim()) {
      setSearchResults(LOCAL_PLACES);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error('search failed');
        const data: PlaceResult[] = await res.json();
        setSearchResults(data.length > 0 ? data : LOCAL_PLACES.filter(p =>
          p.name.includes(searchQuery) || p.address.includes(searchQuery)
        ));
      } catch {
        // 네트워크 오류 시 로컬 필터링
        setSearchResults(LOCAL_PLACES.filter(p =>
          p.name.includes(searchQuery) || p.address.includes(searchQuery)
        ));
      } finally {
        setIsSearching(false);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // 편집 모드 장소 검색
  useEffect(() => {
    if (!editSearchQuery.trim()) { setEditResults([]); return; }
    const t = setTimeout(async () => {
      setIsEditSearching(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(editSearchQuery)}`);
        const data: PlaceResult[] = await res.json();
        setEditResults(data);
      } catch {
        setEditResults(LOCAL_PLACES.filter(p => p.name.includes(editSearchQuery)));
      } finally {
        setIsEditSearching(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [editSearchQuery]);

  const handleSelectPlace = (place: PlaceResult) => {
    setConfirmedPlace(place);
    setSearchQuery(place.name);
    onFocusLocation(place.lat, place.lng);
    setStep(2);
  };

  const coordsReady = !!confirmedPlace || !!tempPromiseCoords;
  const finalLat = confirmedPlace?.lat ?? tempPromiseCoords?.[0];
  const finalLng = confirmedPlace?.lng ?? tempPromiseCoords?.[1];
  const finalPlaceName = confirmedPlace
    ? `${confirmedPlace.name}`
    : `지도 선택 (${tempPromiseCoords?.[0].toFixed(4)}, ${tempPromiseCoords?.[1].toFixed(4)})`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !coordsReady) return;
    setIsSubmitting(true);
    onCreateAppointment(title, finalPlaceName!, datetime || '시간 조율 중', finalLat, finalLng);
    setTitle('');
    setDatetime('');
    setSearchQuery('');
    setConfirmedPlace(null);
    setStep(1);
    onClearTempCoords();
    setIsSubmitting(false);
  };

  const handleSaveEdit = (id: string) => {
    if (onUpdateAppointment) {
      onUpdateAppointment(id, editTitle, editPlaceName, editLat, editLng, editDatetime);
    }
    setEditingAppId(null);
  };

  const resetForm = () => {
    setStep(1);
    setSearchQuery('');
    setConfirmedPlace(null);
    setTitle('');
    setDatetime('');
    onClearTempCoords();
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">

      {/* 약속 만들기 카드 */}
      <div className="mx-4 mt-4 mb-2 bg-amber-50 border border-amber-100 rounded-3xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            <span className="text-[13px] font-bold text-gray-800">새 약속 만들기</span>
          </div>
          <div className="flex items-center gap-1.5">
            {([1, 2] as const).map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  step > s ? 'bg-emerald-500 text-white' : step === s ? 'bg-amber-400 text-gray-900' : 'bg-gray-200 text-gray-400'
                }`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 2 && <div className={`w-4 h-0.5 ${step > s ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* 1단계: 장소 검색 */}
          {step === 1 && (
            <>
              <p className="text-xs text-gray-500">식당명, 장소명, 주소를 검색하세요 (실시간 검색)</p>

              {/* 지도 클릭 좌표 사용 */}
              {tempPromiseCoords && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-3 py-2.5">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-rose-700">지도에서 위치를 선택했습니다</p>
                    <p className="text-[11px] text-rose-400 font-mono">{tempPromiseCoords[0].toFixed(5)}, {tempPromiseCoords[1].toFixed(5)}</p>
                  </div>
                  <button onClick={() => setStep(2)}
                    className="text-xs bg-rose-500 text-white px-3 py-1.5 rounded-xl font-semibold shrink-0">
                    이 위치로 →
                  </button>
                </div>
              )}

              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  {isSearching ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 animate-spin" />
                  ) : null}
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="예: 강남역, 홍대 라멘, 카페 베이커리"
                    className="w-full bg-white border border-gray-200 rounded-2xl py-3 pl-9 pr-9 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* 검색 결과 */}
                <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                  {searchResults.length === 0 && !isSearching && searchQuery && (
                    <p className="text-center text-xs text-gray-400 py-4">검색 결과가 없습니다</p>
                  )}
                  {searchResults.map((place, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPlace(place)}
                      className="w-full text-left bg-white hover:bg-amber-50 border border-gray-100 hover:border-amber-200 rounded-2xl px-4 py-2.5 transition flex items-start gap-3"
                    >
                      <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{place.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{place.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 2단계: 약속 정보 입력 */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-emerald-600 font-semibold">장소 확정</p>
                  <p className="text-sm font-bold text-gray-800 truncate">
                    {confirmedPlace?.name || `지도 선택 (${tempPromiseCoords?.[0].toFixed(4)})`}
                  </p>
                  {confirmedPlace && (
                    <p className="text-[11px] text-gray-400 truncate">{confirmedPlace.address}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setStep(1); setConfirmedPlace(null); }}
                  className="text-[11px] text-gray-400 hover:text-gray-600 shrink-0">변경</button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">약속 이름 *</label>
                <input
                  type="text" required value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예) 민수 생일 파티, 금요 번개"
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">날짜 및 시간</label>
                <input
                  type="text" value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                  placeholder="예) 오늘 저녁 7:30, 이번 주 토요일 2시"
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={resetForm}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-2xl text-sm font-semibold text-gray-600 transition">
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!title.trim() || isSubmitting}
                  className="flex-1 bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 text-gray-900 font-bold py-3 rounded-2xl text-sm transition flex items-center justify-center gap-2"
                >
                  <Flag className="w-4 h-4" />
                  약속 깃발 꽂기
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* 약속 목록 */}
      <div className="px-4 pb-4 space-y-3">
        <div className="flex items-center justify-between py-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            약속 일정 {appointments.length}개
          </h3>
        </div>

        {appointments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">아직 약속이 없습니다</p>
            <p className="text-xs mt-1 opacity-70">장소를 검색해서 첫 약속을 만들어보세요!</p>
          </div>
        ) : (
          appointments.map((app) => {
            const myVote = app.votes?.[activeProfileId] || 'maybe';
            const yesCount = Object.values(app.votes || {}).filter(v => v === 'yes').length;
            const noCount = Object.values(app.votes || {}).filter(v => v === 'no').length;
            const maybeCount = Object.values(app.votes || {}).filter(v => v === 'maybe').length;
            const isEditing = editingAppId === app.id;

            // 현재 사용자에서 약속 장소까지 도보 ETA 계산
            const activeFriend = friends.find(f => f.id === activeProfileId);
            let etaText = '';
            if (activeFriend) {
              const R = 6371000;
              const dLat = ((app.lat - activeFriend.lat) * Math.PI) / 180;
              const dLng = ((app.lng - activeFriend.lng) * Math.PI) / 180;
              const a = Math.sin(dLat / 2) ** 2 +
                Math.cos((activeFriend.lat * Math.PI) / 180) *
                Math.cos((app.lat * Math.PI) / 180) *
                Math.sin(dLng / 2) ** 2;
              const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const walkMin = Math.round(distM / 80); // 도보 ~80m/min
              etaText = distM < 100 ? '거의 도착!' : walkMin < 60 ? `도보 약 ${walkMin}분` : `도보 ${Math.floor(walkMin/60)}시간 ${walkMin%60}분`;
            }

            return (
              <div key={app.id} className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-4 pt-4 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-bold text-gray-900 leading-snug flex-1">{app.title}</h4>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                      {app.creatorName.split(' ')[0]} 소집
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span className="truncate max-w-[140px]">{app.placeName}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      {app.datetime}
                    </span>
                    {etaText && (
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        🚶 {etaText}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500">
                      참가 <strong className="text-emerald-600">{yesCount}</strong> · 불참 <strong className="text-red-400">{noCount}</strong> · 미정 <strong className="text-gray-400">{maybeCount}</strong>
                    </span>
                    <button onClick={() => onFocusLocation(app.lat, app.lng)}
                      className="ml-auto text-[11px] text-blue-500 hover:text-blue-700 font-semibold">
                      지도 보기
                    </button>
                  </div>
                </div>

                <div className="flex border-t border-gray-50">
                  {([
                    { vote: 'yes' as const, label: '✅ 참가', active: 'bg-emerald-500 text-white', inactive: 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-600' },
                    { vote: 'maybe' as const, label: '🤔 미정', active: 'bg-amber-400 text-gray-900', inactive: 'text-gray-500 hover:bg-amber-50 hover:text-amber-600' },
                    { vote: 'no' as const, label: '❌ 불참', active: 'bg-red-100 text-red-600', inactive: 'text-gray-500 hover:bg-red-50 hover:text-red-400' },
                  ]).map(({ vote, label, active, inactive }) => (
                    <button key={vote} type="button" onClick={() => onVote(app.id, vote)}
                      className={`flex-1 py-3 text-[12px] font-semibold transition ${myVote === vote ? active : inactive}`}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="px-4 pb-3 pt-1 flex justify-end">
                  <button onClick={() => {
                    if (isEditing) { setEditingAppId(null); } else {
                      setEditingAppId(app.id);
                      setEditTitle(app.title);
                      setEditPlaceName(app.placeName);
                      setEditDatetime(app.datetime);
                      setEditLat(app.lat);
                      setEditLng(app.lng);
                      setEditSearchQuery('');
                      setEditResults([]);
                    }
                  }} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
                    <Edit3 className="w-3 h-3" />
                    {isEditing ? '편집 닫기' : '장소/시간 변경'}
                  </button>
                </div>

                {isEditing && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-2.5">
                    <p className="text-xs font-semibold text-gray-500">약속 수정</p>
                    <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                      placeholder="약속 이름"
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />

                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        {isEditSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400 animate-spin" />}
                        <input type="text" value={editSearchQuery}
                          onChange={e => setEditSearchQuery(e.target.value)}
                          placeholder="장소 다시 검색"
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-2.5 pl-8 pr-8 text-sm focus:outline-none focus:border-amber-400" />
                      </div>
                      {editResults.length > 0 && (
                        <div className="mt-1 bg-white border border-gray-100 rounded-2xl overflow-hidden max-h-36 overflow-y-auto shadow-sm">
                          {editResults.map((item, i) => (
                            <button key={i} type="button"
                              onClick={() => { setEditPlaceName(item.name); setEditLat(item.lat); setEditLng(item.lng); setEditSearchQuery(item.name); setEditResults([]); onFocusLocation(item.lat, item.lng); }}
                              className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-gray-50 last:border-0 text-xs">
                              <p className="font-semibold text-gray-800 truncate">{item.name}</p>
                              <p className="text-gray-400 truncate">{item.address}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <input type="text" value={editPlaceName} onChange={e => setEditPlaceName(e.target.value)}
                      placeholder="장소 주소" className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                    <input type="text" value={editDatetime} onChange={e => setEditDatetime(e.target.value)}
                      placeholder="날짜 및 시간" className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setEditingAppId(null)}
                        className="flex-1 py-2.5 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-600">취소</button>
                      <button type="button" onClick={() => handleSaveEdit(app.id)}
                        className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-500 rounded-2xl text-sm font-bold text-gray-900 transition flex items-center justify-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> 저장 & 알림 전송
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
