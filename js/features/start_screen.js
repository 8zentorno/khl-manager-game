/* KHL Manager 9.10.0 — экран «Выбери свой клуб»: список по дивизионам, карточка с местами в лиге. */
(function () {
  const proto = KHLManagerApp.prototype;
  const DIV_ORDER = ['Bobrov', 'Tarasov', 'Kharlamov', 'Chernyshev'];
  const CONF = { West: 'Запад', East: 'Восток' };

  proto.startTeamStrengths = function () {
    const out = {};
    for (const t of this.db.teams) out[t.id] = this.getStrength(t.id);
    return out;
  };

  proto.loadTeamOptions = function () {
    const sel = document.getElementById('select-team'); if (!sel) return;
    const old = sel.value || (() => { try { return localStorage.getItem('khl-last-club') || ''; } catch (e) { return ''; } })();
    sel.innerHTML = '';
    let st = {}; try { st = this.startTeamStrengths(); } catch (e) { st = {}; }
    const divs = [...new Set(this.db.teams.map(t => t.div))].sort((a, b) => (DIV_ORDER.indexOf(a) + 99) % 99 - (DIV_ORDER.indexOf(b) + 99) % 99);
    for (const d of divs) {
      const list = this.db.teams.filter(t => t.div === d).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      if (!list.length) continue;
      const g = document.createElement('optgroup');
      g.label = `${CONF[list[0].conf] || ''} · Дивизион ${this.divisionName(d)}`;
      for (const t of list) {
        const o = document.createElement('option'); o.value = t.id;
        o.textContent = t.name;
        g.appendChild(o);
      }
      sel.appendChild(g);
    }
    if (this.db.teams.some(t => t.id === old)) sel.value = old;
    const btn = document.getElementById('btn-start-career');
    if (btn) { const t = this.teamById(sel.value); if (t) btn.textContent = `Начать за ${t.name}`; }
  };

  proto.previewTeam = function () {
    const sel = document.getElementById('select-team'), el = document.getElementById('team-preview');
    const id = sel?.value, t = this.teamById(id); if (!t || !el) return;
    const esc = s => this.escape(String(s));
    const all = this.startTeamStrengths(), s = all[id];
    const players = this.teamPlayers(id), legs = players.filter(p => p.foreign).length;
    const coach = t.coach || '—', interim = /\(и\.о\.\)/.test(coach);
    const coachName = coach.replace(/\s*\(и\.о\.\)/, '');
    const bar = (label, key) => `<div style="margin:.42rem 0">${this.strengthBar(label, s[key])}</div>`;
    el.innerHTML = `<h3 style="font-size:1.35rem;margin:0 0 .4rem">${esc(t.name)}</h3>
      <div class="st-chips"><span>${esc(CONF[t.conf] || '')}</span><span>Дивизион ${esc(this.divisionName(t.div))}</span><span>Тренер: ${esc(coachName)}${interim ? ' (и.о.)' : ''}</span></div>
      <div class="metric-row" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:.9rem"><div class="metric"><div class="label">Общая сила</div><div class="value">${Math.round(s.overall)}</div></div><div class="metric"><div class="label">Игроки</div><div class="value">${players.length}</div><div class="tiny muted">из них ${legs} легионер${legs === 1 ? '' : (legs >= 2 && legs <= 4 ? 'а' : 'ов')}</div></div></div>
      <div style="margin-top:.85rem">${bar('Атака', 'attack')}${bar('Защита', 'defense')}${bar('Вратари', 'goalie')}</div>
      ${(() => { const a = this.stadiumFor(id) || {}; return `<div class="st-arena"><div class="eyebrow">Домашняя арена</div><div class="st-arena-name">${esc(a.name || '—')}</div>${this.crowdArt(id, 0.66)}<div class="st-chips"><span>📍 ${esc(a.city || '')}</span><span>🏟️ вместимость ${(a.capacity || 0).toLocaleString('ru-RU')}</span></div></div>`; })()}`;
    const btn = document.getElementById('btn-start-career');
    if (btn) btn.textContent = `Начать за ${t.name}`;
    try { localStorage.setItem('khl-last-club', id); } catch (e) { }
  };
})();
