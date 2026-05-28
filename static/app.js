const $=s=>document.querySelector(s);const $$=s=>document.querySelectorAll(s);
function toast(t){const x=$('#toast'); if(!x)return; x.textContent=t; x.className='show'; setTimeout(()=>x.className='',1800)}
function syncScanUI(){const auto=$('#scanType')?.value==='auto'; $$('.manualOnly').forEach(e=>e.style.display=auto?'none':'block'); const b=$('#mainRunBtn'); if(b)b.textContent=auto?'Scan Best Setup':'Generate Signal'}
function setAutoAndScan(){const st=$('#scanType'); if(st){st.value='auto'; syncScanUI(); runMain()}}
async function post(url,data){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let j=null;try{j=await r.json()}catch(e){};if(!r.ok){throw new Error((j&&j.detail)||(j&&j.error)||('HTTP '+r.status))}return j}
function cleanTekoraText(v){return String(v).replace(/\bV\d+(?:\.\d+)?(?:_[A-Z0-9_]+)?\b/g,'Tekora').replace(/Phase 1 Core/gi,'Core').replace(/EXE Later only after core is 100%/gi,'').replace(/V\d+[^•\n]*•/g,'Tekora •')}
function fmt(v){return (v===undefined||v===null)?'—':(typeof v==='string'?cleanTekoraText(v):v)}
function copyText(t){navigator.clipboard?.writeText(String(t));toast('Copied ✅')}
function fullSignal(s){return `${s.symbol} ${s.timeframe} ${s.direction}\nAction: ${s.action}\n${s.entry_label}: ${s.entry_value}\nSL: ${s.stop_loss}\nTP1: ${s.tp1}\nTP2: ${s.tp2}\nTP3: ${s.tp3}\nScore: ${s.score}/100\nReason: ${s.ai_explanation}\nNot financial advice.`}
function signalCard(s){const score=s.score||0;return `<article class="signal glass"><div class="sigTop"><div><span class="eyebrow">Best execution setup • Auto tracked</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${s.action}</span><span>${s.direction}</span><span>${s.grade}</span><span>${score}/100</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b></div></div><div class="fieldGrid"><div class="field"><span>${s.entry_label}</span><b>${fmt(s.entry_value)}</b></div><div class="field"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Master Bias</span><b>${fmt(s.master_bias)}</b></div><div class="field"><span>Action</span><b>${fmt(s.action)}</b></div><div class="field"><span>Trend</span><b>${fmt(s.trend)}</b></div><div class="field"><span>BOS / MSS</span><b>${fmt(s.bos)} • ${fmt(s.mss)}</b></div><div class="field"><span>Liquidity</span><b>${fmt(s.liquidity)}</b></div><div class="field"><span>FVG</span><b>${fmt(s.fvg)}</b></div><div class="field"><span>Order Block</span><b>${fmt(s.order_block)}</b></div><div class="field"><span>MTF</span><b>${fmt(s.mtf)}</b></div><div class="field"><span>Regime</span><b>${fmt(s.regime)}</b></div><div class="field"><span>Delta Proxy</span><b>${fmt(s.delta_proxy)}</b></div><div class="field"><span>Valid Until</span><b>${new Date((s.valid_until||0)*1000).toLocaleTimeString()}</b></div></div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button><button class="smallBtn" onclick="this.closest('.signal').querySelector('.quality').classList.toggle('open')">Quality Breakdown</button></div><div class="quality"><p>${s.ai_explanation}</p><ul>${(s.reasons||[]).map(r=>`<li>${r}</li>`).join('')}</ul></div></article>`}
async function runMain(){const scanType=$('#scanType')?.value||'manual',mode=$('#mode')?.value||'scalp',timeframe=$('#timeframe')?.value||'15m'; const res=$('#results'); res.className='results'; res.innerHTML='<div class="emptyState"><h2>Engine scanning...</h2><p>Reading live MEXC data and filtering weak setups.</p></div>'; try{if(scanType==='auto'){const d=await post('/api/scan',{mode,timeframe,universe:'top30'}); $('#stats').innerHTML=`<div class="stat"><span>Scanned Jobs</span><b>${d.scanned_jobs}</b></div><div class="stat"><span>Mode</span><b>${d.mode}</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time}s</b></div><div class="stat"><span>Generated</span><b>${d.generated}</b></div>`; res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No premium setup</h2><p>Engine filtered everything. That is better than forcing a bad trade.</p></div>'}else{const symbol=$('#symbol')?.value||'BTCUSDT'; const s=await post('/api/signal',{symbol,timeframe,mode}); $('#stats').innerHTML=`<div class="stat"><span>Symbol</span><b>${s.symbol}</b></div><div class="stat"><span>Mode</span><b>${s.mode}</b></div><div class="stat"><span>Score</span><b>${s.score}</b></div><div class="stat"><span>Status</span><b>Tracked</b></div>`; res.innerHTML=signalCard(s)} toast('Signal generated + added to Live/Journal ✅')}catch(e){res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>Check internet/API and terminal logs.</p></div>'}}
function tradeCard(t){const timeline=(t.timeline||[]).slice(-4).map(x=>`${x.time} ${x.event}`).join(' → ');return `<article class="signal glass"><div class="sigTop"><div><span class="eyebrow">${t.source||'tracked'} • ${t.updated||''}</span><h2>${t.symbol} <small>${t.timeframe}</small></h2><div class="chips"><span>${t.status}</span><span>${t.direction}</span><span>RR ${fmt(t.rr)}</span><span>${t.be_moved?'BE MOVED':'RUNNING'}</span></div></div><div class="scoreRing" style="--score:${Math.max(0,Math.min(100,t.progress||0))}"><b>${t.progress||0}%</b></div></div><div class="fieldGrid"><div class="field"><span>${t.entry_label}</span><b>${fmt(t.entry_value)}</b></div><div class="field"><span>Current</span><b>${fmt(t.current_price)}</b></div><div class="field"><span>SL</span><b>${fmt(t.stop_loss)}</b></div><div class="field"><span>TP1 / TP2 / TP3</span><b>${fmt(t.tp1)} • ${fmt(t.tp2)} • ${fmt(t.tp3)}</b></div><div class="field"><span>Timeline</span><b>${timeline||'ENTRY TRACKED'}</b></div><div class="field"><span>Score</span><b>${t.score}/100</b></div></div></article>`}
async function loadTrades(){const el=$('#liveTrades'); if(!el)return; const d=await fetch('/api/trades').then(r=>r.json()); el.innerHTML=d.length?d.map(tradeCard).join(''):'<div class="emptyState"><h2>No live trades yet</h2><p>Generate a signal and it appears here automatically.</p></div>'}
async function loadJournal(){const st=$('#journalStats'),rc=$('#journalRecent'); if(!st||!rc)return; const j=await fetch('/api/journal').then(r=>r.json()); st.innerHTML=`<div class="stat"><span>Total</span><b>${j.total}</b></div><div class="stat"><span>Active</span><b>${j.active}</b></div><div class="stat"><span>Win Rate</span><b>${j.win_rate}%</b></div><div class="stat"><span>RR Total</span><b>${j.rr_total}</b></div>`; rc.innerHTML=(j.recent||[]).length?j.recent.map(tradeCard).join(''):'<div class="emptyState"><h2>No journal records</h2><p>Generated signals are logged here automatically.</p></div>'}
function boot(){syncScanUI(); loadTrades(); loadJournal(); setInterval(loadTrades,10000); setInterval(loadJournal,12000); const th=$('#themeToggle'); const saved=localStorage.getItem('tekoraTheme'); if(saved==='light')document.body.classList.add('light'); if(th)th.innerHTML=`<span>${document.body.classList.contains('light')?'☀️':'🌙'}</span>`; th?.addEventListener('click',()=>{document.body.classList.toggle('light'); localStorage.setItem('tekoraTheme',document.body.classList.contains('light')?'light':'dark'); th.innerHTML=`<span>${document.body.classList.contains('light')?'☀️':'🌙'}</span>`}); $('#menuBtn')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'))}
document.addEventListener('DOMContentLoaded',boot);

// ===== Tekora V6 UI Engine: live market ribbon + perfect theme switching =====
async function loadMarketTicker(){
  const el=document.getElementById('ticker'); if(!el)return;
  const fallback=[{symbol:'BTCUSDT',price:'Live',change:0.26},{symbol:'ETHUSDT',price:'Live',change:-0.10},{symbol:'SOLUSDT',price:'Live',change:0.42},{symbol:'SUIUSDT',price:'Live',change:0.18},{symbol:'BNBUSDT',price:'Live',change:-0.06},{symbol:'XRPUSDT',price:'Live',change:0.12}];
  let items=fallback;
  try{const r=await fetch('/api/ticker'); if(r.ok)items=await r.json()}catch(e){}
  const html=items.concat(items).map(x=>{const n=parseFloat(x.change)||0;return `<span class="tick"><b>${x.symbol}</b><small>${x.price}</small><em class="${n>=0?'up':'down'}">${n>=0?'+':''}${n}%</em></span>`}).join('');
  el.innerHTML=`<div class="tickerTrack">${html}</div>`;
}
function applyTheme(mode){
  const isLight=mode==='light'; document.body.classList.toggle('light',isLight);
  const btn=document.getElementById('themeToggle'); if(btn){btn.classList.add('spin'); btn.innerHTML=`<span>${isLight?'☀️':'🌙'}</span>`; setTimeout(()=>btn.classList.remove('spin'),360)}
  localStorage.setItem('tekoraTheme',isLight?'light':'dark');
}
function patchTheme(){
  const saved=localStorage.getItem('tekoraTheme')||'dark'; applyTheme(saved);
  const btn=document.getElementById('themeToggle'); if(btn){const fresh=btn.cloneNode(true); btn.parentNode.replaceChild(fresh,btn); fresh.addEventListener('click',()=>applyTheme(document.body.classList.contains('light')?'dark':'light'))}
}
document.addEventListener('DOMContentLoaded',()=>{patchTheme(); loadMarketTicker(); setInterval(loadMarketTicker,60000)});


// ===== TEKORA V7 GOD DASHBOARD OVERRIDES =====
function componentBars(s){const c=s.score_components||{};return Object.entries(c).map(([k,v])=>`<div class="qbar"><span>${k.replace('_',' ')}</span><b>${v}</b><i style="width:${Math.max(5,Math.min(100,v*5))}%"></i></div>`).join('')}
function signalCard(s){const score=s.score||0;return `<article class="signal glass godSignal"><div class="sigTop"><div><span class="eyebrow">Best execution setup • Auto tracked</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${s.action}</span><span>${s.direction}</span><span>${s.grade}</span><span>${score}/100</span><span>RR ${s.rr_plan||'—'}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b><small>/100</small></div></div><div class="godSummary"><div><span>Regime</span><b>${fmt(s.regime)}</b></div><div><span>Inducement</span><b>${fmt(s.inducement)}</b></div><div><span>Absorption</span><b>${fmt(s.absorption)}</b></div><div><span>MTF</span><b>${fmt(s.mtf)}</b></div></div><div class="fieldGrid"><div class="field hot"><span>${s.entry_label}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Master Bias</span><b>${fmt(s.master_bias)}</b></div><div class="field"><span>Action</span><b>${fmt(s.action)}</b></div><div class="field"><span>Trend</span><b>${fmt(s.trend)}</b></div><div class="field"><span>Structure</span><b>${fmt(s.internal_structure)}</b></div><div class="field"><span>Liquidity</span><b>${fmt(s.liquidity)}</b></div><div class="field"><span>FVG</span><b>${fmt(s.fvg)}</b></div><div class="field"><span>Order Block</span><b>${fmt(s.order_block)}</b></div><div class="field"><span>Delta</span><b>${fmt(s.delta_proxy)}</b></div><div class="field"><span>RSI</span><b>${fmt(s.rsi)}</b></div><div class="field"><span>ATR %</span><b>${fmt(s.atr_pct)}</b></div><div class="field"><span>Valid Until</span><b>${new Date((s.valid_until||0)*1000).toLocaleTimeString()}</b></div></div><div class="qualityMatrix">${componentBars(s)}</div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button><button class="smallBtn" onclick="this.closest('.signal').querySelector('.quality').classList.toggle('open')">Why This?</button></div><div class="quality"><p>${s.ai_explanation}</p><ul>${(s.reasons||[]).map(r=>`<li>${r}</li>`).join('')}</ul></div></article>`}
async function loadDashMini(){const el=document.getElementById('dashLiveMini'); if(!el)return; try{const d=await fetch('/api/trades').then(r=>r.json()); el.innerHTML=d.length?d.slice(0,2).map(t=>`<div class="miniTrade"><b>${t.symbol} ${t.timeframe}</b><span>${t.status} • ${t.direction} • RR ${fmt(t.rr)}</span><i style="width:${Math.max(2,Math.min(100,t.progress||0))}%"></i></div>`).join(''):'<div class="emptyMini">Generate a signal to start live monitoring.</div>'}catch(e){}}
document.addEventListener('DOMContentLoaded',()=>{loadDashMini();setInterval(loadDashMini,9000)});

// ===== V8 mobile drawer + safer live status rendering =====
function closeMobileSidebar(){
  const side=document.getElementById('sidebar');
  if(side){ side.classList.remove('open'); }
  document.body.classList.remove('sidebarOpen');
}
function openMobileSidebar(){
  const side=document.getElementById('sidebar');
  if(side){ side.classList.add('open'); }
  document.body.classList.add('sidebarOpen');
}
function installMobileDrawerFix(){
  const menu=document.getElementById('menuBtn');
  const side=document.getElementById('sidebar');
  const overlay=document.getElementById('mobileOverlay');
  if(menu){
    const fresh=menu.cloneNode(true); menu.parentNode.replaceChild(fresh,menu);
    fresh.addEventListener('click',(e)=>{e.preventDefault(); e.stopPropagation(); side?.classList.contains('open')?closeMobileSidebar():openMobileSidebar();});
  }
  overlay?.addEventListener('click',closeMobileSidebar);
  side?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMobileSidebar));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileSidebar()});
}
function tradeCard(t){
  const timeline=(t.timeline||[]).slice(-4).map(x=>`${x.time} ${x.event}`).join(' → ');
  const pending = (t.status==='WAITING ENTRY' || t.status==='SIGNAL ONLY' || t.status==='EXPIRED');
  const progress = pending ? 0 : (t.progress||0);
  return `<article class="signal glass ${pending?'pendingTrade':''}"><div class="sigTop"><div><span class="eyebrow">${t.source||'tracked'} • ${t.updated||''}</span><h2>${t.symbol} <small>${t.timeframe}</small></h2><div class="chips"><span>${t.status}</span><span>${t.direction}</span><span>${pending?'Entry not filled yet':'RR '+fmt(t.rr)}</span><span>${t.be_moved?'BE MOVED':(t.entry_filled?'LIVE':'PENDING')}</span></div></div><div class="scoreRing" style="--score:${Math.max(0,Math.min(100,progress))}"><b>${progress}%</b></div></div><div class="fieldGrid"><div class="field"><span>${t.entry_label}</span><b>${fmt(t.entry_value)}</b></div><div class="field"><span>Current</span><b>${fmt(t.current_price)}</b></div><div class="field"><span>SL</span><b>${fmt(t.stop_loss)}</b></div><div class="field"><span>TP1 / TP2 / TP3</span><b>${fmt(t.tp1)} • ${fmt(t.tp2)} • ${fmt(t.tp3)}</b></div><div class="field"><span>Timeline</span><b>${timeline||'WAITING FOR ENTRY TRIGGER'}</b></div><div class="field"><span>Score</span><b>${t.score}/100</b></div></div></article>`
}
async function loadDashMini(){const el=document.getElementById('dashLiveMini'); if(!el)return; try{const d=await fetch('/api/trades').then(r=>r.json()); el.innerHTML=d.length?d.slice(0,2).map(t=>`<div class="miniTrade ${t.status==='WAITING ENTRY'?'pendingTrade':''}"><b>${t.symbol} ${t.timeframe}</b><span>${t.status} • ${t.direction} • ${t.entry_filled?'RR '+fmt(t.rr):'entry pending'}</span><i style="width:${Math.max(2,Math.min(100,t.entry_filled?(t.progress||0):2))}%"></i></div>`).join(''):'<div class="emptyMini">Generate a signal to start live monitoring.</div>'}catch(e){}}
document.addEventListener('DOMContentLoaded',installMobileDrawerFix);

