import { z } from 'zod';

/**
 * 대본(script) 및 렌더링 매니페스트(manifest)의 공유 타입 정의.
 * Claude 가 구조화 출력으로 채우는 스키마이자, Remotion 이 입력 props 로 받는 타입.
 */

/** 손그림 다이어그램의 노드/엣지 (Excalidraw 스타일 도식). */
export const DiagramSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
      }),
    )
    .max(6),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      }),
    )
    .max(8),
});

export type Diagram = z.infer<typeof DiagramSchema>;

export const VisualKind = z.enum([
  'title', // 표지/도입
  'bullets', // 핵심 포인트 손글씨 나열
  'diagram', // 개념 도식(노드+화살표)
  'comparison', // 좌/우 비교
  'quote', // 한 문장 강조
  'code', // 실제 파일/코드/설정 예시 한 화면
  // 실제 장면을 그린 AI 일러스트 한 장. 나머지 종류는 전부 코드(글자·도형)로 그려지므로,
  // 화면에 "그림"이 들어가는 유일한 씬이다 — 이게 없으면 영상 전체가 글자만 남는다.
  'illustration',
  // illustration 과 같지만, 그 그림을 시작 프레임으로 짧은 실사 영상까지 만든다(Veo).
  // 초당 과금이라 비싸므로 실행당 몇 컷만 허용된다 — 대본이 "가장 움직임이 필요한" 대목에만 쓴다.
  'liveaction',
  'outro', // 마무리/구독 유도
]);

/**
 * title/outro 씬에서 실제로 렌더링되는 평면(flat) 2D 라인 아이콘 목록(생활코딩 스타일 레퍼런스).
 * 각 아이콘은 특정 개념과 1:1로 대응한다(자물쇠=보안/권한, DB=데이터, 서버=인프라, 시계=시간/지연 등) —
 * "장식용 아무 아이콘"이 아니라 그 씬이 실제로 설명하는 대상을 가리키도록 대본 생성 시 골라야 한다.
 */
export const IconKind = z.enum([
  'document', // 문서/자료/정의
  'chat', // 질문/대화/논쟁
  'search', // 조사/분석/검색
  'lock', // 보안/권한/잠금
  'key', // 인증/접근권한
  'database', // 데이터/저장소
  'server', // 인프라/백엔드/실행 환경
  'cloud', // 클라우드/원격 서비스
  'terminal', // 코드/커맨드/실행
  'gear', // 설정/구성
  'link', // 연결/통합/연동
  'check', // 완료/검증/성공
  'warning', // 주의/오류/리스크
  'user', // 개인/사용자
  'users', // 팀/커뮤니티/여러 사람
  'clock', // 시간/속도/지연
  'chart', // 성장/통계/수치
  'mail', // 알림/커뮤니케이션/전달
]);

/** visual="code" 씬에 쓰는 실제 파일/코드 예시 한 화면 (에디터 창처럼 렌더링됨). */
export const CodeExampleSchema = z.object({
  filename: z.string(), // 예: "skills/harness/SKILL.md", "hooks/pre-tool-use.sh"
  language: z.string().default('text'), // 하이라이트 힌트용 (yaml/json/bash/markdown 등, 실제 색칠은 안 함)
  code: z.string(), // 실제 화면에 보일 코드/설정 텍스트 (짧게, 8~14줄 이내)
});

