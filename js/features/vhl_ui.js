/* KHL Manager 15.1.0 — интерфейс ВХЛ, вторая редакция:
 *  - отдельная вкладка «ВХЛ» в главной навигации (была подпунктом «Турнирной таблицы»): Таблица · Бомбардиры · Снайперы · Вратари · Плей-офф;
 *  - отдельная вкладка «Партнёры» со списком клубов-партнёров игрока (задел на переключатель лиг — ВХЛ сейчас, МХЛ позже);
 *  - страница клуба ВХЛ (из таблицы или «Партнёров»): Состав · Статистика (регулярка/плей-офф) · Управление (только для своих клубов —
 *    сюда переехал блок «Фарм-клуб» с «Финансов»);
 *  - страница игрока ВХЛ: био, статус, статистика по сезонам, подтягивание/защита для своих воспитанников;
 *  - имена клубов и игроков ВХЛ везде кликабельны (как в КХЛ), поиск их тоже находит (см. search.js).
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const esc = (app, s) => app.escape(String(s == null ? '' : s));
  const POSN = { G: 'вратарь', D: 'защитник', F: 'нападающий', LW: 'нападающий', C: 'нападающий', RW: 'нападающий' };
  const DIR_LABELS = { develop: 'Развитие — время молодым', result: 'Результат — за Кубок Петрова', transport: 'Транспорт — быстрая ротация' };
  /* короткая метка амплуа как в КХЛ (Ц/ЛН/ПН/З/В) вместо общей буквы F/Н.
   * у синтетических проспектов ВХЛ в базе нет разбивки на Ц/ЛН/ПН (только общее pos:'F') —
   * подбираем её детерминированно по id игрока, чтобы метка не «плавала» между перерисовками;
   * у командированных из КХЛ игроков амплуа настоящее (LW/C/RW) и просто проходит через positionLabel. */
  const FORWARD_SUB = ['ЛН', 'Ц', 'ПН'];
  proto.vPosLabel = function (p) {
    if (!p) return '—';
    if (p.pos === 'D') return 'З';
    if (p.pos === 'G') return 'В';
    if (p.pos === 'LW' || p.pos === 'C' || p.pos === 'RW') return this.positionLabel ? this.positionLabel(p.pos) : p.pos;
    let h = 0; const s = String(p.id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return FORWARD_SUB[h % 3];
  };

  /* ---------- показ/скрытие пунктов навигации ---------- */
  proto.vhlNavSync = function () {
    const on = this.vhlAvailable();
    const b = document.getElementById('nav-vhl'); if (b) b.hidden = !on;
  };
  const baseAllNav = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAllNav.apply(this, arguments);
    try { this.vhlNavSync(); } catch (e) { }
    return r;
  };

  /* ---------- общие помощники ---------- */
  proto.vhlMineIds = function () {
    const ids = new Set();
    if (!this.state) return ids;
    const myFarms = new Set(this.vhlFarmsOf(this.state.teamId).map(t => t.id));
    for (const p of (this.vhlAvailable() ? VHL_DATABASE.players : [])) if (myFarms.has(this.vhlEffectiveClubId(p))) ids.add(p.id);
    if (this.state.farm) for (const [pid, e] of Object.entries(this.state.farm)) { if (e && myFarms.has(e.clubId)) ids.add(pid); }
    return ids;
  };
  proto.vhlParentShort = function (t) { const parent = t.parentId ? this.teamById(t.parentId) : null; return parent ? this.shortName(parent.name) : ''; };
  /* цвета формы клубов ВХЛ (для календаря и бейджей) — настоящие цвета клуба через тот же kitFor, что и у КХЛ
   * (см. team_colors.js); если для клуба цвет почему-то не задан, kitFor сам подставит нейтральный цвет. */
  proto.vClubKit = function (id) { return this.kitFor(id, true); };
  proto.vClubAbbr = function (id) { const t = this.vhlTeamById(id); return t ? String(t.name).replace(/[^А-ЯЁа-яё]/g, '').slice(0, 3).toUpperCase() : '???'; };
  proto.vClubLink = function (id, text) { const t = this.vhlTeamById(id); return t ? `<span class="nm" data-vcl="${esc(this, id)}">${esc(this, text || t.name)}</span>` : esc(this, text || id); };
  proto.vPlayerLink = function (id, text) { const p = this.vhlPlayerById(id); return `<span class="nm" data-vpl="${esc(this, id)}">${esc(this, text || (p ? p.name : id))}</span>`; };
  proto.vhlClubOf = function (pid) {
    const p = this.vhlPlayerById(pid); if (!p) return null;
    if (String(pid).startsWith('v_')) return this.vhlTeamById(this.vhlEffectiveClubId(p));
    const v = this.vhlState(); const e = this.state.farm && this.state.farm[pid]; const ae = v && v.aiFarm[pid];
    return this.vhlTeamById((e && e.clubId) || (ae && ae.clubId)) || null;
  };

  /* ================= вкладка «ВХЛ» ================= */
  const SUBTABS = [['table', 'Таблица'], ['scorers', 'Бомбардиры'], ['snipers', 'Снайперы'], ['assists', 'Ассистенты'], ['goalies', 'Вратари'], ['playoff', 'Плей-офф'], ['free', 'Свободные агенты']];
  const vhlSortBtn = (label, type) => `<button type="button" class="stats-sort-trigger" data-label="${label}" data-sort-type="${type}" onclick="app.sortStatsTable(this)" aria-label="Сортировать по столбцу ${label}">${label} <span aria-hidden="true">↕</span></button>`;
  const vhlTh = (label, o = {}) => `<th class="${o.num ? 'numeric ' : ''}${o.cls || ''}">${o.nosort ? label : vhlSortBtn(label, o.type || (o.num ? 'num' : 'text'))}</th>`;
  proto.vhlSetSub = function (tab) { this._vhlSub = tab; this.renderVhlHome(); };
  proto.renderVhlHome = function () {
    const host = document.getElementById('view-vhl'); if (!host || !this.state) return;
    if (!this.vhlAvailable()) { host.innerHTML = '<div class="card"><p class="muted">ВХЛ недоступна в этом сохранении.</p></div>'; return; }
    const sub = SUBTABS.some(x => x[0] === this._vhlSub) ? this._vhlSub : 'table';
    const bar = `<div class="st-seg-wrap"><div class="st-seg" role="tablist">${SUBTABS.map(([k, l]) => `<button type="button" class="${sub === k ? 'on' : ''}" data-vhl-sub="${k}">${l}</button>`).join('')}</div></div>`;
    let body = '';
    if (sub === 'table') body = this.vhlStandingsHtml();
    else if (sub === 'scorers') body = this.vhlScorersHtml('pts');
    else if (sub === 'snipers') body = this.vhlScorersHtml('g');
    else if (sub === 'assists') body = this.vhlScorersHtml('a');
    else if (sub === 'goalies') body = this.vhlGoaliesHtml();
    else if (sub === 'free') body = this.vhlFreeAgentsHtml();
    else body = this.vhlPlayoffHtml();
    host.innerHTML = `<div class="section-head"><div><h2>Высшая хоккейная лига</h2></div></div>${bar}${body}`;
    if (!host._vhlBound) {
      host._vhlBound = true;
      host.addEventListener('click', ev => {
        const b = ev.target.closest('[data-vhl-sub]'); if (b) { ev.preventDefault(); this.vhlSetSub(b.getAttribute('data-vhl-sub')); return; }
        const s = ev.target.closest('[data-vfree-sign]'); if (s) { ev.preventDefault(); this.vhlSignIndependentProspect(s.getAttribute('data-vfree-sign')); this.renderVhlHome(); return; }
        // 15.14.2: счёт игры плей-офф (вкладка «Плей-офф») — открывает матч-центр; эта вкладка рисуется
        // вне карточки клуба/игрока (app._vcard), поэтому общий document-level обработчик data-vcd её не ловит.
        const g = ev.target.closest('[data-vcd^="vmc:"]'); if (g) { ev.preventDefault(); this.vhlMcOpen(g.getAttribute('data-vcd').slice(4)); }
      });
      host.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const g = ev.target.closest('[data-vcd^="vmc:"]'); if (g) { ev.preventDefault(); this.vhlMcOpen(g.getAttribute('data-vcd').slice(4)); }
      });
    }
  };
  // 15.9.0: свободные агенты ВХЛ — игроки без клуба (контракт истёк, прежний клуб не продлил); подписываются
  // клубом КХЛ без компенсации через ту же vhlSignIndependentProspect (она сама различает свободных и контрактных).
  proto.vhlFreeAgentsHtml = function () {
    const agents = (this.vhlFreeAgents ? this.vhlFreeAgents() : []).slice().sort((a, b) => this.vhlPlayerOvr(b) - this.vhlPlayerOvr(a));
    if (!agents.length) return '<div class="card"><p class="muted">Сейчас в ВХЛ нет свободных агентов — все игроки под контрактом своих клубов.</p></div>';
    const rows = agents.map(p => `<div class="rowline-vhl"><div><b>${this.vPlayerLink(p.id, p.name)}</b> <span class="tiny muted">${POSN[p.pos] || ''} · ${this.vhlPlayerAge(p)} лет · OVR ~${Math.round(this.vhlPlayerOvr(p))}</span></div><div><button class="fin-act" data-vfree-sign="${esc(this, p.id)}">Подписать</button></div></div>`).join('');
    return `<div class="card"><h3 class="st-dh">Свободные агенты ВХЛ</h3><p class="muted small">Контракт истёк, прежний клуб не продлил — права сейчас ни у кого. Подписываются клубом КХЛ без компенсации, обычным контрактом.</p>${rows}</div>`;
  };
  /* форма ВХЛ: последние 5 матчей (используем r.form, уже посчитанный в vhlStandings) */
  const vhlDots = arr => (arr || []).slice(-5).map(c => `<i class="stx-dot ${c}" title="${c === 'w' ? 'победа' : c === 'o' ? 'поражение в ОТ/по буллитам' : 'поражение'}"></i>`).join('') || '<span class="muted">—</span>';
  proto.vhlStandingsHtml = function () {
    const rows = this.vhlStandings();
    const myFarms = new Set(this.vhlFarmsOf(this.state.teamId).map(t => t.id));
    const head = `<tr><th class="stx-rk">#</th><th>Клуб</th><th class="n" title="Сыграно матчей">И</th><th class="n" title="Победы в основное время">В</th><th class="n stx-wide" title="Победы в овертайме">ВО</th><th class="n stx-wide" title="Победы по буллитам">ВБ</th>`
      + `<th class="n" title="Поражения в основное время">П</th><th class="n stx-wide" title="Поражения в овертайме">ПО</th><th class="n stx-wide" title="Поражения по буллитам">ПБ</th><th class="c stx-wide" title="Забитые:пропущенные шайбы">Ш</th><th class="c" title="Разница шайб">+/−</th>`
      + `<th class="stx-wide stx-formh">Форма</th><th class="n" title="Очки">О</th></tr>`;
    const body = rows.map((t, i) => {
      const mine = myFarms.has(t.id), cut = i === 15;
      const f = vhlDots(t.form);
      const sc = `${t.gf || 0}:${t.ga || 0}`, gd = (t.gf || 0) - (t.ga || 0), gdh = `<span class="${gd > 0 ? 'stx-pos' : gd < 0 ? 'stx-neg' : ''}">${gd > 0 ? '+' + gd : gd < 0 ? '−' + Math.abs(gd) : '0'}</span>`;
      return `<tr class="stx-row${mine ? ' user-row vhl-mine' : ''}${cut ? ' po-cut' : ''}" tabindex="0" onclick="app.stxToggle(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.stxToggle(this)}" aria-expanded="false">`
        + `<td class="stx-rk">${i + 1}</td><td class="team-cell"><b>${this.vClubLink(t.id, t.name)}</b></td><td class="n">${t.gp || 0}</td>`
        + `<td class="n">${t.regw || 0}</td><td class="n stx-wide">${t.otwSplit || 0}</td><td class="n stx-wide">${t.sow || 0}</td>`
        + `<td class="n">${t.l || 0}</td><td class="n stx-wide">${t.otlSplit || 0}</td><td class="n stx-wide">${t.sol || 0}</td><td class="c stx-wide">${sc}</td><td class="c">${gdh}</td>`
        + `<td class="stx-wide stx-formc">${f}</td><td class="n"><b>${t.pts || 0}</b></td></tr>`
        + `<tr class="stx-more${mine ? ' user-row' : ''}" hidden><td></td><td colspan="5" class="stx-det">ВО ${t.otwSplit || 0} · ВБ ${t.sow || 0} · ПО ${t.otlSplit || 0} · ПБ ${t.sol || 0}<br>Шайбы ${sc} · Форма ${f}</td></tr>`;
    }).join('');
    return `<div class="card"><h3 class="st-dh">ВХЛ · регулярный чемпионат</h3><div class="stx-wrap"><table class="stx-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
  };
  proto.vhlScorersHtml = function (mode) {
    const v = this.vhlState(); if (!v) return '';
    const mineIds = this.vhlMineIds();
    // 15.14.2: бомбардиры/снайперы/ассистенты считались только по регулярке (v.ps) — очки и матчи
    // плей-офф (v.pops) не прибавлялись вовсе, в отличие от аналогичных таблиц КХЛ. Складываем оба
    // источника по каждому игроку (объединяем ключи — игрок мог успеть сыграть только плей-офф,
    // если дебютировал за клуб-партнёр прямо в кубке, что не бывает, но для надёжности не полагаемся
    // только на Object.keys(v.ps)).
    const ids = new Set([...Object.keys(v.ps), ...Object.keys(v.pops)]);
    let list = Array.from(ids).map(id => {
      const s = v.ps[id] || [0, 0, 0], po = v.pops[id] || [0, 0, 0];
      return { id, gp: s[0] + po[0], g: s[1] + po[1], a: s[2] + po[2], pts: s[1] + s[2] + po[1] + po[2] };
    });
    const sorters = { pts: (a, b) => b.pts - a.pts || b.g - a.g || b.a - a.a, g: (a, b) => b.g - a.g || b.pts - a.pts, a: (a, b) => b.a - a.a || b.pts - a.pts };
    list.sort(sorters[mode] || sorters.pts);
    list = list.slice(0, 20);
    if (!list.length) return '<div class="card"><p class="muted">Статистики пока нет — сыграйте несколько дней.</p></div>';
    const title = mode === 'g' ? 'Снайперы ВХЛ' : mode === 'a' ? 'Ассистенты ВХЛ' : 'Бомбардиры ВХЛ';
    const nameCell = (p, mine) => `<td class="team-cell st-name"><b>${this.vPlayerLink(p.id)}</b>${mine ? ' <span class="vhl-tag">ваш</span>' : ''}<span class="st-sub">${esc(this, this.vPosLabel(this.vhlPlayerById(p.id)))} · ${(() => { const club = this.vhlClubOf(p.id); return club ? this.vClubLink(club.id, club.name) : '—'; })()}</span></td>`;
    let head, body;
    if (mode === 'pts') {
      head = `<tr><th>#</th>${vhlTh('Игрок', { cls: 'st-name' })}${vhlTh('Г+П', { num: 1 })}${vhlTh('Г', { num: 1 })}${vhlTh('П', { num: 1 })}${vhlTh('И', { num: 1 })}</tr>`;
      body = list.map((x, i) => `<tr class="${mineIds.has(x.id) ? 'vhl-mine' : ''}"><td>${i + 1}</td>${nameCell(x, mineIds.has(x.id))}<td class="numeric"><b>${x.pts}</b></td><td class="numeric">${x.g}</td><td class="numeric">${x.a}</td><td class="numeric">${x.gp}</td></tr>`).join('');
    } else {
      const k = mode === 'g' ? 'g' : 'a', lab = mode === 'g' ? 'Г' : 'П';
      head = `<tr><th>#</th>${vhlTh('Игрок', { cls: 'st-name' })}${vhlTh(lab, { num: 1 })}${vhlTh('Г+П', { num: 1 })}${vhlTh('И', { num: 1 })}</tr>`;
      body = list.map((x, i) => `<tr class="${mineIds.has(x.id) ? 'vhl-mine' : ''}"><td>${i + 1}</td>${nameCell(x, mineIds.has(x.id))}<td class="numeric"><b>${x[k]}</b></td><td class="numeric">${x.pts}</td><td class="numeric">${x.gp}</td></tr>`).join('');
    }
    return `<div class="card"><h3 class="st-dh">${title}</h3><div class="table-wrap"><table class="data-table sortable-stats-table st-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
  };
  proto.vhlGoaliesHtml = function () {
    const v = this.vhlState(); if (!v) return '';
    const mineIds = this.vhlMineIds();
    // 15.14.2: та же проблема, что у полевых — вратарская статистика плей-офф (v.pogs) не прибавлялась
    // к регулярке (v.gs). Используем тот же помощник (vhlGoalieRead), что и vClubGkStat('all', ...).
    const ids = new Set([...Object.keys(v.gs), ...Object.keys(v.pogs)]);
    let list = Array.from(ids).map(id => {
      const a = this.vhlGoalieRead(v.gs, id), b = this.vhlGoalieRead(v.pogs, id);
      return { id, gp: a.gp + b.gp, w: a.w + b.w, ga: a.ga + b.ga, shots: a.shots + b.shots, so: a.so + b.so };
    }).filter(x => x.gp > 0);
    list.forEach(x => { x.sv = x.shots ? (x.shots - x.ga) / x.shots : 0; });
    list.sort((a, b) => b.sv - a.sv || b.gp - a.gp);
    list = list.slice(0, 20);
    if (!list.length) return '<div class="card"><p class="muted">Статистики вратарей пока нет.</p></div>';
    const nameCell = (x, mine) => `<td class="team-cell st-name"><b>${this.vPlayerLink(x.id)}</b>${mine ? ' <span class="vhl-tag">ваш</span>' : ''}<span class="st-sub">${(() => { const club = this.vhlClubOf(x.id); return club ? this.vClubLink(club.id, club.name) : '—'; })()}</span></td>`;
    const head = `<tr><th>#</th>${vhlTh('Вратарь', { cls: 'st-name' })}${vhlTh('И', { num: 1 })}${vhlTh('Сэйвы', { num: 1, cls: 'hide-sm' })}${vhlTh('% отраж.', { num: 1 })}${vhlTh('ПШ', { num: 1, cls: 'hide-sm' })}${vhlTh('КН', { num: 1 })}${vhlTh('СМ', { num: 1 })}</tr>`;
    const body = list.map((x, i) => `<tr class="${mineIds.has(x.id) ? 'vhl-mine' : ''}"><td>${i + 1}</td>${nameCell(x, mineIds.has(x.id))}<td class="numeric">${x.gp}</td><td class="numeric hide-sm">${x.shots - x.ga}</td><td class="numeric"><b>${(x.sv * 100).toFixed(1)}%</b></td><td class="numeric hide-sm">${x.ga}</td><td class="numeric">${(x.ga / Math.max(1, x.gp)).toFixed(2).replace('.', ',')}</td><td class="numeric">${x.so}</td></tr>`).join('');
    const note = `<div class="st-note"><b>Вратари ранжированы по проценту отражённых бросков.</b><br><b>КН</b> — коэффициент надёжности: сколько шайб в среднем пропускает вратарь за матч, чем меньше, тем лучше. <b>СМ</b> — «сухие» матчи, в которых вратарь не пропустил ни одной шайбы. Броски по воротам в ВХЛ — оценка, согласованная с пропущенными шайбами (подробный учёт бросков в этой лиге не ведётся).</div>`;
    return `<div class="card"><h3 class="st-dh">Вратари ВХЛ</h3><div class="table-wrap"><table class="data-table sortable-stats-table st-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>${note}</div>`;
  };
  proto.vhlSeriesTopScorer = function (s) {
    const mine = this.vhlMineIds();
    const entries = Object.entries(s.pstats || {}).filter(([pid]) => mine.has(pid));
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1][1] + b[1][2]) - (a[1][1] + a[1][2]));
    const [pid, st] = entries[0]; if (!(st[1] || st[2])) return null;
    return { id: pid, g: st[1], a: st[2] };
  };
  proto.vhlPlayoffHtml = function () {
    const v = this.vhlState(); if (!v || !v.po) return '<div class="card"><p class="muted">Плей-офф ВХЛ начнётся после окончания регулярного чемпионата (18 марта), сетка — 16 лучших команд.</p></div>';
    const myFarms = new Set(this.vhlFarmsOf(this.state.teamId).map(t => t.id));
    const rounds = v.po.rounds.map((round, ri) => {
      const items = round.series.map((s, si) => {
        const wHi = s.games.filter(g => g[0] > g[1]).length, wLo = s.games.filter(g => g[1] > g[0]).length;
        // 15.14.2: счёт каждой сыгранной игры серии — ссылка на матч-центр (как и счёт в регулярке),
        // без отдельной кнопки «Матч-центр».
        const scoreline = s.games.length
          ? s.games.map((g, gi) => `<span class="nm" data-vcd="vmc:po_${ri}_${si}_${gi}" role="button" tabindex="0" title="Открыть матч в матч-центре">${g[0]}:${g[1]}${g[2] ? 'от' : ''}</span>`).join(', ')
          : 'серия не началась';
        const mine = myFarms.has(s.hi) || myFarms.has(s.lo);
        const top = mine ? this.vhlSeriesTopScorer(s) : null;
        const topHtml = top ? `<div class="tiny muted">Лучший ваш игрок серии: ${this.vPlayerLink(top.id)} — ${top.g}Г+${top.a}П</div>` : '';
        return `<div class="vhl-series${mine ? ' vhl-mine' : ''}"><b>${this.vClubLink(s.hi)}</b> ${wHi}:${wLo} <b>${this.vClubLink(s.lo)}</b>${s.winner ? ` · <span class="badge green">дальше: ${this.vClubLink(s.winner)}</span>` : ''}<div class="tiny muted">${scoreline}</div>${topHtml}</div>`;
      }).join('');
      return `<h3 class="st-dh" style="margin-top:.6rem">${esc(this, this.vhlStageName(round.series.length))}</h3>${items}`;
    }).join('');
    const champ = v.po.champion ? `<div class="notice" style="margin-top:.6rem">🏆 Обладатель Кубка Петрова — ${this.vClubLink(v.po.champion)}${myFarms.has(v.po.champion) ? ' (ваш клуб-партнёр!)' : ''}.</div>` : '';
    return `<div class="card"><h3 class="st-dh">Плей-офф · Кубок Петрова</h3>${rounds}${champ}<p class="tiny muted" style="margin:.5rem 0 0">Счёт серии и даты игр — без полных протоколов; у серий с вашим клубом-партнёром показан лучший ваш бомбардир серии.</p></div>`;
  };

  /* ================= вкладка «Партнёры» ================= */
  /* ---------- блок «Клубы-партнёры» во вкладке «Развитие» (15.2.2: перенесён из отдельной вкладки «Партнёры») ---------- */
  const PARTNERS_KEY = 'khl.vhlPartnersCollapsed';
  proto.vhlPartnersToggle = function () {
    let c = false; try { c = localStorage.getItem(PARTNERS_KEY) === '1'; } catch (e) { }
    try { localStorage.setItem(PARTNERS_KEY, c ? '0' : '1'); } catch (e) { }
    this.renderDevPartnersBlock();
  };
  /* чистая функция — возвращает HTML блока (без обращения к DOM), чтобы её можно было проверить в тестах напрямую */
  proto.vhlPartnersBlockHtml = function () {
    if (!this.state || !this.vhlAvailable()) return '';
    let collapsed = false; try { collapsed = localStorage.getItem(PARTNERS_KEY) === '1'; } catch (e) { }
    const farms = this.vhlFarmsOf(this.state.teamId);
    const standings = this.vhlStandings();
    const primary = this.vhlPrimaryFarm(this.state.teamId);
    const cards = farms.length ? farms.map(f => {
      const i = standings.findIndex(r => r.id === f.id), r = standings[i] || { gp: 0, w: 0, otw: 0, l: 0, otl: 0, pts: 0 };
      const isPrimary = primary && primary.id === f.id;
      const primTag = farms.length > 1 ? (isPrimary ? ' <span class="vhl-tag gold">основной</span>' : ` <button type="button" class="fin-act" data-pfp="${esc(this, f.id)}">сделать основным</button>`) : '';
      return `<div class="card vhl-pcard" data-vcl="${esc(this, f.id)}" role="button" tabindex="0"><div class="vhl-pcard-h"><b>${esc(this, f.name)}</b>${primTag}</div><div class="tiny muted">${esc(this, f.city)} · тренер ${esc(this, f.coach || '—')}</div><div class="tiny muted" style="margin-top:.3rem">${i >= 0 ? `${i + 1}-е место в ВХЛ` : '—'} · ${r.gp} И · ${r.w + r.otw} В · ${r.l + r.otl} П · <b>${r.pts}</b> очков</div></div>`;
    }).join('') : '<div class="card"><p class="muted">У вашего клуба нет клуба-партнёра в ВХЛ в этом сезоне. Отправленные во вторую команду игроки числятся в ней условно.</p></div>';
    let dirBox = '';
    if (farms.length) {
      const v = this.vhlState(), adult = this.vhlAdultLoanCount(this.state.teamId);
      const dirTitle = (primary || farms[0]).name;
      const limit = this.vhlAdultLoanLimit(this.state.teamId), limitTxt = limit === Infinity ? '∞ (фарм — полный контроль клуба)' : limit;
      dirBox = `<div class="cd-box"><h4>Директива тренеру «${esc(this, dirTitle)}»</h4><div class="vhl-controls"><select data-pfd="vdirective">${Object.entries(DIR_LABELS).map(([k, l]) => `<option value="${k}" ${v.directive === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><p class="tiny muted" style="margin:.4rem 0 0">Директива общая для всех ваших клубов-партнёров. Командировано взрослых (22+): <b>${adult}</b>/${limitTxt}, лимит общий на всю фарм-систему (игроки до 21 года лимит не занимают).</p></div>`;
    }
    return `<button type="button" class="dv-sumhead" onclick="app.vhlPartnersToggle()" aria-expanded="${!collapsed}"><span class="eyebrow">Клубы-партнёры</span><span class="dv-arrow" style="transform:${collapsed ? 'none' : 'rotate(90deg)'}">›</span></button>`
      + (collapsed ? '' : `<p class="small muted" style="margin:.6rem 0 .8rem">Только ваши аффилированные клубы фарм-систем. Откройте клуб, чтобы увидеть состав и статистику.</p>
      <div class="st-seg-wrap"><div class="st-seg" role="tablist"><button type="button" class="on">ВХЛ</button><button type="button" disabled title="Появится позже">МХЛ — скоро</button></div></div>
      <div class="vhl-pgrid">${cards}</div>${dirBox}`);
  };
  proto.renderDevPartnersBlock = function () {
    const host = document.getElementById('development-partners'); if (!host) return;
    const html = this.vhlPartnersBlockHtml();
    if (!html) { host.innerHTML = ''; return; }
    host.className = 'card dv-sum';
    host.innerHTML = html;
    if (!host._vhlBound) {
      host._vhlBound = true;
      host.addEventListener('click', ev => {
        const pf = ev.target.closest('[data-pfp]');
        if (pf) { ev.preventDefault(); ev.stopPropagation(); this.vhlSetPrimaryFarm(pf.getAttribute('data-pfp')); this.renderDevPartnersBlock(); return; }
        const c = ev.target.closest('[data-vcl]'); if (c && !ev.target.closest('.nm')) { ev.preventDefault(); this.vOpenClubCard(c.getAttribute('data-vcl')); }
      });
      host.addEventListener('keydown', ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const c = ev.target.closest('[data-vcl]'); if (c) { ev.preventDefault(); this.vOpenClubCard(c.getAttribute('data-vcl')); } });
      host.addEventListener('change', ev => { if (ev.target && ev.target.matches('[data-pfd="vdirective"]')) { this.vhlSetDirective(ev.target.value); this.renderDevPartnersBlock(); } });
    }
  };

  /* ================= карточки ВХЛ (отдельный стек навигации — независим от карточек КХЛ) ================= */
  proto.vOpenClubCard = function (id) { this.vCardOpen({ t: 'vclub', id, tab: 'ov' }); };
  proto.vOpenPlayerCard = function (id) { this.vCardOpen({ t: 'vplayer', id, tab: 'ov', range: 'season' }); };
  proto.vCardOpen = function (entry) {
    if (!this.state) return;
    const cur = this._vcard;
    if (cur && document.querySelector('#view-' + cur.t + '.active')) { (this._vcardStack = this._vcardStack || []).push(cur); }
    else { this._vcardStack = []; const act = document.querySelector('.view.active'); this._vcardRoot = act ? act.id.replace(/^view-/, '') : 'vhl'; }
    this._vcard = entry;
    this.vCardShow();
  };
  proto.vCardShow = function () {
    const c = this._vcard; if (!c) return;
    this.switchTab(c.t);
    this.vCardRender();
    try { window.scrollTo(0, 0); } catch (e) { }
  };
  proto.vCardRender = function () {
    const c = this._vcard; if (!c || !this.state) return;
    const host = document.getElementById('view-' + c.t); if (!host) return;
    host.innerHTML = '<div class="cd-wrap">' + (c.t === 'vplayer' ? this.vPlayerCardHtml(c.id, c.tab, c.range) : this.vClubCardHtml(c.id, c.tab)) + '</div>';
  };
  proto.vCardBack = function () {
    const prev = (this._vcardStack || []).pop();
    if (prev) { this._vcard = prev; this.vCardShow(); return; }
    this._vcard = null; this.switchTab(this._vcardRoot || 'vhl');
    const b = document.querySelector('.nav button[data-view="' + (this._vcardRoot || 'vhl') + '"]'); if (b) b.classList.add('active');
  };
  const baseAllCard = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAllCard.apply(this, arguments);
    try { if (this._vcard && document.querySelector('#view-' + this._vcard.t + '.active')) this.vCardRender(); } catch (e) { console.warn('vcard render', e); }
    return r;
  };

  /* ---------- карточка клуба ВХЛ ---------- */
  proto.vClubCardHtml = function (id, tab) {
    const t = this.vhlTeamById(id); if (!t) return '<div class="card"><p>Клуб не найден.</p></div>';
    const rows = this.vhlStandings(), i = rows.findIndex(r => r.id === id), r = rows[i] || {};
    const isMine = this.vhlFarmsOf(this.state.teamId).some(f => f.id === id);
    const primary = isMine && this.vhlPrimaryFarm(this.state.teamId)?.id === id;
    const parent = t.parentId ? this.teamById(t.parentId) : null;
    const hero = `<div class="cd-hero"><div class="cd-ava sq" aria-hidden="true">${esc(this, t.name.slice(0, 1))}</div><div class="cd-who"><h2>${esc(this, t.name)}</h2>`
      + `<div class="cd-meta">${esc(this, t.city)} · ${esc(this, t.arena || '')} · тренер ${esc(this, t.coach || '—')}${parent ? ` · партнёр ${this.cdTeam ? this.cdTeam(parent.id) : esc(this, parent.name)}` : ''}</div>`
      + `<div class="cd-chips">${isMine ? `<span class="cd-chip y">Ваш клуб-партнёр${primary ? ' (основной)' : ''}</span>` : ''}</div></div><div class="cd-ovr"><b>${r.gp ? i + 1 : '—'}</b><span>место в ВХЛ</span></div></div>`;
    const tabsList = [['ov', 'Обзор'], ['cal', 'Календарь'], ['roster', 'Состав'], ['tr', 'Трансферы']]; if (isMine) tabsList.push(['mgmt', 'Управление']);
    const tabs = `<div class="cd-tabs" role="tablist">${tabsList.map(([k, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-vcd="vctab:${k}">${l}</button>`).join('')}</div>`;
    const c = (this._vcard && this._vcard.id === id) ? this._vcard : {};
    let body = '';
    if (tab === 'mgmt' && isMine) body = this.vClubManageHtml(id);
    else if (tab === 'tr') body = this.vClubTransfersHtml(id);
    else if (tab === 'cal') body = this.vClubCalendarHtml(id, c);
    else if (tab === 'roster') body = this.vClubRosterHtml(id, c);
    else body = this.vClubOverviewHtml(id, c);
    return `<div class="cd-top"><button type="button" class="btn btn-quiet" data-vcd="back">← Назад</button></div>${hero}${tabs}${body}`;
  };
  /* общие помощники клубной статистики (регулярка/плей-офф/всё вместе) */
  proto.vClubSegHtml = function (key, cur) { return `<div class="cd-seg" style="margin-bottom:.5rem">${[['season', 'Чемпионат'], ['po', 'Плей-офф'], ['all', 'Всё вместе']].map(([k, l]) => `<button type="button" class="${cur === k ? 'on' : ''}" data-vcd="${key}:${k}">${l}</button>`).join('')}</div>`; };
  proto.vClubSkStat = function (range, pid) {
    const v = this.vhlState();
    if (range === 'all') { const a = v.ps[pid] || [0, 0, 0], b = v.pops[pid] || [0, 0, 0]; return { gp: a[0] + b[0], g: a[1] + b[1], a: a[2] + b[2], pts: a[1] + a[2] + b[1] + b[2] }; }
    const s = (range === 'po' ? v.pops : v.ps)[pid] || [0, 0, 0]; return { gp: s[0], g: s[1], a: s[2], pts: s[1] + s[2] };
  };
  proto.vClubGkStat = function (range, pid) {
    const v = this.vhlState();
    if (range === 'all') { const a = this.vhlGoalieRead(v.gs, pid), b = this.vhlGoalieRead(v.pogs, pid); return { gp: a.gp + b.gp, w: a.w + b.w, ga: a.ga + b.ga, shots: a.shots + b.shots, so: a.so + b.so }; }
    return this.vhlGoalieRead(range === 'po' ? v.pogs : v.gs, pid);
  };
  /* последние n матчей клуба (счёт, домашний/выездной) — общий помощник для «Обзора» клуба и карточки игрока.
   * 15.14.2: раньше учитывал только vhlSchedule() (регулярку) — во время и после плей-офф команда,
   * игравшая в Кубке Петрова, не показывала эти матчи вовсе («последние игры» молчали, пока в регулярке
   * оставались старые результаты). Добавляем сыгранные игры плей-офф (vhlClubPlayoffPlayed) и сортируем
   * оба источника вместе по дате. */
  proto.vClubFormHtml = function (id, n) {
    const v = this.vhlState();
    const reg = this.vhlSchedule().filter(m => (m.h === id || m.a === id) && v.r[m.i]).map(m => {
      const home = m.h === id, res = v.r[m.i], hs = res[0], as = res[1];
      return { d: m.d, oppId: home ? m.a : m.h, gf: home ? hs : as, ga: home ? as : hs, ot: res[2], mcKey: m.i };
    });
    const po = this.vhlClubPlayoffPlayed ? this.vhlClubPlayoffPlayed(id) : [];
    const played = reg.concat(po).sort((a, b) => b.d - a.d);
    return played.slice(0, n || 5).map(x => {
      // 15.13.0: вторая точка входа в матч-центр — прямо из «Последних игр», не только из календаря клуба
      const mcBtn = `<button type="button" class="btn btn-quiet" style="margin-left:.5rem" data-vcd="vmc:${x.mcKey}">🏒 Матч-центр</button>`;
      return `<div class="fr"><span>${this.vClubLink(x.oppId)}</span><span class="${x.gf > x.ga ? 'cd-w' : 'cd-l'}">${x.gf}–${x.ga}${x.ot === 2 ? ' (Б)' : x.ot === 1 ? ' (ОТ)' : ''}</span>${mcBtn}</div>`;
    }).join('') || '<span class="muted small">Матчей ещё не было.</span>';
  };
  // 15.14.2: «ближайший матч» точно так же не видел плей-офф — как только регулярка доиграна, у всех
  // клубов v.r заполнен целиком, и vhlSchedule() больше не содержит ни одного непройденного матча, хотя
  // клуб может ещё играть (или только готовиться играть) серию плей-офф. Дата следующей игры серии уже
  // известна заранее (SERIES_OFFSETS от начала раунда), даже если сама игра ещё не просимулирована.
  proto.vClubNextHtml = function (id) {
    const v = this.vhlState();
    const next = this.vhlSchedule().filter(m => (m.h === id || m.a === id) && !v.r[m.i]).sort((a, b) => a.d - b.d)[0];
    if (next) return `${this.formatDate ? this.formatDate(next.d) : next.d}: ${next.h === id ? 'дома с ' : 'в гостях у '}${this.vClubLink(next.h === id ? next.a : next.h)}`;
    const po = this.vhlClubPlayoffNext ? this.vhlClubPlayoffNext(id) : null;
    if (po) return `${this.formatDate ? this.formatDate(po.d) : po.d}: игра плей-офф против ${this.vClubLink(po.oppId)}`;
    return 'Матчей больше нет.';
  };
  /* ---------- «Обзор»: сезонные показатели, последние матчи, ближайший матч, лучшие игроки ---------- */
  proto.vClubOverviewHtml = function (id, c) {
    const rows = this.vhlStandings(), i = rows.findIndex(r => r.id === id), r = rows[i] || {};
    const form = this.vClubFormHtml(id, 5);
    const nextHtml = this.vClubNextHtml(id);
    const gd = (r.gf || 0) - (r.ga || 0), gdTxt = gd > 0 ? '+' + gd : gd < 0 ? '−' + Math.abs(gd) : '0';
    const kpi = (val, lab) => `<div class="cd-kpi"><b>${val}</b><span>${lab}</span></div>`;
    const ovrange = c.ovrange || 'all';
    const cseg = this.vClubSegHtml('vcovrange', ovrange);
    const roster = this.vhlClubRoster(id).map(x => x.p.id);
    const sk = roster.filter(pid => { const p = this.vhlPlayerById(pid); return p && p.pos !== 'G'; }).map(pid => ({ pid, s: this.vClubSkStat(ovrange, pid) })).sort((a, b) => b.s.pts - a.s.pts || b.s.g - a.s.g).slice(0, 5);
    const gks = roster.filter(pid => { const p = this.vhlPlayerById(pid); return p && p.pos === 'G'; }).map(pid => ({ pid, s: this.vClubGkStat(ovrange, pid) })).filter(x => x.s.gp > 0).sort((a, b) => b.s.w - a.s.w || b.s.gp - a.s.gp)[0];
    const skRows = sk.map(x => `<tr><td>${this.vPlayerLink(x.pid)}</td><td>${x.s.gp}</td><td>${x.s.g}</td><td>${x.s.a}</td><td><b>${x.s.pts}</b></td></tr>`).join('');
    const gRow = gks ? (() => { const s = gks.s, pct = s.shots ? ((s.shots - s.ga) / s.shots * 100).toFixed(1) + '%' : '—'; return `<div class="small" style="margin-top:.5rem">Вратарь: ${this.vPlayerLink(gks.pid)}, ${s.w} побед, %ОТР ${pct}, КН ${(s.ga / Math.max(1, s.gp)).toFixed(2).replace('.', ',')}, ПШ ${s.ga}</div>`; })() : '';
    return `<div class="cd-grid"><div class="cd-box"><h4>Сезон 2026/27</h4><div class="cd-kpis">${kpi(r.gp || 0, 'Матчи')}${kpi(r.pts || 0, 'Очки')}${kpi((r.gf || 0) + '-' + (r.ga || 0), 'Шайбы')}${kpi(r.gp ? i + 1 : '—', 'Место в лиге')}${kpi(gdTxt, 'Разница шайб')}</div>`
      + `<h4>Последние 5 матчей</h4><div class="cd-last5">${form}</div><h4>Ближайший матч</h4><div class="small">${nextHtml}</div></div>`
      + `<div class="cd-box"><h4>Лучшие игроки</h4>${cseg}<div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Игрок</th><th>И</th><th>Ш</th><th>П</th><th>О</th></tr></thead><tbody>${skRows || '<tr><td colspan="5" class="muted">Статистики пока нет.</td></tr>'}</tbody></table></div>${gRow}</div></div>`;
  };
  /* ---------- «Календарь»: как в КХЛ, месяц за месяцем ---------- */
  const CAL_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  proto.vClubCalendarHtml = function (id, c) {
    const st = this.state, v = this.vhlState();
    const ms = this.vhlSchedule().filter(m => m.h === id || m.a === id);
    if (!ms.length) return '<div class="cd-box">Расписание ещё не создано.</div>';
    const key = d => d.getFullYear() * 12 + d.getMonth();
    const first = key(this.clubCalDate(ms[0].d)), last = key(this.clubCalDate(ms[ms.length - 1].d));
    if (c.mo == null) c.mo = Math.min(last, Math.max(first, key(this.clubCalDate(st.dayIndex || 0))));
    c.mo = Math.min(last, Math.max(first, c.mo));
    const y = Math.floor(c.mo / 12), mo = c.mo % 12, dim = new Date(y, mo + 1, 0).getDate(), off = (new Date(y, mo, 1).getDay() + 6) % 7;
    const byDay = {}; for (const m of ms) { const d = this.clubCalDate(m.d); if (key(d) === c.mo) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(m); }
    const todayD = this.clubCalDate(st.dayIndex || 0), isToday = d => key(todayD) === c.mo && todayD.getDate() === d;
    let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<div class="cd-dow">${x}</div>`).join('');
    for (let i = 0; i < off; i++) cells += '<div class="cd-d e"></div>';
    for (let d = 1; d <= dim; d++) {
      const list = byDay[d];
      if (!list) { cells += `<div class="cd-d n${isToday(d) ? ' today' : ''}">${d}</div>`; continue; }
      const m = list[0], home = m.h === id, oppId = home ? m.a : m.h, kit = this.vClubKit(home ? id : oppId);
      const r = v.r[m.i], sel = c.csel === m.d;
      cells += `<button type="button" class="cd-d m${home ? ' home' : ''}${r ? '' : ' fut'}${isToday(d) ? ' today' : ''}${sel ? ' sel' : ''}" style="background:${kit.f};color:${kit.i}" data-vcd="vcday:${m.d}" aria-label="${d}, ${esc(this, (this.vhlTeamById(oppId) || {}).name || '')}">${esc(this, this.vClubAbbr(oppId))}</button>`;
    }
    const played = ms.filter(m => v.r[m.i]).length;
    const t = this.vhlTeamById(id), kit0 = this.vClubKit(id);
    let detail = '<p class="muted small" style="margin:.6rem 0 0">Нажмите на день с матчем. Домик — игра дома, круг — игра в гостях. Сегодняшний день обведён.</p>';
    if (c.csel != null) {
      const day = ms.filter(m => m.d === c.csel);
      detail = day.map(m => {
        const home = m.h === id, oppId = home ? m.a : m.h, opp = this.vhlTeamById(oppId), r = v.r[m.i];
        const res = r ? (() => { const gf = home ? r[0] : r[1], ga = home ? r[1] : r[0]; return `<span class="cd-chip ${gf > ga ? 'g' : 'r'}">${gf}:${ga}${r[2] === 2 ? ' Б' : r[2] === 1 ? ' ОТ' : ''}</span>`; })() : '<span class="cd-chip">впереди</span>';
        const mcBtn = r ? `<button type="button" class="btn btn-quiet" style="margin-left:.5rem" data-vcd="vmc:${m.i}">🏒 Матч-центр</button>` : '';
        return `<div class="cd-calrow"><span><b>${this.formatDate ? this.formatDate(m.d) : m.d}</b> · ${home ? 'дома' : 'в гостях'} · ${this.vClubLink(oppId, opp ? opp.name : '')}</span>${res}${mcBtn}</div>`;
      }).join('');
    }
    return `<div class="cd-box cd-calbox"><div class="cd-calwrap"><div class="cd-calleft"><h3>Календарь</h3><div><div class="cd-calbig" style="background:${kit0.f};color:${kit0.i}">${esc(this, this.vClubAbbr(id))}</div><b>${esc(this, t.name)}</b><div class="muted small">Сыграно ${played} из ${ms.length}</div></div></div>`
      + `<div><div class="cd-calgrid">${cells}</div><div class="cd-calnav"><span>${CAL_MONTHS[mo]}, ${y}</span><span><button type="button" data-vcd="vcmon:-1" aria-label="Предыдущий месяц"${c.mo <= first ? ' disabled' : ''}>‹</button><button type="button" data-vcd="vcmon:1" aria-label="Следующий месяц"${c.mo >= last ? ' disabled' : ''}>›</button></span></div></div></div><div class="cd-caldet">${detail}</div></div>`;
  };
  /* ---------- «Состав»: группы по амплуа, статистика сразу в таблице (как в КХЛ) ---------- */
  proto.vClubRosterHtml = function (id, c) {
    const roster = this.vhlClubRoster(id);
    const v = this.vhlState(), mineIds = this.vhlMineIds();
    if (!roster.length) return '<div class="cd-box"><p class="muted">Состав недоступен.</p></div>';
    const crange = c.crange || 'all';
    const cseg = this.vClubSegHtml('vcrange', crange);
    const groups = [['F', 'Нападающие', x => x.p.pos !== 'D' && x.p.pos !== 'G'], ['D', 'Защитники', x => x.p.pos === 'D'], ['G', 'Вратари', x => x.p.pos === 'G']];
    const body = groups.map(([gk, name, f]) => {
      const list = roster.filter(f); if (!list.length) return '';
      const G = gk === 'G';
      const rows = list.map(x => ({ x, age: this.vhlPlayerAge(x.p), ovr: Math.round(x.ovr), s: G ? this.vClubGkStat(crange, x.p.id) : this.vClubSkStat(crange, x.p.id) })).sort((a, b) => b.ovr - a.ovr);
      const head = G ? `<tr>${vhlTh('Игрок')}${vhlTh('Поз.')}${vhlTh('Возр.', { num: 1 })}${vhlTh('Рейт.', { num: 1 })}${vhlTh('И', { num: 1 })}${vhlTh('% отраж.', { num: 1 })}${vhlTh('ПШ', { num: 1 })}${vhlTh('КН', { num: 1 })}${vhlTh('СМ', { num: 1 })}</tr>`
        : `<tr>${vhlTh('Игрок')}${vhlTh('Поз.')}${vhlTh('Возр.', { num: 1 })}${vhlTh('Рейт.', { num: 1 })}${vhlTh('И', { num: 1 })}${vhlTh('Ш', { num: 1 })}${vhlTh('П', { num: 1 })}${vhlTh('О', { num: 1 })}</tr>`;
      const trs = rows.map(r => {
        const p = r.x.p, badges = [];
        if (r.x.loan) badges.push('<span class="vhl-tag">из КХЛ</span>');
        if (p.foreign && !String(p.id).startsWith('v_')) badges.push('<span class="vhl-tag">лег.</span>');
        if (v.protectedIds.includes(p.id)) badges.push('<span class="vhl-tag gold">★</span>');
        const posShort = this.vPosLabel(p);
        const cells = G ? (() => { const s = r.s, pct = s.shots ? ((s.shots - s.ga) / s.shots * 100).toFixed(1) + '%' : '—'; return `<td>${s.gp}</td><td><b>${pct}</b></td><td>${s.ga}</td><td>${(s.ga / Math.max(1, s.gp)).toFixed(2).replace('.', ',')}</td><td>${s.so}</td>`; })()
          : `<td>${r.s.gp}</td><td>${r.s.g}</td><td>${r.s.a}</td><td><b>${r.s.pts}</b></td>`;
        return `<tr class="${mineIds.has(p.id) ? 'vhl-mine' : ''}"><td>${this.vPlayerLink(p.id)} ${badges.join(' ')}</td><td>${posShort}</td><td>${r.age}</td><td><b>${r.ovr}</b></td>${cells}</tr>`;
      }).join('');
      return `<div class="cd-box"><h4>${name}</h4><div class="cd-tw"><table class="cd-tbl sortable-stats-table" data-no-rank="1"><thead>${head}</thead><tbody>${trs}</tbody></table></div></div>`;
    }).join('');
    return cseg + body;
  };
  /* ---------- «Трансферы»: компенсационное подписание воспитанников самостоятельных клубов (15.8.0) ---------- */
  proto.vClubTransfersHtml = function (id) {
    const t = this.vhlTeamById(id);
    if (!t || t.parentId) {
      return `<div class="cd-box"><h4>Трансферы ВХЛ</h4><p class="muted small">Это фарм-клуб — его воспитанников может бесплатно подтянуть в основу только клуб-владелец (вкладка «Управление» на странице его фарма). Компенсационное подписание действует только для самостоятельных клубов ВХЛ, не привязанных к фарм-системе.</p></div>`;
    }
    const v = this.vhlState();
    const prospects = this.vhlOwnPlayers(id).filter(p => this.vhlPlayerAge(p) <= 23).sort((a, b) => this.vhlPlayerOvr(b) - this.vhlPlayerOvr(a)).slice(0, 10);
    const rows = prospects.length ? prospects.map(p => {
      const fee = this.vhlIndependentSignFee(p);
      return `<div class="rowline-vhl"><div><b>${this.vPlayerLink(p.id, p.name)}</b> <span class="tiny muted">${POSN[p.pos] || ''} · ${this.vhlPlayerAge(p)} лет · OVR ~${Math.round(this.vhlPlayerOvr(p))}</span></div><div><button class="fin-act" data-vcd="vindepsign:${esc(this, p.id)}">Подписать за ${(fee / 1e6).toFixed(1)} млн</button></div></div>`;
    }).join('') : '<p class="tiny muted">Подходящих молодых воспитанников (до 23 лет) сейчас не видно.</p>';
    return `<div class="cd-box"><h4>Трансферы ВХЛ</h4><p class="muted small">«${esc(this, t.name)}» — самостоятельный клуб, не привязан к фарм-системе. Его молодых воспитанников (до 23 лет) можно подписать в свой клуб КХЛ за разовую компенсацию — она войдёт в потолок зарплат текущего сезона (или следующего, если фонд уже выше потолка).</p>${rows}
      <p class="tiny muted" style="margin-top:.5rem">Обмены и подписания клубов ВХЛ друг с другом, а также общий трансферный рынок внутри лиги — пока не реализованы.</p></div>`;
  };
  proto.vClubManageHtml = function (id) {
    const v = this.vhlState();
    const stat = pid => { const s = v.ps[pid]; const g = v.gs[pid]; if (s && (s[0] || s[1] || s[2])) return `${s[0]} И · ${s[1]}+${s[2]}`; if (g && g[0]) return `${g[0]} И · ${g[1]} В (вратарь)`; return 'ещё не играл'; };
    const loans = Object.entries(this.state.farm || {}).filter(([pid, e]) => e && e.clubId === id).map(([pid, e]) => ({ p: this.league('KHL').players().find(x => x.id === pid), e })).filter(x => x.p && x.p.teamId === this.state.teamId);
    const loansHtml = loans.length ? loans.map(({ p }) => {
      const prot = v.protectedIds.includes(p.id);
      return `<div class="rowline-vhl"><div><b>${this.vPlayerLink(p.id, p.name)}</b> <span class="tiny muted">${esc(this, this.positionLabel ? this.positionLabel(p.pos) : p.pos)} · ${this.vhlPlayerAge(p)} лет</span><div class="tiny muted">${esc(this, stat(p.id))}</div></div><div><button class="fin-act" data-vcd="vprotect:${esc(this, p.id)}" title="Защищённый проспект">${prot ? '★' : '☆'}</button> <button class="fin-act" data-vcd="vrecall:${esc(this, p.id)}">Вернуть</button></div></div>`;
    }).join('') : '<p class="tiny muted">Сейчас в этом клубе никого не командировано.</p>';
    const prospects = this.vhlOwnPlayers(id).filter(p => this.vhlPlayerAge(p) <= 23).sort((a, b) => this.vhlPlayerOvr(b) - this.vhlPlayerOvr(a)).slice(0, 8);
    const prospectsHtml = prospects.length ? prospects.map(p => {
      const prot = v.protectedIds.includes(p.id);
      return `<div class="rowline-vhl"><div><b>${this.vPlayerLink(p.id, p.name)}</b> <span class="tiny muted">${POSN[p.pos] || ''} · ${this.vhlPlayerAge(p)} лет · OVR ~${this.vhlPlayerOvr(p)}${v.grow[p.id] ? ` <span class="vhl-up">▲${v.grow[p.id]}</span>` : ''}</span><div class="tiny muted">${esc(this, stat(p.id))}</div></div><div><button class="fin-act" data-vcd="vprotect:${esc(this, p.id)}" title="Защищённый проспект">${prot ? '★' : '☆'}</button> <button class="fin-act" data-vcd="vcallup:${esc(this, p.id)}">Подтянуть</button></div></div>`;
    }).join('') : '<p class="tiny muted">Подходящих воспитанников не видно.</p>';
    return `<div class="cd-box"><h4>Командированные из основы</h4>${loansHtml}</div>
      <div class="cd-box"><h4>Воспитанники — можно подтянуть</h4>${prospectsHtml}<p class="tiny muted" style="margin:.5rem 0 0">★ — защищённый проспект: ИИ-тренер фарма обязан держать его в составе и даёт больше игрового времени (максимум три по всей фарм-системе). Директива тренеру и выбор основного фарм-клуба — во вкладке «Развитие», блок «Клубы-партнёры».</p></div>`;
  };

  /* ---------- карточка игрока ВХЛ ---------- */
  const vkpi = (v, l) => `<div class="cd-kpi"><b>${v}</b><span>${l}</span></div>`;
  proto.vPlayerKpis = function (p, id, range) {
    const G = p.pos === 'G';
    if (G) { const s = this.vClubGkStat(range, id), pct = s.shots ? ((s.shots - s.ga) / s.shots * 100).toFixed(1) + '%' : '—';
      return `<div class="cd-kpis">${vkpi(s.gp, 'Матчи')}${vkpi(s.w, 'Победы')}${vkpi(pct, '%ОТР')}${vkpi((s.ga / Math.max(1, s.gp)).toFixed(2).replace('.', ','), 'КН')}${vkpi(s.ga, 'ПШ')}${vkpi(s.so, 'Сухие')}</div>`;
    }
    const s = this.vClubSkStat(range, id);
    return `<div class="cd-kpis">${vkpi(s.gp, 'Матчи')}${vkpi(s.g, 'Шайбы')}${vkpi(s.a, 'Передачи')}${vkpi(s.pts, 'Очки')}</div>`;
  };
  proto.vPlayerCardHtml = function (id, tab, range) {
    const p = this.vhlPlayerById(id); if (!p) return '<div class="card"><p>Игрок не найден.</p></div>';
    const v = this.vhlState(), club = this.vhlClubOf(id), age = this.vhlPlayerAge(p), ovr = Math.round(this.vhlPlayerOvr(p));
    const isProspect = String(id).startsWith('v_'), isOwnProspect = isProspect && this.vhlFarmsOf(this.state.teamId).some(f => f.id === this.vhlEffectiveClubId(p)) && !v.out.includes(id);
    const isIndependentProspect = isProspect && !isOwnProspect && !v.out.includes(id) && club && !club.parentId && age <= 23;
    const prot = v.protectedIds.includes(id);
    const realPlayer = !isProspect && this.league('KHL').players().some(x => x.id === id); // командированный из КХЛ — обычный игрок основы, есть полный профиль развития
    const chips = [];
    chips.push(`<span class="cd-chip">${POSN[p.pos] || p.pos}</span>`);
    if (club) chips.push(`<span class="cd-chip">${this.vClubLink(club.id, club.name)}</span>`);
    if (p.foreign && isProspect) chips.push('<span class="cd-chip y">Легионер</span>');
    if (isOwnProspect) chips.push('<span class="cd-chip g">Воспитанник вашего клуба</span>');
    if (isIndependentProspect) chips.push('<span class="cd-chip">Самостоятельный клуб — доступен за компенсацию</span>');
    if (prot) chips.push('<span class="cd-chip y">★ защищён</span>');
    const initials = String(p.name).split(/\s+/).map(x => x[0]).slice(0, 2).join('');
    const hero = `<div class="cd-hero"><div class="cd-ava" aria-hidden="true">${esc(this, initials)}</div><div class="cd-who"><h2>${esc(this, p.name)}</h2>`
      + `<div class="cd-meta">${age} лет${p.height ? ` · ${p.height} см, ${p.weight || '—'} кг` : ''}${p.grip ? ` · хват ${esc(this, p.grip)}` : ''}</div>`
      + `<div class="cd-chips">${chips.join('')}</div></div><div class="cd-ovr"><b>${ovr}</b><span>рейтинг</span></div></div>`;
    const PTABS = [['ov', 'Обзор'], ['st', 'Статистика'], ['dv', 'Развитие'], ['cr', 'Карьера']];
    const tabs = `<div class="cd-tabs" role="tablist">${PTABS.map(([k, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-vcd="vptab:${k}">${l}</button>`).join('')}</div>`;
    const actions = isOwnProspect ? `<div style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" class="btn btn-quiet" data-vcd="vcallup:${esc(this, id)}">Подтянуть в КХЛ</button><button type="button" class="btn btn-quiet" data-vcd="vprotect:${esc(this, id)}">${prot ? 'Снять защиту' : 'Сделать защищённым'}</button></div>`
      : isIndependentProspect ? `<div style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" class="btn btn-quiet" data-vcd="vindepsign:${esc(this, id)}">Подписать за ${(this.vhlIndependentSignFee(p) / 1e6).toFixed(1)} млн</button></div>` : '';
    let body;
    if (tab === 'st') {
      const seg = ['season', 'po', 'all'].includes(range) ? range : 'season';
      const segHtml = `<div class="cd-seg">${[['season', 'Чемпионат'], ['po', 'Плей-офф'], ['all', 'Всё вместе']].map(([k, l]) => `<button type="button" class="${seg === k ? 'on' : ''}" data-vcd="vprange:${k}">${l}</button>`).join('')}</div>`;
      body = `<div class="cd-box">${segHtml}${this.vPlayerKpis(p, id, seg)}<p class="muted small" style="margin-top:.6rem">Подробный протокол отдельных матчей (броски, время на льду) в ВХЛ не ведётся — только итог по сезону целиком.</p></div>`;
    } else if (tab === 'dv') {
      if (realPlayer) {
        const dp = this.league('KHL').players().find(x => x.id === id), d = this.playerDev ? this.playerDev(dp) : null;
        const hist = this.ratingHistory ? this.ratingHistory(id) : [];
        body = `<div class="cd-grid"><div class="cd-box"><h4>Навыки: изменения за сезон</h4>${this.cdSkillBars ? this.cdSkillBars(dp, d) : '<p class="muted small">Данные о навыках недоступны.</p>'}</div></div>`;
      } else {
        const grow = v.grow[id] || 0;
        body = `<div class="cd-box"><h4>Развитие воспитанника</h4><div class="cd-kpis">${vkpi(ovr, 'Текущий рейтинг')}${vkpi((grow > 0 ? '+' : '') + grow, 'Рост за сезон')}</div><p class="muted small" style="margin-top:.6rem">У воспитанников ВХЛ нет подробной разбивки по навыкам (бросок/пас/катание и т.д.) — только общий рейтинг и его рост за сезон.</p>${actions}</div>`;
      }
    } else if (tab === 'cr') {
      const isG = p.pos === 'G';
      const sSeason = this.vClubSkStat('season', id), sPo = this.vClubSkStat('po', id);
      const gSeason = this.vClubGkStat('season', id), gPo = this.vClubGkStat('po', id);
      const hasPo = isG ? (gPo.gp > 0) : (sPo.gp > 0);
      const cellsSk = r => `<td>${r.gp}</td><td>${r.g}</td><td>${r.a}</td><td><b>${r.pts}</b></td>`;
      const cellsGk = r => `<td>${r.gp}</td><td>${r.w}</td><td>${r.shots ? ((r.shots - r.ga) / r.shots * 100).toFixed(1) + '%' : '—'}</td><td>${r.so}</td>`;
      const cells = isG ? cellsGk : cellsSk;
      const head = isG ? '<th>И</th><th>В</th><th>%ОТР</th><th>СМ</th>' : '<th>И</th><th>Ш</th><th>П</th><th>О</th>';
      const clubCell = club ? this.vClubLink(club.id, club.name) : '—';
      const vhlRows = `<tr class="cur"><td>2026/27</td><td>${clubCell}</td><td>ВХЛ · регулярный</td>${cells(isG ? gSeason : sSeason)}</tr>`
        + (hasPo ? `<tr class="cur"><td>2026/27</td><td>${clubCell}</td><td>ВХЛ · плей-офф</td>${cells(isG ? gPo : sPo)}</tr>` : '');
      // 15.14.5: командированный из основы КХЛ — эта карточка (открывается по ссылке на игрока из состава
      // фарм-клуба) показывала ТОЛЬКО строки ВХЛ: отрезок за клуб КХЛ до/во время командировки (данные
      // никуда не делись — this.state.playerStats/p.seasonStints целы) здесь просто никогда не читался и
      // не выводился, из-за чего выглядело так, будто статистика КХЛ «пропала» при отправке в ВХЛ. Теперь
      // для командированного игрока («realPlayer») строки КХЛ показываются над строками ВХЛ в этой же
      // таблице — так же, как они показаны в его обычной карточке КХЛ (playerCardHtml). Относится к любому
      // командированному игроку, не только за клуб пользователя — ИИ-клубы и их фарм-команды используют
      // тот же this.state.playerStats/p.seasonStints.
      if (realPlayer) {
        const dp = this.league('KHL').players().find(x => x.id === id) || p;
        const sgnK = n => (n > 0 ? '+' : '') + n;
        const sK = this.state.playerStats[id] || {}, poK = (this.state.playoff && this.state.playoff.playerStats && this.state.playoff.playerStats[id]) || {};
        const xK = isG ? this.cardGoalie(sK) : this.cardSkater(sK), yK = isG ? this.cardGoalie(poK) : this.cardSkater(poK);
        const hasPoK = yK.gp > 0;
        const stints = Array.isArray(dp.seasonStints) ? dp.seasonStints : [];
        const stintRows = stints.map(stt => ({ club: this.cdTeam(stt.teamId), row: isG ? this.cardGoalie(stt) : this.cardSkater(stt) }));
        const cellsK = r => isG ? `<td>${r.gp}</td><td>${r.w}</td><td>${r.sv}</td><td>${r.gaa}</td><td>${r.ga}</td><td>${r.so}</td>` : `<td>${r.gp}</td><td>${r.g}</td><td>${r.a}</td><td><b>${r.pts}</b></td><td>${sgnK(r.pm)}</td>`;
        const headK = isG ? '<th>И</th><th>В</th><th>%ОТР</th><th>КН</th><th>ПШ</th><th>СО</th>' : '<th>И</th><th>Ш</th><th>П</th><th>О</th><th>+/−</th>';
        const lab = this.seasonLabel ? this.seasonLabel() : '2026/27';
        const khlClub = this.cdTeam ? this.cdTeam(dp.teamId) : '';
        const khlRows = `<tr class="cur"><td>${lab}</td><td>${khlClub}</td><td>КХЛ · регулярный</td>${cellsK(xK)}</tr>`
          + (hasPoK ? `<tr class="cur"><td>${lab}</td><td>${khlClub}</td><td>КХЛ · плей-офф</td>${cellsK(yK)}</tr>` : '')
          + stintRows.map(r => `<tr class="cur"><td>${lab}</td><td>${r.club}</td><td>КХЛ · регулярный</td>${cellsK(r.row)}</tr>`).join('');
        // колонки КХЛ-таблицы шире (есть +/− у полевых, КН/ПШ у вратарей) — для строк ВХЛ недостающие
        // метрики (в ВХЛ не считаются по отдельности) показываем прочерком, но СТРОГО в тех же позициях,
        // что и одноимённые колонки КХЛ-шапки (напр. «сухие» у вратаря — это 6-я колонка, а не 4-я).
        const cellsVForKhlHead = r => isG
          ? `<td>${r.gp}</td><td>${r.w}</td><td>${r.shots ? ((r.shots - r.ga) / r.shots * 100).toFixed(1) + '%' : '—'}</td><td>—</td><td>—</td><td>${r.so}</td>`
          : `<td>${r.gp}</td><td>${r.g}</td><td>${r.a}</td><td><b>${r.pts}</b></td><td>—</td>`;
        const vhlRowsForKhlHead = `<tr class="cur"><td>${lab}</td><td>${clubCell}</td><td>ВХЛ · регулярный</td>${cellsVForKhlHead(isG ? gSeason : sSeason)}</tr>`
          + (hasPo ? `<tr class="cur"><td>${lab}</td><td>${clubCell}</td><td>ВХЛ · плей-офф</td>${cellsVForKhlHead(isG ? gPo : sPo)}</tr>` : '');
        body = `<div class="cd-box"><h4>Карьера по сезонам</h4><div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Сезон</th><th>Клуб</th><th>Лига</th>${headK}</tr></thead><tbody>${khlRows}${vhlRowsForKhlHead}</tbody></table></div><p class="muted small" style="margin-top:.5rem">Сезоны, которые вы доиграете, будут добавляться сюда.</p></div>`;
      } else {
        body = `<div class="cd-box"><h4>Карьера по сезонам в ВХЛ</h4><div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Сезон</th><th>Клуб</th><th>Лига</th>${head}</tr></thead><tbody>${vhlRows}</tbody></table></div><p class="muted small" style="margin-top:.5rem">Сезоны, которые вы доиграете, будут добавляться сюда.</p></div>`;
      }
    } else {
      body = `<div class="cd-grid"><div class="cd-box"><h4>Сезон 2026/27</h4>${this.vPlayerKpis(p, id, 'all')}<h4>Последние 5 матчей клуба</h4><div class="cd-last5">${club ? this.vClubFormHtml(club.id, 5) : '<span class="muted small">Клуб не определён.</span>'}</div>${actions}</div>`
        + `<div class="cd-box"><h4>Навыки</h4>${realPlayer ? (() => { const dp = this.league('KHL').players().find(x => x.id === id); return this.cdSkills ? this.cdSkills(dp, this.playerDev ? this.playerDev(dp) : null) : ''; })() : `<div class="cd-kpis">${vkpi(ovr, 'Рейтинг')}</div><p class="muted small">Подробная разбивка навыков для воспитанников ВХЛ не ведётся.</p>`}</div></div>`;
    }
    return `<div class="cd-top"><button type="button" class="btn btn-quiet" data-vcd="back">← Назад</button></div>${hero}${tabs}${body}`;
  };

  /* ---------- события внутри карточек ВХЛ ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-vpl],[data-vcl]:not(.vhl-pcard)');
    if (a && typeof app !== 'undefined' && app.state) {
      e.preventDefault(); e.stopPropagation();
      if (a.dataset.vpl) app.vOpenPlayerCard(a.dataset.vpl); else app.vOpenClubCard(a.dataset.vcl);
      return;
    }
    const b = e.target.closest && e.target.closest('[data-vcd]');
    if (!b || typeof app === 'undefined' || !app._vcard) return;
    const pr = String(b.dataset.vcd).split(':'), k = pr[0], v = pr[1], c = app._vcard;
    if (k === 'back') app.vCardBack();
    else if (k === 'vctab') { c.tab = v; app.vCardRender(); }
    else if (k === 'vptab') { c.tab = v; app.vCardRender(); }
    else if (k === 'vprange') { c.range = v; app.vCardRender(); }
    else if (k === 'vcovrange') { c.ovrange = v; app.vCardRender(); }
    else if (k === 'vcrange') { c.crange = v; app.vCardRender(); }
    else if (k === 'vcday') { c.csel = Number(v); app.vCardRender(); }
    else if (k === 'vcmon') { c.mo = (c.mo == null ? 0 : c.mo) + Number(v); c.csel = null; app.vCardRender(); }
    else if (k === 'vcallup') { app.vhlCallUpProspect(v); app.vCardRender(); }
    else if (k === 'vindepsign') { app.vhlSignIndependentProspect(v); app.vCardRender(); }
    else if (k === 'vprotect') { app.vhlToggleProtected(v); app.vCardRender(); }
    else if (k === 'vrecall') { app.recallFromFarm(v); app.vCardRender(); }
    else if (k === 'vprimary') { app.vhlSetPrimaryFarm(v); app.vCardRender(); }
    else if (k === 'vmc') { app.vhlMcOpen(v); }
  }, true);
  document.addEventListener('change', e => {
    if (e.target && e.target.matches('[data-vcd="vdirective"]') && typeof app !== 'undefined') app.vhlSetDirective(e.target.value);
  });

  /* ---------- «Итоги дня» ---------- */
  const baseDg = proto.dgHtml;
  proto.dgHtml = function () {
    let html = baseDg.apply(this, arguments);
    try {
      if (!this.vhlAvailable()) return html;
      const day = Number(this.state.dayIndex || 0);
      const myFarms = new Set(this.vhlFarmsOf(this.state.teamId).map(t => t.id));
      const res = this.vhlResultsOn(day).filter(x => myFarms.has(x.m.h) || myFarms.has(x.m.a));
      const bits = res.map(x => {
        const h = this.vhlTeamById(x.m.h), a = this.vhlTeamById(x.m.a);
        const tail = x.r[2] ? (x.r[2] === 2 ? ' Б' : ' ОТ') : '';
        return `${esc(this, h?.name)} <b>${x.r[0]}:${x.r[1]}${tail}</b> ${esc(this, a?.name)}${x.m.po ? ` (${esc(this, x.m.stage)})` : ''}`;
      });
      if (bits.length) html += `<div class="dg-line">🏒 ВХЛ, ваш клуб-партнёр: ${bits.join(' · ')}</div>`;
    } catch (e) { }
    return html;
  };

  /* ---------- подключение рендера к общей отрисовке и переключению вкладок ---------- */
  const baseSwitch = proto.switchTab;
  proto.switchTab = function (name, button) {
    const r = baseSwitch.apply(this, arguments);
    try {
      if (name === 'vhl') this.renderVhlHome();
      else if (name === 'development') this.renderDevPartnersBlock();
    } catch (e) { console.error('[vhl] ui', e); }
    return r;
  };
  const baseAllRe = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAllRe.apply(this, arguments);
    try {
      if (document.querySelector('#view-vhl.active')) this.renderVhlHome();
      else if (document.querySelector('#view-development.active')) this.renderDevPartnersBlock();
    } catch (e) { }
    return r;
  };
  /* блок «Клубы-партнёры» — часть отрисовки вкладки «Развитие», рендерится вместе с ней (не только когда она active) */
  const baseRenderDev = proto.renderDevelopment;
  proto.renderDevelopment = function () {
    const r = baseRenderDev.apply(this, arguments);
    try { this.renderDevPartnersBlock(); } catch (e) { console.error('[vhl] dev-partners', e); }
    return r;
  };
  /* аватарка игрока ВХЛ в карточке — тот же процедурный генератор, что и у КХЛ (coach_model.js), просто по
   * клубу фарм-команды (clubId), а не основы (teamId): командированные из КХЛ реалистично лысеют/бородеют по
   * возрасту, воспитанники ВХЛ — так же, по своим данным (birthDate, pos) из базы ВХЛ. */
  const baseVPlayerCard = proto.vPlayerCardHtml;
  proto.vPlayerCardHtml = function (id) {
    const html = baseVPlayerCard.apply(this, arguments), p = this.vhlPlayerById(id); if (!p) return html;
    let svg = ''; try { svg = this.playerAvatarSvg(p); } catch (e) { console.error('[vhl] avatar', e); }
    if (!svg) return html;
    return html.replace(/<div class="cd-ava"[^>]*aria-hidden="true">[^<]*<\/div>/, `<div class="cd-ava pic" aria-hidden="true">${svg}</div>`);
  };
})();