// ===== TEKORA V9 AMT + ORDERFLOW UI OVERRIDES =====
function setDrawer(open){
  const side=document.getElementById('sidebar');
  const overlay=document.getElementById('mobileOverlay');
  if(!side)return;
  side.classList.toggle('open',open);
  document.body.classList.toggle('sidebarOpen',open);
  if(overlay) overlay.style.pointerEvents=open?'auto':'none';
}
function installMobileDrawerFix(){
  const menu=document.getElementById('menuBtn');
  const side=document.getElementById('sidebar');
  const overlay=document.getElementById('mobileOverlay');
  if(menu && !menu.dataset.v9){
    menu.dataset.v9='1';
    menu.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      const willOpen=!side?.classList.contains('open');
      setDrawer(willOpen);
      if(willOpen && history.state?.tekoraDrawer!==true){ history.pushState({tekoraDrawer:true},''); }
    };
  }
  overlay && (overlay.onclick=()=>setDrawer(false));
  side?.querySelectorAll('a').forEach(a=>{a.onclick=()=>setDrawer(false)});
  window.onpopstate=(e)=>{ if(side?.classList.contains('open')) setDrawer(false); };
  window.addEventListener('resize',()=>{ if(window.innerWidth>1100) setDrawer(false); });
}
function componentBars(s){const c=s.score_components||{};return Object.entries(c).map(([k,v])=>`<div class="qbar"><span>${k.replaceAll('_',' ')}</span><b>${v}</b><i style="width:${Math.max(5,Math.min(100,Number(v)*5))}%"></i></div>`).join('')}
function signalCard(s){const score=s.score||0;return `<article class="signal glass godSignal"><div class="sigTop"><div><span class="eyebrow">Best execution setup • Auto tracked</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${s.action}</span><span>${s.direction}</span><span>${s.grade}</span><span>${score}/100</span><span>RR ${s.rr_plan||'—'}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b><small>/100</small></div></div><div class="godSummary"><div><span>AMT Phase</span><b>${fmt(s.amt_phase)}</b></div><div><span>Orderflow</span><b>${fmt(s.orderflow)}</b></div><div><span>Premium / Discount</span><b>${fmt(s.pd_zone)} • EQ ${fmt(s.equilibrium)}</b></div><div><span>MTF</span><b>${fmt(s.mtf)}</b></div></div><div class="fieldGrid"><div class="field hot"><span>${s.entry_label}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Master Bias</span><b>${fmt(s.master_bias)}</b></div><div class="field"><span>Action</span><b>${fmt(s.action)}</b></div><div class="field"><span>Regime</span><b>${fmt(s.regime)}</b></div><div class="field"><span>Structure</span><b>${fmt(s.internal_structure)}</b></div><div class="field"><span>Liquidity</span><b>${fmt(s.liquidity)}</b></div><div class="field"><span>Inducement</span><b>${fmt(s.inducement)}</b></div><div class="field"><span>OB / FVG</span><b>${fmt(s.order_block)} • ${fmt(s.fvg)}</b></div><div class="field"><span>Delta</span><b>${fmt(s.delta_proxy)}</b></div><div class="field"><span>RSI</span><b>${fmt(s.rsi)}</b></div><div class="field"><span>ATR %</span><b>${fmt(s.atr_pct)}</b></div><div class="field"><span>Valid Until</span><b>${new Date((s.valid_until||0)*1000).toLocaleTimeString()}</b></div></div><div class="qualityMatrix">${componentBars(s)}</div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button><button class="smallBtn" onclick="this.closest('.signal').querySelector('.quality').classList.toggle('open')">Why This?</button></div><div class="quality"><p>${s.ai_explanation}</p><ul>${(s.reasons||[]).map(r=>`<li>${r}</li>`).join('')}</ul></div></article>`}
async function runMain(){const scanType=$('#scanType')?.value||'manual',mode=$('#mode')?.value||'scalp',timeframe=$('#timeframe')?.value||'15m'; const res=$('#results'); res.className='results'; res.innerHTML='<div class="emptyState"><h2>Engine scanning...</h2><p>Reading live MEXC data with AMT + orderflow filters.</p></div>'; try{if(scanType==='auto'){const d=await post('/api/scan',{mode,timeframe,universe:'top60'}); $('#stats').innerHTML=`<div class="stat"><span>Scanned Jobs</span><b>${d.scanned_jobs}</b></div><div class="stat"><span>Mode</span><b>${d.mode}</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time}s</b></div><div class="stat"><span>Generated</span><b>${d.generated}</b></div>`; res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No premium setup</h2><p>Engine filtered everything. That is better than forcing a bad trade.</p></div>'}else{const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe}); $('#stats').innerHTML=`<div class="stat"><span>Scanned Jobs</span><b>1</b></div><div class="stat"><span>Mode</span><b>${d.mode}</b></div><div class="stat"><span>Scan Time</span><b>Manual</b></div><div class="stat"><span>Generated</span><b>${d.generated}</b></div>`; res.innerHTML=signalCard(d)} loadTrades(); loadJournal(); loadDashMini(); }catch(e){res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>Check internet/MEXC access and run again.</p></div>'}}
document.addEventListener('DOMContentLoaded',()=>{installMobileDrawerFix();});


// ===== TEKORA V10 AI EXECUTION TERMINAL UI =====
async function loadMarketPulse(){
  const box=document.getElementById('marketPulse'); if(!box)return;
  try{
    const tf=document.getElementById('timeframe')?.value || '15m';
    const p=await fetch('/api/market-pulse?timeframe='+encodeURIComponent(tf)).then(r=>r.json());
    document.getElementById('bullCount').textContent=p.bullish;
    document.getElementById('bearCount').textContent=p.bearish;
    document.getElementById('chopCount').textContent=p.choppy;
    const vol=Math.max(4,Math.min(100,(p.avg_volatility||0)*18));
    const vm=document.getElementById('volMeter'); if(vm)vm.style.width=vol+'%';
    document.getElementById('volLabel').textContent=(p.avg_volatility||0)+'% avg ATR';
    document.getElementById('volText').textContent='Updated '+p.time+' • adaptive execution climate';
    box.innerHTML=(p.rows||[]).map(r=>`<div class="pulseRow"><b>${r.symbol}</b><span>${r.bias}</span><em>${r.pressure}</em><small>${r.regime} • ATR ${r.atr_pct}%</small></div>`).join('') || '<div class="emptyMini">Pulse unavailable.</div>';
  }catch(e){box.innerHTML='<div class="emptyMini">Market pulse unavailable. Check API/internet.</div>'}
}
function componentBars(s){const c=s.score_components||{};return Object.entries(c).map(([k,v])=>{let pct=Number(v); if(pct<0)pct=0; return `<div class="qbar"><span>${k.replaceAll('_',' ')}</span><b>${v}</b><i style="width:${Math.max(5,Math.min(100,pct*5))}%"></i></div>`}).join('')}
function signalCard(s){const score=s.score||0;return `<article class="signal glass godSignal terminalSignal"><div class="sigTop"><div><span class="eyebrow">AI execution setup • auto tracked</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${s.action}</span><span>${s.direction}</span><span>${s.grade}</span><span>${score}/100</span><span>RR ${s.rr_plan||'—'}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b><small>/100</small></div></div><div class="aiReasoning"><h3>AI Reasoning</h3><p>${s.ai_explanation}</p></div><div class="godSummary"><div><span>Premium / Discount</span><b>${fmt(s.pd_zone)} • EQ ${fmt(s.equilibrium)}</b></div><div><span>Manipulation</span><b>${fmt(s.manipulation)}</b></div><div><span>Orderflow</span><b>${fmt(s.orderflow_pressure)} • ${fmt(s.aggressive_flow)}</b></div><div><span>Anti-Chop</span><b>${fmt(s.anti_chop)}</b></div></div><div class="fieldGrid"><div class="field hot"><span>${s.entry_label}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Setup Invalidation</span><b>${fmt(s.invalidation)}</b></div><div class="field"><span>Early Warning</span><b>${fmt(s.early_warning)}</b></div><div class="field"><span>Liquidity</span><b>${fmt(s.liquidity)}</b></div><div class="field"><span>Inducement</span><b>${fmt(s.inducement)}</b></div><div class="field"><span>Absorption</span><b>${fmt(s.absorption)}</b></div><div class="field"><span>Exhaustion</span><b>${fmt(s.exhaustion)}</b></div><div class="field"><span>Imbalance Velocity</span><b>${fmt(s.imbalance_velocity)}</b></div><div class="field"><span>Momentum Accel.</span><b>${fmt(s.momentum_acceleration)}</b></div><div class="field"><span>Regime</span><b>${fmt(s.regime)}</b></div><div class="field"><span>Structure</span><b>${fmt(s.internal_structure)}</b></div><div class="field"><span>MTF</span><b>${fmt(s.mtf)}</b></div></div><div class="qualityMatrix">${componentBars(s)}</div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button><button class="smallBtn" onclick="this.closest('.signal').querySelector('.quality').classList.toggle('open')">Full Breakdown</button></div><div class="quality"><ul>${(s.reasons||[]).map(r=>`<li>${r}</li>`).join('')}</ul></div></article>`}
function tradeCard(t){
  const timeline=(t.timeline||[]).slice(-6).map(x=>`<li><b>${x.time}</b><span>${x.event}</span></li>`).join('');
  const pending=(t.status==='WAITING ENTRY'||t.status==='SIGNAL ONLY'||t.status==='EXPIRED'||t.status==='PRICE SYNC WAIT');
  const progress=pending?0:(t.progress||0);
  return `<article class="signal glass ${pending?'pendingTrade':''}"><div class="sigTop"><div><span class="eyebrow">${t.source||'tracked'} • ${t.updated||''}</span><h2>${t.symbol} <small>${t.timeframe}</small></h2><div class="chips"><span>${t.status}</span><span>${t.direction}</span><span>${pending?'Entry pending':'RR '+fmt(t.rr)}</span><span>${t.be_moved?'BE MOVED':(t.entry_filled?'LIVE':'PENDING')}</span></div></div><div class="scoreRing" style="--score:${Math.max(0,Math.min(100,progress))}"><b>${progress}%</b></div></div><div class="fieldGrid"><div class="field"><span>${t.entry_label}</span><b>${fmt(t.entry_value)}</b></div><div class="field"><span>Current</span><b>${fmt(t.current_price)}</b></div><div class="field danger"><span>SL</span><b>${fmt(t.stop_loss)}</b></div><div class="field"><span>TP1 / TP2 / TP3</span><b>${fmt(t.tp1)} • ${fmt(t.tp2)} • ${fmt(t.tp3)}</b></div><div class="field"><span>Setup Invalidation</span><b>${fmt(t.setup_invalidation||t.invalidation)}</b></div><div class="field"><span>Early Close Warning</span><b>${fmt(t.early_warning)}</b></div></div><div class="timeline"><h3>Active Trade Timeline</h3><ol>${timeline||'<li><b>Now</b><span>Waiting for entry trigger</span></li>'}</ol></div></article>`
}
async function runMain(){const scanType=$('#scanType')?.value||'manual',mode=$('#mode')?.value||'scalp',timeframe=$('#timeframe')?.value||'15m'; const res=$('#results'); res.className='results'; res.innerHTML='<div class="emptyState"><h2>Engine scanning...</h2><p>Premium/discount + inducement + clean sweeps + orderflow + anti-chop running.</p></div>'; try{if(scanType==='auto'){const d=await post('/api/scan',{mode,timeframe,universe:'top70'}); $('#stats').innerHTML=`<div class="stat"><span>Scanned Jobs</span><b>${d.scanned_jobs}</b></div><div class="stat"><span>Mode</span><b>${d.mode}</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time}s</b></div><div class="stat"><span>Generated</span><b>${d.generated}</b></div>`; res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No clean setup</h2><p>Engine filtered weak conditions. No forced trade.</p></div>'}else{const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe}); $('#stats').innerHTML=`<div class="stat"><span>Symbol</span><b>${d.symbol}</b></div><div class="stat"><span>Grade</span><b>${d.grade}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Status</span><b>Auto tracked</b></div>`; res.innerHTML=signalCard(d)} loadTrades(); loadJournal(); loadDashMini(); loadMarketPulse(); toast('Signal generated + added to Live/Journal ✅')}catch(e){res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>'+String(e.message||e)+' — check internet/MEXC access and terminal logs.</p></div>'}}
function setDrawer(open){
  const side=document.getElementById('sidebar'), overlay=document.getElementById('mobileOverlay');
  if(!side)return; side.classList.toggle('open',open); document.body.classList.toggle('sidebarOpen',open);
  if(overlay) overlay.style.pointerEvents=open?'auto':'none';
}
function installMobileDrawerFix(){
  const menu=document.getElementById('menuBtn'), side=document.getElementById('sidebar'), overlay=document.getElementById('mobileOverlay');
  if(menu){menu.onclick=(e)=>{e.preventDefault();e.stopPropagation();const open=!side?.classList.contains('open');setDrawer(open);};}
  overlay && (overlay.onclick=()=>setDrawer(false));
  side?.querySelectorAll('a').forEach(a=>a.onclick=()=>setDrawer(false));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')setDrawer(false)});
  window.addEventListener('resize',()=>{if(window.innerWidth>1100)setDrawer(false)});
}
document.addEventListener('DOMContentLoaded',()=>{syncScanUI();installMobileDrawerFix();loadMarketPulse();loadDashMini();});


// ===== TEKORA V11 SCAN ANIMATION + REAL ORDERBOOK UI + MOBILE DRAWER FIX =====
function showScanOverlay(){
  const o=document.getElementById('scanOverlay'), p=document.getElementById('scanPhase'); if(!o)return;
  const phases=['Connecting to live MEXC market feed...','Scanning market regime + volatility...','Reading websocket/REST orderbook depth...','Detecting liquidity sweep, BOS, MSS and CHOCH...','Calculating retest zone, SL and TP structure...','Applying dynamic RR gates + ranking best available setup...'];
  let i=0; if(p)p.textContent=phases[0]; o.classList.add('active');
  clearInterval(window.__tekoraScanPhase); window.__tekoraScanPhase=setInterval(()=>{i=(i+1)%phases.length;if(p)p.textContent=phases[i]},520);
}
function hideScanOverlay(){const o=document.getElementById('scanOverlay'); if(o)o.classList.remove('active'); clearInterval(window.__tekoraScanPhase)}
function componentBars(s){const c=s.score_components||{};return Object.entries(c).map(([k,v])=>`<div class="qbar"><span>${k.replaceAll('_',' ')}</span><b>${v}</b><i style="width:${Math.max(5,Math.min(100,Math.abs(v)*5))}%"></i></div>`).join('')}
function signalCard(s){const score=s.score||0;return `<article class="signal glass terminalSignal"><div class="sigTop"><div><span class="eyebrow">AI Execution Setup • Auto tracked</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${s.action}</span><span>${s.direction}</span><span>${s.grade}</span><span>${score}/100</span><span>RR ${s.rr_plan||'—'}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b></div></div><div class="aiReasoning"><h3>AI Reasoning</h3><p>${s.ai_explanation}</p></div><div class="fieldGrid"><div class="field hot"><span>Real Orderbook Pressure</span><b>${fmt(s.book_pressure)} • ${fmt(s.orderbook_imbalance)}</b></div><div class="field hot"><span>Nearest Big Order Wall</span><b>${fmt(s.nearest_wall)} @ ${fmt(s.nearest_wall_price)} (${fmt(s.nearest_wall_strength)}x)</b></div><div class="field"><span>Trap / Wall Risk</span><b>${fmt(s.trap_risk)}</b></div><div class="field"><span>Premium / Discount</span><b>${fmt(s.pd_zone)} • EQ ${fmt(s.equilibrium)}</b></div><div class="field"><span>${s.entry_label}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Setup Invalidation</span><b>${fmt(s.invalidation)}</b></div><div class="field"><span>Early Warning</span><b>${fmt(s.early_warning)}</b></div><div class="field"><span>Liquidity Sweep</span><b>${fmt(s.liquidity)}</b></div><div class="field"><span>Inducement</span><b>${fmt(s.inducement)}</b></div><div class="field"><span>Absorption</span><b>${fmt(s.absorption)}</b></div><div class="field"><span>Exhaustion</span><b>${fmt(s.exhaustion)}</b></div><div class="field"><span>Imbalance Velocity</span><b>${fmt(s.imbalance_velocity)}</b></div><div class="field"><span>Momentum Accel.</span><b>${fmt(s.momentum_acceleration)}</b></div><div class="field"><span>Regime</span><b>${fmt(s.regime)}</b></div><div class="field"><span>Structure</span><b>${fmt(s.internal_structure)}</b></div><div class="field"><span>MTF</span><b>${fmt(s.mtf)}</b></div></div><div class="qualityMatrix">${componentBars(s)}</div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button><button class="smallBtn" onclick="this.closest('.signal').querySelector('.quality').classList.toggle('open')">Full Breakdown</button></div><div class="quality"><ul>${(s.reasons||[]).map(r=>`<li>${r}</li>`).join('')}</ul></div></article>`}
async function runMain(){
  const scanType=$('#scanType')?.value||'manual',mode=$('#mode')?.value||'scalp',timeframe=$('#timeframe')?.value||'15m'; const res=$('#results');
  showScanOverlay(); if(res){res.className='results scanning';res.innerHTML='<div class="emptyState scanState"><h2>Analysis started...</h2><p>Tekora is checking candles, real orderbook pressure, AMT, liquidity and execution conditions.</p></div>'}
  try{
    if(scanType==='auto'){
      const d=await post('/api/scan',{mode,timeframe,universe:'top70'});
      $('#stats').innerHTML=`<div class="stat"><span>Scanned Jobs</span><b>${d.scanned_jobs}</b></div><div class="stat"><span>Mode</span><b>${d.mode}</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time}s</b></div><div class="stat"><span>Generated</span><b>${d.generated}</b></div>`;
      res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No clean setup</h2><p>Engine filtered weak conditions. No forced trade.</p></div>'
    }else{
      const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe});
      $('#stats').innerHTML=`<div class="stat"><span>Symbol</span><b>${d.symbol}</b></div><div class="stat"><span>Grade</span><b>${d.grade}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Status</span><b>Auto tracked</b></div>`;
      res.innerHTML=signalCard(d)
    }
    loadTrades(); loadJournal(); if(typeof loadDashMini==='function')loadDashMini(); if(typeof loadMarketPulse==='function')loadMarketPulse(); toast('Signal generated + added to Live/Journal ✅')
  }catch(e){if(res)res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>'+String(e.message||e)+' — check internet/MEXC access and terminal logs.</p></div>'}
  finally{setTimeout(hideScanOverlay,450)}
}
function setDrawer(open){
  const side=document.getElementById('sidebar'), overlay=document.getElementById('mobileOverlay'), menu=document.getElementById('menuBtn'); if(!side)return;
  side.classList.toggle('open',!!open); document.body.classList.toggle('sidebarOpen',!!open); if(menu)menu.setAttribute('aria-expanded',open?'true':'false'); if(overlay)overlay.style.pointerEvents=open?'auto':'none';
}
function installMobileDrawerFix(){
  const menu=document.getElementById('menuBtn'), overlay=document.getElementById('mobileOverlay'), side=document.getElementById('sidebar');
  if(menu){menu.replaceWith(menu.cloneNode(true));}
  const fresh=document.getElementById('menuBtn');
  if(fresh){fresh.onclick=(e)=>{e.preventDefault();e.stopPropagation();setDrawer(!side?.classList.contains('open'));};}
  if(overlay){overlay.onclick=()=>setDrawer(false)}
  side?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{if(window.innerWidth<=1100)setDrawer(false)}));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')setDrawer(false)});
}
document.addEventListener('DOMContentLoaded',()=>{installMobileDrawerFix();});



// ===== TEKORA V12 TOP-100 HEATMAP + ALWAYS-BEST UI OVERRIDES =====
function heatmapBlock(s){
  const h=s.heatmap||{};
  const rows=(h.rows||[]).map(r=>`<div class="heatRow ${String(r.side||'').toLowerCase()}"><span>${r.label}</span><b>${fmt(r.value)}</b><em>${fmt(r.side)}</em></div>`).join('');
  return `<div class="heatmapPanel"><div class="heatHead"><div><span class="eyebrow">Real depth heatmap</span><h3>${fmt(h.bias)} • ${fmt(h.mode)}</h3></div><b>${fmt(h.liquidity_score)}/45</b></div><p>${fmt(h.summary)}</p>${rows}</div>`
}
function explanationPanel(s){
  const items=s.explanation_panel||s.reasons||[];
  return `<div class="explainPanel"><h3>Why Tekora picked this setup</h3>${items.slice(0,8).map(x=>`<div class="explainLine"><i></i><span>${x}</span></div>`).join('')}<p class="truthNote">${fmt(s.accuracy_note||s.risk_note)}</p></div>`
}
function signalCard(s){
  const score=s.score||0;
  return `<article class="signal glass terminalSignal v12Signal"><div class="sigTop"><div><span class="eyebrow">Top-100 best available setup • auto tracked</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${s.action}</span><span>${s.direction}</span><span>${s.grade}</span><span>${score}/100</span><span>${fmt(s.execution_quality)}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b></div></div><div class="aiReasoning"><h3>Signal Brain</h3><p>${s.ai_explanation}</p></div>${heatmapBlock(s)}<div class="fieldGrid"><div class="field hot"><span>Real Orderbook Pressure</span><b>${fmt(s.book_pressure)} • ${fmt(s.orderbook_imbalance)}</b></div><div class="field hot"><span>Nearest Big Order Wall</span><b>${fmt(s.nearest_wall)} @ ${fmt(s.nearest_wall_price)} (${fmt(s.nearest_wall_strength)}x)</b></div><div class="field"><span>Trap / Wall Risk</span><b>${fmt(s.trap_risk)}</b></div><div class="field"><span>Execution Quality</span><b>${fmt(s.execution_quality)}</b></div><div class="field hot"><span>Trade Permission</span><b>${fmt(s.trade_permission||'—')}</b></div><div class="field"><span>Market Health</span><b>${fmt(s.market_health||'—')} • Disp ${fmt(s.displacement_x||'—')}x</b></div><div class="field"><span>$5 Challenge Risk</span><b>${s.challenge_plan?('$'+fmt(s.challenge_plan.max_loss_usdt)+' max loss ref'):'—'}</b></div><div class="field"><span>${s.entry_label}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Premium / Discount</span><b>${fmt(s.pd_zone)} • EQ ${fmt(s.equilibrium)}</b></div><div class="field"><span>Liquidity Sweep</span><b>${fmt(s.liquidity)}</b></div><div class="field"><span>Inducement</span><b>${fmt(s.inducement)}</b></div><div class="field"><span>Absorption</span><b>${fmt(s.absorption)}</b></div><div class="field"><span>Exhaustion</span><b>${fmt(s.exhaustion)}</b></div><div class="field"><span>Regime</span><b>${fmt(s.regime)}</b></div><div class="field"><span>MTF</span><b>${fmt(s.mtf)}</b></div><div class="field"><span>Invalidation</span><b>${fmt(s.invalidation)}</b></div><div class="field"><span>Early Warning</span><b>${fmt(s.early_warning)}</b></div></div><div class="qualityMatrix">${componentBars(s)}</div>${explanationPanel(s)}<div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button></div></article>`
}
async function runMain(){
  const scanType=$('#scanType')?.value||'manual',mode=$('#mode')?.value||'scalp',timeframe=$('#timeframe')?.value||'15m'; const res=$('#results');
  showScanOverlay(); if(res){res.className='results scanning';res.innerHTML='<div class="emptyState scanState"><h2>Tekora is analysing live markets...</h2><p>Fast engine: regime, orderbook, displacement, structure, retest zone and RR ranking.</p></div>'}
  try{
    if(scanType==='auto'){
      const d=await post('/api/scan',{mode,timeframe,universe:'top100'});
      $('#stats').innerHTML=`<div class="stat"><span>Scanned Jobs</span><b>${d.scanned_jobs}</b></div><div class="stat"><span>Failed</span><b>${d.failed_jobs||0}</b></div><div class="stat"><span>Policy</span><b>${d.engine_policy||'BEST'}</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time}s</b></div>`;
      res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No data returned</h2><p>MEXC/API connection failed. Try again.</p></div>'
    }else{
      const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe});
      $('#stats').innerHTML=`<div class="stat"><span>Symbol</span><b>${d.symbol}</b></div><div class="stat"><span>Quality</span><b>${d.execution_quality}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Status</span><b>Auto tracked</b></div>`;
      res.innerHTML=signalCard(d)
    }
    loadTrades(); loadJournal(); if(typeof loadDashMini==='function')loadDashMini(); if(typeof loadMarketPulse==='function')loadMarketPulse(); toast('Setup generated fast ✅')
  }catch(e){if(res)res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>'+String(e.message||e)+' — check internet/MEXC access and terminal logs.</p></div>'}
  finally{setTimeout(hideScanOverlay,450)}
}
async function loadJournal(){
  const st=$('#journalStats'),rc=$('#journalRecent'); if(!st||!rc)return;
  const j=await fetch('/api/journal').then(r=>r.json());
  st.innerHTML=`<div class="stat"><span>Total</span><b>${j.total}</b></div><div class="stat"><span>Active</span><b>${j.active}</b></div><div class="stat"><span>Win Rate</span><b>${j.win_rate}%</b></div><div class="stat"><span>RR Total</span><b>${j.rr_total}</b></div><div class="stat"><span>Avg RR</span><b>${j.avg_rr}</b></div><div class="stat"><span>Streak</span><b>${j.streak}</b></div><div class="stat"><span>Best Pair</span><b>${j.best_pair}</b></div><div class="stat"><span>Best TF</span><b>${j.best_timeframe}</b></div>`;
  rc.innerHTML=(j.recent||[]).length?j.recent.map(tradeCard).join(''):'<div class="emptyState"><h2>No journal records</h2><p>Generated signals are logged here automatically.</p></div>'
}

// ===== TEKORA V18 FOREX SCREENSHOT AI ENGINE =====
function selectedValues(name){return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(x=>x.value)}
function previewForexImage(e){
  const f=e.target.files?.[0], img=document.getElementById('chartPreview'), dz=document.getElementById('dropZone');
  if(!f||!img)return; img.src=URL.createObjectURL(f); img.classList.add('show'); dz?.classList.add('hasImage'); toast('Chart loaded ✅');
}
function forexCard(s){
  const warnings=(s.warnings||[]).map(w=>`<li>${w}</li>`).join('');
  const reasons=(s.reasons||[]).map(r=>`<div class="explainLine"><i></i><span>${r}</span></div>`).join('');
  return `<article class="signal glass terminalSignal forexSignal"><div class="sigTop"><div><span class="eyebrow">Forex Screenshot Setup • ${fmt(s.session)} session</span><h2>${fmt(s.symbol)} <small>${fmt(s.timeframe)}</small></h2><div class="chips"><span>${fmt(s.action)}</span><span>${fmt(s.direction)}</span><span>${fmt(s.grade)}</span><span>${fmt(s.score)}/100</span><span>RR ${fmt(s.rr_plan)}</span></div></div><div class="scoreRing" style="--score:${s.score||0}"><b>${s.score||0}</b></div></div><div class="aiReasoning"><h3>AI Reasoning</h3><p>${fmt(s.ai_explanation)}</p></div><div class="fieldGrid"><div class="field hot"><span>${fmt(s.entry_label)}</span><b>${fmt(s.entry_value)}</b></div><div class="field"><span>Mid Entry</span><b>${fmt(s.mid_entry)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div><div class="field"><span>TP1</span><b>${fmt(s.tp1)}</b></div><div class="field"><span>TP2</span><b>${fmt(s.tp2)}</b></div><div class="field"><span>TP3</span><b>${fmt(s.tp3)}</b></div><div class="field"><span>Bias</span><b>${fmt(s.bias)}</b></div><div class="field"><span>Invalidation</span><b>${fmt(s.invalidation)}</b></div><div class="field"><span>ICT</span><b>${fmt(s.ict)}</b></div><div class="field"><span>SMC</span><b>${fmt(s.smc)}</b></div><div class="field"><span>MSNR</span><b>${fmt(s.msnr)}</b></div><div class="field"><span>Indicators</span><b>${fmt(s.indicators)}</b></div></div><div class="explainPanel"><h3>Why Tekora picked this setup</h3>${reasons}<p class="truthNote">${fmt(s.accuracy_note)}</p></div><div class="quality open"><h3>Warnings</h3><ul>${warnings}</ul></div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry Zone</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify('FOREX '+(s.symbol||'')+' '+(s.timeframe||'')+' '+(s.direction||'')+'\nAction: '+(s.action||'')+'\nEntry: '+(s.entry_value||'')+'\nSL: '+(s.stop_loss||'')+'\nTP1: '+(s.tp1||'')+'\nTP2: '+(s.tp2||'')+'\nTP3: '+(s.tp3||'')+'\nScore: '+(s.score||'')+'/100\nNote: educational analysis only.')})'>Copy Full Plan</button></div></article>`
}
async function runForexAnalysis(){
  const file=document.getElementById('chartUpload')?.files?.[0], out=document.getElementById('forexResult');
  if(!file){toast('Upload chart first bro 📸'); return}
  if(out)out.innerHTML='<div class="emptyState scanState"><h2>Forex AI analyzing...</h2><p>Reading screenshot pressure, ICT/SMC/MSNR concepts, session context and RR plan.</p></div>';
  showForexOverlay();
  const fd=new FormData(); fd.append('chart',file); fd.append('symbol',document.getElementById('fxSymbol')?.value||'EURUSD'); fd.append('current_price',document.getElementById('fxPrice')?.value||''); fd.append('timeframe',document.getElementById('fxTf')?.value||'15m'); fd.append('session',document.getElementById('fxSession')?.value||'London'); fd.append('style',document.getElementById('fxStyle')?.value||'balanced'); fd.append('rr',document.getElementById('fxRR')?.value||'2'); selectedValues('fxConcept').forEach(x=>fd.append('concepts',x)); selectedValues('fxInd').forEach(x=>fd.append('indicators',x));
  try{const r=await fetch('/api/forex-analyze',{method:'POST',body:fd}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Analyze failed'); if(out)out.innerHTML=forexCard(d); toast('Forex setup generated ✅')}
  catch(e){if(out)out.innerHTML='<div class="emptyState"><h2>Analysis error</h2><p>'+e.message+'</p></div>'}
  finally{setTimeout(hideScanOverlay,450)}
}
function showForexOverlay(){
  const o=document.getElementById('scanOverlay'), p=document.getElementById('scanPhase'); if(!o)return; const phases=['Reading uploaded chart screenshot...','Detecting candle pressure and visible structure...','Applying ICT liquidity + PD array logic...','Applying SMC OB/FVG/MSS model...','Applying MSNR + session/RR filters...','Building honest setup plan...']; let i=0; if(p)p.textContent=phases[0]; o.classList.add('active'); clearInterval(window.__tekoraScanPhase); window.__tekoraScanPhase=setInterval(()=>{i=(i+1)%phases.length;if(p)p.textContent=phases[i]},700)
}

// ===== TEKORA  UI PATCH: expanded markets + info profile + memory =====
const TEKORA__SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','TRXUSDT','TONUSDT','AVAXUSDT','LINKUSDT','SUIUSDT','LTCUSDT','BCHUSDT','DOTUSDT','NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT','ATOMUSDT','FILUSDT','ETCUSDT','ICPUSDT','SEIUSDT','TIAUSDT','WLDUSDT','JUPUSDT','PYTHUSDT','ORDIUSDT','PEPEUSDT','SHIBUSDT','FLOKIUSDT','BONKUSDT','WIFUSDT','ENAUSDT','ONDOUSDT','PENDLEUSDT','RUNEUSDT','AAVEUSDT','UNIUSDT','MKRUSDT','LDOUSDT','GRTUSDT','ALGOUSDT','XLMUSDT','HBARUSDT','VETUSDT','QNTUSDT','SANDUSDT','MANAUSDT','AXSUSDT','GALAUSDT','APEUSDT','IMXUSDT','FTMUSDT','CFXUSDT','MINAUSDT','STXUSDT','KASUSDT','DYDXUSDT','GMXUSDT','BLURUSDT','CRVUSDT','SNXUSDT','COMPUSDT','YFIUSDT','ZILUSDT','IOTAUSDT','FLOWUSDT','EGLDUSDT','ROSEUSDT','KAVAUSDT','KSMUSDT','ENSUSDT','MASKUSDT','MAGICUSDT','LRCUSDT','1INCHUSDT','SUSHIUSDT','CELOUSDT','ANKRUSDT','HOTUSDT','CHZUSDT','GMTUSDT','ARUSDT','ZRXUSDT','BATUSDT','ACHUSDT','API3USDT','LPTUSDT','SSVUSDT','IDUSDT','RDNTUSDT','HOOKUSDT','HIGHUSDT','CYBERUSDT','ARKMUSDT','ALTUSDT','STRKUSDT','MANTAUSDT','DYMUSDT','PIXELUSDT','PORTALUSDT','AEVOUSDT','JTOUSDT','JASMYUSDT','NOTUSDT','MEMEUSDT','PEOPLEUSDT','1000SATSUSDT'];
function hydrateSymbols(){const sel=document.getElementById('symbol'); if(sel){sel.innerHTML=TEKORA__SYMBOLS.map(x=>`<option>${x}</option>`).join('')}}
const _oldSignalCard = signalCard;
signalCard=function(s){
  let html=_oldSignalCard(s);
  const extra=`<div class="v21Strip"><span>Permission: <b>${fmt(s.trade_permission)}</b></span><span>Session: <b>${fmt(s.session)}</b></span><span>Depth: <b>${fmt(s.orderbook_source)}</b></span><span>Backtest: <b>${fmt((s.backtest_snapshot||{}).fitness)}</b></span></div>`;
  return html.replace('<div class="fieldGrid">', extra+'<div class="fieldGrid">');
}
runMain=async function(){
  const scanType=$('#scanType')?.value||'manual', mode=$('#mode')?.value||'scalp', timeframe=$('#timeframe')?.value||'15m'; const res=$('#results');
  if(res){res.className='results scanning';res.innerHTML='<div class="emptyState scanState"><h2> scanning...</h2><p>Websocket depth attempt + REST fallback + regime + displacement + structure + memory + backtest snapshot.</p></div>'}
  try{
    if(scanType==='auto'){
      const d=await post('/api/scan',{mode,timeframe,universe:'top150'});
      $('#stats').innerHTML=`<div class="stat"><span>Universe</span><b>${d.available_universe||150}</b></div><div class="stat"><span>Scanned</span><b>${d.scanned_jobs}</b></div><div class="stat"><span>Policy</span><b></b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time}s</b></div>`;
      res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No data returned</h2><p>Check internet/MEXC and run again.</p></div>';
    }else{
      const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe});
      $('#stats').innerHTML=`<div class="stat"><span>Symbol</span><b>${d.symbol}</b></div><div class="stat"><span>Permission</span><b>${fmt(d.trade_permission)}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Status</span><b>Auto tracked</b></div>`;
      res.innerHTML=signalCard(d);
    }
    loadTrades(); loadJournal(); if(typeof loadDashMini==='function')loadDashMini(); if(typeof loadMarketPulse==='function')loadMarketPulse(); toast(' best available setup generated ✅');
  }catch(e){if(res)res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>Check terminal logs / MEXC connection.</p></div>'}
}
async function saveProfile(){
  const body={account_balance:document.getElementById('accountBalance')?.value||5,risk_per_trade_usdt:document.getElementById('riskPerTrade')?.value||0.30,target_profit_usdt:document.getElementById('targetProfit')?.value||1,target_balance:document.getElementById('targetBalance')?.value||10,owner_signature:document.getElementById('ownerSignature')?.value||'Tekora',month_target_note:document.getElementById('monthNote')?.value||'Protect capital. Grow slow.'};
  await post('/api/profile',body); toast('Info saved ✅'); loadProfile();
}
async function loadProfile(){
  const form=document.getElementById('accountBalance'); if(!form)return;
  const p=await fetch('/api/profile').then(r=>r.json());
  document.getElementById('accountBalance').value=p.account_balance??5; document.getElementById('riskPerTrade').value=p.risk_per_trade_usdt??0.3; document.getElementById('targetProfit').value=p.target_profit_usdt??1; document.getElementById('targetBalance').value=p.target_balance??10; document.getElementById('ownerSignature').value=p.owner_signature??'Tekora'; document.getElementById('monthNote').value=p.month_target_note??'';
  const pr=await fetch('/api/profile/progress').then(r=>r.json()); const box=document.getElementById('profileProgress'); if(box){box.innerHTML=`<div class="progressHero"><b>$${pr.simulated_balance}</b><span>Target $${pr.target_balance}</span></div><div class="meter"><i style="width:${pr.progress_pct}%"></i></div><p><b>${pr.progress_pct}%</b> complete</p><div class="fieldGrid miniFields"><div class="field"><span>PnL</span><b>$${pr.realized_pnl}</b></div><div class="field"><span>Wins</span><b>${pr.wins}</b></div><div class="field"><span>Losses</span><b>${pr.losses}</b></div><div class="field"><span>Status</span><b>${pr.message}</b></div></div>`}
  const memBox=document.getElementById('memoryReport'); if(memBox){const m=await fetch('/api/memory').then(r=>r.json()); memBox.innerHTML=`<div class="explainLine"><i></i><span>${m.note||'Memory ready.'}</span></div><p><b>Best pairs:</b> ${(m.pairs||[]).map(x=>x.name+' '+x.winrate+'%').join(', ')||'No samples yet'}</p><p><b>Best sessions:</b> ${(m.sessions||[]).map(x=>x.name+' '+x.winrate+'%').join(', ')||'No samples yet'}</p>`}
}
document.addEventListener('DOMContentLoaded',()=>{hydrateSymbols();loadProfile();});

// ============================================================
// TEKORA  CORE UI PATCH - engine first, no TP cards
// ============================================================
function v23Pill(label,value){return `<div class="field"><span>${label}</span><b>${fmt(value)}</b></div>`}
const _tekoraOldSignalCard = signalCard;
signalCard=function(s){
  const score=s.score||0;
  const reasons=(s.reasons||[]).slice(0,10).map(r=>`<li>${r}</li>`).join('');
  return `<article class="signal glass terminalSignal v23Signal"><div class="sigTop"><div><span class="eyebrow">Tekora Core Engine • live execution</span><h2>${s.symbol} <small>${s.timeframe}</small></h2><div class="chips"><span>${fmt(s.action)}</span><span>${fmt(s.direction)}</span><span>${fmt(s.grade)}</span><span>${score}/100</span><span>${fmt(s.trade_permission)}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b><small>/100</small></div></div><div class="aiReasoning"><h3>Signal Brain</h3><p>${fmt(s.ai_explanation)}</p></div><div class="fieldGrid">${v23Pill('Market Health',s.market_health)}${v23Pill('Anti-Chop',s.anti_chop)}${v23Pill('Fakeout Risk',s.fakeout_risk)}${v23Pill('Volatility',s.volatility_state)}${v23Pill('Trend Strength',(s.trend_strength||0)+'/100')}${v23Pill('Trade Permission',s.trade_permission)}<div class="field hot"><span>${fmt(s.entry_label)}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div>${v23Pill('TP1',s.tp1)}${v23Pill('TP2',s.tp2)}${v23Pill('TP3',s.tp3)}${v23Pill('Orderbook',`${fmt(s.book_pressure)} • ${fmt(s.orderbook_imbalance)}`)}${v23Pill('Nearest Wall',`${fmt(s.nearest_wall)} @ ${fmt(s.nearest_wall_price)}`)}${v23Pill('Regime',s.regime||s.market_regime)}${v23Pill('Liquidity',s.liquidity)}${v23Pill('BOS/MSS/CHOCH',`${fmt(s.bos)} • ${fmt(s.mss)} • ${fmt(s.choch)}`)}</div><div class="explainPanel"><h3>Why Tekora picked this setup</h3><ul>${reasons}</ul><p class="truthNote">${fmt(s.accuracy_note)}</p></div><div class="btnRow"><button class="smallBtn" onclick="copyText('${String(s.entry_value).replaceAll("'",'')}')">Copy Entry</button><button class="smallBtn" onclick="copyText('${s.stop_loss}')">Copy SL</button><button class="smallBtn" onclick="copyText('${s.tp1}')">Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button></div></article>`
}
const _tekoraOldTradeCard = tradeCard;
tradeCard=function(t){
  const timeline=(t.timeline||[]).slice(-5).map(x=>`${x.time} ${x.event}`).join(' → ');
  const pending=!t.entry_filled || ['WAITING ENTRY','SIGNAL ONLY','EXPIRED'].includes(t.status);
  const progress=pending?Math.min(8,t.progress||0):(t.progress||0);
  return `<article class="signal glass v23Trade ${pending?'pendingTrade':''}"><div class="sigTop"><div><span class="eyebrow">${fmt(t.source)} • ${fmt(t.updated)} • ${fmt(t.engine_version)}</span><h2>${t.symbol} <small>${t.timeframe}</small></h2><div class="chips"><span>${fmt(t.lifecycle||t.status)}</span><span>${fmt(t.direction)}</span><span>${pending?'Entry pending':'Live RR '+fmt(t.live_rr||t.rr)}</span><span>${t.be_moved?'BE MOVED':'BE waiting'}</span></div></div><div class="scoreRing" style="--score:${Math.max(0,Math.min(100,progress))}"><b>${Math.round(progress||0)}%</b></div></div><div class="fieldGrid">${v23Pill('Current Price',t.current_price)}${v23Pill(fmt(t.entry_label),t.entry_value)}${v23Pill('Stop Loss',t.stop_loss)}${v23Pill('TP1 / TP2 / TP3',`${fmt(t.tp1)} • ${fmt(t.tp2)} • ${fmt(t.tp3)}`)}${v23Pill('Live RR',t.live_rr||t.rr)}${v23Pill('Tracking Note',t.tracking_note)}${v23Pill('Timeline',timeline||'Waiting for live update')}</div></article>`
}
runMain=async function(){
  const scanType=$('#scanType')?.value||'manual', mode=$('#mode')?.value||'scalp', timeframe=$('#timeframe')?.value||'15m'; const res=$('#results');
  if(res){res.className='results scanning';res.innerHTML='<div class="emptyState scanState"><h2>Engine scanning...</h2><p>Anti-chop + fakeout guard + volatility extension + live execution permission running. TP cards removed.</p></div>'}
  try{
    if(scanType==='auto'){
      const d=await post('/api/scan',{mode,timeframe,universe:'top150'});
      $('#stats').innerHTML=`<div class="stat"><span>Engine</span><b></b></div><div class="stat"><span>Scanned</span><b>${d.scanned_jobs||'live'}</b></div><div class="stat"><span>Policy</span><b>Engine First</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time||'—'}s</b></div>`;
      res.innerHTML=d.best?signalCard(d.best):'<div class="emptyState"><h2>No clean setup</h2><p> refused to force a weak trade.</p></div>';
    }else{
      const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe});
      $('#stats').innerHTML=`<div class="stat"><span>Engine</span><b></b></div><div class="stat"><span>Permission</span><b>${fmt(d.trade_permission)}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Status</span><b>Auto tracked</b></div>`;
      res.innerHTML=signalCard(d);
    }
    loadTrades(); loadJournal(); if(typeof loadDashMini==='function')loadDashMini(); if(typeof loadMarketPulse==='function')loadMarketPulse(); toast('Core signal generated ✅');
  }catch(e){if(res)res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>'+String(e.message||e)+' — check internet/MEXC access and terminal logs.</p></div>'}
}
async function loadJournal(){
  const st=$('#journalStats'), rc=$('#journalRecent'); if(!st||!rc)return;
  const j=await fetch('/api/journal').then(r=>r.json());
  st.innerHTML=`<div class="stat"><span>Total</span><b>${j.total}</b></div><div class="stat"><span>Active</span><b>${j.active}</b></div><div class="stat"><span>Win Rate</span><b>${j.win_rate}%</b></div><div class="stat"><span>Avg RR</span><b>${j.avg_rr}</b></div><div class="stat"><span>Streak</span><b>${j.streak}</b></div><div class="stat"><span>Best Pair</span><b>${j.best_pair}</b></div>`;
  rc.innerHTML=(j.recent||[]).length?j.recent.map(tradeCard).join(''):'<div class="emptyState"><h2>No journal records</h2><p>Generate a signal and Tekora will track it here.</p></div>';
}
document.addEventListener('DOMContentLoaded',()=>{loadTrades();loadJournal();setInterval(loadTrades,6000);setInterval(loadJournal,9000);});

// ================================================================
// TEKORA  UI PATCH — copy template + always best setup wording
// ================================================================
function copyText(t){
  const text=String(t ?? '');
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(()=>toast('Copied ✅')).catch(()=>fallbackCopyText(text));
  }else{ fallbackCopyText(text); }
}
function fallbackCopyText(text){
  const ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly','');
  ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
  try{document.execCommand('copy'); toast('Copied ✅')}catch(e){toast('Copy failed — select manually')}
  document.body.removeChild(ta);
}
function fullSignal(s){
  return `⚡ TEKORA BEST AVAILABLE SETUP\n\nPAIR: ${fmt(s.symbol)}\nTIMEFRAME: ${fmt(s.timeframe)}\nMODE: ${fmt(s.mode)}\nDIRECTION: ${fmt(s.direction)}\nACTION: ${fmt(s.action)}\nSCORE: ${fmt(s.score)}/100\nGRADE: ${fmt(s.grade)}\n\n${fmt(s.entry_label)}: ${fmt(s.entry_value)}\nSTOP LOSS: ${fmt(s.stop_loss)}\nTP1: ${fmt(s.tp1)}\nTP2: ${fmt(s.tp2)}\nTP3: ${fmt(s.tp3)}\nRR PLAN: ${fmt(s.rr_plan)}\nMIN RR POLICY: ${fmt(s.rr_policy || s.minimum_rr_required)}\nPREFILTER: ${fmt(s.market_condition_prefilter || s.prefilter_note)}\n\nMARKET REGIME: ${fmt(s.market_regime || s.regime)}\nLIQUIDITY: ${fmt(s.liquidity_sweep_logic || s.liquidity)}\nFAKEOUT FILTER: ${fmt(s.fake_breakout_rejection)}\nVOLATILITY: ${fmt(s.session_volatility_filter)}\nTREND CONTINUATION: ${fmt(s.trend_continuation_confidence)}/100\n\nENGINE NOTE:\n${fmt(s.ai_explanation)}\n\nRisk small. Educational analysis only — no guaranteed profit.`;
}
function v24Pill(k,v,cls=''){return `<div class="field ${cls}"><span>${fmt(k)}</span><b>${fmt(v)}</b></div>`}
signalCard=function(s){
  const score=s.score||0; const reasons=(s.reasons||[]).map(r=>`<li>${fmt(r)}</li>`).join('');
  return `<article class="signal glass terminalSignal v24Signal"><div class="sigTop"><div><span class="eyebrow">Tekora Real Live Smart Execution • best available setup</span><h2>${fmt(s.symbol)} <small>${fmt(s.timeframe)}</small></h2><div class="chips"><span>${fmt(s.action)}</span><span>${fmt(s.direction)}</span><span>${fmt(s.grade)}</span><span>${score}/100</span><span>${fmt(s.trade_permission)}</span></div></div><div class="scoreRing" style="--score:${score}"><b>${score}</b><small>/100</small></div></div><div class="aiReasoning"><h3>Signal Brain</h3><p>${fmt(s.ai_explanation)}</p></div><div class="fieldGrid">${v24Pill('Market Regime',s.market_regime||s.regime)}${v24Pill('Liquidity Sweep',s.liquidity_sweep_logic||s.liquidity)}${v24Pill('Fakeout Rejection',s.fake_breakout_rejection)}${v24Pill('Session Volatility',s.session_volatility_filter)}${v24Pill('Trend Continuation',(s.trend_continuation_confidence||0)+'/100')}${v24Pill('Smart Bias',s.smart_execution_bias)}<div class="field hot"><span>${fmt(s.entry_label)}</span><b>${fmt(s.entry_value)}</b></div><div class="field danger"><span>Stop Loss</span><b>${fmt(s.stop_loss)}</b></div>${v24Pill('TP1',s.tp1)}${v24Pill('TP2',s.tp2)}${v24Pill('TP3',s.tp3)}${v24Pill('RR Plan',s.rr_plan)}${v24Pill('Orderbook',`${fmt(s.book_pressure)} • ${fmt(s.orderbook_imbalance)}`)}${v24Pill('Engine',s.engine_version)}</div><div class="explainPanel"><h3>Why Tekora picked this setup</h3><ul>${reasons}</ul><p class="truthNote">${fmt(s.accuracy_note)}</p></div><div class="btnRow"><button class="smallBtn" onclick='copyText(${JSON.stringify(String(s.entry_value||''))})'>Copy Entry</button><button class="smallBtn" onclick='copyText(${JSON.stringify(String(s.stop_loss||''))})'>Copy SL</button><button class="smallBtn" onclick='copyText(${JSON.stringify(String(s.tp1||''))})'>Copy TP1</button><button class="smallBtn" onclick='copyText(${JSON.stringify(fullSignal(s))})'>Copy Full Signal</button></div></article>`
}
const _tekoraTradeCard = tradeCard;
tradeCard=function(t){
  const timeline=(t.timeline||[]).slice(-5).map(x=>`${fmt(x.time)} ${fmt(x.event)}`).join(' → ');
  const progress=Math.max(0,Math.min(100,t.progress||0));
  return `<article class="signal glass v24Trade"><div class="sigTop"><div><span class="eyebrow">${fmt(t.source)} • ${fmt(t.updated)} • ${fmt(t.engine_version)}</span><h2>${fmt(t.symbol)} <small>${fmt(t.timeframe)}</small></h2><div class="chips"><span>${fmt(t.lifecycle||t.status)}</span><span>${fmt(t.direction)}</span><span>Live RR ${fmt(t.live_rr||t.rr)}</span><span>${t.be_moved?'SL MOVED TO BE':'BE waiting'}</span></div></div><div class="scoreRing" style="--score:${progress}"><b>${Math.round(progress)}%</b></div></div><div class="fieldGrid">${v24Pill('Current Price',t.current_price)}${v24Pill(fmt(t.entry_label),t.entry_value)}${v24Pill('Stop Loss',t.stop_loss)}${v24Pill('TP1 / TP2 / TP3',`${fmt(t.tp1)} • ${fmt(t.tp2)} • ${fmt(t.tp3)}`)}${v24Pill('Live RR',t.live_rr||t.rr)}${v24Pill('Auto BE',t.auto_be_rule)}${v24Pill('Real TP Detection',t.real_tp_detection?'ON':'waiting')}${v24Pill('Timeline',timeline||'Live tracker started')}</div></article>`
}
runMain=async function(){
  const scanType=$('#scanType')?.value||'manual', mode=$('#mode')?.value||'scalp', timeframe=$('#timeframe')?.value||'15m'; const res=$('#results');
  if(res){res.className='results scanning';res.innerHTML='<div class="emptyState scanState"><h2>Engine scanning best available setup...</h2><p>Live MEXC data + fakeout rejection + liquidity sweep + volatility filter + market regime + continuation confidence.</p></div>'}
  try{
    if(scanType==='auto'){
      const d=await post('/api/scan',{mode,timeframe,universe:'top150'});
      $('#stats').innerHTML=`<div class="stat"><span>Engine</span><b></b></div><div class="stat"><span>Scanned</span><b>${d.scanned_jobs||'live'}</b></div><div class="stat"><span>Policy</span><b>Best Available</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time||'—'}s</b></div>`;
      res.innerHTML=signalCard(d.best || (d.results||[])[0]);
    }else{
      const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe});
      $('#stats').innerHTML=`<div class="stat"><span>Engine</span><b></b></div><div class="stat"><span>Symbol</span><b>${d.symbol}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Action</span><b>${d.action}</b></div>`;
      res.innerHTML=signalCard(d);
    }
    loadTrades(); loadJournal(); if(typeof loadDashMini==='function')loadDashMini(); if(typeof loadMarketPulse==='function')loadMarketPulse(); toast('Best setup generated + tracking started ✅');
  }catch(e){ if(res)res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>Check internet/MEXC terminal logs and try again.</p></div>'; }
}
loadJournal=async function(){
  const st=$('#journalStats'), rc=$('#journalRecent'); if(!st||!rc)return;
  const j=await fetch('/api/journal').then(r=>r.json());
  st.innerHTML=`<div class="stat"><span>Total</span><b>${j.total}</b></div><div class="stat"><span>Win Rate</span><b>${j.win_rate}%</b></div><div class="stat"><span>Avg RR</span><b>${j.avg_rr}</b></div><div class="stat"><span>Streak</span><b>${j.streak}</b></div><div class="stat"><span>Best Pair</span><b>${j.best_pair}</b></div><div class="stat"><span>Best TF</span><b>${j.best_timeframe}</b></div>`;
  rc.innerHTML=(j.recent||[]).length?j.recent.map(tradeCard).join(''):'<div class="emptyState"><h2>No journal records</h2><p>Generate a signal and  tracks winrate, RR, streaks, pair and timeframe stats.</p></div>';
}


