/* KHL Manager 8.26.0 — «Прогноз перед матчем»: шансы на матч по модели игры, подсказка «что изменило шансы», шанс пройти серию. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const RUNS = 1200;
  const HOME_PATTERN = [1, 1, 0, 0, 1, 0, 1]; // 2-2-1-1-1: true = дом у лучше посеянной команды

  // Исходы матча с точки зрения клуба teamId. Прогоны идут на отдельном детерминированном генераторе (матчи-двойники),
  // общий Math.random игры не расходуется, поэтому прогноз не влияет на результаты сезона.
  proto.matchOdds = function (match, teamId, runs) {
    const N = runs || RUNS, hid = match.homeId, aid = match.awayId;
    const home = this.teamById(hid), away = this.teamById(aid);
    const sh = this.getStrength(hid), sa = this.getStrength(aid), po = !!match.playoff;
    const pH = this.clamp(0.5 + (sh.overall - sa.overall) * 0.025, 0.25, 0.75);
    let hw = 0, hl = 0, hot = 0, hotl = 0, hso = 0, hsol = 0, gh = 0, ga = 0;
    for (let i = 0; i < N; i++) {
      const o = this.shotModelGame({ id: `odds|${match.id}|${i}`, homeId: hid, awayId: aid }, home, away, sh, sa, po);
      const a = o.goalsH.length, b = o.goalsA.length; gh += a; ga += b;
      if (a > b) hw++; else if (b > a) hl++;
      else if (o.otWinner) { if (o.otWinner === hid) hot++; else hotl++; }
      else { hso += pH; hsol += 1 - pH; }
    }
    const mine = teamId === hid;
    const f = x => 100 * x / N;
    return mine
      ? { w: f(hw), ot: f(hot), so: f(hso), ow: f(hot + hso), ol: f(hotl + hsol), l: f(hl), ovr: sh.overall, opp: sa.overall }
      : { w: f(hl), ot: f(hotl), so: f(hsol), ow: f(hotl + hsol), ol: f(hot + hso), l: f(hw), ovr: sa.overall, opp: sh.overall };
  };

  // Вероятность выиграть серию до 4 побед. ph/pa — шанс клуба выиграть дома/в гостях; flags[i] — играет ли клуб дома в игре i+1.
  proto.seriesChance = function (wins, losses, nextGame, flags, ph, pa) {
    const memo = {};
    const go = (g, w, l) => {
      if (w >= 4) return 1; if (l >= 4) return 0;
      const k = g + '|' + w + '|' + l; if (memo[k] !== undefined) return memo[k];
      const p = flags[Math.min(g - 1, 6)] ? ph : pa;
      return (memo[k] = p * go(g + 1, w + 1, l) + (1 - p) * go(g + 1, w, l + 1));
    };
    return go(nextGame, wins, losses);
  };

  proto.currentSeriesFor = function (match) {
    const po = this.state && this.state.playoff;
    if (!po || !match.playoff) return null;
    const all = [...(po.history || []), ...(po.series && po.series.length ? [{ series: po.series }] : [])];
    for (const st of all) for (const s of (st.series || [])) if (s.id === match.seriesId) return s;
    return null;
  };

  proto.buildOddsReport = function (match) {
    const my = this.state.teamId;
    const base = this.matchOdds(match, my);
    const winOf = o => o.w + o.ow;
    const hints = [];
    // Вратарь: стоит ли лучший из доступных.
    const goalies = this.teamPlayers(my).filter(p => p.pos === 'G' && !this.isPlayerUnavailable(p)).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a));
    const cur = this.state.starterGoalieId, best = goalies[0];
    const curP = cur ? this.db.players.find(p => p.id === cur) : null;
    if (best && curP && cur !== best.id && !this.isPlayerUnavailable(curP)) {
      this.state.starterGoalieId = best.id;
      let alt; try { alt = this.matchOdds(match, my); } finally { this.state.starterGoalieId = cur; }
      const d = winOf(base) - winOf(alt);
      if (Math.abs(d) >= 0.5) hints.push({ icon: '🧤', text: `Вратарь ${curP ? curP.name : 'запасной'} вместо ${best.name}`, d });
    }
    // Травмы: сколько шансов съедает отсутствие игроков.
    const injured = this.teamPlayers(my).filter(p => this.isPlayerUnavailable(p));
    if (injured.length) {
      const own = new Set(injured.map(p => p.id)), orig = this.isPlayerUnavailable;
      this.isPlayerUnavailable = function (p) { return own.has(p.id) ? false : orig.call(this, p); };
      let alt; try { alt = this.matchOdds(match, my); } finally { this.isPlayerUnavailable = orig; }
      const d = winOf(base) - winOf(alt);
      if (d <= -0.5) hints.push({ icon: '🩹', text: `Травмированы: ${injured.slice(0, 3).map(p => p.name).join(', ')}${injured.length > 3 ? ` и ещё ${injured.length - 3}` : ''}`, d });
    }
    // Серия плей-офф.
    let series = null;
    const s = this.currentSeriesFor(match);
    if (s) {
      const meA = s.teamA === my, wins = meA ? (s.winsA || 0) : (s.winsB || 0), losses = meA ? (s.winsB || 0) : (s.winsA || 0);
      const g = Number(match.gameNo) || (wins + losses + 1);
      const highSeed = HOME_PATTERN[g - 1] ? match.homeId : match.awayId;
      const flags = HOME_PATTERN.map(h => (h ? highSeed : (highSeed === match.homeId ? match.awayId : match.homeId)) === my);
      const swapped = { ...match, id: match.id + '|sw', homeId: match.awayId, awayId: match.homeId };
      const here = winOf(base) / 100, there = winOf(this.matchOdds(swapped, my)) / 100;
      const ph = match.homeId === my ? here : there, pa = match.homeId === my ? there : here;
      series = { p: this.seriesChance(wins, losses, g, flags, ph, pa), wins, losses };
    }
    return { base, hints, series };
  };

  const f1 = x => x.toFixed(1).replace('.', ',');
  // Коэффициент как украшение: обратная величина вероятности исхода.
  const coef = p => { const v = p > 0.05 ? 100 / p : 99; return Math.min(99, Math.max(1.01, v)).toFixed(2).replace('.', ','); };
  proto.oddsCardHtml = function (match, rep) {
    const b = rep.base, win = b.w + b.ow, po = !!match.playoff;
    const opp = this.teamById(match.homeId === this.state.teamId ? match.awayId : match.homeId);
    const part = (c, v) => `<i class="${c}" style="flex:${Math.max(v, 0.01)} 1 0" title="${Math.round(v)}%">${v >= 6 ? Math.round(v) + '%' : ''}</i>`;
    const hints = rep.hints.length
      ? `<div class="odds-hints"><b>Что изменило шансы</b>${rep.hints.map(h => `<div>${h.icon} ${this.escape(h.text)}: <span class="${h.d < 0 ? 'm' : 'p'}">${h.d < 0 ? '−' : '+'}${f1(Math.abs(h.d))} п.п.</span></div>`).join('')}</div>`
      : '';
    const k = (label, v) => `<div><i>${label}</i><b>${coef(v)}</b></div>`;
    return `<div class="odds-card" id="odds-card">
      <div class="odds-top"><div><div class="eyebrow">Прогноз перед матчем</div><div class="odds-big">${Math.round(win)}%</div><div class="small muted">шанс победы над ${this.escape(opp.name)}</div></div></div>
      <div class="odds-bar" role="img" aria-label="Распределение исходов">${part('w1', b.w)}${part('w2', b.ow)}${part('l2', b.ol)}${part('l1', b.l)}</div>
      <div class="odds-leg"><span class="w1">Победа в основное время ${Math.round(b.w)}%</span><span class="w2">Победа в ОТ${po ? '' : ' / по буллитам'} ${Math.round(b.ow)}%</span><span class="l2">Поражение в ОТ${po ? '' : ' / по буллитам'} ${Math.round(b.ol)}%</span><span class="l1">Поражение в основное время ${Math.round(b.l)}%</span></div>
      <div class="odds-sub">Коэффициенты на победу ${this.escape(this.teamById(this.state.teamId).name)}</div>
      <div class="odds-facts">${k('В основное время', b.w)}${k('В дополнительное время', b.ot)}${po ? '' : k('По буллитам', b.so)}${rep.series ? `<div><i>Шанс пройти серию</i><b>${Math.round(rep.series.p * 100)}%</b><span class="small muted"> · счёт ${rep.series.wins}:${rep.series.losses}</span></div>` : ''}</div>
      <div class="odds-facts"><div><i>Сила составов</i><b>${f1(b.ovr)} / ${f1(b.opp)}</b></div></div>
      ${hints}
      <p class="small muted odds-note">По оценкам аналитиков и ожиданиям болельщиков.</p></div>`;
  };

  proto.renderOddsCard = function () {
    if (!this.state) return;
    const root = document.getElementById('pregame-editor');
    if (!root) return;
    const match = this.state.matches.find(x => x.id === (this.pendingMatchId || this.currentMatchId));
    const old = document.getElementById('odds-card');
    if (!match || match.played || !root.querySelector('.pregame-banner')) { if (old) old.remove(); return; }
    const sig = [match.id, this.state.starterGoalieId, JSON.stringify(this.state.slotAssignments || {}), JSON.stringify(this.state.lineAssignments || {}),
      this.teamPlayers(this.state.teamId).filter(p => this.isPlayerUnavailable(p)).map(p => p.id).join(','),
      this.teamPlayers(match.homeId === this.state.teamId ? match.awayId : match.homeId).filter(p => this.isPlayerUnavailable(p)).map(p => p.id).join(',')].join('#');
    if (!this._oddsCache || this._oddsCache.sig !== sig) this._oddsCache = { sig, rep: this.buildOddsReport(match) };
    const html = this.oddsCardHtml(match, this._oddsCache.rep);
    if (old) old.outerHTML = html;
    else root.querySelector('.pregame-banner').insertAdjacentHTML('afterend', html);
  };

  const _pre = proto.renderPregame;
  
  // Смена состава и вратаря пересчитывает прогноз.
  ['assignSlot', 'setStarterGoalie'].forEach(name => {
    const base = proto[name];
    if (typeof base !== 'function') return;
    proto[name] = function () {
      const r = base.apply(this, arguments);
      try { this.renderOddsCard(); } catch (e) { /* ignore */ }
      return r;
    };
  });
})();
