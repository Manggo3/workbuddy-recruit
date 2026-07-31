/* ================= 我的工作台 ================= */
/* 数据全部保存在浏览器 localStorage，无需联网或服务器 */

const KEYS = {
  schedule:'wb_schedule', finance:'wb_finance', fitness:'wb_fitness',
  diet:'wb_diet', todo:'wb_todo', theme:'wb_theme', profile:'wb_profile',
  navorder:'wb_navorder', recruitsrc:'wb_recruitsrc', recruitovers:'wb_recruitovers'
};
const WEEK = ['日','一','二','三','四','五','六'];
const CAT_COLORS = {
  '学习':'#6366f1','工作':'#0ea5e9','实习':'#14b8a6','家教':'#f59e0b',
  '运动':'#ef4444','会议':'#8b5cf6','其他':'#64748b'
};
const ACCOUNTS = ['现金','微信','支付宝','储蓄卡','信用卡','交通卡','食堂卡','团购券','其他'];
let pendingLinkTodoId = null;   // 待办→日程：暂存要关联的待办 id

function load(key, def){ try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }catch(e){ return def; } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

let schedule = load(KEYS.schedule, []);
let finance  = load(KEYS.finance, []);
let fitness  = load(KEYS.fitness, []);
let diet     = load(KEYS.diet, []);
let todo     = load(KEYS.todo, []);
let profile  = load(KEYS.profile, { name:'我', role:'个人工作台' });