// ================================================================
// TEKORA  UI HOTFIX — premium analysing popup + safe scan flow
// ================================================================
function showScanOverlay(){
  const o=document.getElementById('scanOverlay'), p=document.getElementById('scanPhase');
  if(!o)return;
  const phases=[
    'Connecting to live MEXC market feed...',
    'Scanning best available coins and timeframes...',
    'Prefiltering chop, volatility, RR and displacement...',
    'Checking liquidity sweep + fakeout rejection...',
    'Calculating market regime and continuation confidence...',
    'Building final Tekora signal template...'
  ];
  let i=0; if(p)p.textContent=phases[0];
  o.classList.add('active');
  clearInterval(window.__tekoraScanPhase);
  window.__tekoraScanPhase=setInterval(()=>{i=(i+1)%phases.length;if(p)p.textContent=phases[i]},720);
}
function hideScanOverlay(){
  const o=document.getElementById('scanOverlay');
  if(o)o.classList.remove('active');
  clearInterval(window.__tekoraScanPhase);
}
runMain=async function(){
  const scanType=$('#scanType')?.value||'manual', mode=$('#mode')?.value||'scalp', timeframe=$('#timeframe')?.value||'15m'; const res=$('#results');
  showScanOverlay();
  if(res){res.className='results scanning';res.innerHTML='<div class="emptyState scanState"><h2>Analysing best available setup...</h2><p>Live MEXC data + candle object hotfix + fakeout rejection + liquidity sweep + volatility filter + continuation confidence.</p></div>'}
  try{
    if(scanType==='auto'){
      const d=await post('/api/scan',{mode,timeframe,universe:'top150'});
      $('#stats').innerHTML=`<div class="stat"><span>Engine</span><b></b></div><div class="stat"><span>Scanned</span><b>${d.scanned_jobs||'live'}</b></div><div class="stat"><span>Policy</span><b>Best Available</b></div><div class="stat"><span>Scan Time</span><b>${d.scan_time||'—'}s</b></div>`;
      const sig=d.best || (d.results||[])[0];
      res.innerHTML=sig?signalCard(sig):'<div class="emptyState"><h2>No data returned</h2><p>MEXC/API connection failed. Try again.</p></div>';
    }else{
      const symbol=$('#symbol')?.value||'BTCUSDT'; const d=await post('/api/signal',{symbol,mode,timeframe});
      $('#stats').innerHTML=`<div class="stat"><span>Engine</span><b></b></div><div class="stat"><span>Symbol</span><b>${d.symbol}</b></div><div class="stat"><span>Score</span><b>${d.score}</b></div><div class="stat"><span>Action</span><b>${d.action}</b></div>`;
      res.innerHTML=signalCard(d);
    }
    loadTrades(); loadJournal(); if(typeof loadDashMini==='function')loadDashMini(); if(typeof loadMarketPulse==='function')loadMarketPulse(); toast('Best setup generated + tracking started ✅');
  }catch(e){ if(res)res.innerHTML='<div class="emptyState"><h2>Engine error</h2><p>'+String(e.message||e)+' — check internet/MEXC terminal logs and try again.</p></div>'; }
  finally{ setTimeout(hideScanOverlay,650); }
}


