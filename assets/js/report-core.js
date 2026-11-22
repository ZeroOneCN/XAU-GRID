/* ============================================================
 * report-core.js — Markdown 渲染（主题逻辑在共享的 theme.js）
 * ============================================================ */
const $ = id => document.getElementById(id);
const STATIC = window.__XAU_STATIC__ === true;

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
  let out='',i=0;
  let rows=null, aligns=null;
  const emitTable=()=>{
    if(!rows || !rows.length) return;
    const width=rows[0].length;
    const sig=(aligns||[]).map(a=>a==='ta-r'?'r':(a==='ta-c'?'c':'l')).join('')
      || 'l'.repeat(width);
    out+=`<table class="cols-${width} al-${sig}">`;
    rows.forEach((cells,ri)=>{
      const tag=ri===0?'th':'td';
      out+='<tr>'+cells.map((c,ci)=>{
        const a=aligns && aligns[ci] ? ' '+aligns[ci] : '';
        return `<${tag} class="c${ci+1}${a}">${inline(c)}</${tag}>`;
      }).join('')+'</tr>';
    });
    out+='</table>';
    rows=null; aligns=null;
  };
  while(i<lines.length){
    const l=lines[i];
    if(l.startsWith('| ')){
      const cells=l.split('|').slice(1,-1).map(x=>x.trim());
      if(/^[\s:|-]+$/.test(l)){       // 分隔行：记录列对齐
        aligns=cells.map(c=>{
          const left=c.startsWith(':'), right=c.endsWith(':');
          return left&&right?'ta-c':(right?'ta-r':'');
        });
        i++;continue;
      }
      if(!rows) rows=[];
      rows.push(cells);
      i++;continue;
    }
    emitTable();
    if(l.startsWith('# ')) out+=`<h1>${inline(l.slice(2))}</h1>`;
    else if(l.startsWith('## ')) out+=`<h2>${inline(l.slice(3))}</h2>`;
    else if(l.startsWith('> ')) out+=`<blockquote>${inline(l.slice(2))}</blockquote>`;
    else if(/^\d+\.\s/.test(l)) out+=`<p class="num">${inline(l)}</p>`;
    else if(l.startsWith('- ')) out+=`<p class="bullet">${inline(l)}</p>`;
    else if(l.trim()==='---') out+='<hr>';
    else if(l.trim()) out+=`<p>${inline(l)}</p>`;
    i++;
  }
  emitTable();
  return out;
}
