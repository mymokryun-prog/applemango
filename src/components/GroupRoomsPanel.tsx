/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Users, ChevronRight, Trash2, X } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  emoji: string;
  type: string;
  trackingStyle?: string;
  isDisbanded?: boolean;
  memberCount?: number;
  ownerId?: string;
  lastMessage?: string;
  unreadCount?: number;
}

interface GroupRoomsPanelProps {
  rooms: Room[];
  activeRoomId: string;
  activeProfileId: string;
  messages: { roomId: string; text: string; timestamp: string }[];
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (name: string, emoji: string, type: string, trackingStyle: string) => void;
  onDeleteRoom: (roomId: string) => void;
}

const ROOM_TYPE_OPTIONS = [
  { value: 'friends', label: '🤝 친구 모임', trackingStyle: 'temporary' },
  { value: 'family',  label: '🏠 가족',       trackingStyle: 'continuous' },
  { value: 'work',    label: '💼 직장 동료',   trackingStyle: 'temporary' },
  { value: 'care',    label: '👵 부모님 안심방', trackingStyle: 'continuous' },
];

const EMOJI_OPTIONS = ['🍎','🥭','🏠','👔','👵','🍻','🎯','🌸','🚀','💎'];

export default function GroupRoomsPanel({
  rooms, activeRoomId, activeProfileId, messages,
  onSelectRoom, onCreateRoom, onDeleteRoom,
}: GroupRoomsPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🍎');
  const [newType, setNewType] = useState('friends');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const typeOption = ROOM_TYPE_OPTIONS.find(t => t.value === newType);
      await onCreateRoom(newName.trim(), newEmoji, newType, typeOption?.trackingStyle || 'temporary');
      setNewName('');
      setNewEmoji('🍎');
      setNewType('friends');
      setShowCreate(false);
    } catch (error) {
      console.error('Failed to create group room:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // 방별 마지막 메시지 가져오기
  const getLastMsg = (roomId: string) => {
    const roomMsgs = messages.filter(m => m.roomId === roomId);
    return roomMsgs[roomMsgs.length - 1];
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / 3600000;
    if (diffH < 24) return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (diffH < 48) return '어제';
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
        <h2 className="text-[16px] font-black text-gray-900">그룹방</h2>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showCreate ? 'bg-gray-200 text-gray-600' : 'bg-rose-500 text-white'}`}
        >
          {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      {/* 방 목록 */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {/* 그룹 생성 폼 */}
        {showCreate && (
          <div className="mx-4 mt-3 mb-3 bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-3 shrink-0">
            <p className="text-[13px] font-bold text-rose-700">새 그룹방 만들기</p>

            {/* 이모지 선택 */}
            <div className="flex gap-1.5 flex-wrap">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} type="button" onClick={() => setNewEmoji(e)}
                  className={`w-9 h-9 rounded-xl text-lg transition ${newEmoji === e ? 'bg-rose-500 text-white ring-2 ring-rose-400' : 'bg-white border border-gray-200 hover:bg-rose-50'}`}>
                  {e}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="그룹 이름 (예: 대학 동창, 가족 안심방)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-400"
            />

            <div className="grid grid-cols-2 gap-2">
              {ROOM_TYPE_OPTIONS.map(t => (
                <button key={t.value} type="button" onClick={() => setNewType(t.value)}
                  className={`py-2 rounded-xl text-xs font-semibold transition text-left px-3 ${newType === t.value ? 'bg-rose-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-rose-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || isCreating}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-2xl text-sm transition"
            >
              {isCreating ? '생성 중...' : `${newEmoji} ${newName || '그룹'} 만들기`}
            </button>
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Users className="w-12 h-12 opacity-20" />
            <p className="text-sm">아직 그룹방이 없습니다</p>
            <button onClick={() => setShowCreate(true)}
              className="bg-rose-500 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl">
              + 첫 그룹 만들기
            </button>
          </div>
        ) : (
          rooms.map(room => {
            const isActive = activeRoomId === room.id;
            const lastMsg = getLastMsg(room.id);
            const isOwner = room.ownerId === activeProfileId ||
              ['room-friends','room-family','room-work','room-care'].includes(room.id);

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition ${isActive ? 'bg-rose-50' : 'hover:bg-gray-50'}`}
              >
                {/* 이모지 아바타 */}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${isActive ? 'bg-rose-100' : 'bg-gray-100'}`}>
                  {room.emoji}
                </div>

                {/* 방 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[14px] font-bold truncate ${isActive ? 'text-rose-700' : 'text-gray-900'}`}>
                      {room.name}
                    </span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {lastMsg ? formatTime(lastMsg.timestamp) : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[12px] text-gray-400 truncate flex-1">
                      {lastMsg ? lastMsg.text.replace(/\n/g, ' ').slice(0, 30) : '채팅을 시작해 보세요'}
                    </span>
                    {room.memberCount !== undefined && (
                      <span className="text-[10px] text-gray-300 shrink-0">{room.memberCount}명</span>
                    )}
                  </div>
                  {room.isDisbanded && (
                    <span className="text-[10px] text-red-400 font-semibold">종료됨</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* 삭제 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRoom(room.id);
                    }}
                    className="p-2 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                    title={isOwner ? "삭제" : "탈퇴/삭제"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 워크플로우 안내 (방이 있을 때) */}
      {rooms.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
          <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
            💡 <b>그룹방 선택</b> → <b>멤버 초대</b> → <b>약속 잡기</b> → <b>지도에서 위치 확인</b>
          </p>
        </div>
      )}
    </div>
  );
}