// ================================================================
// TEKORA V25 PHASE 1 CORE PATCH — access/payment foundation + safer UI
// ================================================================
async function loadBillingMini(){
  const box=document.getElementById('billingMini'); if(!box)return;
  try{const a=await fetch('/api/billing/status').then(r=>r.json()); box.innerHTML=`<span>Access</span><b>${fmt(a.status)} • ${fmt(a.active_until_date)}</b>`;}catch(e){box.innerHTML='<span>Access</span><b>Offline</b>'}
}
async function requestBilling(){
  try{const d=await post('/api/billing/request',{telegram:document.getElementById('tgUser')?.value||'',plan:document.getElementById('billPlan')?.value||'monthly',note:document.getElementById('billNote')?.value||''}); toast(d.message||'Request saved ✅'); setTimeout(()=>location.reload(),800)}catch(e){toast(String(e.message||e))}
}
async function activateAccess(){
  try{const d=await post('/api/admin/activate',{user:document.getElementById('adminUser')?.value||'',days:document.getElementById('adminDays')?.value||30,pin:document.getElementById('adminPin')?.value||''}); toast('Access activated until '+(d.access?.active_until_date||'updated')+' ✅'); setTimeout(()=>location.reload(),800)}catch(e){toast(String(e.message||e))}
}
const _v25SignalCard = signalCard;
signalCard=function(s){
  if(!s)return '<div class="emptyState"><h2>No setup returned</h2><p>Engine refused or data provider failed.</p></div>';
  s.entry_label=s.entry_label||'Reference Entry'; s.engine_version=s.engine_version||'Tekora Engine';
  const html=_v25SignalCard(s);
  return html.replace('<div class="aiReasoning"><h3>', `<div class="v25Ribbon">${fmt(s.engine_version)} • ${fmt(s.execution_lock||'execution guarded')}</div><div class="aiReasoning"><h3>`);
}
document.addEventListener('DOMContentLoaded',()=>{loadBillingMini();});

