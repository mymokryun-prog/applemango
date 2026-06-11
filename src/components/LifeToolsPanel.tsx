/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 로비 생활 도구 패널 — 부모 / 학생 맞춤 외부 서비스 모음
 * - 부모: 저평가 주식 종목검색, 사주풀이 등 (외부 새 창으로 열림)
 * - 학생: 학습 도우미 도구 모음
 * - 항목은 아래 PARENT_TOOLS / STUDENT_TOOLS 배열에 추가하면 자동으로 카드가 생성됩니다.
 */

import React from 'react';
import { ExternalLink, TrendingUp, Sparkles, GraduationCap, BookOpen, Languages, Lightbulb } from 'lucide-react';

interface LifeTool {
  id: string;
  emoji: string;
  name: string;
  description: string;
  url: string;
  badge?: string;
  caution?: string;
}

const PARENT_TOOLS: LifeTool[] = [
  {
    id: 'value-finder',
    emoji: '📈',
    name: '저평가 주식 종목검색',
    description: '국내 주식 중 저평가된 종목을 가치지표 기준으로 검색해 보는 도구입니다.',
    url: 'https://valuefinder-kr-849449515992.asia-south1.run.app/',
    badge: '투자 참고',
    caution: '투자 판단의 참고 자료일 뿐이며, 투자 손실의 책임은 본인에게 있습니다.',
  },
  {
    id: 'saju-analysis',
    emoji: '🔮',
    name: '사주풀이',
    description: '생년월일시를 입력하면 AI가 사주를 풀이해 드립니다. 재미로 즐겨보세요!',
    url: 'https://huggingface.co/spaces/mymokryun/saju-analysis',
    badge: 'AI 운세',
  },
];

const STUDENT_TOOLS: LifeTool[] = [
  {
    id: 'naver-dict',
    emoji: '📚',
    name: '네이버 사전',
    description: '영어·국어·한자 등 모든 사전을 한 곳에서. 숙제와 공부에 바로 활용하세요.',
    url: 'https://dict.naver.com',
    badge: '학습 필수',
  },
  {
    id: 'khan-academy',
    emoji: '🧮',
    name: '칸아카데미 (무료 강의)',
    description: '수학·과학을 무료로 배우는 세계적인 학습 사이트의 한국어판입니다.',
    url: 'https://ko.khanacademy.org',
    badge: '무료 강의',
  },
];

interface LifeToolsPanelProps {
  audience: 'parents' | 'students';
}

export default function LifeToolsPanel({ audience }: LifeToolsPanelProps) {
  const isParents = audience === 'parents';
  const tools = isParents ? PARENT_TOOLS : STUDENT_TOOLS;
  const accent = isParents ? 'emerald' : 'sky';

  const openTool = (tool: LifeTool) => {
    // 네이티브(Capacitor)에서는 외부 브라우저로, 웹에서는 새 탭으로 열림
    window.open(tool.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
      {/* 헤더 */}
      <div className="px-5 py-4 bg-white border-b border-gray-100 shrink-0 flex items-center justify-between">
        <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-2">
          {isParents
            ? <TrendingUp className="w-5 h-5 text-emerald-500" />
            : <GraduationCap className="w-5 h-5 text-sky-500" />}
          <span>{isParents ? '부모 생활 도구' : '학생 학습 도구'}</span>
        </h2>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
          isParents
            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
            : 'bg-sky-50 text-sky-600 border-sky-100'
        }`}>
          전체 공개
        </span>
      </div>

      <div className="flex-1 p-4 space-y-3">
        <p className="text-[11px] text-gray-400 px-1">
          {isParents
            ? '부모님께 유용한 도구 모음입니다. 카드를 누르면 해당 서비스가 새 창으로 열립니다.'
            : '학생에게 유용한 학습 도구 모음입니다. 카드를 누르면 해당 서비스가 새 창으로 열립니다.'}
        </p>

        {tools.map(tool => (
          <button
            key={tool.id}
            type="button"
            onClick={() => openTool(tool)}
            className={`w-full bg-white rounded-3xl p-4 border shadow-sm text-left transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
              isParents ? 'border-emerald-100 hover:border-emerald-300' : 'border-sky-100 hover:border-sky-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">{tool.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-black text-gray-900">{tool.name}</h3>
                  {tool.badge && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isParents ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                    }`}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-gray-500 mt-1 leading-relaxed">{tool.description}</p>
                {tool.caution && (
                  <p className="text-[10px] text-amber-600 mt-1.5 leading-tight">⚠️ {tool.caution}</p>
                )}
              </div>
              <ExternalLink className={`w-4 h-4 shrink-0 mt-0.5 ${isParents ? 'text-emerald-400' : 'text-sky-400'}`} />
            </div>
          </button>
        ))}

        {/* 추가 안내 카드 */}
        <div className="bg-white/60 border border-dashed border-gray-300 rounded-3xl p-4 text-center">
          <Lightbulb className="w-5 h-5 text-amber-400 mx-auto" />
          <p className="text-[11px] text-gray-500 mt-1.5 font-semibold">
            {isParents ? '추가하고 싶은 부모 도구가 있나요?' : '추가하고 싶은 학습 도구가 있나요?'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            새 서비스 링크는 계속 추가될 예정입니다.
          </p>
        </div>

        {isParents && (
          <p className="text-[9.5px] text-gray-400 text-center px-2 leading-relaxed">
            외부 서비스는 애플망고톡과 별개로 운영되며, 주식 정보는 투자 권유가 아닌 참고 자료입니다.
          </p>
        )}
      </div>
    </div>
  );
}
