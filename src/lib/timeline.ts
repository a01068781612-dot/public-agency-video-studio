import type { SceneWithAudio, SceneCut } from '../schema.js';

/**
 * 컷 타임라인 설계.
 *
 * 지금까지는 "나레이션 씬 하나 = 화면 하나"였다. 1분 영상이면 화면이 3~6번밖에 안 바뀌어
 * 숏폼으로는 지루하다. 여기서 씬 하나를 여러 "컷"으로 쪼개, 같은 소재라도 카메라 움직임과
 * 등장 방식을 바꿔가며 화면이 계속 갱신되게 만든다.
 *
 * 컷은 대본(LLM)이 정하지 않는다 — 나레이션 길이가 정해져야 나눌 수 있고, 규칙이 단순해서
 * 코드로 계산하는 편이 결과가 일정하다. LLM 에게 맡기면 컷 길이가 제멋대로 나온다.
 */

/** 컷마다 돌아가는 화면 연출. 같은 그림이라도 이게 다르면 다른 화면처럼 보인다. */
export type MotionPreset =
  | 'zoom-in' // 천천히 밀고 들어감
  | 'zoom-out' // 빠져나옴
  | 'pan-left' // 좌로 흐름
  | 'pan-right' // 우로 흐름
  | 'slide-up' // 아래에서 밀려 올라오며 등장
  | 'pop'; // 살짝 튀어나오며 등장

/** 연출 순환 순서 — 인접한 컷이 같은 움직임을 쓰지 않도록 돌려쓴다. */
const PRESET_CYCLE: MotionPreset[] = ['zoom-in', 'pan-right', 'zoom-out', 'slide-up', 'pan-left', 'pop'];

/** 컷 정의는 스키마(SceneCut)와 공유한다 — 매니페스트에 그대로 실리므로 형태가 갈리면 안 된다. */
export type Cut = SceneCut;

/** 컷 길이 규칙 — 요청 스펙: 평균 2.5초, 한 컷 최대 4초. */
export const TARGET_CUT_SEC = 2.5;
export const MAX_CUT_SEC = 4;
/** 너무 잘게 쪼개면 깜빡이는 느낌이 나서 하한을 둔다. */
export const MIN_CUT_SEC = 1.2;

/**
 * 씬 하나를 컷으로 나눈다.
 *
 * @param scene 오디오 길이가 확정된 씬
 * @param fps
 * @param clipSeconds 실사 클립 길이(초). 있으면 그 클립을 여러 컷에 나눠 배치한다.
 */
export function planCuts(scene: SceneWithAudio, fps: number, clipSeconds?: number): Cut[] {
  const totalFrames = scene.durationInFrames;
  const cuts: Cut[] = [];
  let at = 0;
  let presetIdx = 0;

  // ① 실사 클립이 있으면 클립 전체를 2~3컷으로 쪼개 앞쪽에 배치한다.
  //    (클립 하나를 한 컷으로 통째로 쓰면 그 구간만 화면이 안 바뀌어 늘어져 보인다.)
  if (clipSeconds && clipSeconds > 0) {
    const clipFramesTotal = Math.min(Math.round(clipSeconds * fps), totalFrames);
    if (clipFramesTotal > 0) {
      const pieces = Math.min(3, Math.max(2, Math.round(clipSeconds / TARGET_CUT_SEC)));
      const base = Math.floor(clipFramesTotal / pieces);
      const rem = clipFramesTotal - base * pieces;
      let usedClipFrames = 0; // 클립 안에서 어디까지 썼는지(컷을 이어붙여 클립을 순서대로 소비)
      for (let i = 0; i < pieces; i++) {
        const durationInFrames = base + (i < rem ? 1 : 0);
        if (durationInFrames <= 0) continue;
        cuts.push({
          startFrame: at,
          durationInFrames,
          // 영상 컷은 그 자체가 움직이므로 카메라 연출을 겹치지 않는다(겹치면 출렁인다).
          motion: 'zoom-in',
          source: 'clip',
          clipStartSec: usedClipFrames / fps,
        });
        at += durationInFrames;
        usedClipFrames += durationInFrames;
      }
    }
  }

  // ② 남은 시간은 정지 이미지 컷으로 채운다. 목표 2.5초, 최대 4초.
  const restFrames = totalFrames - at;
  if (restFrames > 0) {
    const restSec = restFrames / fps;
    let count = Math.max(1, Math.round(restSec / TARGET_CUT_SEC));
    while (restSec / count > MAX_CUT_SEC) count++;
    while (count > 1 && restSec / count < MIN_CUT_SEC) count--;

    const base = Math.floor(restFrames / count);
    const rem = restFrames - base * count;
    for (let i = 0; i < count; i++) {
      const durationInFrames = base + (i < rem ? 1 : 0);
      cuts.push({
        startFrame: at,
        durationInFrames,
        motion: PRESET_CYCLE[presetIdx++ % PRESET_CYCLE.length],
        source: 'image',
      });
      at += durationInFrames;
    }
  }

  return cuts;
}

/** 영상 전체의 컷을 한 번에 계획한다. 로그·검증용 요약도 함께 돌려준다. */
export function planTimeline(scenes: SceneWithAudio[], fps: number) {
  const perScene = scenes.map((s) => {
    const clipSec = s.clipPath ? (s.clipSeconds ?? 4) : undefined;
    return planCuts(s, fps, clipSec);
  });
  const all = perScene.flat();
  const secs = all.map((c) => c.durationInFrames / fps);
  return {
    perScene,
    totalCuts: all.length,
    avgCutSec: secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : 0,
    maxCutSec: secs.length ? Math.max(...secs) : 0,
    clipCuts: all.filter((c) => c.source === 'clip').length,
  };
}
