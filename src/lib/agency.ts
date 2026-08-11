/**
 * 정부부처·청 프리셋 — 홍보담당자 타겟 브리핑에서 "어느 기관 관점으로 쓸지" 고르는 축.
 *
 * 기관마다 별도 톤 문구를 손으로 다 채우지 않는다(39곳 x 수작업은 유지보수가 어렵고 금방 낡는다).
 * 대신 소관 분야(domain) 한 줄만 갖고 있고, 프롬프트가 "이 소관 분야와 실제로 맞닿는 각도를
 * 최우선으로 찾아라"고 지시해 톤·주제 선택을 모델이 그때그때 추론하게 한다(자동/소관 분야 기반).
 */

export type Agency = {
  id: string;
  label: string;
  /** 소관 분야 한 줄 — 주제 선정과 사례 선택의 기준이 된다. */
  domain: string;
};

export const AGENCIES: Agency[] = [
  // ── 부 ──
  { id: 'moef', label: '기획재정부', domain: '예산·세제·경제정책 총괄' },
  { id: 'moe', label: '교육부', domain: '유초중등·고등교육, 평생교육 정책' },
  { id: 'msit', label: '과학기술정보통신부', domain: '과학기술 R&D, ICT·정보통신, AI·디지털 정책 총괄' },
  { id: 'mofa', label: '외교부', domain: '외교·통상·재외국민 보호' },
  { id: 'unikorea', label: '통일부', domain: '남북관계·통일 정책' },
  { id: 'moj', label: '법무부', domain: '법질서·검찰행정·교정·출입국' },
  { id: 'mnd', label: '국방부', domain: '국방·군사' },
  { id: 'mois', label: '행정안전부', domain: '지방행정·재난안전·정부혁신' },
  { id: 'mpva', label: '국가보훈부', domain: '국가유공자 예우·보훈' },
  { id: 'mcst', label: '문화체육관광부', domain: '문화·예술·체육·관광·미디어' },
  { id: 'mafra', label: '농림축산식품부', domain: '농업·축산·식품산업' },
  { id: 'motie', label: '산업통상자원부', domain: '산업·통상·에너지' },
  { id: 'mohw', label: '보건복지부', domain: '보건의료·복지·연금' },
  { id: 'me', label: '환경부', domain: '환경보전·기후대응·물관리' },
  { id: 'moel', label: '고용노동부', domain: '고용정책·노동관계' },
  { id: 'mogef', label: '여성가족부', domain: '여성·가족·청소년 정책' },
  { id: 'molit', label: '국토교통부', domain: '국토개발·주택·교통·건설' },
  { id: 'mof', label: '해양수산부', domain: '해양·수산·항만' },
  { id: 'mss', label: '중소벤처기업부', domain: '중소기업·소상공인·창업벤처' },
  // ── 처 ──
  { id: 'mpm', label: '인사혁신처', domain: '공무원 인사·인재개발' },
  { id: 'moleg', label: '법제처', domain: '법령 심사·정비' },
  { id: 'mfds', label: '식품의약품안전처', domain: '식품·의약품 안전관리' },
  // ── 청 ──
  { id: 'nts', label: '국세청', domain: '국세 부과·징수' },
  { id: 'customs', label: '관세청', domain: '관세·수출입 통관' },
  { id: 'pps', label: '조달청', domain: '정부 물자·공공조달' },
  { id: 'kostat', label: '통계청', domain: '국가통계 작성·관리' },
  { id: 'spo', label: '검찰청', domain: '형사사건 수사·기소' },
  { id: 'mma', label: '병무청', domain: '병역자원 관리' },
  { id: 'dapa', label: '방위사업청', domain: '방위력 개선사업·방산수출' },
  { id: 'police', label: '경찰청', domain: '치안·공공안전' },
  { id: 'nfa', label: '소방청', domain: '화재예방·구조구급' },
  { id: 'khs', label: '국가유산청', domain: '문화유산 보존·관리' },
  { id: 'rda', label: '농촌진흥청', domain: '농업기술 연구개발·보급' },
  { id: 'kfs', label: '산림청', domain: '산림자원 관리·산불방지' },
  { id: 'kipo', label: '특허청', domain: '지식재산권 심사·보호' },
  { id: 'kdca', label: '질병관리청', domain: '감염병 대응·질병관리' },
  { id: 'kma', label: '기상청', domain: '기상예보·기후감시' },
  { id: 'kcg', label: '해양경찰청', domain: '해양치안·해양안전' },
  { id: 'saemangeum', label: '새만금개발청', domain: '새만금 지역 개발' },
  { id: 'nacc', label: '행정중심복합도시건설청', domain: '세종시 건설·관리' },
  { id: 'kasa', label: '우주항공청', domain: '우주항공산업 육성' },
  { id: 'okva', label: '재외동포청', domain: '재외동포 정책' },
  // ── 위원회 ──
  { id: 'ftc', label: '공정거래위원회', domain: '시장경쟁·소비자보호·공정거래' },
  { id: 'fsc', label: '금융위원회', domain: '금융정책·금융감독' },
  { id: 'acrc', label: '국민권익위원회', domain: '부패방지·국민고충처리' },
  { id: 'kcc', label: '방송통신위원회', domain: '방송·통신 정책규제' },
  { id: 'pipc', label: '개인정보보호위원회', domain: '개인정보보호' },
  { id: 'nssc', label: '원자력안전위원회', domain: '원자력 안전규제' },
];

const BY_ID = new Map(AGENCIES.map((a) => [a.id, a]));

/** id 로 기관을 찾는다. 빈 값이나 모르는 값이면 undefined(= 특정 기관 지정 없음). */
export function resolveAgency(id: string | undefined): Agency | undefined {
  const key = (id || '').trim().toLowerCase();
  if (!key) return undefined;
  return BY_ID.get(key);
}

/** 대본 프롬프트에 넣을 최종 지시문. */
export function buildAgencyGuide(agency: Agency): string {
  return (
    `이번 영상은 "${agency.label}" 홍보담당자 관점을 위한 것이다. 이 기관의 소관 분야: ${agency.domain}. ` +
    'AI 트렌드/개념 중 이 기관의 소관 업무와 실제로 맞닿는 각도(이 기관이 보도자료를 내거나 언론 문의를 받을 법한 연결고리)를 ' +
    '최우선으로 찾는다. 억지로 끼워 맞추지 말고, 이 기관 관점에서 자연스럽게 의미가 통하는 주제를 선택한다. ' +
    '예시·비유·사례도 가능하면 이 소관 분야와 관련된 것을 우선 든다.'
  );
}
