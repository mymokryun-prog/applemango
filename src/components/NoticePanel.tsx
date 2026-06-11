/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Lock, Megaphone, Pencil, Plus, X } from 'lucide-react';
import { getLocationSocket } from '../realtime/socketClient';

interface Notice {
  id: string;
  title: string;
  body: string;
  authorName: string;
  timestamp: string;
}

interface NoticePanelProps {
  scope: 'lobby' | 'room';
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  activeRoomId?: string;
  activeRoomName?: string;
  myName: string;
}

export default function NoticePanel({ scope, authFetch, activeRoomId, activeRoomName, myName }: NoticePanelProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isLobby = scope === 'lobby';
  const heading = isLobby ? '로비 공지사항' : '그룹방 공지';
  const helper = isLobby
    ? '모든 사용자가 볼 수 있는 전체 공지입니다.'
    : `${activeRoomName || '그룹방'} 멤버들이 함께 올리고 확인하는 공지입니다.`;

  const load = () => {
    const url = isLobby
      ? '/api/notices/lobby'
      : `/api/notices/room?roomId=${encodeURIComponent(activeRoomId || '')}`;
    authFetch(url)
      .then(r => r.ok ? r.json() : [])
      .then(setNotices)
      .catch(() => {});
  };

  useEffect(() => { load(); }, [scope, activeRoomId]);

  useEffect(() => {
    const socket = getLocationSocket();
    const handleUpdate = () => load();
    socket.on(isLobby ? 'lobby-notices-updated' : 'room-refresh', handleUpdate);
    return () => {
      socket.off(isLobby ? 'lobby-notices-updated' : 'room-refresh', handleUpdate);
    };
  }, [isLobby, activeRoomId]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setPassword('');
    setError('');
  };

  const startEdit = (notice: Notice) => {
    setEditingId(notice.id);
    setTitle(notice.title);
    setBody(notice.body);
    setPassword('');
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      setError('제목과 내용을 입력해 주세요.');
      return;
    }
    if (isLobby && !password.trim()) {
      setError('로비 공지는 작성 비밀번호가 필요합니다.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const endpoint = editingId
        ? (isLobby ? '/api/notices/lobby/update' : '/api/notices/room/update')
        : (isLobby ? '/api/notices/lobby' : '/api/notices/room');
      const res = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          id: editingId,
          roomId: activeRoomId,
          title: cleanTitle,
          body: cleanBody,
          authorName: myName,
          ...(isLobby ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (editingId ? '공지 수정에 실패했습니다.' : '공지 등록에 실패했습니다.'));
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err?.message || (editingId ? '공지 수정에 실패했습니다.' : '공지 등록에 실패했습니다.'));
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-amber-50 overflow-y-auto font-sans">
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-amber-100 shrink-0">
        <div>
          <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-amber-500" />
            <span>{heading}</span>
          </h2>
          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{helper}</p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(s => !s); }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showForm ? 'bg-gray-200 text-gray-600' : 'bg-amber-500 text-white'}`}
          title="공지 작성"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {showForm && (
          <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm space-y-2.5">
            <p className="text-[13px] font-black text-amber-700">{editingId ? '공지 수정' : '새 공지 작성'}</p>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="제목"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
            />
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="공지 내용을 입력하세요"
              rows={5}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-400"
            />
            {isLobby && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={editingId ? '수정 비밀번호' : '작성 비밀번호'}
                  autoComplete="new-password"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            )}
            {error && <p className="text-[11px] text-red-500 font-bold">{error}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-black py-2.5 rounded-xl text-sm transition"
            >
              {isSaving ? '저장 중...' : editingId ? '수정 저장' : '공지 올리기'}
            </button>
          </div>
        )}

        {notices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Megaphone className="w-12 h-12 opacity-25" />
            <p className="text-sm font-bold">아직 등록된 공지가 없습니다</p>
          </div>
        ) : notices.map(notice => (
          <article key={notice.id} className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-gray-900 leading-snug">{notice.title}</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] text-gray-400">{formatTime(notice.timestamp)}</span>
                <button
                  type="button"
                  onClick={() => startEdit(notice)}
                  className="w-7 h-7 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center justify-center"
                  title="공지 수정"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap mt-2">{notice.body}</p>
            <p className="text-[10px] text-amber-600 font-bold mt-3">{notice.authorName || '공지 작성자'}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
