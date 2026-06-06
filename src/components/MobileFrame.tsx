/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';

interface MobileFrameProps {
  children: React.ReactNode;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    const isTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const isSmall = window.innerWidth < 768;
    const isUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isSmall || isUA || isTouch;
  });
  useEffect(() => {
    const check = () => {
      const isTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
      const isSmall = window.innerWidth < 768;
      const isUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isSmall || isUA || isTouch);
    };
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isMobile;
}

export default function MobileFrame({ children }: MobileFrameProps) {
  const [time, setTime] = useState<string>('12:00');
  const isMobile = useIsMobile();

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 15000);
    return () => clearInterval(timer);
  }, []);

  // 실제 스마트폰: 프레임 없이 전체화면으로 표시
  if (isMobile) {
    return (
      <div
        className="flex flex-col w-full bg-white overflow-hidden"
        style={{ height: '100dvh' }}
      >
        {children}
      </div>
    );
  }

  // PC/태블릿: iPhone 목업 프레임으로 표시
  return (
    <div className="flex justify-center items-center py-8 min-h-screen bg-gray-100 relative overflow-hidden select-none">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(251,113,133,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(251,191,36,0.10) 0%, transparent 60%)' }} />

      <div className="relative w-full max-w-[390px] h-[844px] bg-white rounded-[48px] shadow-[0_32px_80px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col z-10">
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-50 flex items-center justify-between px-3">
          <div className="w-2 h-2 bg-zinc-700 rounded-full" />
          <div className="w-3.5 h-0.5 bg-zinc-800 rounded-full" />
          <div className="w-2 h-2 bg-zinc-700 rounded-full" />
        </div>

        {/* 상태 바 */}
        <div className="h-11 bg-white px-6 pt-3 flex justify-between items-center text-xs font-semibold text-gray-900 select-none z-40 shrink-0">
          <span className="font-bold text-[13px]">{time}</span>
          <div className="flex items-center gap-1.5">
            <Signal className="w-3.5 h-3.5 text-gray-700" />
            <Wifi className="w-3.5 h-3.5 text-gray-700" />
            <div className="flex items-center gap-0.5">
              <span className="text-[11px] font-semibold">84%</span>
              <Battery className="w-4 h-4 text-gray-700" />
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white flex flex-col overflow-hidden relative">
          {children}
        </div>

        {/* 홈 인디케이터 */}
        <div className="h-7 bg-white flex items-center justify-center shrink-0">
          <div className="w-28 h-1 bg-gray-900 rounded-full opacity-20" />
        </div>
      </div>
    </div>
  );
}
