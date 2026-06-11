/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Contact, Download, UserPlus, Trash2, Phone, X } from 'lucide-react';

interface SavedContact { id: string; name: string; tel: string; }

interface RoomOption { id: string; name: string; emoji: string; memberCount?: number; }

interface Props {
  onInvite: (name: string, phone: string, roomId: string) => void;
  currentRoomName?: string;
  rooms?: RoomOption[];
}

const STORAGE_KEY = 'aemang_contacts';

export default function ContactsPanel({ onInvite, currentRoomName, rooms = [] }: Props) {
  const [list, setList] = useState<SavedContact[]>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  // 초대 대상 연락처 — 선택 시 "어느 그룹방으로 초대할지" 선택 모달 표시
  const [invitingContact, setInvitingContact] = useState<SavedContact | null>(null);
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
                  onClick={() => setInvitingContact(c)}
                  className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition shrink-0"
                  title="그룹방을 선택해 초대"
                >
                  <UserPlus className="w-3.5 h-3.5" /> 초대
                </button>
                <button type="button" onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-rose-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 초대할 그룹방 선택 모달 */}
      {invitingContact && (
        <div
          className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => setInvitingContact(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-[300px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-black text-gray-900">어느 그룹방으로 초대할까요?</h4>
              <button
                type="button"
                onClick={() => setInvitingContact(null)}
                className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              <b className="text-gray-700">{invitingContact.name}</b> ({invitingContact.tel}) 님을 초대합니다
            </p>

            {rooms.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-4">
                초대할 수 있는 그룹방이 없습니다.<br />그룹방 탭에서 먼저 방을 만들어 주세요.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {rooms.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onInvite(invitingContact.name, invitingContact.tel, r.id);
                      setInvitingContact(null);
                    }}
                    className="w-full flex items-center gap-2.5 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-200 border border-transparent rounded-2xl px-3 py-2.5 transition text-left"
                  >
                    <span className="text-xl shrink-0">{r.emoji}</span>
                    <span className="text-[13px] font-bold text-gray-800 flex-1 truncate">{r.name}</span>
                    {typeof r.memberCount === 'number' && (
                      <span className="text-[10px] text-gray-400 shrink-0">{r.memberCount}명</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