export const SceneSchema = z.object({
  id: z.string(),
  heading: z.string(), // 화면 상단 짧은 제목
  narration: z.string(), // 성우가 읽을 나레이션 (해당 언어)
  bullets: z.array(z.string()).max(5).default([]),
  // AI 일러스트용 영어 시각 묘사. visual="illustration"/"liveaction" 씬에서는 필수
  // (이게 그림의 소재가 되고, liveaction 은 그 그림을 움직이게 만든다).
  // title/outro 는 보통 icon 으로 렌더링되므로 그쪽에서는 폴백 용도로만 쓰인다.
  illustration: z.string().default(''),
  // liveaction 전용 — "무엇이 어떻게 움직이는가"를 적는 영어 묘사(장면 설명이 아니라 움직임).
  motion: z.string().optional(),
  // liveaction 전용 — 클립 길이(초). Veo API 가 4·6·8 만 허용한다.
  // 움직임이 단순하면 4, 전개가 있으면 6, 넓은 현장을 훑으면 8.
  clipSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
  // title/outro 씬에서 실제로 렌더링되는 평면 2D 아이콘. 이 씬이 설명하는 구체적 대상과
  // 맞는 아이콘을 고른다(예: 보안 얘기면 lock, 데이터 얘기면 database).
  icon: IconKind.optional(),
  visual: VisualKind,
  diagram: DiagramSchema.optional(),
  comparison: z
    .object({
      leftTitle: z.string(),
      leftItems: z.array(z.string()).max(4),
      rightTitle: z.string(),
      rightItems: z.array(z.string()).max(4),
    })
    .optional(),
  code: CodeExampleSchema.optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string(), // 유튜브 영상 제목
  description: z.string(), // 유튜브 설명란
  tags: z.array(z.string()).max(15),
  topic: z.string(), // 이번 회차 주제
  // 썸네일에 크게 박을 후킹 문구 (8~14자). 설명문이 아니라 "긴장"이 있는 한 방.
  thumbnailHeadline: z.string(),
  // 문구를 짧게 쓰는 대신 "무엇에 대한 영상인지"를 남기는 구석 배지 (제품·회사명). 없으면 배지 생략.
  thumbnailBadge: z.string().optional().default(''),
  // 최소 3 — 예전엔 6이었는데, 1분짜리는 5씬이면 충분해서 모델이 빈 씬으로 자리를 채웠다.
  // 빈 씬은 화면이 비는 데다 liveaction 으로 잡히면 Veo 클립까지 생성돼 돈이 샌다.
  scenes: z.array(SceneSchema).min(3),
});

export type Script = z.infer<typeof ScriptSchema>;

/**
 * TTS 로 오디오를 만든 뒤, 실제 길이를 붙인 렌더 매니페스트.
 * (Remotion 컴포지션 props 로 쓰이므로 interface 가 아닌 type 으로 선언 —
 *  type 이어야 Record<string, unknown> 에 할당 가능.)
 */
/** 컷 하나 — 씬 안에서 화면이 한 번 바뀌는 단위. 계산은 src/lib/timeline.ts. */
export type SceneCut = {
  startFrame: number; // 씬 시작 기준 상대 프레임
  durationInFrames: number;
  motion: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'slide-up' | 'pop';
  source: 'image' | 'clip';
  clipStartSec?: number; // source='clip' 일 때 클립의 어느 지점부터 보여줄지
};

export type SceneWithAudio = Scene & {
  audioPath: string; // staticFile 상대경로 (예: audio/s1.mp3)
  imagePath?: string; // 일러스트 staticFile 상대경로 (예: img/s1.png) — illustrated 엔진용
  // 실사 클립 staticFile 상대경로 (예: clip/s1.mp4) — liveaction 씬에서만.
  // 생성에 실패하면 없을 수 있고, 그때는 imagePath 로 폴백해 정지 이미지로 렌더한다.
  clipPath?: string;
  // 이 씬을 몇 개의 컷으로 나눠 보여줄지 (src/lib/timeline.ts 가 계산).
  // 씬 하나가 화면 하나로만 렌더되면 숏폼이 지루해져서, 같은 소재라도 컷마다 연출을 바꾼다.
  cuts?: SceneCut[];
  durationSec: number; // 측정된 오디오 길이
  startFrame: number;
  durationInFrames: number;
};

export type RenderManifest = {
  title: string;
  topic: string;
  fps: number;
  width: number;
  height: number;
  totalDurationInFrames: number;
  scenes: SceneWithAudio[];
  createdAt: string;
  /** 이 영상 전체(코드로 그리는 발표자료/등각 도식 + AI 일러스트)가 라이트/다크 중 무엇을 쓸지.
   * 영상 단위로 한 번 정해 일관되게 적용한다(씬마다 바뀌면 어색함). 기본은 light. */
  theme?: 'light' | 'dark';
  /** 배경음악 staticFile 상대경로 (예: audio/bgm.wav). 없으면 무음. */
  bgm?: string;
  /** 홍보 타겟 기관 로고/마스코트 staticFile 상대경로 (예: agencies/police.png). 파일이 없으면 워터마크 없이 진행. */
  agencyLogoPath?: string;
  /** 워터마크 옆에 같이 표기할 기관명. */
  agencyLabel?: string;
};
