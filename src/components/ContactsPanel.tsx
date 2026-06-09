/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Contact, Download, UserPlus, Trash2, Phone } from 'lucide-react';

interface SavedContact { id: string; name: string; tel: string; }

interface Props {
  onInvite: (name: string, phone: string) => void;
  currentRoomName?: string;
}

const STORAGE_KEY = 'aemang_contacts';

export default function ContactsPanel({ onInvite, currentRoomName }: Props) {
  const [list, setList] = useState<SavedContact[]>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const supported = typeof (navigator as any).contacts?.select === 'function';

  const persist = (next: SavedContact[]) => { setList(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };

  const handleImport = async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const picked: any[] = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
      const merged = [...list];
      picked.forEach((c) => {
        const name = (c.name && c.name[0]) || '이름 없음';
        const tels: string[] = c.tel || [];
        tels.forEach((tel) => {
          const cleanTel = String(tel).trim();
          if (!cleanTel) return;
          const dup = merged.some(m => m.tel.replace(/\D/g, '') === cleanTel.replace(/\D/g, ''));
          if (!dup) merged.push({ id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, tel: cleanTel });
        });
      });
      persist(merged);
    } catch (err) {
      // 사용자가 취소했거나 권한 거부 — 무시
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => persist(list.filter(c => c.id !== id));

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          <Contact className="w-5 h-5 text-rose-500" />
          <span>연락처</span>
        </h2>
        <button
          type="button"
          onClick={handleImport}
          disabled={!supported || loading}
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
        >
          <Download className="w-3.5 h-3.5" />
          {loading ? '불러오는 중…' : '불러오기'}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {!supported && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[12px] text-amber-800 leading-relaxed">
            ⚠️ 이 기기/브라우저는 연락처 불러오기를 지원하지 않습니다.
            <br />안드로이드 <b>Chrome</b> 브라우저(또는 홈화면에 설치한 PWA)에서 지원됩니다.
            아이폰 등에서는 직접 입력으로 초대해 주세요.
          </div>
        )}
        {supported && (
          <p className="text-[11px] text-gray-400 leading-relaxed px-1">
            💡 <b>불러오기</b>를 누르면 휴대폰 연락처에서 원하는 사람만 골라 가져옵니다. 가져온 사람은 아래에서 바로 <b>현재 방에 초대</b>할 수 있어요.
          </p>
        )}

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Contact className="w-12 h-12 opacity-20" />
            <p className="text-sm">불러온 연락처가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{c.tel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onInvite(c.name, c.tel)}
                  className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition shrink-0"
                  title={currentRoomName ? `${currentRoomName}에 초대` : '현재 방에 초대'}
                >
                  <UserPlus className="w-3.5 h-3.5" /> 초대
                </button>
                <button type="button" onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-rose-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
