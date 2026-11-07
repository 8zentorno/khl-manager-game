/* KHL Manager 8.29.0 — вкладка «Обзор»: ближайший матч с коэффициентами, 4 плитки состояния,
   компактная цель, мини-таблица конференции, новости клуба, три лидера. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const CONF = { west: 'Запад', east: 'Восток' };
  const coef = p => { const v = p > 0.05 ? 100 / p : 99; return Math.min(99, Math.max(1.01, v)).toFixed(2).replace('.', ','); };

  proto.overviewNextMatch = function () {
    const my = this.state.teamId;
    return this.state.matches.filter(x => !x.played && !x.cancelled && (x.homeId === my || x.awayId === my)).sort((a, b) => a.dateOffset - b.dateOffset)[0] || null;
  };
  proto.overviewPrepare = function () {
    const m = this.overviewNextMatch();
    if (m) this.openPregame(m.id); else this.switchTab('roster');
  };

  // Прогноз и готовность на ближайший матч (кэш по составам лежит в pgOdds).
  proto.overviewOddsHtml = function (m) {
    return this.pgReadinessHtml(m);
  };

  proto.overviewForm = function (teamId) {
    const my = teamId || this.state.teamId;
    const played = this.state.matches.filter(m => m.played && !m.cancelled && (m.homeId === my || m.awayId === my))
      .sort((a, b) => a.dateOffset - b.dateOffset || String(a.id).localeCompare(String(b.id))).slice(-5);
    const cells = played.map(m => {
      const mine = m.homeId === my, a = mine ? m.homeScore : m.awayScore, b = mine ? m.awayScore : m.homeScore;
      if (a > b) return '<i class="w" title="Победа">В</i>';
      if ((m.ot || m.so) && !m.overtimeEmptyNet) return '<i class="o" title="Поражение в ОТ/по буллитам">ПО</i>';
      return '<i class="l" title="Поражение">П</i>';
    });
    while (cells.length < 5) cells.push('<i>–</i>');
    return cells.join('');
  };

  proto.overviewMetrics = function () {
    const my = this.state.teamId, team = this.teamById(my), ss = this.state.standings[my] || {};
    const conf = String(team.conf || '').toLowerCase(), rows = this.standingsFor(conf);
    const place = rows.findIndex(x => x.id === my) + 1;
    let placeSub = CONF[conf] || '';
    if (ss.gp > 0 && rows.length > 8) {
      const edge = place <= 8 ? ss.pts - rows[8].pts : rows[7].pts - ss.pts;
      placeSub += place <= 8 ? ` · в зоне ПО, +${edge} ${plural(edge, 'очко', 'очка', 'очков')}` : ` · до зоны ПО ${edge} ${plural(edge, 'очко', 'очка', 'очков')}`;
    } else placeSub += ' · старт сезона';
    const str = Math.round(this.getStrength(my).overall), rank = this.objectivePowerRank ? this.objectivePowerRank() : 0;
    const hurt = this.teamPlayers(my).filter(p => this.playerDev(p)?.injury && this.isPlayerUnavailable(p) && !(this.state.farm && this.state.farm[p.id]));
    const best = hurt.slice().sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
    const tile = (l, v, s) => `<div class="ov-kpi"><small>${l}</small>${v}<span>${s}</span></div>`;
    $('team-metrics').innerHTML =
      tile('Место', `<b>${place || '—'}-е</b>`, this.escape(placeSub)) +
      tile('Форма', `<div class="ov-form">${this.overviewForm()}</div>`, 'последние 5 матчей') +
      tile('Сила состава', `<b>${str}</b>`, rank ? `${rank}-я в конференции` : 'средний рейтинг') +
      tile('Лазарет', `<b>${hurt.length}</b>`, hurt.length ? `${hurt.length === 1 ? 'травма' : plural(hurt.length, 'травма', 'травмы', 'травм')} · ${this.escape(best.name)}` : 'все здоровы');
  };

  proto.overviewTable = function () {
    const my = this.state.teamId, conf = String(this.teamById(my).conf || '').toLowerCase(), rows = this.standingsFor(conf);
    const i = rows.findIndex(x => x.id === my), start = Math.max(0, Math.min(i - 2, rows.length - 5));
    const part = rows.slice(start, start + 5);
    $('ov-table').innerHTML = `<table class="ov-tbl"><thead><tr><th>#</th><th>Клуб</th><th>И</th><th>О</th></tr></thead><tbody>${part.map((t, j) => {
      const n = start + j + 1;
      return `<tr class="${t.id === my ? 'me' : ''}${n === 8 ? ' cut' : ''}"><td>${n}</td><td><span class="nm" data-cl="${this.escape(t.id)}">${this.escape(t.name)}</span></td><td>${t.gp || 0}</td><td>${t.pts || 0}</td></tr>`;
    }).join('')}</tbody></table>`;
  };

  proto.overviewNews = function () {
    if (this.ensureNewsState) this.ensureNewsState();
    const list = (this.state.news || []).filter(n => n.scope === 'club' && n.category !== 'preview')
      .sort((a, b) => (Number(b.dateOffset) || 0) - (Number(a.dateOffset) || 0) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).slice(0, 3);
    $('ov-news').innerHTML = list.length
      ? `<div class="ov-news">${list.map(n => `<div class="ov-news-item" data-nd="${Number(n.dateOffset) || 0}" data-nmid="${this.escape(n.matchId || '')}" data-nt="${this.escape((n.teamIds || []).join(','))}" data-ncat="${this.escape(n.category || '')}">${n.icon || '📰'} ${this.escape(n.headline)}<small>${this.escape(this.formatDate(Number(n.dateOffset) || 0))}</small></div>`).join('')}</div>`
      : '<div class="empty">Новости клуба появятся после первых матчей.</div>';
  };

  proto.overviewLeaders = function () {
    const my = this.state.teamId, gp = (this.state.standings[my] || {}).gp || 0, card = $('ov-leaders-card');
    card.hidden = !gp;
    if (!gp) return;
    const top = this.teamPlayers(my).filter(p => p.pos !== 'G').map(p => ({ ...p, ...this.state.playerStats[p.id] }))
      .sort((a, b) => ((b.g || 0) + (b.a || 0)) - ((a.g || 0) + (a.a || 0)) || (b.g || 0) - (a.g || 0) || b.ovr - a.ovr).slice(0, 3);
    $('team-leaders').innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Игрок</th><th>Поз.</th><th class="numeric">И</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th></tr></thead><tbody>${top.map(p =>
      `<tr><td class="team-cell"><span class="nm" data-pl="${this.escape(p.id)}">${this.escape(p.name)}</span></td><td>${this.positionLabel(p.pos)}</td><td class="numeric">${p.gp || 0}</td><td class="numeric">${p.g || 0}</td><td class="numeric">${p.a || 0}</td><td class="numeric"><b>${(p.g || 0) + (p.a || 0)}</b></td></tr>`).join('')}</tbody></table></div>`;
  };

  // Полоска цели: до первого матча пустая, у целей по месту в таблице показываем границу зоны.
  proto.overviewGoal = function () {
    const st = $('team-objective-status'); if (!st) return;
    const my = this.state.teamId, ss = this.state.standings[my] || {}, obj = this.state.teamObjective || {}, po = this.state.playoff;
    const bar = st.querySelector('.objective-bar span'), txt = st.querySelector('.small.muted, .muted.small');
    st.querySelector('.ov-goal-note')?.remove();
    const rankGoal = { playoffs: 8, top4: 4, conference: 1, first: 1 }[obj.type || 'playoffs'];
    if (!(ss.gp > 0) && !obj.evaluated && !(po && po.started)) {
      if (bar) bar.style.width = '0%';
      if (txt) txt.textContent = 'Сезон ещё не начался: полоска заполняется по ходу матчей.';
    }
    if (rankGoal && !obj.evaluated && ss.gp > 0) {
      const conf = String(this.teamById(my).conf || '').toLowerCase(), rows = this.standingsFor(conf), edge = rows[rankGoal - 1];
      if (edge) st.insertAdjacentHTML('beforeend', `<div class="tiny muted ov-goal-note">Граница цели сейчас: ${edge.pts} ${plural(edge.pts, 'очко', 'очка', 'очков')} (${rankGoal}-е место).</div>`);
    }
  };

  proto.renderOverview = function () {
    if (!this.state || !$('ov-odds')) return;
    const m = this.overviewNextMatch(), ss = this.state.standings[this.state.teamId] || {}, po = this.state.playoff;
    $('ov-odds').className = m ? 'ov-fc' : '';
    $('ov-odds').innerHTML = m ? this.overviewOddsHtml(m) : '';
    if (m) {
      const mid = document.querySelectorAll('#next-match-card .match-hero > div:nth-child(2) > .small.muted')[0];
      if (mid && !mid.parentNode.querySelector('.ov-arena')) mid.insertAdjacentHTML('afterend', `<div class="small ov-arena" style="margin-top:.2rem"><b>${this.escape((this.stadiumFor(m.homeId) || {}).name || '')}</b></div>`);
      const kids = document.querySelectorAll('#next-match-card .match-hero > div');
      [[0, m.homeId, 'Хозяева'], [2, m.awayId, 'Гости']].forEach(([i, id, role]) => { const el = kids[i];
        const lab = el && el.querySelector('.tiny'); if (lab) lab.textContent = role + (id === this.state.teamId ? ' · вы' : ''); if (el) el.insertAdjacentHTML('beforeend', `<div class="ov-form ov-form-c" title="Форма: последние 5 матчей">${this.overviewForm(id)}</div>`); });
    }
    this.overviewGoal();
    const head = $('dash-headline'), sub = $('dash-subtitle'), bar = $('ov-prog-bar');
    if (po && po.started) { sub.textContent = ''; bar.style.width = '100%'; }
    else {
      head.textContent = this.state.seasonFinished ? 'Регулярный чемпионат завершён' : 'Сезон 2026/27';
      sub.textContent = `сыграно ${ss.gp || 0} из 68`;
      bar.style.width = Math.min(100, (ss.gp || 0) / 68 * 100) + '%';
    }
    this.overviewMetrics(); this.overviewTable(); this.overviewNews(); this.overviewLeaders();
  };

  // Прежние отрисовщики вкладки больше не нужны: плитки и лидеров ведёт renderOverview.
  proto.renderMetrics = function () { /* см. renderOverview */ };

  const _render = proto.renderAll;
  proto.renderAll = function () {
    const r = _render.apply(this, arguments);
    if (this.state) { try { this.renderOverview(); } catch (e) { console.warn('KHL Manager 8.29 overview:', e); } }
    return r;
  };
})();
