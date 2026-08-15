const $ = id => document.getElementById(id);
const TOTAL = COUNTRIES.reduce((s, c) => s + c.p, 0);

const CUM = [];                              // 累積和（重み付き抽選用）
COUNTRIES.reduce((s, c, i) => CUM[i] = s + c.p, 0);

function rand() {                            // [0,1) の暗号学的乱数
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 4294967296;
}

function draw() {
  const target = rand() * TOTAL;
  let lo = 0, hi = CUM.length - 1;           // 二分探索
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (CUM[mid] <= target) lo = mid + 1; else hi = mid;
  }
  return COUNTRIES[lo];
}

const flagOf = c => c.c === 'XK' ? '🇽🇰'
  : c.c.replace(/./g, ch => String.fromCodePoint(0x1F1A5 + ch.charCodeAt(0)));
const probOf = c => c.p / TOTAL;
const jpPop = t => {                         // 千人単位 →「◯億人 / ◯万人」
  const n = t * 1000;
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '億人';
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString() + '万人';
  return n.toLocaleString() + '人';
};
const pctText = p => {                       // 極小の国も指数表記にせず読めるように
  const v = p * 100;
  if (v >= 1) return v.toFixed(2) + '%';
  if (v >= 0.01) return v.toFixed(3) + '%';
  return v.toFixed(8).replace(/0+$/, '') + '%';
};
const oddsText = p => {
  const n = 1 / p;
  return n >= 1e6 ? Math.round(n / 1e4).toLocaleString() + '万人に1人'
       : n >= 1e4 ? Math.round(n / 1e3) / 10 + '万人に1人'
       : Math.round(n).toLocaleString() + '人に1人';
};
const RARITY = [
  { min: 0.05,   label: '★★★★★ 超大国 ULTRA', color: '#ff6ea8' },
  { min: 0.01,   label: '★★★★ 大国 SSR',      color: '#ffd166' },
  { min: 0.002,  label: '★★★ 中堅国 SR',       color: '#57d9a3' },
  { min: 0.0003, label: '★★ 小国 R',           color: '#5b9dff' },
  { min: 0,      label: '★ 激レア国 LEGEND',    color: '#c9a7ff' },
];
const rarityOf = p => RARITY.find(r => p >= r.min);

// ---- 表示 ----
function show(c, final) {
  $('flag').textContent = flagOf(c);
  $('cname').textContent = c.n;
  $('cen').textContent = c.e;
  if (!final) { MAP.blink(c.c); return; }
  const p = probOf(c);
  $('sProb').textContent = pctText(p);
  $('sOdds').textContent = oddsText(p);
  $('sPop').textContent = jpPop(c.p);
  $('sPopLab').textContent = c.r + 'の人口';
  const r = rarityOf(p);
  $('rarityWrap').innerHTML = `<div class="rarity" style="color:${r.color}">${r.label}</div>`;
  $('maptip').textContent = `📍 ${c.n}（${c.e}）`;
  MAP.focus(c.c);
  highlight(c);
  revealPoint(c);     // Stage2: 非同期・追加的に実行。失敗してもここまでの表示は崩れない
}

// ---- Stage2: 国内地点抽選（人口密度グリッド） ----
const stage2Cache = new Map();               // iso2 -> { grid, places }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadCountryData(iso2) {
  if (stage2Cache.has(iso2)) return stage2Cache.get(iso2);
  const gridPromise = NO_GRID.has(iso2)
    ? Promise.resolve(null)
    : fetchJSON(`grids/${iso2}.json`).catch(() => null);
  const placesPromise = fetchJSON(`places/${iso2}.json`).catch(() => []);
  const [grid, places] = await Promise.all([gridPromise, placesPromise]);
  const data = { grid, places };
  stage2Cache.set(iso2, data);
  return data;
}

// グリッドセルを人口比例で抽選し、セル内(0.1度四方)で一様にジッターさせる
function drawPoint(gridRows) {
  if (!gridRows || gridRows.length === 0) return null;
  const cum = [];
  gridRows.reduce((s, row, i) => cum[i] = s + row[2], 0);
  const target = rand() * cum[cum.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid + 1; else hi = mid;
  }
  const [lon10, lat10] = gridRows[lo];
  return [lon10 / 10 + rand() * 0.1, lat10 / 10 + rand() * 0.1];
}

// グリッドが無い国向け: 国のbbox内一様ランダム（bboxが無い超小国はセントロイド±小ジッター）
function fallbackPoint(country) {
  const g = GEO_INDEX[country.c];
  if (!g) return [0, 0];
  const [, lon, lat, bw, bh] = g;
  if (bw && bh) return [lon + (rand() - 0.5) * bw, lat + (rand() - 0.5) * bh];
  return [lon + (rand() - 0.5) * 0.1, lat + (rand() - 0.5) * 0.1];
}

