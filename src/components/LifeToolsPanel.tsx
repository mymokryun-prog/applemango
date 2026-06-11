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
  {
    id: 'gov24',
    emoji: '🏛️',
    name: '정부24',
    description: '주민등록등본 등 각종 증명서 발급과 민원 신청을 집에서 한 번에 처리하세요.',
    url: 'https://www.gov.kr',
    badge: '민원·증명서',
  },
  {
    id: 'hometax',
    emoji: '🧾',
    name: '국세청 홈택스',
    description: '연말정산, 종합소득세 신고, 현금영수증 조회 등 세금 업무를 온라인으로.',
    url: 'https://www.hometax.go.kr',
    badge: '세금',
  },
  {
    id: 'nhis',
    emoji: '🏥',
    name: '국민건강보험',
    description: '건강검진 대상·결과 조회, 보험료 확인, 검진기관 찾기까지 한 곳에서.',
    url: 'https://www.nhis.or.kr',
    badge: '건강검진',
  },
  {
    id: 'bokjiro',
    emoji: '🤲',
    name: '복지로',
    description: '나와 부모님이 받을 수 있는 정부 복지혜택(기초연금·돌봄 등)을 맞춤 조회합니다.',
    url: 'https://www.bokjiro.go.kr',
    badge: '복지혜택',
  },
  {
    id: 'visitkorea',
    emoji: '🚌',
    name: '대한민국 구석구석',
    description: '한국관광공사가 추천하는 전국 여행지·걷기길·축제 정보. 가족 나들이 계획에 좋아요.',
    url: 'https://korean.visitkorea.or.kr',
    badge: '여행·나들이',
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
  {
    id: 'ebsi',
    emoji: '🎓',
    name: 'EBSi 고교강의',
    description: '수능·내신 대비 EBS 무료 인터넷 강의. 교재 연계 강의를 무료로 들을 수 있어요.',
    url: 'https://www.ebsi.co.kr',
    badge: '수능·내신',
  },
  {
    id: 'e-hakseupteo',
    emoji: '🏫',
    name: 'e학습터',
    description: '초등·중등 교과 무료 학습 영상과 평가 문항. 예습·복습에 활용하세요.',
    url: 'https://cls.edunet.net',
    badge: '초·중등',
  },
  {
    id: 'papago',
    emoji: '🌏',
    name: '파파고 번역',
    description: '영어 숙제와 외국어 공부의 친구. 문장 번역과 발음 듣기를 지원합니다.',
    url: 'https://papago.naver.com',
    badge: '번역',
  },
  {
    id: 'career-net',
    emoji: '🧭',
    name: '커리어넷 (진로탐색)',
    description: '교육부 진로정보망. 직업·학과 정보와 무료 진로심리검사를 해볼 수 있어요.',
    url: 'https://www.career.go.kr',
    badge: '진로',
  },
  {
    id: 'wikipedia',
    emoji: '🌐',
    name: '위키백과',
    description: '조사 숙제와 보고서 작성에 유용한 무료 백과사전입니다.',
    url: 'https://ko.wikipedia.org',
    badge: '백과사전',
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
