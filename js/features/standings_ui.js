/* KHL Manager 9.29.0 — «Турнирная таблица»: очки всегда на виду, строка раскрывается (ВО, ВБ, ПО, ПБ, шайбы, форма),
   на телефоне переключатель «Запад / Восток», на широком экране обе конференции рядом. Расчёт таблицы прежний. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const esc = (app, s) => app.escape(String(s));

  /* форма: последние 5 матчей регулярки, w — победа (в т.ч. ОТ/буллиты), o — поражение в ОТ/по буллитам, l — поражение */
  proto.stxFormMap = function () {
    const ms = (this.state.matches || []).filter(m => m.played && !m.cancelled && !m.playoff);
    const key = ms.length + ':' + (ms[ms.length - 1] ? ms[ms.length - 1].id : '');
    if (this._stxForm && this._stxForm.key === key && this._stxForm.s === this.state) return this._stxForm.map;
    const map = {};
    ms.slice().sort((a, b) => a.dateOffset - b.dateOffset || String(a.id).localeCompare(String(b.id))).forEach(m => {
      for (const side of ['home', 'away']) {
        const tid = m[side + 'Id'], mine = side === 'home' ? m.homeScore : m.awayScore, opp = side === 'home' ? m.awayScore : m.homeScore;
        (map[tid] = map[tid] || []).push(mine > opp ? 'w' : (m.ot || m.so) ? 'o' : 'l');
      }
    });
    this._stxForm = { key, s: this.state, map };
    return map;
  };
  const dots = arr => (arr || []).slice(-5).map(c => `<i class="stx-dot ${c}" title="${c === 'w' ? 'победа' : c === 'o' ? 'поражение в ОТ/по буллитам' : 'поражение'}"></i>`).join('') || '<span class="muted">—</span>';

  proto.stxTableHtml = function (rows, o = {}) {
    const me = this.state.teamId, form = this.stxFormMap();
    const th = (l, t, c) => `<th class="${c === 'c' ? 'c' : 'n'} ${c || ''}"${t ? ` title="${t}"` : ''}>${l}</th>`;
    const head = `<tr><th class="stx-rk">#</th><th>Клуб</th>${th('И', 'Сыграно матчей')}${th('В', 'Победы в основное время')}${th('ВО', 'Победы в овертайме', 'stx-wide')}${th('ВБ', 'Победы по буллитам', 'stx-wide')}`
      + `${th('П', 'Поражения в основное время')}${th('ПО', 'Поражения в овертайме', 'stx-wide')}${th('ПБ', 'Поражения по буллитам', 'stx-wide')}${th('Ш', 'Забитые:пропущенные шайбы', 'c stx-wide')}${th('+/−', 'Разница шайб', 'c')}`
      + `<th class="stx-wide stx-formh">Форма</th>${th('О', 'Очки')}</tr>`;
    const body = rows.map((t, i) => {
      const mine = t.id === me, cut = o.cut && i === o.cut - 1;
      const f = dots(form[t.id]);
      const sc = `${t.gf || 0}:${t.ga || 0}`, gd = (t.gf || 0) - (t.ga || 0), gdh = `<span class="${gd > 0 ? 'stx-pos' : gd < 0 ? 'stx-neg' : ''}">${gd > 0 ? '+' + gd : gd < 0 ? '−' + Math.abs(gd) : '0'}</span>`;
      return `<tr class="stx-row${mine ? ' user-row' : ''}${cut ? ' po-cut' : ''}" tabindex="0" onclick="app.stxToggle(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.stxToggle(this)}" aria-expanded="false">`
        + `<td class="stx-rk">${i + 1}</td><td class="team-cell">${esc(this, t.name)}${mine ? ' ◀' : ''}</td><td class="n">${t.gp || 0}</td>`
        + `<td class="n">${t.regw || 0}</td><td class="n stx-wide">${t.otw || 0}</td><td class="n stx-wide">${t.sow || 0}</td>`
        + `<td class="n">${t.l || 0}</td><td class="n stx-wide">${t.otl || 0}</td><td class="n stx-wide">${t.sol || 0}</td><td class="c stx-wide">${sc}</td><td class="c">${gdh}</td>`
        + `<td class="stx-wide stx-formc">${f}</td><td class="n"><b>${t.pts || 0}</b></td></tr>`
        + `<tr class="stx-more${mine ? ' user-row' : ''}" hidden><td></td><td colspan="5" class="stx-det">ВО ${t.otw || 0} · ВБ ${t.sow || 0} · ПО ${t.otl || 0} · ПБ ${t.sol || 0}<br>Шайбы ${sc} · Форма ${f}</td></tr>`;
    }).join('');
    return `<div class="stx-wrap"><table class="stx-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  };
  proto.stxToggle = function (tr) {
    const more = tr && tr.nextElementSibling; if (!more || !more.classList.contains('stx-more')) return;
    more.hidden = !more.hidden; tr.setAttribute('aria-expanded', String(!more.hidden));
  };

  proto.stxGapHtml = function (rows) {
    const i = rows.findIndex(t => t.id === this.state.teamId); if (i < 0 || rows.length < 9) return '';
    const mine = rows[i].pts || 0;
    const txt = i < 8 ? `В зоне плей-офф: запас над 9-м местом ${mine - (rows[8].pts || 0)} ${this.stxPts(mine - (rows[8].pts || 0))}` : `До 8-го места ${(rows[7].pts || 0) - mine} ${this.stxPts((rows[7].pts || 0) - mine)}`;
    return `<p class="stx-gap small muted">${txt}</p>`;
  };
  proto.stxPts = function (n) { const a = Math.abs(n), m10 = a % 10, m100 = a % 100; return m100 >= 11 && m100 <= 14 ? 'очков' : m10 === 1 ? 'очко' : m10 >= 2 && m10 <= 4 ? 'очка' : 'очков'; };

  /* таблица конференции: полная версия — новая, мини-версия на «Обзоре» — прежняя */
  const baseTable = proto.standingsTable;
  proto.standingsTable = function (conf, preview) {
    if (preview) return baseTable.apply(this, arguments);
    const rows = this.standingsFor(conf);
    const mineConf = (this.teamById(this.state.teamId) || {}).conf;
    return this.stxTableHtml(rows, { cut: 8 });
  };
  proto.divisionTableHtml = function (rows) { return this.stxTableHtml(rows, {}); };

  /* переключатель «Запад / Восток» (виден на телефоне) */
  proto.stxConfSet = function (c) { this._stxConf = c; this.stxSyncConf(); };
  proto.stxSyncConf = function () {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const pane = document.getElementById('st-pane-conf'); if (!pane || !pane.querySelectorAll || !this.state) return;
    if (!this._stxConf) { const c = (this.teamById(this.state.teamId) || {}).conf; this._stxConf = c ? c.toLowerCase() : 'west'; }
    const cards = pane.querySelectorAll(':scope > .card');
    cards.forEach((card, i) => card.classList.toggle('stx-off', (i === 0 ? 'west' : 'east') !== this._stxConf));
    pane.querySelectorAll('.stx-confseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === this._stxConf)));
  };
  const baseTabs = proto.renderStandingsTabs;
  proto.renderStandingsTabs = function () {
    const r = baseTabs ? baseTabs.apply(this, arguments) : undefined;
    try {
      if (typeof document === 'undefined' || !document.getElementById) return r;
      const pane = document.getElementById('st-pane-conf');
      if (pane && pane.querySelector && !pane.querySelector('.stx-confseg') && pane.insertAdjacentHTML) {
        pane.insertAdjacentHTML('afterbegin', '<div class="stx-confseg" role="group" aria-label="Конференция"><button type="button" data-c="west" onclick="app.stxConfSet(\'west\')">Запад</button><button type="button" data-c="east" onclick="app.stxConfSet(\'east\')">Восток</button></div>');
      }
      this.stxSyncConf();
    } catch (e) { console.warn('KHL Manager 9.29 standings:', e); }
    return r;
  };
})();
