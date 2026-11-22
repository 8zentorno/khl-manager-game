/* KHL Manager — экран подтверждения призового фонда плей-офф (js/features/playoff_prize.js).
 * «Последний управленческий экран сезона»: появляется автоматически после завершения Кубка Гагарина,
 * если клуб прошёл дальше 1/8 финала. Слайдер живо пересчитывает таблицу долей на каждый тик (partial
 * refresh #pp-dyn, чтобы не терять фокус слайдера), ограничения (≥60% состава, max/min ≤ 4) выполняются
 * структурно самим расчётом — слайдеру не нужна отдельная проверка диапазона. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  const A = () => (typeof app !== 'undefined' ? app : null);
  const esc = (app, x) => app.escape ? app.escape(String(x)) : String(x);
  const fm = v => (v / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const STAGE_LABEL = { r2: 'до 1/4 финала', sf: 'до полуфинала', fin: 'до финала', cup: 'выиграл Кубок Гагарина' };

  proto.ppTableHtml = function (calc) {
    const my = this.state.teamId;
    const posLabel = p => this.positionLabel ? this.positionLabel(p.pos) : p.pos;
    const rows = this.playoffPrizeRoster(my).slice()
      .sort((a, b) => (calc.shares[b.id] || 0) - (calc.shares[a.id] || 0) || b.salary - a.salary);
    const body = rows.map(p => {
      const share = calc.shares[p.id] || 0;
      return `<tr><td class="team-cell"><b data-pl="${esc(this, p.id)}">${esc(this, p.name)}</b><span class="finx-sub">${esc(this, posLabel(p))}</span></td>`
        + `<td class="numeric">${(p.salary / 1e6).toFixed(1)}</td><td class="numeric">${share > 0 ? '<b>' + (share / 1e6).toFixed(1) + '</b>' : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data-table tr-tbl"><thead><tr><th>Игрок</th><th class="numeric">Зарплата, млн</th><th class="numeric">Доля, млн</th></tr></thead><tbody>${body}</tbody></table></div>`;
  };
  proto.ppDynHtml = function (k) {
    const my = this.state.teamId, calc = this.playoffPrizeCalc(my, k);
    const pct = calc.total ? Math.round(100 * calc.included / calc.total) : 0;
    return `<div class="small muted pp-sum">Получат долю: <b>${calc.included}</b> из ${calc.total} игроков (${pct}%, минимум 60%) · разброс максимум/минимум: <b>${calc.ratio.toFixed(1)}×</b> (не выше 4×)</div>`
      + this.ppTableHtml(calc);
  };
  proto.ppShowModal = function () {
    if ($('pp-ov') || !this.playoffPrizePending()) return;
    const my = this.state.teamId, pot = this.playoffPrizePotFor(my), stageKey = this.playoffPrizeStageKey(my);
    const k0 = 0.5;
    const el = document.createElement('div'); el.id = 'pp-ov'; el.className = 'tr-ov';
    el.innerHTML = `<div class="tr-card pp-card" role="dialog" aria-modal="true"><h2>Призовой фонд плей-офф</h2>`
      + `<p class="small muted">Клуб ${esc(this, STAGE_LABEL[stageKey] || '')}. Фонд <b>${fm(pot)}</b> — целиком <b>вне потолка</b> зарплат, живые деньги. Распредели между игроками состава.</p>`
      + `<div class="mk-ctl"><label>Ровные доли ↔ звёзды: <b id="pp-klabel">${Math.round(k0 * 100)}%</b></label><input type="range" id="pp-k" min="0" max="100" value="${Math.round(k0 * 100)}"></div>`
      + `<div id="pp-dyn">${this.ppDynHtml(k0)}</div>`
      + `<div class="tr-acts"><button class="btn btn-primary" data-pp="confirm">Подтвердить распределение</button></div></div>`;
    document.body.appendChild(el);
  };

  document.addEventListener('input', e => {
    const t = e.target; if (!t || t.id !== 'pp-k') return;
    const a = A(); if (!a || !a.state) return;
    const k = Number(t.value) / 100;
    const lbl = $('pp-klabel'); if (lbl) lbl.textContent = Math.round(k * 100) + '%';
    const dyn = $('pp-dyn'); if (dyn) dyn.innerHTML = a.ppDynHtml(k);
  });
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('[data-pp]') : null; if (!b) return;
    const a = A(); if (!a || !a.state) return;
    if (b.dataset.pp === 'confirm') {
      const slider = $('pp-k'), k = slider ? Number(slider.value) / 100 : 0.5;
      a.playoffPrizeConfirm(k);
      const ov = $('pp-ov'); if (ov) ov.remove();
      a.persistQuietly && a.persistQuietly(); a.renderAll();
    }
  });

  const _ra = proto.renderAll;
  proto.renderAll = function () {
    const r = _ra.apply(this, arguments);
    if (!this.state) return r;
    try {
      if (this.playoffPrizeAiTick) this.playoffPrizeAiTick();
      if (this.playoffPrizePending && this.playoffPrizePending()) this.ppShowModal();
    } catch (e) { console.warn('KHL Manager playoff_prize_ui:', e); }
    return r;
  };
})();
