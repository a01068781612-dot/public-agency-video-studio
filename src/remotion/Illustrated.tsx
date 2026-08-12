import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import type { RenderManifest } from '../schema.js';
import { theme as lightTheme, darkTheme } from './theme.js';
import { PRETENDARD } from './pretendard.js';
import { captionChunks } from './components/beats.js';
import { IsoDiagram, IsoComparison } from './components/iso.js';
import { BulletSlide, QuoteSlide, CodeSlide } from './components/slides.js';
import { FlatIconSlide } from './components/flatIcon.js';

/**
 * 일러스트 영상: 씬마다 흑백 라인아트 이미지를 배경에 꽉 채워 보여주고(줌인/줌아웃),
 * 하단에 짧은 구절 단위 볼드 한글 자막을 얹는다. 나레이션 + 배경음악 포함.
 *
 * manifest.theme(light/dark, 영상 생성 시 한 번 정해짐)에 따라 코드로 그리는 발표자료/등각
 * 도식 전체의 배경·색을 라이트(흰 배경+검은 잉크) 또는 다크(짙은 배경+흰 도형)로 통일한다 —
 * "다크/화이트를 반전 활용해달라"는 요청에 대응, 매 영상이 항상 같은 흰 배경으로 보이지 않게.
 */
export const AiIllustrated: React.FC<RenderManifest> = (manifest) => {
  const theme = manifest.theme === 'dark' ? darkTheme : lightTheme;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      {manifest.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={scene.heading}>
          <SceneShot scene={scene} index={i} theme={theme} />
          <Audio src={staticFile(scene.audioPath)} />
        </Sequence>
      ))}
      {manifest.bgm && <BackgroundMusic src={manifest.bgm} total={manifest.totalDurationInFrames} />}
      {/* 로고 파일이 없어도 기관명은 띄운다 — 예전엔 파일이 있어야만 워터마크가 나와서,
          기관을 골라도 화면에 그 기관이 어디에도 표시되지 않았다. */}
      {manifest.agencyLabel && <AgencyWatermark src={manifest.agencyLogoPath} label={manifest.agencyLabel} />}
    </AbsoluteFill>
  );
};

/**
 * 홍보 타겟 기관 워터마크 — 우측 상단에 은은하게, 영상 전체에 고정 표시.
 * 로고 파일(public/agencies/*.png)은 선택이다. 없으면 기관명만 띄운다.
 */
const AgencyWatermark: React.FC<{ src?: string; label?: string }> = ({ src, label }) => (
  <div
    style={{
      position: 'absolute',
      top: 36,
      right: 40,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 16px 8px 10px',
      borderRadius: 999,
      background: 'rgba(15,15,18,0.55)',
      opacity: 0.92,
    }}
  >
    {src && <Img src={staticFile(src)} style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: '50%' }} />}
    {label && (
      <span style={{ fontFamily: PRETENDARD, fontSize: 22, fontWeight: 700, color: '#fff' }}>{label}</span>
    )}
  </div>
);

