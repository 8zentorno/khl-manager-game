/* 15.3.0: бюджеты и зарплатные вилки клубов ВХЛ (budget/payroll/salMin/salMax — поля в VHL_DATABASE.teams).
   Данные по открытым источникам (ноябрь 2026); у клубов без точных цифр — сгенерированы по тиру (детерминированно). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const esc = (app, s) => (app.escape ? app.escape(s) : String(s));

  proto.vClubFinanceHtml = function (id) {
    const t = this.vhlTeamById(id); if (!t || t.budget == null) return '';
    const farm = t.farmOf ? (this.teamById ? this.teamById(t.farmOf) : null) : null;
    const farmTxt = farm ? `Фарм-клуб «${esc(this, farm.name)}» — часть платёжки фактически несёт материнский клуб КХЛ.` : '';
    const kpi = (val, lab) => `<div class="cd-kpi"><b>${val}</b><span>${lab}</span></div>`;
    return `<div class="cd-box"><h4>Финансы клуба</h4><div class="cd-kpis">`
      + kpi(t.budget + ' млн ₽', 'Бюджет/год')
      + kpi(t.payroll.toFixed(1) + ' млн ₽', 'ФЗП/год')
      + kpi(t.salMin + '–' + t.salMax, 'Оклады, тыс.₽/мес')
      + `</div>${t.note ? `<p class="small muted" style="margin-top:.4rem">${esc(this, t.note)}</p>` : ''}${farmTxt ? `<p class="small muted">${farmTxt}</p>` : ''}</div>`;
  };

  const base = proto.vClubOverviewHtml;
  proto.vClubOverviewHtml = function (id, c) {
    const html = base.apply(this, arguments);
    const fin = this.vClubFinanceHtml(id);
    if (!fin || !html.endsWith('</div>')) return html;
    // html = <div class="cd-grid">...</div>; вставляем блок финансов как последний cd-box перед закрытием cd-grid
    return html.slice(0, -'</div>'.length) + fin + '</div>';
  };
})();
