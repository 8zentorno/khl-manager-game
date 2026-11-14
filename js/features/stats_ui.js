/* KHL Manager 9.28.0 — вкладка «Статистика»: один блок с переключателем (Бомбардиры / Снайперы / Ассистенты / Вратари),
   фильтры «Вся лига / Мой клуб / Моя конференция» и по позиции, компактные строки (позиция и клуб под фамилией),
   статистика своего клуба с переключателем «Всего / Регулярка / Кубок Гагарина». Расчёт цифр прежний. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const LIMIT = 15;
  const TABS = [['b', 'Бомбардиры'], ['s', 'Снайперы'], ['a', 'Ассистенты'], ['g', 'Вратари']];
  const SCOPES = [['all', 'Вся лига'], ['club', 'Мой клуб'], ['conf', 'Моя конференция']];
  const POS = [['all', 'Все'], ['f', 'Нападающие'], ['d', 'Защитники']];
  const PERIODS = [['all', 'Всего'], ['reg', 'Регулярка'], ['cup', 'Кубок Гагарина']];
  const POSORD = { LW: 0, C: 1, RW: 2, D: 3, G: 4 };
  const st = () => (this_ui = proto._stUi || (proto._stUi = { tab: 'b', scope: 'all', pos: 'all', per: 'all' }));
  let this_ui;
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m100 >= 11 && m100 <= 14 ? c : m10 === 1 ? a : m10 >= 2 && m10 <= 4 ? b : c; };
  const short = n => { const s = String(n || ''); return s.length > 14 ? s.replace(/^(\S+)\s+(\S+).*$/, '$1') : s; };

  const sortBtn = (label, type) => `<button type="button" class="stats-sort-trigger" data-label="${label}" data-sort-type="${type}" onclick="app.sortStatsTable(this)" aria-label="Сортировать по столбцу ${label}">${label} <span aria-hidden="true">↕</span></button>`;
  const th = (label, o = {}) => `<th class="${o.num ? 'numeric ' : ''}${o.cls || ''}">${o.nosort ? label : sortBtn(label, o.type || (o.num ? 'num' : 'text'))}</th>`;
  const seg = (items, cur, fn) => items.map(([k, l]) => `<button type="button" aria-pressed="${k === cur}" onclick="app.${fn}('${k}')">${l}</button>`).join('');

  proto.statsSet = function (key, val) { const u = st(); u[key] = val; this.renderStatsBoard(); this.renderStatsClub(); };
  proto.statsTab = function (v) { this.statsSet('tab', v); };
  proto.statsScope = function (v) { this.statsSet('scope', v); };
  proto.statsPos = function (v) { this.statsSet('pos', v); };
  proto.statsPeriod = function (v) { this.statsSet('per', v); };

  function leaguePlayers(app) {
    const S = app.state, out = [];
    for (const p of app.db.players) {
      const r = S.playerStats?.[p.id] || {}, q = S.playoff?.playerStats?.[p.id] || {};
      const sum = k => Number(r[k] || 0) + Number(q[k] || 0);
      out.push({ p, gp: sum('gp'), g: sum('g'), a: sum('a'), pts: sum('pts'), gGP: sum('goalieGP'), saves: sum('goalieSaves'), shots: sum('goalieShots'), ga: sum('goalieGA'), so: sum('shutouts') });
    }
    return out;
  }

  proto.renderStatsBoard = function () {
    const host = typeof document !== 'undefined' && document.getElementById('stats-board');
    if (!host || !this.state) return;
    const u = st(), me = this.teamById(this.state.teamId), esc = s => this.escape(String(s));
    const isG = u.tab === 'g';
    let rows = leaguePlayers(this).filter(x => isG ? x.p.pos === 'G' : x.p.pos !== 'G');
    const inScope = x => u.scope === 'club' ? x.p.teamId === me.id : u.scope === 'conf' ? (this.teamById(x.p.teamId) || {}).conf === me.conf : true;
    const inPos = x => isG || u.pos === 'all' ? true : u.pos === 'f' ? x.p.pos !== 'D' : x.p.pos === 'D';
    const minG = this.goalieQualifyGames();
    rows = rows.filter(x => isG ? x.gGP >= minG && x.gGP > 0 : x.gp > 0).filter(inScope).filter(inPos);
    const byName = (a, b) => a.p.name.localeCompare(b.p.name, 'ru');
    if (isG) rows.forEach(x => { x.sv = x.saves / Math.max(1, x.shots); });
    const sorters = {
      b: (a, b) => b.pts - a.pts || b.g - a.g || b.a - a.a || byName(a, b), s: (a, b) => b.g - a.g || b.pts - a.pts || byName(a, b),
      a: (a, b) => b.a - a.a || b.pts - a.pts || byName(a, b), g: (a, b) => b.sv - a.sv || b.gGP - a.gGP || byName(a, b)
    };
    rows.sort(sorters[u.tab]);
    const top = rows.slice(0, LIMIT);
    const tName = x => `<span data-cl="${esc(x.p.teamId)}">${esc(short((this.teamById(x.p.teamId) || {}).name))}</span>`;
    const nameCell = x => `<td class="team-cell st-name"><b data-pl="${esc(x.p.id)}">${esc(x.p.name)}</b><span class="st-sub">${isG ? '' : esc(this.positionLabel(x.p.pos)) + ' · '}${tName(x)}</span></td>`;
    const cls = x => (x.p.teamId === this.state.teamId ? 'user-row' : '');
    let head, body;
    if (u.tab === 'b') {
      head = `<tr><th>#</th>${th('Игрок', { cls: 'st-name' })}${th('Г+П', { num: 1 })}${th('Г', { num: 1 })}${th('П', { num: 1 })}${th('И', { num: 1 })}</tr>`;
      body = top.map((x, i) => `<tr class="${cls(x)}"><td>${i + 1}</td>${nameCell(x)}<td class="numeric"><b>${x.pts}</b></td><td class="numeric">${x.g}</td><td class="numeric">${x.a}</td><td class="numeric">${x.gp}</td></tr>`).join('');
    } else if (u.tab === 's' || u.tab === 'a') {
      const k = u.tab === 's' ? 'g' : 'a', lab = u.tab === 's' ? 'Г' : 'П';
      head = `<tr><th>#</th>${th('Игрок', { cls: 'st-name' })}${th(lab, { num: 1 })}${th('Г+П', { num: 1 })}${th('И', { num: 1 })}</tr>`;
      body = top.map((x, i) => `<tr class="${cls(x)}"><td>${i + 1}</td>${nameCell(x)}<td class="numeric"><b>${x[k]}</b></td><td class="numeric">${x.pts}</td><td class="numeric">${x.gp}</td></tr>`).join('');
    } else {
      head = `<tr><th>#</th>${th('Вратарь', { cls: 'st-name' })}${th('И', { num: 1 })}${th('Сэйвы', { num: 1, cls: 'hide-sm' })}${th('% отраж.', { num: 1 })}${th('ПШ', { num: 1, cls: 'hide-sm' })}${th('КН', { num: 1 })}${th('СМ', { num: 1 })}</tr>`;
      body = top.map((x, i) => `<tr class="${cls(x)}"><td>${i + 1}</td>${nameCell(x)}<td class="numeric">${x.gGP}</td><td class="numeric hide-sm">${x.saves}</td><td class="numeric"><b>${(x.sv * 100).toFixed(1)}%</b></td><td class="numeric hide-sm">${x.ga}</td><td class="numeric">${(x.ga / Math.max(1, x.gGP)).toFixed(2).replace('.', ',')}</td><td class="numeric">${x.so}</td></tr>`).join('');
    }
    let tip = '';
    if (u.scope !== 'club' && rows.length) {
      const i = rows.findIndex(x => x.p.teamId === this.state.teamId);
      if (i >= LIMIT) {
        const x = rows[i], val = isG ? (x.sv * 100).toFixed(1) + '% отражённых' : u.tab === 'b' ? `${x.pts} ${plural(x.pts, 'очко', 'очка', 'очков')}` : u.tab === 's' ? `${x.g} ${plural(x.g, 'гол', 'гола', 'голов')}` : `${x.a} ${plural(x.a, 'передача', 'передачи', 'передач')}`;
        tip = `<div class="st-you">Лучший из вашего клуба: <b>${esc(x.p.name)}, ${i + 1}-е место, ${val}</b></div>`;
      }
    }
    const note = isG ? `<div class="st-note"><b>Вратари ранжированы по проценту отражённых бросков.</b><br><b>КН</b> — коэффициент надёжности: сколько шайб в среднем пропускает вратарь за матч, чем меньше, тем лучше. <b>СМ</b> — «сухие» матчи, в которых вратарь не пропустил ни одной шайбы.</div>` : '';
    host.innerHTML = `<div class="sx-seg" role="group" aria-label="Рейтинг">${seg(TABS, u.tab, 'statsTab')}</div>`
      + `<div class="st-filters"><div class="sx-chips" role="group" aria-label="Кого показывать">${seg(SCOPES, u.scope, 'statsScope')}</div>${isG ? '' : `<div class="sx-chips" role="group" aria-label="Позиция">${seg(POS, u.pos, 'statsPos')}</div>`}</div>`
      + (top.length ? `<div class="table-wrap"><table class="data-table sortable-stats-table st-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>` : '<div class="empty">В этом фильтре пока никого нет.</div>')
      + tip + note;
  };

  proto.renderStatsClub = function () {
    const host = typeof document !== 'undefined' && document.getElementById('team-stats');
    if (!host || !this.state) return;
    const u = st(), S = this.state, teamId = S.initialTeamId || S.teamId, esc = s => this.escape(String(s));
    const list = this.db.players.filter(p => p.teamId === teamId).map(p => ({ p, r: S.playerStats?.[p.id] || {}, q: S.playoff?.playerStats?.[p.id] || {} }));
    const pick = (x, k) => { const r = Number(x.r[k] || 0), q = Number(x.q[k] || 0); return u.per === 'reg' ? r : u.per === 'cup' ? q : r + q; };
    const pct = (s, sh) => (sh ? (s / sh * 100).toFixed(1) + '%' : '—');
    const sk = list.filter(x => x.p.pos !== 'G').sort((a, b) => pick(b, 'pts') - pick(a, 'pts') || pick(b, 'g') - pick(a, 'g') || a.p.name.localeCompare(b.p.name, 'ru'));
    const gk = list.filter(x => x.p.pos === 'G').sort((a, b) => pick(b, 'goalieGP') - pick(a, 'goalieGP'));
    const pm = v => (v > 0 ? '+' + v : String(v));
    const skHead = `<tr>${th('Игрок', { cls: 'st-name' })}${th('И', { num: 1 })}${th('Г', { num: 1 })}${th('П', { num: 1 })}${th('О', { num: 1 })}</tr>`;
    const skBody = sk.map(x => `<tr><td class="team-cell st-name"><b data-pl="${esc(x.p.id)}">${esc(x.p.name)}</b><span class="st-sub">${esc(this.positionLabel(x.p.pos))}</span></td><td class="numeric">${pick(x, 'gp')}</td><td class="numeric">${pick(x, 'g')}</td><td class="numeric">${pick(x, 'a')}</td><td class="numeric"><b>${pick(x, 'pts')}</b></td></tr>`).join('');
    const gHead = `<tr>${th('Вратарь', { cls: 'st-name' })}${th('И', { num: 1 })}${th('Сэйвы', { num: 1, cls: 'hide-sm' })}${th('% отраж.', { num: 1 })}${th('ПШ', { num: 1, cls: 'hide-sm' })}${th('КН', { num: 1 })}${th('СМ', { num: 1 })}</tr>`;
    const gBody = gk.map(x => `<tr><td class="team-cell st-name"><b data-pl="${esc(x.p.id)}">${esc(x.p.name)}</b></td><td class="numeric">${pick(x, 'goalieGP')}</td><td class="numeric hide-sm">${pick(x, 'goalieSaves')}</td><td class="numeric"><b>${pct(pick(x, 'goalieSaves'), pick(x, 'goalieShots'))}</b></td><td class="numeric hide-sm">${pick(x, 'goalieGA')}</td><td class="numeric">${(pick(x, 'goalieGA') / Math.max(1, pick(x, 'goalieGP'))).toFixed(2).replace('.', ',')}</td><td class="numeric">${pick(x, 'shutouts')}</td></tr>`).join('');
    host.innerHTML = `<div class="sx-seg" role="group" aria-label="Период">${seg(PERIODS, u.per, 'statsPeriod')}</div>`
      + `<div class="table-wrap"><table class="data-table sortable-stats-table st-table" data-no-rank="1"><thead>${skHead}</thead><tbody>${skBody}</tbody></table></div>`
      + `<h3 class="st-h3">Вратари</h3>` + `<div class="st-note"><b>КН</b> — коэффициент надёжности: сколько шайб в среднем пропускает вратарь за матч, чем меньше, тем лучше. <b>СМ</b> — «сухие» матчи, в которых вратарь не пропустил ни одной шайбы.</div>` + (gk.length ? `<div class="table-wrap"><table class="data-table sortable-stats-table st-table" data-no-rank="1"><thead>${gHead}</thead><tbody>${gBody}</tbody></table></div>` : '<div class="empty">Вратари клуба не найдены.</div>');
  };

  const base = proto.renderStats;
  proto.renderStats = function () {
    const r = base.apply(this, arguments);
    try { this.renderStatsBoard(); this.renderStatsClub(); } catch (e) { console.warn('KHL Manager 9.28 stats:', e); }
    return r;
  };
})();