/* ---- 日期工具 ---- */
function ymd(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function parseYMD(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y, m-1, d); }
function todayStr(){ return ymd(new Date()); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d,n){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }
function weekStart(d){ const x=new Date(d); const dow=x.getDay(); const diff=(dow===0?-6:1-dow); x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function $(sel, root=document){ return root.querySelector(sel); }
function $$(sel, root=document){ return [...root.querySelectorAll(sel)]; }

let toastTimer;
function toast(msg){
  const t = $('#toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ================= 个人资料 / 主题 / 时钟 ================= */
function applyProfile(){
  const av = $('#avatar'), nm = $('#userName'), rl = $('#userRole');
  if(av) av.textContent = '🐶';
  if(nm) nm.textContent = profile.name || '我';
  if(rl) rl.textContent = profile.role || '个人工作台';
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  const btn = $('#themeToggle');
  if(btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}
function setGreeting(){
  const h = new Date().getHours();
  const g = h<6 ? '凌晨好，' : h<9 ? '早上好，' : h<12 ? '上午好，'
          : h<14 ? '中午好，' : h<18 ? '下午好，' : h<22 ? '晚上好，' : '夜深了，';
  const el = $('#greet'); if(el) el.textContent = g;
}
function tickClock(){
  const now = new Date();
  const p = n => String(n).padStart(2,'0');
  const c = $('#clock'); if(c) c.textContent = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const cd = $('#clockDate'); if(cd) cd.textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 周${WEEK[now.getDay()]}`;
}

/* ================= 视图切换 ================= */
function switchView(v){
  $$('#nav .nav-item').forEach(x=> x.classList.toggle('active', x.dataset.view === v));
  $$('.view').forEach(s=> s.classList.remove('active'));
  const target = $('#view-' + v);
  if(target) target.classList.add('active');
  if(v==='dashboard') renderDashboard();
  else if(v==='schedule') renderSchedule();
  else if(v==='finance') renderFinance();
  else if(v==='fitness') renderFitness();
  else if(v==='diet') renderDiet();
  else if(v==='todo') renderTodo();
  else if(v==='recruit') renderRecruit();
  if(v!=='dashboard') window.scrollTo({ top:0, behavior:'smooth' });
  applyMobileCollapse();
}
function setupCollapsibleCards(){
  $$('.card').forEach(card=>{
    const h3 = card.querySelector('h3');
    if(!h3) return;
    // 把标题后的所有内容包进可折叠容器
    const wrap = document.createElement('div');
    wrap.className = 'card-collapse';
    let n = h3.nextSibling;
    while(n){ const next = n.nextSibling; wrap.appendChild(n); n = next; }
    h3.after(wrap);
    // 标题左侧加折叠箭头，并把标题文字/链接归到 .h3-left
    const left = document.createElement('span');
    left.className = 'h3-left';
    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.textContent = '▾';
    left.appendChild(chev);
    while(h3.firstChild){
      if(h3.firstChild.classList && (h3.firstChild.classList.contains('h3-link') || h3.firstChild.classList.contains('h3-count'))) break;
      left.appendChild(h3.firstChild);
    }
    h3.insertBefore(left, h3.firstChild);
    h3.addEventListener('click', e=>{
      if(e.target.closest('.h3-link')) return;     // 点“全部 →”不折叠
      card.classList.toggle('collapsed');
    });
  });
}
// 移动端：默认折叠当前视图里除第一张外的卡片，避免长滚动
function applyMobileCollapse(){
  const mobile = window.innerWidth <= 760;
  const active = $('.view.active') || $('#view-dashboard');
  if(!active) return;
  [...active.querySelectorAll('.card')].forEach((c,i)=>{
    c.classList.toggle('collapsed', mobile && i>0);
  });
}

/* ================= 导航栏拖拽排序 ================= */
function applyNavOrder(){
  const nav = $('#nav'); if(!nav) return;
  const order = load(KEYS.navorder, null);
  if(!order || !order.length) return;
  const byView = {};
  nav.querySelectorAll('.nav-item').forEach(el=> byView[el.dataset.view] = el);
  order.forEach(v=>{ if(byView[v]){ nav.appendChild(byView[v]); delete byView[v]; } });
  Object.values(byView).forEach(el=> nav.appendChild(el)); // 新增视图排到最后
}
function getNavAfter(nav, y, x){
  const els = [...nav.querySelectorAll('.nav-item:not(.dragging)')];
  const horizontal = window.innerWidth <= 820;
  return els.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = horizontal ? (x - box.left - box.width/2) : (y - box.top - box.height/2);
    if(offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}
function setupNavSort(){
  const nav = $('#nav'); if(!nav) return;
  nav.querySelectorAll('.nav-item').forEach(item=>{
    if(item.querySelector('.nav-grip')) return;
    const grip = document.createElement('span');
    grip.className = 'nav-grip';
    grip.textContent = '⠿';
    grip.setAttribute('draggable', 'true');
    item.insertBefore(grip, item.firstChild);
  });
  let navDrag = null;
  nav.addEventListener('dragstart', e=>{
    const grip = e.target.closest('.nav-grip');
    if(!grip) return;
    navDrag = grip.closest('.nav-item');
    navDrag.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try{ e.dataTransfer.setData('text/plain', navDrag.dataset.view); }catch(_){}
  });
  nav.addEventListener('dragend', ()=>{
    if(navDrag){ navDrag.classList.remove('dragging'); navDrag = null; commitNavOrder(); }
  });
  nav.addEventListener('dragover', e=>{
    if(!navDrag) return;
    e.preventDefault();
    const after = getNavAfter(nav, e.clientY, e.clientX);
    if(after == null) nav.appendChild(navDrag);
    else nav.insertBefore(navDrag, after);
  });
}
function commitNavOrder(){
  const nav = $('#nav'); if(!nav) return;
  const order = [...nav.querySelectorAll('.nav-item')].map(el=> el.dataset.view);
  save(KEYS.navorder, order);
}

/* ================= 日程 ================= */
let schedState = { mode:'month', anchor:new Date() };

function eventsForDate(dateObj){
  const ds = ymd(dateObj);
  const dow = dateObj.getDay();
  return schedule.filter(ev=>{
    if(ev.recurrence === 'once') return ev.date === ds;
    if(ev.recurrence === 'weekly') return (ev.weekdays||[]).includes(dow);
    return false;
  }).sort((a,b)=> a.start.localeCompare(b.start));
}

function eventChip(ev){
  const color = CAT_COLORS[ev.category] || CAT_COLORS['其他'];
  const loc = ev.location ? ' @'+escapeHtml(ev.location) : '';
  const linked = ev.linkId ? '🔗' : '';
  return `<div class="chip" style="--c:${color}" title="${escapeHtml(ev.title)}${loc}">
    <span class="chip-time">${ev.start}-${ev.end}</span>
    <span class="chip-title">${escapeHtml(ev.title)} ${linked}</span>
    <span class="chip-add" data-add-id="${ev.id}" title="生成待办">＋</span>
    <span class="chip-x" data-del-id="${ev.id}" data-del-kind="schedule">×</span>
  </div>`;
}

function monthMatrix(anchor){
  const y=anchor.getFullYear(), m=anchor.getMonth();
  const first = new Date(y, m, 1);
  const diff = (first.getDay()===0 ? 6 : first.getDay()-1);
  const start = new Date(y, m, 1 - diff);
  const cells = [];
  for(let i=0;i<42;i++){ cells.push(addDays(start, i)); }
  return cells;
}

function monthGridHTML(){
  const cells = monthMatrix(schedState.anchor);
  const head = ['一','二','三','四','五','六','日'].map(w=>`<div class="cal-head">${w}</div>`).join('');
  const today = todayStr();
  let body = '';
  cells.forEach(c=>{
    const inMonth = c.getMonth() === schedState.anchor.getMonth();
    const ds = ymd(c);
    const evs = eventsForDate(c);
    const evHTML = evs.slice(0,3).map(eventChip).join('') + (evs.length>3 ? `<div class="more">+${evs.length-3}</div>` : '');
    body += `<div class="cal-cell ${inMonth?'':'muted'} ${ds===today?'today':''}" data-date="${ds}">
      <div class="cal-date">${c.getDate()}</div>
      <div class="cal-events">${evHTML}</div>
    </div>`;
  });
  return `<div class="cal-grid"><div class="cal-headrow">${head}</div>${body}</div>`;
}

function weekHTML(){
  const ws = weekStart(schedState.anchor);
  const today = todayStr();
  let html = '<div class="week-wrap">';
  for(let i=0;i<7;i++){
    const d = addDays(ws, i);
    const evs = eventsForDate(d);
    html += `<div class="day-col ${ymd(d)===today?'today':''}" data-date="${ymd(d)}">
      <div class="day-head">周${WEEK[d.getDay()]} <span>${d.getMonth()+1}/${d.getDate()}</span></div>
      <div class="day-events">${evs.map(eventChip).join('') || '<div class="empty">无安排</div>'}</div>
    </div>`;
  }
  return html + '</div>';
}

function dayHTML(d){
  const evs = eventsForDate(d);
  return `<div class="day-single">
    <h3 style="margin:0 0 10px">${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 周${WEEK[d.getDay()]}</h3>
    <div class="day-events">${evs.map(eventChip).join('') || '<div class="empty">这一天暂无安排</div>'}</div>
  </div>`;
}

function renderSchedule(){
  if(!$('#schedule-calendar')) return;
  let label = '';
  if(schedState.mode === 'month') label = `${schedState.anchor.getFullYear()}年${schedState.anchor.getMonth()+1}月`;
  else if(schedState.mode === 'week'){ const ws=weekStart(schedState.anchor), we=addDays(ws,6); label = `${ws.getMonth()+1}月${ws.getDate()}日 - ${we.getMonth()+1}月${we.getDate()}日`; }
  else label = `${schedState.anchor.getFullYear()}年${schedState.anchor.getMonth()+1}月${schedState.anchor.getDate()}日 周${WEEK[schedState.anchor.getDay()]}`;
  $('#sched-label').textContent = label;
  $$('.seg-btn').forEach(b=> b.classList.toggle('active', b.dataset.mode === schedState.mode));
  let html = '';
  if(schedState.mode === 'month') html = monthGridHTML();
  else if(schedState.mode === 'week') html = weekHTML();
  else html = dayHTML(schedState.anchor);
  $('#schedule-calendar').innerHTML = html;
}

function navSchedule(dir){
  if(schedState.mode === 'month') schedState.anchor = addMonths(schedState.anchor, dir);
  else if(schedState.mode === 'week') schedState.anchor = addDays(schedState.anchor, 7*dir);
  else schedState.anchor = addDays(schedState.anchor, dir);
  renderSchedule();
}

/* ================= 财务 ================= */
let finState = { anchor:new Date() };

function renderFinance(){
  if(!$('#fin-label')) return;
  const y = finState.anchor.getFullYear(), m = finState.anchor.getMonth();
  $('#fin-label').textContent = `${y}年${m+1}月`;
  const items = finance.filter(t=>{ const d=parseYMD(t.date); return d.getFullYear()===y && d.getMonth()===m; });
  const income = items.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = items.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  $('#fin-income').textContent = '¥'+income.toFixed(2);
  $('#fin-expense').textContent = '¥'+expense.toFixed(2);
  $('#fin-balance').textContent = '¥'+(income-expense).toFixed(2);

  // 账户余额（全量累计，转账为内部挪动不计入收支）
  const bal = {}; ACCOUNTS.forEach(a=> bal[a]=0);
  finance.forEach(t=>{
    const amt = Number(t.amount)||0;
    const acc = t.account || '现金';
    if(t.type==='income') bal[acc] = (bal[acc]||0)+amt;
    else if(t.type==='expense') bal[acc] = (bal[acc]||0)-amt;
    else if(t.type==='transfer'){ bal[acc]=(bal[acc]||0)-amt; const to=t.toAccount||'现金'; bal[to]=(bal[to]||0)+amt; }
  });
  $('#fin-accounts').innerHTML = ACCOUNTS.map(a=>{
    const v = bal[a]||0;
    if(v===0 && a!=='现金') return '';
    return `<div class="acct-row"><span class="acct-name">${a}</span><span class="acct-val ${v<0?'neg':''}">¥${v.toFixed(2)}</span></div>`;
  }).join('') || '<div class="empty">暂无账户数据</div>';

  const byCat = {};
  items.filter(t=>t.type==='expense').forEach(t=> byCat[t.category] = (byCat[t.category]||0) + Number(t.amount));
  const max = Math.max(1, ...Object.values(byCat));
  const catHTML = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`<div class="bar-row"><span class="bar-label">${c}</span><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%"></div></div><span class="bar-val">¥${v.toFixed(2)}</span></div>`)
    .join('') || '<div class="empty">本月暂无支出</div>';
  $('#fin-cats').innerHTML = catHTML;

  const list = items.slice().sort((a,b)=>b.date.localeCompare(a.date))
    .map(t=>{
      const tr = t.type==='transfer';
      let amtHTML, midHTML;
      if(tr){
        amtHTML = `<span class="row-amt">⇄ ¥${Number(t.amount).toFixed(2)}</span>`;
        midHTML = `<span class="row-cat">${escapeHtml(t.account||'现金')}→${escapeHtml(t.toAccount||'现金')}</span>`;
      } else {
        const inc = t.type==='income';
        amtHTML = `<span class="row-amt ${inc?'pos':'neg'}">${inc?'+':'-'}¥${Number(t.amount).toFixed(2)}</span>`;
        midHTML = `<span class="row-cat">${escapeHtml(t.category||'')}</span><span class="acct-badge">${escapeHtml(t.account||'现金')}</span>`;
      }
      return `<div class="row">
        <span class="row-date">${t.date.slice(5)}</span>
        ${midHTML}
        <span class="row-note">${escapeHtml(t.note||'')}</span>
        ${amtHTML}
        <span class="row-del" data-del-id="${t.id}" data-del-kind="finance">×</span>
      </div>`;
    }).join('') || '<div class="empty">本月暂无记录</div>';
  $('#fin-list').innerHTML = list;
}

// 根据选中的交易类型，切换账户/到账户/分类的显隐
function syncFinForm(){
  const type = document.querySelector('input[name=fintype]:checked').value;
  const toWrap = $('#fin-toaccount-wrap'), catWrap = $('#fin-category-wrap');
  if(toWrap) toWrap.style.display = type==='transfer' ? '' : 'none';
  if(catWrap) catWrap.style.display = type==='transfer' ? 'none' : '';
}

/* ================= 健身 ================= */
function renderFitness(){
  if(!$('#fit-week-count')) return;
  const now = new Date();
  const ws = weekStart(now), we = addDays(ws,7);
  const weekItems = fitness.filter(t=>{ const d=parseYMD(t.date); return d>=ws && d<we; });
  const monthItems = fitness.filter(t=>{ const d=parseYMD(t.date); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth(); });
  $('#fit-week-count').textContent = weekItems.length + ' 次';
  $('#fit-week-min').textContent = weekItems.reduce((s,t)=>s+Number(t.duration||0),0) + ' 分钟';
  $('#fit-month-min').textContent = monthItems.reduce((s,t)=>s+Number(t.duration||0),0) + ' 分钟';
  const fc = $('#fit-count'); if(fc) fc.textContent = weekItems.length + ' 次';

  const list = fitness.slice().sort((a,b)=>b.date.localeCompare(a.date))
    .map(t=>`<div class="row">
      <span class="row-date">${t.date.slice(5)}</span>
      <span class="row-cat">${t.type}</span>
      <span class="row-note">${Number(t.duration)}分钟 ${escapeHtml(t.note||'')}</span>
      <span class="row-del" data-del-id="${t.id}" data-del-kind="fitness">×</span>
    </div>`).join('') || '<div class="empty">暂无打卡记录</div>';
  $('#fit-list').innerHTML = list;
}

/* ================= 饮食 ================= */
let dietState = { date: todayStr() };

function renderDiet(){
  if(!$('#diet-list')) return;
  $('#diet-date').value = dietState.date;
  const items = diet.filter(t=>t.date === dietState.date);
  $('#diet-total').textContent = items.reduce((s,t)=>s+Number(t.calories||0),0) + ' kcal';
  const dc = $('#diet-count'); if(dc) dc.textContent = items.length + ' 条';
  const byMeal = { '早餐':[], '午餐':[], '晚餐':[], '加餐':[] };
  items.forEach(t=> byMeal[t.meal].push(t));
  let html = '';
  ['早餐','午餐','晚餐','加餐'].forEach(meal=>{
    const arr = byMeal[meal];
    html += `<div class="meal-block"><div class="meal-head">${meal}<span>${arr.reduce((s,t)=>s+Number(t.calories||0),0)} kcal</span></div>`;
    html += arr.length
      ? arr.map(t=>`<div class="row"><span class="row-cat" style="width:auto;flex:1">${escapeHtml(t.food)}</span><span class="row-note">${Number(t.calories||0)}kcal ${escapeHtml(t.note||'')}</span><span class="row-del" data-del-id="${t.id}" data-del-kind="diet">×</span></div>`).join('')
      : '<div class="empty">未记录</div>';
    html += '</div>';
  });
  $('#diet-list').innerHTML = html;
}

/* ================= 待办 ================= */
let todoState = { date: todayStr() };

function getDragAfterElement(container, y){
  const els = [...container.querySelectorAll('.todo-row:not(.dragging)')];
  return els.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if(offset < 0 && offset > closest.offset) return { offset, element:child };
    return closest;
  }, { offset:Number.NEGATIVE_INFINITY, element:null }).element;
}
function commitTodoOrder(){
  const ids = [...$('#todo-list').querySelectorAll('.todo-row')].map(r=>r.dataset.id);
  const current = todo.filter(t=>t.date===todoState.date);
  const others = todo.filter(t=>t.date!==todoState.date);
  const reordered = ids.map(id=> current.find(t=>t.id===id)).filter(Boolean);
  todo = [...others, ...reordered];
  save(KEYS.todo, todo);
  renderTodo(); renderDashboard();
}
function renderTodo(){
  if(!$('#todo-list')) return;
  $('#todo-date').value = todoState.date;
  const items = todo.filter(t=>t.date === todoState.date);
  const remain = items.filter(t=>!t.done).length;
  $('#todo-remain').textContent = `共 ${items.length} 项 · 待办 ${remain}`;
  const tc = $('#todo-count'); if(tc) tc.textContent = `${items.length - remain}/${items.length}`;
  if(!items.length){ $('#todo-list').innerHTML = '<div class="empty">今天还没有待办，添加一个吧</div>'; return; }
  $('#todo-list').innerHTML = items.map((t,i)=>`<div class="todo-row ${t.done?'done':''}" draggable="true" data-id="${t.id}">
    <span class="drag" title="拖动排序">⠿</span>
    <span class="todo-num">${i+1}</span>
    <span class="todo-dot ${t.done?'done':''}" title="${t.done?'已完成':'未完成'}"></span>
    <input type="checkbox" class="todo-check" data-id="${t.id}" ${t.done?'checked':''}>
    <span class="todo-text">${escapeHtml(t.text)}${t.done?'<span class="todo-badge">已学完</span>':''}</span>
    ${t.linkId?'<span class="linked-ic" title="已排入日程">🕒</span>':''}
    <button class="mini-act todo-sched" data-sched-id="${t.id}" title="排入日程">📅</button>
    <span class="todo-stat ${t.done?'done':''}" data-id="${t.id}">${t.done?'已完成':'未完成'}</span>
    <span class="row-del" data-del-id="${t.id}" data-del-kind="todo">×</span>
  </div>`).join('');
}

/* ================= 概览 ================= */
function renderDashboard(){
  if(!$('#kpi-todo')) return;
  const now = new Date();

  // KPI 1：今日待办
  const titems = todo.filter(t=>t.date===todayStr());
  const tremain = titems.filter(t=>!t.done).length;
  $('#kpi-todo').innerHTML = `<div class="kpi-num">${titems.length}</div><div class="kpi-sub">待办 ${tremain} · 已完成 ${titems.length-tremain}</div>`;

  // KPI 2：完成率（环形 + 线性进度条）
  const rate = titems.length ? Math.round((titems.length-tremain)/titems.length*100) : 0;
  $('#kpi-rate').innerHTML = `<div class="kpi-stack">
    <div class="kpi-ring" style="--p:${rate}"><div class="kpi-ring-in">${rate}%</div></div>
    <div style="flex:1"><div class="kpi-sub">今日待办完成度</div><div class="kpi-bar"><i style="width:${rate}%"></i></div></div>
  </div>`;

  // KPI 3：本月结余（含支出进度条）
  const y=now.getFullYear(), m=now.getMonth();
  const fitems = finance.filter(t=>{ const d=parseYMD(t.date); return d.getFullYear()===y && d.getMonth()===m; });
  const income = fitems.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = fitems.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const net = income - expense;
  const spendRatio = income>0 ? Math.min(100, Math.round(expense/income*100)) : 0;
  $('#kpi-balance').innerHTML = `<div class="kpi-stack">
    <div class="kpi-num ${net<0?'neg':''}">¥${net.toFixed(0)}</div>
    <div style="flex:1"><div class="kpi-sub">收 ¥${income.toFixed(0)} / 支 ¥${expense.toFixed(0)}</div><div class="kpi-bar"><i style="width:${spendRatio}%"></i></div><div class="kpi-sub">支出占收入 ${spendRatio}%</div></div>
  </div>`;

  // KPI 4：本周健身
  const ws=weekStart(now), we=addDays(ws,7);
  const wk = fitness.filter(t=>{ const d=parseYMD(t.date); return d>=ws && d<we; });
  const wkMin = wk.reduce((s,t)=>s+Number(t.duration||0),0);
  $('#kpi-fit').innerHTML = `<div class="kpi-num">${wk.length}</div><div class="kpi-sub">次 · ${wkMin} 分钟</div>`;

  // 今日待办（紧凑列表，可勾选）
  const dashTodo = $('#dash-todo-list');
  if(dashTodo){
    if(!titems.length){ dashTodo.innerHTML = '<div class="empty">今天还没有待办，去添加一个吧</div>'; }
    else {
      const top = titems.slice(0,6);
      dashTodo.innerHTML = top.map(t=>`<div class="mini-row ${t.done?'done':''}">
        <input type="checkbox" class="mini-check" data-id="${t.id}" ${t.done?'checked':''}>
        <span class="mini-text">${escapeHtml(t.text)}</span>
      </div>`).join('') + (titems.length>6 ? `<div class="more-link" data-view="todo">查看全部 ${titems.length} 项 →</div>` : '');
    }
  }

  // 今日日程
  const dashSched = $('#dash-schedule-list');
  if(dashSched){
    const evs = eventsForDate(now);
    dashSched.innerHTML = evs.length
      ? evs.map(ev=>`<div class="mini-row"><span class="mini-time">${ev.start}</span><span class="mini-text">${escapeHtml(ev.title)}</span></div>`).join('')
      : '<div class="empty">今天暂无安排</div>';
  }

  // 提醒 / 系统消息
  const alerts = $('#dash-alerts');
  if(alerts){
    const msg = [];
    if(titems.length && tremain>0) msg.push(['⏰', `你有 <b>${tremain}</b> 项待办尚未完成`]);
    if(!eventsForDate(now).length) msg.push(['📅', '今天还没有日程安排']);
    if(!diet.filter(t=>t.date===todayStr()).length) msg.push(['🍎', '今天还没记录饮食']);
    if(!wk.length) msg.push(['💪', '本周还没健身打卡']);
    if(expense>income && (income+expense)>0) msg.push(['💸', '本月支出已超过收入']);
    if(recruitState.items && recruitState.items.length){
      const soonR = recruitState.items.filter(x=>{ const l = daysLeft(x.deadline); return l !== null && l >= 0 && l <= 14; }).length;
      if(soonR > 0) msg.push(['🎓', `有 <b>${soonR}</b> 条秋招信息 14 天内截止`]);
    }
    if(!msg.length) msg.push(['✅', '一切井井有条，继续保持！']);
    alerts.innerHTML = msg.map(([ic,t])=>`<div class="alert-row"><span class="alert-ic">${ic}</span><span>${t}</span></div>`).join('');
  }
}

/* ================= 删除 ================= */
function deleteItem(kind, id){
  if(kind==='schedule'){
    const ev = schedule.find(x=>x.id===id);
    if(ev && ev.linkId){ const t = todo.find(x=>x.id===ev.linkId); if(t) t.linkId = null; save(KEYS.todo, todo); }
    schedule = schedule.filter(x=>x.id!==id); save(KEYS.schedule, schedule); renderSchedule();
  }
  else if(kind==='finance'){ finance = finance.filter(x=>x.id!==id); save(KEYS.finance, finance); renderFinance(); }
  else if(kind==='fitness'){ fitness = fitness.filter(x=>x.id!==id); save(KEYS.fitness, fitness); renderFitness(); }
  else if(kind==='diet'){ diet = diet.filter(x=>x.id!==id); save(KEYS.diet, diet); renderDiet(); }
  else if(kind==='todo'){
    const t = todo.find(x=>x.id===id);
    if(t && t.linkId){ const ev = schedule.find(x=>x.id===t.linkId); if(ev) ev.linkId = null; save(KEYS.schedule, schedule); }
    todo = todo.filter(x=>x.id!==id); save(KEYS.todo, todo); renderTodo();
  }
  renderDashboard(); toast('已删除');
}

// 待办 → 日程：预填并跳转到日程表单
function scheduleFromTodo(todoId){
  const t = todo.find(x=>x.id===todoId); if(!t) return;
  pendingLinkTodoId = todoId;
  $('#ev-title').value = t.text;
  $('#ev-recurrence').value = 'once';
  $('#ev-date').value = t.date || todayStr();
  $('#ev-start').value = '09:00'; $('#ev-end').value = '10:00';
  $('#ev-category').value = '其他';
  $('#ev-note').value = '';
  $('#ev-date-wrap').style.display = ''; $('#ev-wd-wrap').style.display = 'none';
  switchView('schedule');
  toast('已填入日程，调整时间后保存即可关联');
}

// 日程 → 待办：直接生成一条关联待办
function createTodoFromEvent(evId){
  const ev = schedule.find(x=>x.id===evId); if(!ev) return;
  const date = ev.recurrence === 'weekly' ? todayStr() : ev.date;
  const newId = uid();
  todo.push({ id:newId, text:ev.title, done:false, date, linkId:evId });
  ev.linkId = newId;
  save(KEYS.todo, todo); save(KEYS.schedule, schedule);
  renderTodo(); renderSchedule(); renderDashboard(); toast('已生成待办');
}

/* ================= 秋招（后端预拉取） ================= */
let recruitState = { items: [], status:'all', source:'all', city:'all', backend:true, srcMode:'local', cloudUrl:'' };

function daysLeft(deadline){
  if(!deadline) return null;
  const d = parseYMD(deadline); const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}
function showRecruitNotice(html){ const n = $('#recruit-notice'); if(n){ n.style.display=''; n.innerHTML = html; } }
function hideRecruitNotice(){ const n = $('#recruit-notice'); if(n) n.style.display = 'none'; }

// 云端模式下，个人标注（感兴趣/已投递/手动增删）存在本地，叠加在云端数据之上
function applyRecruitOverrides(items){
  const ov = load(KEYS.recruitovers, { flags:{}, added:[], removed:[] });
  const flags = ov.flags || {};
  const removed = new Set(ov.removed || []);
  let list = items.filter(x=> !removed.has(x.id));
  list = list.map(x=>{ const f = flags[x.id]; return f ? Object.assign({}, x, { interest:!!f.interest, applied:!!f.applied }) : x; });
  if(ov.added && ov.added.length) list = list.concat(ov.added);
  return list;
}

async function fetchRecruit(){
  if(recruitState.srcMode === 'cloud'){
    if(!recruitState.cloudUrl){
      recruitState.items = [];
      showRecruitNotice('请先在工具栏点「⚙️ 数据源」填写云端 <b>recruit.json</b> 的 URL（jsDelivr 或 raw）。');
      const list = $('#recruit-list'); if(list) list.innerHTML = '<div class="empty">未配置云端地址</div>';
      return [];
    }
    const res = await fetch(recruitState.cloudUrl);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const base = Array.isArray(data) ? data : (data.items || []);
    recruitState.items = applyRecruitOverrides(base);
    recruitState.backend = true;
    hideRecruitNotice();
    paintRecruit();
    return recruitState.items;
  }
  // 本地后端
  const res = await fetch('/api/recruit', { headers:{ 'Accept':'application/json' } });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  recruitState.items = data.items || [];
  recruitState.backend = true;
  hideRecruitNotice();
  paintRecruit();
  return recruitState.items;
}
function fillRecruitFilters(items){
  const srcSel = $('#recruit-filter-source'), citySel = $('#recruit-filter-city');
  if(!srcSel || !citySel) return;
  const srcs = [...new Set(items.map(x=> x.source).filter(Boolean))];
  const cities = [...new Set(items.map(x=> x.city).filter(Boolean))];
  if(srcSel.dataset.filled !== String(srcs.length)){
    const cur = recruitState.source;
    srcSel.innerHTML = '<option value="all">全部来源</option>' + srcs.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    srcSel.value = cur; srcSel.dataset.filled = String(srcs.length);
  }
  if(citySel.dataset.filled !== String(cities.length)){
    const cur = recruitState.city;
    citySel.innerHTML = '<option value="all">全部城市</option>' + cities.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    citySel.value = cur; citySel.dataset.filled = String(cities.length);
  }
}
function recruitRowHTML(it){
  const dl = it.deadline;
  const left = daysLeft(dl);
  let dlCls = 'rc-tag dl', dlTx = dl ? '截止 ' + dl.slice(5) : '';
  if(left !== null){
    if(left < 0){ dlCls += ' over'; dlTx = '已截止 ' + dl.slice(5); }
    else if(left <= 14){ dlCls += ' soon'; dlTx = '截止 ' + dl.slice(5) + '（剩 ' + left + ' 天）'; }
    else dlTx = '截止 ' + dl.slice(5) + '（剩 ' + left + ' 天）';
  }
  const titleHtml = it.url
    ? `<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>`
    : escapeHtml(it.title);
  const company = it.company ? `<span class="rc-tag">${escapeHtml(it.company)}</span>` : '';
  const city = it.city ? `<span class="rc-tag city">${escapeHtml(it.city)}</span>` : '';
  const src = `<span class="rc-tag src">${escapeHtml(it.sourceName || it.source || '')}</span>`;
  const dlTag = dlTx ? `<span class="${dlCls}">${dlTx}</span>` : '';
  const summary = it.summary ? `<div class="rc-summary">${escapeHtml(it.summary).slice(0, 180)}</div>` : '';
  return `<div class="rc-row" data-id="${it.id}">
    <div class="rc-top"><div class="rc-title">${titleHtml}</div><span class="rc-del" data-del-id="${it.id}">×</span></div>
    <div class="rc-tags">${company}${city}${src}${dlTag}</div>
    ${summary}
    <div class="rc-actions">
      <button class="rc-act interest ${it.interest ? 'on' : ''}" data-act="interest" data-id="${it.id}">⭐ 感兴趣</button>
      <button class="rc-act applied ${it.applied ? 'on' : ''}" data-act="applied" data-id="${it.id}">✅ 已投递</button>
    </div>
  </div>`;
}
function paintRecruit(){
  const items = recruitState.items;
  fillRecruitFilters(items);
  let view = items.slice();
  const st = recruitState.status, so = recruitState.source, ci = recruitState.city;
  if(st === 'interest') view = view.filter(x=> x.interest);
  else if(st === 'applied') view = view.filter(x=> x.applied);
  else if(st === 'todo') view = view.filter(x=> !x.applied);
  if(so !== 'all') view = view.filter(x=> (x.source || '') === so);
  if(ci !== 'all') view = view.filter(x=> (x.city || '') === ci);
  view.sort((a, b)=>{
    const da = a.deadline || '', db = b.deadline || '';
    if(da && db) return da.localeCompare(db);
    if(da) return -1; if(db) return 1; return 0;
  });
  const soon = view.filter(x=>{ const l = daysLeft(x.deadline); return l !== null && l >= 0 && l <= 14; }).length;
  const sum = $('#recruit-summary'); if(sum) sum.textContent = `共 ${view.length} 条 · 即将截止(≤14天) ${soon}`;
  const list = $('#recruit-list');
  if(!list) return;
  if(!view.length){ list.innerHTML = '<div class="empty">暂无符合条件的秋招信息</div>'; return; }
  list.innerHTML = view.map(recruitRowHTML).join('');
}
function renderRecruit(){
  if(!$('#recruit-list')) return;
  fetchRecruit().then(()=>{
    // 成功/未配置的处理已在 fetchRecruit 内完成（含提示与渲染），这里无需重复
  }).catch(()=>{
    recruitState.backend = false;
    const notice = $('#recruit-notice');
      if(notice){
      notice.style.display = '';
      notice.innerHTML = recruitState.srcMode === 'cloud'
        ? '⚠️ 云端数据获取失败。请检查「⚙️ 数据源」里填的 URL 是否正确，以及 GitHub Actions 是否已运行并生成 <b>recruit.json</b>。'
        : '⚠️ 秋招数据由本地后端提供。请在本机运行 <b>node server.js</b>（默认 <b>http://localhost:8080</b>），并通过该地址打开本页。未启动后端时无法获取 / 管理秋招信息。';
    }
    const list = $('#recruit-list'); if(list) list.innerHTML = '<div class="empty">后端未连接</div>';
    const sum = $('#recruit-summary'); if(sum) sum.textContent = '';
  });
}
async function patchRecruit(id, patch){
  if(recruitState.srcMode === 'cloud'){
    const ov = load(KEYS.recruitovers, { flags:{}, added:[], removed:[] });
    ov.flags = ov.flags || {};
    const cur = recruitState.items.find(x=> x.id === id) || {};
    ov.flags[id] = {
      interest: patch.interest !== undefined ? patch.interest : !!cur.interest,
      applied: patch.applied !== undefined ? patch.applied : !!cur.applied
    };
    save(KEYS.recruitovers, ov);
    const it = recruitState.items.find(x=> x.id === id);
    if(it) Object.assign(it, patch);
    paintRecruit(); renderDashboard();
    return;
  }
  try{
    const res = await fetch('/api/recruit/' + id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const updated = await res.json();
    const idx = recruitState.items.findIndex(x=> x.id === id);
    if(idx >= 0) recruitState.items[idx] = updated;
    paintRecruit(); renderDashboard();
  }catch(e){ toast('更新失败：后端未连接'); }
}
async function deleteRecruit(id){
  if(recruitState.srcMode === 'cloud'){
    const ov = load(KEYS.recruitovers, { flags:{}, added:[], removed:[] });
    ov.removed = (ov.removed || []).concat(id);
    save(KEYS.recruitovers, ov);
    recruitState.items = recruitState.items.filter(x=> x.id !== id);
    paintRecruit(); renderDashboard(); toast('已隐藏（仅本地）');
    return;
  }
  try{
    const res = await fetch('/api/recruit/' + id, { method:'DELETE' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    recruitState.items = recruitState.items.filter(x=> x.id !== id);
    paintRecruit(); renderDashboard(); toast('已删除');
  }catch(e){ toast('删除失败：后端未连接'); }
}

/* ================= 备份 / 恢复 ================= */
function exportData(){
  const data = { schedule, finance, fitness, diet, todo };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'workbench-backup-' + todayStr() + '.json';
  a.click();
  toast('数据已导出');
}
function importData(file){
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const d = JSON.parse(r.result);
      schedule = d.schedule || []; finance = d.finance || [];
      fitness = d.fitness || []; diet = d.diet || []; todo = d.todo || [];
      save(KEYS.schedule, schedule); save(KEYS.finance, finance);
      save(KEYS.fitness, fitness); save(KEYS.diet, diet); save(KEYS.todo, todo);
      renderAll(); toast('导入成功');
    }catch(e){ toast('导入失败：文件格式错误'); }
  };
  r.readAsText(file);
}

/* ================= 渲染全部 ================= */
function renderAll(){ renderDashboard(); renderSchedule(); renderFinance(); renderFitness(); renderDiet(); renderTodo(); }

/* ================= 初始化 ================= */
function init(){
  // 主题 / 资料 / 时钟
  applyTheme(localStorage.getItem(KEYS.theme) || 'light');
  applyProfile();
  setGreeting();
  tickClock();
  setInterval(tickClock, 1000);

  // 表单默认值
  $('#ev-date').value = todayStr(); $('#ev-start').value = '10:00'; $('#ev-end').value = '12:00';
  $('#fin-date').value = todayStr();
  $('#fit-date').value = todayStr();
  $('#diet-date').value = todayStr();
  $('#todo-date').value = todayStr();

  // 顶部导航切换
  $$('#nav .nav-item').forEach(b=> b.addEventListener('click', ()=> switchView(b.dataset.view)));

  // 卡片标题里的“全部 →”链接
  $$('.h3-link').forEach(l=> l.addEventListener('click', ()=> switchView(l.dataset.view)));

  // 快捷入口（九宫格）：跳转 or 备份
  $$('.quick').forEach(q=> q.addEventListener('click', ()=>{
    if(q.dataset.action === 'export'){ exportData(); return; }
    if(q.dataset.view) switchView(q.dataset.view);
  }));

  // 头像：点击编辑昵称 / 身份
  const avatar = $('#avatar');
  if(avatar) avatar.addEventListener('click', ()=>{
    const name = prompt('你的昵称', profile.name);
    if(name === null) return;
    const role = prompt('你的身份 / 标题', profile.role);
    profile.name = (name.trim()) || '我';
    profile.role = (role === null ? profile.role : (role.trim() || '个人工作台'));
    save(KEYS.profile, profile); applyProfile();
  });

  // 主题切换
  $('#themeToggle').addEventListener('click', ()=>{
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next); localStorage.setItem(KEYS.theme, next);
  });

  // 日程工具栏
  $('#sched-prev').addEventListener('click', ()=>navSchedule(-1));
  $('#sched-next').addEventListener('click', ()=>navSchedule(1));
  $('#sched-today').addEventListener('click', ()=>{ schedState.anchor = new Date(); renderSchedule(); });
  $$('.seg-btn').forEach(b=> b.addEventListener('click', ()=>{ schedState.mode = b.dataset.mode; renderSchedule(); }));
  // 日程日历：点格子看当天，点 × 删除
  $('#schedule-calendar').addEventListener('click', e=>{
    const x = e.target.closest('.chip-x');
    if(x){ e.stopPropagation(); deleteItem('schedule', x.dataset.delId); return; }
    const add = e.target.closest('.chip-add');
    if(add){ e.stopPropagation(); createTodoFromEvent(add.dataset.addId); return; }
    const cell = e.target.closest('.cal-cell, .day-col');
    if(cell && cell.dataset.date){ schedState.mode = 'day'; schedState.anchor = parseYMD(cell.dataset.date); renderSchedule(); }
  });

  // 重复方式切换
  $('#ev-recurrence').addEventListener('change', e=>{
    const once = e.target.value === 'once';
    $('#ev-date-wrap').style.display = once ? '' : 'none';
    $('#ev-wd-wrap').style.display = once ? 'none' : '';
  });

  // 财务交易类型切换（支出/收入/转账）
  $$('input[name=fintype]').forEach(r=> r.addEventListener('change', syncFinForm));
  syncFinForm();

  // 财务翻月
  $('#fin-prev').addEventListener('click', ()=>{ finState.anchor = addMonths(finState.anchor, -1); renderFinance(); });
  $('#fin-next').addEventListener('click', ()=>{ finState.anchor = addMonths(finState.anchor, 1); renderFinance(); });

  // 饮食日期切换
  $('#diet-date').addEventListener('change', e=>{ dietState.date = e.target.value || todayStr(); renderDiet(); });

  // 列表删除（财务/健身/饮食）
  $('#fin-list').addEventListener('click', e=>{ const d=e.target.closest('[data-del-id]'); if(d) deleteItem(d.dataset.delKind, d.dataset.delId); });
  $('#fit-list').addEventListener('click', e=>{ const d=e.target.closest('[data-del-id]'); if(d) deleteItem(d.dataset.delKind, d.dataset.delId); });
  $('#diet-list').addEventListener('click', e=>{ const d=e.target.closest('[data-del-id]'); if(d) deleteItem(d.dataset.delKind, d.dataset.delId); });

  // 概览今日待办：勾选完成 / “查看全部”链接
  $('#dash-todo-list').addEventListener('click', e=>{
    const more = e.target.closest('.more-link');
    if(more && more.dataset.view){ switchView(more.dataset.view); return; }
    const ck = e.target.closest('.mini-check');
    if(ck){ const it = todo.find(t=>t.id===ck.dataset.id); if(it){ it.done = ck.checked; save(KEYS.todo, todo); renderTodo(); renderDashboard(); } }
  });

  // 待办：增 / 删 / 勾选 / 拖拽排序
  $('#todo-form').addEventListener('submit', e=>{
    e.preventDefault();
    const text = $('#todo-input').value.trim();
    if(!text){ toast('请输入待办内容'); return; }
    todo.push({ id:uid(), text, done:false, date:todoState.date });
    save(KEYS.todo, todo);
    $('#todo-input').value = '';
    renderTodo(); renderDashboard(); toast('已添加');
  });
  $('#todo-date').addEventListener('change', e=>{ todoState.date = e.target.value || todayStr(); renderTodo(); });
  $('#todo-list').addEventListener('click', e=>{
    const sched = e.target.closest('.todo-sched');
    if(sched){ scheduleFromTodo(sched.dataset.schedId); return; }
    const stat = e.target.closest('.todo-stat');
    if(stat){ const it = todo.find(t=>t.id===stat.dataset.id); if(it){ it.done = !it.done; save(KEYS.todo, todo); renderTodo(); renderDashboard(); } return; }
    const del = e.target.closest('[data-del-id]');
    if(del){ deleteItem(del.dataset.delKind, del.dataset.delId); return; }
    const ck = e.target.closest('.todo-check');
    if(ck){ const it = todo.find(t=>t.id===ck.dataset.id); if(it){ it.done = ck.checked; save(KEYS.todo, todo); renderTodo(); renderDashboard(); } }
  });
  const todoListEl = $('#todo-list');
  let dragEl = null;
  todoListEl.addEventListener('dragstart', e=>{ dragEl = e.target.closest('.todo-row'); if(dragEl){ dragEl.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; } });
  todoListEl.addEventListener('dragend', ()=>{ if(dragEl) dragEl.classList.remove('dragging'); dragEl=null; });
  todoListEl.addEventListener('dragover', e=>{
    e.preventDefault();
    const dragging = todoListEl.querySelector('.dragging');
    if(!dragging) return;
    const after = getDragAfterElement(todoListEl, e.clientY);
    if(after == null) todoListEl.appendChild(dragging);
    else todoListEl.insertBefore(dragging, after);
  });
  todoListEl.addEventListener('drop', e=>{ e.preventDefault(); commitTodoOrder(); });

  // 隐藏的文件输入（用于恢复备份）
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'file'; hiddenInput.accept = 'application/json'; hiddenInput.style.display = 'none';
  hiddenInput.id = 'file-import';
  hiddenInput.addEventListener('change', e=>{ if(e.target.files[0]) importData(e.target.files[0]); });
  document.body.appendChild(hiddenInput);

  // 表单提交
  $('#schedule-form').addEventListener('submit', e=>{
    e.preventDefault();
    const title = $('#ev-title').value.trim();
    if(!title){ toast('请填写标题'); return; }
    const recurrence = $('#ev-recurrence').value;
    const start = $('#ev-start').value, end = $('#ev-end').value;
    if(start && end && start >= end){ toast('结束时间需晚于开始时间'); return; }
    let weekdays = [];
    if(recurrence === 'weekly'){
      weekdays = $$('input[name=wd]:checked').map(c=>+c.value);
      if(!weekdays.length){ toast('请选择重复的星期'); return; }
    }
    const ev = { id:uid(), title, location:$('#ev-location').value.trim(), recurrence,
      date:$('#ev-date').value, weekdays, start, end, category:$('#ev-category').value, note:$('#ev-note').value.trim() };
    if(pendingLinkTodoId){
      const tt = todo.find(x=>x.id===pendingLinkTodoId);
      if(tt){ tt.linkId = ev.id; ev.linkId = pendingLinkTodoId; save(KEYS.todo, todo); }
      pendingLinkTodoId = null;
    }
    schedule.push(ev);
    save(KEYS.schedule, schedule);
    e.target.reset();
    $('#ev-date-wrap').style.display=''; $('#ev-wd-wrap').style.display='none';
    $('#ev-date').value = todayStr(); $('#ev-start').value='10:00'; $('#ev-end').value='12:00';
    renderSchedule(); renderDashboard(); toast('已添加日程');
  });

  $('#finance-form').addEventListener('submit', e=>{
    e.preventDefault();
    const amount = parseFloat($('#fin-amount').value);
    if(!(amount>0)){ toast('请输入有效金额'); return; }
    const type = document.querySelector('input[name=fintype]:checked').value;
    const item = { id:uid(), type, amount, date:$('#fin-date').value, note:$('#fin-note').value.trim() };
    if(type==='transfer'){
      item.account = $('#fin-account').value;
      item.toAccount = $('#fin-toaccount').value;
      if(item.account === item.toAccount){ toast('转入账户不能相同'); return; }
      item.category = '转账';
    } else {
      item.account = $('#fin-account').value;
      item.category = $('#fin-category').value;
    }
    finance.push(item);
    save(KEYS.finance, finance);
    e.target.reset(); $('#fin-date').value = todayStr();
    syncFinForm();
    renderFinance(); renderDashboard(); toast('已记录');
  });

  $('#fitness-form').addEventListener('submit', e=>{
    e.preventDefault();
    const duration = parseFloat($('#fit-duration').value);
    if(!(duration>0)){ toast('请输入时长'); return; }
    fitness.push({ id:uid(), date:$('#fit-date').value, type:$('#fit-type').value,
      duration, note:$('#fit-note').value.trim() });
    save(KEYS.fitness, fitness);
    e.target.reset(); $('#fit-date').value = todayStr();
    renderFitness(); renderDashboard(); toast('打卡成功');
  });

  $('#diet-form').addEventListener('submit', e=>{
    e.preventDefault();
    const food = $('#diet-food').value.trim();
    if(!food){ toast('请填写食物'); return; }
    diet.push({ id:uid(), date:dietState.date, meal:$('#diet-meal').value,
      food, calories:parseFloat($('#diet-cal').value)||0, note:$('#diet-note').value.trim() });
    save(KEYS.diet, diet);
    e.target.reset(); $('#diet-date').value = dietState.date;
    renderDiet(); renderDashboard(); toast('已记录');
  });

  // 秋招：刷新 / 数据源切换 / 筛选 / 手动添加 / 列表操作
  const rcRefresh = $('#recruit-refresh'); if(rcRefresh) rcRefresh.addEventListener('click', ()=> renderRecruit());
  const rcSrc = $('#recruit-src');
  if(rcSrc) rcSrc.addEventListener('click', ()=>{
    const mode = prompt('秋招数据源\n输入 local = 本机后端（http://localhost:8080）\n输入 cloud = 云端 JSON（无需开机，GitHub Actions 每日自动抓取）', recruitState.srcMode);
    if(!mode) return;
    const m = mode.trim();
    if(m === 'cloud'){
      const u = prompt('云端 recruit.json 的 URL（jsDelivr 或 raw）：\n例：https://cdn.jsdelivr.net/gh/你的用户名/仓库名@main/recruit.json', recruitState.cloudUrl || '');
      if(u === null) return;
      recruitState.srcMode = 'cloud'; recruitState.cloudUrl = u.trim();
    } else if(m === 'local'){
      recruitState.srcMode = 'local';
    } else { toast('只支持 local 或 cloud'); return; }
    save(KEYS.recruitsrc, { mode: recruitState.srcMode, url: recruitState.cloudUrl });
    recruitState.items = []; renderRecruit(); toast('数据源：' + (recruitState.srcMode === 'cloud' ? '云端' : '本地后端'));
  });
  const rcStatus = $('#recruit-filter-status'); if(rcStatus) rcStatus.addEventListener('change', e=>{ recruitState.status = e.target.value; paintRecruit(); });
  const rcSource = $('#recruit-filter-source'); if(rcSource) rcSource.addEventListener('change', e=>{ recruitState.source = e.target.value; paintRecruit(); });
  const rcCity = $('#recruit-filter-city'); if(rcCity) rcCity.addEventListener('change', e=>{ recruitState.city = e.target.value; paintRecruit(); });
  const rcForm = $('#recruit-form');
  if(rcForm) rcForm.addEventListener('submit', async e=>{
    e.preventDefault();
    const title = $('#rc-title').value.trim();
    if(!title){ toast('请填写标题'); return; }
    if(recruitState.srcMode === 'cloud'){
      const item = {
        id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
        title, company: $('#rc-company').value.trim(), url: $('#rc-url').value.trim(),
        city: $('#rc-city').value.trim(), deadline: $('#rc-deadline').value, summary: $('#rc-note').value.trim(),
        source: 'manual', sourceName: '手动添加', publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(), tags: ['2027', '秋招'], interest:false, applied:false
      };
      const ov = load(KEYS.recruitovers, { flags:{}, added:[], removed:[] });
      ov.added = ov.added || []; ov.added.unshift(item);
      save(KEYS.recruitovers, ov);
      recruitState.items.unshift(item);
      e.target.reset();
      paintRecruit(); renderDashboard(); toast('已添加（仅本地）');
      return;
    }
    const payload = {
      title,
      company: $('#rc-company').value.trim(),
      url: $('#rc-url').value.trim(),
      city: $('#rc-city').value.trim(),
      deadline: $('#rc-deadline').value,
      summary: $('#rc-note').value.trim(),
      tags: ['2027', '秋招']
    };
    try{
      const res = await fetch('/api/recruit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const item = await res.json();
      recruitState.items.unshift(item);
      e.target.reset();
      paintRecruit(); renderDashboard(); toast('已添加');
    }catch(err){ toast('添加失败：后端未连接'); }
  });
  const rcList = $('#recruit-list');
  if(rcList) rcList.addEventListener('click', e=>{
    const del = e.target.closest('.rc-del');
    if(del){ deleteRecruit(del.dataset.delId); return; }
    const act = e.target.closest('.rc-act');
    if(act){
      const cur = recruitState.items.find(x=> x.id === act.dataset.id);
      if(cur) patchRecruit(act.dataset.id, { [act.dataset.act]: !cur[act.dataset.act] });
    }
  });

  // 卡片折叠 + 移动端默认折叠
  setupCollapsibleCards();
  applyMobileCollapse();
  // 导航栏拖拽排序（顺序持久化）
  applyNavOrder();
  setupNavSort();
  let resizeT;
  window.addEventListener('resize', ()=>{ clearTimeout(resizeT); resizeT = setTimeout(applyMobileCollapse, 150); });

  // 秋招云端数据源：读取设置，必要时预拉取（让概览页提醒也能用）
  const _rs = load(KEYS.recruitsrc, { mode:'local', url:'' });
  recruitState.srcMode = _rs.mode || 'local';
  recruitState.cloudUrl = _rs.url || '';
  if(recruitState.srcMode === 'cloud' && recruitState.cloudUrl){
    fetchRecruit().catch(()=>{});
  }

  renderAll();
}

init();