const SceneShot: React.FC<{ scene: RenderManifest['scenes'][number]; index: number; theme: typeof lightTheme }> = ({
  scene,
  index,
  theme,
}) => {
  const frame = useCurrentFrame();
  const dur = scene.durationInFrames;

  // 켄번즈 강화: 씬마다 줌인/줌아웃 번갈아 + 대각선 패닝 + 미세 드리프트(정체감 제거).
  const zoomIn = index % 2 === 0;
  const zoom = zoomIn
    ? interpolate(frame, [0, dur], [1.02, 1.18], { extrapolateRight: 'clamp' })
    : interpolate(frame, [0, dur], [1.18, 1.02], { extrapolateRight: 'clamp' });
  const dir = index % 2 === 0 ? 1 : -1;
  const panX = dir * interpolate(frame, [0, dur], [-34, 34], { extrapolateRight: 'clamp' }) + Math.sin(frame / 90) * 6;
  const panY = dir * interpolate(frame, [0, dur], [18, -18], { extrapolateRight: 'clamp' }) + Math.cos(frame / 110) * 5;
  // 씬 시작/끝 흰색 페이드(부드러운 전환).
  const fade = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // diagram/comparison 씬은 AI 그림 대신 등각(isometric) 코드 애니메이션으로 그린다 —
  // 구조화된 노드/엣지·좌우비교 데이터를 실제 모션 그래픽으로 보여줘서 AI 그림보다 깔끔하고
  // 나레이션 타이밍에 정확히 맞물린다.
  if (scene.visual === 'diagram' && scene.diagram && scene.diagram.nodes.length > 0) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <AbsoluteFill style={{ transform: `scale(${1 + (zoom - 1) * 0.35}) translate(${panX * 0.3}px, ${panY * 0.3}px)`, transformOrigin: 'center center' }}>
          <IsoDiagram diagram={scene.diagram} narration={scene.narration} durationInFrames={dur} seed={index} theme={theme} />
        </AbsoluteFill>
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }
  if (scene.visual === 'comparison' && scene.comparison) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <AbsoluteFill style={{ transform: `scale(${1 + (zoom - 1) * 0.35}) translate(${panX * 0.3}px, ${panY * 0.3}px)`, transformOrigin: 'center center' }}>
          <IsoComparison comparison={scene.comparison} narration={scene.narration} durationInFrames={dur} theme={theme} />
        </AbsoluteFill>
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }
  // bullets/quote 씬도 AI 그림 대신 실제 발표자료 슬라이드로 그린다 — 안 그러면 이 씬들이
  // 전부 같은 AI 일러스트 한 장 + 줌 패턴으로 렌더돼 영상 전체가 판박이처럼 보인다.
  if (scene.visual === 'bullets' && scene.bullets.length > 0) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <BulletSlide heading={scene.heading} bullets={scene.bullets} narration={scene.narration} durationInFrames={dur} theme={theme} seed={index} />
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }
  if (scene.visual === 'code' && scene.code) {
    return (
      <AbsoluteFill style={{ opacity: fade, backgroundColor: '#0f1117' }}>
        <CodeSlide
          filename={scene.code.filename}
          language={scene.code.language}
          code={scene.code.code}
          narration={scene.narration}
          durationInFrames={dur}
        />
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }
  if (scene.visual === 'quote') {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <QuoteSlide text={scene.narration} durationInFrames={dur} theme={theme} seed={index} />
      </AbsoluteFill>
    );
  }
  // title/outro 는 기본적으로 생활코딩 스타일 평면 2D 라인 아이콘으로 그린다(AI 그림 대신) —
  // 대본 생성 시 그 씬이 실제로 설명하는 대상에 맞춰 고른 아이콘이라 장식용이 아니라 내용 그 자체다.
  if ((scene.visual === 'title' || scene.visual === 'outro') && scene.icon) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <FlatIconSlide icon={scene.icon} theme={theme} />
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }

  // 컷 타임라인이 있으면 씬을 여러 컷으로 쪼개 보여준다(숏폼 템포).
  // 컷마다 연출이 달라 같은 그림이라도 화면이 계속 바뀌는 느낌이 난다.
  if (scene.cuts?.length && (scene.imagePath || scene.clipPath)) {
    return (
      <AbsoluteFill style={{ opacity: fade, backgroundColor: '#000' }}>
        {scene.cuts.map((cut, ci) => (
          <Sequence key={ci} from={cut.startFrame} durationInFrames={cut.durationInFrames} name={`cut${ci + 1}`}>
            <CutShot cut={cut} scene={scene} theme={theme} />
          </Sequence>
        ))}
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {scene.imagePath ? (
        <AbsoluteFill style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: 'center center' }}>
          <Img src={staticFile(scene.imagePath)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        // 이미지 없을 때 폴백: 흰 배경 + 큰 제목.
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 96, color: theme.ink, textAlign: 'center', maxWidth: 1500 }}>
            {scene.heading}
          </h1>
        </AbsoluteFill>
      )}
      <WordCaption narration={scene.narration} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

/**
 * 컷 하나 — 같은 소재(이미지/클립)라도 연출을 바꿔 다른 화면처럼 보이게 한다.
 * 실사 클립 컷은 영상 자체가 움직이므로 카메라 연출을 얹지 않는다(겹치면 출렁인다).
 */
