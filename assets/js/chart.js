/* ============================================================
 * chart.js — 权益曲线 Canvas 渲染（含悬停提示）
 * 依赖 core.js（cssVar / $ / 共享状态）
 * ============================================================ */

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

  const padL = w < 480 ? 48 : 58, padR = 12, padT = 12, padB = 26;
  const pw = w - padL - padR, ph = h - padT - padB;
  const rv = points.map(p => p.v ?? 0);
  const ev = points.map(p => p.eq ?? p.v ?? 0);
  const bv = points.map(p => p.base ?? baseline);
  const all = rv.concat(ev, bv);
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max((hi - lo) * 0.12, 1);
  lo -= pad; hi += pad;
  const px = i => padL + i * pw / (points.length - 1);
  const py = v => padT + (hi - v) / (hi - lo) * ph;
  const last = points.length - 1;
  const baseNow = bv[last];
  const rising = ev[last] >= baseNow;
  const line = rising ? cCurveUp : cCurveDown;
  const dot = rising ? cssVar('--dot-up') : cssVar('--dot-down');
  const rgb = rising ? cssVar('--up-rgb') : cssVar('--down-rgb');

  // Y 轴刻度 + 网格
  ctx.font = '10px Consolas, "SFMono-Regular", monospace';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  [0, 0.5, 1].forEach(k => {
    const y = padT + k * ph;
    ctx.strokeStyle = cGrid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = cAxis;
    ctx.fillText('$' + Math.round(hi - k * (hi - lo)).toLocaleString('en-US'), padL - 7, y);
  });
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = cAxis2; ctx.fillText(points[0].t, padL, h - 7);
  ctx.textAlign = 'right'; ctx.fillText(points[last].t, w - padR, h - 7);

  // 主权益线渐变填充
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
  grad.addColorStop(0, `rgba(${rgb},${fillAlpha})`); grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath(); ctx.moveTo(px(0), padT + ph);
  rv.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.lineTo(px(last), padT + ph); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // 账户权益虚线（含浮动）——先画，避免盖住主线
  ctx.setLineDash([6, 3]); ctx.strokeStyle = cCurveAccent; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ev.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.stroke(); ctx.setLineDash([]);

  // 主权益线：底色描边 + 主线（浅色模式下拉开对比）
  ctx.beginPath();
  rv.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cHalo; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = line; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.lineJoin = 'miter';

  // 入金基线最后绘制：底色描边 + 加粗金色虚线，确保不被任何曲线遮挡
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); bv.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.strokeStyle = cHalo; ctx.lineWidth = 5.4; ctx.stroke();
  ctx.strokeStyle = cCurveGold; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.setLineDash([]);
  const baseLabel = '入金 $' + Math.round(baseNow).toLocaleString('en-US');
  const blw = ctx.measureText(baseLabel).width + 10;
  const blx = Math.max(padL + 2, Math.min(w - padR - blw, padL + 4));
  const bly = Math.max(padT, py(baseNow) - 18);
  ctx.fillStyle = cTipBg; roundRect(ctx, blx, bly, blw, 15, 4); ctx.fill();
  ctx.fillStyle = cCurveGold; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(baseLabel, blx + 5, bly + 8);
  ctx.textBaseline = 'alphabetic';

  // 末端点
  ctx.beginPath(); ctx.arc(px(last), py(ev[last]), 3.6, 0, Math.PI * 2);
  ctx.fillStyle = dot; ctx.fill();
  const ln1 = document.querySelector('.curve-legend .ln1');
  if(ln1) ln1.style.borderColor = line;

  // 悬停提示
  if(hover >= 0 && hover < points.length){
    const x = px(hover), y = py(ev[hover]);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = cHover; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill();
    const label = points[hover].t;
    const rText = '已实现 $' + rv[hover].toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    const eText = '账户   $' + ev[hover].toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    ctx.font = '11px Consolas, "SFMono-Regular", monospace';
    const bw = Math.max(ctx.measureText(label).width, ctx.measureText(rText).width, ctx.measureText(eText).width) + 18;
    const bh = 56;
    let bx = x + 10; if(bx + bw > w - padR) bx = x - bw - 10;
    let by = y - bh - 8; if(by < padT) by = y + 10;
    ctx.fillStyle = cTipBg; ctx.strokeStyle = cTipBorder; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 7); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = cTipText; ctx.fillText(label, bx + 9, by + 12);
    ctx.fillStyle = line; ctx.fillText(rText, bx + 9, by + 28);
    ctx.fillStyle = cCurveAccent; ctx.fillText(eText, bx + 9, by + 44);
  }
}
