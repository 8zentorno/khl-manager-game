/* KHL Manager 8.10.2 — схема льда: общие компоненты + «Состав» (редактор звеньев).
   Вкладка «Спецбригады» подключает эти же компоненты в special_ui.js. Старый вид «Список» остаётся. */
(function(){
  const proto=KHLManagerApp.prototype;
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // ---- вид (список / схема), запоминается на устройстве ----
  proto.schemeViewGet=function(key){try{return localStorage.getItem('khl.view.'+key)==='list'?'list':'scheme';}catch(e){return 'scheme';}};
  proto.schemeViewSet=function(key,v){try{localStorage.setItem('khl.view.'+key,v);}catch(e){}};
  proto.surname=function(p){const w=String(p?.name||'').trim().split(/\s+/);return w.length>1?w.slice(1).join(' '):(w[0]||'');};
  proto.schemeState=function(p){
    if(!p)return 'ok';
    if((this.hasActiveInjury&&this.hasActiveInjury(p))||(this.isPlayerUnavailable&&this.isPlayerUnavailable(p)))return 'injured';
    const d=(this.playerDev&&this.playerDev(p))||{};
    if(Number(d.fatigue??0)>=60)return 'tired';
    if(Number(d.form??50)>=60)return 'hot';
    return 'ok';
  };
  // ---- элементы схемы ----
  proto.schemeChip=function(o){
    const p=o.player,x=o.x,y=o.y,attrs=o.attrs||'';
    if(!p)return `<button class="sch-chip empty${o.armed?' armed-target':''}" style="left:${x}%;top:${y}%" ${attrs} aria-label="${esc(o.label)}: пусто"><span class="r">—</span><span class="n">${esc(o.short||'')}</span></button>`;
    return `<button class="sch-chip${o.key?' key':''}${o.armed?' armed-target':''}${o.dup?' dup':''}" data-state="${o.state||'ok'}" style="left:${x}%;top:${y}%" ${attrs} aria-label="${esc(o.label)}: ${esc(p.name)}, рейтинг ${o.rating}${o.diff?', сейчас '+(o.rating+o.diff):''}">`
      +`${p.number?`<span class="no">${p.number}</span>`:''}${p.foreign?'<span class="fg">ЛЕГ</span>':''}${o.cross?'<span class="x2" title="Играет и в другой бригаде">2×</span>':''}`
      +`<span class="r">${o.rating}</span><span class="n">${esc(this.surname(p))}</span>${this.ratingDiffHtml(o.diff,'sch-d')}${o.off?`<span class="off">${esc(o.off)}</span>`:''}</button>`;
  };
  proto.schemeLegend=function(extra){
    return `<div class="sch-legend"><span><s style="border-color:var(--cyan)"></s>в порядке</span><span><s style="border-color:var(--green)"></s>в форме</span><span><s style="border-color:var(--gold)"></s>устал</span><span><s style="border-color:var(--red)"></s>травма</span>${extra||''}</div>`;
  };
  // нижнее окно выбора игрока
  proto.schemeSheetOpen=function(o){
    let sheet=document.getElementById('sch-sheet');
    if(!sheet){
      document.body.insertAdjacentHTML('beforeend','<div id="sch-scrim" class="sch-scrim" onclick="app.schemeSheetClose()"></div><div id="sch-sheet" class="sch-sheet" role="dialog" aria-modal="true"></div>');
      sheet=document.getElementById('sch-sheet');
    }
    this._schPickMap={};
    const rows=o.rows.map((r,i)=>{
      this._schPickMap[i]=r;
      return `<button class="sch-row${r.current?' cur':''}" aria-disabled="${r.disabled?'true':'false'}" onclick="app.schemeSheetPick(${i})"><span class="rt">${r.rating}${r.diff?this.ratingDiffHtml(r.diff,'sh-d'):''}</span><span class="who"><span class="nm">${esc(r.name)}</span><span class="meta">${esc(r.meta||'')}</span></span><span class="tg">${(r.tags||[]).map(t=>`<span class="t ${t[1]||''}">${esc(t[0])}</span>`).join('')}</span></button>`;
    }).join('');
    this._schOnPick=o.onPick;
    sheet.innerHTML=`<div class="sh"><div><h4>${esc(o.title)}</h4><small>${esc(o.sub||'')}</small></div><button class="btn btn-quiet" onclick="app.schemeSheetClose()">Закрыть</button></div><div class="sch-rows">${rows}<button class="sch-row" onclick="app.schemeSheetPick(-1)"><span class="rt">—</span><span class="who"><span class="nm">${esc(o.clearLabel||'Освободить место')}</span></span><span></span></button></div>`;
    document.getElementById('sch-scrim').classList.add('on');sheet.classList.add('on');
  };
  proto.schemeSheetClose=function(){document.getElementById('sch-scrim')?.classList.remove('on');document.getElementById('sch-sheet')?.classList.remove('on');this._schOnPick=null;};
  proto.schemeSheetPick=function(i){
    const fn=this._schOnPick;
    if(i>=0){const r=this._schPickMap?.[i];if(!r||r.disabled)return;this.schemeSheetClose();fn&&fn(r.id);}
    else{this.schemeSheetClose();fn&&fn('');}
  };
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('keydown',e=>{if(e.key==='Escape'&&typeof app!=='undefined'){app.schemeSheetClose?.();if(app._schArmed){app._schArmed=null;app.renderRoster?.();}}});

  // ================= «Состав» =================
  const ROW_Y=[10,22.4,34.8,47.2];
  const rinkSvgLines=()=>`<svg viewBox="0 0 300 585" preserveAspectRatio="none" aria-hidden="true">
   <line x1="0" y1="190" x2="300" y2="190" stroke="#3c78c4" stroke-width="6" opacity=".55"/><line x1="0" y1="52" x2="300" y2="52" stroke="#d2494f" stroke-width="2" opacity=".3"/>
   <circle cx="150" cy="190" r="34" fill="none" stroke="#3c78c4" stroke-width="1.5" opacity=".45"/>
   <line x1="0" y1="540" x2="300" y2="540" stroke="#d2494f" stroke-width="2"/><path d="M118 540 a32 32 0 0 0 64 0z" fill="#1b4470" stroke="#d2494f" stroke-width="1.5"/><path d="M118 540 h64 v-12 h-64z" fill="none" stroke="#d2494f" stroke-width="2"/>
   <circle cx="62" cy="470" r="34" fill="none" stroke="#d2494f" stroke-width="1.5" opacity=".5"/><circle cx="238" cy="470" r="34" fill="none" stroke="#d2494f" stroke-width="1.5" opacity=".5"/></svg>`;
  const slotGeo=()=>{
    const g=[];
    [1,2,3,4].forEach((n,i)=>[['LW',22],['C',50],['RW',78]].forEach(([pos,x])=>g.push({id:`F${n}${pos}`,x,y:ROW_Y[i],type:'F',pos,short:({LW:'ЛН',C:'Ц',RW:'ПН'})[pos]})));
    [1,2,3].forEach((n,i)=>[['L',34],['R',66]].forEach(([s,x])=>g.push({id:`D${n}${s}`,x,y:61+i*10.2,type:'D',short:s==='L'?'ЛЗ':'ПЗ'})));
    g.push({id:'G',x:50,y:93,type:'G',short:'В'});
    return g;
  };
  const slotName=id=>id==='G'?'Вратарь':id[0]==='F'?`Звено ${id[1]} · ${({LW:'левый край',C:'центр',RW:'правый край'})[id.slice(2)]}`:`Пара ${id[1]} · ${id[2]==='L'?'левый':'правый'}`;
  proto.schemeLineSlotName=slotName;

  proto.renderLineScheme=function(){
    const lineEl=document.getElementById('line-editor');if(!lineEl||!this.state)return;
    const view=this.schemeViewGet('lines');
    lineEl.dataset.view=view;
    const old=lineEl.querySelector('.sch-lines');if(old)old.remove();
    const id=this.state.teamId,slots=this.state.slotAssignments||{},all=this.teamPlayers(id);
    const byId=pid=>all.find(p=>p.id===pid);
    const eff=p=>Math.round(this.effectiveOVR(p));
    const armed=this._schArmed;
    const avg=ids=>{const a=ids.map(i=>byId(slots[i])).filter(Boolean);return a.length?a.reduce((s,p)=>s+this.effectiveOVR(p),0)/a.length:0;};
    let rink=rinkSvgLines();
    [1,2,3,4].forEach((n,i)=>{rink+=`<div class="sch-tag" style="top:${ROW_Y[i]-6.6}%">Звено ${n}<b>${avg([`F${n}LW`,`F${n}C`,`F${n}RW`]).toFixed(1)}</b></div>`;});
    [1,2,3].forEach((n,i)=>{rink+=`<div class="sch-tag" style="top:${61+i*10.2-6.4}%">Пара ${n}<b>${avg([`D${n}L`,`D${n}R`]).toFixed(1)}</b></div>`;});
    for(const g of slotGeo()){
      const p=byId(slots[g.id]);
      const off=p&&g.type==='F'&&p.pos!==g.pos?`${this.positionLabel(p.pos)} на ${this.positionLabel(g.pos)}`:'';
      rink+=this.schemeChip({player:p,x:g.x,y:g.y,rating:p?Math.round(this.permanentOVR(p)):0,diff:p?this.ratingView(p).diff:0,state:this.schemeState(p),label:slotName(g.id),short:g.short,armed:!!armed,off,attrs:`data-slot="${g.id}" onclick="app.schemeLineClick('${g.id}')"`});
    }
    // заявка и запас
    let q='';
    try{
      const info=this.foreignQuotaInfoV75(id);
      const pips=Array.from({length:Math.max(5,info.count)},(_,i)=>`<i class="${i<info.count?(i>=5&&!info.exempt?'over':'on'):''}"></i>`).join('');
      q=info.exempt
        ?`<h3>Заявка на матч</h3><div class="sch-ok">Лимит легионеров для вашего клуба не применяется.</div>`
        :`<h3>Заявка на матч</h3><div class="sch-qrow"><span>Легионеры (звенья и спецбригады)</span></div><div class="sch-pips">${pips}</div><div class="sch-qrow"><span>Иностранные вратари</span></div><div class="sch-pips"><i class="${info.goalies>0?(info.goalies>1?'over':'on'):''}"></i></div>${info.valid?'<div class="sch-ok">✓ Заявка корректна</div>':'<div class="sch-alert">⚠ Лимит легионеров превышен: уберите лишних из звеньев или спецбригад</div>'}`;
    }catch(e){q='';}
    const filter=this._schFilter||'all';
    const assigned=new Set(Object.values(slots).filter(Boolean));
    const match=p=>filter==='all'||(filter==='fw'&&['LW','C','RW'].includes(p.pos))||(filter==='df'&&p.pos==='D')||(filter==='gk'&&p.pos==='G');
    const bench=all.filter(p=>!assigned.has(p.id)&&match(p)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    const F={all:'Все',fw:'Нападающие',df:'Защитники',gk:'Вратари'};
    const injText=p=>{const inj=this.playerDev(p)?.injury;if(!inj)return 'Травма';
      const d=Math.max(0,Number(inj.daysRemaining)||0),g=Math.max(0,Number(inj.gamesRemaining)||0);
      return inj.severity==='light'?'Травма: лёгкая':inj.severity==='medium'&&g?`Травма: ещё ${g} матч.`:d?`Травма: ещё ${d} дн.`:'Травма';};
    const condHtml=(p,inj)=>{if(inj)return `<span class="sch-inj">${esc(injText(p))}</span>`;
      try{const dev=this.playerDev(p)||{};return this.rtFlagBadges({flags:this.devFlags(p),fatigue:Math.round(Number(dev.fatigue??0)),form:Math.round(Number(dev.form??50))});}catch(e){return '<span class="rt-okc">в порядке</span>';}};
    const trow=(p,inj)=>{const pos=this.positionLabel(p.pos);
      const attrs=inj?'':` data-dnd-pid="${p.id}" role="button" tabindex="0" onclick="app.schemeBenchClick('${p.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.schemeBenchClick('${p.id}')}"`;
      return `<div class="sch-tr${armed===p.id?' armed':''}"${attrs} aria-disabled="${inj}"><span class="c-nm"><b>${esc(p.name)}</b>${this.kaBadge?this.kaBadge(p):''}${p.foreign?'<i class="sch-leg">Лег.</i>':''}<small>${pos}</small></span><span class="c-pos">${pos}</span><span class="c-ovr"><i>${Math.round(this.permanentOVR(p))}</i>${this.ratingDiffHtml(this.ratingView(p).diff,'tr-d')}</span><span class="c-st${inj?' inj':''}">${inj?'Травма':'Резерв'}</span><span class="c-cd">${condHtml(p,inj)}</span></div>`;};
    const thead='<div class="sch-th"><span class="c-nm">Игрок</span><span class="c-pos">Поз.</span><span class="c-ovr">OVR</span><span class="c-st">Статус</span><span class="c-cd">Состояние</span></div>';
    const isInj=p=>{try{return !!this.devFlags(p).inj;}catch(e){return this.schemeState(p)==='injured';}};
    const benchOk=bench.filter(p=>!isInj(p));
    const benchHtml=benchOk.length?`<div class="sch-tbl">${thead}${benchOk.map(p=>trow(p,false)).join('')}</div>`:'<div class="sch-hint">В запасе нет игроков этой позиции.</div>';
    const hurt=all.filter(isInj).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    const hurtHtml=hurt.length?`<div class="sch-tbl">${thead}${hurt.map(p=>trow(p,true)).join('')}</div>`:'<div class="sch-ok">Все игроки доступны</div>';
    const html=`<div class="sch-lines"><div class="sch-main">
      <div class="sch-rinkcol"><div class="sch-rink sch-rink-lines">${rink}</div>${this.schemeLegend()}</div>
      <div class="sch-side"><div class="sch-card">${q}</div>
        <div class="sch-card" data-dnd-bench="1"><h3>Запас</h3><p class="sch-hint">${armed?`Выбран ${esc(byId(armed)?.name||'')}. Нажмите на место на льду.`:'Перетащите игрока на место на льду (на телефоне сначала удержите) или нажмите на него, затем на место: прежний игрок уйдёт в запас или поменяется местами.'}</p>
        <div class="sch-filters">${Object.entries(F).map(([k,v])=>`<button aria-pressed="${filter===k}" onclick="app.schemeBenchFilter('${k}')">${v}</button>`).join('')}</div>
        ${benchHtml}</div>
        <div class="sch-card"><h3>Недоступные</h3><p class="sch-hint">Травмированные игроки: на лёд их поставить нельзя.</p>${hurtHtml}</div></div></div></div>`;
    const bar=`<div class="sch-bar" data-sch-bar><span class="sch-lab">Вид:</span><div class="sch-seg"><button aria-pressed="${view==='list'}" onclick="app.schemeSetView('lines','list')">Список</button><button aria-pressed="${view==='scheme'}" onclick="app.schemeSetView('lines','scheme')">Схема</button></div></div>`;
    lineEl.querySelector('[data-sch-bar]')?.remove();
    lineEl.insertAdjacentHTML('afterbegin',bar);
    lineEl.insertAdjacentHTML('beforeend',html);
  };
  proto.schemeSetView=function(key,v){this.schemeViewSet(key,v);if(key==='lines')this.renderLineScheme();else this.renderSpecialTeams();};
  proto.schemeBenchFilter=function(f){this._schFilter=f;this.renderLineScheme();};
  proto.schemeBenchClick=function(pid){
    const p=this.db.players.find(x=>x.id===pid);if(!p||this.schemeState(p)==='injured')return;
    this._schArmed=this._schArmed===pid?null:pid;this.renderLineScheme();
  };
  proto.schemeLineClick=function(slot){
    if(this._schArmed){const pid=this._schArmed;this._schArmed=null;this.assignSlot(slot,pid);return;}
    const all=this.teamPlayers(this.state.teamId),slots=this.state.slotAssignments||{};
    const g=slotGeo().find(x=>x.id===slot),type=g.type;
    const fit=p=>type==='F'?['LW','C','RW'].includes(p.pos):p.pos===type;
    const cands=all.filter(fit).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    const rows=cands.map(p=>{
      const st=this.schemeState(p),cur=slots[slot]===p.id,where=Object.keys(slots).find(k=>slots[k]===p.id);
      return {id:p.id,rating:Math.round(this.permanentOVR(p)),diff:this.ratingView(p).diff,name:`${p.name}${p.number?' · №'+p.number:''}`,meta:`${this.positionLabel(p.pos)} · ${this.ageText(this.ageYears(p))}`,current:cur,disabled:st==='injured',
        tags:[st==='injured'?['травма','b']:null,where&&!cur?['сейчас: '+slotName(where)]:null,!where?['запас','g']:null,p.foreign?['иностранец','w']:null,st==='tired'?['устал','w']:null,type==='F'&&p.pos!==g.pos?[`${this.positionLabel(p.pos)} на ${this.positionLabel(g.pos)}`,'w']:null].filter(Boolean)};
    });
    this.schemeSheetOpen({title:slotName(slot),sub:'Игрок из другого звена поменяется местами с текущим',rows,clearLabel:'Освободить место',onPick:pid=>{
      if(pid){this.assignSlot(slot,pid);}
      else{this.state.slotAssignments[slot]='';this.syncLineAssignmentsFromSlots();this.renderRoster();this.persistQuietly();}
    }});
  };
  const baseLE=proto.renderLineEditorV733;
  if(typeof baseLE==='function')proto.renderLineEditorV733=function(){
    const r=baseLE.apply(this,arguments);
    try{this.renderLineScheme();}catch(e){console.warn('scheme lines',e);}
    return r;
  };
})();
