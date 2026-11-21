/* ============================================================
 * report-core.js — 主题管理器 + Markdown 渲染
 * 与看板 core.js 同款三态主题，保证两个页面视觉一致。
 * ============================================================ */
const $ = id => document.getElementById(id);
const STATIC = window.__XAU_STATIC__ === true;

const Theme = (() => {
  const KEY = 'xau-grid-theme';
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  let mode = document.documentElement.dataset.mode || localStorage.getItem(KEY) || 'auto';
  const listeners = [];
  function resolve(m){ return m === 'light' || (m === 'auto' && mq.matches) ? 'light' : 'dark'; }
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
    listeners.forEach(fn => { try{ fn(); }catch(_){} });
  }
  function set(next){
    mode = next;
    try{ localStorage.setItem(KEY, mode); }catch(_){}
    paint();
  }
  function cycle(){ set(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'); }
  const onSys = () => { if(mode === 'auto') paint(); };
  mq.addEventListener ? mq.addEventListener('change', onSys) : mq.addListener(onSys);
  return {
    cycle,
    get mode(){ return mode; },
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

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function inline(s){
  let t=esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  // 金额：带 + 为盈（绿），带 −/- 为亏（红），无符号为中性
  t=t.replace(/([+＋−－-])?\$\s*([\d,]+(?:\.\d+)?)/g,(m,sign,num)=>{
    if(sign==='+'||sign==='＋') return '<span class="up">+$'+num+'</span>';
    if(sign) return '<span class="down">−$'+num+'</span>';
    return '<span class="neutral">$'+num+'</span>';
  });
  t=t.replace(/(\d+(?:\.\d+)?)%/g,'<span class="pct">$1%</span>');       // 胜率 / 保证金率
  t=t.replace(/(\d+)\s*笔/g,'<span class="pct">$1</span> 笔');           // 笔数
  t=t.replace(/盈利/g,'<span class="up">盈利</span>')
     .replace(/亏损/g,'<span class="down">亏损</span>');
  t=t.replace(/\bBUY\b/g,'<span class="buy">BUY</span>')
     .replace(/\bSELL\b/g,'<span class="sell">SELL</span>');
  return t;
}
function md2html(src){
  const lines=src.split('\n');
  let out='',i=0,inTable=false,firstRow=false;
  const closeTable=()=>{if(inTable){out+='</table>';inTable=false;}};
  while(i<lines.length){
    const l=lines[i];
    if(l.startsWith('| ')){
      if(/^[\s:|-]+$/.test(l)){i++;continue;}       // 分隔行
      const cells=l.split('|').slice(1,-1).map(x=>x.trim());
      if(!inTable){out+='<table>';inTable=true;firstRow=true;}
      const tag=firstRow?'th':'td';
      out+='<tr>'+cells.map(c=>`<${tag}>${inline(c)}</${tag}>`).join('')+'</tr>';
      firstRow=false;i++;continue;
    }
    closeTable();
    if(l.startsWith('# ')) out+=`<h1>${inline(l.slice(2))}</h1>`;
    else if(l.startsWith('## ')) out+=`<h2>${inline(l.slice(3))}</h2>`;
    else if(l.startsWith('> ')) out+=`<blockquote>${inline(l.slice(2))}</blockquote>`;
    else if(/^\d+\.\s/.test(l)) out+=`<p class="num">${inline(l)}</p>`;
    else if(l.startsWith('- ')) out+=`<p class="bullet">${inline(l)}</p>`;
    else if(l.trim()==='---') out+='<hr>';
    else if(l.trim()) out+=`<p>${inline(l)}</p>`;
    i++;
  }
  closeTable();
  return out;
}
