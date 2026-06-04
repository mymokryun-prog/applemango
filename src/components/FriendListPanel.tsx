/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Friend } from '../types';
import { Search, UserPlus2, Check, UserX, Heart, Footprints, AlertTriangle, MapPin, Shield, ShieldOff } from 'lucide-react';

interface FriendListPanelProps {
  friends: Friend[];
  activeProfileId: string;
  selectedFriendId: string | null;
  onSelectFriend: (id: string | null) => void;
  onInviteFriend: (name: string, emoji: string, color: string, phone: string) => void;
  onManualMoveFriend: (id: string, latOffset: number, lngOffset: number) => void;
  onUpdateStatusMsg: (id: string, text: string) => void;
  onEmergency119?: (friend: Friend) => void;
  onTogglePedometer?: (id: string, enabled: boolean) => void;
  onToggleHeartRate?: (id: string, enabled: boolean) => void;
  isCareGroup?: boolean;
  onMeasureHeartRate?: (friend: Friend) => void;
  onDeleteFriend?: (id: string) => void;
  onAcceptInvite?: (id: string) => void;
  isRoomOwner?: boolean;
  onLeaveRoom?: () => void;
  showDevControls?: boolean;
}

const AVATAR_OPTIONS = ['👵', '👴', '👩', '🧔', '🦁', '🦊', '🐻', '🐼'];
const COLOR_OPTIONS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6'];

