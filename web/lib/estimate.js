// 실행 1회 예상 비용 계산 — 견적 화면(/api/estimate)과 상한 검사(/api/publish)가 공유한다.
// 두 곳이 다른 값을 쓰면 "견적은 통과인데 실행은 거부" 같은 모순이 생기므로 한 곳에 둔다.
import { PRICE, cost, r6 } from './pricing.js';

// 실측 기반 기본 소비량 (2026-08 기준, Opus 4.8 + ElevenLabs + Gemini 이미지).
export const MODEL = {
  // 웹서치 리서치는 길이와 무관하게 거의 고정 — 검색 결과를 읽느라 입력 토큰이 크다.
  researchIn: Number(process.env.EST_RESEARCH_IN || 63000),
  researchOut: Number(process.env.EST_RESEARCH_OUT || 2500),
  // 대본 생성: 입력은 대체로 고정, 출력(사고 토큰 포함)은 분량에 비례.
  scriptIn: Number(process.env.EST_SCRIPT_IN || 7500),
  scriptOutPerMin: Number(process.env.EST_SCRIPT_OUT_PER_MIN || 2500),
  // 나레이션 글자수 — src/lib/anthropic.ts 의 targetChars 와 같은 기준(실측 분당 330자).
  charsPerMin: Number(process.env.EST_CHARS_PER_MIN || 330),
  // 이미지 장수 — 파이프라인의 MAX_IMAGES_PER_RUN 상한과 같은 값으로 맞춘다.
  // (분량이 짧으면 실제로는 더 적게 나오지만, 견적은 최악을 보여주는 쪽이 안전하다.)
  images: Number(process.env.MAX_IMAGES_PER_RUN || 6),
};

/**
 * @param {{minutes:number, research:boolean, researchIn?:number}} opts
 *   researchIn 을 주면 실측 보정값으로 대체한다.
 */
export function estimateRun({ minutes, research, researchIn }) {
  const m = { ...MODEL, ...(researchIn ? { researchIn } : {}) };

  const usage = {
    claudeIn: (research ? m.researchIn : 0) + m.scriptIn,
    claudeOut: (research ? m.researchOut : 0) + Math.round(m.scriptOutPerMin * minutes),
    ttsChars: Math.round(m.charsPerMin * minutes),
    geminiImages: m.images,
    images: 0,
  };

  const breakdown = {
    research: research ? r6((m.researchIn * PRICE.claudeIn + m.researchOut * PRICE.claudeOut) / 1e6) : 0,
    script: r6((m.scriptIn * PRICE.claudeIn + m.scriptOutPerMin * minutes * PRICE.claudeOut) / 1e6),
    tts: r6((usage.ttsChars / 1000) * PRICE.tts1k),
    images: r6(m.images * PRICE.geminiImage),
  };
  const usd = cost(usage);
  return { usage, breakdown, usd: r6(usd), krw: Math.round(usd * PRICE.usdKrw) };
}
