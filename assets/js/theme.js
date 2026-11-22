/* ============================================================
 * theme.js — 共享主题管理器（看板 + 日报共用同一套 DOM 与逻辑）
 * 依赖：宿主页面需先定义 $（core.js / report-core.js 均提供）。
 * 三态：auto 跟随系统 / light / dark；持久化到 localStorage。
 * <html data-theme> 控制 CSS 令牌，data-mode 控制按钮状态。
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
    // 按“当前实际显示的主题”取反，保证一次点击就出现变化
    set(resolve(mode) === 'light' ? 'dark' : 'light');
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
