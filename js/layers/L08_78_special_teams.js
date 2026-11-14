/* ================= KHL MANAGER 7.8 — Smart Special Teams ================= */
(function(){
  const ruUnit=u=>{const k=String(u).toLowerCase();return ({pp:'Большинство ',pk:'Меньшинство '})[k.slice(0,2)]+k.slice(2);};
  const proto=KHLManagerApp.prototype;
  const unitKeys=['pp1','pp2','pk1','pk2'];
  const defs=[
    {key:'pp1',title:'Большинство 1',desc:'Первая атакующая бригада',threeF:true,kind:'pp'},
    {key:'pp2',title:'Большинство 2',desc:'Вторая атакующая бригада',threeF:true,kind:'pp'},
    {key:'pk1',title:'Меньшинство 1',desc:'Первая оборонительная бригада',threeF:false,kind:'pk'},
    {key:'pk2',title:'Меньшинство 2',desc:'Вторая оборонительная бригада',threeF:false,kind:'pk'}
  ];
  const clone=o=>JSON.parse(JSON.stringify(o||{}));
  const slotNames=key=>key.startsWith('pp')?['F1','F2','F3','D1','D2']:['F1','F2','D1','D2'];
  proto.normalizeSpecialTeams76=function(source,teamId){
    const out=clone(source), roster=this.teamPlayers(teamId).filter(p=>!this.isPlayerUnavailable(p));
    let allowed=null;
    if(!this.isForeignQuotaExemptTeamV75?.(teamId)){
      const slots=(this.state?.teamId===teamId&&this.state.slotAssignments)||this.buildQuotaSlotAssignmentsV75?.(teamId,true);
      if(slots)allowed=new Set(Object.values(slots).filter(Boolean));
    }
    const eligible=roster.filter(p=>!allowed||allowed.has(p.id));
    for(const kind of ['pp','pk']){
      const used=new Set();
      for(const key of (kind==='pp'?['pp1','pp2']:['pk1','pk2'])){
        out[key]=out[key]||{};
        for(const slot of slotNames(key)){
          let id=out[key][slot]||'', p=eligible.find(x=>String(x.id)===String(id));
          const isF=slot.startsWith('F'), compatible=x=>isF?['LW','C','RW'].includes(x.pos):x.pos==='D';
          if(!p||!compatible(p)||used.has(p.id)){
            p=eligible.filter(x=>compatible(x)&&!used.has(x.id)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a))[0]||null;
            id=p?.id||'';out[key][slot]=id;
          }
          if(id)used.add(id);
        }
      }
    }
    return out;
  };
  proto.recommendedSpecialTeams78=function(teamId){
    const roster=this.teamPlayers(teamId).filter(p=>!this.isPlayerUnavailable(p));
    let allowed=null;
    if(!this.isForeignQuotaExemptTeamV75?.(teamId)){
      const slots=(this.state?.teamId===teamId&&this.state.slotAssignments)||((this.state?.teamId===teamId)?null:this.buildQuotaSlotAssignmentsV75?.(teamId,true));
      if(slots)allowed=new Set(Object.values(slots).filter(Boolean).map(String));
    }
    let eligible=roster.filter(p=>!allowed||allowed.has(String(p.id)));
    try{const act=this.activeSkaters(teamId),dr=new Set(((act&&act.skaters)||[]).filter(Boolean).map(p=>p.id));if(dr.size>=10)eligible=eligible.filter(p=>dr.has(p.id));}catch(e){}   // 14.7.8: только игроки из состава на матч
    const out={pp1:{F1:'',F2:'',F3:'',D1:'',D2:''},pp2:{F1:'',F2:'',F3:'',D1:'',D2:''},pk1:{F1:'',F2:'',D1:'',D2:''},pk2:{F1:'',F2:'',D1:'',D2:''}};
    const unitOrder=['pp1','pk1','pp2','pk2'];
    const assignRole=(isForward)=>{
      const candidates=eligible.filter(p=>isForward?['LW','C','RW'].includes(p.pos):p.pos==='D')
        .sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a)||String(a.name).localeCompare(String(b.name),'ru'));
      const maxSlot=isForward?3:2;
      for(let n=1;n<=maxSlot;n++){
        for(const unit of unitOrder){
          if(isForward&&unit.startsWith('pk')&&n>2)continue;
          const slot=`${isForward?'F':'D'}${n}`;
          // First preference: a player not used anywhere yet.
          const usedEverywhere=new Set(unitKeys.flatMap(k=>Object.values(out[k]||{})).filter(Boolean).map(String));
          let player=candidates.find(p=>!usedEverywhere.has(String(p.id)));
          if(!player){
            // If the roster is too small, reuse across PP<->PK only; never duplicate within the same type if an alternative exists.
            const sameKindUsed=new Set(unitKeys.filter(k=>k.startsWith(unit.startsWith('pp')?'pp':'pk')).flatMap(k=>Object.values(out[k]||{})).filter(Boolean).map(String));
            const fallback=candidates.filter(p=>!sameKindUsed.has(String(p.id)));
            fallback.sort((a,b)=>{
              const count=(id)=>unitKeys.filter(k=>k.startsWith(unit.startsWith('pp')?'pk':'pp')).reduce((n,k)=>n+Object.values(out[k]||{}).filter(v=>String(v)===String(id)).length,0);
              return count(String(a.id))-count(String(b.id))||this.effectiveOVR(b)-this.effectiveOVR(a);
            });
            player=fallback[0];
          }
          if(player)out[unit][slot]=player.id;
        }
      }
    };
    assignRole(true);assignRole(false);
    return out;
  };
  proto.defaultSpecialTeams=function(teamId){return this.recommendedSpecialTeams78(teamId);};
  const allAssignments=draft=>{
    const out=[];
    for(const def of defs){const u=draft?.[def.key]||{};for(const slot of slotNames(def.key)){const id=u[slot];if(id)out.push({unit:def.key,slot,id,kind:def.kind});}}
    return out;
  };
  proto.ensureSpecialTeamsDraft76=function(){
    this.ensureSpecialTeams();
    if(!this._specialTeamsDraft76||this._specialTeamsDraftTeamId76!==this.state.teamId){
      const legacy=clone(this.state.specialTeams),conflicts=this.specialTeamsConflicts76(legacy);
      if(conflicts.conflicts.size){this.state.specialTeams=this.normalizeSpecialTeams76(legacy,this.state.teamId);this.persistQuietly();}
      this._specialTeamsDraft76=clone(this.state.specialTeams);this._specialTeamsDraftTeamId76=this.state.teamId;this._specialTeamsOverlapOpen76={};this._specialTeamsRecommendation76='';
    }
    return this._specialTeamsDraft76;
  };
  proto.specialTeamsConflicts76=function(draft){
    const assignments=allAssignments(draft),counts=new Map();
    for(const a of assignments){const k=`${a.kind}:${a.id}`;counts.set(k,(counts.get(k)||0)+1);}
    const conflicts=new Set();
    for(const a of assignments)if((counts.get(`${a.kind}:${a.id}`)||0)>1)conflicts.add(`${a.unit}:${a.slot}`);
    return {assignments,counts,conflicts};
  };
  proto.specialTeamsCrossUses76=function(draft,key){
    const kind=key.startsWith('pp')?'pp':'pk',other=kind==='pp'?'pk':'pp';
    const current=new Set(allAssignments(draft).filter(a=>a.unit===key).map(a=>a.id));
    const used=allAssignments(draft).filter(a=>a.kind===other&&current.has(a.id));
    const byPlayer=new Map();
    for(const a of used){if(!byPlayer.has(a.id))byPlayer.set(a.id,new Set());byPlayer.get(a.id).add(a.unit.toUpperCase());}
    return [...byPlayer.entries()].map(([id,units])=>({id,units:[...units]}));
  };
  proto.specialTeamsStats76=function(key){
    const teamId=String(this.state?.teamId||'');const pp=key.startsWith('pp');
    let goalsFor=0,goalsAgainst=0,shortGoals=0,legacyUntracked=0,trackedGoalsFor=0;
    const opportunityIds=new Set(),failedOpportunityIds=new Set();
    const played=(this.state?.matches||[]).filter(m=>m.played&&(String(m.homeId)===teamId||String(m.awayId)===teamId));
    const activeType=type=>['minor','doubleMinor','major','majorDkm'].includes(String(type||'minor'));
    for(const match of played){
      const events=match.events||[];
      const seenInMatch=new Set();
      events.forEach((event,eventIndex)=>{
        let records=[];
        if(Array.isArray(event.penaltyDetails)&&event.penaltyDetails.length){
          records=event.penaltyDetails.map((record,i)=>({...record,
            teamId:record.teamId??event.teamId,
            type:record.type||event.type,
            affectsManpower:record.affectsManpower??event.affectsManpower,
            coincidental:record.coincidental??event.coincidental,
            queued:record.queued??event.queued,
            ppUnitKey:record.ppUnitKey||((String(event.penaltyId||event.id||'')===String(record.penaltyId||record.id||''))?event.ppUnitKey:null),
            pkUnitKey:record.pkUnitKey||((String(event.penaltyId||event.id||'')===String(record.penaltyId||record.id||''))?event.pkUnitKey:null),
            period:record.period||event.period,time:record.time||event.time
          }));
        }else if(['penalty','penaltyStart'].includes(event.kind))records=[event];
        for(let recordIndex=0;recordIndex<records.length;recordIndex++){
          const record=records[recordIndex];
          const recordTeamId=String(record.teamId??event.teamId??'');
          const relevantTeam=pp?recordTeamId!==teamId:recordTeamId===teamId;
          if(!relevantTeam||record.queued||record.coincidental||record.affectsManpower===false||!activeType(record.type))continue;
          const rawId=String(record.penaltyId||record.id||event.penaltyIds?.[recordIndex]||'');
          const id=rawId?`${match.id||'match'}:${rawId}`:`${match.id||'match'}:event-${eventIndex}-penalty-${recordIndex}-${recordTeamId}`;
          if(seenInMatch.has(id))continue;
          seenInMatch.add(id);
          const unitKey=pp?record.ppUnitKey:record.pkUnitKey;
          if(unitKey){
            if(unitKey===key)opportunityIds.add(id);
          }else{
            // Prior 7.15 saves did not preserve unit keys on penalties attached to stoppage events.
            // Do not guess which brigade was deployed; keep the goal count but exclude unknown attempts from its percentage.
            legacyUntracked++;
          }
        }
      });
      for(const event of events){
        if(event.kind!=='goal')continue;
        const opportunityId=event.ppOpportunityId||event.pkOpportunityId;
        const prefixedOpportunity=opportunityId?`${match.id||'match'}:${opportunityId}`:null;
        if(pp&&String(event.teamId)===teamId&&event.powerPlay&&event.ppUnitKey===key){
          goalsFor++;
          if(prefixedOpportunity&&opportunityIds.has(prefixedOpportunity))trackedGoalsFor++;
        }
        if(pp&&String(event.teamId)!==teamId&&event.ppUnitKeyAgainst===key)goalsAgainst++;
        if(!pp&&String(event.teamId)===teamId&&event.shortHanded&&event.pkUnitKeyFor===key){
          goalsFor++;shortGoals++;
          if(prefixedOpportunity&&opportunityIds.has(prefixedOpportunity))trackedGoalsFor++;
        }
        if(!pp&&String(event.teamId)!==teamId&&event.powerPlay&&event.pkUnitKeyAgainst===key){
          goalsAgainst++;
          if(prefixedOpportunity&&opportunityIds.has(prefixedOpportunity))failedOpportunityIds.add(prefixedOpportunity);
        }
      }
    }
    const opportunities=opportunityIds.size;
    const failedCount=[...failedOpportunityIds].filter(id=>opportunityIds.has(id)).length;
    const kills=Math.max(0,opportunities-failedCount);
    const pct=opportunities?Math.round((pp?trackedGoalsFor/opportunities*100:kills/opportunities*100)):null;
    return {opportunities,goalsFor,goalsAgainst,shortGoals,kills,pct,trackedGoalsFor,legacyUntracked,visibleHistory:played.length};
  };
  proto.specialTeamsLiveReplacement76=function(key,draft){
    const live=this.liveMatch;if(!live||live.finished||live.matchId!==this.currentMatchId||this.state.teamId!==live.homeId&&this.state.teamId!==live.awayId)return '';
    const teamId=this.state.teamId,unit=draft[key]||{},selected=slotNames(key).map(s=>this.db.players.find(p=>p.id===unit[s])).filter(Boolean);
    const unavailable=new Set([...(live.sentOff?.[teamId]||[]),...(live.injured?.[teamId]||[]),...(live.penalties||[]).filter(p=>p.teamId===teamId&&(p.queued||p.expiresAt>(live.visibleMinute||0))).map(p=>p.playerId),...(live.waitingReturns||[]).filter(p=>p.teamId===teamId).map(p=>p.playerId)]);
    const dropped=selected.filter(p=>unavailable.has(p.id)||this.isPlayerUnavailable(p));if(!dropped.length)return '';
    const actual=this.specialUnitPlayers(teamId,key,live),actualIds=new Set((actual.skaters||[]).map(p=>p.id));
    const repl=(actual.skaters||[]).filter(p=>!selected.some(s=>s.id===p.id));
    return `<div class="special-live-replacement"><b>⚠️ Изменения в матче</b><br>${dropped.map((p,i)=>{const r=repl[i];return `${this.escape(p.name)} выбыл — ${r?`автозамена: <b>${this.escape(r.name)}</b>`:'подходящей замены нет, слот пуст'}`;}).join('<br>')}</div>`;
  };
  proto.assignSpecialPlayer=function(unit,slot,playerId){
    if(!this.state||!unitKeys.includes(unit))return;
    const draft=this.ensureSpecialTeamsDraft76(),isForward=slot.startsWith('F'),p=playerId?this.db.players.find(x=>String(x.id)===String(playerId)):null;
    if(playerId&&(!p||p.teamId!==this.state.teamId||(isForward?!['LW','C','RW'].includes(p.pos):p.pos!=='D'))){this.setNotice('Выбери игрока подходящей позиции из своего клуба.');return;}
    if(playerId&&this.isPlayerUnavailable(p)){this.setNotice('Травмированного игрока нельзя выбрать в спецбригаду.');return;}
    draft[unit][slot]=playerId||'';this._specialTeamsRecommendation76='';this.renderSpecialTeams();
  };
  proto.toggleSpecialOverlap76=function(key){this._specialTeamsOverlapOpen76=this._specialTeamsOverlapOpen76||{};this._specialTeamsOverlapOpen76[key]=!this._specialTeamsOverlapOpen76[key];this.renderSpecialTeams();};
  proto.discardSpecialTeamsDraft76=function(){if(!this.state)return;this._specialTeamsDraft76=clone(this.state.specialTeams);this._specialTeamsDraftTeamId76=this.state.teamId;this._specialTeamsRecommendation76='';this.renderSpecialTeams();this.setNotice('Несохранённые изменения спецбригад сброшены.');};
  proto.specialTeamsDuplicateDetails78=function(draft){
    const assignments=allAssignments(draft),groups=new Map(),unitNames={pp1:'Большинство 1',pp2:'Большинство 2',pk1:'Меньшинство 1',pk2:'Меньшинство 2'};
    for(const a of assignments){const key=`${a.kind}:${a.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
    const label=a=>`${unitNames[a.unit]} (${a.slot.startsWith('F')?'Нападающий':'Защитник'} ${a.slot.slice(1)})`;
    const details=[];
    for(const [key,items] of groups){if(items.length<2)continue;const player=this.db.players.find(p=>String(p.id)===String(items[0].id));
      details.push(`${player?.name||'Игрок'} выбран одновременно в ${items.map(label).join(' и ')}`);
    }
    return details;
  };
  proto.applySpecialTeamsDraft76=function(){
    if(!this.state)return false;const draft=this.ensureSpecialTeamsDraft76(),v=this.specialTeamsConflicts76(draft);
    if(v.conflicts.size){this.renderSpecialTeams();const detail=this.specialTeamsDuplicateDetails78(draft)[0]||'Есть повторяющиеся игроки внутри однотипных бригад.';this.setNotice(`${detail} Исправь дубли перед применением.`);return false;}
    if(typeof this.foreignQuotaInfoV75==='function'&&!this.isForeignQuotaExemptTeamV75(this.state.teamId)){
      const quota=this.foreignQuotaInfoV75(this.state.teamId,this.state.slotAssignments,draft);
      if(!quota.valid){alert(`Нельзя применить спецбригады: заявка превысит лимит легионеров (${quota.count}/5) или иностранного вратаря (${quota.goalies}/1).`);return false;}
    }
    this.state.specialTeams=clone(draft);this._specialTeamsDraft76=clone(draft);this._specialTeamsDraftTeamId76=this.state.teamId;this._specialTeamsRecommendation76='';
    this.persistQuietly();this.renderSpecialTeams();if(this.renderPregame)this.renderPregame();this.setNotice('Спецбригады применены и сохранены.');return true;
  };
  proto.applySpecialTeams=function(){return this.applySpecialTeamsDraft76();};
  proto.resetSpecialTeams=function(){
    if(!this.state)return;
    const old=this.ensureSpecialTeamsDraft76(),recommended=this.recommendedSpecialTeams78(this.state.teamId);
    if(JSON.stringify(recommended)===JSON.stringify(this.state.specialTeams||{})){
      this._specialTeamsDraft76=clone(recommended);this._specialTeamsDraftTeamId76=this.state.teamId;
      this._specialTeamsRecommendation76='Рекомендуемые сочетания уже выбраны.';
      this.renderSpecialTeams();return;
    }
    const unitAvg=(draft,key)=>{const vals=slotNames(key).map(slot=>this.db.players.find(p=>String(p.id)===String(draft?.[key]?.[slot]))).filter(Boolean);return vals.length?vals.reduce((n,p)=>n+this.effectiveOVR(p),0)/vals.length:0;};
    const beforeAvg=defs.reduce((n,d)=>n+unitAvg(old,d.key),0)/defs.length;
    const afterAvg=defs.reduce((n,d)=>n+unitAvg(recommended,d.key),0)/defs.length;
    const filled=allAssignments(recommended).length,total=defs.reduce((n,d)=>n+slotNames(d.key).length,0);
    const used=new Map();for(const a of allAssignments(recommended)){if(!used.has(String(a.id)))used.set(String(a.id),new Set());used.get(String(a.id)).add(a.kind);}
    const overlaps=[...used.values()].filter(k=>k.size>1).length;
    const delta=Math.round(afterAvg-beforeAvg);
    this._specialTeamsDraft76=clone(recommended);this._specialTeamsDraftTeamId76=this.state.teamId;
    this._specialTeamsRecommendation76=`Подобрано ${filled}/${total} слотов. Пересечений большинства и меньшинства: ${overlaps}${filled<total?` · Не хватило здоровых игроков нужных позиций: ${total-filled} пустых слотов`:''}. Проверь и нажми «Применить».`;
    this.renderSpecialTeams();
  };
  proto.renderSpecialTeams=function(){
    const root=document.getElementById('specialteams-content');if(!root||!this.state)return;
    const draft=this.ensureSpecialTeamsDraft76(),saved=this.state.specialTeams||{},roster=this.teamPlayers(this.state.teamId),validation=this.specialTeamsConflicts76(draft);
    const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
    const escape=this.escape.bind(this),duplicateDetails=this.specialTeamsDuplicateDetails78(draft),duplicateCount=duplicateDetails.length;
    const validationMessage=duplicateCount
      ?`⚠ ${duplicateCount} ${duplicateCount===1?'дубль':duplicateCount<5?'дубля':'дублей'}: ${duplicateDetails.map(escape).join(' · ')}. ${dirty?'Исправь дубли, затем нажми «Применить».':'Поменяй одного из игроков, чтобы исправить дубль.'}`
      :'';
    const toolbarClass=duplicateCount?(dirty?'has-conflict is-dirty':'has-conflict'):(dirty?'is-dirty':'is-clean');
    const canApply=dirty&&duplicateCount===0;
    let html=`<div class="special-editor-toolbar ${toolbarClass}"><div class="special-status-column">${validationMessage?`<div class="special-status-validation ${duplicateCount?(dirty?'error':'warn'):'ok'}">${validationMessage}</div>`:''}<div class="special-status-save ${dirty?'dirty':''}">${dirty?'● Есть несохранённые изменения':'✓ Изменения сохранены'}</div></div><div class="special-editor-actions"><button class="btn btn-primary" onclick="app.applySpecialTeams()" ${canApply?'':'disabled'} title="${duplicateCount?'Сначала исправь дубли внутри большинства или меньшинства':(!dirty?'Нет несохранённых изменений':'Применить изменения')}">✓ Применить</button><button class="btn btn-quiet" onclick="app.discardSpecialTeamsDraft76()" ${dirty?'':'disabled'}>↺ Сбросить</button></div></div>`;
    if(this._specialTeamsRecommendation76)html+=`<div class="special-recommendation">💡 ${escape(this._specialTeamsRecommendation76)}</div>`;
    const priorStats=['pp1','pp2','pk1','pk2'].map(k=>this.specialTeamsStats76(k));
    if(priorStats.some(st=>st.legacyUntracked>0))html+=`<div class="notice" style="margin:.65rem 0">ℹ️ В матчах до версии 7.16 не всегда сохранялся номер использованной спецбригады у каждого удаления. Голы сохранены, но процент считается только по попыткам с точно записанной бригадой; неизвестные старые попытки не распределяются наугад.</div>`;
    for(const d of defs){
      const unit=draft[d.key]||{},slots=slotNames(d.key),overlaps=this.specialTeamsCrossUses76(draft,d.key),open=!!this._specialTeamsOverlapOpen76?.[d.key];
      const ownAssignments=validation.assignments.filter(a=>a.unit===d.key),hasConflict=ownAssignments.some(a=>validation.conflicts.has(`${a.unit}:${a.slot}`));
      const players=slots.map(s=>roster.find(p=>p.id===unit[s])).filter(Boolean);const ratings=players.map(p=>Math.round(this.effectiveOVR(p))).sort((a,b)=>a-b);const avg=players.length?players.reduce((n,p)=>n+this.effectiveOVR(p),0)/players.length:0;
      const stat=this.specialTeamsStats76(d.key);
      const statLine=d.kind==='pp'
        ?`Реализация большинства (учтённые попытки): <b>${stat.opportunities?stat.pct+'%':'—'}</b> · голов всего: <b>${stat.goalsFor}</b>`
        :`Убийство штрафов (учтённые попытки): <b>${stat.opportunities?stat.pct+'%':'—'}</b> · Пропущено: <b>${stat.goalsAgainst}</b>`;
      const overlapSlots=[];
      for(const slot of slots){const id=unit[slot];if(!id)continue;const other=allAssignments(draft).filter(a=>a.id===id&&a.kind!==(d.kind));if(other.length)overlapSlots.push({slot,id,other});}
      const liveReplacement=this.specialTeamsLiveReplacement76(d.key,draft);
      html+=`<article class="special-unit ${hasConflict?'has-duplicate':''}"><h3>${d.title} ${JSON.stringify(draft[d.key]||{})!==JSON.stringify(saved[d.key]||{})?'<span class="special-dirty" style="font-size:.68rem">● не сохранено</span>':''}</h3><div class="unit-desc">${d.desc}</div>${overlaps.length?`<button class="special-overlap-toggle" onclick="app.toggleSpecialOverlap76('${d.key}')">⚠️ ${overlaps.length} совпадени${overlaps.length===1?'е':'я'} с ${d.kind==='pp'?'меньшинством':'большинством'} · ${open?'скрыть имена':'показать имена'}</button>${open?`<div class="special-overlap-list">${overlaps.map(o=>{const p=roster.find(x=>x.id===o.id);return `${escape(p?.name||'Игрок')} также в ${o.units.map(ruUnit).join(', ')}`;}).join('<br>')}</div>`:''}`:''}<div class="special-slots">${slots.map(slot=>{
        const isF=slot.startsWith('F'),selectedId=unit[slot]||'',player=roster.find(p=>p.id===selectedId),label=isF?`Нападающий ${slot.slice(1)}`:`Защитник ${slot.slice(1)}`;
        const duplicate=validation.conflicts.has(`${d.key}:${slot}`),cross=overlapSlots.find(x=>x.slot===slot);const candidates=roster.filter(p=>isF?['LW','C','RW'].includes(p.pos):p.pos==='D').sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
        return `<div class="special-slot ${duplicate?'duplicate':''}"><label class="${!isF?'role-defense':''}">${isF?'🏒 ':''}${label}${!isF&&d.kind==='pk'?' · ключевой слот':''}</label><select aria-label="${label}" onchange="app.assignSpecialPlayer('${d.key}','${slot}',this.value)"><option value="">— выбрать —</option>${candidates.map(p=>{const disabled=this.isPlayerUnavailable(p)&&p.id!==selectedId;const suffix=this.isPlayerUnavailable(p)?' · 🩹 недоступен':'';return `<option value="${escape(p.id)}" ${selectedId===p.id?'selected':''} ${disabled?'disabled':''}>${escape(p.name)} · ${escape(this.positionLabel(p.pos))} · OVR ${Math.round(this.effectiveOVR(p))}${suffix}</option>`;}).join('')}</select>${duplicate?'<span class="special-slot-error">⚠ Этот игрок уже выбран в другой слот большинства или меньшинства</span>':cross?`<span class="special-slot-warning">● Также в ${cross.other.map(a=>ruUnit(a.unit)).join(', ')} — сочетание разрешено, но повышает нагрузку</span>`:''}${player&&this.isPlayerUnavailable(player)?`<span class="special-slot-error">🩹 ${escape(this.injuryDescription(player)||'Игрок недоступен')}</span>`:''}</div>`;
      }).join('')}</div><div class="special-stat-line">${statLine}</div>${liveReplacement}</article>`;
    }
    root.innerHTML=html;
  };
  // Ensure unsaved special-team changes cannot be accidentally ignored when starting a match.
  const baseStart=proto.saveLineupAndStart;
  proto.saveLineupAndStart=function(){
    if(this.state&&this._specialTeamsDraft76&&this._specialTeamsDraftTeamId76===this.state.teamId&&JSON.stringify(this._specialTeamsDraft76)!==JSON.stringify(this.state.specialTeams||{})){
      const accept=confirm('Есть несохранённые изменения спецбригад. Нажми «ОК», чтобы применить их, или «Отмена», чтобы сбросить изменения и продолжить со старым составом.');
      if(accept){if(!this.applySpecialTeamsDraft76())return;}else{this.discardSpecialTeamsDraft76();}
    }
    return baseStart.call(this);
  };
  // Refresh the editor once when the new hooks are installed.
  if(typeof app!=='undefined'&&app.state){app._specialTeamsDraft76=null;app.renderSpecialTeams();}
})();

// v7.9: remove inactive info glyphs from Special Teams UI, both static and rendered.
(function(){
  const cleanSpecialInfoGlyphs=()=>{
    const title=document.querySelector('#view-specialteams .section-head h2');
    if(title)title.textContent=title.textContent.replace(/[ⓘℹ️ℹ]/g,'').trim();
    const root=document.getElementById('specialteams-content');
    if(root&&root.innerHTML)root.innerHTML=root.innerHTML.replace(/[ⓘℹ️ℹ]/g,'').replace(/&#(?:x24d8|9432);/gi,'');
  };
  const oldRender=KHLManagerApp.prototype.renderSpecialTeams;
  if(oldRender){KHLManagerApp.prototype.renderSpecialTeams=function(){oldRender.call(this);cleanSpecialInfoGlyphs();};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanSpecialInfoGlyphs,{once:true});else cleanSpecialInfoGlyphs();
})();


// Mobile Edition 7.23: realistic home/away series while preserving all played results and final 34/34 balance.
KHLManagerApp.prototype.optimizeScheduleHomeAway=function(matches,teamIds){
  if(!Array.isArray(matches)||!Array.isArray(teamIds)||teamIds.length<4)return;
  const regular=matches.filter(m=>m&&!m.playoff&&!m.cancelled);
  const roundOf=m=>{
    const direct=Number(m.round);if(Number.isFinite(direct)&&direct>0)return Math.floor(direct);
    const byId=Number((String(m.id||'').match(/^m(\d+)_/)||[])[1]||0);if(byId>0)return byId;
    const dateRound=Math.round(Number(m.dateOffset||0)/3);return dateRound>0?dateRound:null;
  };
  let roundCount=68;
  for(const m of regular){const r=roundOf(m);if(r)roundCount=Math.max(roundCount,r);}
  const candidates=regular.filter(m=>!m.played&&roundOf(m)>=1&&roundOf(m)<=roundCount);
  if(candidates.length<4)return;
  const teamSet=new Set(teamIds);
  if(regular.some(m=>!teamSet.has(m.homeId)||!teamSet.has(m.awayId)))return;
  const candidateSet=new Set(candidates);
  const homeByRound=()=>{
    const grid=new Map(teamIds.map(id=>[id,Array(roundCount).fill(null)]));
    const flexible=new Map(teamIds.map(id=>[id,Array(roundCount).fill(false)]));
    for(const m of regular){const r=roundOf(m);if(!r||r>roundCount)continue;const h=grid.get(m.homeId),a=grid.get(m.awayId),fh=flexible.get(m.homeId),fa=flexible.get(m.awayId);if(h&&a){h[r-1]=1;a[r-1]=0;fh[r-1]=candidateSet.has(m);fa[r-1]=candidateSet.has(m);}}
    return {grid,flexible};
  };
  const score=()=>{
    const {grid,flexible}=homeByRound();let total=0;
    for(const id of teamIds){
      const arr=grid.get(id),flex=flexible.get(id);let transitions=0,flexCount=0,run=0,previous=null,runFlexible=false;
      const scoreRun=()=>{if(run>0&&runFlexible){if(run<3)total+=(3-run)*(3-run)*3;if(run>5)total+=(run-5)*(run-5)*12;}run=0;runFlexible=false;};
      for(let r=0;r<arr.length;r++){
        const v=arr[r];
        if(v===null){scoreRun();previous=null;continue;}
        if(flex[r])flexCount++;
        if(previous===null){run=1;runFlexible=flex[r];}
        else if(v!==previous){if(flex[r]&&flex[r-1])transitions++;scoreRun();run=1;runFlexible=flex[r];}
        else{run++;runFlexible=runFlexible||flex[r];}
        previous=v;
      }
      scoreRun();
      const target=Math.round(Math.max(0,flexCount-1)/4.2);
      total+=(transitions-target)*(transitions-target)*1.5;
    }
    return total;
  };
  const rebuildOutgoing=()=>{
    const map=new Map(teamIds.map(id=>[id,[]]));
    candidates.forEach((m,i)=>{if(map.has(m.homeId))map.get(m.homeId).push(i);});
    return map;
  };
  let outgoing=rebuildOutgoing(),current=score(),best=current;
  let bestOrientation=candidates.map(m=>[m.homeId,m.awayId]);
  const iterations=Math.min(18000,Math.max(2500,candidates.length*24));
  for(let iteration=0;iteration<iterations;iteration++){
    const seen=new Map(),path=[];let node=teamIds[Math.floor(Math.random()*teamIds.length)],steps=0;
    while(!seen.has(node)&&steps<200){
      seen.set(node,path.length);
      const edges=outgoing.get(node);if(!edges||!edges.length)break;
      const edge=edges[Math.floor(Math.random()*edges.length)];path.push(edge);node=candidates[edge].awayId;steps++;
    }
    if(!seen.has(node))continue;
    const cycle=path.slice(seen.get(node));if(cycle.length<2)continue;
    for(const index of cycle){const m=candidates[index];const h=m.homeId;m.homeId=m.awayId;m.awayId=h;}
    outgoing=rebuildOutgoing();
    const candidateScore=score(),temperature=25*(1-iteration/iterations)+.25;
    const accept=candidateScore<=current||Math.random()<Math.exp((current-candidateScore)/temperature);
    if(accept){
      current=candidateScore;
      if(current<best){best=current;bestOrientation=candidates.map(m=>[m.homeId,m.awayId]);}
    }else{
      for(const index of cycle){const m=candidates[index];const h=m.homeId;m.homeId=m.awayId;m.awayId=h;}
      outgoing=rebuildOutgoing();
    }
  }
  candidates.forEach((m,i)=>{m.homeId=bestOrientation[i][0];m.awayId=bestOrientation[i][1];});
};

// Existing saves get a one-time optimisation of unplayed games only. Played results and fixtures remain intact.
const __khl722BaseRepairSave=KHLManagerApp.prototype.repairSave;
KHLManagerApp.prototype.repairSave=function(){
  if(typeof __khl722BaseRepairSave==='function')__khl722BaseRepairSave.call(this);
  if(!this.state||Number(this.state.scheduleOptimizationVersion||0)>=1)return;
  this.optimizeScheduleHomeAway(this.state.matches||[],this.db.teams.map(t=>t.id));
  this.state.scheduleOptimizationVersion=1;
  this.persistQuietly();
};
