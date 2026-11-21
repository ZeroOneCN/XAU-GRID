/* ============================================================
 * calendar.js — 收益日历渲染（按 MT5 服务器日期，金额两位小数）
 * 依赖 core.js（cssVar / lightMode / 共享状态）
 * ============================================================ */

function renderCalendar(){
  const now = serverToday ? new Date(serverToday + 'T00:00:00') : new Date();
  const thisMonth = monthStr(now);
  if(!calMonth) calMonth = thisMonth;
  $('calMonth').textContent = calMonth;
  $('calPrev').disabled = false;
  $('calNext').disabled = calMonth >= thisMonth;
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const maxAbs = Math.max(...Object.values(dailyMap).map(Math.abs), 1);
  const light = lightMode();
  let html = ['日','一','二','三','四','五','六'].map(x => `<div class="cal-head">${x}</div>`).join('');
  for(let i = 0; i < first; i++) html += '<div class="cal-cell blank"></div>';
  let monthTotal = 0, wins = 0, losses = 0;
  for(let day = 1; day <= days; day++){
    const key = `${y}-${pad2(m)}-${pad2(day)}`;
    if(key > todayStr){ html += '<div class="cal-cell blank"></div>'; continue; }
    const v = dailyMap[key] ?? 0;
    const has = Object.prototype.hasOwnProperty.call(dailyMap, key) && v !== 0;
    if(has){ monthTotal += v; v > 0 ? wins++ : losses++; }
    const ratio = Math.min(Math.abs(v) / maxAbs, 1);
    // 浅色模式提高底色不透明度，保证白色金额文字可读
    const alpha = has ? (light ? 0.58 + 0.38 * ratio : 0.32 + 0.6 * ratio) : 0;
    const rgb = cssVar(v > 0 ? '--up-rgb' : '--down-rgb');
    const bg = has ? `rgba(${rgb},${alpha.toFixed(2)})` : '';
    const label = has ? `${v > 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}` : '';
    html += `<div class="cal-cell ${has ? 'has ' + (v > 0 ? 'pos' : 'neg') : ''}${key === todayStr ? ' today' : ''}"`
          + `${bg ? ` style="background:${bg}"` : ''}`
          + ` title="${key}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}"><span class="d">${day}</span>`
          + `${has ? `<span class="v">${label}</span>` : ''}</div>`;
  }
  html += `<div class="cal-stats"><span>本月 <b style="color:${monthTotal >= 0 ? 'var(--up)' : 'var(--down)'}">${monthTotal >= 0 ? '+' : '−'}$${Math.abs(monthTotal).toFixed(2)}</b></span>`
        + `<span>盈 ${wins} / 亏 ${losses}</span></div>`;
  $('calGrid').innerHTML = html;
  $('calTag').textContent = `${Object.keys(dailyMap).filter(k => dailyMap[k] !== 0).length} DAYS`;
}

function shiftMonth(delta){
  const [y, m] = calMonth.split('-').map(Number);
  const next = monthStr(new Date(y, m - 1 + delta, 1));
  if(next > monthStr(serverToday ? new Date(serverToday + 'T00:00:00') : new Date())) return;
  calMonth = next; renderCalendar();
}
