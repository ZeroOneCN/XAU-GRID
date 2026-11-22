/* ============================================================
 * core.js — 全局工具、共享状态、主题管理器
 * 依赖：无。必须最先加载。普通脚本（非 ES module），
 * 保证在 GitHub Pages 子路径下也能直接运行，无 CORS 问题。
 * ============================================================ */

/* —— DOM / 格式化工具 —— */
const $ = id => document.getElementById(id);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/* 金额口径：
 * money / moneyAbs —— 完整数值，千分位 + 两位小数（总览、表格、图表）
 * moneyCompact     —— 紧凑写法，≥1000 用 1.11k，<1000 两位小数（仅收益日历）
 */
const fullNum = v => Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const compactNum = v => {
  const abs = Math.abs(v);
  return abs >= 1000 ? (abs / 1000).toFixed(2) + 'k' : abs.toFixed(2);
};
const money = v => (v >= 0 ? '+$' : '−$') + fullNum(v);
const moneyAbs = v => (v < 0 ? '−$' : '$') + fullNum(v);
const moneyCompact = v => (v >= 0 ? '+$' : '−$') + compactNum(v);
const cls = v => v > 0 ? 'up' : (v < 0 ? 'down' : 'neutral');
const pad2 = n => String(n).padStart(2, '0');
const monthStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function setText(id, value, klass){
  const el = $(id);
  if(!el) return;
  el.textContent = value;
  if(klass !== undefined){
    el.className = el.className.replace(/\b(up|down|neutral)\b/g, '').replace(/\s+/g, ' ').trim();
    el.className += ' ' + klass;
  }
}

/* —— 共享运行状态（各模块共用，避免重复声明） —— */
const STATIC = window.__XAU_STATIC__ === true;
let timer = null, start = Date.now(), period = 2000;
let lastCurve = [], hoverIdx = -1, currentRange = 'all';
let dailyMap = {}, calMonth = null, serverToday = null, serverClock = null, serverClockAt = 0;
let dealsState = {page:1, size:20, pages:1, total:0, loading:false, lastFetch:0};
const rangeLabels = {7:'近7天', 30:'近30天', 90:'近90天', all:'全部'};

/* 主题管理器已抽到 theme.js，看板与日报共用同一套实现 */
