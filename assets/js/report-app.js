/* ============================================================
 * report-app.js — 日报加载、自定义交易日日历、复制/下载
 * 依赖 report-core.js（$ / STATIC / Theme / md2html）
 * ============================================================ */
const params = new URLSearchParams(location.search);
let currentDate = params.get('date') || '';
let rawText = '';
let availableDates = [];       // 有平仓成交的交易日，来自 /api/report/dates 或 report_dates.json
let viewYear = 0, viewMonth = 0;

function setLabel(day){ $('dateLabel').textContent = day || '暂无数据'; }

async function loadDates(){
  try{
    const r=await fetch(STATIC?'report_dates.json':'/api/report/dates',{cache:'no-store'});
    const j=await r.json();
    availableDates=(j.dates||[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  }catch(e){ availableDates=[]; }
  if(availableDates.length){
    const lo=availableDates[0], hi=availableDates[availableDates.length-1];
    // URL 指定无数据日期时回退到最近有数据日，保证日历里选中的日子一定可选
    if(!currentDate || currentDate<lo || currentDate>hi || !availableDates.includes(currentDate))
      currentDate=hi;
    setLabel(currentDate);
  }
}

async function load(dateValue){
  currentDate=dateValue||currentDate;
  setLabel(currentDate);
  $('md').innerHTML='<div id="tip">正在读取日报正文…</div>';
  try{
    let text;
    if(STATIC){
      // 云端静态：按选中交易日读 reports/YYYY-MM-DD.md，缺失时回退最新一份 report.json
      const r=await fetch(`reports/${currentDate}.md`,{cache:'no-store'});
      if(r.ok){ text=await r.text(); }
      else{
        const j=await (await fetch('report.json',{cache:'no-store'})).json();
        text=j.text||'';
      }
    }else{
      const url='/api/report/text'+(currentDate?'?date='+encodeURIComponent(currentDate):'');
      const r=await fetch(url,{cache:'no-store'});
      text=await r.text();
    }
    rawText=text;
    const day=(rawText.match(/报告交易日\*\*：(\d{4}-\d{2}-\d{2})/)||[])[1];
    if(day){ currentDate=day; setLabel(day); }
    if(!$('dpPanel').hidden) renderCalendar();
    $('md').innerHTML=md2html(rawText);
  }catch(e){
    $('md').innerHTML='<div id="tip" style="color:var(--down)">日报读取失败：'+e+'</div>';
  }
}

function closePicker(){
  $('dpPanel').hidden=true;
  $('dateBtn').setAttribute('aria-expanded','false');
}
function openPicker(){
  const base=currentDate||availableDates[availableDates.length-1]||new Date().toISOString().slice(0,10);
  const [y,m]=base.split('-').map(Number);
  viewYear=y; viewMonth=m-1;
  renderCalendar();
  $('dpPanel').hidden=false;
  $('dateBtn').setAttribute('aria-expanded','true');
}
function shiftMonth(n){
  const d=new Date(viewYear,viewMonth+n,1);
  viewYear=d.getFullYear(); viewMonth=d.getMonth();
  renderCalendar();
}
function renderCalendar(){
  if(!availableDates.length){
    $('dpMonth').textContent='暂无交易日';
    $('dpGrid').innerHTML='';
    $('dpPrev').disabled=true; $('dpNext').disabled=true;
    return;
  }
  const lo=availableDates[0], hi=availableDates[availableDates.length-1];
  const monthIso=(y,m)=>`${y}-${String(m+1).padStart(2,'0')}`;
  const prev=new Date(viewYear,viewMonth-1,1), next=new Date(viewYear,viewMonth+1,1);
  $('dpMonth').textContent=`${viewYear} 年 ${String(viewMonth+1).padStart(2,'0')} 月`;
  $('dpPrev').disabled = monthIso(prev.getFullYear(),prev.getMonth()) < lo.slice(0,7);
  $('dpNext').disabled = monthIso(next.getFullYear(),next.getMonth()) > hi.slice(0,7);
  const has=new Set(availableDates);
  const lead=(new Date(viewYear,viewMonth,1).getDay()+6)%7;   // 周一为第一列
  const total=new Date(viewYear,viewMonth+1,0).getDate();
  let html='';
  for(let i=0;i<lead;i++) html+='<span class="dp-empty"></span>';
  for(let d=1;d<=total;d++){
    const iso=`${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const ok=has.has(iso);
    const cls=['dp-day',ok?'has':'off',ok&&iso===currentDate?'sel':''].join(' ');
    html+=`<button type="button" class="${cls}" data-day="${iso}" ${ok?'':'disabled'} `+
          `title="${ok?'有平仓数据':'无平仓数据，不可选'}">${d}</button>`;
  }
  $('dpGrid').innerHTML=html;
}
function pickDate(day){
  if(!availableDates.includes(day)) return;
  currentDate=day; setLabel(day); closePicker(); renderCalendar();
  history.replaceState(null,'',`?date=${day}`);
  load(day);
}

function bindEvents(){
  $('dateBtn').onclick=e=>{ e.stopPropagation(); $('dpPanel').hidden?openPicker():closePicker(); };
  $('dpGrid').addEventListener('click',e=>{
    const b=e.target.closest('button[data-day]');
    if(b && !b.disabled) pickDate(b.dataset.day);
  });
  $('dpPrev').onclick=()=>shiftMonth(-1);
  $('dpNext').onclick=()=>shiftMonth(1);
  $('dpLatest').onclick=()=>{ if(availableDates.length) pickDate(availableDates[availableDates.length-1]); };
  document.addEventListener('click',e=>{ if(!$('datePick').contains(e.target)) closePicker(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closePicker(); });
  $('goBtn').onclick=()=>load(currentDate);
  $('copyBtn').onclick=async()=>{
    try{await navigator.clipboard.writeText(rawText);$('copyBtn').textContent='已复制';}
    catch(e){$('copyBtn').textContent='复制失败';}
    setTimeout(()=>$('copyBtn').textContent='复制全文',1500);
  };
  $('dlBtn').onclick=()=>{
    const blob=new Blob([rawText],{type:'text/markdown;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`XAU_Grid_daily_report_${currentDate||'latest'}.md`;
    a.click();URL.revokeObjectURL(a.href);
  };
}

(async function init(){
  Theme.init();
  if(STATIC){
    // 云端静态同样可用自定义日历：返回看板用相对地址
    const back=document.querySelector('.report-bar a.btn');
    if(back){ back.href='index.html'; back.style.display=''; }
    // 品牌标题保持与看板一致的固定文案，避免云端长标题挤占状态与按钮的同一行空间；
    // 「云端快照」这一状态改由中间状态位标注。
    const status = document.querySelector('.rb-meta .rb-status');
    if(status) status.innerHTML = '<i class="dot"></i>REPORT · 云端快照';
  }
  bindEvents();
  await loadDates();
  await load(currentDate);
})();
