// 대본 미리보기 결과 조회 — ?run=<실행ID>
//
// 워크플로가 "대본 미리보기 출력" 스텝에서 script.json 을 로그에 그대로 흘린다.
// 여기서는 그 구간을 잘라 파싱해 돌려준다. 아티팩트(zip)를 쓰지 않는 이유는,
// 서버리스 함수에 unzip 의존성을 넣지 않기 위해서다(web/ 는 무의존성으로 유지한다).
// 로그는 평문이라 그대로 읽을 수 있고, 대본 JSON 은 몇 KB 라 크기도 문제되지 않는다.
const BEGIN = '<<<SCRIPT_PREVIEW_BEGIN>>>';
const END = '<<<SCRIPT_PREVIEW_END>>>';

/** 나레이션 한국어 실측 속도(초당 글자). src/lib/anthropic.ts 의 330자/분과 같은 기준. */
const CHARS_PER_SEC = 5.6;

export default async function handler(req, res) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }
  const run = String((req.query && req.query.run) || '').trim();
  if (!run) return res.status(400).json({ error: 'run(실행 ID)이 필요합니다' });

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const jr = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${run}/jobs`, { headers });
    if (!jr.ok) return res.status(502).json({ error: `실행 조회 실패 (${jr.status})` });
    const jobs = (await jr.json()).jobs || [];
    if (!jobs.length) return res.status(200).json({ found: false, status: 'queued' });

    const job = jobs[0];
    // 아직 대본 스텝이 끝나지 않았으면 로그에 구간이 없다 — 진행 중으로 답한다.
    const lr = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/jobs/${job.id}/logs`, { headers });
    if (!lr.ok) return res.status(200).json({ found: false, status: job.status });
    const text = await lr.text();

    const script = extractScript(text);
    if (!script) {
      return res.status(200).json({ found: false, status: job.status, conclusion: job.conclusion });
    }
    return res.status(200).json({
      found: true,
      status: job.status,
      conclusion: job.conclusion,
      runId: run,
      script,
      outline: buildOutline(script),
    });
  } catch (e) {
    return res.status(502).json({ error: '미리보기 조회 실패: ' + e.message });
  }
}

/** 로그에서 마커 사이의 JSON 한 줄을 꺼낸다. 로그 줄마다 타임스탬프가 붙으므로 떼어낸다. */
function extractScript(text) {
  const i = text.lastIndexOf(BEGIN);
  const j = text.lastIndexOf(END);
  if (i < 0 || j < 0 || j <= i) return null;
  const body = text.slice(i + BEGIN.length, j);
  // "2026-08-12T05:00:00.0000000Z {json...}" 형태 → 타임스탬프 제거 후 이어붙인다.
  const joined = body
    .split('\n')
    .map((l) => l.replace(/^\S*Z\s?/, '').trim())
    .join('');
  try {
    return JSON.parse(joined);
  } catch {
    return null;
  }
}

/**
 * 대본에서 화면 구성(컷 타임라인)을 역산한다.
 *
 * 진짜 컷 계산은 나레이션 오디오 길이가 나온 뒤 src/lib/timeline.ts 가 하지만,
 * 미리보기 시점에는 오디오가 없다. 글자 수 ÷ 5.6자/초로 씬 길이를 추정하고
 * 같은 규칙(목표 2.5초·최대 4초, 실사 클립은 2~3컷으로 분할)을 적용한다.
 * 그래서 여기 숫자는 ±1컷 정도 어긋날 수 있고, 화면에도 "예상"이라고 적는다.
 */
function buildOutline(script) {
  const TARGET = 2.5, MAX = 4, MIN = 1.2;
  const scenes = (script.scenes || []).map((s, i) => {
    const chars = (s.narration || '').length;
    const sec = Math.max(1, chars / CHARS_PER_SEC);
    const isLive = s.visual === 'liveaction';
    const clipSec = isLive ? (s.clipSeconds || 4) : 0;
    const cuts = [];

    if (clipSec > 0) {
      const usable = Math.min(clipSec, sec);
      const pieces = Math.min(3, Math.max(2, Math.round(clipSec / TARGET)));
      for (let p = 0; p < pieces; p++) cuts.push({ sec: usable / pieces, source: 'clip' });
    }
    const rest = sec - cuts.reduce((a, c) => a + c.sec, 0);
    if (rest > 0.05) {
      let n = Math.max(1, Math.round(rest / TARGET));
      while (rest / n > MAX) n++;
      while (n > 1 && rest / n < MIN) n--;
      for (let p = 0; p < n; p++) cuts.push({ sec: rest / n, source: 'image' });
    }
    return {
      index: i + 1,
      heading: s.heading || '',
      narration: s.narration || '',
      chars,
      sec: Math.round(sec * 10) / 10,
      visual: s.visual,
      liveaction: isLive,
      clipSeconds: clipSec || undefined,
      cuts: cuts.map((c) => ({ sec: Math.round(c.sec * 10) / 10, source: c.source })),
    };
  });

  const totalSec = scenes.reduce((a, s) => a + s.sec, 0);
  const allCuts = scenes.flatMap((s) => s.cuts);
  return {
    scenes,
    totalChars: scenes.reduce((a, s) => a + s.chars, 0),
    totalSec: Math.round(totalSec * 10) / 10,
    totalCuts: allCuts.length,
    clipCuts: allCuts.filter((c) => c.source === 'clip').length,
    avgCutSec: allCuts.length ? Math.round((totalSec / allCuts.length) * 100) / 100 : 0,
    maxCutSec: allCuts.length ? Math.max(...allCuts.map((c) => c.sec)) : 0,
    overLimit: totalSec > 60,
  };
}
