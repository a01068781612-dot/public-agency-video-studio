/* SIGNAL 엔진 — 데이터가 주인공인 미니멀 다크 UI (레퍼런스: 딥블랙 + 단일 민트 액센트 + 모노 라벨).
   3D 캔버스가 아니라 실제 DOM/CSS 로 렌더 → 텍스트가 칼같이 선명하고 제품 UI 질감이 난다.
   window.__setTime(t) 로 결정적 렌더, window.__DURATION 제공.
   장식 금지: 떠다니는 도형·그라디언트 남발 없음. 여백과 데이터로 승부. */
(function () {
'use strict';
const AC = window.ACCENT || '#2ee87a';
const css = `
:root{--bg:#0a0a0a;--ink:#e8ecf2;--dim:#8a8f98;--faint:#5a5f68;--ac:${AC};--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.025)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--ink);
 font-family:'Pretendard',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:1;
 background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(0,0,0,.55) 100%)}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-ligatures:none}

/* 상단 고정 챕터 배지 */
#hdr{position:fixed;top:38px;left:48px;z-index:6;display:flex;align-items:center;gap:12px}
#hdr .no{font-size:12px;letter-spacing:.12em;padding:5px 9px;border:1px solid var(--line);border-radius:6px;color:var(--dim);background:var(--card)}
#hdr .tx{font-size:15px;color:var(--dim);font-weight:600;letter-spacing:-.01em}
#hdr .tx b{color:var(--ink);font-weight:700}

/* 스테이지 */
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:2}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
 padding:0 9vw;opacity:0;transition:opacity .35s ease}
.scene.on{opacity:1}

/* 요소 등장 */
.el{opacity:0;transform:translateY(14px);transition:opacity .5s cubic-bezier(.2,.7,.2,1),transform .5s cubic-bezier(.2,.7,.2,1)}
.el.in{opacity:1;transform:none}

/* 거대 숫자 */
.big{display:flex;align-items:baseline;gap:22px}
.big .v{font-size:172px;font-weight:800;letter-spacing:-.045em;color:var(--ac);line-height:.92;
 text-shadow:0 0 60px ${AC}22}
.big .u{font-size:34px;font-weight:700;color:var(--ink);opacity:.9}
.big .sub{font-size:15px;color:var(--faint);margin-left:6px}
.cardwrap{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:30px 40px}

/* 변환 A → B */
.conv{display:flex;align-items:center;gap:34px}
.conv .box{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:22px 34px;text-align:center;min-width:230px}
.conv .box .n{font-size:72px;font-weight:800;letter-spacing:-.03em}
.conv .box .l{font-size:13px;color:var(--faint);margin-top:8px}
.conv .box.hi .n{color:var(--ac)}
.conv .ar{font-size:30px;color:var(--faint)}

/* 지표 카드 4개 */
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;width:100%;max-width:1180px}
.metrics .m{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:20px 22px}
.metrics .m .k{font-size:12px;color:var(--faint);letter-spacing:.04em}
.metrics .m .v{font-size:52px;font-weight:800;color:var(--ac);letter-spacing:-.03em;margin:8px 0 6px;line-height:1}
.metrics .m .d{font-size:11px;color:var(--faint);opacity:.8}

/* 관계 노드 */
.nodes{position:relative;width:100%;max-width:940px;height:400px}
.nodes .nd{position:absolute;transform:translate(-50%,-50%);border:1px solid var(--line);background:#0f0f0f;
 border-radius:999px;padding:12px 24px;font-size:18px;font-weight:600;white-space:nowrap}
.nodes .nd.hi{border-color:${AC}66;color:var(--ac);box-shadow:0 0 24px ${AC}22}
.nodes svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.nodes line{stroke:rgba(255,255,255,.13);stroke-width:1}

/* 진술/타이틀 */
.claim{font-size:78px;font-weight:800;letter-spacing:-.035em;line-height:1.18;text-align:center;max-width:1100px}
.claim em{font-style:normal;color:var(--ac)}
.kick{font-size:13px;letter-spacing:.22em;color:var(--ac);font-weight:700;margin-bottom:22px}
.lead{font-size:20px;color:var(--dim);margin-top:22px;text-align:center}

/* 하단 나레이션 자막 — 박스 없이 굵게 */
#cap{position:fixed;left:50%;bottom:8.5%;transform:translateX(-50%);z-index:7;
 font-size:26px;font-weight:700;color:var(--ink);text-align:center;max-width:72vw;
 letter-spacing:-.01em;text-shadow:0 2px 18px rgba(0,0,0,.9);white-space:nowrap}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

const DECK = (window.DECK_DATA && window.DECK_DATA.length) ? window.DECK_DATA : [
  { type: 'claim', kicker: 'DEMO', claim: '데이터가 <em>주인공</em>이다', say: '데모입니다.' },
];
const clamp = (a, b, x) => Math.max(a, Math.min(b, x));
const estDur = t => Math.max(2.4, String(t || '').length / 6.6 + 0.9);
function splitCap(s) {
  s = String(s || '').trim(); if (!s) return [];
  const D = '';
  const parts = s.replace(/([.!?])\s+/g, '$1' + D).replace(/(,)\s*/g, '$1' + D).split(D).map(x => x.trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => { while (p.length > 30) { let cut = p.lastIndexOf(' ', 30); if (cut < 15) cut = 30; out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim(); } if (p) out.push(p); });
  return out;
}

// ── 비트 타임라인 ──
const beats = [];
DECK.forEach((s, si) => {
  if (s.type === 'nodes' && s.steps) s.steps.forEach((st2, ni) => beats.push({ si, ni, dur: st2.dur || estDur(st2.say) }));
  else beats.push({ si, ni: -1, dur: s.dur || estDur(s.say) });
});
let acc = 0; beats.forEach(b => { b.t0 = acc; acc += b.dur; b.t1 = acc; });
window.__DURATION = acc;

// ── DOM 구성 ──
const hdr = document.createElement('div'); hdr.id = 'hdr';
hdr.innerHTML = `<span class="no mono">00</span><span class="tx"></span>`;
document.body.appendChild(hdr);
const stage = document.createElement('div'); stage.id = 'stage'; document.body.appendChild(stage);
const capEl = document.createElement('div'); capEl.id = 'cap'; document.body.appendChild(capEl);

function esc(x) { return String(x == null ? '' : x); }
function buildScene(s) {
  const d = document.createElement('div'); d.className = 'scene';
  if (s.type === 'big') {
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="cardwrap el"><div class="big"><span class="v" data-count="${esc(s.value)}">${esc(s.value)}</span>
      <span class="u">${esc(s.unit || '')}</span><span class="sub mono">${esc(s.sub || '')}</span></div></div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'convert') {
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="conv"><div class="box el"><div class="n">${esc(s.from)}</div><div class="l mono">${esc(s.fromLabel || '')}</div></div>
      <div class="ar el mono">&rarr;</div>
      <div class="box hi el"><div class="n">${esc(s.to)}</div><div class="l mono">${esc(s.toLabel || '')}</div></div></div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'metrics') {
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="metrics">${(s.items || []).map(m => `<div class="m el"><div class="k">${esc(m[0])}</div><div class="v">${esc(m[1])}</div><div class="d mono">${esc(m[2] || '')}</div></div>`).join('')}</div>`;
  } else if (s.type === 'nodes') {
    const pts = s.points || [];
    const lines = (s.links || []).map(([a, b2]) => {
      const p1 = pts[a], p2 = pts[b2];
      return `<line x1="${p1.x}%" y1="${p1.y}%" x2="${p2.x}%" y2="${p2.y}%"/>`;
    }).join('');
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="nodes"><svg>${lines}</svg>
      ${pts.map((p, i) => `<div class="nd el" data-i="${i}" style="left:${p.x}%;top:${p.y}%">${esc(p.label)}</div>`).join('')}</div>`;
  } else { // claim / title
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="claim el">${s.claim || esc(s.title)}</div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  }
  stage.appendChild(d); return d;
}
const scenes = DECK.map(buildScene);

window.__setTime = function (t) {
  t = clamp(0, window.__DURATION - 0.001, t);
  let bi = 0; for (let i = 0; i < beats.length; i++) if (t >= beats[i].t0) bi = i;
  const b = beats[bi], s = DECK[b.si], u = (t - b.t0) / b.dur;

  // 챕터 배지
  hdr.querySelector('.no').textContent = String(b.si + 1).padStart(2, '0');
  hdr.querySelector('.tx').innerHTML = window.HEADER || '';

  scenes.forEach((sc, i) => sc.classList.toggle('on', i === b.si));

  // 요소 순차 등장 — 그 "씬"이 시작된 시점 기준(비트가 여러 개인 nodes 씬도 한 번만 등장).
  const sceneT0 = beats.find(x => x.si === b.si).t0;
  const local = t - sceneT0;
  scenes[b.si].querySelectorAll('.el').forEach((el, k) => el.classList.toggle('in', local > 0.12 + k * 0.11));

  // nodes: 단계별 강조
  if (s.type === 'nodes' && b.ni >= 0) {
    const hi = (s.steps[b.ni] || {}).node;
    scenes[b.si].querySelectorAll('.nd').forEach((n, i2) => n.classList.toggle('hi', i2 === hi));
  }

  // 자막(청크 한 줄)
  const say = (s.type === 'nodes' && b.ni >= 0) ? (s.steps[b.ni].say || '') : (s.say || '');
  if (b._caps === undefined) b._caps = splitCap(say);
  const caps = b._caps;
  if (!caps.length) { capEl.textContent = ''; }
  else {
    const tot = caps.reduce((a2, c) => a2 + c.length, 0) || 1;
    let a3 = 0, idx = caps.length - 1;
    for (let k = 0; k < caps.length; k++) { const fr = caps[k].length / tot; if (u < a3 + fr) { idx = k; break; } a3 += fr; }
    capEl.textContent = caps[idx];
  }
};
(async () => {
  try { await Promise.all(["800 150px 'Pretendard'", "500 13px 'JetBrains Mono'"].map(f => document.fonts.load(f))); } catch (e) {}
  window.__setTime(0);
})();
})();
