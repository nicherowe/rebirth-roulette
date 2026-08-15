// 正距円筒図法の世界地図SVGを描画し、当選国へズームするモジュール
const MAP = (() => {
  const W = 1000, H = 500;                 // 経度360°→1000px / 緯度180°→500px
  const VIEW = { x: 0, y: 18, w: 1000, h: 394 };   // 南極を除いた表示範囲

  const px = lon => (lon + 180) / 360 * W;
  const py = lat => (90 - lat) / 180 * H;

  // 日付変更線をまたぐ環（ロシア・フィジー等）は西経側を+360°ずらして繋げる
  function ringPath(ring) {
    let lons = ring.map(p => p[0]);
    const span = Math.max(...lons) - Math.min(...lons);
    const wrap = span > 180;
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      let [lon, lat] = ring[i];
      if (wrap && lon < 0) lon += 360;
      d += (i ? 'L' : 'M') + px(lon).toFixed(1) + ',' + py(lat).toFixed(1);
    }
    return d + 'Z';
  }

  function featurePath(f) {
    const polys = f.g === 'M' ? f.c : [f.c];
    return polys.map(p => p.map(ringPath).join('')).join('');
  }

  let svg, gCountries, marker, marker2, anim = null;
  let mk = { x: 0, y: 0 };                 // 国代表点マーカーの位置（地図座標）
  let mk2 = { x: 0, y: 0 };                // Stage2: 実際に抽選された地点のマーカー位置

  // ズームしてもマーカーの見た目の大きさが変わらないよう縮尺の逆数をかける
  function placeMarker(viewW) {
    const k = viewW / VIEW.w;
    marker.setAttribute('transform', `translate(${mk.x},${mk.y}) scale(${k})`);
    if (marker2) marker2.setAttribute('transform', `translate(${mk2.x},${mk2.y}) scale(${k})`);
  }

  function init(el) {
    svg = el;
    svg.setAttribute('viewBox', `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`);
    const paths = WORLD.map(f =>
      `<path id="p-${f.id}" d="${featurePath(f)}" />`).join('');
    svg.innerHTML = `
      <rect class="ocean" x="${-W}" y="${-H}" width="${W * 3}" height="${H * 3}"/>
      <g class="countries">${paths}</g>
      <g class="marker" style="opacity:0">
        <circle class="pulse" r="7"/><circle class="dot" r="3.2"/>
      </g>
      <g class="marker2" style="opacity:0">
        <circle class="pulse2" r="4"/><circle class="dot2" r="2"/>
      </g>`;
    gCountries = svg.querySelector('.countries');
    marker = svg.querySelector('.marker');
    marker2 = svg.querySelector('.marker2');
  }

  function tweenView(to, ms = 900) {
    const from = svg.getAttribute('viewBox').split(' ').map(Number);
    const t0 = performance.now();
    clearTimeout(anim);
    (function step() {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);                   // ease-out cubic
      const v = to.map((x, i) => from[i] + (x - from[i]) * e);
      svg.setAttribute('viewBox', v.join(' '));
      placeMarker(v[2]);
      if (t < 1) anim = setTimeout(step, 16);
    })();
  }

  // 当選国をハイライトしてズームイン
  function focus(iso2) {
    const g = GEO_INDEX[iso2];
    if (!g) return;
    const [featId, lon, lat, bw, bh] = g;

    gCountries.querySelectorAll('.on').forEach(p => p.classList.remove('on'));
    const path = featId && svg.querySelector(`#p-${CSS.escape(featId)}`);
    if (path) {
      path.classList.add('on');
      gCountries.appendChild(path);          // 隣国の線に隠れないよう最前面へ
    }

    const mx = px(lon), my = py(lat);
    mk = { x: mx, y: my };
    marker.style.opacity = 1;
    marker2.style.opacity = 0;               // Stage2の地点はまだ未確定



    // 本土の大きさに応じたズーム倍率（小国ほど寄る）。代表点を中心に据える
    // 地図に描かれない微小国は、周りの島や大陸が見える程度に引いて表示する
    const wide = featId ? Math.max(bw / 360 * W, bh / 180 * H * (VIEW.w / VIEW.h)) * 1.8 : 220;
    const w = Math.min(VIEW.w, Math.max(70, wide));
    const h = w * (VIEW.h / VIEW.w);
    // 端の島国でもマーカーが中央に来るよう、経度方向は画面外まではみ出させる
    tweenView([
      Math.min(Math.max(mx - w / 2, -w / 2), W - w / 2),
      Math.min(Math.max(my - h / 2, VIEW.y), VIEW.y + VIEW.h - h),
      w, h,
    ]);
  }

  function reset() {
    marker2.style.opacity = 0;
    tweenView([VIEW.x, VIEW.y, VIEW.w, VIEW.h], 700);
  }

  // Stage2: 抽選された地点(経度,緯度)へさらにズームインする
  function focusPoint(lon, lat, zoomDeg = 4) {
    mk2 = { x: px(lon), y: py(lat) };
    marker2.style.opacity = 1;

    // 日付変更線をまたぐ国（ロシア極東・フィジー等）は、島や飛び地ごとに
    // リングが分かれて描画されるため、ハイライト中パスの getBBox() が
    // 地図全幅近くまで広がることがある（実際の陸地は断片的なのに、外接矩形
    // だけは連続した巨大な範囲に見えてしまう）。この状態で狭くズームすると
    // 断片間の何もない海域に当たる恐れがあるため、そのときはタイトな
    // ズームを諦めて今の表示範囲のままマーカーだけ置く。
    const on = gCountries.querySelector('.on');
    const fragmented = on && on.getBBox().width > W * 0.5;
    if (fragmented) {
      placeMarker(Number(svg.getAttribute('viewBox').split(' ')[2]));
      return;
    }

    const w = Math.min(VIEW.w, zoomDeg / 360 * W);
    const h = w * (VIEW.h / VIEW.w);
    tweenView([
      Math.min(Math.max(mk2.x - w / 2, -w / 2), W - w / 2),
      Math.min(Math.max(mk2.y - h / 2, VIEW.y), VIEW.y + VIEW.h - h),
      w, h,
    ], 700);
  }

  function resetPoint() {
    marker2.style.opacity = 0;
  }

  // ルーレット演出中：ズームせず点滅だけ切り替える
  function blink(iso2) {
    const g = GEO_INDEX[iso2];
    gCountries.querySelectorAll('.on').forEach(p => p.classList.remove('on'));
    if (!g || !g[0]) { marker.style.opacity = 0; return; }
    const path = svg.querySelector(`#p-${CSS.escape(g[0])}`);
    if (path) { path.classList.add('on'); gCountries.appendChild(path); }
    mk = { x: px(g[1]), y: py(g[2]) };
    placeMarker(Number(svg.getAttribute('viewBox').split(' ')[2]));
    marker.style.opacity = 1;
  }

  return { init, focus, reset, blink, focusPoint, resetPoint };
})();

