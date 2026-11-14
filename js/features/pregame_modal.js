/* KHL Manager 9.9.0 — начало матча: окно подготовки поверх текущей вкладки.
   Прогноз и «Готовность к матчу» живут в «Ближайшем матче» на Обзоре; на вкладке «Состав» остаётся узкая полоса «Матч сегодня». */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const f1 = x => x.toFixed(1).replace('.', ',');
  const coef = p => { const v = p > 0.05 ? 100 / p : 99; return Math.min(99, Math.max(1.01, v)).toFixed(2).replace('.', ','); };
  const SEV = { light: 'лёгкая', medium: 'средняя', severe: 'тяжёлая' };
  const surname = p => String(p.name || '').split(' ').slice(-1)[0];
  const RULE = 'Для российских клубов не более 5 легионеров в заявке, включая не более одного иностранного вратаря. Для «Барыса», «Шанхайских драконов» и «Динамо Мн» ограничение не действует. Вне заявки лимита нет.';

  proto.pgMatch = function () {
    if (!this.state) return null;
    const m = this.state.matches.find(x => x.id === (this.pendingMatchId || this.currentMatchId));
    return m && !m.played && !m.cancelled ? m : null;
  };
  proto.pgIsLive = function (m) { return !!(m && this.liveMatch && this.liveMatch.matchId === m.id && !this.liveMatch.finished); };

  // Вероятности исходов (кэш по составам, чтобы не гонять модель при каждой перерисовке).
  proto.pgOdds = function (m) {
    const my = this.state.teamId, oppId = m.homeId === my ? m.awayId : m.homeId;
    const sig = [m.id, this.state.starterGoalieId, JSON.stringify(this.state.slotAssignments || {}), JSON.stringify(this.state.lineAssignments || {}),
      this.teamPlayers(my).filter(p => this.isPlayerUnavailable(p)).map(p => p.id).join(','),
      this.teamPlayers(oppId).filter(p => this.isPlayerUnavailable(p)).map(p => p.id).join(',')].join('#');
    if (!this._ovOdds || this._ovOdds.sig !== sig) this._ovOdds = { sig, o: this.matchOdds(m, my, 200) };
    return this._ovOdds.o;
  };

  // Букмекерские коэффициенты: 55% место в таблице + 45% форма за 5 матчей; до 5 игр добирает сила состава.
  proto.pgIndex = function (teamId) {
    const ss = (this.state.standings || {})[teamId] || {}, gp = ss.gp || 0;
    const last = this.state.matches.filter(x => x.played && !x.cancelled && (x.homeId === teamId || x.awayId === teamId))
      .sort((a, b) => a.dateOffset - b.dateOffset || String(a.id).localeCompare(String(b.id))).slice(-5);
    const pts = last.reduce((t, x) => { const mine = x.homeId === teamId, a = mine ? x.homeScore : x.awayScore, b = mine ? x.awayScore : x.homeScore;
      return t + (a > b ? 2 : ((x.ot || x.so) && !x.overtimeEmptyNet ? 1 : 0)); }, 0);
    const all = (this.db.teams || []).map(t => { try { return this.getStrength(t.id).overall; } catch (e) { return 75; } });
    const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 75;
    let ov = avg; try { ov = this.getStrength(teamId).overall; } catch (e) {}
    const base = Math.min(0.8, Math.max(0.2, 0.5 + (ov - avg) * 0.02));
    if (!gp || !last.length) return base;
    const w = Math.min(gp, 5) / 5, real = 0.55 * (ss.pts || 0) / (2 * gp) + 0.45 * pts / (2 * last.length);
    return w * real + (1 - w) * base;
  };
  proto.pgCoefs = function (m) {
    const d = this.pgIndex(m.homeId) - this.pgIndex(m.awayId) + 0.04;
    const p = Math.min(0.75, Math.max(0.25, 1 / (1 + Math.exp(-2 * d))));
    const c = q => Math.min(4.5, Math.max(1.2, 0.93 / q)).toFixed(2).replace('.', ',');
    return { home: c(p), away: c(1 - p), pHome: p };
  };

  proto.pgForecastHtml = function (m) {
    const b = this.pgOdds(m), po = !!m.playoff;
    const part = (c, v) => `<i class="${c}" style="flex:${Math.max(v, 0.01)} 1 0" title="${Math.round(v)}%">${v >= 6 ? Math.round(v) + '%' : ''}</i>`;
    const ot = po ? 'Победа в ОТ' : 'Победа в ОТ / по буллитам', lot = po ? 'Поражение в ОТ' : 'Поражение в ОТ / по буллитам';
    return `<div class="pg-fc"><div class="odds-bar" role="img" aria-label="Распределение исходов">${part('w1', b.w)}${part('w2', b.ow)}${part('l2', b.ol)}${part('l1', b.l)}</div>
      <div class="odds-leg"><span class="w1">Победа в осн. время ${Math.round(b.w)}%</span><span class="w2">${ot} ${Math.round(b.ow)}%</span><span class="l2">${lot} ${Math.round(b.ol)}%</span><span class="l1">Поражение в осн. время ${Math.round(b.l)}%</span></div></div>`;
  };

  // Готовность: травмы в стартовом составе, недоступные игроки обеих команд, лимит легионеров.
  proto.pgReadiness = function (m) {
    const my = this.state.teamId, bad = [];
    // 14.7.22: игрок в ВХЛ/МХЛ — это осознанное решение тренера, а не проблема с составом,
    // поэтому в «недостающих»/«недоступных» для матча он не должен фигурировать как травма.
    const isFarm = p => !!(this.isInFarm && this.isInFarm(p));
    for (const [slot, id] of Object.entries(this.state.slotAssignments || {})) {
      if (!id) continue;
      const p = this.db.players.find(x => x.id === id);
      if (p && p.teamId === my && this.isPlayerUnavailable(p) && !isFarm(p)) bad.push({ p, slot });
    }
    const side = tid => {
      const list = this.teamPlayers(tid).filter(p => this.isPlayerUnavailable(p) && !isFarm(p)).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a));
      const q = this.foreignQuotaInfoV75 ? this.foreignQuotaInfoV75(tid) : { exempt: true, valid: true, count: 0, goalies: 0 };
      return { id: tid, name: (this.teamById(tid) || {}).name || 'Клуб', list, quota: q };
    };
    const teams = [side(m.homeId), side(m.awayId)], mine = teams.find(t => t.id === my);
    const quotaBad = !!(mine && !mine.quota.valid);
    return { bad, teams, quotaBad, ok: !bad.length && !quotaBad };
  };

  proto.pgReadinessHtml = function (m) {
    const r = this.pgReadiness(m), esc = s => this.escape(String(s));
    const my = this.state.teamId, ordered = [...r.teams].sort((a, b) => (b.id === my) - (a.id === my));
    const names = t => {
      if (!t.list.length) return 'никого';
      const sh = t.list.slice(0, 3).map(p => `${esc(surname(p))} (${SEV[(this.playerDev(p) || {}).injury?.severity] || 'травма'})`).join(', ');
      return sh + (t.list.length > 3 ? ` и ещё ${t.list.length - 3}` : '');
    };
    const g = ordered.find(t => t.id === my);
    const status = r.ok ? '<span class="pg-ok">✓ всё в порядке</span>' : '<span class="pg-bad">⛑️ нужно исправить состав</span>';
    const badIds = new Set(r.bad.map(x => x.p.id));
    const inj = t => {
      if (t.id === my && r.bad.length) return `<div class="ln"><i>🩹</i><span class="pg-bad">В старте травмированы: ${r.bad.map(x => esc(`${surname(x.p)} (${this.schemeLineSlotName ? this.schemeLineSlotName(x.slot) : x.slot})`)).join(', ')}</span></div>`;
      return `<div class="ln"><i>🩹</i><span${t.list.length ? '' : ' class="mu"'}>${t.list.length ? names(t) : 'Все здоровы'}</span></div>`;
    };
    const frn = t => {
      if (t.quota.exempt) return `<div class="ln"><i title="${esc(RULE)}">🌍</i><span class="mu">Лимит легионеров не действует</span></div>`;
      const txt = `Легионеры ${t.quota.count}/5 · иностр. вратари ${t.quota.goalies}/1`;
      return `<div class="ln"><i title="${esc(RULE)}">🌍</i><span${t.quota.valid ? '' : ' class="pg-bad"'}>${txt}</span></div>`;
    };
    const card = t => `<div class="pg-t"><b>${esc(t.name)}${t.id === my ? ' <small>вы</small>' : ''}</b>${this.leadershipLineHtml ? this.leadershipLineHtml(t.id) : ''}${inj(t)}${frn(t)}</div>`;
    return `<div class="pg-ready${r.ok ? '' : ' bad'}"><div class="ln"><b>Готовность к матчу</b>${status}</div><div class="pg-tm">${r.teams.map(card).join('')}</div></div>`;
  };

  /* ---------- окно подготовки ---------- */
  proto.pgModalHtml = function (m) {
    const esc = s => this.escape(String(s)), my = this.state.teamId, home = m.homeId === my;
    const opp = this.teamById(home ? m.awayId : m.homeId), me = this.teamById(my);
    const r = this.pgReadiness(m), cf = this.pgCoefs(m), homeT = this.teamById(m.homeId), awayT = this.teamById(m.awayId);
    const arenaName = (this.stadiumFor(m.homeId) || {}).name || '';
    let st = null; try { st = this.getStrength(my); } catch (e) {}
    const strength = st ? `Атака ${Math.round(st.attack)} · Защита ${Math.round(st.defense)} · Вратарь ${Math.round(st.goalie)} · Общая ${Math.round(st.overall)}` : '';
    const oppId = home ? m.awayId : m.homeId;
    const where = m.playoff ? `Плей-офф${m.gameNo ? ', матч ' + m.gameNo : ''} · ` : '';
    let body;
    if (r.ok) {
      body = `<div class="pg-ready"><div class="ln"><span class="pg-ok">✓ Заявка корректна</span><span class="mu">${r.teams.find(t => t.id === my).quota.exempt ? 'лимит легионеров не применяется' : 'легионеры ' + r.teams.find(t => t.id === my).quota.count + '/5'}</span></div>
        ${strength ? `<div class="ln"><span class="mu">${strength}</span></div>` : ''}
        <div class="ln"><span class="mu">Форма соперника</span><span class="ov-form">${this.overviewForm(oppId)}</span></div></div>`;
    } else {
      const lines = [];
      if (r.bad.length) lines.push(`В стартовом составе травмированы: ${r.bad.map(x => esc(`${x.p.name} (${this.schemeLineSlotName ? this.schemeLineSlotName(x.slot) : x.slot})`)).join(', ')}. Замените каждого на доступного игрока той же позиции.`);
      if (r.quotaBad) { const q = r.teams.find(t => t.id === my).quota; lines.push(`Легионеров в заявке ${q.count} из 5${q.goalies > 1 ? `, иностранных вратарей ${q.goalies} из 1` : ''}. Уберите лишних из звеньев или спецбригад.`); }
      body = `<div class="pg-ready bad"><div class="ln"><b class="pg-bad">⛑️ Нельзя начинать матч</b></div>${lines.map(l => `<div class="ln pg-bad">${l}</div>`).join('')}</div>`;
    }
    const buttons = r.ok
      ? `<button type="button" class="btn btn-quiet pg-link" onclick="app.pgEdit()">Изменить звенья и запас →</button><button type="button" class="btn btn-quiet pg-link" onclick="app.tacOpenPop('tactics',true)">🎯 Изменить тактику на матч →</button><div class="pg-btns"><button type="button" class="btn btn-primary" id="pg-start" onclick="app.saveLineupAndStart()">🏒 Начать матч</button><button type="button" class="btn" onclick="app.pgClose()">Позже</button></div>`
      : `<button type="button" class="btn btn-primary pg-link" id="pg-start" onclick="app.pgEdit()">Исправить состав →</button><div class="pg-btns"><button type="button" class="btn" disabled>🏒 Начать матч</button><button type="button" class="btn" onclick="app.pgClose()">Позже</button></div>`;
    return `<div class="pg-dlg" role="dialog" aria-modal="true" aria-labelledby="pg-title"><div class="eyebrow">Подготовка к матчу</div>
      <h3 id="pg-title" class="pg-vs"><span><span class="pg-cf" title="Коэффициент на победу">${cf.home}</span><br>${this.kitDotFor(m, m.homeId, 's')}${esc(homeT.name)}</span><span class="pg-dash">—</span><span><span class="pg-cf${cf.pHome >= 0.5 ? ' low' : ''}" title="Коэффициент на победу">${cf.away}</span><br>${this.kitDotFor(m, m.awayId, 's')}${esc(awayT.name)}</span></h3>
      <div class="small muted pg-sub">${esc(where)}${this.formatDate(m.dateOffset)} · ${esc(arenaName)}</div>
      ${this.derbyBadgeHtml ? this.derbyBadgeHtml(m) : ''}
      ${body}${buttons}</div>`;
  };

  proto.pgClose = function () { this._pgOpen = false; this.renderPregame(); };
  proto.pgEdit = function () { this._pgOpen = false; this.switchTab('roster'); this.renderPregame(); };

  proto.renderPregame = function () {
    const strip = $('pregame-editor');
    const m = this.state ? this.pgMatch() : null;
    let modal = $('pregame-modal');
    if (!m || this.pgIsLive(m)) { if (strip) strip.innerHTML = ''; if (modal) modal.remove(); this._pgOpen = false; return; }
    if (strip) {
      const r = this.pgReadiness(m), my = this.state.teamId, opp = this.teamById(m.homeId === my ? m.awayId : m.homeId), me = this.teamById(my);
      const msg = r.ok ? `Матч сегодня: ${this.cdTeam(me.id)} — ${this.cdTeam(opp.id)}` : 'Матч сегодня. Исправьте состав: ' + [...r.bad.map(x => `${this.cdName(x.p)} (${this.escape(this.schemeLineSlotName ? this.schemeLineSlotName(x.slot) : x.slot)})`), ...(r.quotaBad ? ['лимит легионеров'] : [])].join(', ');
      strip.innerHTML = `<div class="pg-strip${r.ok ? '' : ' bad'}"><span class="t">${msg}</span><span class="r"><button type="button" class="btn btn-primary" onclick="app.pgOpenModal()">Подготовка</button></span></div>`;
    }
    if (this._pgOpen) {
      if (!modal) { modal = document.createElement('div'); modal.id = 'pregame-modal'; modal.className = 'pg-scrim'; document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) this.pgClose(); }); }
      modal.innerHTML = this.pgModalHtml(m);
      const b = $('pg-start'); if (b && b.focus) { try { b.focus({ preventScroll: true }); } catch (e) {} }
    } else if (modal) modal.remove();
  };
  proto.pgOpenModal = function () { this._pgOpen = true; this.renderPregame(); };

  // Окно открывается поверх текущей вкладки, без перехода на «Состав».
  const _open = proto.openPregame;
  proto.openPregame = function (id) {
    const m = this.state && this.state.matches.find(x => x.id === id);
    if (m && this.pgIsLive(m)) { this.pendingMatchId = id; this.currentMatchId = id; this.switchTab('match'); return; }
    return _open.apply(this, arguments);
  };

  const _start = proto.saveLineupAndStart;
  proto.saveLineupAndStart = function () {
    this._pgOpen = false; const modal = $('pregame-modal'); if (modal) modal.remove();
    return _start.apply(this, arguments);
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && typeof app !== 'undefined' && app && app._pgOpen) app.pgClose(); });
  }
})();
