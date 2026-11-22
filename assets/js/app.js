/* ============================================================
 * app.js — 主程序：数据渲染、轮询、事件绑定
 * 依赖 core.js / chart.js / calendar.js
 * ============================================================ */

function render(d){
  period = d.refresh_ms || 2000;
  const live = d.mode === 'live', cached = d.mode === 'cached';
  const modeText = live ? 'LIVE · MT5 已连接' : (cached ? 'CACHED · 离线快照' : 'DEMO · 演示数据');
  const dotClass = live ? '' : 'demo';
  $('modeChip').innerHTML = `<i class="dot ${dotClass}"></i><span id="modeText">${modeText}</span>`;
  $('login').textContent = d.account.login;
  $('priceBadge').textContent = `${d.summary.symbol} ${d.summary.price ? d.summary.price.toFixed(2) : '—'}`;
  if(STATIC){
    const ageMin = d.published_at
      ? Math.floor((Date.now() - new Date(d.published_at.replace(' ','T')).getTime()) / 60000) : 0;
    $('hint').textContent = `云端快照 · 数据时间 ${d.server_time || d.published_at || '—'}`
      + (ageMin > 15 ? ` · 已延迟 ${ageMin} 分钟` : '');
  }else{
    $('hint').textContent = live ? '当前显示真实终端数据'
      : (cached ? `MT5 未连接，显示 ${d.cache_saved_at} 的缓存快照（${d.cache_age_seconds}秒前）`
                : 'MT5 与缓存均不可用，当前为演示数据');
  }

  setText('floating', money(d.summary.floating), cls(d.summary.floating));
  setText('realized', money(d.summary.today_realized), cls(d.summary.today_realized));
  $('equityLine').textContent = `入金基线 $${Number(d.baseline || 0).toFixed(2)}`;
  $('balValue').textContent = '$' + d.account.balance.toFixed(2);
  $('closedLine').textContent = `${d.summary.closed_today} 笔平仓`;
  $('count').textContent = d.summary.positions;
  $('lotLine').textContent = `多 ${d.summary.buy_lots.toFixed(2)} / 空 ${d.summary.sell_lots.toFixed(2)} 手`;
  setText('net', d.summary.net_lots.toFixed(2), 'neutral');
  $('expoLine').textContent = Math.abs(d.summary.net_lots) < 0.01 ? '双边完全对冲' : (d.summary.net_lots > 0 ? '偏多敞口' : '偏空敞口');
  setText('win', d.summary.win_rate == null ? '—' : d.summary.win_rate.toFixed(1) + '%',
          d.summary.win_rate == null ? 'neutral' : (d.summary.win_rate >= 70 ? 'up' : 'neutral'));
  $('marginLine').textContent = `保证金率 ${d.account.margin_level.toFixed(0)}%`;

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

  const total = d.summary.buy_lots + d.summary.sell_lots || 1;
  const bp = 100 * d.summary.buy_lots / total;
  $('buyBar').style.width = bp + '%'; $('sellBar').style.width = (100 - bp) + '%';
  $('buyLots').textContent = d.summary.buy_lots.toFixed(2) + ' 手';
  $('sellLots').textContent = d.summary.sell_lots.toFixed(2) + ' 手';

  $('sEquity').textContent = '$' + d.account.equity.toFixed(2);
  $('sMargin').textContent = '$' + d.account.margin.toFixed(2);
  $('sLevel').textContent = d.account.margin_level.toFixed(0) + '%';
  $('sSource').textContent = live ? 'MT5 终端' : (cached ? '离线缓存' : '演示模拟器');

  baseline = d.baseline || 5000;
  $('curveTag').textContent = live ? `历史权益 · ${d.summary.curve_deals || 0} 笔` : '权益曲线';
  lastCurve = d.equity_curve || [];
  if(hoverIdx >= lastCurve.length) hoverIdx = -1;
  if(lastCurve.length) baseline = lastCurve[lastCurve.length - 1].base ?? baseline;
  const firstT = lastCurve.length ? lastCurve[0].t : '—';
  $('chartNote').innerHTML = `<span>${rangeLabels[currentRange]} · ${firstT} → 现在</span><span>更新 ${(d.server_time || '').slice(11)}</span>`;
  $('chartNote').title = `数据更新时间 ${d.server_time}`;
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
        <td class="hide-narrow" style="text-align:left;color:var(--symbol)">${x.symbol}</td>
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

async function poll(){
  try{
    const url = STATIC ? 'snapshot.json' : `/api/snapshot?range=${currentRange}`;
    const r = await fetch(url, {cache:'no-store'});
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
    $('clock').textContent = (STATIC ? '快照 ' : 'MT5 ') + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds());
  }else{
    $('clock').textContent = new Date().toLocaleTimeString('zh-CN', {hour12:false});
  }
  const pct = Math.min(100, (Date.now() - start) / period * 100);
  $('bar').style.width = pct + '%';
}

function curveHover(e){
  if(!lastCurve.length) return;
  const cv = $('curve'), r = cv.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const x = clientX - r.left;
  const padL = cv.clientWidth < 480 ? 48 : 58, padR = 12;
  const pw = cv.clientWidth - padL - padR;
  const i = Math.round((x - padL) / pw * (lastCurve.length - 1));
  hoverIdx = Math.max(0, Math.min(lastCurve.length - 1, i));
  drawCurve(lastCurve, hoverIdx);
}

function bindEvents(){
  $('dealPrev').onclick = () => loadDeals(dealsState.page - 1);
  $('dealNext').onclick = () => loadDeals(dealsState.page + 1);
  $('dealSize').onchange = e => { dealsState.size = Number(e.target.value); loadDeals(1); };
  $('calPrev').onclick = () => shiftMonth(-1);
  $('calNext').onclick = () => shiftMonth(1);
  $('pngBtn').onclick = () => { location.href = '/api/export/png'; };
  $('reportBtn').onclick = () => { location.href = STATIC ? 'report.html' : '/report.html'; };

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

  $('curve').addEventListener('mousemove', curveHover);
  $('curve').addEventListener('mouseleave', () => { hoverIdx = -1; drawCurve(lastCurve, -1); });
  $('curve').addEventListener('touchmove', curveHover, {passive:true});
  window.addEventListener('resize', () => { const cv = $('curve'); if(cv.clientWidth) drawCurve(lastCurve, hoverIdx); });

  // 主题切换后重绘 Canvas 与日历（两者颜色都取自 CSS 变量）
  Theme.onChange(() => { drawCurve(lastCurve, hoverIdx); renderCalendar(); });
}

function init(){
  Theme.init();
  if(STATIC){
    $('pngBtn').style.display = 'none';
    document.querySelectorAll('#rangeBar button').forEach(b => {
      if(b.dataset.range !== 'all'){ b.disabled = true; b.title = '云端快照为全量数据'; b.style.opacity = '.4'; }
    });
  }
  bindEvents();
  setInterval(tick, 200); tick();
  poll(); loadDeals(1); setInterval(poll, STATIC ? 30000 : 2000);
}

init();
