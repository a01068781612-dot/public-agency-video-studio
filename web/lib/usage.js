// 실행 사용량 조회 — usage 아티팩트 "이름"에 인코딩된 숫자를 읽어 집계한다.
// (zip 을 내려받아 풀지 않고 목록 조회만으로 끝내려는 설계. cost/estimate/publish 가 공유한다.)
import { cost } from './pricing.js';

const num = (name, key) => {
  const m = name.match(new RegExp(`__${key}-(\\d+)`));
  return m ? Number(m[1]) : 0;
};

/**
 * 만료되지 않은 usage 아티팩트를 실행 단위로 파싱해 돌려준다(최신순).
 * 토큰/저장소가 없거나 조회에 실패하면 빈 배열 — 호출부가 "집계 불가"로 다루면 된다.
 */
export async function fetchUsageRuns({ token, repo }) {
  if (!token || !repo) return [];
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!r.ok) return [];
  const { artifacts = [] } = await r.json();
  return artifacts
    .filter((a) => a.name.startsWith('usage__') && !a.expired)
    .map((a) => {
      const e = {
        at: a.created_at,
        claudeIn: num(a.name, 'ci'),
        claudeOut: num(a.name, 'co'),
        openaiIn: num(a.name, 'oi'),
        openaiOut: num(a.name, 'oo'),
        images: num(a.name, 'img'),
        geminiImages: num(a.name, 'gimg'),
        ttsChars: num(a.name, 'tts'),
      };
      e.usd = cost(e);
      return e;
    });
}

/** 특정 날짜(기본: 오늘, KST 기준)에 쓴 금액 합계(USD). */
export function spentOnDay(runs, now = new Date()) {
  const dayKey = (d) => new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = dayKey(now);
  return runs
    .filter((e) => dayKey(new Date(e.at)) === today)
    .reduce((s, e) => s + e.usd, 0);
}

/**
 * 오늘(KST) 안에 실제로 완성된(=대본 미리보기가 아닌) 영상 개수.
 * "렌더링" 스텝이 있고 건너뛰지 않은 채 성공했으면 완성으로 친다 — 대본 미리보기는
 * 그 스텝을 건너뛰므로(daily-publish.yml 의 PREVIEW_ONLY 조건) 세지 않고,
 * 실패한 실행도 그 날의 몫을 쓴 것으로 치지 않는다(재시도가 막히면 안 되므로).
 */
export async function countFullVideosToday({ token, repo }, now = new Date()) {
  if (!token || !repo) return 0;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const dayKey = (d) => new Date(new Date(d).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = dayKey(now);

  const rr = await fetch(
    `https://api.github.com/repos/${repo}/actions/runs?per_page=20&status=success`,
    { headers },
  );
  if (!rr.ok) return 0;
  const { workflow_runs = [] } = await rr.json();
  const candidates = workflow_runs.filter((w) => dayKey(w.created_at) === today);

  let count = 0;
  for (const w of candidates) {
    const jr = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${w.id}/jobs`, { headers });
    if (!jr.ok) continue;
    const { jobs = [] } = await jr.json();
    const steps = jobs[0]?.steps || [];
    const renderStep = steps.find((s) => s.name && s.name.includes('렌더'));
    if (renderStep && renderStep.conclusion === 'success') count++;
  }
  return count;
}
