(()=>{
const API=(window.API_URL||'http://localhost:3000').replace(/\/$/,''),EXT=!!(window.chrome&&chrome.runtime&&chrome.runtime.id&&chrome.storage);
const CROWN='<span class="crown">👑<i></i><i></i><i></i></span>',ADM='<div class="adm"><label>Admin · change price</label><div class="r"><input id="av" placeholder="Value"><button data-a="mul">×</button><button data-a="div">÷</button><button data-a="add">+</button><button data-a="sub">−</button><button data-a="set">Set</button></div></div>';
let lbData=[],tok,S,spark={},ws,view='home',tabs=[],cur=null,lbT=0,toastT,chart,series,last,tab;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const f=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}),sg=n=>(n>=0?'+':'−')+f(Math.abs(n)),cl=n=>n>=0?'up':'dn';
const store={get:async()=>EXT?(await chrome.storage.local.get('t')).t:sessionStorage.getItem('t'),set:t=>EXT?chrome.storage.local.set({t}):sessionStorage.setItem('t',t),del:()=>EXT?chrome.storage.local.remove('t'):sessionStorage.removeItem('t')};
async function api(p,body){const r=await fetch(API+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if((r.status===401||r.status===403)&&tok&&!p.startsWith('/api/login')&&!p.startsWith('/api/admin'))logout(j.error);if(!r.ok)throw new Error(j.error||'Request failed');return j}
async function logout(msg){await store.del();tok=null;S=null;if(ws){ws.onclose=null;ws.close()}loginUI(typeof msg==='string'?msg:'')}
function loginUI(msg=''){$('#app').innerHTML=`<div class="login"><h1>Akei Payday II</h1><input id="u" placeholder="Username" autocomplete="username"><input id="p" type="password" placeholder="Password" autocomplete="current-password"><button id="li" class="pri">Login</button><button id="ca">Create account</button><div class="err">${msg}</div></div>`;
 const go=async path=>{try{const r=await api(path,{username:$('#u').value.trim(),password:$('#p').value});tok=r.token;await store.set(tok);start()}catch(e){loginUI(e.message)}};
 $('#li').onclick=()=>go('/api/login');$('#ca').onclick=()=>go('/api/register');$('#p').onkeydown=e=>e.key==='Enter'&&go('/api/login')}
const calc=()=>{let val=0,cost=0;S.stocks.forEach(s=>{const h=S.holdings[s.id];if(h){val+=h.shares*s.price;cost+=h.cost}});const net=S.user.cash+val;return{val,cost,net,profit:net-20000}};
function shell(){$('#app').innerHTML=(EXT?'':`<aside><h2>Akei Payday II</h2>${[['home','Dashboard'],['portfolio','Portfolio'],['history','Transactions'],['lb','Leaderboard'],['settings','Settings'],['logout','Logout']].map(([v,n])=>`<button data-v="${v}">${n}</button>`).join('')}</aside>`)+'<main><div id="top"></div><div id="tabs"></div><div id="view"></div></main>'}
function paintTop(){const c=calc();$('#top').innerHTML=`<div class="user"><span>${S.user.username}${S.user.admin?CROWN:''}</span>${EXT?'<button id="lo" class="sm" data-v="logout">Logout</button>':''}</div><div class="stats"><div><label>Net worth</label><b>$${f(c.net)}</b></div><div><label>Cash</label><b>$${f(S.user.cash)}</b></div><div><label>Portfolio value</label><b>$${f(c.val)}</b></div><div><label>Profit / loss</label><b class="${cl(c.profit)}">${sg(c.profit)}</b></div></div>`}
function paintTabs(){const t=$('#tabs');if(EXT){t.innerHTML=view==='stock'?'<button id="back" class="sm">← Back</button>':'';return}
 t.innerHTML=`<span class="tab ${view==='home'?'on':''}" data-v="home">Dashboard</span>`+tabs.map(x=>`<span class="tab ${view==='stock'&&cur===x.id?'on':''}" data-t="${x.id}">${S.stocks[x.id].name}<i data-x="${x.id}">×</i></span>`).join('')+`<select id="add"><option value="">+ Open stock</option>${S.stocks.filter(s=>!tabs.some(x=>x.id===s.id)).map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>`}
function render(){paintTop();paintTabs();const el=$('#view'),V={home,stock:detail,portfolio,history:hist,lb,settings};V[view](el);$$('aside [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===view))}
function open(id){let t=tabs.find(x=>x.id===id);if(!t){t={id,range:'6m',type:'line'};if(EXT)tabs=[];tabs.push(t)}cur=id;view='stock';render()}
const act=id=>`<div class="act" data-id="${id}">${['buy','sell'].map(x=>`<div class="slot" data-side="${x}"><button class="go ${x}">${x.toUpperCase()}</button></div>`).join('')}</div>`;
const card=s=>`<div class="card" data-id="${s.id}"><div class="nm">${s.name}</div><div class="row"><span class="cp"></span><span class="cc"></span></div><svg class="cs" viewBox="0 0 100 30" preserveAspectRatio="none"></svg><div class="row"><span class="csh"></span><b class="cl"></b></div>${act(s.id)}</div>`;
function home(el){el.innerHTML=`<div class="grid">${S.stocks.map(card).join('')}</div>`;paintCards()}
function paintCards(){$$('.card').forEach(c=>{const s=S.stocks[+c.dataset.id],h=S.holdings[s.id],ch=(s.price/s.prev-1)*100,pl=h?h.shares*s.price-h.cost:0;
 $('.cp',c).textContent='$'+f(s.price);const e=$('.cc',c);e.textContent=sg(ch)+'%';e.className='cc '+cl(ch);$('.csh',c).textContent=h?f(h.shares,4)+' shares':'No shares';const l=$('.cl',c);l.textContent=h?sg(pl):'—';l.className='cl '+cl(pl);
 const a=(spark[s.id]||[]).concat(s.price),mn=Math.min(...a),mx=Math.max(...a);$('.cs',c).innerHTML=`<polyline fill="none" stroke="${a[a.length-1]>=a[0]?'#22c55e':'#ef4444'}" stroke-width="1.5" vector-effect="non-scaling-stroke" points="${a.map((v,i)=>(i/(a.length-1)*100).toFixed(1)+','+(28-(v-mn)/((mx-mn)||1)*26).toFixed(1)).join(' ')}"/>`})}
function detail(el){tab=tabs.find(x=>x.id===cur);const s=S.stocks[cur];
 el.innerHTML=`<div class="dh"><h2>${s.name}</h2><div><b id="dp"></b> <span id="dc"></span></div></div><div id="ds" class="ds"></div><div class="ctl"><div>${['5y','1y','6m','3m','1m'].map(r=>`<button class="sm rg ${tab.range===r?'on':''}" data-r="${r}">${r.toUpperCase()}</button>`).join(' ')}</div><div>${[['line','Line'],['candle','Candles']].map(([k,n])=>`<button class="sm ty ${tab.type===k?'on':''}" data-ty="${k}">${n}</button>`).join(' ')}</div></div><div id="ch"></div>${act(cur)}${S.user.admin?ADM:''}`;paintDetail();drawChart()}
function paintDetail(){const s=S.stocks[cur],h=S.holdings[cur],ch=(s.price/s.prev-1)*100,sh=h?h.shares:0,un=h?sh*s.price-h.cost:0;$('#dp').textContent='$'+f(s.price);const e=$('#dc');e.textContent=sg(ch)+'%';e.className=cl(ch);
 $('#ds').innerHTML=[['Shares owned',f(sh,4)],['Avg purchase price','$'+f(h?h.cost/sh:0)],['Unrealized P/L',`<span class="${cl(un)}">${sg(un)}</span>`],['Realized P/L (all sales)',`<span class="${cl(S.user.realized)}">${sg(S.user.realized)}</span>`]].map(([a,b])=>`<div><label>${a}</label><b>${b}</b></div>`).join('')}
async function drawChart(){const el=$('#ch');if(!el)return;if(chart){chart.remove();chart=null}const id=cur,t=tab;let d;try{d=await api(`/api/candles/${id}?range=${t.range}`)}catch{return}
 if(cur!==id||!$('#ch')||!d.length)return;
 chart=LightweightCharts.createChart(el,{layout:{background:{color:'#08101f'},textColor:'#8693ad'},grid:{vertLines:{color:'#16223b'},horzLines:{color:'#16223b'}},width:el.clientWidth,height:EXT?210:420,rightPriceScale:{borderColor:'#1c2a48'},timeScale:{borderColor:'#1c2a48'}});
 const up=d[d.length-1].c>=d[0].o,G='#22c55e',R='#ef4444';
 if(t.type==='line'){series=chart.addLineSeries({color:up?G:R,lineWidth:2});series.setData(d.map(x=>({time:x.t,value:x.c})))}
 else{series=chart.addCandlestickSeries({upColor:G,downColor:R,borderUpColor:G,borderDownColor:R,wickUpColor:G,wickDownColor:R});series.setData(d.map(x=>({time:x.t,open:x.o,high:x.h,low:x.l,close:x.c})))}
 last=d[d.length-1];chart.timeScale().fitContent()}
function live(){if(!series||!last||!tab)return;const p=S.stocks[cur].price;last.c=p;last.h=Math.max(last.h,p);last.l=Math.min(last.l,p);series.update(tab.type==='line'?{time:last.t,value:p}:{time:last.t,open:last.o,high:last.h,low:last.l,close:last.c})}
const tbl=(h,rows)=>`<div class="tw"><table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</table></div>`;
function portfolio(el){const rows=S.stocks.filter(s=>S.holdings[s.id]).map(s=>{const h=S.holdings[s.id],v=h.shares*s.price,pl=v-h.cost;return[`<a data-o="${s.id}">${s.name}</a>`,f(h.shares,4),'$'+f(h.cost/h.shares),'$'+f(s.price),'$'+f(h.cost),'$'+f(v),`<span class="${cl(pl)}">${sg(pl)}</span>`,`<span class="${cl(pl)}">${sg(pl/h.cost*100)}%</span>`]});
 el.innerHTML='<h2>Portfolio</h2>'+(rows.length?tbl(['Company','Shares','Avg price','Price','Cost','Value','P/L','Return'],rows):'<p>You do not own any shares yet. Open the dashboard and press BUY.</p>')}
async function hist(el){let d;try{d=await api('/api/history')}catch{return}if(view!=='history')return;el.innerHTML='<h2>Transactions</h2>'+(d.length?tbl(['Company','Type','Shares','Price','Total','Date'],d.map(x=>[S.stocks[x.sym].name,`<span class="${x.side==='buy'?'up':'dn'}">${x.side.toUpperCase()}</span>`,f(x.shares,4),'$'+f(x.price),'$'+f(x.total),new Date(x.ts).toLocaleString()])):'<p>No transactions yet.</p>')}
async function lb(el){lbT=Date.now();let d;try{d=await api('/api/leaderboard')}catch{return}if(view!=='lb')return;lbData=d;el.innerHTML='<h2>Leaderboard</h2>'+tbl(['Rank','Player','Net worth','Profit','Return'],d.map((r,i)=>[i+1,(S.user.admin?`<a data-u="${r.username}">${r.username}</a>`:r.username)+(r.crown?CROWN:'')+(r.username===S.user.username?' (you)':'')+(r.banned?' <span class="dn">[banned]</span>':''),'$'+f(r.net),`<span class="${cl(r.profit)}">${sg(r.profit)}</span>`,`<span class="${cl(r.ret)}">${sg(r.ret)}%</span>`]))}
function settings(el){el.innerHTML=`<h2>Settings</h2><p>Signed in as <b>${S.user.username}</b>. Starting balance: $20,000.</p><button data-v="logout">Logout</button>`}
function toast(m,b){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.append(t)}t.textContent=m;t.className=b?'bad show':'show';clearTimeout(toastT);toastT=setTimeout(()=>t.className='',2500)}
async function slot(e){e.stopPropagation();const b=e.target.closest('button');if(!b)return;const sl=b.closest('.slot'),a=sl.parentElement,side=sl.dataset.side,id=+a.dataset.id;
 const reset=()=>{a.classList.remove('ed');$$('.slot',a).forEach(x=>{x.classList.remove('sel');x.innerHTML=`<button class="go ${x.dataset.side}">${x.dataset.side.toUpperCase()}</button>`})};
 if(b.classList.contains('go')){reset();a.classList.add('ed');sl.classList.add('sel');sl.innerHTML=`<input inputmode="decimal" placeholder="${side==='buy'?'$ amount':'shares'}"><button class="mx">MAX</button><button class="ok">✓</button><button class="x">✕</button>`;$('input',sl).focus()}
 else if(b.classList.contains('x'))reset();
 else if(b.classList.contains('mx')){const i=$('input',sl);i.value=side==='buy'?Math.floor(S.user.cash*100)/100:(S.holdings[id]?S.holdings[id].shares:0);i.dataset.max=1}
 else if(b.classList.contains('ok')){const i=$('input',sl);try{S=await api('/api/trade/'+side,{id,value:i.value,max:!!i.dataset.max});reset();paintTop();paintCards();if(view==='stock')paintDetail();toast(side==='buy'?'Purchase complete':'Sale complete')}catch(er){toast(er.message,1)}}}
async function aact(op){try{await api('/api/admin/stock',{id:cur,op,value:$('#av').value});toast('Price updated')}catch(er){toast(er.message,1)}}
function pm(u){const r=lbData.find(x=>x.username===u)||{},d=document.createElement('div');d.id='modal';d.dataset.u=u;d.innerHTML=`<div class="box"><h3>${u}</h3><p>Cash: $${f(r.cash||0)}${r.banned?' · banned':''}</p><input id="ma" placeholder="Amount"><div class="r"><button data-m="set">Set</button><button data-m="add">Add</button><button data-m="sub">Take away</button></div><div class="r"><button data-m="${r.banned?'unban':'ban'}">${r.banned?'Unban':'Ban'}</button><button data-m="close">Close</button></div></div>`;document.body.append(d)}
async function mact(op){const md=$('#modal'),u=md.dataset.u;if(op==='close')return md.remove();try{if(op==='ban'||op==='unban')await api('/api/admin/ban',{username:u,banned:op==='ban'});else await api('/api/admin/money',{username:u,op,amount:$('#ma').value});md.remove();S=await api('/api/state');paintTop();toast('Done');if(view==='lb')lb($('#view'))}catch(er){toast(er.message,1)}}
document.addEventListener('input',e=>{if(e.target.dataset&&e.target.dataset.max)delete e.target.dataset.max});
document.addEventListener('change',e=>{if(e.target.id==='add'&&e.target.value!=='')open(+e.target.value)});
document.addEventListener('click',e=>{const t=e.target,g=s=>t.closest(s);if(!S)return;
 if(g('.slot'))return slot(e);
 const m=g('[data-m]');if(m)return mact(m.dataset.m);const ad=g('[data-a]');if(ad)return aact(ad.dataset.a);const un=g('[data-u]');if(un)return pm(un.dataset.u);
 const v=g('[data-v]'),x=g('[data-x]'),tt=g('[data-t]'),o=g('[data-o]'),rg=g('.rg'),ty=g('.ty'),c=g('.card');
 if(x){const id=+x.dataset.x;tabs=tabs.filter(k=>k.id!==id);if(cur===id){if(tabs.length){cur=tabs[tabs.length-1].id}else view='home'}render()}
 else if(tt)open(+tt.dataset.t);else if(o)open(+o.dataset.o);
 else if(v){if(v.dataset.v==='logout')logout();else{view=v.dataset.v;render()}}
 else if(g('#back')){view='home';render()}
 else if(rg){tab.range=rg.dataset.r;$$('.rg').forEach(b=>b.classList.toggle('on',b===rg));drawChart()}
 else if(ty){tab.type=ty.dataset.ty;$$('.ty').forEach(b=>b.classList.toggle('on',b===ty));drawChart()}
 else if(c)open(+c.dataset.id)});
function connect(){ws=new WebSocket(API.replace(/^http/,'ws')+'/ws?token='+tok);
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type!=='prices'||!S)return;m.p.forEach((p,i)=>{S.stocks[i].price=p;S.stocks[i].prev=m.prev[i]});paintTop();paintCards();
  if(view==='stock'){paintDetail();live()}else if(view==='portfolio')portfolio($('#view'));else if(view==='lb'&&Date.now()-lbT>10000)lb($('#view'))};
 ws.onclose=()=>{if(tok)setTimeout(connect,3000)}}
async function start(){try{S=await api('/api/state');spark=await api('/api/spark')}catch(e){return loginUI(tok?'Cannot reach server: '+e.message:e.message)}
 view='home';tabs=[];shell();connect();render()}
if(EXT)document.body.classList.add('ext');else document.getElementById('app').className='web';
(async()=>{tok=await store.get();tok?start():loginUI()})();
})();
