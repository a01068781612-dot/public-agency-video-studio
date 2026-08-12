import type Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

/**
 * 모델 세대에 따라 갈리는 API 기능 차이를 한 곳에서 흡수한다.
 *
 * CLAUDE_MODEL 은 환경변수라 세대가 언제든 바뀔 수 있는데, 아래 두 기능은 4.6 이후
 * 모델에만 있어서 구세대 모델을 넣으면 호출이 400 으로 죽는다. 호출부마다 분기하면
 * 한쪽만 고치고 다른 쪽을 빠뜨리게 되므로(리서치가 조용히 실패하던 전례가 있다) 여기서 묶는다.
 *
 * - adaptive thinking: 4.6 이후 전용. 구세대는 budget_tokens 를 직접 줘야 한다.
 * - 웹서치 동적 필터링: 4.6 이후 전용. 구세대는 allowed_callers 를 direct 로 명시하지 않으면
 *   "이 툴은 code_execution 에서만 호출 가능" 400 이 난다.
 */

/**
 * 4.6 이전 세대 목록. 버전 번호를 정규식으로 비교하려 하면 하이픈 때문에 단어 경계가
 * 먹히지 않아 claude-opus-4-8 까지 구세대로 잡힌다 — 그냥 명시적으로 나열한다.
 * 목록에 없는(=앞으로 나올) 모델은 신세대로 본다.
 */
const LEGACY_MODELS = new Set([
  'claude-haiku-3-5',
  'claude-haiku-4-5',
  'claude-sonnet-4',
  'claude-sonnet-4-5',
  'claude-opus-4',
  'claude-opus-4-1',
  'claude-opus-4-5',
]);

/** 4.6 이전 세대(Haiku 4.5 / Sonnet 4.5 / Opus 4.5 등)인가. 뒤에 붙는 날짜 스냅샷은 떼고 본다. */
function isLegacyGeneration(model: string): boolean {
  return LEGACY_MODELS.has(model.replace(/-\d{8}$/, ''));
}

/**
 * thinking 파라미터. 구세대 모델은 예산을 명시한다.
 * @param budgetTokens 구세대에서 쓸 사고 예산. max_tokens 보다 반드시 작아야 한다.
 */
export function thinkingParam(budgetTokens: number, model = config.claudeModel): Anthropic.ThinkingConfigParam {
  if (isLegacyGeneration(model)) return { type: 'enabled', budget_tokens: budgetTokens };
  return { type: 'adaptive' };
}

/**
 * 웹서치 툴 정의.
 *
 * 구세대 모델은 동적 필터링(검색 결과를 코드로 걸러 컨텍스트에 넣는 기능)을 못 쓴다.
 * 그래서 검색 결과가 통째로 컨텍스트에 들어와 입력 토큰이 크게 늘어난다 —
 * Haiku 4.5 는 컨텍스트가 200k 뿐이라 검색 횟수를 함께 줄인다.
 */
export function webSearchTool(maxUses: number, model = config.claudeModel) {
  const legacy = isLegacyGeneration(model);
  return {
    type: 'web_search_20260209' as const,
    name: 'web_search' as const,
    max_uses: legacy ? Math.min(maxUses, 4) : maxUses,
    ...(legacy ? { allowed_callers: ['direct' as const] } : {}),
  };
}
