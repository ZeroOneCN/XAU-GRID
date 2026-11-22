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
  const cCurveAccent = cssVar('--curve-accent');
  const cHalo = cssVar('--panel-top'), cHover = cssVar('--hover-line');
  const cTipBg = cssVar('--tip-bg'), cTipBorder = cssVar('--tip-border'), cTipText = cssVar('--tip-text');
  const fillAlpha = parseFloat(cssVar('--curve-fill-a')) || 0.22;

  const narrow = w < 520;
  const padR = 10, padT = 16, padB = narrow ? 30 : 32;
  // 主曲线口径：权益 − 该时刻累计净入金（剔除出入金，只反映交易盈亏）
  const adj = points.map(p => (p.adj != null) ? p.adj
    : ((p.eq ?? p.v ?? 0) - (p.base ?? 0)));
  const raw = points.map(p => p.eq ?? p.v ?? 0);
  // 始终把 0 纳入范围，让盈亏零轴始终可读
  let lo = Math.min(Math.min(...adj), 0), hi = Math.max(Math.max(...adj), 0);
  const pad = Math.max((hi - lo) * 0.12, 1);
  lo -= pad; hi += pad;

  // —— Y 轴：固定 5 档，完整金额（不缩写）；标签宽度反推左边距 ——
  const yTicks = 5;
  const fmtY = v => (v < 0 ? '−$' : '$')
    + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  const yTexts = [];
  for(let k = 0; k < yTicks; k++){
    yTexts.push(fmtY(hi - k * (hi - lo) / (yTicks - 1)));
  }
  ctx.font = `13px "JetBrains Mono", Consolas, "SFMono-Regular", monospace`;
  const maxLabelW = Math.max(...yTexts.map(t => ctx.measureText(t).width));
  const padL = Math.ceil(maxLabelW) + 16;
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
  const minGap = narrow ? 88 : 118;
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
  ctx.font = `13px "JetBrains Mono", Consolas, "SFMono-Regular", monospace`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = cAxis;
  for(let k = 0; k < yTicks; k++){
    const y = padT + k * ph / (yTicks - 1);
    ctx.fillText(yTexts[k], padL - 8, y);
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

  // —— 零轴：盈亏分界的参考线 ——
  const y0 = py(0);
  if(y0 >= padT && y0 <= padT + ph){
    ctx.setLineDash([4, 4]); ctx.strokeStyle = cAxis2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(w - padR, y0); ctx.stroke();
    ctx.setLineDash([]);
  }

  // —— 主曲线渐变填充（按整体方向取色，保持低透明度不抢线） ——
  const rising = adj[last] >= adj[0];
  const rgb = rising ? cssVar('--up-rgb') : cssVar('--down-rgb');

  const grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
  grad.addColorStop(0, `rgba(${rgb},${fillAlpha})`); grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath(); ctx.moveTo(px(0), padT + ph);
  adj.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.lineTo(px(last), padT + ph); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // —— 主线底色描边（一次画完整条，保证转折处平滑衔接） ——
  ctx.beginPath();
  adj.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = cHalo; ctx.lineWidth = 4.4; ctx.stroke();

  // —— 按斜率正负分段着色：上涨绿、下跌红，拐点即为数据点 ——
  for(let i = 1; i <= last; i++){
    ctx.beginPath();
    ctx.moveTo(px(i - 1), py(adj[i - 1]));
    ctx.lineTo(px(i), py(adj[i]));
    ctx.strokeStyle = adj[i] >= adj[i - 1] ? cCurveUp : cCurveDown;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';

  // —— 末端点：取最后一段的方向色 ——
  const lastColor = last > 0 ? (adj[last] >= adj[last - 1] ? cCurveUp : cCurveDown) : cCurveAccent;
  const dot = last > 0 ? (adj[last] >= adj[last - 1] ? cssVar('--dot-up') : cssVar('--dot-down')) : cssVar('--curve-accent');
  ctx.beginPath(); ctx.arc(px(last), py(adj[last]), 3.6, 0, Math.PI * 2);
  ctx.fillStyle = dot; ctx.fill();

  // —— 读数提示：限制在画布内，不越出视口 ——
  if(hover >= 0 && hover < points.length){
    const x = px(hover), y = py(adj[hover]);
    const segColor = hover > 0
      ? (adj[hover] >= adj[hover - 1] ? cCurveUp : cCurveDown)
      : lastColor;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = cHover; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fillStyle = segColor; ctx.fill();

    const label = tOf(points[hover]) || '';
    const rText = '交易权益 ' + money(adj[hover]);
    const eText = '原始权益 ' + moneyAbs(raw[hover]);
    ctx.font = `13px "JetBrains Mono", Consolas, "SFMono-Regular", monospace`;
    const bw = Math.min(Math.max(ctx.measureText(label).width, ctx.measureText(rText).width,
      ctx.measureText(eText).width) + 20, w - 8);
    const bh = 68;
    let bx = x + 12;
    if(bx + bw > w - 4) bx = x - bw - 12;
    bx = Math.max(4, Math.min(bx, w - bw - 4));
    let by = y - bh - 10;
    if(by < 4) by = y + 12;
    by = Math.max(4, Math.min(by, h - bh - 4));

    ctx.fillStyle = cTipBg; ctx.strokeStyle = cTipBorder; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = cTipText; ctx.fillText(label, bx + 10, by + 15);
    ctx.fillStyle = segColor; ctx.fillText(rText, bx + 10, by + 34);
    ctx.fillStyle = cCurveAccent; ctx.fillText(eText, bx + 10, by + 53);
    ctx.textBaseline = 'alphabetic';
  }
}