export default function FriendListPanel({
  friends,
  activeProfileId,
  selectedFriendId,
  onSelectFriend,
  onInviteFriend,
  onManualMoveFriend,
  onUpdateStatusMsg,
  onEmergency119,
  onTogglePedometer,
  onToggleHeartRate,
  isCareGroup = false,
  onMeasureHeartRate,
  onDeleteFriend,
  onAcceptInvite,
  isRoomOwner = false,
  onLeaveRoom,
  showDevControls = false,
}: FriendListPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('010-');
  const [inviteEmoji, setInviteEmoji] = useState('👩');
  const [inviteColor, setInviteColor] = useState('#EC4899');
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 지오펜스 상태 (friendId → geofence 설정)
  const [geofences, setGeofences] = useState<Record<string, { lat: number; lng: number; radiusM: number } | null>>({});
  const [geofenceRadiusInput, setGeofenceRadiusInput] = useState<Record<string, number>>({});
  const [savingGeofence, setSavingGeofence] = useState<string | null>(null);

  const filteredFriends = friends.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.statusMsg || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !invitePhone.trim()) return;
    const phoneDigits = invitePhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      alert('올바른 전화번호를 입력해 주세요. (예: 010-1234-5678)');
      return;
    }
    onInviteFriend(inviteName, inviteEmoji, inviteColor, invitePhone);
    setInviteName('');
    setInvitePhone('010-');
    setShowInviteForm(false);
  };

  const getHeartRateColor = (bpm: number) => {
    if (bpm < 50 || bpm > 100) return 'text-red-500';
    if (bpm < 60 || bpm > 90) return 'text-amber-500';
    return 'text-emerald-600';
  };

  const getStepProgress = (steps: number, goal: number) => Math.min(100, Math.round((steps / goal) * 100));

  const loadGeofence = async (friendId: string) => {
    try {
      const res = await fetch(`/api/friends/geofence/${friendId}`);
      const data = await res.json();
      setGeofences(prev => ({ ...prev, [friendId]: data }));
    } catch { /* 무시 */ }
  };

  const saveGeofence = async (friend: Friend) => {
    if (!friend.lat || !friend.lng) return;
    setSavingGeofence(friend.id);
    const radiusM = geofenceRadiusInput[friend.id] || 500;
    try {
      await fetch('/api/friends/geofence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: friend.id, lat: friend.lat, lng: friend.lng, radiusM }),
      });
      setGeofences(prev => ({ ...prev, [friend.id]: { lat: friend.lat, lng: friend.lng, radiusM } }));
    } catch { /* 무시 */ }
    setSavingGeofence(null);
  };

  const removeGeofence = async (friendId: string) => {
    try {
      await fetch(`/api/friends/geofence/${friendId}`, { method: 'DELETE' });
      setGeofences(prev => ({ ...prev, [friendId]: null }));
    } catch { /* 무시 */ }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 검색 + 초대 헤더 */}
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-gray-100">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="이름 또는 상태 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:border-rose-300 focus:bg-white transition"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl px-4 py-2.5 text-sm font-semibold transition shadow-sm shrink-0"
          >
            <UserPlus2 className="w-4 h-4" />
            <span>초대</span>
          </button>
        </div>

        {showInviteForm && (
          <form onSubmit={handleInviteSubmit} className="bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-100">
            <p className="text-xs font-bold text-gray-700">📱 전화번호로 초대</p>
            <input
              type="tel" required placeholder="010-1234-5678 (필수)"
              value={invitePhone}
              onChange={(e) => setInvitePhone(formatPhoneInput(e.target.value))}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-rose-300 font-mono"
              inputMode="numeric"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text" required placeholder="이름 또는 닉네임"
                value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-300"
              />
              <select
                value={inviteEmoji} onChange={(e) => setInviteEmoji(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              >
                {AVATAR_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">마커 색상 (선택)</span>
              <div className="flex gap-1.5">
                {COLOR_OPTIONS.map(c => (
                  <button key={c} type="button" onClick={() => setInviteColor(c)}
                    className={`w-5 h-5 rounded-full transition ${inviteColor === c ? 'ring-2 ring-offset-1 ring-gray-800 scale-110' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowInviteForm(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">취소</button>
              <button type="submit"
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-semibold transition">초대하기</button>
            </div>
          </form>
        )}
      </div>

      {/* 멤버 목록 */}
      <div className="flex-1 overflow-y-auto">
        {filteredFriends.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <UserPlus2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">멤버가 없습니다. 친구를 초대해 보세요!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredFriends.map((friend) => {
              const isExpanded = expandedId === friend.id;
              const isMe = friend.id === activeProfileId;
              const isCare = isCareGroup || friend.id.startsWith('care-');

              return (
                <div key={friend.id} className="bg-white">
                  {/* 기본 카드 행 */}
                  <div
                    onClick={() => {
                      const next = isExpanded ? null : friend.id;
                      setExpandedId(next);
                      if (next && isCare) loadGeofence(friend.id);
                    }}
                    className={`flex items-center px-4 py-3 gap-3 cursor-pointer transition-colors ${isExpanded ? 'bg-rose-50' : 'hover:bg-gray-50'}`}
                  >
                    {/* 아바타 */}
                    <div className="relative shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 border-white"
                        style={{ backgroundColor: friend.color, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                      >
                        {friend.avatar}
                      </div>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${friend.isOnline ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    </div>

                    {/* 이름 + 상태 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14px] font-semibold text-gray-900 truncate">{friend.name}</span>
                        {isMe && <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-semibold">나</span>}
                        {friend.isPendingInvite && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold animate-pulse">수락 대기</span>}
                      </div>
                      {editingStatusId === friend.id ? (
                        <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
                          <input
                            type="text" value={statusDraft} onChange={e => setStatusDraft(e.target.value)}
                            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-rose-300"
                            autoFocus
                          />
                          <button onClick={() => { onUpdateStatusMsg(friend.id, statusDraft); setEditingStatusId(null); }}
                            className="w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-xs text-gray-400 truncate max-w-[140px]">
                            {friend.statusMsg || '상태메시지 없음'}
                          </p>
                          {isMe && (
                            <button onClick={(e) => { e.stopPropagation(); setEditingStatusId(friend.id); setStatusDraft(friend.statusMsg || ''); }}
                              className="text-[10px] text-rose-400 hover:text-rose-600 shrink-0">수정</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 우측 정보 */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs font-mono font-semibold ${friend.battery > 50 ? 'text-gray-500' : friend.battery > 20 ? 'text-amber-500' : 'text-red-500'}`}>
                        🔋{friend.battery}%
                      </span>
                      {isCare && friend.heartRate && (
                        <span className={`text-xs font-bold font-mono ${getHeartRateColor(friend.heartRate)}`}>
                          ♥ {friend.heartRate}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-300">
                        {new Date(friend.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* 수락 대기 배너 */}
                  {friend.isPendingInvite && (
                    <div className="mx-4 mb-3 flex items-center justify-between bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div>
                        <p className="text-xs font-semibold text-amber-800">초대 수락을 기다리는 중</p>
                        <p className="text-[11px] text-amber-600 font-mono mt-0.5">{friend.phone}</p>
                      </div>
                      {onAcceptInvite && (
                        <button onClick={() => onAcceptInvite(friend.id)}
                          className="bg-amber-400 hover:bg-amber-500 text-black font-semibold text-xs px-4 py-2 rounded-xl transition shrink-0">
                          수락
                        </button>
                      )}
                    </div>
                  )}

                  {/* 확장 패널 (클릭 시) */}
                  {isExpanded && !friend.isPendingInvite && (
                    <div className="mx-4 mb-3 space-y-2" onClick={e => e.stopPropagation()}>

                      {/* 부모님 안심 모드 카드 */}
                      {isCare && (
                        <div className="bg-rose-50 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-700">건강 현황</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(friend.heartRate || 0) > 100 || (friend.heartRate || 0) < 50 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {(friend.heartRate || 0) > 100 || (friend.heartRate || 0) < 50 ? '⚠️ 주의' : '✅ 정상'}
                            </span>
                          </div>

                          {/* 심박수 */}
                          <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3">
                            <Heart className="w-5 h-5 text-rose-500 shrink-0" />
                            <div className="flex-1">
                              <p className="text-[11px] text-gray-500">심박수</p>
                              <p className={`text-lg font-bold ${getHeartRateColor(friend.heartRate || 72)}`}>
                                {friend.heartRate || '--'} <span className="text-sm font-normal text-gray-400">bpm</span>
                              </p>
                            </div>
                            {onMeasureHeartRate && (
                              <button onClick={() => onMeasureHeartRate(friend)}
                                className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 px-3 py-1.5 rounded-xl font-semibold transition">
                                측정
                              </button>
                            )}
                          </div>

                          {/* 만보기 */}
                          <div className="bg-white rounded-xl px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Footprints className="w-5 h-5 text-emerald-500 shrink-0" />
                                <div>
                                  <p className="text-[11px] text-gray-500">오늘 걸음 수</p>
                                  <p className="text-lg font-bold text-gray-900">
                                    {(friend.stepsToday || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">보</span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs text-gray-400 font-mono">
                                목표 {((friend.dailyStepGoal || 5000) / 1000).toFixed(0)}천보
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 rounded-full transition-all"
                                style={{ width: `${getStepProgress(friend.stepsToday || 0, friend.dailyStepGoal || 5000)}%` }}
                              />
                            </div>
                          </div>

                          {/* 긴급 버튼들 */}
                          <div className="grid grid-cols-2 gap-2">
                            {onMeasureHeartRate && (
                              <button onClick={() => onMeasureHeartRate(friend)}
                                className="flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-black font-semibold py-3 rounded-2xl text-sm transition">
                                <Heart className="w-4 h-4" />
                                원격 심박 측정
                              </button>
                            )}
                            {onEmergency119 && (
                              <button onClick={() => onEmergency119(friend)}
                                className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-2xl text-sm transition">
                                <AlertTriangle className="w-4 h-4" />
                                119 긴급 연결
                              </button>
                            )}
                          </div>

                          {/* 만보기 토글 */}
                          {isMe && onTogglePedometer && (
                            <button onClick={() => onTogglePedometer(friend.id, !friend.pedometerEnabled)}
                              className={`w-full py-2.5 rounded-2xl text-sm font-semibold transition ${friend.pedometerEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                              {friend.pedometerEnabled ? '만보기 끄기' : '만보기 켜기'}
                            </button>
                          )}

                          {/* 안심 구역 (지오펜스) */}
                          {!isMe && (
                            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Shield className="w-4 h-4 text-sky-600" />
                                  <span className="text-xs font-bold text-sky-700">안심 구역 설정</span>
                                </div>
                                {geofences[friend.id] && (
                                  <span className="text-[10px] bg-sky-200 text-sky-800 px-2 py-0.5 rounded-full font-semibold">
                                    활성 {geofences[friend.id]!.radiusM}m
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-sky-600">현재 위치 기준 반경 설정. 이탈 시 즉시 알림!</p>
                              <div className="flex items-center gap-2">
                                <select
                                  value={geofenceRadiusInput[friend.id] || 500}
                                  onChange={e => setGeofenceRadiusInput(prev => ({ ...prev, [friend.id]: Number(e.target.value) }))}
                                  className="flex-1 bg-white border border-sky-200 text-xs rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400"
                                >
                                  <option value={200}>반경 200m (좁음)</option>
                                  <option value={500}>반경 500m (기본)</option>
                                  <option value={1000}>반경 1km</option>
                                  <option value={2000}>반경 2km (넓음)</option>
                                  <option value={5000}>반경 5km</option>
                                </select>
                                <button
                                  onClick={() => saveGeofence(friend)}
                                  disabled={savingGeofence === friend.id}
                                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition shrink-0 disabled:opacity-50"
                                >
                                  {savingGeofence === friend.id ? '...' : '설정'}
                                </button>
                                {geofences[friend.id] && (
                                  <button onClick={() => removeGeofence(friend.id)}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-semibold px-2 py-2 rounded-xl transition shrink-0">
                                    <ShieldOff className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 일반 친구 모드 */}
                      {!isCare && (
                        <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
                          {/* 위치 정보 */}
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>📍 속도: <strong className="text-gray-700">{friend.speed}km/h</strong></span>
                            <span>🧭 {friend.heading}</span>
                            <span>경로 {friend.route?.length || 0}개</span>
                          </div>

                          {/* 만보기 */}
                          {(friend.pedometerEnabled || isMe) && (
                            <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">👣</span>
                                <div>
                                  <p className="text-[11px] text-gray-400">오늘 걸음 수</p>
                                  <p className="text-sm font-bold text-gray-800">{(friend.stepsToday || 0).toLocaleString()}보</p>
                                </div>
                              </div>
                              {isMe && onTogglePedometer && (
                                <button onClick={() => onTogglePedometer(friend.id, !friend.pedometerEnabled)}
                                  className={`text-xs px-2.5 py-1 rounded-xl font-semibold transition ${friend.pedometerEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {friend.pedometerEnabled ? 'ON' : 'OFF'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {showDevControls && (
                        <div className="bg-gray-50 rounded-2xl p-3">
                          <p className="text-[11px] text-gray-400 mb-2 text-center">위치 시뮬레이션 (개발용)</p>
                          <div className="flex justify-center gap-2">
                            {[
                              { label: '↑ 북', lat: 0.001, lng: 0 },
                              { label: '↓ 남', lat: -0.001, lng: 0 },
                              { label: '→ 동', lat: 0, lng: 0.001 },
                            ].map(({ label, lat, lng }) => (
                              <button key={label} onClick={() => onManualMoveFriend(friend.id, lat, lng)}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition">
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 지도에서 보기 */}
                      <button
                        onClick={() => { onSelectFriend(friend.id); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-blue-500 hover:bg-blue-50 rounded-2xl transition font-medium border border-blue-100"
                      >
                        🗺️ 지도에서 위치 보기
                      </button>

                      {/* 내 탈퇴 버튼 */}
                      {isMe && onLeaveRoom && (
                        <button onClick={onLeaveRoom}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-orange-500 hover:bg-orange-50 rounded-2xl transition font-medium border border-orange-100">
                          <UserX className="w-4 h-4" />
                          이 그룹에서 탈퇴하기
                        </button>
                      )}

                      {/* 멤버 내보내기 (방장만, 자신 제외) */}
                      {!isMe && isRoomOwner && onDeleteFriend && (
                        <button onClick={() => {
                          if (window.confirm(`${friend.name} 님을 그룹에서 내보내시겠습니까?`)) {
                            onDeleteFriend(friend.id);
                          }
                        }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-red-400 hover:bg-red-50 rounded-2xl transition font-medium">
                          <UserX className="w-4 h-4" />
                          그룹에서 내보내기 (방장 전용)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
