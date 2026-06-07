/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Message, Friend } from '../types';
import { Send, MapPin, Smile, MessageSquareShare, UserPlus, Calendar, Users, Search, Loader2, CheckCircle2, X, Image as ImageIcon } from 'lucide-react';

interface ChatRoomProps {
  messages: Message[];
  friends: Friend[];
  activeProfileId: string;
  onSendMessage: (text: string, locationShared?: { lat: number; lng: number; placeName: string }) => void;
  onSendImage?: (imageDataUrl: string) => void;
  onFocusLocation: (lat: number, lng: number) => void;
  onEmergency119?: (friend: Friend) => void;
  isCareGroup?: boolean;
  isDisbanded?: boolean;
  trackingStyle?: 'continuous' | 'temporary';
  onDisbandRoom?: () => void;
  onAcceptInvite?: (id: string) => void;
  onInviteFriend?: (name: string, emoji: string, color: string, phone: string) => void;
  onRemoveFriend?: (id: string, name: string) => void;
  roomId?: string;
  ownerId?: string;
  onCreateAppointment?: (title: string, placeName: string, datetime: string, lat: number, lng: number) => void;
}

export default function ChatRoom({
  messages,
  friends,
  activeProfileId,
  onSendMessage,
  onSendImage,
  onFocusLocation,
  onEmergency119,
  isCareGroup = false,
  isDisbanded = false,
  trackingStyle = 'temporary',
  onDisbandRoom,
  onAcceptInvite,
  onInviteFriend,
  onRemoveFriend,
  roomId = '',
  ownerId = '',
  onCreateAppointment
}: ChatRoomProps) {
  const isSystemRoom = ['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId);
  // 방장(커스텀방) 또는 기본 시스템방에서는 멤버를 내보낼 수 있음
  const iAmOwner = isSystemRoom || (!!ownerId && ownerId === activeProfileId);
  const [inputText, setInputText] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
  // 친구초대 모달 상태
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteEmoji, setInviteEmoji] = useState('👵');
  const [inviteColor, setInviteColor] = useState('#EC4899');

  // 멤버 목록 모달 상태
  const [showMembersModal, setShowMembersModal] = useState(false);

  // 약속 만들기 모달 상태
  const [showAppModal, setShowAppModal] = useState(false);
  const [appPlaceQuery, setAppPlaceQuery] = useState('');
  const [appPlaceResults, setAppPlaceResults] = useState<any[]>([]);
  const [isAppSearching, setIsAppSearching] = useState(false);
  const [confirmedAppPlace, setConfirmedAppPlace] = useState<any | null>(null);
  const [appTitle, setAppTitle] = useState('');

  // 로컬 시간대 기준 YYYY-MM-DD 날짜 구하기 헬퍼
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [appDate, setAppDate] = useState(() => getLocalDateString());
  const [appTime, setAppTime] = useState('19:00');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const INVITE_EMOJIS = ['👵', '🍎', '🥭', '🏠', '🍻', '💼', '🍈', '🍊', '🍑', '🍇'];
  const INVITE_COLORS = ['#EF4444', '#10B981', '#F97316', '#FACC15', '#EC4899', '#8B5CF6', '#3B82F6'];

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = inviteName.trim();
    const cleanPhone = invitePhone.trim();
    if (!cleanName && !cleanPhone) {
      alert('초대할 친구 이름 또는 휴대폰 번호 중 최소 하나는 입력해 주세요!');
      return;
    }
    if (onInviteFriend) {
      onInviteFriend(cleanName, inviteEmoji, inviteColor, cleanPhone);
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


  // 실시간 장소 검색 디바운스
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!appPlaceQuery.trim() || confirmedAppPlace) {
      setAppPlaceResults([]);
      setIsAppSearching(false);
      return;
    }

    setIsAppSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        if ((window as any).kakao?.maps?.services) {
          // 장소(키워드) + 주소 검색 병행
          const ps = new (window as any).kakao.maps.services.Places();
          const geocoder = new (window as any).kakao.maps.services.Geocoder();
          const Status = (window as any).kakao.maps.services.Status;
          const merged: any[] = [];
          const pushUnique = (r: any) => {
            if (isNaN(r.lat) || isNaN(r.lng)) return;
            if (!merged.some(m => Math.abs(m.lat - r.lat) < 1e-7 && Math.abs(m.lng - r.lng) < 1e-7)) merged.push(r);
          };
          let done = 0;
          const finish = () => {
            if (++done < 2) return;
            setIsAppSearching(false);
            setAppPlaceResults(merged.slice(0, 6));
          };
          ps.keywordSearch(appPlaceQuery, (data: any[], status: string) => {
            if (status === Status.OK) {
              data.forEach((item: any) => pushUnique({
                name: item.place_name,
                address: item.road_address_name || item.address_name,
                lat: parseFloat(item.y),
                lng: parseFloat(item.x),
              }));
            }
            finish();
          });
          geocoder.addressSearch(appPlaceQuery, (data: any[], status: string) => {
            if (status === Status.OK) {
              data.forEach((item: any) => pushUnique({
                name: item.road_address?.building_name || item.address_name,
                address: item.road_address?.address_name || item.address_name,
                lat: parseFloat(item.y),
                lng: parseFloat(item.x),
              }));
            }
            finish();
          });
        } else {
          const res = await fetch(`/api/places/search?q=${encodeURIComponent(appPlaceQuery)}`);
          if (res.ok) {
            const data = await res.json();
            setAppPlaceResults(data.slice(0, 6));
          }
          setIsAppSearching(false);
        }
      } catch {
        setIsAppSearching(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [appPlaceQuery, confirmedAppPlace]);

  const formatKoreanDatetime = (date: string, time: string) => {
    if (!date) return '시간 조율 중';
    const d = new Date(`${date}T${time || '00:00'}`);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = d.getHours();
    const min = d.getMinutes();
    const ampm = hour < 12 ? '오전' : '오후';
    const h = hour % 12 || 12;
    return `${year}년 ${month}월 ${day}일 ${ampm} ${h}:${String(min).padStart(2, '0')}`;
  };

  const handleCreateAppSubmit = () => {
    if (!appTitle.trim() || !confirmedAppPlace || !onCreateAppointment) return;
    const formattedDt = formatKoreanDatetime(appDate, appTime);
    onCreateAppointment(
      appTitle.trim(),
      confirmedAppPlace.name,
      formattedDt,
      confirmedAppPlace.lat,
      confirmedAppPlace.lng
    );
    resetAppForm();
    setShowAppModal(false);
    alert('약속방에 새로운 약속이 성공적으로 개설되었습니다! 📅');
  };

  const resetAppForm = () => {
    setAppPlaceQuery('');
    setConfirmedAppPlace(null);
    setAppTitle('');
    setAppDate(getLocalDateString());
    setAppTime('19:00');
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  // 이미지 첨부 — 큰 사진을 자동 압축(최대 1000px, JPEG 0.7)해 용량을 줄여 전송
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const compressImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1000;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas error'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 다시 선택 가능하도록 초기화
    if (!file || !onSendImage) return;
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 보낼 수 있습니다.'); return; }
    setIsUploadingImage(true);
    try {
      const dataUrl = await compressImage(file);
      await onSendImage(dataUrl);
    } catch (err) {
      console.error(err);
      alert('이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleQuickMention = () => {
    setInputText(prev => prev + '@애망봇 ');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-gradient-to-r from-rose-500 to-amber-500 text-white px-3 py-1.5 flex items-center justify-between border-b-2 border-black select-none shadow-sm font-sans">
        <div className="text-[10px] font-black tracking-tight flex items-center gap-1">
          <span>💬 안심톡</span>
        </div>
        <div className="flex items-center gap-1 font-sans">
          {(!['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId) || trackingStyle === 'temporary') && !isDisbanded && onDisbandRoom && (
            <button
              onClick={onDisbandRoom}
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-[7.5px] px-1.5 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition cursor-pointer"
              title={
                !['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId)
                  ? "이 커스텀 모임방과 모든 기록을 완전 폭파(삭제)합니다."
                  : "이 모임을 해체하고 실시간 위치 공유를 모두 종료합니다."
              }
            >
              {!['room-friends', 'room-family', 'room-work', 'room-care'].includes(roomId) ? '💥 방 삭제' : '💥 방 폭파'}
            </button>
          )}

          {!isDisbanded && onCreateAppointment && (
            <button
              type="button"
              onClick={() => setShowAppModal(true)}
              className="bg-sky-400 hover:bg-sky-500 text-slate-950 font-extrabold text-[7.5px] px-1.5 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition cursor-pointer flex items-center gap-0.5"
            >
              <Calendar className="w-2.5 h-2.5" />
              <span>약속 만들기</span>
            </button>
          )}

          {!isDisbanded && onInviteFriend && (
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="bg-amber-400 hover:bg-amber-500 text-gray-900 font-extrabold text-[7.5px] px-1.5 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition cursor-pointer flex items-center gap-0.5"
            >
              <UserPlus className="w-2.5 h-2.5" />
              <span>초대</span>
            </button>
          )}

          <div className="relative flex items-center gap-0.5 bg-black/30 px-1 py-0.5 rounded text-[7.5px] font-black uppercase text-yellow-200">
            <span className="inline-block w-1 h-1 bg-green-500 rounded-full border border-black animate-pulse"></span>
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* 초대된 멤버 가로 스크롤 리스트 (전체 초대된 사람 리스트) */}
      <div className="bg-[#FFFDF9] border-b-2 border-black px-3 py-2 flex items-center gap-2 select-none overflow-x-auto whitespace-nowrap shrink-0 scrollbar-none shadow-sm">
        <button type="button" onClick={() => setShowMembersModal(true)}
          className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 hover:text-rose-500">
          <Users className="w-3.5 h-3.5 text-rose-500" />
          <span>멤버 관리 ({friends.length}) ▸</span>
        </button>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {friends.map((friend) => {
            const isOwner = friend.id === ownerId || (friend.id === 'user-minsu' && !ownerId);
            const isOnline = friend.isOnline !== false;
            const isPending = friend.isPendingInvite;
            
            return (
              <div 
                key={friend.id}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border-2 border-black text-[10px] font-extrabold shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] bg-white shrink-0 ${
                  isPending ? 'border-dashed border-amber-500 text-amber-900 bg-amber-50/50' : 'text-slate-800'
                }`}
                title={`${friend.name} - ${friend.statusMsg || ''}`}
              >
                <div
                  style={{ backgroundColor: friend.color || '#3B82F6' }}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 font-black text-white"
                >
                  {friend.avatar}
                </div>
                <div className="flex flex-col justify-center leading-none text-left">
                  <div className="flex items-center gap-0.5">
                    <span className="max-w-[70px] truncate">{friend.name.replace(' (대기)', '').replace(' (합류)', '')}</span>
                    {isOwner && <span className="text-[7px]" title="방장">👑</span>}
                  </div>
                  <span className="text-[6px] text-slate-400 font-bold">
                    {isPending ? '수락대기' : isOnline ? '온라인' : '오프라인'}
                  </span>
                </div>
                <span className={`w-1.5 h-1.5 rounded-full border border-black shrink-0 ${
                  isPending ? 'bg-amber-400 animate-pulse' : isOnline ? 'bg-emerald-500' : 'bg-gray-300'
                }`} />
                {iAmOwner && friend.id !== activeProfileId && onRemoveFriend && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`${friend.name.replace(' (대기)', '').replace(' (합류)', '')} 님을 이 그룹방에서 탈퇴시키겠습니까?`)) {
                        onRemoveFriend(friend.id, friend.name);
                      }
                    }}
                    title="이 멤버 탈퇴시키기 (방장)"
                    className="ml-0.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 hover:bg-rose-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
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
        {friends.length <= 1 && (
          <div className="flex flex-col items-center justify-center p-4 bg-white border-2 border-black rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-center my-2 mx-1 select-none">
            <h4 className="text-xs font-black text-gray-900 mb-1">아직 대화방에 멤버가 없습니다</h4>
            <p className="text-[9px] text-gray-500 leading-relaxed mb-3">
              우측 상단의 [초대] 단추를 눌러 첫 친구를 초대해 보세요!
            </p>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1 bg-[#10B981] hover:bg-[#059669] text-white border border-black font-black text-[10px] px-3.5 py-1.5 rounded-xl shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>친구 초대하기</span>
            </button>
          </div>
        )}
        {messages.filter((msg, i) => {
          // 중복 의사표시 방지: 직전과 동일한 텍스트의 시스템 메시지는 표시하지 않음
          if (!msg.isSystem) return true;
          const prev = messages[i - 1];
          return !(prev && prev.isSystem && prev.text === msg.text);
        }).map((msg) => {
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
              {/* Sender Avatar — 클릭하면 그 사람의 위치를 지도에서 확인 */}
              {!isMe && (
                <button
                  type="button"
                  onClick={() => {
                    const f = friends.find(fr => fr.id === msg.senderId);
                    if (f && typeof f.lat === 'number' && typeof f.lng === 'number') onFocusLocation(f.lat, f.lng);
                  }}
                  title={`${msg.senderName} 위치 보기`}
                  className="w-8.5 h-8.5 rounded-full flex items-center justify-center text-base bg-white shrink-0 font-sans cursor-pointer active:scale-95 transition"
                >
                  {msg.senderAvatar}
                </button>
              )}

              {/* Message Payload */}
              <div className={`flex flex-col max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Sender Name */}
                {!isMe && (
                  <span className="text-[10px] text-slate-900 ml-1 font-black font-sans">
                    {msg.senderName}
                  </span>
                )}

                {/* Message Bubble — 테두리 없이 부드러운 그림자만 */}
                <div
                  className={`px-3.5 py-2.5 text-xs mt-1 leading-relaxed font-sans shadow-sm ${
                    isMe
                      ? 'bg-amber-300 text-slate-950 font-bold rounded-2xl rounded-tr-none'
                      : 'bg-white text-slate-950 font-medium rounded-2xl rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* 첨부 이미지 */}
                  {msg.image && (
                    <img
                      src={`/api/image/${msg.image}`}
                      alt="첨부 이미지"
                      loading="lazy"
                      onClick={() => window.open(`/api/image/${msg.image}`, '_blank')}
                      className="mt-2 rounded-xl max-w-[200px] w-full border-2 border-black cursor-pointer"
                    />
                  )}

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

      {/* Main Send Form */}
      <form onSubmit={handleSend} className="p-3 bg-white border-t-2 border-black flex items-center gap-2 shrink-0 font-sans">
        {/* 이미지 첨부 */}
        {!isDisbanded && onSendImage && (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handlePickImage}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploadingImage}
              title="사진 보내기"
              className="w-8 h-8 rounded-lg bg-slate-100 border-2 border-black flex items-center justify-center shrink-0 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-amber-50 transition active:translate-y-0.5 disabled:opacity-50"
            >
              {isUploadingImage ? <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> : <ImageIcon className="w-4 h-4 text-rose-500" />}
            </button>
          </>
        )}
        {/* @애망봇 소환 — 사진 버튼 오른쪽 */}
        {!isDisbanded && (
          <button
            type="button"
            onClick={handleQuickMention}
            title="@애망봇 소환"
            className="w-8 h-8 rounded-lg bg-rose-500 text-white border-2 border-black flex items-center justify-center shrink-0 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-rose-600 transition active:translate-y-0.5 text-sm"
          >
            🤖
          </button>
        )}
        <input
          type="text"
          name="aemang-chat-message"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isDisbanded ? "이 방은 폭파되었습니다 (입력 차단)" : "대화 나누기... (AI는 @애망봇 입력)"}
          disabled={isDisbanded}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
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
                <label className="text-xs font-semibold text-gray-600">초대할 친구 이름 (이름 또는 전화번호 중 하나 이상 입력)</label>
                <input
                  type="text" placeholder="이름 (예: 김지우, 어머니)"
                  value={inviteName} onChange={e => setInviteName(e.target.value)}
                  className="bg-gray-50 border-2 border-black text-sm px-4 py-2.5 rounded-2xl focus:outline-none focus:border-rose-400 font-bold" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">휴대폰 번호 (이름 또는 전화번호 중 하나 이상 입력)</label>
                <input
                  type="tel" placeholder="010-0000-0000"
                  value={invitePhone} onChange={e => setInvitePhone(e.target.value)}
                  className="bg-gray-50 border-2 border-black text-sm px-4 py-2.5 rounded-2xl focus:outline-none focus:border-rose-400 font-mono font-bold" />
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

      {/* 대화방 초대 멤버 전체 목록 모달 */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-white border-2 border-black rounded-3xl w-full max-w-sm overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[80vh]">
            <div className="bg-gradient-to-r from-rose-500 to-amber-500 text-white px-4 py-3 border-b-2 border-black flex justify-between items-center shrink-0">
              <span className="text-sm font-black flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>대화방 초대 멤버 목록 ({friends.length}명)</span>
              </span>
              <button onClick={() => setShowMembersModal(false)} className="text-white hover:text-yellow-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto divide-y divide-gray-150 flex-1">
              {friends.map((friend) => {
                const isOwner = friend.id === ownerId || (friend.id === 'user-minsu' && !ownerId);
                const isOnline = friend.isOnline !== false;
                return (
                  <div key={friend.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        style={{ backgroundColor: friend.color || '#3B82F6' }}
                        className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-lg shadow-sm font-black text-white shrink-0"
                      >
                        {friend.avatar}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-black text-slate-800">{friend.name}</span>
                          {isOwner && (
                            <span className="bg-amber-400 border border-amber-500 text-slate-900 text-[8px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5 leading-none shadow-sm">
                              👑 방장
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {friend.phone || '연락처 없음'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                        <span className="text-[9px] font-bold text-gray-500">{isOnline ? '온라인' : '오프라인'}</span>
                      </div>
                      {iAmOwner && friend.id !== activeProfileId && onRemoveFriend && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`${friend.name.replace(' (대기)', '').replace(' (합류)', '')} 님을 이 그룹방에서 내보내시겠습니까?`)) {
                              onRemoveFriend(friend.id, friend.name);
                              setShowMembersModal(false);
                            }
                          }}
                          className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition"
                        >
                          내보내기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!iAmOwner && (
              <div className="px-4 py-2 text-[10px] text-gray-400 text-center border-t border-gray-100 shrink-0">멤버 내보내기는 방장만 할 수 있습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* 위치검색 우선 약속 만들기 모달 */}
      {showAppModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-white border-2 border-black rounded-3xl w-full max-w-sm overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[85vh]">
            <div className="bg-amber-100 px-4 py-3 border-b-2 border-black flex justify-between items-center shrink-0">
              <span className="text-sm font-black text-gray-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>새 약속 만들기</span>
              </span>
              <button onClick={() => { setShowAppModal(false); resetAppForm(); }} className="text-gray-650 hover:text-black cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Step 1: 위치 검색 */}
              <div className="space-y-1 relative">
                <label className="text-xs font-bold text-gray-700">1. 모임 장소 검색 *</label>
                {confirmedAppPlace ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-250 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-bold text-emerald-800 truncate">{confirmedAppPlace.name}</p>
                        <p className="text-[9px] text-gray-400 truncate">{confirmedAppPlace.address}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setConfirmedAppPlace(null)} className="text-[10px] text-emerald-600 font-bold hover:underline shrink-0 ml-2 cursor-pointer">변경</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    {isAppSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 animate-spin" />}
                    <input
                      type="text"
                      value={appPlaceQuery}
                      onChange={e => setAppPlaceQuery(e.target.value)}
                      placeholder="예: 강남역, 홍대 스타벅스"
                      className="w-full bg-white border-2 border-black rounded-xl py-2.5 pl-9 pr-9 text-xs focus:outline-none focus:border-amber-400 font-bold"
                    />
                    {appPlaceQuery.trim() && appPlaceResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-black rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto divide-y divide-gray-100">
                        {appPlaceResults.map((place, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setConfirmedAppPlace(place);
                              setAppPlaceQuery(place.name);
                            }}
                            className="w-full text-left hover:bg-amber-50 px-3 py-2 transition flex items-start gap-2 text-xs cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-800 truncate text-[11px]">{place.name}</p>
                              <p className="text-[9px] text-gray-400 truncate">{place.address}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: 위치 확정 시 폼 활성화 */}
              {confirmedAppPlace && (
                <div className="space-y-4 animate-slideDown">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">2. 약속 이름 *</label>
                    <input
                      type="text"
                      value={appTitle}
                      onChange={e => setAppTitle(e.target.value)}
                      placeholder="예) 삼겹살 번개, 저녁 식사"
                      className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">3. 날짜 및 시간 *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={appDate}
                        onChange={e => setAppDate(e.target.value)}
                        onClick={e => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                        className="bg-white border-2 border-black rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400 cursor-pointer w-full font-bold"
                      />
                      <input
                        type="time"
                        value={appTime}
                        onChange={e => setAppTime(e.target.value)}
                        onClick={e => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                        className="bg-white border-2 border-black rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400 cursor-pointer w-full font-bold"
                      />
                    </div>
                    {appDate && (
                      <p className="text-[10px] text-amber-600 font-bold mt-1 px-1">
                        설정 시: {formatKoreanDatetime(appDate, appTime)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={handleCreateAppSubmit}
                    disabled={!appTitle.trim()}
                    className="w-full bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-300 text-gray-950 font-black py-2.5 rounded-2xl text-xs transition border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none cursor-pointer"
                  >
                    약속 생성하기 📅
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