const CutShot: React.FC<{
  cut: NonNullable<RenderManifest['scenes'][number]['cuts']>[number];
  scene: RenderManifest['scenes'][number];
  theme: typeof lightTheme;
}> = ({ cut, scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = cut.durationInFrames;
  const p = interpolate(frame, [0, d], [0, 1], { extrapolateRight: 'clamp' });
  // 컷 시작 순간의 등장 연출(0→1). 짧게 끝내야 다음 컷으로 리듬이 이어진다.
  const enter = interpolate(frame, [0, Math.min(10, d)], [0, 1], { extrapolateRight: 'clamp' });

  if (cut.source === 'clip' && scene.clipPath) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <OffthreadVideo
          src={staticFile(scene.clipPath)}
          startFrom={Math.round((cut.clipStartSec ?? 0) * fps)}
          muted // 나레이션과 겹치지 않게
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
    );
  }

  if (!scene.imagePath) {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: theme.paper }}>
        <h1 style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 96, color: theme.ink, textAlign: 'center', maxWidth: 1500 }}>
          {scene.heading}
        </h1>
      </AbsoluteFill>
    );
  }

  // 연출 프리셋 — transform 과 opacity 만으로 만든다(GPU 합성이라 렌더가 가볍다).
  let transform = '';
  let opacity = 1;
  switch (cut.motion) {
    case 'zoom-in':
      transform = `scale(${1.04 + p * 0.12})`;
      break;
    case 'zoom-out':
      transform = `scale(${1.16 - p * 0.12})`;
      break;
    case 'pan-left':
      transform = `scale(1.14) translateX(${(0.5 - p) * 70}px)`;
      break;
    case 'pan-right':
      transform = `scale(1.14) translateX(${(p - 0.5) * 70}px)`;
      break;
    case 'slide-up':
      transform = `scale(1.08) translateY(${(1 - enter) * 90}px)`;
      opacity = enter;
      break;
    case 'pop':
      transform = `scale(${1.02 + enter * 0.06 + p * 0.04})`;
      opacity = enter;
      break;
  }

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: theme.paper }}>
      <AbsoluteFill style={{ transform, transformOrigin: 'center center' }}>
        <Img src={staticFile(scene.imagePath)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 하단 중앙 짧은 자막(구절 단위) — 흰 배경/그림 위에서도 잘 보이게 어두운 알약 + 흰 글씨. */
const WordCaption: React.FC<{ narration: string; durationInFrames: number }> = ({ narration, durationInFrames }) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 16);
  if (chunks.length === 0) return null;
  const cur = chunks.find((b) => frame >= b.start && frame < b.end) ?? chunks[chunks.length - 1];

  const words = cur.text.split(/(\s+)/); // 공백 유지
  const span = Math.max(1, cur.end - cur.start);
  const prog = Math.max(0, Math.min(1, (frame - cur.start) / span));
  const totalLen = cur.text.length || 1;
  let acc = 0;

  // 조각이 바뀔 때마다 살짝 통통 등장.
  const pop = interpolate(frame - cur.start, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 72,
        left: 80,
        right: 80,
        textAlign: 'center',
        transform: `translateY(${(1 - pop) * 14}px)`,
        opacity: pop,
      }}
    >
      <span
        style={{
          fontFamily: PRETENDARD,
          fontSize: 60,
          fontWeight: 800,
          lineHeight: 1.25,
          color: '#fff',
          background: 'rgba(15,15,18,0.72)',
          borderRadius: 16,
          padding: '10px 26px',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {words.map((w, i) => {
          if (/^\s+$/.test(w)) return w;
          const before = acc / totalLen;
          acc += w.length;
          const spoken = prog >= before;
          return (
            <span key={i} style={{ color: spoken ? '#ffffff' : '#ffffff70' }}>
              {w}
            </span>
          );
        })}
      </span>
    </div>
  );
};

const BackgroundMusic: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const { fps } = useVideoConfig();
  const fadeIn = Math.round(fps * 1.5);
  const fadeOut = Math.round(fps * 2.5);
  const base = 0.14;
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(f) =>
        interpolate(f, [0, fadeIn, Math.max(fadeIn + 1, total - fadeOut), total], [0, base, base, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};
