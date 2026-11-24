/* ============================================================
 * app.js — 主程序：数据渲染、轮询、事件绑定
 * 依赖 core.js / chart.js / calendar.js
 * ============================================================ */

/* 时区标签：off 为相对 UTC 的小时数（8 → (UTC+8)，5.5 → (UTC+5:30)） */
function tzTag(off){
  if(off == null || !isFinite(off)) return '';
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const h = Math.floor(abs + 1e-6);
  const m = Math.round((abs - h) * 60);
  return `(UTC${sign}${h}${m ? ':' + pad2(m) : ''})`;
}
/* 浏览器本机时区偏移（小时） */
const LOCAL_TZ = -new Date().getTimezoneOffset() / 60;
/* 当前数据的 MT5 服务器时区偏移，接口未提供时为 null */
let serverTz = null;

function render(d){
  period = d.refresh_ms || 2000;
  const live = d.mode === 'live', cached = d.mode === 'cached';
  const modeText = live ? 'LIVE · MT5 已连接' : (cached ? 'CACHED · 离线快照' : 'DEMO · 演示数据');
  const dotClass = live ? '' : 'demo';
  serverTz = (typeof d.server_tz_offset === 'number' && isFinite(d.server_tz_offset))
    ? d.server_tz_offset : null;
  const srvTz = tzTag(serverTz), localTz = tzTag(LOCAL_TZ);
  $('modeChip').innerHTML = `<i class="dot ${dotClass}"></i><span id="modeText">${modeText}</span>`;
  $('login').textContent = d.account.login;
  $('priceBadge').textContent = `${d.summary.symbol} ${d.summary.price ? d.summary.price.toFixed(2) : '—'}`;
  if(STATIC){
    const ageMin = d.published_at
      ? Math.floor((Date.now() - new Date(d.published_at.replace(' ','T')).getTime()) / 60000) : 0;
    // 快照发布时间由发布机本地时钟生成，按本机时区标注；行情时间按 MT5 服务器时区标注
    $('hint').textContent = `云端快照 · MT5 数据 ${d.server_time || '—'} ${srvTz}`
      + (d.published_at ? ` · 发布 ${d.published_at.slice(0, 16)} ${localTz}` : '')
      + (ageMin > 15 ? ` · 已延迟 ${ageMin} 分钟` : '');
  }else{
    // 本地也标出 MT5 数据时间，和云端页脚保持同一套口径
    const dataTime = `${d.server_time || '—'} ${srvTz}`;
    $('hint').textContent = live ? `MT5 数据 ${dataTime} · 当前显示真实终端数据`
      : (cached ? `MT5 未连接，显示 ${d.cache_saved_at} ${localTz} 的缓存快照（${d.cache_age_seconds}秒前）`
                : `演示数据 · MT5 数据 ${dataTime}`);
  }

  setText('floating', money(d.summary.floating), cls(d.summary.floating));
  setText('realized', money(d.summary.history_realized ?? 0), cls(d.summary.history_realized ?? 0));
  setText('balValue', moneyAbs(d.account.balance), cls(d.account.balance));
  $('count').textContent = d.summary.positions;
  $('buyLots').textContent = d.summary.buy_lots.toFixed(2);
  $('sellLots').textContent = d.summary.sell_lots.toFixed(2);
  setText('net', d.summary.net_lots.toFixed(2), 'neutral');
  // 胜率：今日有平仓用今日口径，否则直接落到历史口径，不留占位杠
  const todayRate = d.summary.win_rate;
  const histRate = d.summary.history_win_rate;
  const useToday = todayRate != null && (d.summary.closed_today || 0) > 0;
  const rate = useToday ? todayRate : histRate;
  const rateN = useToday ? d.summary.closed_today : d.summary.history_closed;
  setText('win', rate == null ? '—' : rate.toFixed(1) + '%',
          rate == null ? 'neutral' : (rate >= 70 ? 'up' : 'neutral'));
  $('winNote').textContent = rate == null ? '暂无平仓' : `${useToday ? '今日' : '历史'} · ${rateN ?? 0} 笔`;

  const rows = d.positions.map(p => `<tr>
      <td class="ticket hide-mobile">#${p.ticket}</td>
      <td><span class="side ${p.type === 'BUY' ? 'buy' : 'sell'}">${p.type}</span></td>
      <td>${p.lots.toFixed(2)}</td>
      <td class="hide-mobile">${p.price_open.toFixed(2)}</td>
      <td class="hide-mobile">${p.price_now.toFixed(2)}</td>
      <td class="${cls(p.pips)}">${p.pips > 0 ? '+' : ''}${p.pips.toFixed(1)}</td>
      <td class="money ${cls(p.profit)}">${money(p.profit)}</td>
      <td class="hide-mobile" style="color:var(--duration)">${p.minutes < 60 ? p.minutes + 'm' : Math.floor(p.minutes / 60) + 'h' + (p.minutes % 60) + 'm'}</td>
    </tr>`).join('');
  $('positions').innerHTML = rows || '<tr><td colspan="8" style="text-align:center;color:var(--muted-2);padding:30px">当前无持仓</td></tr>';
  $('tableTag').textContent = `OPEN POSITIONS · ${d.summary.positions}`;

  setText('sEquity', moneyAbs(d.account.equity), cls(d.account.equity));
  setText('sMargin', moneyAbs(d.account.margin), 'neutral');
  $('sLevel').textContent = d.account.margin_level.toFixed(0) + '%';
  $('sSource').textContent = live ? 'MT5 终端' : (cached ? '离线缓存' : '演示模拟器');

  $('curveTag').textContent = live ? `剔除出入金 · ${d.summary.curve_deals || 0} 笔` : '交易权益 · 剔除出入金';
  // 图例里的入金基线取末点的累计净入金，随账户出入金自动更新
  const lastPt = (d.equity_curve || []).slice(-1)[0];
  $('baseNote').textContent = (lastPt && lastPt.base != null)
    ? `入金基线 · ${moneyAbs(lastPt.base)}`
    : '入金基线 · 已剔除出入金';
  lastCurve = d.equity_curve || [];
  if(hoverIdx >= lastCurve.length) hoverIdx = -1;
  const firstT = lastCurve.length ? lastCurve[0].t : '—';
  $('chartNote').innerHTML = `<span>${rangeLabels[currentRange]} · 剔除出入金 · ${firstT} → 现在</span><span>更新 ${(d.server_time || '').slice(11)} ${srvTz}</span>`;
  $('chartNote').title = `数据更新时间 ${d.server_time} ${srvTz}`;
  drawCurve(lastCurve, hoverIdx);
  dailyMap = Object.fromEntries((d.daily_pnl || []).map(x => [x.d, x.v]));
  // 收益日历按 MT5 服务器日期翻月/高亮，避免本机时区在零点附近差一天
  serverToday = (d.server_time || '').slice(0, 10) || null;
  serverClock = d.server_time || null;
  serverClockAt = Date.now();
  renderCalendar();
  start = Date.now();
}

