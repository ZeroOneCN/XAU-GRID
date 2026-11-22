/* ============================================================
 * core.js — 全局工具、共享状态、主题管理器
 * 依赖：无。必须最先加载。普通脚本（非 ES module），
 * 保证在 GitHub Pages 子路径下也能直接运行，无 CORS 问题。
 * ============================================================ */

/* —— DOM / 格式化工具 —— */
const $ = id => document.getElementById(id);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/* 金额口径：≥1000 用 1.11k 紧凑写法；<1000 保留两位小数。看板与日历共用。 */
const compactNum = v => {
  const abs = Math.abs(v);
  return abs >= 1000 ? (abs / 1000).toFixed(2) + 'k' : abs.toFixed(2);
};
const money = v => (v >= 0 ? '+$' : '−$') + compactNum(v);
const moneyAbs = v => (v < 0 ? '−$' : '$') + compactNum(v);
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
let lastCurve = [], hoverIdx = -1, currentRange = 'all', baseline = 5000;
let dailyMap = {}, calMonth = null, serverToday = null, serverClock = null, serverClockAt = 0;
let dealsState = {page:1, size:20, pages:1, total:0, loading:false, lastFetch:0};
const rangeLabels = {7:'近7天', 30:'近30天', 90:'近90天', all:'全部'};

/* ============================================================
 * 主题管理器：三态循环 跟随系统(auto) → 浅色(light) → 深色(dark)
 * 状态持久化到 localStorage；<html data-theme> 控制 CSS 令牌，
 * <html data-mode> 控制切换按钮滑块位置。
 * ============================================================ */
const Theme = (() => {
  const KEY = 'xau-grid-theme';
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  let mode = document.documentElement.dataset.mode ||
             localStorage.getItem(KEY) || 'auto';
  const listeners = [];

  function resolve(m){
    return m === 'light' || (m === 'auto' && mq.matches) ? 'light' : 'dark';
  }
  function paint(){
    const effective = resolve(mode);
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.theme = effective;
    const toggle = $('themeToggle');
    if(toggle){
      toggle.dataset.mode = mode;
      const label = mode === 'auto' ? '跟随系统' : (mode === 'light' ? '浅色' : '深色');
      toggle.title = `主题：${label}（点击切换）`;
      toggle.setAttribute('aria-label', `主题 ${label}，点击切换`);
    }
    const tl = $('themeLabel');
    if(tl) tl.textContent = `主题 ${mode === 'auto' ? '跟随设备' : (mode === 'light' ? '浅色' : '深色')}`;
    listeners.forEach(fn => { try{ fn(effective); }catch(_){} });
  }
  function set(next, persist = true){
    mode = next;
    if(persist){ try{ localStorage.setItem(KEY, mode); }catch(_){} }
    paint();
  }
  function cycle(){
    set(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto');
  }
  // 跟随系统模式下，系统主题变化要即时生效
  const onSys = () => { if(mode === 'auto') paint(); };
  mq.addEventListener ? mq.addEventListener('change', onSys) : mq.addListener(onSys);

  return {
    cycle, set,
    get mode(){ return mode; },
    get isLight(){ return resolve(mode) === 'light'; },  // 供日历/图表取色
    onChange(fn){ listeners.push(fn); },
    init(){
      paint();
      const toggle = $('themeToggle');
      if(toggle){
        toggle.addEventListener('click', cycle);
        toggle.addEventListener('keydown', e => {
          if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); cycle(); }
        });
      }
    },
  };
})();

// 兼容旧调用：日历里原先用 lightMode()
const lightMode = () => Theme.isLight;
