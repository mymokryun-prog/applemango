/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Music, Plus, Trash2, Play, Pause, X, ExternalLink, Pencil } from 'lucide-react';

interface Track {
  id: string;
  title: string;
  originalUrl: string; // 사용자가 붙여넣은 원본 링크
  playUrl: string;     // 실제 재생용 URL
}

const STORAGE_KEY = 'aemang_music_tracks';

// 입력한 음악 링크를 그대로 재생 (별도 외부 서비스 연동 없음)
function toPlayableUrl(raw: string): string {
  return raw.trim();
}

export default function MusicPanel() {
  const [tracks, setTracks] = useState<Track[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const persist = (list: Track[]) => {
    setTracks(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const handleAdd = () => {
    if (!newUrl.trim()) { setError('음악 링크를 입력해 주세요.'); return; }
    if (editingId) {
      persist(tracks.map(t => t.id === editingId
        ? { ...t, title: newTitle.trim() || '내 음악', originalUrl: newUrl.trim(), playUrl: toPlayableUrl(newUrl) }
        : t));
    } else {
      const track: Track = {
        id: `track-${Date.now()}`,
        title: newTitle.trim() || '내 음악',
        originalUrl: newUrl.trim(),
        playUrl: toPlayableUrl(newUrl),
      };
      persist([...tracks, track]);
    }
    setEditingId(null);
    setNewTitle('');
    setNewUrl('');
    setError('');
    setShowAdd(false);
  };

  const startEdit = (track: Track) => {
    setEditingId(track.id);
    setNewTitle(track.title);
    setNewUrl(track.originalUrl);
    setError('');
    setShowAdd(true);
  };

  const handleDelete = (id: string) => {
    if (currentId === id) { audioRef.current?.pause(); setCurrentId(null); setIsPlaying(false); }
    persist(tracks.filter(t => t.id !== id));
  };

  const playTrack = (track: Track) => {
    setError('');
    if (currentId === track.id) {
      // 재생/일시정지 토글
      if (isPlaying) { audioRef.current?.pause(); }
      else { audioRef.current?.play().catch(() => setError('재생할 수 없습니다. 음악 링크(URL)를 확인해 주세요.')); }
      return;
    }
    setCurrentId(track.id);
    // 다음 렌더에서 src가 바뀐 뒤 재생
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => setError('재생할 수 없습니다. 음악 링크(URL)를 확인해 주세요.'));
      }
    }, 50);
  };

  const currentTrack = tracks.find(t => t.id === currentId) || null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          <Music className="w-5 h-5 text-rose-500" />
          <span>음악 듣기</span>
        </h2>
        <button
          type="button"
          onClick={() => { setShowAdd(s => !s); setEditingId(null); setNewTitle(''); setNewUrl(''); setError(''); }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showAdd ? 'bg-gray-200 text-gray-600' : 'bg-rose-500 text-white'}`}
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {/* 추가 폼 */}
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
            <p className="text-[13px] font-bold text-rose-700">{editingId ? '음악 수정' : '새 음악 추가'}</p>
            <input
              type="text"
              placeholder="제목 (예: 내가 만든 Suno 노래)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400"
            />
            <input
              type="text"
              placeholder="음악 파일 링크(mp3 등 URL) 붙여넣기"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400"
            />
            {error && <p className="text-[11px] text-red-500 font-semibold">{error}</p>}
            <p className="text-[10px] text-gray-400 leading-relaxed">
              💡 음악 파일의 <b>직접 링크(URL)</b>를 붙여넣으면 바로 재생됩니다. (예: mp3 파일 링크)
            </p>
            <button
              type="button"
              onClick={handleAdd}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
            >
              {editingId ? '수정 완료' : '추가하기'}
            </button>
          </div>
        )}

        {/* 현재 재생 중 카드 */}
        {currentTrack && (
          <div className="bg-gradient-to-r from-rose-500 to-amber-500 text-white rounded-2xl p-4 shadow-md flex items-center gap-3">
            <button
              type="button"
              onClick={() => playTrack(currentTrack)}
              className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 transition"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold opacity-80">{isPlaying ? '재생 중' : '일시정지'}</p>
              <p className="text-sm font-black truncate">{currentTrack.title}</p>
            </div>
          </div>
        )}

        <audio ref={audioRef} src={currentTrack?.playUrl} preload="none" />

        {/* 목록 */}
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Music className="w-12 h-12 opacity-20" />
            <p className="text-sm">아직 추가된 음악이 없습니다</p>
            <button onClick={() => setShowAdd(true)} className="bg-rose-500 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl mt-1">
              + 음악 추가하기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map(track => {
              const isCurrent = currentId === track.id;
              return (
                <div key={track.id} className={`flex items-center gap-3 bg-white rounded-2xl p-3 border shadow-sm ${isCurrent ? 'border-rose-300' : 'border-gray-100'}`}>
                  <button
                    type="button"
                    onClick={() => playTrack(track)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${isCurrent && isPlaying ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}
                  >
                    {isCurrent && isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{track.title}</p>
                    <a href={track.originalUrl} target="_blank" rel="noreferrer" className="text-[10px] text-gray-400 truncate flex items-center gap-0.5 hover:text-rose-500">
                      <ExternalLink className="w-2.5 h-2.5" /> 원본 링크
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(track)}
                    className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition shrink-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(track.id)}
                    className="p-2 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {error && currentTrack && (
          <p className="text-[11px] text-red-500 font-semibold text-center px-2">{error}</p>
        )}
      </div>
    </div>
  );
}
