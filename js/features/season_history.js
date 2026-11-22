/* KHL Manager 8.24.0 — история сезонов: краткая карточка, автозапись после финала, хранится в сохранении. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;

  const KEY = 'khl_manager_history_v1';
  proto.loadSeasonHistory = function () {
    try { const h = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; }
  };
  proto.saveSeasonHistory = function (h) { try { localStorage.setItem(KEY, JSON.stringify(h)); return true; } catch (e) { return false; } };
  // Объединяет записи (из файла сохранения) с историей браузера; одинаковые сезоны не дублируются.
  proto.mergeSeasonHistory = function (extra) {
    if (!Array.isArray(extra) || !extra.length) return 0;
    const h = this.loadSeasonHistory(), have = new Set(h.map(x => x.id));
    let n = 0;
    for (const e of extra) { if (e && e.id && !have.has(e.id)) { h.push(e); have.add(e.id); n++; } }
    if (n) { h.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')) || (y.seasonNumber || 0) - (x.seasonNumber || 0)); this.saveSeasonHistory(h); }
    return n;
  };

  // Краткая запись об завершённом сезоне.
  proto.buildSeasonHistoryEntry = function () {
    const st = this.state, po = st.playoff || {};
    const teamId = st.initialTeamId || st.teamId, team = this.teamById(teamId);
    const ss = st.standings[teamId] || {};
    const conf = String(team && team.conf || '').toLowerCase();
    const rank = conf ? this.standingsFor(conf).findIndex(t => t.id === teamId) + 1 : 0;
    const sum = this.seasonSummaryData ? this.seasonSummaryData() : null;
    let finalist = null;
    const stages = [...(po.history || []), ...(po.stage && po.series && po.series.length ? [{ stage: po.stage, series: po.series }] : [])];
    const last = stages.length ? stages[stages.length - 1] : null;
    const fin = last && (last.series || []).find(s => s.winnerId && s.winnerId === po.championId);
    if (fin) finalist = fin.teamA === po.championId ? fin.teamB : fin.teamA;
    const n = st.seasonNumber || 1, y = 2026 + Math.max(0, n - 1);
    return {
      id: [y, teamId, ss.pts || 0, ss.gf || 0, ss.ga || 0, po.championId || ''].join('|'), at: new Date().toISOString(), seasonNumber: n, label: `${y}/${String(y + 1).slice(-2)}`,
      teamId, club: team ? team.name : teamId, conf: team ? team.conf : '', place: rank,
      pts: ss.pts || 0, w: ss.w || 0, l: ss.l || 0, otl: (ss.otl || 0) + (ss.sol || 0), gf: ss.gf || 0, ga: ss.ga || 0,
      playoff: sum ? sum.playoffFinish : '', championId: po.championId || null,
      champion: po.championId ? (this.teamById(po.championId) || {}).name || '' : '',
      finalist: finalist ? (this.teamById(finalist) || {}).name || '' : ''
    };
  };

  proto.recordSeasonHistory = function () {
    if (!this.state || !this.state.playoff || !this.state.playoff.completed || this.state.seasonHistoryRecorded) return false;
    const e = this.buildSeasonHistoryEntry();
    const h = this.loadSeasonHistory();
    if (!h.some(x => x.id === e.id)) { h.unshift(e); this.saveSeasonHistory(h); }
    this.state.seasonHistoryRecorded = true;
    this.persistQuietly();
    this.refreshHistoryButton();
    return true;
  };

  proto.archiveCompletedSeason = function () { this.recordSeasonHistory(); this.state.seasonHistoryArchived = true; return true; };

  const _start = proto.startAnotherSeason;
  proto.startAnotherSeason = function () {
    if (this.state && this.state.playoff && this.state.playoff.completed) {
      this.recordSeasonHistory();
      this._carryHistory = new Array(this.state.seasonNumber || 1);
    }
    return _start.apply(this, arguments);
  };
  const _init = proto.initNewCareer;
  proto.initNewCareer = function () {
    const r = _init.apply(this, arguments);
    this._carryHistory = null;
    return r;
  };

  proto.seasonHistoryAction = function (a, id) {
    if (a === 'del') this._histAsk = id;
    else if (a === 'delall') this._histAsk = 'all';
    else if (a === 'no') this._histAsk = null;
    else if (a === 'yes') { this.saveSeasonHistory(this.loadSeasonHistory().filter(x => x.id !== id)); this._histAsk = null; }
    else if (a === 'allyes') { this.saveSeasonHistory([]); this._histAsk = null; }
    this.renderSeasonHistory();
    this.refreshHistoryButton();
  };

  proto.refreshHistoryButton = function () {
    const el = document.getElementById('history-count');
    if (el) { const n = this.loadSeasonHistory().length; el.textContent = n ? String(n) : ''; }
  };
  proto.openSeasonHistory = function () { this._histAsk = null; this.renderSeasonHistory(); this.showScreen('screen-history'); };

  proto.renderSeasonHistory = function () {
    const root = document.getElementById('history-root');
    if (!root) return;
    const h = this.loadSeasonHistory(), esc = s => this.escape(String(s == null ? '' : s));
    const mine = e => e.championId && e.championId === e.teamId;
    const cups = h.filter(mine).length;
    const places = h.map(e => e.place).filter(x => x > 0);
    const pill = e => mine(e) ? '<span class="hs-pill gold">Чемпион</span>'
      : e.finalist && e.finalist === e.club ? '<span class="hs-pill cyan">Финалист</span>'
      : /Не вышел/.test(e.playoff || '') ? '<span class="hs-pill red">Без плей-офф</span>' : '<span class="hs-pill green">Плей-офф</span>';
    const ask = this._histAsk;
    const q = v => String(v).replace(/'/g, "\\'");
    const btn = (a, id, txt, cls) => `<button class="btn ${cls || ''}" type="button" onclick="app.seasonHistoryAction('${a}'${id ? `,'${q(id)}'` : ''})">${txt}</button>`;
    let out = `<div class="hs-top"><div><b>Всего</b><div class="small muted">${h.length ? `${h.length} в архиве · Кубков Гагарина: ${cups}` : 'Архив пуст'}</div></div>${h.length ? btn('delall', '', 'Удалить все', 'danger') : ''}</div>`;
    if (ask === 'all') out += `<div class="hs-ask">Удалить все сезоны из истории? Вернуть их будет нельзя.${btn('allyes', '', 'Да, удалить все', 'danger')}${btn('no', '', 'Отмена')}</div>`;
    if (h.length) out += `<div class="hs-kpis"><div class="hs-kpi"><b>${h.length}</b><span>Сезонов</span></div><div class="hs-kpi"><b>${cups}</b><span>Кубков Гагарина</span></div><div class="hs-kpi"><b>${places.length ? Math.min(...places) : '—'}</b><span>Лучшее место</span></div><div class="hs-kpi"><b>${Math.max(...h.map(e => e.pts))}</b><span>Рекорд очков</span></div></div>`;
    out += '<div class="hs-list">';
    out += h.map(e => `<article class="hs-s ${mine(e) ? 'mine-cup' : ''}"><div class="hs-s-top"><h3>${esc(e.label)} · ${esc(e.club)}</h3>${pill(e)}</div>
      <div class="hs-facts"><div><i>Место в конференции</i><b>${e.place ? e.place + '-е' : '—'} · ${e.pts} очков</b></div><div><i>Игры</i><b>${e.w} В · ${e.l} П · ${e.otl} ПО/Б</b></div><div><i>Шайбы</i><b>${e.gf}:${e.ga}</b></div><div><i>Плей-офф</i><b>${esc(e.playoff || '—')}</b></div><div><i>Кубок Гагарина</i><b>${esc(e.champion || '—')}</b></div><div><i>Финалист</i><b>${esc(e.finalist || '—')}</b></div></div>
      ${ask === e.id ? `<div class="hs-ask">Удалить сезон ${esc(e.label)}?${btn('yes', e.id, 'Да, удалить', 'danger')}${btn('no', '', 'Отмена')}</div>` : `<div>${btn('del', e.id, 'Удалить сезон', 'danger')}</div>`}</article>`).join('');
    if (!h.length) out += '<div class="hs-empty">Архив пуст. Первая запись появится после финала Кубка Гагарина.</div>';
    root.innerHTML = out + '</div>';
  };

  // Экспорт: история идёт в файл вместе с сохранением; при загрузке и продолжении объединяется с браузерной.
  const _export = proto.exportSave;
  proto.exportSave = function () {
    let tmp = false;
    if (!this.state) { try { const raw = localStorage.getItem(this.storageKey); if (raw) { this.state = JSON.parse(raw); tmp = true; } } catch (e) {} }
    if (this.state) this.state.seasonHistory = this.loadSeasonHistory();
    try { return _export.apply(this, arguments); }
    finally { if (this.state) delete this.state.seasonHistory; if (tmp) this.state = null; }
  };
  const _repair = proto.repairSave;
  proto.repairSave = function () {
    const r = _repair.apply(this, arguments);
    if (this.state && Array.isArray(this.state.seasonHistory)) { this.mergeSeasonHistory(this.state.seasonHistory); delete this.state.seasonHistory; this.refreshHistoryButton(); }
    return r;
  };
  const _show = proto.showScreen;
  proto.showScreen = function (id) {
    ['screen-history'].forEach(x => { const el = document.getElementById(x); if (el) el.classList.toggle('hidden', x !== id); });
    const r = _show.apply(this, arguments);
    if (id === 'screen-menu') this.refreshHistoryButton();
    return r;
  };
  const _cont = proto.updateContinueButton;
  proto.updateContinueButton = function () { const r = _cont.apply(this, arguments); this.refreshHistoryButton(); return r; };

  const _render = proto.renderAll;
  proto.renderAll = function () {
    const r = _render.apply(this, arguments);
    if (this.state) this.recordSeasonHistory();
    return r;
  };
})();
