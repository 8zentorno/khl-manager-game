/* KHL Manager 8.10.1 — верхняя панель вкладки «Спецбригады»: сводка, лидеры, кнопка рекомендаций. */
(function(){
  const proto=KHLManagerApp.prototype;
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const manp=e=>e.affectsManpower!==false&&!e.coincidental&&!e.queued&&['minor','doubleMinor','major','majorDkm',undefined].includes(e.type);

  // Сводка по лиге: возможности и голы в большинстве/меньшинстве у каждой команды.
  proto.specialLeagueTable=function(){
    const t={};const row=id=>t[id]||(t[id]={id,ppOpp:0,ppG:0,pkOpp:0,pkGA:0,shG:0,gp:0});
    for(const m of (this.state?.matches||[])){
      if(!m.played||m.cancelled||m.playoff)continue;
      row(m.homeId).gp++;row(m.awayId).gp++;
      for(const e of m.events||[]){
        if(e.kind==='penalty'&&manp(e)){const g=String(e.teamId),a=g===m.homeId?m.awayId:m.homeId;row(a).ppOpp++;row(g).pkOpp++;}
        if(e.kind==='goal'&&e.powerPlay){row(e.teamId).ppG++;row(e.teamId===m.homeId?m.awayId:m.homeId).pkGA++;}
        if(e.kind==='goal'&&e.shortHanded)row(e.teamId).shG++;
      }
    }
    return t;
  };
  const rank=(table,id,val,desc=true)=>{
    const rows=Object.values(table).filter(r=>r.gp>0&&val(r)!==null).sort((a,b)=>desc?val(b)-val(a):val(a)-val(b));
    const i=rows.findIndex(r=>r.id===id);return i<0?null:i+1;
  };
  proto.specialPowerPlayLeaders=function(limit=5){
    const teamId=this.state.teamId,stat={};
    const add=(id,k)=>{if(!id)return;const s=stat[id]||(stat[id]={g:0,a:0});s[k]++;};
    for(const m of this.state.matches||[]){
      if(!m.played||m.cancelled||m.playoff)continue;
      for(const e of m.events||[]){
        if(e.kind!=='goal'||!e.powerPlay||String(e.teamId)!==String(teamId))continue;
        add(e.scorerId,'g');add(e.assist1Id,'a');add(e.assist2Id,'a');
      }
    }
    return Object.entries(stat).map(([id,s])=>({p:this.db.players.find(x=>String(x.id)===String(id)),...s,pts:s.g+s.a}))
      .filter(r=>r.p).sort((a,b)=>b.pts-a.pts||b.g-a.g||String(a.p.name).localeCompare(String(b.p.name),'ru')).slice(0,limit);
  };
  proto.specialSummaryHtml=function(){
    const st=this.state,tid=st.teamId,table=this.specialLeagueTable(),me=table[tid]||{gp:0,ppOpp:0,ppG:0,pkOpp:0,pkGA:0,shG:0};
    const pct=(a,b)=>b?Math.round(a/b*100):null,fmt=v=>v===null?'—':v+'%';
    const pp=pct(me.ppG,me.ppOpp),pk=me.pkOpp?Math.round((me.pkOpp-me.pkGA)/me.pkOpp*100):null;
    const ppRank=rank(table,tid,r=>r.ppOpp?r.ppG/r.ppOpp:null),pkRank=rank(table,tid,r=>r.pkOpp?(r.pkOpp-r.pkGA)/r.pkOpp:null);
    const n=Object.values(table).filter(r=>r.gp>0).length;
    const per=me.gp?(me.ppOpp/me.gp).toFixed(1):'—';
    const diff=me.ppG+me.shG-me.pkGA,hasData=me.gp>0;
    const card=(label,val,sub)=>`<div class="special-sum-card"><span>${label}</span><b>${val}</b><em>${sub}</em></div>`;
    const sub=(rk,extra)=>hasData&&rk?`${extra} · ${rk}-е место из ${n}`:(hasData?extra:'нет данных');
    const leaders=this.specialPowerPlayLeaders();
    const leadHtml=leaders.length
      ?`<table class="special-leaders"><thead><tr><th>Игрок</th><th>Г</th><th>А</th><th>О</th></tr></thead><tbody>${leaders.map(r=>`<tr><td><span class="nm" data-pl="${esc(r.p.id)}">${esc(r.p.name)}</span></td><td>${r.g}</td><td>${r.a}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>`
      :'<div class="tiny muted">Пока нет голов вашей команды в большинстве.</div>';
    return `<div class="special-summary"><details class="special-leaders-box"><summary>Лидеры вашей команды в большинстве</summary>${leadHtml}</details></div>`;
  };

  const UNITS=['pp1','pp2','pk1','pk2'];
  const NAMES={pp1:'Большинство 1',pp2:'Большинство 2',pk1:'Меньшинство 1',pk2:'Меньшинство 2'};
  const GEO={
    pp:{F1:[20,32,'Нап. 1'],F2:[50,20,'Нап. 2'],F3:[80,32,'Нап. 3'],D1:[30,70,'Защ. 1'],D2:[70,70,'Защ. 2']},
    pk:{F1:[33,46,'Нап. 1'],F2:[67,46,'Нап. 2'],D1:[28,76,'Защ. 1'],D2:[72,76,'Защ. 2']}
  };
  const rinkSvg=kind=>kind==='pp'
    ?`<svg viewBox="0 0 300 306" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="26" x2="300" y2="26" stroke="#d2494f" stroke-width="2"/><path d="M118 26 h64 v-12 h-64z" fill="none" stroke="#d2494f" stroke-width="2"/><path d="M118 26 a32 32 0 0 0 64 0z" fill="#1b4470" stroke="#d2494f" stroke-width="1.5"/><circle cx="62" cy="86" r="34" fill="none" stroke="#d2494f" stroke-width="1.5" opacity=".6"/><circle cx="238" cy="86" r="34" fill="none" stroke="#d2494f" stroke-width="1.5" opacity=".6"/><line x1="0" y1="232" x2="300" y2="232" stroke="#3c78c4" stroke-width="7" opacity=".6"/></svg>`
    :`<svg viewBox="0 0 300 306" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="280" x2="300" y2="280" stroke="#d2494f" stroke-width="2"/><path d="M118 280 h64 v12 h-64z" fill="none" stroke="#d2494f" stroke-width="2"/><path d="M118 280 a32 32 0 0 1 64 0z" fill="#1b4470" stroke="#d2494f" stroke-width="1.5"/><circle cx="62" cy="220" r="34" fill="none" stroke="#d2494f" stroke-width="1.5" opacity=".6"/><circle cx="238" cy="220" r="34" fill="none" stroke="#d2494f" stroke-width="1.5" opacity=".6"/><line x1="0" y1="74" x2="300" y2="74" stroke="#3c78c4" stroke-width="7" opacity=".6"/></svg>`;
  proto.specialSchemeBlock=function(key,draft,conflicts,roster){
    const kind=key.slice(0,2),slots=Object.keys(GEO[kind]),unit=draft[key]||{};
    const players=slots.map(s=>roster.find(p=>p.id===unit[s])).filter(Boolean);
    const e=this.specialUnitEffect(this.state.teamId,kind,players);
    const cls=e.pct>0?'up':e.pct<0?'down':'flat',txt=(e.pct>0?'+':'')+e.pct+'%';
    const half=Math.min(50,Math.abs(e.d)*5);
    const bar=e.d>=0?`<em class="up" style="left:50%;width:${half}%"></em>`:`<em class="down" style="right:50%;width:${half}%"></em>`;
    const crossKind=id=>UNITS.some(k=>k.slice(0,2)!==kind&&Object.values(draft[k]||{}).includes(id));
    const chips=slots.map(s=>{
      const [x,y,short]=GEO[kind][s],p=roster.find(q=>q.id===unit[s]);
      return this.schemeChip({player:p,x,y,rating:p?Math.round(this.permanentOVR(p)):0,diff:p?this.ratingView(p).diff:0,state:this.schemeState(p),label:`${NAMES[key]} · ${short}`,short,
        key:kind==='pk'&&s[0]==='D',dup:!!p&&conflicts.has(`${key}:${s}`),cross:!!p&&crossKind(p.id),
        attrs:`data-sp-unit="${key}" data-sp-slot="${s}" onclick="app.openSpecialPicker('${key}','${s}')"`});
    }).join('');
    return `<div class="sp-scheme"><div class="sp-meter"><div class="sp-mrow"><span>Сила бригады <b>${e.rating.toFixed(1)}</b></span></div></div>
      <div class="sch-rink sch-rink-sp">${rinkSvg(kind)}<span class="sch-tag" style="top:6px">${kind==='pp'?'Зона соперника':'Своя зона'}</span>${chips}</div>
      ${this.schemeLegend('<span>2× — играет и в другой бригаде</span>'+(kind==='pk'?'<span>светлая рамка — ключевой слот</span>':''))}</div>`;
  };
  proto.openSpecialPicker=function(key,slot){
    if(!this.state)return;
    const kind=key.slice(0,2),isF=slot[0]==='F',draft=this.ensureSpecialTeamsDraft76(),roster=this.teamPlayers(this.state.teamId);
    const cur=(draft[key]||{})[slot];
    const takenSame={};for(const k of UNITS){if(k.slice(0,2)!==kind)continue;for(const [s,id] of Object.entries(draft[k]||{})){if(id&&!(k===key&&s===slot))takenSame[id]=k;}}
    const inOther=id=>UNITS.some(k=>k.slice(0,2)!==kind&&Object.values(draft[k]||{}).includes(id));
    const before=this.specialUnitEffect(this.state.teamId,kind,Object.keys(GEO[kind]).map(s=>roster.find(p=>p.id===draft[key][s]))).pct;
    const cands=roster.filter(p=>isF?['LW','C','RW'].includes(p.pos):p.pos==='D').sort((a,b)=>this.spPlayerMetric(b,kind)-this.spPlayerMetric(a,kind));
    const rows=cands.map(p=>{
      const unavailable=this.isPlayerUnavailable(p),busy=takenSame[p.id],isCur=p.id===cur,st=this.schemeState(p);
      const t=Object.assign({},draft[key]);t[slot]=p.id;
      const after=this.specialUnitEffect(this.state.teamId,kind,Object.keys(GEO[kind]).map(s=>roster.find(q=>q.id===t[s]))).pct,delta=after-before;
      const tags=[unavailable?['травма','b']:null,busy?['занят: '+NAMES[busy],'w']:null,!busy&&inOther(p.id)?['и в '+(kind==='pp'?'меньшинстве':'большинстве'),'w']:null,st==='tired'?['устал','w']:null,st==='hot'?['в форме','g']:null,(!unavailable&&!busy&&!isCur)?[(delta>0?'+':'')+delta+'%',delta>0?'g':delta<0?'b':'']:null].filter(Boolean);
      return {id:p.id,rating:Math.round(this.permanentOVR(p)),diff:this.ratingView(p).diff,name:`${p.name}${p.number?' · №'+p.number:''}`,
        meta:`бросок ${Math.round(this.playerSkill(p,'shooting'))} · пас ${Math.round(this.playerSkill(p,'passing'))} · защита ${Math.round(this.playerSkill(p,'defense'))} · скорость ${Math.round(this.playerSkill(p,'skating'))}`,
        current:isCur,disabled:unavailable||!!busy,tags};
    });
    this.schemeSheetOpen({title:`${NAMES[key]} · ${GEO[kind][slot][2]}`,sub:kind==='pp'?'Важны бросок и пас':(isF?'Важны защита и скорость':'Ключевой слот: защитник весит больше'),rows,clearLabel:'Оставить пустым',
      onPick:id=>this.assignSpecialPlayer(key,slot,id)});
  };
  proto.setSpecialTab=function(k){this._spTab=k;this.renderSpecialTeams();};

  const base=proto.renderSpecialTeams;
  proto.renderSpecialTeams=function(){
    base.call(this);
    const root=document.getElementById('specialteams-content');if(!root||!this.state||typeof root.innerHTML!=='string'||!root.innerHTML)return;
    let h=root.innerHTML;
    h=h.replace(/Реализация большинства \(учтённые попытки\)/g,'Реализация большинства').replace(/Убийство штрафов \(учтённые попытки\)/g,'Убийство штрафов')
       .replace(/Пропущено:/g,'пропущено:').replace(/голов всего:/g,'голов:');
    h=h.replace('<div class="special-status-column">','<button class="btn btn-quiet special-reco" onclick="app.resetSpecialTeams()">↺ Рекомендуемые сочетания</button><div class="special-status-column">');
    const view=this.schemeViewGet('sp'),tab=this._spTab||'pp1';
    // схема в каждой карточке бригады
    let draft={},conflicts=new Set();
    try{draft=this.ensureSpecialTeamsDraft76();conflicts=this.specialTeamsConflicts76(draft).conflicts;}catch(e){}
    const roster=this.teamPlayers(this.state.teamId);
    let i=0;
    h=h.replace(/<article class="special-unit([^"]*)">([\s\S]*?)<div class="special-slots">/g,(m,cls,mid)=>{
      const key=UNITS[i++];if(!key)return m;
      let block='';try{block=this.specialSchemeBlock(key,draft,conflicts,roster);}catch(e){console.error('special scheme',e);}
      return `<article class="special-unit${cls}${key===tab?' sp-active':''}" data-unit="${key}">${mid}${block}<div class="special-slots">`;
    });
    const bar=`<div class="sp-bar">`
      +`<div class="sp-tabs" role="tablist">${UNITS.map(k=>`<button role="tab" aria-selected="${k===tab}" onclick="app.setSpecialTab('${k}')">${NAMES[k]}</button>`).join('')}</div></div>`;
    const at=h.indexOf('<article');
    if(at>=0)h=h.slice(0,at)+bar+h.slice(at);
    let summary='';try{summary=this.specialSummaryHtml();}catch(e){console.error('special summary',e);}
    root.innerHTML=summary+h;
    if(root.dataset)root.dataset.view=view;
  };
})();
