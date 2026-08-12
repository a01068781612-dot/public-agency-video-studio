import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from '../config.js';

/**
 * 사용량 장부 — 한 번의 실행에서 무엇을 얼마나 썼는지 기록한다.
 *
 * 지금까지는 "이번 영상에 얼마 들었냐"는 질문에 추정으로만 답할 수 있었다.
 * API 응답에 실제 토큰 수·글자 수가 들어 있으니 그걸 그대로 적어두면 추정이 필요 없다.
 * 단가는 여기 두지 않는다(계정 요금제마다 다름) — 합산할 때 환경변수로 받는다.
 */

export type UsageKind =
  | 'claude'
  | 'openai-text'
  | 'openai-image'
  | 'gemini-image'
  | 'elevenlabs'
  | 'gemini-tts'
  | 'veo-video';

export interface UsageEntry {
  kind: UsageKind;
  /** 어느 단계에서 났는지 — script / research / thumbnail / narration 등 */
  step: string;
  /** 모델 이름(있으면). 단가가 모델마다 다르므로 남겨둔다. */
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** TTS 는 글자 수로 과금된다. */
  chars?: number;
  /** 이미지는 장 수로 과금된다. */
  images?: number;
  /** 영상(Veo)은 초 단위로 과금된다. */
  seconds?: number;
}

const USAGE_PATH = path.join(OUT_DIR, 'usage.json');

/** 실행 중 누적 — 프로세스가 단계마다 따로 뜨므로 파일에 이어 쓴다. */
export function recordUsage(entry: UsageEntry): void {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const list: UsageEntry[] = fs.existsSync(USAGE_PATH)
      ? JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'))
      : [];
    list.push(entry);
    fs.writeFileSync(USAGE_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    // 사용량 기록 실패가 영상 제작을 막아서는 안 된다.
    console.warn('  · 사용량 기록 실패(무시):', (e as Error).message);
  }
}

/** 항목별 합계 — 사람이 읽는 요약과 웹앱 누적 집계에 함께 쓴다. */
export function summarize(list: UsageEntry[]) {
  const by: Record<string, { inputTokens: number; outputTokens: number; chars: number; images: number; seconds: number }> = {};
  for (const e of list) {
    const key = `${e.kind}${e.model ? ':' + e.model : ''}`;
    by[key] ??= { inputTokens: 0, outputTokens: 0, chars: 0, images: 0, seconds: 0 };
    by[key].inputTokens += e.inputTokens || 0;
    by[key].outputTokens += e.outputTokens || 0;
    by[key].chars += e.chars || 0;
    by[key].images += e.images || 0;
    by[key].seconds += e.seconds || 0;
  }
  return by;
}

export function readUsage(): UsageEntry[] {
  try {
    return fs.existsSync(USAGE_PATH) ? JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8')) : [];
  } catch {
    return [];
  }
}

/** 실행 끝에 콘솔로 남기는 요약 — 로그만 봐도 이번 실행이 뭘 얼마나 썼는지 알 수 있게. */
export function printUsage(): void {
  const list = readUsage();
  if (!list.length) return;
  console.log('\n── 이번 실행 사용량 ──');
  for (const [k, v] of Object.entries(summarize(list))) {
    const parts: string[] = [];
    if (v.inputTokens || v.outputTokens) parts.push(`입력 ${v.inputTokens.toLocaleString()} / 출력 ${v.outputTokens.toLocaleString()} 토큰`);
    if (v.chars) parts.push(`${v.chars.toLocaleString()}자`);
    if (v.images) parts.push(`이미지 ${v.images}장`);
    if (v.seconds) parts.push(`영상 ${v.seconds}초`);
    console.log(`  ${k.padEnd(28)} ${parts.join(' · ')}`);
  }
  printCostKrw(list);
}

/**
 * 이번 실행에 실제로 얼마 나갔는지 원화로 찍는다.
 * 단가는 웹앱(web/lib/pricing.js)과 같은 기본값을 쓰되, 환경변수로 덮어쓸 수 있게 한다 —
 * 두 곳이 다른 금액을 보이면 "견적과 실제가 왜 다르냐"는 혼란이 생긴다.
 */
function printCostKrw(list: UsageEntry[]): void {
  const P = {
    claudeIn: Number(process.env.PRICE_CLAUDE_IN || 5),
    claudeOut: Number(process.env.PRICE_CLAUDE_OUT || 25),
    openaiIn: Number(process.env.PRICE_OPENAI_IN || 0.4),
    openaiOut: Number(process.env.PRICE_OPENAI_OUT || 1.6),
    image: Number(process.env.PRICE_IMAGE || 0.19),
    geminiImage: Number(process.env.PRICE_GEMINI_IMAGE || 0.067),
    tts1k: Number(process.env.PRICE_TTS_1K || 0.22),
    veoSec: Number(process.env.PRICE_VEO_SEC || 0.05),
    usdKrw: Number(process.env.USD_KRW || 1380),
  };
  let usd = 0;
  for (const e of list) {
    const inTok = e.inputTokens || 0;
    const outTok = e.outputTokens || 0;
    if (e.kind === 'claude') usd += (inTok * P.claudeIn + outTok * P.claudeOut) / 1e6;
    else if (e.kind === 'openai-text') usd += (inTok * P.openaiIn + outTok * P.openaiOut) / 1e6;
    else if (e.kind === 'openai-image') usd += (e.images || 0) * P.image;
    else if (e.kind === 'gemini-image') usd += (e.images || 0) * P.geminiImage;
    else if (e.kind === 'elevenlabs') usd += ((e.chars || 0) / 1000) * P.tts1k;
    else if (e.kind === 'veo-video') usd += (e.seconds || 0) * P.veoSec;
  }
  const krw = Math.round(usd * P.usdKrw);
  console.log(`  ${'─'.repeat(28)}`);
  console.log(`  이번 편 비용(추정)          약 ${krw.toLocaleString()}원 ($${usd.toFixed(2)})`);
}
