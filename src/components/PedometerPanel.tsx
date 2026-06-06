/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Footprints, Calendar, TrendingUp, Plus, Trash2 } from 'lucide-react';

interface PedometerPanelProps {
  phone: string;
  activeProfileId: string;
  activeRoomId: string;
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
  onSyncSteps,
}: PedometerPanelProps) {
  const historyKey = `aemang_pedometer_history_${phone || 'guest'}`;
  const goalKey = `aemang_pedometer_goal_${phone || 'guest'}`;

  const [stepsToday, setStepsToday] = useState<number>(0);
  const [stepGoal, setStepGoal] = useState<number>(10000);
  const [history, setHistory] = useState<StepRecord[]>([]);

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

    // 오늘 날짜 기록이 있는지 확인
    const todayRecord = historyList.find(r => r.date === todayStr);
    if (todayRecord) {
      setStepsToday(todayRecord.steps);
    } else {
      // 오늘 기록이 없으면 생성
      setStepsToday(0);
      // 더미데이터 채워주기 (사용자가 처음 볼 때 그래프가 보이도록)
      if (historyList.length === 0) {
        const tempHistory: StepRecord[] = [];
        for (let i = 6; i > 0; i--) {
          const prevDate = new Date();
          prevDate.setDate(prevDate.getDate() - i);
          const yyyy = prevDate.getFullYear();
          const mm = String(prevDate.getMonth() + 1).padStart(2, '0');
          const dd = String(prevDate.getDate()).padStart(2, '0');
          // 3000~12000 걸음 사이 무작위 생성
          const randomSteps = Math.floor(Math.random() * 9000) + 3000;
          tempHistory.push({ date: `${yyyy}-${mm}-${dd}`, steps: randomSteps });
        }
        historyList = tempHistory;
        localStorage.setItem(historyKey, JSON.stringify(historyList));
      }
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

    // 날짜 역순 정렬
    updatedHistory.sort((a, b) => b.date.localeCompare(a.date));
    setHistory(updatedHistory);
    localStorage.setItem(historyKey, JSON.stringify(updatedHistory));

    // 부모 컴포넌트로 전달 (서버 싱크)
    onSyncSteps(newSteps);
  };

  const addSteps = (amount: number) => {
    const nextSteps = stepsToday + amount;
    updateSteps(nextSteps);
  };

  const handleReset = () => {
    if (window.confirm('오늘의 걸음 기록을 초기화하시겠습니까?')) {
      updateSteps(0);
    }
  };

  // 목표 변경
  const handleGoalChange = (newGoal: number) => {
    setStepGoal(newGoal);
    localStorage.setItem(goalKey, String(newGoal));
  };

  // 그래프 렌더링을 위한 최근 7일 필터링 (오늘 포함)
  const getGraphData = () => {
    const todayStr = getTodayString();
    const last7Days: { label: string; steps: number; percent: number }[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // 요일 구하기
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const dayLabel = i === 0 ? '오늘' : dayNames[d.getDay()];

      let steps = 0;
      if (i === 0) {
        steps = stepsToday;
      } else {
        const found = history.find(h => h.date === dateStr);
        if (found) steps = found.steps;
      }

      const percent = Math.min(100, Math.floor((steps / stepGoal) * 100));
      last7Days.push({ label: dayLabel, steps, percent });
    }
    return last7Days;
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

          {/* 걸음 수 조작 버튼 (테스트용) */}
          <div className="grid grid-cols-3 gap-2 w-full mt-5">
            <button
              onClick={() => addSteps(500)}
              className="flex items-center justify-center gap-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-2xl text-xs transition border border-rose-100"
            >
              <Plus className="w-3.5 h-3.5" /> 500
            </button>
            <button
              onClick={() => addSteps(1000)}
              className="flex items-center justify-center gap-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-2xl text-xs transition border border-rose-100"
            >
              <Plus className="w-3.5 h-3.5" /> 1000
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-1 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-500 font-bold rounded-2xl text-xs transition border border-gray-100"
            >
              <Trash2 className="w-3.5 h-3.5" /> 초기화
            </button>
          </div>

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

        {/* 7일 주간 그래프 카드 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              <span>최근 7일 걸음수 그래프</span>
            </h3>
            <span className="text-[10px] text-gray-400 font-medium">단위: 걸음</span>
          </div>

          {/* 그래프 캔버스 (Pure CSS Bar Chart) */}
          <div className="flex justify-between items-end h-32 pt-2 px-1">
            {graphData.map((day, idx) => (
              <div key={idx} className="flex flex-col items-center flex-1 gap-1">
                {/* 툴팁 */}
                <span className="text-[8px] font-bold text-gray-400 font-mono scale-90 mb-0.5">
                  {day.steps >= 1000 ? `${(day.steps / 1000).toFixed(1)}k` : day.steps}
                </span>
                {/* 막대 */}
                <div className="w-4 bg-gray-100 rounded-full h-20 flex items-end">
                  <div
                    className={`w-full rounded-full transition-all duration-500 ${
                      day.percent >= 100 ? 'bg-gradient-to-t from-rose-600 to-rose-400' : 'bg-gradient-to-t from-rose-400 to-rose-300'
                    }`}
                    style={{ height: `${Math.max(8, day.percent)}%` }}
                  />
                </div>
                {/* 라벨 */}
                <span className={`text-[10px] mt-1 font-semibold ${idx === 6 ? 'text-rose-600 font-bold' : 'text-gray-500'}`}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
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
