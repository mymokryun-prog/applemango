/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Music, Plus, Trash2, Play, X, Pencil } from 'lucide-react';
import ItemSocial from './ItemSocial';

interface Track {
  id: string;
  title: string;
  url: string;
  creatorId: string;
  creatorName: string;
  likes: string[];
  reviews: { id: string; text: string; authorName: string }[];
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  activeProfileId: string;
  myName: string;
}

export default function MusicPanel({ authFetch, activeProfileId, myName }: Props) {
  const [list, setList] = useState<Track[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const load = () => { authFetch('/api/music').then(r => r.json()).then(setList).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const resetForm = () => { setEditingId(null); setTitle(''); setUrl(''); setError(''); };

  const handleSubmit = async () => {
    if (!url.trim()) { setError('음악 링크(URL)를 입력해 주세요.'); return; }
    if (editingId) {
      await authFetch('/api/music/update', { method: 'POST', body: JSON.stringify({ id: editingId, title: title.trim(), url: url.trim() }) });
    } else {
      await authFetch('/api/music', { method: 'POST', body: JSON.stringify({ title: title.trim(), url: url.trim(), creatorName: myName }) });
    }
    resetForm(); setShowAdd(false);
    load();
  };

  const startEdit = (t: Track) => { setEditingId(t.id); setTitle(t.title); setUrl(t.url); setError(''); setShowAdd(true); };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 음악을 삭제하시겠습니까?')) return;
    await authFetch('/api/music/delete', { method: 'POST', body: JSON.stringify({ id }) });
    load();
  };

  // 재생 — 원본 링크를 새 탭(외부 플레이어)으로 열어 재생
  const playTrack = (t: Track) => {
    window.open(t.url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          <Music className="w-5 h-5 text-rose-500" />
          <span>음악 듣기</span>
        </h2>
        <button type="button" onClick={() => { resetForm(); setShowAdd(s => !s); }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showAdd ? 'bg-gray-200 text-gray-600' : 'bg-rose-500 text-white'}`}>
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
            <p className="text-[13px] font-bold text-rose-700">{editingId ? '음악 수정' : '새 음악 추가'}</p>
            <input type="text" placeholder="제목 (예: 내가 만든 Suno 노래)" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400" />
            <input type="text" placeholder="음악 링크(URL) 붙여넣기" value={url} onChange={e => setUrl(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400" />
            {error && <p className="text-[11px] text-red-500 font-semibold">{error}</p>}
            <p className="text-[10px] text-gray-400 leading-relaxed">
              💡 구글 드라이브 mp3/mp4 파일의 공유 링크를 붙여넣으세요. (드라이브에서 <b>"링크가 있는 모든 사용자"</b>로 공유) ▶ 누르면 링크가 열려 누구나 들을 수 있습니다.
            </p>
            <button type="button" onClick={handleSubmit} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-xl text-sm transition">
              {editingId ? '수정 완료' : '추가하기'}
            </button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Music className="w-12 h-12 opacity-20" />
            <p className="text-sm">아직 추가된 음악이 없습니다</p>
          </div>
        ) : list.map(t => (
          <div key={t.id} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm space-y-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => playTrack(t)}
                className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center shrink-0 transition">
                <Play className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{t.title}</p>
                <p className="text-[10px] text-gray-400">{(t.creatorName || '').split(' ')[0]}</p>
              </div>
              {t.creatorId === activeProfileId && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => startEdit(t)} className="p-1.5 text-gray-300 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => handleDelete(t.id)} className="p-1.5 text-gray-300 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            <ItemSocial kind="music" item={t} authFetch={authFetch} activeProfileId={activeProfileId} myName={myName} onChange={load} />
          </div>
        ))}
      </div>
    </div>
  );
}
