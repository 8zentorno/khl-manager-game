/* KHL Manager 8.15 — Матч-центр: шайбы-голы по месту броска (без лимита и наложений),
   голы под названиями команд, передачи в скобках, фильтры ленты матча. */
(function(){
  const proto=KHLManagerApp.prototype;
  const baseDraw=proto.drawRink,baseRender=proto.renderMatchCenter;
  // Размеры площадки на холсте 900×420 (как в drawRink).
  const L=42,T=38,W=816,H=344,CY=T+H/2,GL=L+W*.17,GR=L+W*.83;
  const COLORS={h:'#0e7490',a:'#c2415b'};
  const ZONE_NAME={slot:'слот перед воротами',circle:'круг вбрасывания',point:'бросок от синей линии',wing:'острый угол у борта',crease:'добивание у ворот',bumper:'высокий слот',empty:'в пустые ворота',penalty:'штрафной бросок'};
  const LBL='khl.mcLabel';
  proto.mcLabelMode=function(){
    if(this._mcLabel)return this._mcLabel;
    let v='no';try{v=localStorage.getItem(LBL)||'no';}catch(e){}
    return this._mcLabel=(v==='ord'?'ord':'no');
  };
  proto.mcSetLabel=function(v){
    this._mcLabel=v==='ord'?'ord':'no';try{localStorage.setItem(LBL,this._mcLabel);}catch(e){}
    if(this._rinkMatch)this.drawRink(this._rinkMatch);
  };
  
  proto.goalPuckLabel=function(g){
    if(this.mcLabelMode()==='ord')return String(g.n);
    const sc=this.db.players.find(p=>p.id===g.e.scorerId);
    return sc&&sc.number?String(sc.number):String(g.n);
  };
  proto.goalZoneName=function(z){return ZONE_NAME[z]||ZONE_NAME.slot;};

  // ---- детерминированный выбор места броска ----
  function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
  function pickZone(r,e,isD){
    if(e.penaltyShot)return 'penalty';
    if(e.emptyNet)return 'empty';
    const table=e.powerPlay?[['point',.30],['circle',.30],['slot',.25],['bumper',.15]]
      :e.shortHanded?[['slot',.45],['crease',.30],['bumper',.15],['wing',.10]]
      :isD?[['point',.45],['circle',.20],['slot',.15],['wing',.10],['bumper',.10]]
      :[['slot',.30],['circle',.22],['wing',.14],['point',.12],['crease',.14],['bumper',.08]];
    let x=r(),acc=0;for(const [z,p] of table){acc+=p;if(x<=acc)return z;}return table[0][0];
  }
  const OFFSET={slot:[62,0,12,16],circle:[80,66,14,10],point:[170,0,14,26],wing:[42,98,12,8],crease:[16,0,6,22],bumper:[112,0,12,12],empty:[270,0,45,16],penalty:[50,0,4,5]};
  // Записывает место броска в событие гола (один раз; для старых матчей считается по номеру гола).
  proto.ensureGoalPlace=function(match,e,ordinal){
    if(e.shotZone&&Number.isFinite(e.shotDx)&&Number.isFinite(e.shotDy))return e;
    const r=rng(hashStr(`${match.id}|${ordinal}|${e.scorerId||''}|${e.time||''}|${e.period||''}`));
    const sc=this.db?.players?.find(p=>p.id===e.scorerId);
    const zone=pickZone(r,e,sc?.pos==='D');
    const o=OFFSET[zone],sign=r()<.5?-1:1;
    e.shotZone=zone;
    e.shotDx=Math.round(o[0]+(r()-.5)*2*o[2]);
    e.shotDy=Math.round((o[1]?sign*o[1]:0)+(r()-.5)*2*o[3]);
    return e;
  };

  // ---- какие события уже видны ----
  proto.mcVisibleEvents=function(m){
    const all=m?.events||[];
    const live=this.liveMatch&&this.liveMatch.matchId===m?.id;
    if(!live||all.some(e=>e.kind==='final'))return all;
    const vm=this.liveMatch.visibleMinute;
    return all.filter(e=>Number.isFinite(e.visibleAtMinute)?e.visibleAtMinute<=vm+0.001:this.eventMinute(e)<=vm+0.001);
  };
  proto.mcGoals=function(m){
    const ev=this.mcVisibleEvents(m).filter(e=>e.kind==='goal');
    return ev.map((e,i)=>{this.ensureGoalPlace(m,e,i+1);return {e,n:i+1,home:e.teamId===m.homeId};});
  };
  // Раскладка шайб с разведением наложений.
  proto.mcLayout=function(goals){
    const pts=goals.map(g=>{const dx=g.e.shotDx,dy=g.e.shotDy;return {g,x:g.home?GR-dx:GL+dx,y:CY+dy};});
    const D=32;
    for(let it=0;it<30;it++){
      let moved=false;
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
        const a=pts[i],b=pts[j];let vx=b.x-a.x,vy=b.y-a.y,d=Math.hypot(vx,vy);
        if(d>=D)continue;moved=true;
        if(d<.01){vx=1;vy=(j%2?1:-1)*.6;d=Math.hypot(vx,vy);}
        const k=(D-d)/2/d;a.x-=vx*k;a.y-=vy*k;b.x+=vx*k;b.y+=vy*k;
      }
      if(!moved)break;
    }
    for(const p of pts){p.x=Math.max(L+20,Math.min(L+W-20,p.x));p.y=Math.max(T+20,Math.min(T+H-20,p.y));}
    return pts;
  };
  
  proto.goalFlags=function(e){
    return [e.powerPlay?'ГОЛ В БОЛЬШИНСТВЕ':'',(e.shortHanded||e.text==='Гол в меньшинстве')?'ГОЛ В МЕНЬШИНСТВЕ':'',e.emptyNet?'В ПУСТЫЕ ВОРОТА':'',e.penaltyShot?'ГОЛ СО ШТРАФНОГО БРОСКА':''].filter(Boolean);
  };

  // ---- площадка ----
  // 14.7.17: шайба красится настоящей формой клуба-автора гола (домашней или
  // гостевой — той, в которой клуб играл именно в этом матче), а не фиксированной
  // парой голубой/бордовый — см. matchKits/kitFor (team_colors.js).
  function shape(ctx,g,x,y,label,K){
    const e=g.e,k=K?(g.home?K.h:K.a):null,col=k?k.f:(g.home?COLORS.h:COLORS.a);g.label=label;
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle=col;ctx.strokeStyle=k?k.e:'#ffffff';ctx.lineWidth=1.6;
    ctx.beginPath();
    if(e.shortHanded){ctx.moveTo(0,-17);ctx.lineTo(17,0);ctx.lineTo(0,17);ctx.lineTo(-17,0);ctx.closePath();}
    else if(e.emptyNet){ctx.roundRect(-13,-13,26,26,3);}
    else ctx.arc(0,0,14,0,Math.PI*2);
    ctx.fill();ctx.stroke();
    if(e.powerPlay){ctx.setLineDash([3,2]);ctx.beginPath();ctx.arc(0,0,18.5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(e.period==='ОТ'){ctx.strokeStyle='#fbbf24';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.powerPlay?23:19.5,0,Math.PI*2);ctx.stroke();}
    if(g.n===(this_sel())){ctx.strokeStyle='#fbbf24';ctx.lineWidth=3.5;ctx.beginPath();ctx.arc(0,0,e.powerPlay?24:21,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle=k?k.i:'#ffffff';ctx.font='700 13px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(g.label,0,.5);
    ctx.restore();
  }
  let _app=null;const this_sel=()=>_app?._rinkSel||0;
  proto.drawRink=function(match){
    _app=this;
    baseDraw.call(this);                        // чистая площадка без старых шайб
    const canvas=document.getElementById('rink-canvas');if(!canvas||!canvas.getContext)return;
    this._rinkPucks=[];
    if(match&&match.events){
      const ctx=canvas.getContext('2d'),goals=this.mcGoals(match),K=this.matchKits?this.matchKits(match):null;
      for(const p of this.mcLayout(goals)){shape(ctx,p.g,p.x,p.y,this.goalPuckLabel(p.g),K);this._rinkPucks.push({x:p.x,y:p.y,n:p.g.n});}
      this._rinkGoals=goals;this._rinkMatch=match;
    }else{this._rinkGoals=[];this._rinkMatch=null;}
    try{this.mcRinkExtras(canvas);}catch(e){console.warn('KHL Manager 8.15 rink extras:',e);}
  };
  proto.mcRinkExtras=function(canvas){
    if(!canvas.insertAdjacentElement)return;
    if(!document.getElementById('rink-label')){
      const lb=document.createElement('div');lb.id='rink-label';lb.className='mc-filters';
      lb.innerHTML='<span class="mc-lab">Подпись шайб</span><button type="button" class="mc-pill" data-mcl="no">№ игрока</button><button type="button" class="mc-pill" data-mcl="ord">Порядок гола</button>';
      canvas.insertAdjacentElement('beforebegin',lb);
      lb.addEventListener('click',ev=>{const b=ev.target.closest('[data-mcl]');if(b&&_app)_app.mcSetLabel(b.dataset.mcl);});
    }
    document.querySelectorAll('#rink-label .mc-pill').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mcl===this.mcLabelMode())));
    let leg=document.getElementById('rink-legend');
    if(!leg){
      leg=document.createElement('div');leg.id='rink-legend';leg.className='mc-legend';
      leg.innerHTML='<span><i class="mc-d h"></i>хозяева</span><span><i class="mc-d a"></i>гости</span><span><i class="mc-d pp"></i>большинство</span><span><i class="mc-d sh"></i>меньшинство</span><span><i class="mc-d en"></i>пустые ворота</span><span><i class="mc-d ot"></i>гол в овертайме</span>';
      canvas.insertAdjacentElement('afterend',leg);
      const det=document.createElement('div');det.id='rink-detail';det.className='mc-detail';leg.insertAdjacentElement('afterend',det);
      canvas.addEventListener('click',ev=>{
        const r=canvas.getBoundingClientRect(),sx=canvas.width/r.width,x=(ev.clientX-r.left)*sx,y=(ev.clientY-r.top)*sx;
        const a=_app;if(!a)return;let best=null,bd=22*22;
        for(const p of a._rinkPucks||[]){const d=(p.x-x)**2+(p.y-y)**2;if(d<bd){bd=d;best=p;}}
        a.mcSelectGoal(best?best.n:0);
      });
    }
    const det=document.getElementById('rink-detail');if(!det)return;
    const g=(this._rinkGoals||[]).find(x=>x.n===this._rinkSel);
    if(!g){det.innerHTML=(this._rinkGoals||[]).length?'<span class="muted">Нажми на шайбу или на гол в списке, чтобы увидеть подробности.</span>':'';return;}
    const m=this._rinkMatch,e=g.e,sc=this.db.players.find(p=>p.id===e.scorerId),a1=this.db.players.find(p=>p.id===e.assist1Id),a2=this.db.players.find(p=>p.id===e.assist2Id);
    const team=this.teamById(e.teamId)?.name||'';
    const flags=this.goalFlags(e).map(s=>s.toLowerCase());
    det.innerHTML=`<b>Гол ${g.n} · ${this.escape(this.otStampText(e))} · ${this.escape(team)}</b><div>${this.goalNoHtml(sc)}<span class="nm"${sc?` data-pl="${sc.id}"`:''}>${this.escape(sc?.name||'Автор не указан')}</span>${sc?this.kaBadge(sc):''} <span class="muted">(${this.escape(this.goalAssistText(a1,a2))})</span>${(this._rinkGoals||[]).filter(x=>x.e.scorerId&&x.e.scorerId===e.scorerId).length>=3?' <span class="mc-tag">хет-трик</span>':''}</div><div class="muted">Место броска: ${this.goalZoneName(e.shotZone)}${flags.length?' · '+this.escape(flags.join(' · ')):''}${e.period==='ОТ'?' · победный гол в овертайме':''}</div>`;
  };
  proto.mcSelectGoal=function(n){
    this._rinkSel=(this._rinkSel===n)?0:n;
    const m=this._rinkMatch;if(m)this.drawRink(m);
    this.mcMarkSelection();
  };
  proto.mcMarkSelection=function(){
    document.querySelectorAll('#view-match .mc-goals li,#match-log .event.goal').forEach(el=>el.classList.toggle('mc-sel',Number(el.dataset.goal)===this._rinkSel));
  };

  // ---- фильтры и разметка ленты ----
  const GROUPS={goal:['goal','shootout','shootoutAttempt'],pen:['penalty','penaltyStart','penaltySegmentEnd','penaltyCancelled','penaltyReduced','penaltyReturn','penaltyEnd','misconductEnd','delayedPenalty','penaltyShot','penaltyShotAttempt','fight'],chance:['chance','save','block']};
  proto.mcGroupOf=function(kind){for(const k of Object.keys(GROUPS))if(GROUPS[k].includes(kind))return k;return 'other';};
  proto.mcApplyFilter=function(){
    const f=this._mcFilter||'all';
    document.querySelectorAll('#mc-filters .mc-pill').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mcf===f)));
    const rows=document.querySelectorAll('#match-log .event');let shown=0;
    rows.forEach(r=>{const g=r.dataset.g||'other',vis=f==='all'||g===f||r.dataset.k==='final';r.style.display=vis?'':'none';if(vis)shown++;});
    const log=document.getElementById('match-log');if(!log)return;
    log.querySelector('.mc-none')?.remove();
    if(f!=='all'&&rows.length&&!shown)log.insertAdjacentHTML('beforeend','<div class="empty mc-none">Событий этого типа в матче нет.</div>');
  };
  proto.renderMatchCenter=function(){
    baseRender.apply(this,arguments);
    try{
      if(!this.state)return;
      const m=this.liveMatch&&this.liveMatch.matchId===this.currentMatchId?this.liveMatch.simulatedMatch:this.state.matches.find(x=>x.id===this.currentMatchId);
      const log=document.getElementById('match-log');
      if(m&&log){
        const events=this.mcVisibleEvents(m),rows=[...log.querySelectorAll(':scope > .event')];
        if(rows.length===events.length){
          let gi=0;
          rows.forEach((r,i)=>{const e=events[i];r.dataset.k=e.kind;r.dataset.g=this.mcGroupOf(e.kind);if(e.kind==='goal'){gi++;r.dataset.goal=gi;}});
        }
        // фильтры над лентой
        if(!document.getElementById('mc-filters')){
          const bar=document.createElement('div');bar.id='mc-filters';bar.className='mc-filters';
          bar.innerHTML='<span class="mc-lab">Показать</span>'+[['all','Всё'],['goal','Голы'],['pen','Штрафы'],['chance','Моменты']].map(([k,l])=>`<button type="button" class="mc-pill" data-mcf="${k}" aria-pressed="false">${l}</button>`).join('');
          log.insertAdjacentElement('beforebegin',bar);
          bar.addEventListener('click',ev=>{const b=ev.target.closest('[data-mcf]');if(b){this._mcFilter=b.dataset.mcf;this.mcApplyFilter();}});
          log.addEventListener('click',ev=>{const r=ev.target.closest('.event.goal[data-goal]');if(r)this.mcSelectGoal(Number(r.dataset.goal));});
        }
        this.mcApplyFilter();
        // голы под названиями команд
        const hero=document.querySelector('#match-scoreboard .match-hero');
        if(hero&&hero.children.length>=3){
          const goals=this.mcGoals(m),by=home=>goals.filter(g=>g.home===home).map(g=>{
            const e=g.e,sc=this.db.players.find(p=>p.id===e.scorerId),a1=this.db.players.find(p=>p.id===e.assist1Id),a2=this.db.players.find(p=>p.id===e.assist2Id);
            const tag=e.powerPlay?'бол.':(e.shortHanded?'мен.':(e.emptyNet?'п.в.':''));
            return `<li data-goal="${g.n}"><span class="t">${this.escape(e.period)} ${this.escape(e.time)}</span> <b${sc?` data-pl="${sc.id}"`:''}>${this.escape(sc?.name||'Автор не указан')}</b>${sc?this.kaBadge(sc):''} <span class="mc-as">(${this.goalAssistHtml(a1,a2)})</span>${tag?` <span class="mc-tag">${tag}</span>`:''}</li>`;}).join('');
          [[0,true],[2,false]].forEach(([i,home])=>{const col=hero.children[i];col.querySelector('.mc-goals')?.remove();const html=by(home);if(html)col.insertAdjacentHTML('beforeend',`<ul class="mc-goals">${html}</ul>`);});
          hero.querySelectorAll('.mc-goals li').forEach(li=>li.addEventListener('click',()=>this.mcSelectGoal(Number(li.dataset.goal))));
        }
        this.mcMarkSelection();
      }
    }catch(e){console.warn('KHL Manager 8.15 match center:',e);}
  };
})();
