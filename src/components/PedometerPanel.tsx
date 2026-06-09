/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Footprints, Calendar, TrendingUp, Users } from 'lucide-react';
import { Friend } from '../types';

interface PedometerPanelProps {
  phone: string;
  activeProfileId: string;
  activeRoomId: string;
  liveSteps?: number; // 실시간 기기 만보기 걸음수 (상단 상태바와 동일 소스)
  friends?: Friend[]; // 같은 방 친구들 — 걸음수 공유 표시용
  onSyncSteps: (steps: number) => void;
}

interface StepRecord {
  date: string; // YYYY-MM-DD
  steps: number;
}

export default function PedometerPanel({
  phone,
  activeProfileId,
  activeRoomId,
  liveSteps = 0,
  friends = [],
  onSyncSteps,
}: PedometerPanelProps) {
  // 전화번호 포맷(하이픈 등)이 달라도 같은 키를 쓰도록 숫자만 사용 → 데이터 유실 방지
  const phoneDigits = (phone || '').replace(/\D/g, '') || 'guest';
  const historyKey = `aemang_pedometer_history_${phoneDigits}`;
  const goalKey = `aemang_pedometer_goal_${phoneDigits}`;

  const [stepsToday, setStepsToday] = useState<number>(0);
  const [stepGoal, setStepGoal] = useState<number>(10000);
  const [history, setHistory] = useState<StepRecord[]>([]);
  const graphScrollRef = useRef<HTMLDivElement>(null);

  // 오늘 날짜 가져오기 (YYYY-MM-DD)
  const getTodayString = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // 로컬스토리지에서 데이터 로드
  useEffect(() => {
    const todayStr = getTodayString();
    
    // 목표 걸음 수 로드
    const storedGoal = localStorage.getItem(goalKey);
    if (storedGoal) {
      setStepGoal(parseInt(storedGoal) || 10000);
    }

    // 기록 로드
    const storedHistory = localStorage.getItem(historyKey);
    let historyList: StepRecord[] = [];
    if (storedHistory) {
      try {
        historyList = JSON.parse(storedHistory);
      } catch (e) {
        console.error(e);
      }
    }

    // 오늘 걸음수는 실측 영속 키(aemang_steps_today)를 우선 사용 → 원/그래프 일치
    let todaySteps = 0;
    let archivedSomething = false;
    try {
      const raw = localStorage.getItem('aemang_steps_today');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.date) {
          if (d.date === todayStr) {
            todaySteps = Number(d.steps) || 0;
          } else {
            // 과거 날짜 데이터임 → 히스토리로 아카이빙
            const found = historyList.find(r => r.date === d.date);
            if (!found) {
              historyList.push({ date: d.date, steps: Number(d.steps) || 0 });
              archivedSomething = true;
            }
            // 오늘 날짜로 0걸음 초기화
            localStorage.setItem('aemang_steps_today', JSON.stringify({ date: todayStr, steps: 0 }));
          }
        }
      }
    } catch {}

    const todayRecord = historyList.find(r => r.date === todayStr);
    if (todayRecord && todayRecord.steps > todaySteps) todaySteps = todayRecord.steps;
    setStepsToday(todaySteps);

    // 날짜 역순 정렬 후 최대 365개 아카이빙 제한
    historyList.sort((a, b) => b.date.localeCompare(a.date));
    if (historyList.length > 365) {
      historyList = historyList.slice(0, 365);
      archivedSomething = true;
    }
    
    if (archivedSomething) {
      localStorage.setItem(historyKey, JSON.stringify(historyList));
    }
    setHistory(historyList);
  }, [phone]);

  // 걸음 수 업데이트
  const updateSteps = (newSteps: number) => {
    const todayStr = getTodayString();
    setStepsToday(newSteps);

    // 역사 업데이트
    const updatedHistory = [...history];
    const idx = updatedHistory.findIndex(r => r.date === todayStr);
    if (idx >= 0) {
      updatedHistory[idx].steps = newSteps;
    } else {
      updatedHistory.push({ date: todayStr, steps: newSteps });
    }

    // 날짜 역순 정렬 후 365일 크기 제한
    updatedHistory.sort((a, b) => b.date.localeCompare(a.date));
    if (updatedHistory.length > 365) {
      updatedHistory.length = 365;
    }
    setHistory(updatedHistory);
    localStorage.setItem(historyKey, JSON.stringify(updatedHistory));

    // 부모 컴포넌트로 전달 (서버 싱크)
    onSyncSteps(newSteps);
  };

  // 실시간 기기 걸음수가 오늘 기록보다 많으면 오늘 기록에 반영(원/그래프에 표시)
  useEffect(() => {
    if (liveSteps > stepsToday) {
      updateSteps(liveSteps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSteps]);

  // 데이터 변경 시 그래프 맨 우측(오늘)으로 자동 스크롤
  useEffect(() => {
    if (graphScrollRef.current) {
      graphScrollRef.current.scrollLeft = graphScrollRef.current.scrollWidth;
    }
  }, [history, stepsToday]);

  // 목표 변경
  const handleGoalChange = (newGoal: number) => {
    setStepGoal(newGoal);
    localStorage.setItem(goalKey, String(newGoal));
  };

  // 그래프 렌더링을 위한 전체 누적 히스토리 반환 (시간순 정렬: 오래된 것부터 최신 순)
  const getGraphData = () => {
    const todayStr = getTodayString();
    
    // 오래된 날짜 순 정렬
    const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));
    
    // 오늘 날짜 데이터 보완
    const todayExists = sortedHistory.some(h => h.date === todayStr);
    if (!todayExists) {
      sortedHistory.push({ date: todayStr, steps: stepsToday });
    } else {
      const idx = sortedHistory.findIndex(h => h.date === todayStr);
      if (idx >= 0) sortedHistory[idx].steps = stepsToday;
    }
    
    return sortedHistory.map(item => {
      const isToday = item.date === todayStr;
      
      let label = '';
      if (isToday) {
        label = '오늘';
      } else {
        const parts = item.date.split('-');
        if (parts.length === 3) {
          label = `${parts[1]}.${parts[2]}`; // MM.DD 형식
        } else {
          label = item.date;
        }
      }
      
      const percent = Math.min(100, Math.floor((item.steps / stepGoal) * 100));
      return {
        label,
        steps: item.steps,
        percent,
        isToday
      };
    });
  };

  const graphData = getGraphData();
  const progressPercent = Math.min(100, Math.floor((stepsToday / stepGoal) * 100));

  // 원형 게이지 둘레 계산
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          <Footprints className="w-5 h-5 text-rose-500" />
          <span>오늘의 만보기</span>
        </h2>
        <span className="text-[11px] bg-rose-50 text-rose-600 font-bold px-2.5 py-1 rounded-full border border-rose-100">
          실시간 기록 중
        </span>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* 오늘 걸음 현황 카드 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col items-center">
          {/* 원형 프로그레스 */}
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                className="text-gray-100"
                strokeWidth={stroke}
                stroke="currentColor"
                fill="transparent"
                r={normalizedRadius}
                cx={radius + stroke}
                cy={radius + stroke}
              />
              <circle
                className={`${progressPercent >= 100 ? 'text-emerald-500' : 'text-rose-500'} transition-all duration-500 ease-out`}
                strokeWidth={stroke}
                strokeDasharray={circumference + ' ' + circumference}
                style={{ strokeDashoffset }}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r={normalizedRadius}
                cx={radius + stroke}
                cy={radius + stroke}
              />
            </svg>
            <div className="absolute flex flex-col items-center text-center">
              <span className="text-3xl font-black text-gray-900 font-mono leading-none">
                {stepsToday.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 font-bold mt-1 font-mono">
                / {stepGoal.toLocaleString()} 걸음
              </span>
              <span className="text-xs bg-rose-50 text-rose-600 font-black px-2.5 py-0.5 rounded-lg mt-2 font-mono">
                {progressPercent}% 달성
              </span>
              <span className="text-[10px] text-gray-400 font-medium mt-1">
                {stepsToday >= stepGoal
                  ? '🎉 목표 달성!'
                  : `${(stepGoal - stepsToday).toLocaleString()}걸음 남음`}
              </span>
            </div>
          </div>

          {/* 실제 걸음수만 기록 — 수동 조작/초기화 버튼 없음 */}

          {/* 목표 설정 슬라이더 */}
          <div className="w-full mt-5 pt-4 border-t border-gray-50 space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
              <span>목표 설정</span>
              <span className="font-mono text-rose-600 text-sm font-bold">{stepGoal.toLocaleString()} 걸음</span>
            </div>
            <input
              type="range"
              min="3000"
              max="20000"
              step="1000"
              value={stepGoal}
              onChange={(e) => handleGoalChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
          </div>
        </div>

        {/* 전체 누적 걸음수 그래프 카드 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              <span>일별 걸음수 히스토리 그래프</span>
            </h3>
            <span className="text-[9px] bg-slate-50 text-slate-400 font-bold px-2 py-0.5 rounded-md">
              👈 손터치(밀기)로 과거 기록 탐색
            </span>
          </div>

          {/* 그래프 캔버스 (Pure CSS Bar Chart - Horizontally Scrollable) */}
          <div 
            ref={graphScrollRef}
            className="flex gap-4 items-end h-36 overflow-x-auto py-2 px-1 scrollbar-none select-none scroll-smooth"
          >
            {graphData.map((day, idx) => (
              <div key={idx} className="flex flex-col items-center shrink-0 w-12 gap-1.5">
                {/* 걸음 수 수치 */}
                <span className="text-[9px] font-black text-slate-700 font-mono scale-95">
                  {day.steps.toLocaleString()}
                </span>
                {/* 막대 (Thicker w-8) */}
                <div className="w-8 bg-slate-50 rounded-t-lg h-24 flex items-end shadow-inner border border-slate-100/50">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${
                      day.percent >= 100 
                        ? 'bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                        : 'bg-gradient-to-t from-rose-500 to-rose-400'
                    }`}
                    style={{ height: `${Math.max(6, day.percent)}%` }}
                  />
                </div>
                {/* 날짜 라벨 */}
                <span className={`text-[9.5px] mt-0.5 font-bold ${day.isToday ? 'text-rose-600 font-black' : 'text-slate-400'}`}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 친구 걸음수 공유 (같은 방 멤버) */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-rose-500" />
            <span>친구 걸음수 (오늘)</span>
          </h3>
          {(() => {
            const todayStr = getTodayString();
            const ranked = [...friends]
              .map(f => {
                // 오늘 기록한 걸음만 인정(어제 잔상 제거). 내 값은 실시간 기록 우선.
                const fAny = f as any;
                const friendStepsToday = fAny.stepsTodayDate === todayStr ? (fAny.stepsToday || 0) : 0;
                return {
                  id: f.id,
                  name: (f.name || '').replace(' (대기)', '').replace(' (합류)', ''),
                  avatar: f.avatar,
                  steps: f.id === activeProfileId ? Math.max(stepsToday, friendStepsToday) : friendStepsToday,
                  isMe: f.id === activeProfileId,
                };
              })
              .sort((a, b) => b.steps - a.steps);
            if (ranked.length === 0) {
              return <p className="text-[11px] text-gray-400 text-center py-2">같은 방 친구가 없습니다.</p>;
            }
            return (
              <div className="space-y-2">
                {ranked.map((f, idx) => (
                  <div key={f.id} className={`flex items-center gap-2.5 ${f.isMe ? 'bg-rose-50 -mx-2 px-2 py-1.5 rounded-xl' : ''}`}>
                    <span className="text-[11px] font-black text-gray-400 w-4 text-center shrink-0">{idx + 1}</span>
                    <span className="text-base shrink-0">{f.avatar || '🙂'}</span>
                    <span className="text-xs font-bold text-gray-800 flex-1 truncate">
                      {f.name}{f.isMe && <span className="text-rose-500"> (나)</span>}
                    </span>
                    <span className="text-xs font-extrabold text-gray-900 font-mono">{f.steps.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400">걸음</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* 히스토리 리스트 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-rose-500" />
            <span>상세 일별 기록</span>
          </h3>

          <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto pr-1">
            {history.map((record) => {
              const isToday = record.date === getTodayString();
              const achieveRate = Math.min(100, Math.floor((record.steps / stepGoal) * 100));
              return (
                <div key={record.date} className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-800">
                      {record.date} {isToday && <span className="text-[10px] text-rose-500 font-black ml-1">[오늘]</span>}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      목표 대비 {achieveRate}% 달성
                    </span>
                  </div>
                  <span className="text-sm font-extrabold text-gray-900 font-mono">
                    {record.steps.toLocaleString()} 걸음
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