// V26 SaaS billing/pricing UI
(function(){
  const toggles=[...document.querySelectorAll('.billingToggle button')];
  if(!toggles.length) return;
  let cycle='monthly';
  function apply(){
    toggles.forEach(b=>b.classList.toggle('active', b.dataset.cycle===cycle));
    document.querySelectorAll('.price').forEach(p=>{ p.textContent = p.dataset[cycle] || p.textContent; });
    document.querySelectorAll('.planCard em').forEach(e=>{ e.textContent = cycle==='annual' ? '/year' : '/month'; });
  }
  toggles.forEach(b=>b.addEventListener('click',()=>{cycle=b.dataset.cycle; apply();}));
  apply();
})();

async function startCheckout(plan){
  const annual = document.querySelector('.billingToggle button[data-cycle="annual"]')?.classList.contains('active');
  if(annual && plan.endsWith('_monthly')) plan = plan.replace('_monthly','_annual');
  const box=document.getElementById('checkoutBox');
  try{
    const res=await fetch('/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})});
    const data=await res.json();
    if(!data.ok) throw new Error(data.error||'Checkout failed');
    box.innerHTML=`<b>PayPal-ready order created</b><span>${data.order_id} • $${data.amount_usd} • ${data.email}</span><small>Next upgrade: real PayPal button capture. For testing now, use the demo complete button below.</small><button class="planBtn" onclick="demoCompletePayment('${plan}')">Dev Test: Mark Payment Complete</button>`;
    if(window.toast) toast('Checkout order created');
  }catch(e){ if(window.toast) toast(e.message||'Checkout failed'); }
}

async function demoCompletePayment(plan){
  try{
    const res=await fetch('/api/billing/demo-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})});
    const data=await res.json();
    if(!data.ok) throw new Error(data.error||'Payment test failed');
    if(window.toast) toast('Access activated for this email');
    setTimeout(()=>location.reload(),700);
  }catch(e){ if(window.toast) toast(e.message||'Payment test failed'); }
}

async function resendVerification(){
  try{
    const r = await fetch('/api/auth/resend-verification', {method:'POST'});
    const j = await r.json();
    toast(j.message || 'Verification email requested.');
  }catch(e){ toast('Could not resend verification email.'); }
}

// ===== TEKORA V31 MONSTER INTELLIGENCE UI =====
function aiLayerPanel(s){
  const a=s.ai_layers||{};
  const ml=a.machine_learning_model||{}, cvd=a.real_cvd_proxy||{}, depth=a.institutional_orderflow_proxy||{}, corr=a.correlation_engine||{}, sent=a.sentiment_ai||{}, mem=a.market_memory||{}, fp=a.footprint_profile||{};
  const ict=a.ict_core||{}, of=a.orderflow_layer||{}, cvda=a.cvd_engine||{}, fpe=a.footprint_engine||{}, htf=a.htf_bias_engine||{}, sniper=a.sniper_entry_ai||{}, whale=a.whale_activity_detector||{}, conf=a.smart_confidence_engine||{}, radar=a.market_condition_radar||{};
  const thinking=(a.live_ai_thinking||[]).map((x,i)=>`<div class="thinkStep" style="--d:${i}"><b>${fmt(x.icon)}</b><span>${fmt(x.text)}</span><em>${fmt(x.result)}</em></div>`).join('');
  const rows=(fp.rows||[]).slice(0,7).map(r=>`<div class="footRow ${String(r.side).toLowerCase()}"><span>${fmt(r.zone)}</span><b>${fmt(r.delta)}</b><em>B ${fmt(r.buy)} / S ${fmt(r.sell)}</em></div>`).join('');
  const grade=fmt(s.smart_grade||conf.signal_grade||'—');
  const score=fmt(s.smart_confidence||conf.smart_confidence_score||s.ai_score||ml.neural_score||'—');
  const checks=(sniper.checklist||[]).map(c=>`<small class="check ${c.pass?'ok':'wait'}">${c.pass?'✓':'•'} ${fmt(c.name)}</small>`).join('');
  return `<section class="aiMonsterPanel v31Panel">
    <div class="aiMonsterHead"><div><span class="eyebrow">Tekora Monster Intelligence</span><h3>${grade} Grade • Smart Confidence ${score}/100</h3><p>${fmt(sniper.sniper_state||'Sniper AI waiting')} • ${fmt(radar.condition||'Market radar active')}</p></div><b>V31</b></div>
    <div class="thinkingRail">${thinking||'<div class="thinkStep"><b>🧠</b><span>AI thinking layer active</span><em>Waiting data</em></div>'}</div>
    <div class="radarStrip">
      <div><span>Market Radar</span><b>${fmt(radar.condition)}</b><small>${fmt(radar.manipulation)} • ${fmt(radar.low_liquidity)}</small></div>
      <div><span>HTF Bias</span><b>${fmt(htf.overall_bias)}</b><small>4H ${fmt(htf.frames?.['4h'])} • 1H ${fmt(htf.frames?.['1h'])} • 15m ${fmt(htf.frames?.['15m'])}</small></div>
      <div><span>Sniper Entry AI</span><b>${fmt(sniper.sniper_state)}</b><small>${checks}</small></div>
    </div>
    <div class="aiGrid v31Grid">
      <div><span>ICT Core</span><b>${fmt(ict.mss)} / ${fmt(ict.cisd)}</b><small>FVG: ${fmt(ict.fvg_rank)} • OB ${fmt(ict.order_block_quality)}/100</small></div>
      <div><span>Liquidity Model</span><b>${fmt(ict.liquidity_sweep_validation)}</b><small>${fmt(ict.premium_discount_array)} • DOL ${fmt(ict.draw_on_liquidity)}</small></div>
      <div><span>PO3 / Judas / OTE</span><b>${fmt(ict.po3_model)}</b><small>${fmt(ict.judas_swing)} • ${fmt(ict.ote_retracement)}</small></div>
      <div><span>Orderflow Layer</span><b>${fmt(of.stacked_imbalance_zones)}</b><small>${fmt(of.absorption_detection)} • iceberg ${fmt(of.iceberg_probability)}</small></div>
      <div><span>CVD Engine</span><b>${fmt(cvda.delta_trend_memory||cvd.cvd_bias)}</b><small>${fmt(cvda.buyer_seller_aggression)} • session ${fmt(cvda.session_delta)}</small></div>
      <div><span>Whale Detector</span><b>${fmt(whale.spoofing_probability)}</b><small>${fmt(whale.sudden_depth_shifts)} • ${fmt(whale.liquidity_vacuum_moves)}</small></div>
      <div><span>Correlation Engine</span><b>BTC ${fmt(corr.btc_corr)} / ETH ${fmt(corr.eth_corr)}</b><small>${fmt(corr.note)}</small></div>
      <div><span>Replay Memory Learning</span><b>${fmt(mem.seen_count)} fingerprints</b><small>${fmt(mem.memory_note)}</small></div>
      <div><span>Sentiment AI</span><b>${fmt(sent.label)}</b><small>Confidence ${fmt(sent.confidence)}/100</small></div>
    </div>
    <div class="footprintBox"><div><span class="eyebrow">Footprint + Delta Profile</span><h4>${fmt(fp.summary)} • ${fmt(fpe.trapped_trader_zones||'')}</h4></div>${rows||'<p>No footprint rows available.</p>'}</div>
    <p class="truthNote">${fmt(a.truth_note||'AI layers are advisory analytics, not guaranteed prediction.')}</p>
  </section>`
}
const _oldSignalCardV31 = signalCard;
signalCard=function(s){
  const base=_oldSignalCardV31(s);
  return base.replace('</article>', aiLayerPanel(s)+'</article>');
}
async function loadAILab(){
  const box=document.getElementById('aiLabOutput'); if(!box)return;
  const symbol=document.getElementById('symbol')?.value||'BTCUSDT', timeframe=document.getElementById('timeframe')?.value||'15m';
  box.innerHTML='<div class="emptyState"><h2>AI Lab running...</h2><p>Reading CVD proxy, footprint profile, depth, correlation and sentiment.</p></div>';
  try{const d=await post('/api/ai-lab',{symbol,timeframe}); box.innerHTML=`<pre>${JSON.stringify(d,null,2)}</pre>`}catch(e){box.innerHTML='<p>AI Lab error: '+String(e.message||e)+'</p>'}
}
