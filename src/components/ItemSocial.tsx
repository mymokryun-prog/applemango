/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Heart, MessageCircle, Send } from 'lucide-react';

interface Review { id: string; text: string; authorName: string; }
interface Item { id: string; likes?: string[]; reviews?: Review[]; }

interface Props {
  kind: 'restaurants' | 'books' | 'music';
  item: Item;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  activeProfileId: string;
  myName: string;
  onChange: () => void;
}

// 좋아요 + 후기(댓글) 공통 UI — 맛집/책/음악에서 재사용
export default function ItemSocial({ kind, item, authFetch, activeProfileId, myName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const likes = item.likes || [];
  const reviews = item.reviews || [];
  const liked = likes.includes(activeProfileId);

  const toggleLike = async () => {
    await authFetch(`/api/${kind}/like`, { method: 'POST', body: JSON.stringify({ id: item.id }) });
    onChange();
  };

  const addReview = async () => {
    if (!text.trim()) return;
    await authFetch(`/api/${kind}/review`, { method: 'POST', body: JSON.stringify({ id: item.id, text: text.trim(), authorName: myName }) });
    setText('');
    onChange();
  };

  return (
    <div className="pt-1 space-y-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggleLike}
          className={`flex items-center gap-1 text-xs font-bold transition ${liked ? 'text-rose-500' : 'text-gray-400 hover:text-rose-400'}`}>
          <Heart className={`w-4 h-4 ${liked ? 'fill-rose-500' : ''}`} /> 좋아요 {likes.length}
        </button>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700">
          <MessageCircle className="w-4 h-4" /> 후기 {reviews.length}
        </button>
      </div>

      {open && (
        <div className="pt-1.5 border-t border-gray-50 space-y-2">
          {reviews.map(rv => (
            <div key={rv.id} className="text-[11px]">
              <span className="font-bold text-gray-700">{rv.authorName}</span>
              <span className="text-gray-600"> · {rv.text}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input type="text" value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addReview()}
              placeholder="후기 댓글 달기..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-rose-400" />
            <button type="button" onClick={addReview} className="w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0"><Send className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
