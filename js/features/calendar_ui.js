/* KHL Manager 9.35.0 — вкладка «Календарь»: список по месяцам, сыгранные матчи свёрнуты, фильтры,
   результат с пометкой ОТ/Б, переход к итогам матча по клику. Отдых показывается только когда он необычный. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const FLT = [['all', 'Все'], ['todo', 'Предстоящие'], ['done', 'Сыграно'], ['home', 'Дома'], ['away', 'В гостях']];
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };

  proto.calUI = function () { return this._calUI || (this._calUI = { flt: 'all', open: false }); };
  proto.calDate = function (offset) {
    const d = new Date(`${this.state?.seasonStart || '2026-09-03'}T12:00:00`); d.setDate(d.getDate() + offset);
    return { d, day: d.getDate(), mon: MS[d.getMonth()], wd: WD[d.getDay()], key: d.getFullYear() * 12 + d.getMonth(), title: `${MON[d.getMonth()]} ${d.getFullYear()}` };
  };

  proto.calRows = function () {
    const s = this.state, uid = s.teamId;
    const all = s.matches.filter(m => !m.cancelled && (m.homeId === uid || m.awayId === uid) && (typeof this.poGameVisible !== 'function' || this.poGameVisible(m))).sort((a, b) => a.dateOffset - b.dateOffset);
    // обычный отдых между матчами = самый частый промежуток
    const gaps = {}; all.forEach((m, i) => { if (i) { const g = m.dateOffset - all[i - 1].dateOffset - 1; gaps[g] = (gaps[g] || 0) + 1; } });
    const usual = Object.keys(gaps).sort((a, b) => gaps[b] - gaps[a])[0];
    const next = all.find(m => !m.played);
    return all.map((m, i) => ({ m, rest: i ? m.dateOffset - all[i - 1].dateOffset - 1 : null, usual: usual == null ? null : Number(usual), next: m === next }));
  };

  proto.renderSchedule = function () {
    const box = document.getElementById('schedule-list');
    if (!this.state || !box) return;
    const ui = this.calUI(), uid = this.state.teamId, esc = x => this.escape(x);
    const rows = this.calRows();
    const keep = r => ui.flt === 'todo' ? !r.m.played : ui.flt === 'done' ? r.m.played : ui.flt === 'home' ? r.m.homeId === uid : ui.flt === 'away' ? r.m.awayId === uid : true;
    const list = rows.filter(keep), played = rows.filter(r => r.m.played).length;
    const fold = ui.flt === 'all' && !ui.open && played > 1;
    const rowHtml = r => {
      const m = r.m, mine = m.homeId === uid, opp = this.teamById(mine ? m.awayId : m.homeId), dt = this.calDate(m.dateOffset);
      const round = Number(m.round) || Number((String(m.id || '').match(/^m(\d+)_/) || [])[1] || 0);
      const stage = m.playoff ? this.playoffStageName(m.playoffStage) : (this.state.calendar ? 'Игровой день' : `тур ${round}`);
      const my = mine ? Number(m.homeScore) : Number(m.awayScore), th = mine ? Number(m.awayScore) : Number(m.homeScore), won = my > th;
      const tail = m.so ? ' Б' : m.ot ? ' ОТ' : '';
      const resHtml = m.played
        ? `<div class="cal-res ${won ? 'w' : 'l'}">${m.homeScore}:${m.awayScore}<i aria-hidden="true">›</i><small>${won ? 'победа' : 'поражение'}${tail}</small></div>`
        : '<div class="cal-res n">—</div>';
      const rest = '';
      const ha = `<span class="cal-ha ${mine ? 'h' : ''}">${mine ? 'Д' : 'Г'}</span>`;
      return `<div class="cal-row${r.next ? ' today next-scheduled-match' : ''}${m.played ? ' done' : ''}"${m.played ? ` role="button" tabindex="0" data-cal-open="${esc(m.id)}"` : ''}>` +
        `<div class="cal-d">${dt.day} ${dt.mon}<small>${dt.wd}${r.next ? ' · ближайший' : ''}</small></div>` +
        `<div class="cal-t">${esc(stage)}</div><div class="cal-hac">${ha}</div>` +
        `<div class="cal-opp"><b>${esc(opp?.name || 'Неизвестный соперник')}</b>${rest ? `<small>${rest}</small>` : ''}</div>${resHtml}</div>`;
    };
    let body = '', cur = null, folded = false; const shownPause = new Set();
    for (const r of list) {
      if (fold && r.m.played) { if (!folded) { folded = true; body += `<button type="button" class="cal-fold" data-cal-fold="1">Сыграно ${played} ${plural(played, 'матч', 'матча', 'матчей')}: показать</button>`; } continue; }
      const dt = this.calDate(r.m.dateOffset);
      if (this.calendarPauses && (ui.flt === 'all' || ui.flt === 'todo')) {
        for (const p of this.calendarPauses()) {
          if (shownPause.has(p.from) || r.m.dateOffset <= p.to) continue;
          shownPause.add(p.from);
          if (fold && p.to < Number(this.state.dayIndex || 0)) continue;
          body += `<div class="cal-pause"><span><b>⏸ ${esc(p.name)}</b></span><span>${esc(p.short)} · матчей лиги нет</span></div>`;
        }
      }
      if (dt.key !== cur) { cur = dt.key; const n = list.filter(x => this.calDate(x.m.dateOffset).key === cur).length; body += `<div class="cal-mon"><span>${dt.title}</span><span>${n} ${plural(n, 'матч', 'матча', 'матчей')}</span></div>`; }
      body += rowHtml(r);
    }
    if (!list.length) body = '<div class="cal-empty muted">По этому фильтру матчей нет.</div>';
    const unfold = ui.flt === 'all' && ui.open && played > 1 ? '<button type="button" class="cal-fold" data-cal-fold="0">Свернуть сыгранные</button>' : '';
    box.innerHTML = `<div class="cal-flt" role="group" aria-label="Фильтр матчей">${FLT.map(([k, l]) => `<button type="button" data-cal-flt="${k}" class="${ui.flt === k ? 'on' : ''}">${l}</button>`).join('')}</div>` +
      `<div class="cal-list">${unfold}${body}</div>`;
    if (!box._calBound) {
      box._calBound = true;
      const open = id => {
        const m = this.state.matches.find(x => x.id === id); if (!m || !m.played) return;
        this.currentMatchId = id; this.switchTab('match'); try { this.renderMatchCenter(); } catch (e) {}
      };
      box.addEventListener('click', ev => {
        const f = ev.target.closest('[data-cal-flt]'); if (f) { const u = this.calUI(); u.flt = f.dataset.calFlt; u.open = false; this.renderSchedule(); return; }
        const g = ev.target.closest('[data-cal-fold]'); if (g) { this.calUI().open = g.dataset.calFold === '0' ? false : true; this.renderSchedule(); return; }
        const o = ev.target.closest('[data-cal-open]'); if (o) open(o.dataset.calOpen);
      });
      box.addEventListener('keydown', ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const o = ev.target.closest && ev.target.closest('[data-cal-open]'); if (o) { ev.preventDefault(); open(o.dataset.calOpen); } });
    }
  };
})();
