/* KHL Manager 9.30.0 — «Финансы»: компактная таблица контрактов в одну строку и отдельный столбец «Вторая команда» (ВХЛ / МХЛ).
   Расчёт зарплат и правила отправки во вторую команду прежние (contracts.js). Итоговая строка «Итого» убрана: фонд виден в плитках сверху. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const TYPE_BADGE = { '1-way': 'О', '2-way': 'Д', '3-way': 'Т' };
  const POS_ORDER = { G: 0, D: 1, LW: 2, C: 3, RW: 4 };
  const TYPE_RANK = { '1-way': 1, '2-way': 2, '3-way': 3 };

  proto.finRowsHtml = function () {
    const esc = x => this.escape(String(x));
    const sort = this._finSort || (this._finSort = { key: 'salary', dir: -1 });
    const list = this.teamPlayers(this.state.teamId).map(p => ({
      p, name: p.name, ovr: Math.round(this.permanentOVR(p)), age: Math.floor(this.ageYears(p)), pos: POS_ORDER[p.pos] ?? 9, type: TYPE_RANK[p.contract] ?? 9,
      until: Number.isFinite(Number(p.contractUntil)) ? Number(p.contractUntil) : 9999, salary: this.payrollOf(p), farm: this.isInFarm(p)
    }));
    list.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const c = typeof va === 'string' ? va.localeCompare(vb, 'ru') : va - vb;
      return (c || b.salary - a.salary || a.name.localeCompare(b.name, 'ru')) * (c ? sort.dir : 1);
    });
    const th = (key, label, cls) => {
      const on = sort.key === key;
      return `<th class="${cls || ''} sortable${on ? ' sorted' : ''}" data-fin-sort="${key}" role="button" tabindex="0" title="Сортировать">${label}<span class="sort-arrow">${on ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</span></th>`;
    };
    const posLabel = p => this.positionLabel ? this.positionLabel(p.pos) : p.pos;
    const body = list.map(x => {
      const p = x.p, left = Number.isFinite(Number(p.contractUntil)) && this.contractYearsLeft ? this.contractYearsLeft(p) : null;
      const badge = TYPE_BADGE[p.contract] || '—';
      const until = Number.isFinite(Number(p.contractUntil)) ? `до ${p.contractUntil}` : '—';
      const last = left === 1 ? ' <span class="finx-last">последний</span>' : '';
      const league = this.farmLeague(p);
      let reason = ''; try { reason = this.contractFarmCheck ? (this.contractFarmCheck(p) || '') : ''; } catch (e) { reason = ''; }
      const btn = x.farm
        ? `<button type="button" class="finx-btn in" data-fin-act="recall" data-id="${esc(p.id)}" title="Вернуть в основной состав">${league} · вернуть</button>`
        : `<button type="button" class="finx-btn${reason ? ' dim' : ''}" data-fin-act="send" data-id="${esc(p.id)}" title="${esc(reason || (p.contract === '1-way' ? 'Односторонний контракт: игрока выставят на отказы. ' : '') + 'Во 2-й команде: ' + (this.farmSalary(p) / 1e6).toFixed(1) + ' млн ₽')}">${league}</button>`;
      return `<tr><td class="team-cell finx-name"><b data-pl="${esc(p.id)}">${esc(x.name)}</b>${p.foreign ? ' <span class="finx-chip" title="Легионер">Лег.</span>' : ''}`
        + `<span class="finx-sub">${esc(posLabel(p))} · ${x.age} · ${x.ovr} · ${badge} <span class="${left === 1 ? 'finx-soon' : ''}">${until}</span></span></td>`
        + `<td class="finx-h">${esc(posLabel(p))}</td><td class="finx-h numeric">${x.age}</td><td class="finx-h numeric">${x.ovr}</td>`
        + `<td class="finx-h" title="${esc(this.contractName(p))}"><span class="finx-chip">${badge}</span></td>`
        + `<td class="finx-h${left === 1 ? ' soon' : ''}">${until}${last}</td>`
        + `<td class="numeric"><b>${(x.salary / 1e6).toFixed(1)}</b>${x.farm ? '<span class="finx-note">2-я команда</span>' : ''}</td><td class="finx-act">${btn}</td></tr>`;
    }).join('');
    return `<table class="data-table finx"><thead><tr>${th('name', 'Игрок')}${th('pos', 'Поз.', 'finx-h')}${th('age', 'Возр.', 'finx-h numeric')}${th('ovr', 'Рейт.', 'finx-h numeric')}${th('type', 'Контракт', 'finx-h')}${th('until', 'Срок', 'finx-h')}${th('salary', 'Зарплата (млн ₽)', 'numeric')}<th class="finx-act">Отправить в</th></tr></thead><tbody>${body}</tbody></table>`;
  };

  const base = proto.renderFinances;
  proto.renderFinances = function () {
    const r = base.apply(this, arguments);
    try {
      if (typeof document === 'undefined' || !document.getElementById || !this.state) return r;
      const host = document.getElementById('finance-list'), wrap = host && host.querySelector && host.querySelector('.table-wrap');
      if (wrap) wrap.innerHTML = this.finRowsHtml();
    } catch (e) { console.warn('KHL Manager 9.30 finance:', e); }
    return r;
  };
})();
