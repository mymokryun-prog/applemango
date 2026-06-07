/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, X, Pencil } from 'lucide-react';
import ItemSocial from './ItemSocial';

interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  creatorId: string;
  creatorName: string;
  likes: string[];
  timestamp: string;
}

interface Props {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  activeProfileId: string;
  myName: string;
}

export default function BookPanel({ authFetch, activeProfileId, myName }: Props) {
  const [list, setList] = useState<Book[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');

  const load = () => { authFetch('/api/books').then(r => r.json()).then(setList).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const resetForm = () => { setEditingId(null); setTitle(''); setAuthor(''); setDesc(''); };

  const startEdit = (b: Book) => {
    setEditingId(b.id); setTitle(b.title); setAuthor(b.author || ''); setDesc(b.description || ''); setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!title.trim()) { alert('책 제목을 입력해 주세요.'); return; }
    if (editingId) {
      await authFetch('/api/books/update', {
        method: 'POST',
        body: JSON.stringify({ id: editingId, title: title.trim(), author: author.trim(), description: desc.trim() })
      });
    } else {
      await authFetch('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), author: author.trim(), description: desc.trim(), creatorName: myName })
      });
    }
    resetForm(); setShowAdd(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 추천 도서를 삭제하시겠습니까?')) return;
    await authFetch('/api/books/delete', { method: 'POST', body: JSON.stringify({ id }) });
    load();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-rose-500" />
          <span>추천 도서</span>
        </h2>
        <button type="button" onClick={() => { if (showAdd) resetForm(); setShowAdd(s => !s); }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showAdd ? 'bg-gray-200 text-gray-600' : 'bg-rose-500 text-white'}`}>
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
            <p className="text-[13px] font-bold text-rose-700">{editingId ? '책 추천 수정' : '책 추천하기'}</p>
            <input type="text" placeholder="책 제목 *" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400" />
            <input type="text" placeholder="저자" value={author} onChange={e => setAuthor(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400" />
            <textarea placeholder="이 책을 추천하는 이유·설명" value={desc} onChange={e => setDesc(e.target.value)} rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400 resize-none" />
            <button type="button" onClick={handleAdd} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-xl text-sm transition">{editingId ? '수정 완료' : '추천 등록'}</button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <BookOpen className="w-12 h-12 opacity-20" />
            <p className="text-sm">추천된 책이 없습니다</p>
          </div>
        ) : list.map(b => {
          return (
            <div key={b.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900">📖 {b.title}</p>
                  {b.author && <p className="text-[11px] text-gray-500">{b.author}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-semibold">{(b.creatorName || '').split(' ')[0]}</span>
                  {b.creatorId === activeProfileId && (
                    <>
                      <button type="button" onClick={() => startEdit(b)} className="text-gray-300 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => handleDelete(b.id)} className="text-gray-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
              {b.description && <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{b.description}</p>}
              <ItemSocial kind="books" item={b} authFetch={authFetch} activeProfileId={activeProfileId} myName={myName} onChange={load} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