// 総当たりで最近傍の地名を探す（最大でも数千件規模なので十分高速）
function nearestPlace(pt, places) {
  if (!places || !places.length) return null;
  const [plon, plat] = pt;
  const coslat = Math.cos(plat * Math.PI / 180);
  let best = null, bestD = Infinity;
  for (const p of places) {
    const dx = (p[0] - plon) * coslat, dy = p[1] - plat;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

async function revealPoint(country) {
  const box = $('stage2'), loading = $('s2Loading'), result = $('s2Result');
  box.style.display = '';
  loading.style.display = '';
  result.style.display = 'none';
  MAP.resetPoint();
  try {
    const { grid, places } = await loadCountryData(country.c);
    const approx = !grid || grid.length === 0;
    const pt = approx ? fallbackPoint(country) : drawPoint(grid);
    const place = nearestPlace(pt, places);
    loading.style.display = 'none';
    result.style.display = '';
    const tag = approx ? '（推定）' : '';
    $('s2Place').textContent = place ? `📍 ${place[2]} 近郊${tag}` : `📍 詳細地点${tag}`;
    const ns = pt[1] >= 0 ? 'N' : 'S', ew = pt[0] >= 0 ? 'E' : 'W';
    $('s2Coord').textContent = `${Math.abs(pt[1]).toFixed(2)}°${ns}, ${Math.abs(pt[0]).toFixed(2)}°${ew}`;
    MAP.focusPoint(pt[0], pt[1], places, place ? place[2] : null);
  } catch (err) {
    console.warn('Stage2 unavailable:', err);
    box.style.display = 'none';
  }
}

let busy = false;
async function spin() {
  if (busy) return;
  busy = true;
  $('roll').disabled = $('roll10').disabled = true;
  $('stage').classList.add('rolling');
  $('maptip').textContent = '🎲 抽選中…';
  $('stage2').style.display = 'none';            // 前回のStage2結果を隠す
  MAP.reset();                                   // 抽選中は世界全体を映す
  const result = draw();
  const t0 = performance.now(), DUR = 1600;
  await new Promise(done => {
    (function tick() {
      const e = (performance.now() - t0) / DUR;
      if (e >= 1) return done();
      show(draw(), false);
      setTimeout(tick, 45 + 280 * e * e * e);      // だんだん減速
    })();
  });
  $('stage').classList.remove('rolling');
  show(result, true);
  addHistory(result);
  busy = false;
  $('roll').disabled = $('roll10').disabled = false;
}

// ---- 履歴 ----
const history = [];
function addHistory(c) {
  history.unshift(c);
  $('sCount').textContent = history.length;
  $('histCount').textContent = `（${history.length}回）`;
  $('hist').innerHTML = history.slice(0, 60).map((x, i) =>
    `<span class="chip" data-i="${i}">${flagOf(x)} ${x.n}<small>${pctText(probOf(x))}</small></span>`).join('');
}
$('hist').onclick = e => {
  const chip = e.target.closest('.chip[data-i]');
  if (chip) show(history[+chip.dataset.i], true);
};

$('roll').onclick = spin;
$('roll10').onclick = async () => { for (let i = 0; i < 10; i++) await spin(); };
$('reset').onclick = () => {
  history.length = 0;
  $('hist').innerHTML = '<span class="chip">まだ転生していません</span>';
  $('histCount').textContent = '';
  $('sCount').textContent = '0';
};
$('mapreset').onclick = () => MAP.reset();

function setMapFullscreen(on) {
  $('mapbox').classList.toggle('fullscreen', on);
  document.body.classList.toggle('map-fullscreen', on);
  $('mapfull').textContent = on ? '✕' : '⛶';
  $('mapfull').setAttribute('aria-label', on ? '全画面表示を閉じる' : '地図を全画面表示');
}
$('mapfull').onclick = () => setMapFullscreen(!$('mapbox').classList.contains('fullscreen'));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('mapbox').classList.contains('fullscreen')) setMapFullscreen(false);
});

// ---- 地域別 ----
const byRegion = {};
COUNTRIES.forEach(c => byRegion[c.r] = (byRegion[c.r] || 0) + c.p);
const regs = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
$('regions').innerHTML = regs.map(([r, p]) => `
  <div class="reg"><span>${r}</span>
    <span class="rb"><i style="width:${p / regs[0][1] * 100}%"></i></span>
    <span style="text-align:right;color:var(--gold)">${(p / TOTAL * 100).toFixed(1)}%</span>
  </div>`).join('');

// ---- テーブル ----
const sorted = [...COUNTRIES].sort((a, b) => b.p - a.p);
const maxP = sorted[0].p;
function renderTable(filter = '') {
  const f = filter.trim().toLowerCase();
  $('tbody').innerHTML = sorted.map((c, i) => ({ c, i }))
    .filter(({ c }) => !f || c.n.toLowerCase().includes(f) || c.e.toLowerCase().includes(f) || c.r.includes(f))
    .map(({ c, i }) => `<tr data-c="${c.c}">
        <td>${i + 1}</td><td>${flagOf(c)} ${c.n}</td><td>${jpPop(c.p)}</td>
        <td>${pctText(probOf(c))}</td>
        <td><span class="mini"><i style="width:${Math.max(1, c.p / maxP * 100)}%"></i></span></td>
      </tr>`).join('');
}
function highlight(c) {
  document.querySelectorAll('tr.me').forEach(tr => tr.classList.remove('me'));
  const tr = document.querySelector(`tr[data-c="${c.c}"]`);
  if (tr) tr.classList.add('me');
}
$('q').oninput = e => renderTable(e.target.value);
$('tbody').onclick = e => {
  const tr = e.target.closest('tr[data-c]');
  if (tr) show(COUNTRIES.find(c => c.c === tr.dataset.c), true);
};
renderTable();

// ---- 初期化 ----
MAP.init($('map'));
$('nCountries').textContent = $('nFoot').textContent = COUNTRIES.length;
$('total').textContent = (TOTAL * 1000).toLocaleString();
$('cover').textContent = (TOTAL * 1000 / 8.16e9 * 100).toFixed(1) + '%';
