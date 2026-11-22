/* ============================================================
 * chart.js — 权益曲线 Canvas 渲染（5 档 Y 轴、自适应 X 轴、点击/拖动读数）
 * 依赖 core.js（cssVar / $ / 共享状态）
 * ============================================================ */

let chartGeom = null;   // 最近一次绘制的坐标几何，供 app.js 的指针换算复用

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawCurve(points, hover = -1){
  const cv = $('curve'), ctx = cv.getContext('2d');
  const w = cv.clientWidth, h = cv.clientHeight;
  if(!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if(!points || points.length < 2) return;

  const cGrid = cssVar('--grid-line'), cAxis = cssVar('--axis'), cAxis2 = cssVar('--axis-2');
  const cCurveUp = cssVar('--curve-up'), cCurveDown = cssVar('--curve-down');
  const cCurveAccent = cssVar('--curve-accent'), cCurveGold = cssVar('--curve-gold');
  const cHalo = cssVar('--panel-top'), cHover = cssVar('--hover-line');
  const cTipBg = cssVar('--tip-bg'), cTipBorder = cssVar('--tip-border'), cTipText = cssVar('--tip-text');
  const fillAlpha = parseFloat(cssVar('--curve-fill-a')) || 0.22;

  const narrow = w < 520;
  const padR = 10, padT = 14, padB = narrow ? 24 : 28;
  const rv = points.map(p => p.v ?? 0);
  const ev = points.map(p => p.eq ?? p.v ?? 0);
  const bv = points.map(p => p.base ?? baseline);
  const all = rv.concat(ev, bv);
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max((hi - lo) * 0.12, 1);
  lo -= pad; hi += pad;

  // —— Y 轴：固定 5 档，金额与看板同口径；标签宽度反推左边距 ——
  const yTicks = 5;
  const kDigits = (hi - lo) < 20 ? 4 : ((hi - lo) < 200 ? 3 : 2);
  const yTexts = [];
  for(let k = 0; k < yTicks; k++){
    const v = hi - k * (hi - lo) / (yTicks - 1);
    const av = Math.abs(v);
    yTexts.push((v < 0 ? '−$' : '$') + (av >= 1000 ? (av / 1000).toFixed(kDigits) + 'k'
                                                     : av.toFixed(2)));
  }
  ctx.font = `${narrow ? 9 : 10}px "JetBrains Mono", Consolas, "SFMono-Regular", monospace`;
  const maxLabelW = Math.max(...yTexts.map(t => ctx.measureText(t).width));
  const padL = Math.ceil(maxLabelW) + 14;
  const pw = w - padL - padR, ph = h - padT - padB;
  if(pw <= 20 || ph <= 20) return;

  const px = i => padL + i * pw / (points.length - 1);
  const py = v => padT + (hi - v) / (hi - lo) * ph;
  const last = points.length - 1;
  chartGeom = {padL, padR, padT, padB, pw, ph, w, h, n:points.length};

  // —— X 轴刻度：按可用宽度决定档数，标签互相避让 ——
  const tOf = p => (p && p.t) ? p.t : '';
  const firstDate = tOf(points[0]).slice(0, 10);
  let lastDate = firstDate;
  for(let i = last; i >= 0; i--){
    const t = tOf(points[i]);
    if(t && t !== '现在' && t.length >= 10){ lastDate = t.slice(0, 10); break; }
  }
  const multiDay = firstDate !== lastDate;
  const fmtTick = (i, long) => {
    const t = tOf(points[i]);
    if(!t || t === '现在') return t || '';
    const d = t.slice(5, 10), hm = t.slice(11, 16);
    if(multiDay) return long ? `${d} ${hm}` : d;
    return long ? `${d} ${hm}` : hm;
  };
  const minGap = narrow ? 76 : 108;
  const tickN = Math.max(2, Math.min(6, Math.floor(pw / minGap) + 1));
  const tickIdx = [];
  for(let j = 0; j < tickN; j++){
    const i = Math.round(j * last / (tickN - 1));
    if(!tickIdx.includes(i)) tickIdx.push(i);
  }

  // —— 网格：横向 5 档 + 纵向刻度 ——
  ctx.strokeStyle = cGrid; ctx.lineWidth = 1;
  for(let k = 0; k < yTicks; k++){
    const y = padT + k * ph / (yTicks - 1);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }
  tickIdx.forEach(i => {
    const x = px(i);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
  });

  // —— Y 轴标签 ——
  ctx.font = `${narrow ? 9 : 10}px "JetBrains Mono", Consolas, "SFMono-Regular", monospace`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = cAxis;
  for(let k = 0; k < yTicks; k++){
    const y = padT + k * ph / (yTicks - 1);
    ctx.fillText(yTexts[k], padL - 7, y);
  }

  // —— X 轴标签：先放首尾，再放中间，重叠则跳过 ——
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = cAxis2;
  const drawn = [], seen = new Set();
  const fits = (l, r) => {
    if(l < padL - 1 || r > w - padR + 1) return false;
    return !drawn.some(d => l < d.r + 10 && r > d.l - 10);
  };
  const place = (i, align, long) => {
    const text = fmtTick(i, long);
    if(!text || seen.has(text)) return;
    const tw = ctx.measureText(text).width;
    const x = px(i);
    let l, r;
    if(align === 'left'){ l = x; r = x + tw; }
    else if(align === 'right'){ l = x - tw; r = x; }
    else { l = x - tw / 2; r = x + tw / 2; }
    if(!fits(l, r)) return;
    ctx.textAlign = align;
    ctx.fillText(text, x, h - 7);
    drawn.push({l, r});
    seen.add(text);
  };
  place(0, 'left', true);
  place(last, 'right', true);
  tickIdx.forEach(i => { if(i !== 0 && i !== last) place(i, 'center', !narrow); });

  // —— 主权益线渐变填充 ——
  const baseNow = bv[last];
  const rising = ev[last] >= baseNow;
  const line = rising ? cCurveUp : cCurveDown;
  const dot = rising ? cssVar('--dot-up') : cssVar('--dot-down');
  const rgb = rising ? cssVar('--up-rgb') : cssVar('--down-rgb');

  const grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
  grad.addColorStop(0, `rgba(${rgb},${fillAlpha})`); grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath(); ctx.moveTo(px(0), padT + ph);
  rv.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.lineTo(px(last), padT + ph); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // —— 账户权益虚线（含浮动）——
  ctx.setLineDash([6, 3]); ctx.strokeStyle = cCurveAccent; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ev.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.stroke(); ctx.setLineDash([]);

  // —— 主权益线：底色描边 + 主线 ——
  ctx.beginPath();
  rv.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cHalo; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = line; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.lineJoin = 'miter';

  // —— 入金基线：终于最上层，避免被遮挡 ——
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); bv.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.strokeStyle = cHalo; ctx.lineWidth = 5.4; ctx.stroke();
  ctx.strokeStyle = cCurveGold; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.setLineDash([]);
  const baseLabel = '入金 ' + moneyAbs(baseNow);
  const blw = ctx.measureText(baseLabel).width + 10;
  const blx = Math.max(padL + 2, Math.min(w - padR - blw, padL + 4));
  const bly = Math.max(padT, Math.min(py(baseNow) - 18, padT + ph - 16));
  ctx.fillStyle = cTipBg; roundRect(ctx, blx, bly, blw, 15, 2); ctx.fill();
  ctx.fillStyle = cCurveGold; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(baseLabel, blx + 5, bly + 8);
  ctx.textBaseline = 'alphabetic';

  // —— 末端点 ——
  ctx.beginPath(); ctx.arc(px(last), py(ev[last]), 3.6, 0, Math.PI * 2);
  ctx.fillStyle = dot; ctx.fill();
  const ln1 = document.querySelector('.curve-legend .ln1');
  if(ln1) ln1.style.borderColor = line;

  // —— 读数提示：限制在画布内，不越出视口 ——
  if(hover >= 0 && hover < points.length){
    const x = px(hover), y = py(ev[hover]);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = cHover; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill();

    const label = tOf(points[hover]) || '';
    const rText = '已实现 ' + money(rv[hover]);
    const eText = '账户   ' + moneyAbs(ev[hover]);
    ctx.font = `${narrow ? 10 : 11}px "JetBrains Mono", Consolas, "SFMono-Regular", monospace`;
    const bw = Math.min(Math.max(ctx.measureText(label).width, ctx.measureText(rText).width,
      ctx.measureText(eText).width) + 18, w - 8);
    const bh = narrow ? 52 : 56;
    let bx = x + 12;
    if(bx + bw > w - 4) bx = x - bw - 12;
    bx = Math.max(4, Math.min(bx, w - bw - 4));
    let by = y - bh - 10;
    if(by < 4) by = y + 12;
    by = Math.max(4, Math.min(by, h - bh - 4));

    ctx.fillStyle = cTipBg; ctx.strokeStyle = cTipBorder; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = cTipText; ctx.fillText(label, bx + 9, by + (narrow ? 10 : 12));
    ctx.fillStyle = line; ctx.fillText(rText, bx + 9, by + (narrow ? 24 : 28));
    ctx.fillStyle = cCurveAccent; ctx.fillText(eText, bx + 9, by + (narrow ? 38 : 44));
    ctx.textBaseline = 'alphabetic';
  }
}
