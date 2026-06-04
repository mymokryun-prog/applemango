/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Message, Friend } from '../types';
import { Send, MapPin, Smile, MessageSquareShare } from 'lucide-react';

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
  roomId = ''
}: ChatRoomProps) {
  const [inputText, setInputText] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
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
    </div>
  );
}
