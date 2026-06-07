/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Utensils, Plus, Trash2, X, MapPin, Search, Loader2, Pencil } from 'lucide-react';
import ItemSocial from './ItemSocial';

interface Review {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  timestamp: string;
}
interface Restaurant {
  id: string;
  name: string;
  placeName: string;
  lat: number | null;
  lng: number | null;
  description: string;
  creatorId: string;
  creatorName: string;
  reviews: Review[];
  timestamp: string;
}
interface PlaceResult { name: string; address: string; lat: number; lng: number; }

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  activeProfileId: string;
  myName: string;
  onFocusLocation: (lat: number, lng: number) => void;
}

export default function RestaurantPanel({ authFetch, activeProfileId, myName, onFocusLocation }: Props) {
  const [list, setList] = useState<Restaurant[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [confirmed, setConfirmed] = useState<PlaceResult | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    authFetch('/api/restaurants').then(r => r.json()).then(setList).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // 장소 검색 (카카오 키워드+주소, 없으면 서버 Nominatim)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || confirmed) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const k = (window as any).kakao;
      if (k?.maps?.services) {
        const ps = new k.maps.services.Places();
        const geo = new k.maps.services.Geocoder();
        const merged: PlaceResult[] = [];
        const push = (r: PlaceResult) => { if (!isNaN(r.lat) && !merged.some(m => Math.abs(m.lat - r.lat) < 1e-7 && Math.abs(m.lng - r.lng) < 1e-7)) merged.push(r); };
        let done = 0;
        const fin = () => { if (++done < 2) return; setSearching(false); setResults(merged.slice(0, 8)); };
        ps.keywordSearch(query, (data: any[], st: string) => {
          if (st === k.maps.services.Status.OK) data.forEach(i => push({ name: i.place_name, address: i.road_address_name || i.address_name, lat: parseFloat(i.y), lng: parseFloat(i.x) }));
          fin();
        });
        geo.addressSearch(query, (data: any[], st: string) => {
          if (st === k.maps.services.Status.OK) data.forEach(i => push({ name: i.road_address?.building_name || i.address_name, address: i.road_address?.address_name || i.address_name, lat: parseFloat(i.y), lng: parseFloat(i.x) }));
          fin();
        });
      } else {
        fetch(`/api/places/search?q=${encodeURIComponent(query)}`).then(r => r.json()).then((d: PlaceResult[]) => setResults(d.slice(0, 8))).catch(() => setResults([])).finally(() => setSearching(false));
      }
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, confirmed]);

  const resetForm = () => { setEditingId(null); setName(''); setDesc(''); setQuery(''); setResults([]); setConfirmed(null); };

  const startEdit = (r: Restaurant) => {
    setEditingId(r.id);
    setName(r.name);
    setDesc(r.description || '');
    setQuery('');
    setResults([]);
    setConfirmed(r.lat != null && r.lng != null ? { name: r.placeName || '현재 위치', address: r.placeName || '', lat: r.lat, lng: r.lng } : null);
    setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!name.trim()) { alert('맛집 이름을 입력해 주세요.'); return; }
    const body = {
      name: name.trim(),
      placeName: confirmed?.name || confirmed?.address || '',
      lat: confirmed?.lat ?? null,
      lng: confirmed?.lng ?? null,
      description: desc.trim(),
      creatorName: myName,
    };
    if (editingId) {
      await authFetch('/api/restaurants/update', { method: 'POST', body: JSON.stringify({ id: editingId, ...body }) });
    } else {
      await authFetch('/api/restaurants', { method: 'POST', body: JSON.stringify(body) });
    }
    resetForm();
    setShowAdd(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 맛집을 삭제하시겠습니까?')) return;
    await authFetch('/api/restaurants/delete', { method: 'POST', body: JSON.stringify({ id }) });
    load();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          <Utensils className="w-5 h-5 text-rose-500" />
          <span>맛집</span>
        </h2>
        <button type="button" onClick={() => { resetForm(); setShowAdd(s => !s); }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showAdd ? 'bg-gray-200 text-gray-600' : 'bg-rose-500 text-white'}`}>
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
            <p className="text-[13px] font-bold text-rose-700">{editingId ? '맛집 수정' : '맛집 등록'}</p>
            <input type="text" placeholder="맛집 이름 (예: 홍대 칼국수)" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400" />
            {/* 장소 검색 */}
            {confirmed ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-800 truncate">{confirmed.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{confirmed.address}</p>
                </div>
                <button type="button" onClick={() => setConfirmed(null)} className="text-[10px] text-rose-500 font-bold shrink-0 ml-2">변경</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-400 animate-spin" />}
                <input type="text" placeholder="위치 검색 (장소·주소)" value={query} onChange={e => setQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-8 pr-8 text-sm focus:outline-none focus:border-rose-400" />
                {results.length > 0 && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
                    {results.map((p, i) => (
                      <button key={i} type="button" onClick={() => { setConfirmed(p); setQuery(p.name); }}
                        className="w-full text-left px-3 py-2 hover:bg-rose-50 text-xs flex items-start gap-1.5">
                        <MapPin className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0"><p className="font-bold text-gray-800 truncate">{p.name}</p><p className="text-[9px] text-gray-400 truncate">{p.address}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <textarea placeholder="맛집 설명 (메뉴, 추천 이유 등)" value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400 resize-none" />
            <button type="button" onClick={handleAdd} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-xl text-sm transition">{editingId ? '수정 완료' : '등록하기'}</button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Utensils className="w-12 h-12 opacity-20" />
            <p className="text-sm">등록된 맛집이 없습니다</p>
          </div>
        ) : list.map(r => (
          <div key={r.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900">{r.name}</p>
                {r.placeName && <p className="text-[11px] text-gray-400 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{r.placeName}</p>}
              </div>
              <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-semibold shrink-0">{(r.creatorName || '').split(' ')[0]}</span>
            </div>
            {r.description && <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{r.description}</p>}
            <div className="flex items-center gap-2.5 pt-1">
              {r.lat != null && r.lng != null ? (
                <button type="button" onClick={() => onFocusLocation(r.lat!, r.lng!)}
                  className="flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-700">
                  <MapPin className="w-3.5 h-3.5" /> 지도로 가기
                </button>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-300">
                  <MapPin className="w-3.5 h-3.5" /> 위치 미등록
                </span>
              )}
              {r.creatorId === activeProfileId && (
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => startEdit(r)} className="text-gray-300 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>

            <ItemSocial kind="restaurants" item={r} authFetch={authFetch} activeProfileId={activeProfileId} myName={myName} onChange={load} />
          </div>
        ))}
      </div>
    </div>
  );
}
