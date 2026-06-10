/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Footprints, Calendar, TrendingUp, Users, Trophy, HeartHandshake, ShieldAlert, Route, Send } from 'lucide-react';
import { Friend } from '../types';

// BIZ-CORE-8: 가족 걸음 챌린지 현황 타입
interface ChallengeStatus {
  challenge: { goalSteps: number } | null;
  totalSteps: number;
  members: Array<{ id: string; name: string; avatar: string; steps: number }>;
  progress: number;
  achievedToday: boolean;
}

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

  // ===== BIZ-CORE-8 상태 =====
  // ⑤ 가족 걸음 챌린지
  const [challengeStatus, setChallengeStatus] = useState<ChallengeStatus | null>(null);
  const [challengeGoalInput, setChallengeGoalInput] = useState<number>(30000);
  // ⑧ 효도 리포트
  const [reportFriendId, setReportFriendId] = useState<string>('');
  const [careReport, setCareReport] = useState<string>('');
  const [reportLoading, setReportLoading] = useState(false);
  // ① 무활동 감지
  const [careWatchStates, setCareWatchStates] = useState<Record<string, boolean>>({});
  // ③ 오늘 이동 타임라인 요약
  const [timelineSummary, setTimelineSummary] = useState<{ distanceM: number; pointCount: number } | null>(null);

  // 챌린지 현황 로드
  const loadChallenge = async () => {
    try {
      const res = await fetch(`/api/rooms/challenge?roomId=${encodeURIComponent(activeRoomId)}`);
      if (res.ok) setChallengeStatus(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadChallenge();
    // 오늘 내 이동 타임라인 요약
    (async () => {
      try {
        const res = await fetch(`/api/friends/timeline?roomId=${encodeURIComponent(activeRoomId)}&friendId=${encodeURIComponent(activeProfileId)}`);
        if (res.ok) {
          const data = await res.json();
          setTimelineSummary({ distanceM: data.summary?.distanceM || 0, pointCount: data.summary?.pointCount || 0 });
        }
      } catch (e) { console.error(e); }
    })();
    // 친구별 무활동 감지 상태 초기화(서버 friend.careWatch는 friends prop에 실려 옴)
    const states: Record<string, boolean> = {};
    friends.forEach(f => { states[f.id] = !!(f as any).careWatch?.enabled; });
    setCareWatchStates(states);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, activeProfileId]);

  // ⑤ 챌린지 목표 설정
  const handleSetChallenge = async () => {
    try {
      await fetch('/api/rooms/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeRoomId, goalSteps: challengeGoalInput }),
      });
      await loadChallenge();
    } catch (e) { console.error(e); }
  };

  // ⑧ 효도 리포트 생성
  const handleGenerateReport = async () => {
    const targetId = reportFriendId || friends.find(f => f.id !== activeProfileId)?.id || activeProfileId;
    if (!targetId) return;
    setReportLoading(true);
    setCareReport('');
    try {
      const res = await fetch(`/api/care/report?roomId=${encodeURIComponent(activeRoomId)}&friendId=${encodeURIComponent(targetId)}`);
      const data = await res.json();
      setCareReport(data.report || '리포트를 생성하지 못했습니다.');
    } catch (e) {
      console.error(e);
      setCareReport('리포트 생성 중 오류가 발생했습니다.');
    } finally {
      setReportLoading(false);
    }
  };

  // ⑧ 리포트 채팅방 공유
  const handleShareReport = async () => {
    if (!careReport) return;
    try {
      await fetch('/api/care/report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeRoomId, report: careReport }),
      });
      alert('효도 리포트를 채팅방에 공유했습니다. 🍎');
    } catch (e) { console.error(e); }
  };

  // ① 무활동 감지 토글
  const handleToggleCareWatch = async (friendId: string) => {
    const next = !careWatchStates[friendId];
    setCareWatchStates(prev => ({ ...prev, [friendId]: next }));
    try {
      await fetch('/api/care/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeRoomId, friendId, enabled: next, thresholdHours: 6 }),
      });
    } catch (e) {
      console.error(e);
      setCareWatchStates(prev => ({ ...prev, [friendId]: !next })); // 실패 시 롤백
    }
  };

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

        {/* BIZ-CORE-8 ⑤: 가족 걸음 챌린지 */}
        <div className="bg-white rounded-3xl p-5 border border-amber-100 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>가족 걸음 챌린지 (오늘 합산)</span>
          </h3>
          {challengeStatus?.challenge ? (
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-lg font-black text-gray-900 font-mono">
                  {challengeStatus.totalSteps.toLocaleString()}
                  <span className="text-[11px] text-gray-400 font-bold"> / {challengeStatus.challenge.goalSteps.toLocaleString()} 걸음</span>
                </span>
                <span className={`text-xs font-black ${challengeStatus.achievedToday ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {challengeStatus.achievedToday ? '🏆 오늘 달성!' : `${challengeStatus.progress}%`}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${challengeStatus.achievedToday ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-amber-400 to-rose-400'}`}
                  style={{ width: `${challengeStatus.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400">멤버 모두의 오늘 걸음을 합산합니다. 함께 걸을수록 빨리 달성! 🥾</p>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">아직 챌린지가 없습니다. 목표를 설정해 가족과 함께 걸어보세요!</p>
          )}
          <div className="flex gap-2 items-center pt-1">
            <input
              type="number"
              min={1000}
              step={5000}
              value={challengeGoalInput}
              onChange={(e) => setChallengeGoalInput(parseInt(e.target.value) || 0)}
              className="flex-1 text-xs font-mono font-bold border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400"
              placeholder="합산 목표 걸음 수"
            />
            <button
              type="button"
              onClick={handleSetChallenge}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-black px-4 py-2 rounded-xl transition cursor-pointer"
            >
              목표 설정
            </button>
          </div>
        </div>

        {/* BIZ-CORE-8 ⑧: 디지털 효도 리포트 */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-100 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <HeartHandshake className="w-4 h-4 text-emerald-500" />
            <span>일주일 효도 리포트</span>
          </h3>
          <p className="text-[10px] text-gray-400">최근 7일 활동을 따뜻한 안부 문장으로 요약해 드립니다.</p>
          <div className="flex gap-2 items-center">
            <select
              value={reportFriendId}
              onChange={(e) => setReportFriendId(e.target.value)}
              className="flex-1 text-xs font-bold border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:border-emerald-400 bg-white"
            >
              <option value="">대상 선택 (기본: 첫 번째 가족)</option>
              {friends.map(f => (
                <option key={f.id} value={f.id}>
                  {f.avatar} {(f.name || '').replace(' (대기)', '').replace(' (합류)', '')}{f.id === activeProfileId ? ' (나)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-xs font-black px-4 py-2 rounded-xl transition cursor-pointer"
            >
              {reportLoading ? '생성 중...' : '리포트 생성'}
            </button>
          </div>
          {careReport && (
            <div className="space-y-2">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                {careReport}
              </div>
              <button
                type="button"
                onClick={handleShareReport}
                className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-emerald-50 text-emerald-600 text-xs font-black px-4 py-2 rounded-xl border border-emerald-200 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>채팅방에 공유하기</span>
              </button>
            </div>
          )}
        </div>

        {/* BIZ-CORE-8 ①: 무활동 안심 감지 */}
        <div className="bg-white rounded-3xl p-5 border border-rose-100 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span>무활동 안심 감지</span>
          </h3>
          <p className="text-[10px] text-gray-400">
            6시간 이상 위치·걸음 활동이 없으면 방 전체에 안부 확인 알림을 보냅니다. (가족·효도방 전용)
          </p>
          {friends.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-1">같은 방 멤버가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {friends.map(f => (
                <div key={f.id} className="flex items-center gap-2.5">
                  <span className="text-base shrink-0">{f.avatar || '🙂'}</span>
                  <span className="text-xs font-bold text-gray-800 flex-1 truncate">
                    {(f.name || '').replace(' (대기)', '').replace(' (합류)', '')}{f.id === activeProfileId && <span className="text-rose-500"> (나)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleCareWatch(f.id)}
                    className={`relative w-10 h-6 rounded-full transition cursor-pointer ${careWatchStates[f.id] ? 'bg-rose-500' : 'bg-gray-200'}`}
                    aria-label="무활동 감지 토글"
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${careWatchStates[f.id] ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BIZ-CORE-8 ③: 오늘 이동 요약 */}
        {timelineSummary && (
          <div className="bg-white rounded-3xl p-5 border border-sky-100 shadow-sm space-y-2">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Route className="w-4 h-4 text-sky-500" />
              <span>오늘 나의 이동 기록</span>
            </h3>
            <div className="flex items-center justify-around text-center">
              <div>
                <p className="text-xl font-black text-gray-900 font-mono">
                  {timelineSummary.distanceM >= 1000
                    ? `${(timelineSummary.distanceM / 1000).toFixed(1)}km`
                    : `${timelineSummary.distanceM}m`}
                </p>
                <p className="text-[10px] text-gray-400 font-bold">이동 거리</p>
              </div>
              <div>
                <p className="text-xl font-black text-gray-900 font-mono">{timelineSummary.pointCount}</p>
                <p className="text-[10px] text-gray-400 font-bold">기록 지점</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 text-center">위치 공유 중에만 자동 기록됩니다. 지도 탭에서 동선을 확인하세요.</p>
          </div>
        )}

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
