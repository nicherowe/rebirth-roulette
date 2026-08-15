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

  let svg, gCountries, marker, marker2, gLabels, anim = null;
  let mk = { x: 0, y: 0 };                 // 国代表点マーカーの位置（地図座標）
  let mk2 = { x: 0, y: 0 };                // Stage2: 実際に抽選された地点のマーカー位置

  const escapeXml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ズームしてもマーカー・ラベルの見た目の大きさが変わらないよう縮尺の逆数をかける
  function placeMarker(viewW) {
    const k = viewW / VIEW.w;
    marker.setAttribute('transform', `translate(${mk.x},${mk.y}) scale(${k})`);
    if (marker2) marker2.setAttribute('transform', `translate(${mk2.x},${mk2.y}) scale(${k})`);
    if (gLabels) gLabels.querySelectorAll('text').forEach(t => {
      t.setAttribute('transform', `translate(${t.dataset.x},${t.dataset.y}) scale(${k})`);
    });
  }

  // Stage2で抽選された地点の近くにある地名をラベルとして描画する
  function renderLabels(items) {   // items: [{lon,lat,name,main}]
    gLabels.innerHTML = items.map(it => {
      const x = px(it.lon), y = py(it.lat);
      return `<text class="${it.main ? 'lbl-main' : 'lbl'}" data-x="${x}" data-y="${y}" dy="-9">${escapeXml(it.name)}</text>`;
    }).join('');
    placeMarker(Number(svg.getAttribute('viewBox').split(' ')[2]));
  }
  function clearLabels() { if (gLabels) gLabels.innerHTML = ''; }

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
      </g>
      <g class="labels"></g>`;
    gCountries = svg.querySelector('.countries');
    marker = svg.querySelector('.marker');
    marker2 = svg.querySelector('.marker2');
    gLabels = svg.querySelector('.labels');
    initInteraction();
  }

  // ---- ユーザー操作によるパン・ズーム（ホイール／ドラッグ／ピンチ） ----
  const MIN_W = 12;                          // これ以上はズームインしない（地図座標px）
  const pointers = new Map();                // pointerId -> {x,y}（ピンチ判定用）
  let dragLast = null;                       // 直近のドラッグ位置（地図座標）

  function getView() {
    return svg.getAttribute('viewBox').split(' ').map(Number);
  }
  function setView(v) {
    svg.setAttribute('viewBox', v.join(' '));
    placeMarker(v[2]);
  }
  function clampView([x, y, w, h]) {
    w = Math.min(VIEW.w, Math.max(MIN_W, w));
    h = w * (VIEW.h / VIEW.w);
    x = Math.min(W - w / 2, Math.max(-w / 2, x));
    y = Math.min(VIEW.y + VIEW.h - h, Math.max(VIEW.y, y));
    return [x, y, w, h];
  }
  function toMapPoint(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const [x, y, w, h] = getView();
    return [x + (clientX - r.left) / r.width * w, y + (clientY - r.top) / r.height * h];
  }
  function zoomAt(clientX, clientY, factor) {
    clearTimeout(anim);
    const [mx, my] = toMapPoint(clientX, clientY);
    const [x, y, w, h] = getView();
    const nw = w * factor;
    setView(clampView([mx - (mx - x) * (nw / w), my - (my - y) * (nw / w), nw, nw]));
  }

  function initInteraction() {
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { dragLast = toMapPoint(e.clientX, e.clientY); clearTimeout(anim); }
      svg.classList.add('dragging');
    });

    svg.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      clearTimeout(anim);
      if (pointers.size === 1) {
        const [mx, my] = toMapPoint(e.clientX, e.clientY);
        const [x, y, w, h] = getView();
        setView(clampView([x - (mx - dragLast[0]), y - (my - dragLast[1]), w, h]));
        dragLast = toMapPoint(e.clientX, e.clientY);
      } else if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
        if (svg._pinchDist) zoomAt(midX, midY, svg._pinchDist / dist);
        svg._pinchDist = dist;
      }
    });

    const endPointer = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) svg._pinchDist = null;
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        dragLast = toMapPoint(p.x, p.y);
      }
      if (pointers.size === 0) svg.classList.remove('dragging');
    };
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);
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
    clearLabels();

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
    clearLabels();
    tweenView([VIEW.x, VIEW.y, VIEW.w, VIEW.h], 700);
  }

  // Stage2: 抽選された地点(経度,緯度)へさらにズームインし、近くの地名をラベル表示する
  // places: [[lon,lat,name], ...]（当選国のGeoNamesデータ）、mainName: 結果カードに表示中の地名
  function focusPoint(lon, lat, places = [], mainName = null, zoomDeg = 4) {
    mk2 = { x: px(lon), y: py(lat) };
    marker2.style.opacity = 1;

    // 日付変更線をまたぐ国（ロシア極東・フィジー等）は、島や飛び地ごとに
    // リングが分かれて描画されるため、ハイライト中パスの getBBox() が
    // 地図全幅近くまで広がることがある（実際の陸地は断片的なのに、外接矩形
    // だけは連続した巨大な範囲に見えてしまう）。この状態で狭くズームすると
    // 断片間の何もない海域に当たる恐れがあるため、そのときはタイトな
    // ズームを諦めて今の表示範囲のままマーカーだけ置く（ラベルも省略）。
    const on = gCountries.querySelector('.on');
    const fragmented = on && on.getBBox().width > W * 0.5;
    if (fragmented) {
      clearLabels();
      placeMarker(Number(svg.getAttribute('viewBox').split(' ')[2]));
      return;
    }

    const w = Math.min(VIEW.w, zoomDeg / 360 * W);
    const h = w * (VIEW.h / VIEW.w);
    const tx = Math.min(Math.max(mk2.x - w / 2, -w / 2), W - w / 2);
    const ty = Math.min(Math.max(mk2.y - h / 2, VIEW.y), VIEW.y + VIEW.h - h);

    // ズーム後に画面に収まる範囲の地名を、地点に近い順の候補にする
    // （places の lon/lat は度単位、tx/ty/w/h は地図座標(px)単位なので変換して比較する）
    const candidates = places
      .map(p => ({ lon: p[0], lat: p[1], name: p[2], mx: px(p[0]), my: py(p[1]) }))
      .filter(it => it.mx >= tx - w * 0.06 && it.mx <= tx + w * 1.06 && it.my >= ty - h * 0.06 && it.my <= ty + h * 1.06)
      .map(it => ({ ...it, d: (it.mx - mk2.x) ** 2 + (it.my - mk2.y) ** 2 }))
      .sort((a, b) => a.d - b.d);

    // ラベル同士が重ならないよう、既に選んだラベルから一定距離(ズーム幅の16%)
    // 離れているものだけを近い順に最大5件採用する（近すぎる密集地名は間引く）
    const minSep = w * 0.16;
    const items = [];
    for (const c of candidates) {
      if (items.length >= 5) break;
      if (items.every(it => Math.hypot(it.mx - c.mx, it.my - c.my) >= minSep)) items.push(c);
    }
    items.forEach(it => it.main = it.name === mainName);
    renderLabels(items);

    tweenView([tx, ty, w, h], 700);
  }

  function resetPoint() {
    marker2.style.opacity = 0;
    clearLabels();
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

