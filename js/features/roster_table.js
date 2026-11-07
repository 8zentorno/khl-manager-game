/* KHL Manager 8.12 — таблица «Состав команды»: одна строка на игрока, закреплённая шапка,
   сортировка, фильтры, раскрытие строки и сравнение двух игроков. */
(function(){
  const proto=KHLManagerApp.prototype;
  const baseRenderRoster=proto.renderRoster;
  const SKILLS=[['shooting','Бросок'],['passing','Пас'],['skating','Катание'],['defense','Защита'],['stamina','Выносливость']];
  const GN=['Нападающие','Защитники','Вратари'];
  const groupOf=p=>p.pos==='G'?2:p.pos==='D'?1:0;
  const LS='khl.rosterTable';

  proto.rtState=function(){
    if(this._rt)return this._rt;
    let saved={};try{saved=JSON.parse(localStorage.getItem(LS)||'{}')||{};}catch(e){}
    return this._rt={pos:saved.pos||'all',st:saved.st||'all',key:saved.key||'default',dir:saved.dir||-1,open:new Set(),sel:[],cmp:false};
  };
  proto.rtSave=function(){const s=this.rtState();try{localStorage.setItem(LS,JSON.stringify({pos:s.pos,st:s.st,key:s.key,dir:s.dir}));}catch(e){}};

  // Данные одной строки.
  proto.rtRow=function(p){
    const dev=this.playerDev(p)||{},stat=(this.state.playerStats||{})[p.id]||{};
    const inj=!!this.hasActiveInjury(p),farm=!!(this.isInFarm&&this.isInFarm(p));
    const slot=this.playerRosterSlotStatus(p,false);
    const main=!inj&&!farm&&slot!=='Резерв';
    const perm=Math.round(this.permanentOVR(p)),now=Math.round(this.effectiveOVR(p));
    return {p,id:p.id,name:p.name,pos:p.pos,posLabel:this.positionLabel(p.pos),g:groupOf(p),age:Math.floor(this.ageYears(p)),ageText:this.ageText(this.ageYears(p)),
      number:p.number||0,height:p.height,weight:p.weight,grip:p.grip,perm,now,growth:this.permGrowth(p),form:Math.round(Number(dev.form??50)),fatigue:Math.round(Number(dev.fatigue??0)),flags:(this.devFlags?this.devFlags(p):{}),
      statusText:inj?'Травма':farm?this.playerRosterSlotStatus(p,false):slot,statusKind:inj?'inj':main?'main':'res',injText:inj?(this.injuryDescription(p)||'Травма'):'',
      salary:this.payrollOf?this.payrollOf(p):(p.salary||0),until:Number(p.contractUntil)||0,foreign:!!p.foreign,
      gp:stat.gp||0,goals:stat.g||0,assists:stat.a||0,pts:stat.pts||((stat.g||0)+(stat.a||0)),
      skills:SKILLS.map(([k,l])=>[l,Math.round(this.playerSkill(p,k))]),gk:Math.round(this.playerSkill(p,'goalkeeping'))};
  };
  proto.rtFlagBadges=function(r){
    const f=r.flags||{},b=[];
    if(f.inj)b.push('<span class="rt-bd inj">травма</span>');
    if(!f.inj&&!f.tired&&Number(r.form)>=60)b.push('<span class="rt-bd hot" title="Форма '+r.form+'">в форме</span>');
    if(f.tired)b.push('<span class="rt-bd bad" title="Усталость '+r.fatigue+'%">устал</span>');
    if(f.form)b.push('<span class="rt-bd warn" title="Форма '+r.form+'">форма</span>');
    if(f.morale)b.push('<span class="rt-bd bad" title="Низкая мораль">мораль</span>');
    return b.length?b.join(''):'<span class="rt-okc">в порядке</span>';
  };
  proto.rtList=function(){
    const s=this.rtState();try{this.trackPerm();}catch(e){}
    let a=this.teamPlayers(this.state.teamId).map(p=>{const r=this.rtRow(p);r.flagCount=['inj','tired','form','morale'].filter(k=>r.flags&&r.flags[k]).length;return r;});
    a=a.filter(r=>(s.pos==='all'||(s.pos==='F'&&r.g===0)||(s.pos==='D'&&r.g===1)||(s.pos==='G'&&r.g===2))&&
      (s.st==='all'||(s.st==='main'&&r.statusKind==='main')||(s.st==='res'&&r.statusKind==='res')||(s.st==='inj'&&r.statusKind==='inj')));
    const rank=r=>r.statusKind==='main'?0:r.statusKind==='res'?1:2;
    if(s.key==='default')a.sort((x,y)=>x.g-y.g||rank(x)-rank(y)||y.now-x.now||x.name.localeCompare(y.name,'ru'));
    else{
      const k=s.key;
      a.sort((x,y)=>{const vx=x[k],vy=y[k];const c=typeof vx==='string'?vx.localeCompare(vy,'ru'):vx-vy;return c?c*s.dir:(y.now-x.now||x.name.localeCompare(y.name,'ru'));});
    }
    return a;
  };

  proto.rtSet=function(patch){
    const s=this.rtState();Object.assign(s,patch);this.rtSave();this.renderRosterTable();
  };
  proto.rtSort=function(key){
    const s=this.rtState();
    if(s.key===key)s.dir*=-1;else{s.key=key;s.dir=(key==='name'||key==='posLabel'||key==='statusText')?1:-1;}
    this.rtSave();this.renderRosterTable();
  };
  proto.rtToggleOpen=function(id){const s=this.rtState();if(s.open.has(id))s.open.delete(id);else s.open.add(id);this.renderRosterTable();};
  proto.rtToggleSel=function(id){
    const s=this.rtState();
    if(s.sel.includes(id))s.sel=s.sel.filter(x=>x!==id);else{s.sel.push(id);if(s.sel.length>2)s.sel.shift();}
    if(s.sel.length<2)s.cmp=false;
    this.renderRosterTable();
  };
  proto.rtCompare=function(on){const s=this.rtState();s.cmp=!!on&&s.sel.length===2;this.renderRosterTable();};
  proto.rtClearSel=function(){const s=this.rtState();s.sel=[];s.cmp=false;this.renderRosterTable();};

  const meter=(v,good)=>{
    const cls=good?(v>=60?'good':v>=45?'mid':'warn'):(v>=60?'bad':v>=35?'warn':'good');
    return `<div class="rt-meter"><span><i class="${cls}" style="width:${Math.max(0,Math.min(100,v))}%"></i></span><b>${v}</b></div>`;
  };

  proto.rtRowHtml=function(r){
    const s=this.rtState(),esc=x=>this.escape(String(x)),open=s.open.has(r.id),sel=s.sel.includes(r.id);
    const d=r.now-r.perm,ovrCls=r.perm>=87?'hi':r.perm<74?'lo':'';
    const sal=(r.salary/1e6).toFixed(1);
    let h=`<div class="rt-row${r.statusKind==='main'?' main':''}${open?' open':''}${sel?' sel':''}" data-rt-open="${esc(r.id)}" data-player-id="${esc(r.id)}" role="row" tabindex="0" aria-expanded="${open}">
      <div class="rt-cbw"><input class="rt-cb" type="checkbox" data-rt-sel="${esc(r.id)}" ${sel?'checked':''} aria-label="Сравнить: ${esc(r.name)}"></div>
      <div class="rt-no">${r.number||''}</div>
      <div class="rt-who"><span class="rt-nm" data-pl="${esc(r.id)}">${esc(r.name)}</span>${this.kaBadgeById?this.kaBadgeById(r.id):''}${r.foreign?'<span class="rt-tag">Лег.</span>':''}${r.statusKind==='inj'?'<span class="rt-tag inj" title="'+esc(r.injText)+'">🩹</span>':''}</div>
      <div class="rt-pos">${esc(r.posLabel)}</div><div class="rt-age">${r.age}</div>
      <div class="rt-ovrc"><span class="rt-ovr" title="Постоянный ${r.perm}; сейчас ${r.now}; за сезон ${r.growth>0?'+':''}${r.growth}"><span class="rt-top"><b class="${ovrCls}">${r.perm}</b>${this.growthHtml(r.growth)}</span>${d?`<i class="${d>0?'up':'down'}">${r.now} ${d>0?'▲':'▼'}${Math.abs(d)}</i>`:''}</span></div>
      <div class="rt-fl">${this.rtFlagBadges(r)}</div>
      <div class="rt-st ${r.statusKind}" title="${esc(r.injText||r.statusText)}">${esc(r.statusText)}</div>
      <div class="rt-sal">${sal} млн</div>
      <div class="rt-info"><span>${esc(r.posLabel)} · ${esc(r.ageText)}</span><span class="rt-fl">${this.rtFlagBadges(r)}</span><span>${sal} млн ₽</span><span class="rt-st ${r.statusKind}">${esc(r.statusText)}</span></div>
    </div>`;
    if(open){
      const sk=r.pos==='G'?[['Вратарское',r.gk]]:r.skills;
      const bio=[r.height?r.height+' см':'',r.weight?r.weight+' кг':''].filter(Boolean).join(' · ')||'—';
      h+=`<div class="rt-detail"><div class="rt-dgrid">
        <div><span>Рост / вес</span><b>${bio}</b></div><div><span>Хват</span><b>${r.grip==='Л'||r.grip==='L'?'левый':r.grip==='П'||r.grip==='R'?'правый':'—'}</b></div>
        <div><span>Контракт</span><b>${r.until?'до '+r.until:'—'}</b></div><div><span>Постоянный OVR</span><b>${r.perm}</b></div>
        <div><span>Матчи</span><b>${r.gp}</b></div><div><span>Голы · передачи · очки</span><b>${r.goals} · ${r.assists} · ${r.pts}</b></div>
        ${r.injText?`<div class="wide"><span>Травма</span><b>${esc(r.injText)}</b></div>`:''}</div>
        <div class="rt-skills">${sk.map(([n,v])=>`<div class="rt-meter"><em>${n}</em><span><i class="acc" style="width:${v}%"></i></span><b>${v}</b></div>`).join('')}</div></div>`;
    }
    return h;
  };

  proto.rtCompareHtml=function(){
    const s=this.rtState();if(!s.cmp||s.sel.length!==2)return '';
    const all=this.teamPlayers(this.state.teamId),esc=x=>this.escape(String(x));
    const A=this.rtRow(all.find(p=>p.id===s.sel[0])||all[0]),B=this.rtRow(all.find(p=>p.id===s.sel[1])||all[1]);
    const bothG=A.pos==='G'&&B.pos==='G',noG=A.pos!=='G'&&B.pos!=='G';
    const rows=[['Рейтинг сейчас',A.now,B.now,1],['Постоянный OVR',A.perm,B.perm,1],['Форма',A.form,B.form,1],['Усталость, %',A.fatigue,B.fatigue,-1]];
    if(noG)SKILLS.forEach(([k,l],i)=>rows.push([l,A.skills[i][1],B.skills[i][1],1]));
    if(bothG)rows.push(['Вратарское',A.gk,B.gk,1]);
    rows.push(['Возраст',A.age,B.age,-1],['Матчи',A.gp,B.gp,1],['Очки (Г+П)',A.pts,B.pts,1]);
    if(A.until&&B.until)rows.push(['Контракт до',A.until,B.until,1]);
    rows.push(['Зарплата, млн ₽',+(A.salary/1e6).toFixed(1),+(B.salary/1e6).toFixed(1),-1]);
    const side=(v,o,dir,cls,max)=>{const win=dir*(v-o)>0,w=Math.round(Math.max(0,v)/max*100);
      return `<div class="rt-side ${cls}${win?' win':''}">${cls==='l'?`<span class="rt-b2"><i style="width:${w}%"></i></span><b>${v}</b>`:`<b>${v}</b><span class="rt-b2"><i style="width:${w}%"></i></span>`}</div>`;};
    return `<div class="rt-cmp"><div class="rt-cmp-h"><h3>Сравнение игроков</h3><button class="btn btn-quiet" data-rt-act="cmpclose">Закрыть</button></div>
      <div class="rt-phead"><div class="l"><b>${esc(A.name)}</b><span>${esc(A.posLabel)} · ${esc(A.ageText)} · ${esc(A.statusText)}</span></div><div></div><div><b>${esc(B.name)}</b><span>${esc(B.posLabel)} · ${esc(B.ageText)} · ${esc(B.statusText)}</span></div></div>
      ${rows.map(([n,x,y,dir])=>{const max=Math.max(x,y,1);return `<div class="rt-ch">${side(x,y,dir,'l',max)}<div class="lab">${n}</div>${side(y,x,dir,'r',max)}</div>`;}).join('')}
      ${noG||bothG?'':'<p class="tiny muted rt-note">Вратаря и полевого игрока можно сравнить только по общим показателям.</p>'}</div>`;
  };

  proto.renderRosterTable=function(){
    const host=document.getElementById('roster-groups');if(!host||!this.state)return;
    const s=this.rtState(),list=this.rtList();
    const all=this.teamPlayers(this.state.teamId);
    const cnt=k=>all.filter(p=>k==='all'||(k==='F'&&groupOf(p)===0)||(k==='D'&&groupOf(p)===1)||(k==='G'&&groupOf(p)===2)).length;
    const pill=(g,k,l,n)=>`<button class="rt-pill" data-rt-${g}="${k}" aria-pressed="${s[g]===k}">${l}${n!==undefined?`<span class="n">${n}</span>`:''}</button>`;
    const bar=`<div class="rt-bar"><div class="rt-grp"><span class="lab">Позиция</span>${[['all','Все'],['F','Нападающие'],['D','Защитники'],['G','Вратари']].map(([k,l])=>pill('pos',k,l,cnt(k))).join('')}</div>
      <div class="rt-grp"><span class="lab">Статус</span>${[['all','Все'],['main','В заявке'],['res','Запас'],['inj','Травмы']].map(([k,l])=>pill('st',k,l)).join('')}</div><span class="rt-sp"></span>
      <button class="btn btn-primary rt-cmpbtn" data-rt-act="cmp" ${s.sel.length===2?'':'disabled'}>⇄ Сравнить${s.sel.length?` (${s.sel.length}/2)`:''}</button>${s.sel.length?'<button class="btn btn-quiet" data-rt-act="clear">Сбросить выбор</button>':''}</div>`;
    const cols=[['','',''],['number','№','r'],['name','Игрок',''],['posLabel','Поз.',''],['age','Возр.','r'],['perm','OVR','r'],['flagCount','Состояние',''],['statusText','Статус',''],['salary','Зарплата','r']];
    const head=`<div class="rt-head" role="row">${cols.map(([k,l,c])=>k?`<span class="${c}"><button data-rt-sort="${k}" aria-sort="${s.key===k?(s.dir>0?'ascending':'descending'):'none'}">${l}</button></span>`:'<span></span>').join('')}</div>`;
    let body='',last=-1;
    if(!list.length)body='<div class="rt-empty">Нет игроков по выбранным фильтрам.</div>';
    for(const r of list){
      if(s.key==='default'&&r.g!==last){last=r.g;body+=`<div class="rt-group">${GN[r.g]}<span class="n">${list.filter(x=>x.g===r.g).length}</span></div>`;}
      body+=this.rtRowHtml(r);
    }
    bind(this);host.classList.add('rt-host');
    host.innerHTML=bar+this.rtCompareHtml()+`<div class="rt-tbl" role="table" aria-label="Игроки команды">${head}${body}</div>`;
  };

  proto.renderRoster=function(){
    baseRenderRoster.apply(this,arguments);
    if(!this.state)return;
    try{this.renderRosterTable();}catch(e){console.warn('KHL Manager 8.12 roster table:',e);}
  };

  // Один раз вешаем обработчики на контейнер таблицы.
  function bind(inst){
    if(typeof document==='undefined'||!document.getElementById)return;
    const host=document.getElementById('roster-groups');
    if(!host||host._rtBound||!host.addEventListener)return;
    host._rtBound=true;
    const app=()=>inst;
    host.addEventListener('click',e=>{
      const a=app();if(!a)return;const t=e.target;
      const pos=t.closest('[data-rt-pos]');if(pos){a.rtSet({pos:pos.dataset.rtPos});return;}
      const st=t.closest('[data-rt-st]');if(st){a.rtSet({st:st.dataset.rtSt});return;}
      const act=t.closest('[data-rt-act]');
      if(act){const k=act.dataset.rtAct;if(k==='cmp')a.rtCompare(true);else if(k==='cmpclose')a.rtCompare(false);else if(k==='clear')a.rtClearSel();return;}
      const so=t.closest('[data-rt-sort]');if(so){a.rtSort(so.dataset.rtSort);return;}
      const cb=t.closest('[data-rt-sel]');if(cb){a.rtToggleSel(cb.dataset.rtSel);return;}
      const row=t.closest('[data-rt-open]');if(row)a.rtToggleOpen(row.dataset.rtOpen);
    });
    host.addEventListener('keydown',e=>{
      if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('rt-row')){e.preventDefault();const a=app();if(a)a.rtToggleOpen(e.target.dataset.rtOpen);}
    });
  }
})();
