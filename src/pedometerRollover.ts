/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 만보기 자정 롤오버 단일화 유틸
 *
 * 문제: 날짜가 바뀔 때 어제 걸음수가 히스토리에 저장되지 않고 사라지는 경우가 있었다.
 * 해결: 모든 곳(훅의 걸음 감지, 1분 주기 자정 감시, 만보기 패널 로드)이
 *       이 유틸 하나로 롤오버를 처리한다.
 *  - 어제 기록은 히스토리에 max-merge(중복 날짜는 큰 값 유지)로 보존
 *  - 같은 날짜 중복 항목은 자동 정리
 *  - 히스토리 키는 localStorage의 전화번호 기준으로 통일 (컴포넌트 prop 불일치 방지)
 */

const STEPS_KEY = 'aemang_steps_today';

export interface StepRecordEntry { date: string; steps: number; }

/** 로컬 기준 오늘 날짜 (YYYY-MM-DD) */
export function pedometerTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 히스토리 저장 키 — 전화번호(localStorage) 기준으로 모든 곳에서 동일하게 사용 */
export function pedometerHistoryKey(): string {
  let digits = '';
  try {
    digits = (localStorage.getItem('aemang_phone') || '').replace(/\D/g, '');
  } catch { /* 무시 */ }
  return `aemang_pedometer_history_${digits || 'guest'}`;
}

/** 히스토리 로드 (+ 같은 날짜 중복은 큰 값으로 병합, 날짜 내림차순, 365개 제한) */
export function loadStepHistory(): StepRecordEntry[] {
  let list: StepRecordEntry[] = [];
  try {
    const raw = localStorage.getItem(pedometerHistoryKey());
    if (raw) list = JSON.parse(raw);
  } catch { /* 무시 */ }
  if (!Array.isArray(list)) list = [];

  // 날짜별 max-merge로 중복 제거
  const byDate: Record<string, number> = {};
  list.forEach(r => {
    if (!r || typeof r.date !== 'string') return;
    const steps = Number(r.steps) || 0;
    byDate[r.date] = Math.max(byDate[r.date] || 0, steps);
  });
  const merged = Object.entries(byDate)
    .map(([date, steps]) => ({ date, steps }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 365);
  return merged;
}

function saveStepHistory(list: StepRecordEntry[]) {
  try {
    localStorage.setItem(pedometerHistoryKey(), JSON.stringify(list));
  } catch { /* 무시 */ }
}

/** 특정 날짜 기록을 히스토리에 max-merge로 반영 */
export function archiveStepRecord(date: string, steps: number) {
  if (!date || steps < 0) return;
  const list = loadStepHistory();
  const idx = list.findIndex(r => r.date === date);
  if (idx >= 0) {
    list[idx] = { date, steps: Math.max(list[idx].steps, steps) };
  } else {
    list.push({ date, steps });
    list.sort((a, b) => b.date.localeCompare(a.date));
    if (list.length > 365) list.length = 365;
  }
  saveStepHistory(list);
}

/**
 * 자정 롤오버 처리(필요 시).
 * - aemang_steps_today의 날짜가 오늘이 아니면: 그 기록을 해당 날짜의 히스토리로 보존하고 오늘 0으로 초기화
 * - 반환: 오늘 현재 걸음수와 롤오버 발생 여부
 */
export function rolloverIfNeeded(): { steps: number; rolled: boolean } {
  const today = pedometerTodayStr();
  try {
    const raw = localStorage.getItem(STEPS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d.date === 'string') {
        if (d.date === today) {
          return { steps: Number(d.steps) || 0, rolled: false };
        }
        // 어제(또는 그 이전) 기록 → 히스토리에 보존 후 오늘 0으로 시작
        archiveStepRecord(d.date, Number(d.steps) || 0);
        localStorage.setItem(STEPS_KEY, JSON.stringify({ date: today, steps: 0 }));
        return { steps: 0, rolled: true };
      }
    }
    localStorage.setItem(STEPS_KEY, JSON.stringify({ date: today, steps: 0 }));
  } catch { /* 무시 */ }
  return { steps: 0, rolled: false };
}

/** 오늘 걸음수 저장 (항상 오늘 날짜로) */
export function saveTodaySteps(steps: number) {
  try {
    localStorage.setItem(STEPS_KEY, JSON.stringify({ date: pedometerTodayStr(), steps }));
  } catch { /* 무시 */ }
}
