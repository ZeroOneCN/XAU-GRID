/* ============================================================
 * calendar.js — 收益日历渲染（按 MT5 服务器日期，金额两位小数）
 * 依赖 core.js（cssVar / lightMode / 共享状态）
 * ============================================================ */

/* 按色块实际亮度选文字色，保证两种主题下都有足够对比 */
function hexRgb(hex){
  const h = String(hex || '').trim().replace('#', '');
  if(h.length !== 6) return null;
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function inkFor(rgbStr, alpha){
  const p = rgbStr.split(',').map(Number);
  const bg = hexRgb(cssVar('--panel')) || [11, 14, 17];
  const c = p.map((v, i) => v * alpha + bg[i] * (1 - alpha));
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  const white = 1.05 / (lum + 0.05);
  const dark = (lum + 0.05) / 0.05;
  return white >= dark ? '#FFFFFF' : '#050607';
}

/* 窄屏（手机）用更短的口径，保证金额能完整落在 49px 的格子里：
 * ≥100万 → 1.11m / 1m；≥10000 → 12k；≥1000 → 1.2k；≥100 → 619.7；其它 → 6.98。
 * 完整金额仍在 title 里 */
function compactShort(v){
  const abs = Math.abs(v);
  if(abs >= 999995) return trimZeros((abs / 1e6).toFixed(2)) + 'm';
  if(abs >= 10000) return (abs / 1000).toFixed(0) + 'k';
  if(abs >= 1000) return (abs / 1000).toFixed(1) + 'k';
  if(abs >= 100) return abs.toFixed(1);
  return abs.toFixed(2);
}

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
    // 浅色：淡色块 + 深色数字，保证色块上的文字对比；深色：白色数字压深色块
    const alpha = has ? (light ? 0.20 + 0.40 * ratio : 0.32 + 0.6 * ratio) : 0;
    const rgb = cssVar(v > 0 ? '--up-rgb' : '--down-rgb');
    const bg = has ? `rgba(${rgb},${alpha.toFixed(2)})` : '';
    // 收益日历保留紧凑口径（≥1000 为 x.xxk，<1000 两位小数）；
    // 窄屏再收一档，否则 −619.67 这种会顶到格子边上被裁；
    // 单元格内省略货币符号以适配窄格，完整金额见 title 提示。
    const narrow = document.documentElement.clientWidth < 560;
    const label = has ? (v >= 0 ? '+' : '−') + (narrow ? compactShort(v) : compactNum(v)) : '';
    const ink = has ? inkFor(rgb, alpha) : '';
    const darkInk = ink === '#050607';
    html += `<div class="cal-cell ${has ? 'has ' + (v > 0 ? 'pos' : 'neg') : ''}`
          + `${darkInk ? ' ink-dark' : ''}${key === todayStr ? ' today' : ''}"`
          + `${bg ? ` style="background:${bg}${ink ? ';color:' + ink : ''}"` : ''}`
          + ` title="${key}: ${money(v)}"><span class="d">${day}</span>`
          + `${has ? `<span class="v">${label}</span>` : ''}</div>`;
  }
  $('calGrid').innerHTML = html;
  $('calStats').innerHTML =
    `<span>本月 <b style="color:${monthTotal >= 0 ? 'var(--up)' : 'var(--down)'}">${moneyCompact(monthTotal)}</b></span>`
    + `<span>盈 ${wins} / 亏 ${losses}</span>`;
  $('calTag').textContent = `${Object.keys(dailyMap).filter(k => dailyMap[k] !== 0).length} DAYS`;
}

function shiftMonth(delta){
  const [y, m] = calMonth.split('-').map(Number);
  const next = monthStr(new Date(y, m - 1 + delta, 1));
  if(next > monthStr(serverToday ? new Date(serverToday + 'T00:00:00') : new Date())) return;
  calMonth = next; renderCalendar();
}
