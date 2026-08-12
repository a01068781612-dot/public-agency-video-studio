import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PRETENDARD } from '../pretendard.js';
import type { Scene } from '../../schema.js';

/**
 * 비트별 모션그래픽.
 *
 * 지금까지 화면에서 움직이는 건 사진의 카메라 워크뿐이었다("사진에 대한 모션만 들어가 있다").
 * 숫자와 글자가 살아 움직여야 정보가 전달되고 숏폼처럼 보인다 — 그 역할을 여기서 맡는다.
 * 씬의 beat 와 데이터(metric/ranking/bullets)를 보고 무엇을 띄울지는 BeatGraphic 이 고른다.
 */

const ACCENT = '#ffb84d';

/** 큰 숫자가 0에서 목표값까지 굴러 올라간다 — 통계 한 방을 각인시키는 용도. */
export const CountUp: React.FC<{ value: number; unit: string; label: string }> = ({ value, unit, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 처음엔 빠르게, 끝에서 천천히 멈춘다(선형이면 기계적으로 보인다).
  const p = interpolate(frame, [6, 6 + fps * 1.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = 1 - Math.pow(1 - p, 3);
  const shown = Math.round(value * eased);
  const appear = spring({ frame, fps, config: { damping: 14 }, durationInFrames: Math.round(fps * 0.6) });

  return (
    <div
      style={{
        position: 'absolute',
        top: '30%',
        left: 0,
        right: 0,
        textAlign: 'center',
        transform: `scale(${0.9 + appear * 0.1})`,
        opacity: appear,
      }}
    >
      <div style={{ fontFamily: PRETENDARD, fontSize: 34, fontWeight: 700, color: '#ffffffcc', marginBottom: 8, textShadow: '0 2px 12px #000' }}>
        {label}
      </div>
      <div style={{ fontFamily: PRETENDARD, fontSize: 150, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 6px 30px #000' }}>
        {shown.toLocaleString()}
        <span style={{ fontSize: 70, marginLeft: 10, color: ACCENT }}>{unit}</span>
      </div>
    </div>
  );
};

/** 순위 막대가 위에서부터 차례로 차오른다 — 1·2·3위 비교를 한눈에. */
export const RankBars: React.FC<{ items: { label: string; value: number; unit?: string }[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div style={{ position: 'absolute', left: '10%', right: '10%', top: '26%' }}>
      {items.map((it, i) => {
        // 막대마다 0.35초씩 늦게 시작해 차례로 차오르는 리듬을 만든다.
        const delay = Math.round(fps * 0.35) * i;
        const grow = interpolate(frame - delay, [0, fps * 0.7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const width = (it.value / max) * 100 * grow;
        return (
          <div key={i} style={{ marginBottom: 22, opacity: grow > 0 ? 1 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: PRETENDARD, fontSize: 36, fontWeight: 800, color: '#fff', textShadow: '0 2px 10px #000' }}>
                {i + 1}. {it.label}
              </span>
              <span style={{ fontFamily: PRETENDARD, fontSize: 34, fontWeight: 800, color: ACCENT, textShadow: '0 2px 10px #000' }}>
                {Math.round(it.value * grow).toLocaleString()}
                {it.unit ?? ''}
              </span>
            </div>
            <div style={{ height: 20, borderRadius: 10, background: '#ffffff22', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${width}%`,
                  height: '100%',
                  borderRadius: 10,
                  background: i === 0 ? `linear-gradient(90deg, ${ACCENT}, #ff922b)` : '#ffffff88',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 불릿이 아래에서 하나씩 밀려 올라온다 — 정책·조치를 나열하는 자리. */
export const BulletStagger: React.FC<{ items: string[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = items.slice(0, 4);

  return (
    <div style={{ position: 'absolute', left: '10%', right: '10%', top: '30%' }}>
      {shown.map((t, i) => {
        const delay = Math.round(fps * 0.45) * i;
        const s = spring({ frame: frame - delay, fps, config: { damping: 16 }, durationInFrames: Math.round(fps * 0.5) });
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              marginBottom: 20,
              opacity: s,
              transform: `translateY(${(1 - s) * 28}px)`,
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: ACCENT, marginTop: 16, flexShrink: 0 }} />
            <span style={{ fontFamily: PRETENDARD, fontSize: 42, fontWeight: 800, color: '#fff', lineHeight: 1.35, textShadow: '0 2px 14px #000' }}>
              {t}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * 씬의 beat 와 들어 있는 데이터를 보고 어떤 그래픽을 띄울지 고른다.
 * 데이터가 없으면 아무것도 그리지 않는다 — 빈 그래픽 틀이 뜨는 것보다 사진만 보이는 게 낫다.
 */
export const BeatGraphic: React.FC<{ scene: Scene }> = ({ scene }) => {
  if (scene.beat === 'context' && scene.metric) {
    return <CountUp value={scene.metric.value} unit={scene.metric.unit} label={scene.metric.label} />;
  }
  if (scene.beat === 'data' && scene.ranking?.length) {
    return <RankBars items={scene.ranking} />;
  }
  if (scene.beat === 'action' && scene.bullets?.length) {
    return <BulletStagger items={scene.bullets} />;
  }
  return null;
};
