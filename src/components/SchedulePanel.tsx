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
  selectedPromiseId?: string | null;
  onSelectPromise?: (id: string, lat: number, lng: number) => void;
  onCreateAppointment: (title: string, placeName: string, datetime: string, customLat?: number, customLng?: number) => void;
  onUpdateAppointment?: (id: string, title: string, placeName: string, lat: number, lng: number, datetime: string) => void;
  onDeleteAppointment: (id: string) => void;
  onVote: (id: string, vote: 'yes' | 'no' | 'maybe') => void;
  onClearTempCoords: () => void;
  onFocusLocation: (lat: number, lng: number) => void;
  
  // Shared Form States
  title: string;
  setTitle: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  confirmedPlace: PlaceResult | null;
  setConfirmedPlace: (val: PlaceResult | null) => void;
  dateValue: string;
  setDateValue: (val: string) => void;
  timeValue: string;
  setTimeValue: (val: string) => void;
}

export default function SchedulePanel({
  appointments, friends, activeProfileId,
  tempPromiseCoords, selectedPromiseId, onSelectPromise,
  onCreateAppointment,
  onUpdateAppointment, onDeleteAppointment, onVote, onClearTempCoords, onFocusLocation,
  title, setTitle, searchQuery, setSearchQuery,
  confirmedPlace, setConfirmedPlace, dateValue, setDateValue,
  timeValue, setTimeValue
}: SchedulePanelProps) {
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 로컬 시간대 기준 YYYY-MM-DD 날짜 구하기 헬퍼
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 편집 상태
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPlaceName, setEditPlaceName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editLat, setEditLat] = useState(37.5568);
  const [editLng, setEditLng] = useState(126.9238);
  const [editSearchQuery, setEditSearchQuery] = useState('');
  const [editResults, setEditResults] = useState<PlaceResult[]>([]);
  const [isEditSearching, setIsEditSearching] = useState(false);

  // 날짜+시간 → 한국어 포맷 변환
  const formatKoreanDatetime = (date: string, time: string) => {
    if (!date) return '시간 조율 중';
    const d = new Date(`${date}T${time || '00:00'}`);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = d.getHours();
    const min = d.getMinutes();
    const ampm = hour < 12 ? '오전' : '오후';
    const h = hour % 12 || 12;
    return `${year}년 ${month}월 ${day}일 ${ampm} ${h}:${String(min).padStart(2, '0')}`;
  };

  // 실시간 장소 검색 (디바운스 600ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim() || confirmedPlace) {
      setSearchResults(confirmedPlace ? [] : LOCAL_PLACES);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        if ((window as any).kakao?.maps?.services) {
          // 장소(키워드) 검색 + 주소 검색을 함께 수행해 결과 병합
          const ps = new (window as any).kakao.maps.services.Places();
          const geocoder = new (window as any).kakao.maps.services.Geocoder();
          const Status = (window as any).kakao.maps.services.Status;
          const merged: PlaceResult[] = [];
          const pushUnique = (r: PlaceResult) => {
            if (isNaN(r.lat) || isNaN(r.lng)) return;
            if (!merged.some(m => Math.abs(m.lat - r.lat) < 1e-7 && Math.abs(m.lng - r.lng) < 1e-7)) merged.push(r);
          };
          let done = 0;
          const finish = () => {
            if (++done < 2) return;
            setIsSearching(false);
            setSearchResults(merged.length > 0 ? merged.slice(0, 8) : LOCAL_PLACES.filter(p =>
              p.name.includes(searchQuery) || p.address.includes(searchQuery)
            ));
          };
          ps.keywordSearch(searchQuery, (data: any[], status: string) => {
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
          geocoder.addressSearch(searchQuery, (data: any[], status: string) => {
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
        } else {
          const res = await fetch(`/api/places/search?q=${encodeURIComponent(searchQuery)}`);
          if (!res.ok) throw new Error('search failed');
          const data: PlaceResult[] = await res.json();
          setSearchResults(data.length > 0 ? data : LOCAL_PLACES.filter(p =>
            p.name.includes(searchQuery) || p.address.includes(searchQuery)
          ));
          setIsSearching(false);
        }
      } catch {
        setSearchResults(LOCAL_PLACES.filter(p =>
          p.name.includes(searchQuery) || p.address.includes(searchQuery)
        ));
        setIsSearching(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, confirmedPlace]);

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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);

    const finalPlace = confirmedPlace?.name || searchQuery.trim() || (tempPromiseCoords ? `지도 선택 위치` : '장소 미지정');
    const finalLatVal = confirmedPlace?.lat ?? tempPromiseCoords?.[0] ?? 37.5568;
    const finalLngVal = confirmedPlace?.lng ?? tempPromiseCoords?.[1] ?? 126.9238;

    const formattedDatetime = formatKoreanDatetime(dateValue, timeValue);
    onCreateAppointment(title, finalPlace, formattedDatetime, finalLatVal, finalLngVal);
    setTitle('');
    setDateValue(getLocalDateString());
    setTimeValue('19:00');
    setSearchQuery('');
    setConfirmedPlace(null);
    onClearTempCoords();
    setIsSubmitting(false);
  };

  const resetForm = () => {
    setSearchQuery('');
    setConfirmedPlace(null);
    setTitle('');
    setDateValue(getLocalDateString());
    setTimeValue('19:00');
    onClearTempCoords();
  };

  const handleSaveEdit = (id: string) => {
    if (onUpdateAppointment) {
      const dt = editDate ? formatKoreanDatetime(editDate, editTime) : '시간 조율 중';
      onUpdateAppointment(id, editTitle, editPlaceName, editLat, editLng, dt);
    }
    setEditingAppId(null);
  };

  // --- 달력 및 약속 파싱 상태 ---
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1); // 1-12
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  const handlePrevMonth = () => {
    setSelectedCalendarDay(null);
    setCurrentMonth(prev => {
      if (prev === 1) {
        setCurrentYear(y => y - 1);
        return 12;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setSelectedCalendarDay(null);
    setCurrentMonth(prev => {
      if (prev === 12) {
        setCurrentYear(y => y + 1);
        return 1;
      }
      return prev + 1;
    });
  };

  // 약속 문자열에서 년, 월, 일 파싱: "2026년 6월 6일 오후 7:00" 및 ISO, 표준 포맷 대응
  const parseAppDate = (datetimeStr: string) => {
    if (!datetimeStr) return null;
    
    // Korean format: "2026년 6월 6일 오후 7:00"
    const koMatch = datetimeStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (koMatch) {
      return {
        year: parseInt(koMatch[1], 10),
        month: parseInt(koMatch[2], 10),
        day: parseInt(koMatch[3], 10)
      };
    }

    // ISO/Standard format: "2026-06-03 15:00" or "2026/06/03"
    const isoMatch = datetimeStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      return {
        year: parseInt(isoMatch[1], 10),
        month: parseInt(isoMatch[2], 10),
        day: parseInt(isoMatch[3], 10)
      };
    }

    // Fallback: Date parse
    const d = new Date(datetimeStr);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate()
      };
    }

    return null;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month - 1, 1).getDay();
  };

  const getAppsForDay = (day: number) => {
    return appointments.filter(app => {
      const parsed = parseAppDate(app.datetime);
      return parsed && parsed.year === currentYear && parsed.month === currentMonth && parsed.day === day;
    });
  };


  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">

      {/* 약속 만들기 카드 */}
      <div className="mx-4 mt-2.5 mb-1.5 bg-amber-50 border-2 border-black rounded-3xl overflow-hidden shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] shrink-0">
        <form onSubmit={handleSubmit} className="p-2.5 space-y-2 font-sans pb-2.5">
          {/* 약속 이름 */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-gray-700">약속 이름 *</label>
            <input
              type="text" required value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 민수 생일 파티, 금요 번개"
              className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-400 font-bold"
            />
          </div>

          {/* 모임 장소 */}
          <div className="space-y-1 relative">
            <label className="text-[11px] font-black text-gray-700">모임 장소 (검색 또는 직접 입력) *</label>
            
            {/* 지도 클릭 좌표 사용 중일 때 안내 */}
            {tempPromiseCoords && !confirmedPlace && (
              <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                  <p className="text-[10px] font-semibold text-rose-700">지도 선택 좌표 연동됨 ({tempPromiseCoords[0].toFixed(4)}, {tempPromiseCoords[1].toFixed(4)})</p>
                </div>
                <button type="button" onClick={onClearTempCoords} className="text-[9px] text-rose-500 font-bold hover:underline">취소</button>
              </div>
            )}

            {/* 확정된 검색 장소가 있을 때 표시 */}
            {confirmedPlace ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-1.5 shadow-sm">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <div className="truncate">
                    <p className="text-xs font-bold text-emerald-800 truncate">{confirmedPlace.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{confirmedPlace.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1.5 font-sans text-[10px]">
                  <button type="button" onClick={() => onFocusLocation(confirmedPlace.lat, confirmedPlace.lng)} className="text-blue-500 font-bold hover:underline cursor-pointer">지도 보기</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setConfirmedPlace(null)} className="text-rose-500 font-bold hover:underline cursor-pointer">변경</button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400 animate-spin" />
                  )}
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="예: 강남역, 홍대 카페, 스타벅스 또는 직접 입력"
                    className="w-full bg-white border-2 border-black rounded-xl py-2 pl-8 pr-8 text-xs focus:outline-none focus:border-amber-400 font-bold"
                  />
                </div>

                {/* 검색 결과 드롭다운 */}
                {searchQuery.trim() && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-black rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {searchResults.map((place, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectPlace(place)}
                        className="w-full text-left hover:bg-amber-50 px-3 py-2 transition flex items-start gap-1.5 text-[11px]"
                      >
                        <MapPin className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{place.name}</p>
                          <p className="text-[9px] text-gray-400 truncate">{place.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 날짜 및 시간 */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-gray-700">📅 날짜 및 시간 *</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateValue}
                min={getLocalDateString()}
                onChange={e => setDateValue(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                className="bg-white border-2 border-black rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 cursor-pointer w-full font-bold"
              />
              <input
                type="time"
                value={timeValue}
                onChange={e => setTimeValue(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                className="bg-white border-2 border-black rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 cursor-pointer w-full font-bold"
              />
            </div>
            {dateValue && (
              <p className="text-[10px] text-amber-600 font-bold px-1">
                {formatKoreanDatetime(dateValue, timeValue)}
              </p>
            )}
          </div>

          {/* 등록 버튼 */}
          <div className="flex gap-2 pt-0.5">
            <button type="button" onClick={resetForm}
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 border-2 border-black rounded-xl text-xs font-bold text-gray-600 transition shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none">
              초기화
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="flex-1 bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 text-gray-900 font-black py-2 rounded-xl text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition flex items-center justify-center gap-1.5"
            >
              <Flag className="w-3 h-3" />
              <span>약속 깃발 꽂기</span>
            </button>
          </div>
        </form>
      </div>

      {/* 월별 약속 달력 */}
      <div className="mx-4 my-1 bg-slate-50 border-2 border-black rounded-3xl p-2.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] select-none font-sans shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
            <span className="text-sm">📅</span>
            <span>약속 달력</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-5 h-5 border-2 border-black rounded-md bg-white flex items-center justify-center font-bold text-[10px] hover:bg-gray-100 active:translate-y-0.5 transition shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              &lt;
            </button>
            <span className="text-[10px] font-black text-slate-800">
              {currentYear}년 {currentMonth}월
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-5 h-5 border-2 border-black rounded-md bg-white flex items-center justify-center font-bold text-[10px] hover:bg-gray-100 active:translate-y-0.5 transition shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              &gt;
            </button>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-gray-500 border-b border-gray-250 pb-1 mb-1">
          <span className="text-red-500">일</span>
          <span>월</span>
          <span>화</span>
          <span>수</span>
          <span>목</span>
          <span>금</span>
          <span className="text-blue-500">토</span>
        </div>

        {/* 일자 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: getFirstDayOfMonth(currentYear, currentMonth) }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: getDaysInMonth(currentYear, currentMonth) }).map((_, i) => {
            const day = i + 1;
            const dayApps = getAppsForDay(day);
            const hasApp = dayApps.length > 0;
            const isToday = new Date().getFullYear() === currentYear &&
                            new Date().getMonth() + 1 === currentMonth &&
                            new Date().getDate() === day;
            
            const isSelected = selectedCalendarDay === day;

            return (
              <button
                key={`day-${day}`}
                type="button"
                onClick={() => {
                  setSelectedCalendarDay(isSelected ? null : day);
                  const formattedMonth = String(currentMonth).padStart(2, '0');
                  const formattedDay = String(day).padStart(2, '0');
                  setDateValue(`${currentYear}-${formattedMonth}-${formattedDay}`);
                }}
                className={`relative h-6 w-full rounded-lg flex flex-col items-center justify-center text-[10px] font-bold border transition ${
                  isSelected
                    ? 'bg-rose-500 text-white border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-black scale-105'
                    : hasApp
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-black cursor-pointer'
                      : isToday
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-white border-gray-100 hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span>{day}</span>
                {hasApp && !isSelected && (
                  <span className="absolute bottom-0.5 w-1 h-1 bg-rose-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* 선택한 날짜의 약속 상세 */}
        {selectedCalendarDay !== null && (
          <div className="mt-2 p-2 bg-amber-50 border-2 border-black rounded-xl space-y-1.5">
            <div className="flex items-center justify-between border-b border-amber-200 pb-1">
              <span className="text-[9px] font-black text-amber-900">
                📌 {currentMonth}월 {selectedCalendarDay}일 약속 ({getAppsForDay(selectedCalendarDay).length}개)
              </span>
              <button
                type="button"
                onClick={() => setSelectedCalendarDay(null)}
                className="text-[9px] text-amber-500 hover:text-amber-700 font-bold cursor-pointer"
              >
                닫기
              </button>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {getAppsForDay(selectedCalendarDay).length === 0 ? (
                <p className="text-[9px] text-gray-400 italic py-0.5 text-center">이 날짜에는 등록된 약속이 없습니다.</p>
              ) : (
                getAppsForDay(selectedCalendarDay).map(app => (
                  <div key={app.id} className="text-[9px] text-gray-800 flex items-start gap-1">
                    <span className="text-amber-500 shrink-0">🚩</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-slate-900 truncate">{app.title}</p>
                      <p className="text-[8px] text-gray-500 leading-tight truncate">
                        📍 {app.placeName} · 🕒 {app.datetime.split('오')[1] ? '오' + app.datetime.split('오')[1] : app.datetime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onFocusLocation(app.lat, app.lng);
                      }}
                      className="text-[8px] bg-white border border-gray-300 px-1 py-0.5 rounded font-semibold text-gray-500 shrink-0 hover:border-black hover:text-black transition cursor-pointer"
                    >
                      이동
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 약속 목록 */}
      <div className="px-4 pb-4 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between py-1">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            약속 일정 {appointments.length}개
          </h3>
          {appointments.length >= 2 && (
            <span className="text-[10px] text-rose-500 font-bold">약속 선택 시 지도에 실선 표시</span>
          )}
        </div>

        {appointments.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 flex items-center justify-center gap-2 text-xs text-gray-400 font-semibold">
            <Calendar className="w-4 h-4 opacity-60" />
            <span>등록된 약속 일정이 없습니다.</span>
          </div>
        ) : (
          appointments.map((app) => {
            const hasVoted = !!(app.votes && activeProfileId in app.votes);
            const myVote = hasVoted ? app.votes[activeProfileId] : null;
            const isPromiseSelected = selectedPromiseId === app.id;
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
              <div key={app.id} className={`bg-white border rounded-3xl overflow-hidden shadow-sm shrink-0 ${isPromiseSelected ? 'border-rose-400 border-2 ring-2 ring-rose-100' : 'border-gray-100'}`}>
                <div className="px-4 pt-4 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-bold text-gray-900 leading-snug flex-1">
                      {isPromiseSelected && <span className="text-rose-500">🚩 </span>}{app.title}
                    </h4>
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
                    <button onClick={() => {
                      if (onSelectPromise) onSelectPromise(app.id, app.lat, app.lng);
                      else onFocusLocation(app.lat, app.lng);
                    }}
                      className={`ml-auto text-[11px] font-bold ${isPromiseSelected ? 'text-rose-600' : 'text-blue-500 hover:text-blue-700'}`}>
                      {isPromiseSelected ? '✓ 지도 표시중' : '🗺️ 지도에 실선표시'}
                    </button>
                  </div>
                </div>

                <div className="flex border-t border-gray-50">
                  {([
                    { vote: 'yes' as const, label: '✅ 참가', active: 'bg-emerald-500 text-white', inactive: 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-600' },
                    { vote: 'maybe' as const, label: '🤔 미정', active: 'bg-amber-400 text-gray-900', inactive: 'text-gray-500 hover:bg-amber-50 hover:text-amber-600' },
                    { vote: 'no' as const, label: '❌ 불참', active: 'bg-red-100 text-red-600', inactive: 'text-gray-500 hover:bg-red-50 hover:text-red-400' },
                  ]).map(({ vote, label, active, inactive }) => {
                    const selected = myVote === vote;
                    return (
                      <button key={vote} type="button"
                        onClick={() => { if (!selected) onVote(app.id, vote); }}
                        className={`flex-1 py-3 text-[12px] font-semibold transition ${selected ? active : inactive}`}>
                        {selected ? `${label} ✓` : label}
                      </button>
                    );
                  })}
                </div>

                <div className="px-4 pb-3 pt-1 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`[${app.title}] 약속을 정말 취소/삭제하시겠습니까?`)) {
                        onDeleteAppointment(app.id);
                      }
                    }}
                    className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-700 font-extrabold cursor-pointer"
                  >
                    🗑️ 약속 취소
                  </button>
                  <button onClick={() => {
                    if (isEditing) { setEditingAppId(null); } else {
                      setEditingAppId(app.id);
                      setEditTitle(app.title);
                      setEditPlaceName(app.placeName);
                      setEditDate(getLocalDateString());
                      setEditTime('19:00');
                      setEditLat(app.lat);
                      setEditLng(app.lng);
                      setEditSearchQuery('');
                      setEditResults([]);
                    }
                  }} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer">
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
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={editDate} min={getLocalDateString()} onChange={e => setEditDate(e.target.value)}
                        onClick={e => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                        className="bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 cursor-pointer w-full" />
                      <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                        onClick={e => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                        className="bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 cursor-pointer w-full" />
                    </div>

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
