/* KHL Manager 7.33 — roster tab redesign, ages and contract terms.
 *  - "Состав": action buttons moved above the line editor, line editor rebuilt (cards in rows,
 *    age/OVR/condition visible, compact bench), age added to the roster list.
 *  - "Развитие": age in the individual plans.
 *  - "Финансы": contract expiry column.
 * Loaded after age_model.js. Only presentation: line logic (assignSlot, saveLineupOnly, resetLineup) is untouched.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;

  /* ---------------- styles ---------------- */
  const css = `
  #roster-actions-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:0 0 1rem;padding:.65rem;border:1px solid var(--line);border-radius:13px;background:var(--t-bg-0a1627);position:sticky;top:0;z-index:5}
  #roster-actions-bar .btn{flex:1 1 150px;min-height:44px}
  #roster-actions-bar .rs-strength{flex:1 1 100%;display:flex;gap:.4rem;flex-wrap:wrap;font-size:.72rem;color:var(--t-fg-9bb4ce)}
  #roster-actions-bar .rs-strength b{color:var(--t-fg-e6f4ff);font-variant-numeric:tabular-nums}
  .rs-board{display:grid;gap:1rem}
  @media(min-width:960px){.rs-board{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start}}
  .rs-block{border:1px solid var(--line);border-radius:13px;padding:.7rem;background:var(--t-bg-0a1627)}
  .rs-block>h3{margin:0 0 .55rem;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;color:var(--t-fg-7fd8ec)}
  .rs-unit{margin-bottom:.6rem}.rs-unit:last-child{margin-bottom:0}
  .rs-unit-head{display:flex;justify-content:space-between;align-items:baseline;font-size:.74rem;color:var(--t-fg-9bb4ce);margin:0 0 .25rem;font-weight:800}
  .rs-unit-head span:first-child{color:var(--t-fg-ccecff)}
  .rs-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem}
  .rs-row.two{grid-template-columns:repeat(2,minmax(0,1fr))}.rs-row.one{grid-template-columns:minmax(0,1fr)}
  @media(min-width:560px){.rs-row.one{grid-template-columns:minmax(0,50%)}}
  .rs-card{position:relative;min-height:88px;border:1px dashed var(--t-bd-3b5876);border-radius:11px;padding:.42rem .45rem .4rem;background:var(--t-bg-0e2034);display:flex;flex-direction:column;gap:.15rem;justify-content:flex-start;min-width:0;transition:.15s}
  .rs-card.drag-over{border-color:var(--cyan);background:var(--t-bg-104056);box-shadow:0 0 0 2px var(--t-sh-35d5ee22)}
  .rs-card.empty{border-style:dotted;opacity:.8}.rs-card.injured{border-color:var(--t-bd-b7791f)}
  .rs-top{display:flex;justify-content:space-between;align-items:center;gap:.3rem}
  .rs-card .slot-label{font-size:.66rem}
  .rs-ovr{font-size:.82rem;font-weight:900;padding:.02rem .38rem;border-radius:7px;background:var(--t-bg-12304a);color:var(--t-fg-e6f4ff);font-variant-numeric:tabular-nums}
  .rs-ovr.high{background:var(--t-bg-0f5132);color:var(--t-fg-b7f7d3)}.rs-ovr.low{background:var(--t-bg-4a2a12);color:var(--t-fg-fcd9b0)}
  .rs-card .slot-player{display:block;font-size:.76rem;font-weight:800;line-height:1.18;overflow-wrap:anywhere;margin:0}
  .rs-meta{font-size:.64rem;color:var(--t-fg-9bb4ce);line-height:1.25;font-variant-numeric:tabular-nums}
  .rs-meta .age{color:var(--t-fg-dbeafe);font-weight:800}
  .rs-leg{white-space:nowrap;font-size:.58rem;font-weight:900;color:var(--t-fg-fbbf24);border:1px solid var(--t-bd-7a5a12);border-radius:5px;padding:0 .2rem;margin-left:.2rem;vertical-align:middle}
  .rs-card .slot-controls{margin-top:auto}
  .rs-card .slot-controls select{min-height:30px;font-size:.66rem;padding:.2rem .3rem}
  @media(pointer:coarse){.rs-card .slot-controls{position:static}.rs-card .slot-controls select{position:absolute;inset:0;width:100%;height:100%;opacity:0;z-index:2;font-size:16px}
    .rs-card::after{content:'⇄';position:absolute;right:.4rem;bottom:.25rem;font-size:.8rem;color:var(--t-fg-5f86a8)}}
  .rs-bench{display:flex;flex-wrap:wrap;gap:.35rem}
  .rs-bench-title{font-size:.72rem;color:var(--t-fg-9bb4ce);margin:.5rem 0 .25rem;font-weight:800}
  .rs-bench .bench-player{min-width:0;padding:.35rem .5rem;min-height:0;border-radius:9px}
  .rs-bench .bench-player b{font-size:.74rem}
  .rs-bench .bench-player .muted{font-size:.64rem}
  .age-chip{display:inline-block;font-size:.66rem;font-weight:800;color:var(--t-fg-bcd3ea);background:var(--t-bg-12304a);border-radius:6px;padding:0 .35rem;margin-left:.3rem;vertical-align:middle}
  #finance-list .data-table{min-width:0!important;width:100%;table-layout:auto}#finance-list .data-table th,#finance-list .data-table td{padding:.5rem .45rem}
  .fin-until{white-space:nowrap}.fin-farm{font-size:.68rem;font-weight:800;color:var(--t-fg-67e8f9);border:1px solid var(--t-bd-1b5267);border-radius:6px;padding:0 .3rem}.fin-bad{color:var(--t-fg-f87171)}.fin-act{font-size:.68rem;padding:.25rem .4rem;min-height:0;white-space:nowrap}@media(max-width:560px){#finance-list .data-table{min-width:0!important;font-size:.68rem}#finance-list .data-table th,#finance-list .data-table td{padding:.4rem .22rem;white-space:normal}#finance-list .fin-until{white-space:normal}}th.sortable{cursor:pointer;user-select:none}th.sortable:hover{color:var(--t-fg-fbbf24)}th.sorted{color:var(--t-fg-fbbf24)}.fin-until.soon{color:var(--t-fg-fbbf24);font-weight:800}.fin-until small{color:var(--t-fg-8fa7be);font-weight:600}
  `;
  const style = document.createElement('style');
  style.id = 'roster-ui-733-css';
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------------- helpers ---------------- */
  const SLOT_LABEL = id => /C$/.test(id) && /^F/.test(id) ? 'Ц' : /LW$/.test(id) ? 'ЛН' : /RW$/.test(id) ? 'ПН'
    : /^D\d+L$/.test(id) ? 'ЛЗ' : /^D\d+R$/.test(id) ? 'ПЗ' : id === 'G' ? 'В' : id;

  /* ---------------- action bar ---------------- */
  proto.ensureRosterActionsBar = function () {
    const view = document.getElementById('view-roster');
    if (!view) return null;
    let bar = document.getElementById('roster-actions-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'roster-actions-bar';
      bar.innerHTML = '<button class="btn btn-primary" onclick="app.saveLineupOnly()">💾 Сохранить состав</button>' +
        '<button class="btn btn-quiet" onclick="app.resetLineup()">↺ Рекомендуемый состав</button>';
      const head = view.querySelector('.section-head');
      view.insertBefore(bar, head);
    }
    return bar;
  };

  /* ---------------- line editor ---------------- */
  proto.renderLineEditorV733 = function () {
    const lineEl = document.getElementById('line-editor');
    if (!lineEl || !this.state) return;
    const id = this.state.teamId;
    if (!this.state.slotAssignments) this.state.slotAssignments = this.buildDefaultSlots(id);
    const all = this.teamPlayers(id);
    const defs = this.slotDefinitions();
    const slots = this.state.slotAssignments;
    const byId = pid => all.find(p => p.id === pid);
    const assigned = new Set(Object.values(slots).filter(Boolean));
    const esc = s => this.escape(String(s));
    const eff = p => Math.round(this.effectiveOVR(p));

    const optionLabel = p => `${p.name} · ${this.ageText(this.ageYears(p))} · OVR ${eff(p)} · ${this.playerRosterSlotStatus(p)}`;
    const card = def => {
      const cur = byId(slots[def.id]);
      const cands = all.filter(p => def.type === 'F' ? ['LW', 'C', 'RW'].includes(p.pos) : p.pos === def.type)
        .sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a));
      const inj = cur && this.hasActiveInjury && this.hasActiveInjury(cur);
      const perm = cur ? this.permanentOVR(cur) : null;
      const cls = cur ? (inj ? 'injured' : '') : 'empty';
      const st = cur && typeof this.schemeState === 'function' ? this.schemeState(cur) : 'ok';
      const stTitle = ({ hot: 'в форме', tired: 'устал', injured: 'травма' })[st] || '';
      const dev = cur ? (this.playerConditionShort ? this.playerConditionShort(cur) : '') : '';
      const body = cur ? `
        <div class="slot-player" draggable="true" data-player-id="${cur.id}" ondragstart="event.dataTransfer.setData('text/player-id','${cur.id}')"
             title="${inj ? esc(this.injuryDescription(cur) || 'Травма') : ''}"><span class="slot-player-name">${esc(cur.name)}${this.kaBadge?this.kaBadge(cur):''}${inj ? ' <span class="injury-mark">🩹</span>' : ''}</span></div>
        <div class="rs-meta"><span class="age">${this.ageText(this.ageYears(cur))}${this.isBirthdayToday(cur)?' 🎂':''}</span> · сейчас ${eff(cur)}<br>${esc(dev)}</div>`
        : `<div class="slot-player"><span class="muted">Свободно</span></div><div class="rs-meta">Перетащи или выбери игрока</div>`;
      return `<div class="line-slot rs-card ${cls}" data-state="${st}"${stTitle ? ` title="${stTitle}"` : ''} data-slot="${def.id}"
          ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')"
          ondrop="event.preventDefault();this.classList.remove('drag-over');app.assignSlot('${def.id}',event.dataTransfer.getData('text/player-id'))">
        <div class="rs-top"><div class="slot-label">${st !== 'ok' ? '<i class="st-sq"></i>' : ''}${SLOT_LABEL(def.id)}${cur && cur.foreign ? '<span class="rs-leg">ЛЕГ</span>' : ''}</div>${cur ? `<span class="rs-ovr ${perm >= 87 ? 'high' : perm < 74 ? 'low' : ''}" title="Постоянный рейтинг">${perm}</span>` : ''}</div>
        ${body}
        <div class="slot-controls"><select aria-label="Игрок на позиции ${SLOT_LABEL(def.id)}" onchange="app.assignSlot('${def.id}',this.value)">
          <option value="">— выбрать —</option>${cands.map(p => `<option value="${p.id}" ${p.id === slots[def.id] ? 'selected' : ''} ${this.hasActiveInjury && this.hasActiveInjury(p) ? 'disabled' : ''}>${esc(optionLabel(p))}</option>`).join('')}
        </select></div></div>`;
    };
    const unitAvg = ids => {
      const ps = ids.map(i => byId(slots[i])).filter(Boolean);
      return ps.length ? Math.round(ps.reduce((s, p) => s + this.effectiveOVR(p), 0) / ps.length) : '—';
    };
    const def = idv => defs.find(x => x.id === idv);
    const fwd = [1, 2, 3, 4].map(i => {
      const ids = [`F${i}LW`, `F${i}C`, `F${i}RW`];
      return `<div class="rs-unit"><div class="rs-unit-head"><span>${i}-е звено</span><span>ср. ${unitAvg(ids)}</span></div><div class="rs-row">${ids.map(x => card(def(x))).join('')}</div></div>`;
    }).join('');
    const dfn = [1, 2, 3].map(i => {
      const ids = [`D${i}L`, `D${i}R`];
      return `<div class="rs-unit"><div class="rs-unit-head"><span>${i}-я пара</span><span>ср. ${unitAvg(ids)}</span></div><div class="rs-row two">${ids.map(x => card(def(x))).join('')}</div></div>`;
    }).join('');
    const benchAll = all.filter(p => !assigned.has(p.id));
    const benchGroup = (title, test) => {
      const list = benchAll.filter(test).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a));
      if (!list.length) return '';
      return `<div class="rs-bench-title">${title} · ${list.length}</div><div class="rs-bench">${list.map(p => `
        <div class="bench-player" data-state="${typeof this.schemeState === 'function' ? this.schemeState(p) : 'ok'}" data-player-id="${p.id}" draggable="true" ondragstart="event.dataTransfer.setData('text/player-id','${p.id}')" title="${esc(this.playerRosterSlotStatus(p))}">
          <b>${esc(p.name)}${this.hasActiveInjury && this.hasActiveInjury(p) ? ' <span class="injury-mark">🩹</span>' : ''}</b>
          <span class="muted">${this.positionLabel(p.pos)} · ${this.ageText(this.ageYears(p))} · OVR ${this.permanentOVR(p)}</span></div>`).join('')}</div>`;
    };
    const bench = benchGroup('Нападающие', p => ['LW', 'C', 'RW'].includes(p.pos)) + benchGroup('Защитники', p => p.pos === 'D') + benchGroup('Вратари', p => p.pos === 'G');
    lineEl.innerHTML = `${typeof this.schemeLegend === 'function' ? this.schemeLegend() : ''}<div class="rs-board">
      <div class="rs-block"><h3>Нападение</h3>${fwd}</div>
      <div>
        <div class="rs-block" style="margin-bottom:1rem"><h3>Защита</h3>${dfn}</div>
        <div class="rs-block" style="margin-bottom:1rem"><h3>Вратарь</h3><div class="rs-row one">${card(def('G'))}</div></div>
        <div class="rs-block" data-dnd-bench="1"><h3>Запас</h3><p class="tiny muted" style="margin:0 0 .2rem">Перетащи игрока на позицию (на телефоне сначала удержи) или выбери его в списке карточки.</p>${bench || '<span class="small muted">Все игроки назначены в схему.</span>'}</div>
      </div></div>`;

    const bar = this.ensureRosterActionsBar();
    const box = document.getElementById('rs-strength');
    if (box && this.getStrength) {
      try {
        const s = this.getStrength(id);
        box.innerHTML = `<div class="rs-tl"><span>Атака</span><b>${Math.round(s.attack)}</b></div><div class="rs-tl"><span>Защита</span><b>${Math.round(s.defense)}</b></div><div class="rs-tl"><span>Вратарь</span><b>${Math.round(s.goalie)}</b></div><div class="rs-tl all"><span>Общая</span><b>${Math.round(s.overall)}</b></div>`;
      } catch (e) { box.textContent = ''; }
    }
    return bar;
  };


  /* ---------------- jersey numbers (8.6) ---------------- */
  const NUM_PREF = { G: [1, 31, 30, 35, 29, 33, 20, 32, 40, 41], D: [2, 3, 4, 5, 6, 7, 8, 24, 25, 26, 27, 28, 44, 55, 77, 91, 51, 52, 53], F: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 37, 38, 39, 42, 43, 47, 48, 49, 50, 61, 63, 64, 71, 72, 73, 74, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 99] };
  proto.applyNumberOverrides = function () {
    if (!this.state || !this.state.numbers) return;
    this.db.players.forEach(p => { const n = this.state.numbers[p.id]; if (n && p.teamId === this.state.teamId) p.number = n; });
  };
  // Раздаёт номера игрокам без номера и разводит дубли; ручные номера не трогает. Возвращает число изменённых.
  // Новичок получает ближайший к своему прежнему свободный номер (7 занят — 17, 27), затем номер по позиции.
  proto.autoAssignNumbers = function (notify) {
    if (!this.state) return 0;
    const mine = this.teamPlayers(this.state.teamId);
    const manual = this.state.numbers || {};
    mine.forEach(p => { if (p.dbNumber === undefined) p.dbNumber = p.number >= 1 && p.number <= 99 ? p.number : null; });
    const used = new Set(), todo = [], kept = {};
    mine.slice().sort((a, b) => (manual[b.id] ? 1 : 0) - (manual[a.id] ? 1 : 0) || this.permanentOVR(b) - this.permanentOVR(a)).forEach(p => {
      if (p.number >= 1 && p.number <= 99 && !used.has(p.number)) { used.add(p.number); kept[p.number] = p; } else todo.push(p);
    });
    const changes = [];
    todo.forEach(p => {
      const grp = p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F', want = p.number >= 1 && p.number <= 99 ? p.number : null;
      let n = null;
      if (want) { for (let k = 1; k <= 9 && !n; k++) for (const c of [want + 10 * k, want - 10 * k]) if (c >= 1 && c <= 99 && !used.has(c)) { n = c; break; } }
      if (!n) n = NUM_PREF[grp].find(x => !used.has(x));
      if (!n) for (let i = 1; i <= 99; i++) if (!used.has(i)) { n = i; break; }
      const holder = want && kept[want] ? kept[want] : null;
      p.number = n; used.add(n); changes.push({ p, n, want, holder });
    });
    if (todo.length) { this.persistQuietly && this.persistQuietly(); }
    if (notify) {
      const txt = changes.slice(0, 3).map(c => c.want && c.holder ? `№${c.want} остался у ${c.holder.name}, ${c.p.name} получил №${c.n}` : `${c.p.name} получил №${c.n}`).join('; ');
      this.setNotice(todo.length ? `Номера исправлены: ${txt}${changes.length > 3 ? ' и ещё ' + (changes.length - 3) : ''}.` : 'У всех игроков уже есть уникальные номера.');
      this.renderNumberEditor();
    }
    return todo.length;
  };
  // Прямая смена номера (с обменом, если номер занят). Из интерфейса вызывается requestPlayerNumber.
  proto.setPlayerNumber = function (pid, raw) {
    if (!this.state) return;
    const n = Math.round(Number(raw));
    const p = this.db.players.find(x => x.id === pid);
    if (!p || p.teamId !== this.state.teamId) return;
    if (!(n >= 1 && n <= 99)) { this.setNotice('Номер должен быть от 1 до 99.'); this.renderNumberEditor(); return; }
    if (!this.state.numbers) this.state.numbers = {};
    const other = this.teamPlayers(this.state.teamId).find(x => x.id !== pid && x.number === n);
    const old = p.number;
    p.number = n; this.state.numbers[pid] = n;
    if (other) { other.number = old || null; if (old) this.state.numbers[other.id] = old; else delete this.state.numbers[other.id]; }
    if (other && !old) this.autoAssignNumbers(false);
    this._numSwap = null;
    this.persistQuietly && this.persistQuietly();
    this.setNotice(other ? `${p.name} → №${n}; ${other.name} → №${other.number}.` : `${p.name}: номер ${n}.`);
    this.renderRoster();
  };
  // Ввод из интерфейса: если номер занят, сначала спрашиваем.
  proto.requestPlayerNumber = function (pid, raw) {
    if (!this.state) return;
    const n = Math.round(Number(raw)), p = this.db.players.find(x => x.id === pid);
    if (!p || p.teamId !== this.state.teamId) return;
    const other = (n >= 1 && n <= 99) ? this.teamPlayers(this.state.teamId).find(x => x.id !== pid && x.number === n) : null;
    if (!other) { this.setPlayerNumber(pid, raw); return; }
    this._numSwap = { pid, n, otherId: other.id };
    this.numberBlockOpen(true); this.renderNumberEditor();
  };
  proto.confirmNumberSwap = function () { const w = this._numSwap; if (w) this.setPlayerNumber(w.pid, w.n); };
  proto.cancelNumberSwap = function () { this._numSwap = null; this.renderNumberEditor(); };
  proto.resetNumbersAsk = function () { this._numReset = true; this.numberBlockOpen(true); this.renderNumberEditor(); };
  proto.resetNumbersCancel = function () { this._numReset = false; this.renderNumberEditor(); };
  // Возвращает исходные номера из базы, стирает ручные и разводит дубли.
  proto.resetNumbersConfirm = function () {
    if (!this.state) return;
    this.state.numbers = {};
    this.teamPlayers(this.state.teamId).forEach(p => { p.number = p.dbNumber !== undefined ? p.dbNumber : p.number; });
    this._numReset = false;
    const n = this.autoAssignNumbers(false);
    this.persistQuietly && this.persistQuietly();
    this.setNotice(n ? `Номера сброшены к исходным, конфликты решены у ${n} игр.` : 'Номера сброшены к исходным.');
    this.renderRoster();
  };
  proto.numberBlockOpen = function (v) {
    if (v !== undefined) { this._numOpen = !!v; try { localStorage.setItem('khl.numOpen', v ? '1' : '0'); } catch (e) {} }
    if (this._numOpen === undefined) { try { this._numOpen = localStorage.getItem('khl.numOpen') === '1'; } catch (e) { this._numOpen = false; } }
    return !!this._numOpen;
  };
  proto.toggleNumberBlock = function () { this.numberBlockOpen(!this.numberBlockOpen()); this.renderNumberEditor(); };
  proto.numberConflicts = function () {
    const mine = this.teamPlayers(this.state.teamId), cnt = {};
    mine.forEach(p => { if (p.number) cnt[p.number] = (cnt[p.number] || 0) + 1; });
    return { cnt, bad: mine.filter(p => !p.number || cnt[p.number] > 1).length, total: mine.length };
  };
  proto.renderNumberEditor = function () {
    const el = document.getElementById('number-editor');
    if (!el || !this.state) return;
    const esc = s => this.escape(String(s));
    const order = { G: 0, D: 1 };
    const mine = this.teamPlayers(this.state.teamId).slice().sort((a, b) => (order[a.pos] ?? 2) - (order[b.pos] ?? 2) || (a.number || 100) - (b.number || 100) || a.name.localeCompare(b.name, 'ru'));
    const c = this.numberConflicts(), open = this.numberBlockOpen(), manual = this.state.numbers || {};
    const head = document.getElementById('number-head'), st = document.getElementById('number-status');
    const word = (n, a, b, d) => n % 10 === 1 && n % 100 !== 11 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : d;
    if (st) { st.textContent = `${c.total} ${word(c.total, 'игрок', 'игрока', 'игроков')} · ${c.bad ? c.bad + ' ' + word(c.bad, 'конфликт', 'конфликта', 'конфликтов') : 'конфликтов нет'} ${open ? '▴' : '▾'}`; st.className = c.bad ? 'bad' : ''; }
    if (head) { head.setAttribute('aria-expanded', open); head.classList.toggle('bad', !!c.bad); }
    el.classList.toggle('hidden', !open);
    if (!open) { el.innerHTML = ''; return; }
    const sw = this._numSwap, other = sw && mine.find(x => x.id === sw.otherId), who = sw && mine.find(x => x.id === sw.pid);
    const dlg = sw && other && who ? `<div class="num-dlg"><b>Номер ${sw.n} занят: ${esc(other.name)}</b><span>Поменяться номерами? Тогда ${esc(other.name)} получит №${who.number || '—'}${who.number ? '' : ' (автоматически)'}.</span><span class="num-btns"><button type="button" class="btn btn-primary" onclick="app.confirmNumberSwap()">Поменяться</button><button type="button" class="btn btn-quiet" onclick="app.cancelNumberSwap()">Отмена</button></span></div>` : '';
    const rst = this._numReset ? `<div class="num-dlg"><b>Сбросить все номера?</b><span>Ручные номера сотрутся, вернутся исходные из базы, дубли будут разведены.</span><span class="num-btns"><button type="button" class="btn btn-primary" onclick="app.resetNumbersConfirm()">Сбросить</button><button type="button" class="btn btn-quiet" onclick="app.resetNumbersCancel()">Отмена</button></span></div>` : '';
    el.innerHTML = `<div class="num-btns"><button type="button" class="btn btn-quiet" onclick="app.autoAssignNumbers(true)">Исправить конфликты</button><button type="button" class="btn btn-quiet" onclick="app.resetNumbersAsk()">Сбросить все автоматически…</button></div>${dlg}${rst}<div class="number-grid">` + mine.map(p => {
      const bad = !p.number || c.cnt[p.number] > 1;
      return `<label class="number-item${bad ? ' bad' : ''}"><span class="number-name">${esc(p.name)} <span class="muted">${this.positionLabel(p.pos)}</span>${manual[p.id] ? ' <span class="num-lock" title="Номер задан вручную">🔒</span>' : ''}</span>` +
        `<input type="number" min="1" max="99" step="1" inputmode="numeric" value="${p.number || ''}" aria-label="Номер: ${esc(p.name)}" onchange="app.requestPlayerNumber('${p.id}',this.value)"></label>`;
    }).join('') + '</div>';
  };

  /* ---------------- roster list: age ---------------- */
  const baseRenderRoster = proto.renderRoster;
  // "№12 · 185 см · 82 кг · хват Л" — only the parts we know (filled club by club from sport-express rosters).
  proto.playerBioText = function (p) {
    const parts = [];
    if (p.number) parts.push('№' + p.number);
    if (p.height) parts.push(p.height + ' см');
    if (p.weight) parts.push(p.weight + ' кг');
    if (p.grip) parts.push('хват ' + p.grip);
    return parts.join(' · ');
  };
  proto.renderRoster = function () {
    baseRenderRoster.apply(this, arguments);
    if (!this.state) return;
    try {
      this.applyNumberOverrides(); this.autoAssignNumbers(false);
      this.renderNumberEditor();
      this.renderLineEditorV733();
      document.querySelectorAll('#roster-groups .player-row[data-player-id]').forEach(row => {
        const p = this.db.players.find(x => x.id === row.dataset.playerId);
        const name = row.querySelector('.player-name');
        if (!p || !name || name.querySelector('.age-chip')) return;
        const chip = document.createElement('span');
        chip.className = 'age-chip';
        chip.textContent = this.ageText(this.ageYears(p)) + (this.isBirthdayToday(p) ? ' 🎂' : '');
        chip.title = p.estimated ? 'Возраст оценочный' : 'Возраст по дате рождения';
        const badge = name.querySelector('.badge');
        if (badge) badge.insertAdjacentElement('afterend', chip); else name.appendChild(chip);
        const ovrEl = row.querySelector('.ovr');
        if (ovrEl && !row.querySelector('.ovr-now')) {
          const perm = this.permanentOVR(p), now = Math.round(this.effectiveOVR(p)), diff = now - perm;
          const wrap = document.createElement('div');
          wrap.className = 'ovr-wrap';
          ovrEl.replaceWith(wrap);
          wrap.appendChild(ovrEl);
          const s = document.createElement('div');
          s.className = 'ovr-now' + (diff > 0 ? ' up' : diff < 0 ? ' down' : '');
          s.textContent = 'OVR · ' + now + (diff > 0 ? ' ▲' : diff < 0 ? ' ▼' : '');
          s.title = 'Динамический рейтинг: постоянный ' + perm + ' с учётом формы, усталости, морали и навыков';
          wrap.appendChild(s);
        }
        const bio = this.playerBioText(p);
        if (bio) {
          const b = document.createElement('span');
          b.className = 'age-chip bio-chip';
          b.textContent = bio;
          chip.insertAdjacentElement('afterend', b);
        }
      });
    } catch (e) { console.warn('KHL Manager 7.33 roster ui:', e); }
  };

  /* ---------------- development plans: age ---------------- */
  const baseRenderDev = proto.renderDevelopment;
  proto.renderDevelopment = function () {
    baseRenderDev.apply(this, arguments);
    if (!this.state) return;
    try {
      document.querySelectorAll('#development-list .dev-card').forEach(card => {
        const m = /setPlayerTraining\('([^']+)'/.exec(card.innerHTML);
        const p = m && this.db.players.find(x => x.id === m[1]);
        const name = card.querySelector('.dev-name');
        if (!p || !name || name.querySelector('.age-chip')) return;
        const chip = document.createElement('span');
        chip.className = 'age-chip';
        chip.textContent = this.ageText(this.ageYears(p)) + (this.isBirthdayToday(p) ? ' 🎂' : '');
        const flag = name.querySelector('.dev-flag');
        if (flag) flag.insertAdjacentElement('afterend', chip); else name.appendChild(chip);
      });
    } catch (e) { console.warn('KHL Manager 7.33 dev ui:', e); }
  };

  /* ---------------- finances: contract term ---------------- */
  proto.renderFinances = function () {
    if (!this.state) return;
    const esc = x => this.escape(String(x));
    const posOrder = { G: 0, D: 1, LW: 2, C: 3, RW: 4 };
        const typeRank = { '1-way': 1, '2-way': 2, '3-way': 3 };
    const players = this.teamPlayers(this.state.teamId).map(p => ({
      p, name: p.name, ovr: Math.round(this.permanentOVR(p)), age: this.ageYears(p),
      pos: posOrder[p.pos] ?? 9, type: typeRank[p.contract] ?? 9,
      until: Number.isFinite(Number(p.contractUntil)) ? Number(p.contractUntil) : 9999, salary: this.payrollOf(p), farm: this.isInFarm(p)
    }));
    const total = players.reduce((s, x) => s + x.salary, 0);
    const cs = this.contractSummary(this.state.teamId);
    const foreign = players.filter(x => x.p.foreign).length;
    const expiring = players.filter(x => this.contractYearsLeft && this.contractYearsLeft(x.p) === 1).sort((a, b) => b.ovr - a.ovr);
    const expSal = expiring.reduce((s, x) => s + x.salary, 0);
    const avgAge = players.length ? players.reduce((s, x) => s + x.age, 0) / players.length : null;
    document.getElementById('finance-metrics').innerHTML = `<div class="fin-title"><h2>Финансы клуба</h2></div>` + [
      ['Зарплатный фонд', `${(total / 1e6).toFixed(1)} млн ₽`],
      ['Легионеры в клубе', `${foreign}`],
      ['Контракты истекают', `${expiring.length} · ${(expSal / 1e6).toFixed(1)} млн`],
      ['Средний возраст команды', avgAge == null ? '—' : avgAge.toFixed(1)]
    ].map(([k, v]) => `<div class="metric"><div class="label">${k}</div><div class="value">${v}</div></div>`).join('');

    const sort = this._finSort || (this._finSort = { key: 'salary', dir: -1 });
    const val = x => sort.key === 'name' ? x.name : x[sort.key];
    players.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb, 'ru') : va - vb;
      return (c || b.salary - a.salary || a.name.localeCompare(b.name, 'ru')) * (c ? sort.dir : 1);
    });
    const seasonsWord = n => n === 1 ? 'сезон' : (n >= 2 && n <= 4 ? 'сезона' : 'сезонов');
    const until = p => {
      if (!Number.isFinite(Number(p.contractUntil))) return '—';
      const left = this.contractYearsLeft(p);
      const cls = left === 1 ? 'fin-until soon' : 'fin-until';
      return `<span class="${cls}">до ${p.contractUntil}<br><small>${left === 1 ? 'последний сезон' : 'ещё ' + left + ' ' + seasonsWord(left)}</small></span>`;
    };
    const th = (key, label, cls) => {
      const on = sort.key === key;
      return `<th class="${cls || ''} sortable${on ? ' sorted' : ''}" data-fin-sort="${key}" role="button" tabindex="0" title="Сортировать">${label}<span class="sort-arrow">${on ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</span></th>`;
    };
    const posLabel = p => this.positionLabel ? this.positionLabel(p.pos) : p.pos;
    const rows = players.map(x => `<tr><td class="team-cell">${esc(x.name)}${x.p.foreign ? ' <span class="muted">· легионер</span>' : ''}${x.farm ? ` <span class="fin-farm">${this.farmLeague(x.p)}</span>` : ''}<br><small class="muted">${esc(posLabel(x.p))} · ${this.ageText(Math.floor(x.age))} · рейтинг <b>${x.ovr}</b></small><br>${x.farm ? `<button class="fin-act" data-fin-act="recall" data-id="${esc(x.p.id)}">Вернуть</button>` : `<button class="fin-act" data-fin-act="send" data-id="${esc(x.p.id)}">В ${this.farmLeague(x.p)}</button>`}</td><td>${esc(posLabel(x.p))}</td><td>${esc(this.contractName(x.p))}</td><td>${until(x.p)}</td><td class="numeric">${(x.salary / 1e6).toFixed(1)}<br><small class="muted">${x.farm ? 'во 2-й команде' : (x.p.contract !== '1-way' ? 'во 2-й: ' + (this.farmSalary(x.p) / 1e6).toFixed(1) : 'млн ₽')}</small></td></tr>`).join('');
    const expRows = expiring.length ? expiring.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(posLabel(x.p))}</td><td>${this.ageText(Math.floor(x.age))}</td><td>${x.ovr}</td><td class="numeric">${(x.salary / 1e6).toFixed(1)} млн ₽</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">В этом сезоне контракты не истекают.</td></tr>';
    const host = document.getElementById('finance-list');
    host.innerHTML = `<p class="small" style="margin:.2rem .2rem .8rem">Односторонних: <b class="${cs.overLimit ? 'fin-bad' : ''}">${cs.oneWay} / ${this.CONTRACT_RULES.oneWayLimit}</b> · двусторонних: <b>${cs.twoWay}</b> · трёхсторонних: <b>${cs.threeWay}</b> · во второй команде: <b>${cs.farm}</b>${cs.overLimit ? ' — <span class="fin-bad">превышен лимит односторонних контрактов</span>' : ''}</p><div class="table-wrap"><table class="data-table"><thead><tr>${th('name', 'Игрок')}${th('pos', 'Позиция')}${th('type', 'Тип контракта')}${th('until', 'Срок контракта')}${th('salary', 'Зарплата', 'numeric')}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="4">Итого</th><th class="numeric">${(total / 1e6).toFixed(1)} млн ₽</th></tr></tfoot></table></div>
      <div class="tiny muted fin-rules" style="margin:.6rem .2rem 0"><b>Как работают контракты</b><ul style="margin:.3rem 0 0;padding-left:1.1rem;display:grid;gap:.25rem"><li><b>Односторонний.</b> Игрок получает полную зарплату в любой команде. Чтобы отправить его во вторую команду, его выставляют на отказы: другой клуб может забрать игрока себе. Травмированного игрока можно отправить без отказов. Таких контрактов не больше 25 на клуб. Игрокам 17–20 лет односторонний контракт не дают.</li><li><b>Двусторонний.</b> Игрока можно отправить во вторую команду (ВХЛ) без согласия. Там клуб платит часть оклада, от 10% до 60% в зависимости от рейтинга.</li><li><b>Трёхсторонний.</b> Правила как у двустороннего, но игроки до 20 лет играют во второй команде в МХЛ.</li></ul></div>`;
    /* 14.6.3: на телефоне игроки показываются карточками, таблица скрыта (CSS) */
    {
      const flt = this._finFilter || 'all', FL = { all: 'Все', exp: 'Истекают', for: 'Легионеры', farm: 'Во 2-й команде' };
      const keep = x => flt === 'exp' ? (this.contractYearsLeft && this.contractYearsLeft(x.p) === 1) : flt === 'for' ? !!x.p.foreign : flt === 'farm' ? x.farm : true;
      const SK = { salary: 'Зарплата', ovr: 'Рейтинг', age: 'Возраст', until: 'Контракт', name: 'Имя' };
      const chips = `<div class="fin-chips">${Object.entries(FL).map(([k, v]) => `<button type="button" data-fin-flt="${k}" aria-pressed="${flt === k}">${v}</button>`).join('')}</div><div class="fin-chips"><span>Сортировка:</span>${Object.entries(SK).map(([k, v]) => `<button type="button" data-fin-sort="${k}" aria-pressed="${sort.key === k}">${v}${sort.key === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button>`).join('')}</div>`;
      const list = players.filter(keep);
      const card = x => {
        const left = Number.isFinite(Number(x.p.contractUntil)) && this.contractYearsLeft ? this.contractYearsLeft(x.p) : null;
        const term = Number.isFinite(Number(x.p.contractUntil)) ? `до ${x.p.contractUntil}${left === 1 ? ' · последний сезон' : left ? ' · ещё ' + left + ' ' + seasonsWord(left) : ''}` : '—';
        return `<div class="fin-card"><div class="fc-a"><b>${esc(x.name)}${x.p.foreign ? ' <i class="fc-tag">Лег.</i>' : ''}${x.farm ? ` <i class="fc-tag y">${this.farmLeague(x.p)}</i>` : ''}</b><span class="fc-s">${(x.salary / 1e6).toFixed(1)} <small>млн</small></span></div>
          <div class="fc-m"><span>${esc(posLabel(x.p))} · ${this.ageText(Math.floor(x.age))} · рейтинг ${x.ovr}</span><span>${esc(this.contractName(x.p))}</span></div>
          <div class="fc-m"><span class="${left === 1 ? 'fin-until soon' : ''}">${term}</span>${x.farm ? `<button class="fin-act" data-fin-act="recall" data-id="${esc(x.p.id)}">Вернуть</button>` : `<button class="fin-act" data-fin-act="send" data-id="${esc(x.p.id)}">В ${this.farmLeague(x.p)}</button>`}</div></div>`;
      };
      const wrap = host.querySelector('.table-wrap');
      if (wrap) wrap.insertAdjacentHTML('beforebegin', `<div class="fin-cards">${chips}${list.map(card).join('') || '<p class="muted small">Подходящих игроков нет.</p>'}<p class="small fc-total">Итого: <b>${(list.reduce((a, x) => a + x.salary, 0) / 1e6).toFixed(1)} млн ₽</b></p></div>`);
    }
    if (!host._finSortBound) {
      host._finSortBound = true;
      const handle = ev => {
        const t = ev.target.closest && ev.target.closest('[data-fin-sort]');
        if (!t) return;
        if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        const key = t.getAttribute('data-fin-sort'), cur = this._finSort;
        this._finSort = cur.key === key ? { key, dir: -cur.dir } : { key, dir: (key === 'salary' || key === 'ovr') ? -1 : 1 };
        this.renderFinances();
      };
      host.addEventListener('click', ev => {
        const fl = ev.target.closest && ev.target.closest('[data-fin-flt]');
        if (fl) { ev.preventDefault(); this._finFilter = fl.getAttribute('data-fin-flt'); this.renderFinances(); return; }
        const b = ev.target.closest && ev.target.closest('[data-fin-act]');
        if (b) { ev.preventDefault(); const id = b.getAttribute('data-id'); if (b.getAttribute('data-fin-act') === 'send') this.sendToFarm(id); else this.recallFromFarm(id); return; }
        handle(ev);
      });
      host.addEventListener('keydown', handle);
    }
  };
})();
