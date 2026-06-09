/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

const FRUIT_OPTIONS = [
  { emoji: '🍎', name: '사과' },
  { emoji: '🥭', name: '망고' },
  { emoji: '🍊', name: '귤' },
  { emoji: '🍋', name: '레몬' },
  { emoji: '🍇', name: '포도' },
  { emoji: '🍓', name: '딸기' },
  { emoji: '🫐', name: '블루베리' },
  { emoji: '🍑', name: '복숭아' },
  { emoji: '🍉', name: '수박' },
  { emoji: '🍍', name: '파인애플' },
  { emoji: '🍒', name: '체리' },
  { emoji: '🥝', name: '키위' },
];

interface OnboardingScreenProps {
  onComplete: (phone: string, name: string, nickname: string, fruit: string) => void;
}

export function ApmtLogo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <defs>
        <radialGradient id="bodyGrad" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFE066" />
          <stop offset="60%" stopColor="#FFA726" />
          <stop offset="100%" stopColor="#F57C00" />
        </radialGradient>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF8E1" />
          <stop offset="100%" stopColor="#FFE0B2" />
        </radialGradient>
      </defs>
      {/* 배경 원 */}
      <circle cx="60" cy="60" r="58" fill="url(#bgGrad)" />
      {/* 과일 몸체 */}
      <ellipse cx="60" cy="68" rx="38" ry="36" fill="url(#bodyGrad)" />
      {/* 광택 */}
      <ellipse cx="48" cy="52" rx="12" ry="8" fill="white" opacity="0.35" transform="rotate(-20 48 52)" />
      {/* 잎 */}
      <path d="M 56,34 C 52,22 62,16 68,22 C 72,28 64,36 56,34 Z" fill="#4CAF50" />
      <path d="M 60,35 Q 64,28 62,24" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* 줄기 */}
      <path d="M 60,35 Q 60,42 60,46" stroke="#795548" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* 눈 */}
      <ellipse cx="48" cy="62" rx="5" ry="6" fill="#3E2723" />
      <ellipse cx="72" cy="62" rx="5" ry="6" fill="#3E2723" />
      <circle cx="50" cy="60" r="2" fill="white" />
      <circle cx="74" cy="60" r="2" fill="white" />
      {/* 볼 */}
      <ellipse cx="38" cy="72" rx="7" ry="4.5" fill="#FF8A80" opacity="0.7" />
      <ellipse cx="82" cy="72" rx="7" ry="4.5" fill="#FF8A80" opacity="0.7" />
      {/* 입 (웃음) */}
      <path d="M 50,79 Q 60,89 70,79" stroke="#3E2723" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('010-');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [selectedFruit, setSelectedFruit] = useState('🍎');
  const [phoneError, setPhoneError] = useState('');

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    if (phoneError) setPhoneError('');
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) {
      setPhoneError('올바른 전화번호를 입력해 주세요 (예: 010-1234-5678)');
      return;
    }
    try {
      const res = await fetch(`/api/profile-lookup?phone=${digits}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setName(data.realName || '');
          setNickname(data.alias || '');
          setSelectedFruit(data.avatar || '🍎');
        }
      }
    } catch (err) {
      console.error('Failed to lookup profile:', err);
    }
    setStep(2);
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onComplete(phone, name.trim(), nickname.trim(), selectedFruit);
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      {/* 상단 헤더 영역 */}
      <div className="flex flex-col items-center pt-10 pb-6 px-6 bg-gradient-to-b from-orange-50 to-white">
        <ApmtLogo size={100} />
        <h1 className="mt-4 text-[26px] font-black text-gray-900 tracking-tight">애플망고톡</h1>
        <p className="text-[13px] text-orange-500 font-semibold mt-1">Apple Mango Talk</p>
        <p className="text-[12px] text-gray-400 mt-1">가볍게 연결, 달콤하게 소통 🍎🥭</p>
      </div>

      {/* 단계 표시 */}
      <div className="flex items-center justify-center gap-2 py-3">
        <div className={`w-8 h-1.5 rounded-full transition-colors ${step >= 1 ? 'bg-orange-400' : 'bg-gray-200'}`} />
        <div className={`w-8 h-1.5 rounded-full transition-colors ${step >= 2 ? 'bg-orange-400' : 'bg-gray-200'}`} />
      </div>

      <div className="flex-1 px-6 pb-8">
        {/* 1단계: 전화번호 */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-5">
            <div>
              <h2 className="text-[17px] font-bold text-gray-900">전화번호로 시작하기</h2>
              <p className="text-sm text-gray-400 mt-1">번호로 친구를 초대하고 위치를 공유해요</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">휴대폰 번호</label>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="010-0000-0000"
                maxLength={13}
                className={`w-full border-2 rounded-2xl px-4 py-4 text-lg font-mono focus:outline-none transition ${
                  phoneError ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-orange-400'
                }`}
                autoFocus
              />
              {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
            </div>

            <button
              type="submit"
              disabled={phone.replace(/\D/g, '').length < 10}
              className="w-full py-4 bg-orange-400 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-base rounded-2xl transition shadow-sm"
            >
              다음 →
            </button>

            <p className="text-[11px] text-center text-gray-400 leading-relaxed">
              전화번호는 친구 초대 및 위치 공유에만 사용됩니다.<br />
              제3자에게 제공되지 않습니다.
            </p>
          </form>
        )}

        {/* 2단계: 이름 + 닉네임 + 과일 선택 */}
        {step === 2 && (
          <form onSubmit={handleComplete} className="space-y-5">
            <div>
              <h2 className="text-[17px] font-bold text-gray-900">프로필 만들기</h2>
              <p className="text-sm text-gray-400 mt-1">친구들에게 보여질 나의 정보예요</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">이름 (실명)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full border-2 border-gray-200 focus:border-orange-400 rounded-2xl px-4 py-3.5 text-sm focus:outline-none transition"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">닉네임 (앱에서 표시되는 이름)</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예) 달콤망고, 사과킹"
                className="w-full border-2 border-gray-200 focus:border-orange-400 rounded-2xl px-4 py-3.5 text-sm focus:outline-none transition"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">나를 표현하는 과일 선택</label>
              <div className="grid grid-cols-6 gap-2">
                {FRUIT_OPTIONS.map((f) => (
                  <button
                    key={f.emoji}
                    type="button"
                    onClick={() => setSelectedFruit(f.emoji)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-2xl border-2 transition ${
                      selectedFruit === f.emoji
                        ? 'border-orange-400 bg-orange-50 scale-110 shadow-sm'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <span className="text-2xl">{f.emoji}</span>
                    <span className="text-[8px] text-gray-500">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 미리보기 */}
            <div className="flex items-center gap-3 bg-orange-50 rounded-2xl px-4 py-3 border border-orange-100">
              <div className="w-10 h-10 rounded-full bg-orange-400 flex items-center justify-center text-xl border-2 border-white shadow-sm">
                {selectedFruit}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{nickname || name || '이름'}</p>
                <p className="text-xs text-gray-400">{name || '이름'} · {phone}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3.5 bg-gray-100 hover:bg-gray-200 rounded-2xl text-sm font-semibold text-gray-600 transition"
              >
                ← 이전
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="flex-1 py-3.5 bg-orange-400 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm rounded-2xl transition shadow-sm"
              >
                애플망고톡 시작하기 🍎🥭
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
