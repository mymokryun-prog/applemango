/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Message, Friend } from '../types';
import { Send, MapPin, Smile, MessageSquareShare, UserPlus } from 'lucide-react';

interface ChatRoomProps {
  messages: Message[];
  friends: Friend[];
  activeProfileId: string;
  onSendMessage: (text: string, locationShared?: { lat: number; lng: number; placeName: string }) => void;
  onFocusLocation: (lat: number, lng: number) => void;
  onEmergency119?: (friend: Friend) => void;
  isCareGroup?: boolean;
  isDisbanded?: boolean;
  trackingStyle?: 'continuous' | 'temporary';
  onDisbandRoom?: () => void;
  onAcceptInvite?: (id: string) => void;
  onInviteFriend?: (name: string, emoji: string, color: string, phone: string) => void;
  roomId?: string;
}

export default function ChatRoom({
  messages,
  friends,
  activeProfileId,
  onSendMessage,
  onFocusLocation,
  onEmergency119,
  isCareGroup = false,
  isDisbanded = false,
  trackingStyle = 'temporary',
  onDisbandRoom,
  onAcceptInvite,
  onInviteFriend,
  roomId = ''
}: ChatRoomProps) {
  const [inputText, setInputText] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
  // 친구초대 모달 상태
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteEmoji, setInviteEmoji] = useState('👵');
  const [inviteColor, setInviteColor] = useState('#EC4899');

  const INVITE_EMOJIS = ['👵', '🍎', '🥭', '🏠', '🍻', '💼', '🍈', '🍊', '🍑', '🍇'];
  const INVITE_COLORS = ['#EF4444', '#10B981', '#F97316', '#FACC15', '#EC4899', '#8B5CF6', '#3B82F6'];

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !invitePhone.trim()) return;
    if (onInviteFriend) {
      onInviteFriend(inviteName.trim(), inviteEmoji, inviteColor, invitePhone.trim());
    }
    setInviteName('');
    setInvitePhone('');
    setInviteEmoji('👵');
    setInviteColor('#EC4899');
    setShowInviteModal(false);
  };
  
  // Auto-scroll on new message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Find active profile
  const activeProfile = friends.find(f => f.id === activeProfileId) || {
    id: 'user-minsu',
    name: '나 (민수)',
    avatar: '🟢',
    color: '#3B82F6',
    lat: 37.5565,
    lng: 126.9242
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleShareLocation = () => {
    onSendMessage(`📍 내 실시간 안심 시그널 좌표를 전송합니다!`, {
      lat: activeProfile.lat,
      lng: activeProfile.lng,
      placeName: `${activeProfile.name}의 현재 실시간 위치`
    });
  };

  const handleQuickMention = () => {
    setInputText(prev => prev + '@애망봇 ');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Dynamic chat info header - Apple-Mango Rose-Amber Style */}
      <div className="bg-gradient-to-r from-rose-500 to-amber-500 text-white px-3 py-2.5 flex items-center justify-between border-b-2 border-black select-none shadow-sm font-sans">
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1 matches-design">
            {friends.slice(0, 3).map(f => (
              <div 
                key={f.id} 
                className="w-5.5 h-5.5 rounded-full border border-black flex items-center justify-center text-xs shadow-sm bg-white font-black shrink-0"
              >
                {f.avatar}
              </div>
            ))}
          </div>
          <div>
            <div className="text-[11px] font-black leading-none flex items-center gap-1">
              시그널 대화방 ({friends.length}명)
            </div>
            <span className="text-[7.5px] text-yellow-100 font-bold block mt-0.5">
              {trackingStyle === 'continuous' ? '👵 24시간 실시간 상시 안심형' : '⏰ 모임 폭파형 약속방'}
            </span>
          </div>
        </div>
         <div className="flex items-center gap-1.5 font-sans">
          {(!['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId) || trackingStyle === 'temporary') && !isDisbanded && onDisbandRoom && (
            <button
              onClick={onDisbandRoom}
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-[8.5px] px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition cursor-pointer"
              title={
                !['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId)
                  ? "이 커스텀 모임방과 모든 기록을 완전 폭파(삭제)합니다."
                  : "이 모임을 해체하고 실시간 위치 공유를 모두 종료합니다."
              }
            >
              {!['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId) ? '💥 방 완전히 폭파하기' : '⏰ 방 폭파하기'}
            </button>
          )}

          {!isDisbanded && onInviteFriend && (
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="bg-amber-400 hover:bg-amber-500 text-gray-900 font-extrabold text-[9px] px-2.5 py-1 rounded-lg border border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition cursor-pointer flex items-center gap-0.5"
            >
              <UserPlus className="w-3 h-3" />
              <span>초대</span>
            </button>
          )}

          <div className="relative flex items-center gap-1 bg-black/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-yellow-200">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 border border-black animate-pulse"></span>
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* Disbanded Status banner */}
      {isDisbanded && (
        <div className="bg-red-100 border-b-2 border-red-300 px-3 py-2 text-center text-red-800 text-[10px] font-black select-none">
          ⚠️ 이 약속 모임은 공식 종료되었으므로 참가자들의 실시간 무단 위치 전송이 전면 차단되었습니다.
        </div>
      )}

      {/* Wellness Care Alert System Banner */}
      {isCareGroup && !isDisbanded && (
        <div className="bg-rose-50 border-b border-rose-200 px-3 py-2 flex items-center justify-between gap-1 select-none shrink-0 font-sans">
          <div className="flex items-center gap-1.5 text-rose-850 text-[10px] font-black flex-1">
            <span className="text-xs">👵</span>
            <span className="leading-tight text-slate-800">
              상시 효도 안부 케어 활성 중 • <span className="text-emerald-700">부모님 맥박 상태 양호 💚</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const grandmother = friends.find(f => f.id === 'care-grandmother' || f.id.includes('care'));
              if (grandmother && onEmergency119) {
                onEmergency119(grandmother);
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-[9px] px-2 py-1 rounded-lg border border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition cursor-pointer"
          >
            🚨 119 긴급연결
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 친구가 나 혼자일 때의 일러스트 및 초대 카드 빈 상태 */}
        {friends.length <= 1 && (
          <div className="flex flex-col items-center justify-center p-6 bg-white border-2 border-black rounded-3xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center my-4 mx-2">
            <img src="/invite_friend.png" alt="Invite Friends" className="w-full h-32 object-contain mb-4 rounded-xl" />
            <h4 className="text-sm font-black text-gray-900 mb-1">아직 대화방에 멤버가 없습니다</h4>
            <p className="text-[10px] text-gray-500 leading-relaxed mb-4">
              위치 정보를 실시간으로 공유하고 대화하려면,<br/>
              우측 상단의 초대 단추를 누르거나 아래 버튼으로 친구를 초대하세요!
            </p>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white border-2 border-black font-black text-xs px-5 py-2.5 rounded-2xl shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ 친구 초대하기</span>
            </button>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === activeProfileId;
          const isSystem = msg.isSystem;

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center select-none my-2">
                <div className="bg-white text-slate-800 text-[10px] font-bold font-sans px-3.5 py-1.5 rounded-xl text-center max-w-[90%] border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  {msg.text}
                </div>
              </div>
            );
          }

          return (
            <div 
              key={msg.id} 
              className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Sender Avatar */}
              {!isMe && (
                <div 
                  className="w-8.5 h-8.5 rounded-full flex items-center justify-center text-base border-2 border-black bg-white shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-sans"
                >
                  {msg.senderAvatar}
                </div>
              )}

              {/* Message Payload */}
              <div className={`flex flex-col max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Sender Name */}
                {!isMe && (
                  <span className="text-[10px] text-slate-900 ml-1 font-black font-sans">
                    {msg.senderName}
                  </span>
                )}

                {/* Message Bubble with Neo-brutalist borders and shadow */}
                <div 
                  className={`px-3.5 py-2.5 text-xs mt-1 leading-relaxed border-2 border-black font-sans ${
                    isMe 
                      ? 'bg-amber-300 text-slate-950 font-black rounded-2xl rounded-tr-none shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]' 
                      : 'bg-white text-slate-950 font-bold rounded-2xl rounded-tl-none shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,0.06)]'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Shared Location Card */}
                  {msg.locationShared && !isDisbanded && (
                    <button
                      type="button"
                      onClick={() => onFocusLocation(msg.locationShared!.lat, msg.locationShared!.lng)}
                      className="mt-2 text-xs font-black tracking-tight w-full bg-black text-white p-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border-2 border-black shadow-[2px_2px_0px_0px_#F43F5E]"
                    >
                      <MapPin className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                      <span>위치: {msg.locationShared.placeName}</span>
                    </button>
                  )}

                  {/* Real Friend Invitation Acceptance Card */}
                  {msg.isInviteCard && msg.inviteId && !isDisbanded && (
                    <div className="mt-2.5 p-2 bg-amber-50 border-2 border-black rounded-xl flex flex-col gap-1.5">
                      <p className="text-[10px] text-amber-950 font-extrabold flex items-center gap-1">
                        <span>📲 핸드폰 번호 기반 보안 초청창</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (onAcceptInvite) {
                            onAcceptInvite(msg.inviteId!);
                          }
                        }}
                        className="w-full bg-[#10B981] hover:bg-[#059669] border-2 border-black text-white font-black py-1.5 px-3 rounded-lg text-[9.5px] shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span>초대 수락 및 즉시 이 방 입장하기 👍</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[8px] text-gray-400 mt-1 select-none font-mono font-medium">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={chatBottomRef} />
      </div>

      {/* Quick Option Rails */}
      <div className="px-3 py-2 bg-[#FAF5FF] border-t-2 border-black flex items-center gap-2 select-none shrink-0 overflow-x-auto whitespace-nowrap">
        {/* Mention AI */}
        <button
          type="button"
          onClick={handleQuickMention}
          className="flex items-center gap-1.5 bg-rose-500 text-white border border-black rounded-lg px-2.5 py-1 text-[9.5px] font-black hover:bg-rose-600 transition active:translate-y-0.5 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
        >
          <span>🤖 @애망봇 소환</span>
        </button>

        {/* Share Location Shortcut */}
        {!isDisbanded && (
          <button
            type="button"
            onClick={handleShareLocation}
            className="flex items-center gap-1 bg-white text-black border border-black rounded-lg px-2.5 py-1 text-[9.5px] font-black hover:bg-rose-50/50 transition active:translate-y-0.5 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
          >
            <MapPin className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            <span>내 위치 좌표 연동</span>
          </button>
        )}
      </div>

      {/* Main Send Form */}
      <form onSubmit={handleSend} className="p-3 bg-white border-t-2 border-black flex items-center gap-2 shrink-0 font-sans">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isDisbanded ? "이 방은 폭파되었습니다 (입력 차단)" : "대화 나누기... (AI는 @애망봇 입력)"}
          disabled={isDisbanded}
          className="flex-1 bg-slate-100 border-2 border-black focus:border-rose-500 rounded-xl px-4 py-2 text-xs focus:outline-none placeholder-slate-400 text-slate-900 font-bold transition-all shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] disabled:opacity-55"
        />
        <button
          type="submit"
          disabled={isDisbanded}
          className="w-8 h-8 rounded-lg bg-black text-rose-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_0px_rgba(244,63,94,1)] hover:bg-slate-900 transition active:translate-y-0.5 disabled:opacity-55 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4 text-rose-400" />
        </button>
      </form>
      {/* 친구 초대 모달 */}
      {showInviteModal && (
        <div className="absolute inset-0 bg-black/40 z-50 flex items-end justify-center font-sans">
          <form onSubmit={handleInviteSubmit} className="bg-white rounded-t-3xl w-full p-6 space-y-4 shadow-2xl max-h-[90%] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-rose-500" />
              <span>멤버 초대하기</span>
            </h3>
            
            {/* 생성한 이쁜 일러스트 삽입 */}
            <div className="w-full rounded-2xl overflow-hidden border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <img src="/invite_friend.png" alt="Invite Banner" className="w-full h-28 object-cover" />
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">초대할 친구 이름 *</label>
                <input
                  type="text" required placeholder="이름 (예: 김지우, 어머니)"
                  value={inviteName} onChange={e => setInviteName(e.target.value)}
                  className="bg-gray-50 border-2 border-black text-sm px-4 py-2.5 rounded-2xl focus:outline-none focus:border-rose-400 font-bold" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">휴대폰 번호 *</label>
                <input
                  type="tel" required placeholder="010-0000-0000"
                  value={invitePhone} onChange={e => setInvitePhone(e.target.value)}
                  className="bg-gray-50 border-2 border-black text-sm px-4 py-2.5 rounded-2xl focus:outline-none focus:border-rose-400 font-mono font-bold" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">이모지 아바타 선택</label>
                <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none">
                  {INVITE_EMOJIS.map(em => (
                    <button key={em} type="button" onClick={() => setInviteEmoji(em)}
                      className={`w-9 h-9 rounded-xl text-lg shrink-0 transition ${inviteEmoji === em ? 'bg-rose-500 text-white ring-2 ring-rose-400 border-2 border-black' : 'bg-gray-50 border border-gray-200 hover:bg-rose-50'}`}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">아바타 색상 선택</label>
                <div className="flex gap-2.5 py-1">
                  {INVITE_COLORS.map(col => (
                    <button key={col} type="button" onClick={() => setInviteColor(col)}
                      className={`w-6 h-6 rounded-full shrink-0 border-2 border-black transition ${inviteColor === col ? 'ring-2 ring-rose-400 scale-110' : 'opacity-70'}`}
                      style={{ backgroundColor: col }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="py-3 bg-gray-150 hover:bg-gray-200 text-gray-700 rounded-2xl text-sm font-semibold transition border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none"
              >
                취소
              </button>
              <button
                type="submit"
                className="py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-sm font-bold transition border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none"
              >
                초대장 발송 📨
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
