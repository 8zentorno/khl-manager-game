/* KHL Manager 9.11.0 — вкладка «Таблица»: переключатель Конференции / Дивизионы / Лига.
   «Лига» (общая таблица) появляется после последнего тура регулярного чемпионата. */
(function () {
  const proto = KHLManagerApp.prototype;
  const DIV_ORDER = ['Bobrov', 'Tarasov', 'Kharlamov', 'Chernyshev'];

  proto._stTab = 'conf';
  proto.setStandingsTab = function (tab) { this._stTab = tab; this.renderStandingsTabs(); };

  proto.divisionRows = function (div) {
    return this.db.teams.filter(t => t.div === div).map(t => ({ ...t, ...(this.state.standings[t.id] || {}) }))
      .sort((a, b) => (b.pts || 0) - (a.pts || 0) || (b.regw || 0) - (a.regw || 0) || (b.otw || 0) - (a.otw || 0) || (b.sow || 0) - (a.sow || 0) ||
        ((b.gf || 0) - (b.ga || 0)) - ((a.gf || 0) - (a.ga || 0)) || (b.gf || 0) - (a.gf || 0) || a.name.localeCompare(b.name, 'ru'));
  };

  proto.divisionTableHtml = function (rows) {
    const me = this.state.teamId, esc = s => this.escape(String(s));
    return `<div class="table-wrap standings-compact-wrap"><table class="data-table standings-compact"><thead><tr><th>#</th><th>Клуб</th><th class="numeric" title="Сыграно матчей">И</th><th class="numeric" title="Победы в основное время">В</th><th class="numeric" title="Победы в овертайме">ВО</th><th class="numeric" title="Победы по буллитам">ВБ</th><th class="numeric" title="Поражения в основное время">П</th><th class="numeric" title="Поражения в овертайме">ПО</th><th class="numeric" title="Поражения по буллитам">ПБ</th><th class="numeric" title="Забитые:пропущенные шайбы">Ш</th><th class="numeric">О</th></tr></thead><tbody>${rows.map((t, i) => `<tr class="${t.id === me ? 'user-row' : ''}"><td class="rank">${i + 1}</td><td class="team-cell">${esc(t.name)}${t.id === me ? ' ◀' : ''}</td><td class="numeric">${t.gp || 0}</td><td class="numeric">${t.regw || 0}</td><td class="numeric">${t.otw || 0}</td><td class="numeric">${t.sow || 0}</td><td class="numeric">${t.l || 0}</td><td class="numeric">${t.otl || 0}</td><td class="numeric">${t.sol || 0}</td><td class="numeric">${t.gf || 0}:${t.ga || 0}</td><td class="numeric"><b>${t.pts || 0}</b></td></tr>`).join('')}</tbody></table></div>`;
  };

  proto.renderDivisionStandings = function () {
    const root = document.getElementById('full-divisions'); if (!root || !this.state) return;
    const mine = (this.teamById(this.state.teamId) || {}).div;
    const divs = [...new Set(this.db.teams.map(t => t.div))].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : DIV_ORDER.indexOf(a) - DIV_ORDER.indexOf(b)));
    root.innerHTML = divs.map(d => {
      return `<div class="card"><h3 class="st-dh">Дивизион ${this.escape(this.divisionName(d))}</h3>${this.divisionTableHtml(this.divisionRows(d))}</div>`;
    }).join('');
  };

  proto.renderStandingsTabs = function () {
    const conf = document.getElementById('st-pane-conf'), div = document.getElementById('full-divisions'),
      all = document.getElementById('overall-standings-section'), seg = document.getElementById('st-seg');
    if (!conf || !div || !seg || !this.state) return;
    const complete = this.regularSeasonComplete();
    if (this._stTab === 'all' && !complete) this._stTab = 'conf';
    const tab = this._stTab;
    conf.hidden = tab !== 'conf'; div.hidden = tab !== 'div';
    if (all) all.hidden = !(complete && tab === 'all');
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === tab);
      if (b.dataset.tab === 'all') b.hidden = !complete;
    });
    if (tab === 'div') this.renderDivisionStandings();
  };

  const _rs = proto.renderStandings;
  proto.renderStandings = function () { _rs.call(this); this.renderStandingsTabs(); };
})();