async function loadDeals(page){
  if(dealsState.loading) return;
  dealsState.loading = true;
  dealsState.lastFetch = Date.now();
  try{
    const target = page || dealsState.page;
    let j;
    if(STATIC){
      if(!dealsState.all){
        const r = await fetch('deals.json', {cache:'no-store'});
        const all = await r.json();
        dealsState.all = all.deals || [];
        dealsState.mode = all.mode || 'live';
      }
      const size = dealsState.size;
      const total = dealsState.all.length;
      const pages = Math.max(1, Math.ceil(total / size));
      const p = Math.min(Math.max(1, target), pages);
      j = {page:p, pages, total, mode:dealsState.mode, deals:dealsState.all.slice((p-1)*size, p*size)};
    }else{
      const r = await fetch(`/api/deals?page=${target}&size=${dealsState.size}`, {cache:'no-store'});
      j = await r.json();
    }
    dealsState.page = j.page; dealsState.pages = j.pages; dealsState.total = j.total;
    $('dealsTag').textContent = `${j.total} DEALS · ${j.mode.toUpperCase()}`;
    $('dealPage').textContent = `${j.page} / ${j.pages}`;
    $('dealPrev').disabled = j.page <= 1;
    $('dealNext').disabled = j.page >= j.pages;
    $('deals').innerHTML = j.deals.length ? j.deals.map(x => `<tr>
        <td>${x.time || '—'}</td>
        <td class="ticket hide-mobile">#${x.ticket}</td>
        <td class="hide-narrow ta-l" style="color:var(--symbol)">${x.symbol}</td>
        <td><span class="side ${x.type === 'BUY' ? 'buy' : 'sell'}">${x.type}</span></td>
        <td class="hide-mobile">${(x.lots || 0).toFixed(2)}</td>
        <td class="money ${cls(x.profit)}">${money(x.profit)}</td>
      </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--muted-2);padding:24px">暂无平仓记录</td></tr>';
  }catch(e){
    $('deals').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--down);padding:24px">历史加载失败，重试中…</td></tr>';
  }finally{
    dealsState.loading = false;
  }
}

/* 出入金：仅展示 MT5 balance 类成交的真实聚合，无任何估算。
   平台在穿仓后补的 balance 记录（comment=D-NULL）既不是入金也不是策略盈亏，
   后端已从列表与入金基线里剔除，这里只把「排除了几笔」讲清楚。 */
function renderCashflow(c){
  setText('cfDeposits', moneyAbs(c.deposits || 0), 'neutral');
  setText('cfWithdrawals', moneyAbs(c.withdrawals || 0), 'neutral');
  setText('cfNet', money(c.net || 0), cls(c.net || 0));
  const exN = c.excluded_count || 0;
  $('cfCount').textContent = `${c.total || 0} 笔`;
  const tag = $('cashflowTag');
  tag.textContent = `BALANCE DEALS · ${(c.mode || '').toUpperCase()}`
    + (exN ? ` · 排除 ${exN} 笔平台补偿` : '');
  tag.title = exN
    ? `已排除 ${exN} 笔平台补偿（${(c.excluded_comments || []).join(', ')}）：`
      + `${moneyAbs(c.excluded_amount || 0)}，不计入出入金，也不计入策略盈亏`
    : '';
  const rows = (c.items || []).map(x => `<tr>
      <td>${x.time || '—'}</td>
      <td class="ticket ta-l hide-mobile">#${x.ticket || '—'}</td>
      <td class="ta-c"><span class="side ${x.type === 'DEPOSIT' ? 'buy' : 'sell'}">${x.type === 'DEPOSIT' ? '入金' : '出金'}</span></td>
      <td class="money ${cls(x.amount)}">${money(x.amount || 0)}</td>
    </tr>`).join('');
  $('cashflow').innerHTML = rows
    || '<tr><td colspan="4" class="empty">暂无出入金记录</td></tr>';
}

async function loadCashflow(){
  try{
    const r = await fetch(STATIC ? 'cashflow.json' : '/api/cashflow', {cache:'no-store'});
    renderCashflow(await r.json());
  }catch(e){
    // 读取失败时保留上一次结果，不覆盖为 0
  }
}

async function poll(){
  try{
    // 静态站每个区间各发布一份快照（snapshot_7/30/90.json），未生成时回退全量
    const url = STATIC
      ? (currentRange === 'all' ? 'snapshot.json' : `snapshot_${currentRange}.json`)
      : `/api/snapshot?range=${currentRange}`;
    let r = await fetch(url, {cache:'no-store'});
    if(!r.ok && STATIC && currentRange !== 'all') r = await fetch('snapshot.json', {cache:'no-store'});
    const d = await r.json();
    render(d);
    if(!dealsState.loading && Date.now() - dealsState.lastFetch > 10000) loadDeals();
  }catch(e){
    const mt = $('modeText');
    if(mt) mt.textContent = STATIC ? '快照读取失败，请检查部署' : '连接失败，重试中…';
  }
}

function tick(){
  if(serverClock){
    const t = new Date(serverClock.replace(' ', 'T'));
    if(!STATIC) t.setSeconds(t.getSeconds() + Math.max(0, Math.floor((Date.now() - serverClockAt) / 1000)));
    const day = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
    // 服务器时钟：时间来自 MT5 终端，按 MT5 服务器时区标注
    $('clock').textContent = 'MT5 ' + day + ' '
      + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds())
      + ' ' + tzTag(serverTz);
  }else{
    // 尚未取到数据时退回本机时钟，明确标注本机时区
    const t = new Date();
    const day = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
    $('clock').textContent = '本机 ' + day + ' '
      + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds())
      + ' ' + tzTag(LOCAL_TZ);
  }
  const pct = Math.min(100, (Date.now() - start) / period * 100);
  $('bar').style.width = pct + '%';
}

function curveHover(e){
  if(!lastCurve.length || !chartGeom) return;
  const cv = $('curve'), r = cv.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const x = clientX - r.left;
  const {padL, pw} = chartGeom;
  const i = Math.round((x - padL) / pw * (lastCurve.length - 1));
  hoverIdx = Math.max(0, Math.min(lastCurve.length - 1, i));
  drawCurve(lastCurve, hoverIdx);
}

/* 指标 / 表头说明气泡：固定定位，避免被滚动容器裁切 */
let helpBtn = null, helpTip = null, helpTries = 0;

function placeHelpTip(){
  if(!helpBtn || !helpTip || helpTip.hidden) return;
  const r = helpBtn.getBoundingClientRect();
  const below = helpBtn.dataset.place === 'below';
  const vw = document.documentElement.clientWidth;
  const w = helpTip.offsetWidth, h = helpTip.offsetHeight;
  let top;
  if(below){
    top = Math.min(r.bottom + 10, window.innerHeight - h - 8);
  }else{
    // 表头上方：空间不足时先把页面上移让出空间，保证气泡完整位于表头上方
    const th = helpBtn.closest('th');
    const anchorTop = th ? th.getBoundingClientRect().top : r.top;
    top = anchorTop - h - 10;
    if(top < 8 && helpTries < 2){
      helpTries++;
      window.scrollBy(0, top - 8);
      requestAnimationFrame(() => requestAnimationFrame(placeHelpTip));
      return;
    }
    top = Math.max(8, top);
  }
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
  helpTip.style.left = left + 'px';
  helpTip.style.top = top + 'px';
  helpTip.style.visibility = 'visible';
  // 渲染后按实际宽度再校正一次，保证窄屏留出边距、不贴边
  let rect = helpTip.getBoundingClientRect();
  if(rect.right > vw - 6 || rect.left < 6){
    helpTip.style.left = Math.max(8, Math.min(rect.left, vw - rect.width - 8)) + 'px';
    rect = helpTip.getBoundingClientRect();
  }
  const arrow = Math.max(10, Math.min(rect.width - 10, r.left + r.width / 2 - rect.left));
  helpTip.style.setProperty('--arrow-x', arrow + 'px');
}

function closeHelpTip(){
  if(helpTip){ helpTip.hidden = true; helpTip.style.visibility = ''; }
  if(helpBtn) helpBtn.setAttribute('aria-expanded', 'false');
  helpBtn = null; helpTip = null;
}

function toggleHelpTip(btn){
  const tip = document.getElementById(btn.dataset.help);
  if(!tip) return;
  if(helpBtn === btn && !tip.hidden){ closeHelpTip(); return; }
  closeHelpTip();
  helpBtn = btn; helpTip = tip; helpTries = 0;
  tip.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  // 内联说明（如保证金风险率）直接展开，不做浮层定位
  if(tip.classList.contains('risk-note')) return;
  tip.style.visibility = 'hidden';
  placeHelpTip();
}

function bindEvents(){
  $('dealPrev').onclick = () => loadDeals(dealsState.page - 1);
  $('dealNext').onclick = () => loadDeals(dealsState.page + 1);
  $('dealSize').onchange = e => { dealsState.size = Number(e.target.value); loadDeals(1); };
  $('calPrev').onclick = () => shiftMonth(-1);
  $('calNext').onclick = () => shiftMonth(1);
  $('reportBtn').onclick = () => { location.href = STATIC ? 'report.html' : '/report.html'; };
  // 本地走服务端实时截图；云端只能用发布机生成的静态图（dashboard.png）
  $('pngBtn').onclick = () => {
    if(STATIC){ window.open('dashboard.png', '_blank'); return; }
    location.href = '/api/export/png';
  };

  // 指标/表头说明：问号点击开关，点其他位置或 Esc 关闭
  document.querySelectorAll('.help-btn').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); toggleHelpTip(btn); };
  });
  document.querySelectorAll('.help-tip, .risk-note').forEach(tip => {
    tip.onclick = e => e.stopPropagation();
  });
  document.addEventListener('click', closeHelpTip);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeHelpTip(); });

  // 邀请码一键复制（静态云端页同样可用）
  $('icodeBtn').onclick = async () => {
    const code = 'p62earilg5', btn = $('icodeBtn');
    try{ await navigator.clipboard.writeText(code); }
    catch(e){
      const ta = document.createElement('textarea');
      ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); }catch(_){}
      ta.remove();
    }
    const ico = btn.querySelector('.ic-ico'), old = ico.textContent;
    btn.classList.add('copied'); ico.textContent = '✓';
    btn.querySelector('.ic-val').textContent = '已复制';
    setTimeout(() => { btn.classList.remove('copied'); ico.textContent = old; btn.querySelector('.ic-val').textContent = code; }, 1600);
  };

  document.querySelectorAll('#rangeBar button').forEach(btn => {
    btn.onclick = () => {
      currentRange = btn.dataset.range;
      document.querySelectorAll('#rangeBar button').forEach(b => b.classList.toggle('active', b === btn));
      hoverIdx = -1;
      poll();
    };
  });

  // 曲线读数：悬停 + 点击 + 拖动（触摸同样支持），指针几何由 chart.js 提供
  let dragging = false;
  const cv = $('curve');
  cv.addEventListener('pointerdown', e => {
    dragging = true;
    try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    curveHover(e);
  });
  cv.addEventListener('pointermove', e => {
    if(dragging || e.pointerType === 'mouse') curveHover(e);
  });
  const endDrag = e => {
    if(!dragging) return;
    dragging = false;
    try{ cv.releasePointerCapture(e.pointerId); }catch(_){}
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => {
    if(!dragging){ hoverIdx = -1; drawCurve(lastCurve, -1); }
  });
  let rzT = 0;
  window.addEventListener('resize', () => {
    const c = $('curve');
    if(c.clientWidth) drawCurve(lastCurve, hoverIdx);
    clearTimeout(rzT);
    rzT = setTimeout(renderCalendar, 160);
  });

  // 主题切换后重绘 Canvas 与日历（两者颜色都取自 CSS 变量）
  Theme.onChange(() => { drawCurve(lastCurve, hoverIdx); renderCalendar(); });
}

function init(){
  Theme.init();
  if(STATIC){
    // 云端没有 /api/export/png：按钮改为下载发布机生成的静态截图（见 publish.py）
    $('pngBtn').title = '下载看板 PNG（发布机当日快照）';
    // 区间切换：publish.py 为 7/30/90 各发布一份快照，按钮保持可用
  }
  bindEvents();
  setInterval(tick, 200); tick();
  poll(); loadDeals(1); loadCashflow();
  setInterval(poll, STATIC ? 30000 : 2000);
  setInterval(loadCashflow, 60000);
}

init();
