// 실행 전 예상 비용 — 발행 버튼을 누르기 전에 얼마나 나올지 미리 보여준다.
//
// 계산 자체는 web/lib/estimate.js 에 있고, 여기서는 최근 실행 실측치로 보정만 한다.
// (같은 계산을 /api/publish 의 상한 검사도 쓴다 — 견적과 차단 기준이 어긋나면 안 되므로.)
import { LIMITS } from '../lib/pricing.js';
import { fetchUsageRuns } from '../lib/usage.js';
import { estimateRun, MODEL } from '../lib/estimate.js';

export default async function handler(req, res) {
  const q = req.query || {};
  const minutes = Math.max(1, Math.min(20, Number(q.minutes) || 1));
  // 주제를 지정하거나 트렌드 모드면 웹서치를 한다(src/pipeline/run.ts 와 같은 조건).
  const research = q.research === undefined ? true : q.research !== 'false' && q.research !== '0';

  const { researchIn, samples } = await calibrate();
  const est = estimateRun({ minutes, research, researchIn });

  return res.status(200).json({
    minutes,
    research,
    ...est,
    limits: { perRunKrw: LIMITS.perRunKrw, perDayKrw: LIMITS.perDayKrw, spendEnabled: LIMITS.spendEnabled },
    overLimit: est.krw > LIMITS.perRunKrw,
    calibratedFrom: samples,
    note: samples
      ? `최근 실행 ${samples}건의 실측치로 보정한 추정입니다. 실제 청구액과 다를 수 있습니다.`
      : '실행 기록이 없어 기본 상수로 계산한 추정입니다. 실제 청구액과 다를 수 있습니다.',
  });
}

/**
 * 최근 실행에서 리서치 고정비(입력 토큰)를 실측 평균으로 보정한다.
 * 웹서치가 실제로 돌아간 실행만 표본으로 쓴다 — 리서치가 400 으로 조용히 실패하던
 * 시절의 실행은 입력이 작아서 평균을 왜곡한다.
 */
async function calibrate() {
  try {
    const runs = await fetchUsageRuns({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO });
    const ins = runs.map((e) => e.claudeIn).filter((v) => v >= 20000).slice(0, 10);
    if (ins.length === 0) return { samples: 0 };
    const avgIn = Math.round(ins.reduce((s, v) => s + v, 0) / ins.length);
    // ci 는 리서치 입력 + 대본 입력의 합이라, 대본 입력분을 빼야 리서치 고정비가 된다.
    return { researchIn: Math.max(0, avgIn - MODEL.scriptIn), samples: ins.length };
  } catch {
    return { samples: 0 };
  }
}
