/* KHL Manager 14.1 — карточка клуба: Кубки Гагарина и финалы (2009–2026) и календарь месяцем.
   Данные до игры взяты из открытых источников и проверены вручную. Сезоны самой игры к ним добавятся при смене сезона. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // [победы в Кубке Гагарина, проигранные финалы]
  const FACTS = {
    ska: [[2015, 2017], []], dinamo_msk: [[2012, 2013], []], lokomotiv: [[2025, 2026], [2009, 2024]],
    cska: [[2019, 2022, 2023], [2016, 2018, 2021]], akbars: [[2009, 2010, 2018], [2015, 2023, 2026]],
    metallurg: [[2014, 2016, 2024], [2017, 2022]], traktor: [[], [2013, 2025]], avangard: [[2021], [2012, 2019]],
    salavat: [[2011], []]
  };
  const ABBR = { ska: 'СКА', spartak: 'СПА', torpedo: 'ТОР', lada: 'ЛАД', sochi: 'СОЧ', dinamo_mn: 'ДМН', dinamo_msk: 'ДМО', shanghai: 'ШДР', lokomotiv: 'ЛОК', severstal: 'СЕВ', cska: 'ЦСК', avtomobilist: 'АВТ', akbars: 'АКБ', metallurg: 'ММГ', neftekhimik: 'НЕФ', traktor: 'ТРК', avangard: 'АВГ', admiral: 'АДМ', amur: 'АМУ', barys: 'БАР', salavat: 'СЮЛ', sibir: 'СИБ' };
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  proto.clubAbbr = function (id) { return ABBR[id] || ((this.teamById(id) || {}).name || String(id)).slice(0, 2); };
  proto.clubFacts = function (id) { const f = FACTS[id] || [[], []]; return { cups: f[0], finals: f[1] }; };
  proto.clubFactsHtml = function (id) {
    const f = this.clubFacts(id), ys = []; for (let y = 2009; y <= 2026; y++) ys.push(y);
    const strip = ys.map(y => { const c = f.cups.includes(y), fn = f.finals.includes(y);
      return `<span class="cd-yb ${c ? 'c' : fn ? 'f' : ''}" title="${y === 2020 ? 'Сезон не завершён' : c ? 'Кубок Гагарина' : fn ? 'Финал' : ''}">${y}<small>${c ? 'Кубок' : fn ? 'финал' : y === 2020 ? '—' : ''}</small></span>`; }).join('');
    return `<div class="cd-box"><h4>Кубок Гагарина</h4><div class="cd-cups"><div class="cd-cup"><b>${f.cups.length}</b><span>Кубков</span></div><div class="cd-cup s"><b>${f.finals.length}</b><span>проигранных финалов</span></div><div class="cd-cup g"><b>${f.cups.length + f.finals.length}</b><span>финалов всего</span></div></div>`
      + `<div class="cd-years">${strip}</div></div>`;
  };

  /* ---------- календарь месяцем ---------- */
  proto.clubCalDate = function (offset) {
    const d = new Date(`${this.state.seasonStart || '2026-09-03'}T12:00:00`); d.setDate(d.getDate() + offset); return d;
  };
  proto.clubCalendarHtml = function (id, c) {
    const st = this.state, my = id;
    const ms = st.matches.filter(m => !m.cancelled && (m.homeId === id || m.awayId === id)).sort((a, b) => a.dateOffset - b.dateOffset);
    if (!ms.length) return '<div class="cd-box">Расписание ещё не создано.</div>';
    const key = d => d.getFullYear() * 12 + d.getMonth();
    const first = key(this.clubCalDate(ms[0].dateOffset)), last = key(this.clubCalDate(ms[ms.length - 1].dateOffset));
    if (c.mo == null) c.mo = Math.min(last, Math.max(first, key(this.clubCalDate(st.dayIndex || 0))));
    c.mo = Math.min(last, Math.max(first, c.mo));
    const y = Math.floor(c.mo / 12), mo = c.mo % 12, dim = new Date(y, mo + 1, 0).getDate(), off = (new Date(y, mo, 1).getDay() + 6) % 7;
    const byDay = {}; for (const m of ms) { const d = this.clubCalDate(m.dateOffset); if (key(d) === c.mo) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(m); }
    const todayD = this.clubCalDate(st.dayIndex || 0), isToday = d => key(todayD) === c.mo && todayD.getDate() === d;
    let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<div class="cd-dow">${x}</div>`).join('');
    for (let i = 0; i < off; i++) cells += '<div class="cd-d e"></div>';
    for (let d = 1; d <= dim; d++) {
      const list = byDay[d];
      if (!list) { cells += `<div class="cd-d n${isToday(d) ? ' today' : ''}">${d}</div>`; continue; }
      const m = list[0], home = m.homeId === id, oppId = home ? m.awayId : m.homeId, kit = (home ? this.kitFor(id, true) : this.kitFor(oppId, true)) || {};
      const off2 = m.dateOffset, sel = c.csel === off2;
      cells += `<button type="button" class="cd-d m${home ? ' home' : ''}${m.played ? '' : ' fut'}${isToday(d) ? ' today' : ''}${sel ? ' sel' : ''}" style="background:${kit.f || '#556'};color:${kit.i || '#fff'}" data-cd="cday:${off2}" aria-label="${d} ${MONTHS_G[mo]}, ${E((this.teamById(oppId) || {}).name)}">${E(ABBR[oppId] || (this.teamById(oppId) || {}).name.slice(0, 3).toUpperCase())}</button>`;
    }
    const played = ms.filter(m => m.played).length;
    const t = this.teamById(id), kit0 = this.kitFor(id, true);
    let detail = '<p class="muted small" style="margin:.6rem 0 0">Нажмите на день с матчем. Домик — игра дома (цвет вашей домашней формы), круг — игра в гостях (цвет формы соперника). Сегодняшний день обведён.</p>';
    if (c.csel != null) {
      const day = ms.filter(m => m.dateOffset === c.csel);
      detail = day.map(m => {
        const home = m.homeId === id, oppId = home ? m.awayId : m.homeId, opp = this.teamById(oppId);
        const res = m.played ? (() => { const gf = home ? m.homeScore : m.awayScore, ga = home ? m.awayScore : m.homeScore;
          return `<span class="cd-chip ${gf > ga ? 'g' : 'r'}">${gf}:${ga}${m.so ? ' Б' : m.ot ? ' ОТ' : ''}</span>`; })() : '<span class="cd-chip">впереди</span>';
        const phase = m.playoff ? ' · плей-офф' : '';
        return `<div class="cd-calrow"><span><b>${this.formatDate(m.dateOffset)}</b> · ${home ? 'дома' : 'в гостях'} · <span class="nm" data-cl="${E(oppId)}">${E(opp ? opp.name : '')}</span>${phase}</span>${res}${m.played ? `<button type="button" class="btn btn-quiet" data-cd="calmatch:${E(m.id)}">Итоги матча</button>` : ''}</div>`;
      }).join('');
    }
    return `<div class="cd-box cd-calbox"><div class="cd-calwrap"><div class="cd-calleft"><h3>Календарь</h3><div><div class="cd-calbig" style="background:${kit0.f};color:${kit0.i}">${E(ABBR[id] || t.name.slice(0, 2))}</div><b>${E(t.name)}</b><div class="muted small">Сыграно ${played} из ${ms.length}</div></div></div>`
      + `<div><div class="cd-calgrid">${cells}</div><div class="cd-calnav"><span>${MONTHS[mo]}, ${y}</span><span><button type="button" data-cd="cmon:-1" aria-label="Предыдущий месяц"${c.mo <= first ? ' disabled' : ''}>‹</button><button type="button" data-cd="cmon:1" aria-label="Следующий месяц"${c.mo >= last ? ' disabled' : ''}>›</button></span></div></div></div><div class="cd-caldet">${detail}</div></div>`;
  };
})();
