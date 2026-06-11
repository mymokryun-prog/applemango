/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Save, StickyNote, X } from 'lucide-react';

interface PersonalNotesPanelProps {
  mode: 'memo' | 'diary';
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
}

interface DiaryEntry {
  date: string;
  text: string;
  updatedAt?: string;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PersonalNotesPanel({ mode, authFetch, onClose }: PersonalNotesPanelProps) {
  const [memo, setMemo] = useState('');
  const [memoUpdatedAt, setMemoUpdatedAt] = useState<string | null>(null);
  const [diaries, setDiaries] = useState<Record<string, DiaryEntry>>({});
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [diaryText, setDiaryText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const isDiary = mode === 'diary';
  const Icon = isDiary ? BookOpen : StickyNote;
  const title = isDiary ? '나의 일기' : '나의 메모';
  const helper = isDiary ? '날짜별로 하루 기록을 남겨 보세요.' : '본인만 볼 수 있는 간단한 비공개 메모입니다.';

  useEffect(() => {
    if (mode === 'memo') {
      authFetch('/api/personal/memo')
        .then(r => r.ok ? r.json() : { memo: '' })
        .then(data => {
          setMemo(data.memo || '');
          setMemoUpdatedAt(data.updatedAt || null);
        })
        .catch(() => {});
    } else {
      authFetch('/api/personal/diary')
        .then(r => r.ok ? r.json() : { diaries: {} })
        .then(data => {
          const loaded = data.diaries || {};
          setDiaries(loaded);
          setDiaryText(loaded[selectedDate]?.text || '');
        })
        .catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    setDiaryText(diaries[selectedDate]?.text || '');
  }, [selectedDate, diaries]);

  const diaryDates = useMemo(() => {
    const dates = Object.keys(diaries).sort((a, b) => b.localeCompare(a));
    return dates.includes(todayStr()) ? dates : [todayStr(), ...dates];
  }, [diaries]);

  const formatTime = (value?: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMsg('');
    try {
      if (mode === 'memo') {
        const res = await authFetch('/api/personal/memo', {
          method: 'POST',
          body: JSON.stringify({ memo }),
        });
        const data = await res.json();
        setMemoUpdatedAt(data.updatedAt || new Date().toISOString());
      } else {
        const res = await authFetch('/api/personal/diary', {
          method: 'POST',
          body: JSON.stringify({ date: selectedDate, text: diaryText }),
        });
        const data = await res.json();
        setDiaries(prev => ({ ...prev, [selectedDate]: data }));
      }
      setSavedMsg('저장되었습니다.');
      window.setTimeout(() => setSavedMsg(''), 1800);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/35 flex items-end justify-center font-sans">
      <div className="bg-white w-full h-[88vh] rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
              <Icon className={`w-5 h-5 ${isDiary ? 'text-indigo-500' : 'text-emerald-500'}`} />
              <span>{title}</span>
            </h2>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{helper}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {isDiary ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm space-y-2">
                <label className="text-[11px] font-black text-gray-600">날짜</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>
              <textarea
                value={diaryText}
                onChange={e => setDiaryText(e.target.value)}
                placeholder="오늘 있었던 일, 기분, 가족과 나눈 이야기..."
                className="w-full min-h-[280px] bg-white border border-gray-100 rounded-2xl p-4 text-sm leading-relaxed resize-none focus:outline-none focus:border-indigo-300 shadow-sm"
              />
              <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
                <p className="text-[11px] font-black text-gray-600 mb-2">최근 일기</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {diaryDates.slice(0, 14).map(date => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 ${selectedDate === date ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {date.slice(5)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="장보기, 해야 할 일, 가족에게 확인할 내용..."
                className="w-full min-h-[360px] bg-white border border-gray-100 rounded-2xl p-4 text-sm leading-relaxed resize-none focus:outline-none focus:border-emerald-300 shadow-sm"
              />
              {memoUpdatedAt && <p className="text-[10px] text-gray-400 font-semibold">마지막 저장: {formatTime(memoUpdatedAt)}</p>}
            </>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
          {savedMsg && <p className="text-[11px] text-emerald-600 font-bold text-center mb-2">{savedMsg}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full ${isDiary ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600'} disabled:bg-gray-300 text-white font-black py-3 rounded-2xl text-sm flex items-center justify-center gap-2`}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? '저장 중...' : '저장하기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
