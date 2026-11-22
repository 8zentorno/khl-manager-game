/* 15.11.0: «Матч-центр» для отдельного сыгранного матча ВХЛ — концепт/первая версия полноценного
 * просмотра матча, визуально по образцу КХЛ (те же классы: match-hero, mc-goals, mc-tag, event-list,
 * rink), но отдельным, самостоятельным модальным окном — не трогает существующий экран матч-центра
 * КХЛ (match_center.js/live_rink.js), который завязан на state.matches/currentMatchId/liveMatch.
 * Доступен из карточки любого клуба ВХЛ (календарь → «🏒 Матч-центр» у уже сыгранного матча) — это
 * общий, не завязанный на свою/чужую лигу экран, поэтому работает и во время карьеры за клуб КХЛ
 * (матчи фарма/любого клуба ВХЛ), и во время карьеры за клуб ВХЛ одинаково.
 *
 * Важное ограничение, честно: это НЕ повторная симуляция матча заново (счёт ВХЛ уже определён и
 * зафиксирован в v.r[m.i] лёгкой моделью vhlSimMatch — таблица и статистика сезона строятся по нему).
 * Здесь тот же итоговый счёт детально «расписывается» по авторам голов/передач/времени/месту броска,
 * плюс отдельно генерируются удаления (ВХЛ не хранит их по игроку вообще) — детерминированно (свой
 * сид, не пересекается с сидом счёта), так что при повторном открытии того же матча раскладка не
 * меняется. Это осознанно НЕ живой ход событий: нет бригад большинства/меньшинства, нет привязки
 * голов к текущим удалениям, нет покадрового броска за броском.
 *
 * 15.12.0: визуал приведён к образцу КХЛ — реальные эмблемы клубов (vClubEmblemSvg), кликабельные
 * ссылки на клубы и авторов голов/передач (vClubLink/vPlayerLink), площадка в стиле КХЛ (рамка,
 * вратарские площадки, круги вбрасывания) и статичная шкала «Минута матча» под площадкой (голы +
 * удаления, без живого хода событий). Раздел «Хронология матча» убран — все события показаны в
 * «Минуте матча» и в списках голов. Броски по периодам — правдоподобная оценка (как и у вратарской
 * статистики ВХЛ в принципе), не точный подсчёт.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const esc = (app, s) => (app.escape ? app.escape(s) : String(s));

  // 15.14.4: та же геометрия площадки 900×420, что и в vhlMcDrawRink (L/T/W/H/CY/GL/GR) — раньше
  // раскладка шайб считалась через общий this.mcLayout, но этот прототип переопределяется позже
  // в live_rink.js под РЕАЛЬНУЮ геометрию коробки 60×22,86 м (другие GXL/GXR/CY и масштаб KX/KY),
  // и именно та версия побеждала (последнее определение метода). В результате голы рисовались по
  // чужим координатам — шайбы оказывались у бортов за воротами вместо своих зон броска. Теперь
  // раскладка — собственная функция модуля ВХЛ, не зависящая от того, что определено в других
  // файлах матч-центра КХЛ, и не переопределяется ничем, что грузится после.
  const RL = 42, RT = 38, RW = 816, RH = 344, RCY = RT + RH / 2, RGL = RL + RW * .17, RGR = RL + RW * .83;
  function vhlLayoutGoals(goals) {
    const pts = goals.map(g => { const dx = g.e.shotDx, dy = g.e.shotDy; return { g, x: g.home ? RGR - dx : RGL + dx, y: RCY + dy }; });
    const D = 32;
    for (let it = 0; it < 30; it++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j]; let vx = b.x - a.x, vy = b.y - a.y, d = Math.hypot(vx, vy);
        if (d >= D) continue; moved = true;
        if (d < .01) { vx = 1; vy = (j % 2 ? 1 : -1) * .6; d = Math.hypot(vx, vy); }
        const k = (D - d) / 2 / d; a.x -= vx * k; a.y -= vy * k; b.x += vx * k; b.y += vy * k;
      }
      if (!moved) break;
    }
    for (const p of pts) { p.x = Math.max(RL + 20, Math.min(RL + RW - 20, p.x)); p.y = Math.max(RT + 20, Math.min(RT + RH - 20, p.y)); }
    return pts;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  proto.vhlSimFullMatch = function (m) {
    if (!this.vhlAvailable() || !m) return null;
    const v = this.vhlState(); if (!v) return null;
    // 15.14.2: игра плей-офф (m.po) не лежит в v.r — счёт уже известен прямо в m (см. vhlPoGameMatch
    // в vhl_model.js); для обычного матча регулярки, как и раньше, достаём счёт из v.r[m.i].
    const r = m.po ? [m.hs, m.as, m.ot] : v.r[m.i]; if (!r) return null;
    this._vhlFullCache = this._vhlFullCache || {};
    if (this._vhlFullCache[m.i]) return this._vhlFullCache[m.i];
    const [hs, as, ot] = r;
    // m.i у игры плей-офф — строка ("po_ri_si_gi"), а не число: makeStableHash переводит её в число
    // для сида так же стабильно, как умножение числового индекса регулярки.
    const seed = (((v.seed ^ (typeof m.i === 'number' ? (m.i * 2654435761) : this.makeStableHash(String(m.i)))) >>> 0) ^ 0x51ed270b) >>> 0;
    const rnd = mulberry32(seed);
    const H = this.vhlClubStrength(m.h), A = this.vhlClubStrength(m.a);
    const topSkaters = S => S.roster.filter(x => x.p.pos !== 'G').sort((a, b) => b.ovr - a.ovr).slice(0, 18);
    const skH = topSkaters(H), skA = topSkaters(A);
    const wH = skH.map(x => this.vhlScorerWeight(x, m.h));
    const wA = skA.map(x => this.vhlScorerWeight(x, m.a));
    const pick = (sk, w, used) => {
      let tot = 0; for (let i = 0; i < sk.length; i++) if (!used.has(i)) tot += w[i];
      if (tot <= 0) return -1;
      let x = rnd() * tot;
      for (let i = 0; i < sk.length; i++) { if (used.has(i)) continue; x -= w[i]; if (x <= 0) return i; }
      return -1;
    };
    // при ОТ/буллитах счёт перед решающим броском был равным — остальные голы распределяем по основному времени
    const regH = ot ? Math.min(hs, as) : hs, regA = ot ? Math.min(hs, as) : as;
    const times = [];
    for (let i = 0; i < regH; i++) times.push({ home: true, t: rnd() * 59.8 });
    for (let i = 0; i < regA; i++) times.push({ home: false, t: rnd() * 59.8 });
    times.sort((a, b) => a.t - b.t);
    for (let i = 1; i < times.length; i++) if (times[i].t < times[i - 1].t + 0.6) times[i].t = times[i - 1].t + 0.6;
    for (let i = times.length - 1; i >= 0; i--) { const cap = i === times.length - 1 ? 59.6 : times[i + 1].t - 0.6; if (times[i].t > cap) times[i].t = cap; }

    const events = [];
    const goalEvent = (home, period, timeStr) => {
      const sk = home ? skH : skA, w = home ? wH : wA, clubId = home ? m.h : m.a;
      const used = new Set();
      const si = pick(sk, w, used); if (si >= 0) used.add(si);
      const scorer = si >= 0 ? sk[si].p : null;
      let a1 = null, a2 = null;
      if (scorer && rnd() < 0.82) {
        const ai = pick(sk, w, used);
        if (ai >= 0) { a1 = sk[ai].p; used.add(ai); if (rnd() < 0.55) { const aj = pick(sk, w, used); if (aj >= 0) a2 = sk[aj].p; } }
      }
      events.push({ kind: 'goal', teamId: clubId, scorerId: scorer ? scorer.id : null, assist1Id: a1 ? a1.id : null, assist2Id: a2 ? a2.id : null, period, time: timeStr, powerPlay: false, shortHanded: false, emptyNet: false, penaltyShot: false });
    };
    times.forEach(x => {
      const min = Math.max(0, Math.min(59, Math.floor(x.t))), sec = Math.floor((x.t % 1) * 60);
      goalEvent(x.home, `${Math.min(3, Math.floor(min / 20) + 1)}П`, `${String(min % 20).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    });
    if (ot === 1) {
      const homeWon = hs > as, ott = rnd() * 4.8, mm = Math.floor(ott), ss = Math.floor((ott % 1) * 60);
      goalEvent(homeWon, 'ОТ', `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    } else if (ot === 2) {
      const homeWon = hs > as, sk = homeWon ? skH : skA, w = homeWon ? wH : wA;
      const si = pick(sk, w, new Set()), scorer = si >= 0 ? sk[si].p : null;
      events.push({ kind: 'goal', teamId: homeWon ? m.h : m.a, scorerId: scorer ? scorer.id : null, assist1Id: null, assist2Id: null, period: 'Б', time: '00:00', powerPlay: false, shortHanded: false, emptyNet: false, penaltyShot: true, shootoutWinner: true });
    }
    const matchStub = { id: `vhl_mc_${m.i}` };
    events.forEach((e, idx) => this.ensureGoalPlace(matchStub, e, idx + 1));

    /* Удаления: ВХЛ вообще не ведёт штрафное время по игроку (нет поля ни в v.ps, ни где-либо ещё) —
     * это чистая генерация для хронологии и статистики матча, не связанная со счётом и не меняющая
     * результат. Без бригад большинства/меньшинства: нужна была хронология «голы + удаления», а не
     * живой ход матча с перевесом составов. */
    const PEN_MINOR = ['Задержка клюшкой', 'Подножка', 'Задержка руками', 'Грубость', 'Атака соперника без шайбы', 'Высоко поднятая клюшка', 'Толчок на борт', 'Задержка соперника', 'Нарушение численного состава'];
    const PEN_MAJOR = ['Грубая игра — большой штраф', 'Удар клюшкой — большой штраф'];
    const penaltyEvent = (home, period, timeStr) => {
      const sk = home ? skH : skA, w = home ? wH : wA, clubId = home ? m.h : m.a;
      const si = pick(sk, w, new Set());
      const pl = si >= 0 ? sk[si].p : null;
      const major = rnd() < 0.07;
      const minutes = major ? 5 : 2;
      const violation = major ? PEN_MAJOR[Math.floor(rnd() * PEN_MAJOR.length)] : PEN_MINOR[Math.floor(rnd() * PEN_MINOR.length)];
      events.push({ kind: 'penalty', teamId: clubId, playerId: pl ? pl.id : null, period, time: timeStr, minutes, violation });
    };
    [true, false].forEach(home => {
      const n = 2 + Math.floor(rnd() * 4); // 2–5 удалений за команду — правдоподобная оценка, не точный подсчёт
      for (let i = 0; i < n; i++) {
        const t = rnd() * 59.8, min = Math.floor(t), sec = Math.floor((t % 1) * 60);
        penaltyEvent(home, `${Math.min(3, Math.floor(min / 20) + 1)}П`, `${String(min % 20).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
      }
    });
    const PERIOD_RANK = { '1П': 0, '2П': 1, '3П': 2, 'ОТ': 3, 'Б': 4 };
    const timeline = events.slice().sort((a, b) => {
      const pr = (PERIOD_RANK[a.period] ?? 9) - (PERIOD_RANK[b.period] ?? 9);
      return pr !== 0 ? pr : String(a.time).localeCompare(String(b.time));
    });
    const pimOf = home => events.filter(e => e.kind === 'penalty' && (e.teamId === m.h) === home).reduce((s, e) => s + e.minutes, 0);
    // броски по периодам — правдоподобная оценка (ВХЛ не хранит их по отдельному матчу, только агрегат сезона у вратаря)
    const goalsPerPeriod = home => { const g = [0, 0, 0]; events.forEach(e => { const i = e.period === '1П' ? 0 : e.period === '2П' ? 1 : e.period === '3П' ? 2 : -1; if (i >= 0 && (e.teamId === m.h) === home) g[i]++; }); return g; };
    const splitShots = (total, gpp) => {
      const base = [0, 0, 0]; let left = total;
      for (let i = 0; i < 3; i++) { const take = i < 2 ? Math.round(total / 3 * (0.85 + rnd() * 0.3)) : left; base[i] = Math.max(gpp[i] || 0, Math.min(left, take)); left -= base[i]; }
      if (left > 0) base[2] += left;
      return base;
    };
    const shotsEst = goals => Math.max(goals + 3, 24 + Math.round(rnd() * 10));
    const shotsH = shotsEst(hs), shotsA = shotsEst(as);
    const result = { matchIndex: m.i, homeId: m.h, awayId: m.a, hs, as, ot, events, timeline, shotsH, shotsA, shotsPH: splitShots(shotsH, goalsPerPeriod(true)), shotsPA: splitShots(shotsA, goalsPerPeriod(false)), pimH: pimOf(true), pimA: pimOf(false) };
    this._vhlFullCache[m.i] = result;
    return result;
  };

  /* ---------- модальное окно ---------- */
  proto.vhlMcOpen = function (mi) {
    // 15.14.2: mi — либо числовой индекс матча регулярки (как раньше), либо строковый ключ игры
    // плей-офф "po_<раунд>_<серия>_<игра>" (из таблицы плей-офф/«последних игр» карточки клуба).
    let m;
    if (typeof mi === 'string' && mi.slice(0, 3) === 'po_') {
      const parts = mi.split('_');
      m = this.vhlPoGameMatch ? this.vhlPoGameMatch(Number(parts[1]), Number(parts[2]), Number(parts[3])) : null;
    } else {
      const num = Number(mi);
      m = this.vhlSchedule().find(x => x.i === num);
    }
    if (!m) return;
    const fm = this.vhlSimFullMatch(m);
    if (!fm) { this.setNotice && this.setNotice('Этот матч ещё не сыграл.'); return; }
    this._vmc = { fm, sel: 0 };
    this.vhlMcBuildDom();
    this.vhlMcRender();
  };
  proto.vhlMcClose = function () {
    const el = document.getElementById('vmc-modal'); if (el) el.remove();
    document.removeEventListener('keydown', this._vmcKey);
    this._vmc = null;
  };
  proto.vhlMcBuildDom = function () {
    const old = document.getElementById('vmc-modal'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'vmc-modal'; el.className = 'so-scrim';
    el.innerHTML = `<div class="so-dlg" style="width:min(760px,100%)" role="dialog" aria-modal="true" aria-labelledby="vmc-title">
      <div class="eyebrow" id="vmc-title">Матч-центр ВХЛ</div>
      <div class="match-hero" id="vmc-hero"></div>
      <div class="vmc-bench-row" id="vmc-bench"></div>
      <canvas id="vmc-rink" class="rink" width="900" height="420"></canvas>
      <div class="mc-legend"><span><i class="mc-d h"></i>хозяева</span><span><i class="mc-d a"></i>гости</span><span><i class="mc-d pp"></i>большинство</span><span><i class="mc-d sh"></i>меньшинство</span><span><i class="mc-d en"></i>пустые ворота</span><span><i class="mc-d ot"></i>гол в овертайме/буллитах</span></div>
      <div class="mc-detail" id="vmc-detail"></div>
      <section class="mc-tl card" id="vmc-tl"></section>
      <div class="table-wrap"><div class="shots-cap small muted" style="margin:.2rem 0 .4rem">Броски по воротам — по периодам</div><table class="data-table" id="vmc-shots"></table></div>
      <div class="toolbar" style="justify-content:flex-end"><button type="button" class="btn btn-quiet" onclick="app.vhlMcClose()">Закрыть</button></div>
    </div>`;
    document.body.appendChild(el);
    this._vmcKey = ev => { if (ev.key === 'Escape') this.vhlMcClose(); };
    document.addEventListener('keydown', this._vmcKey);
    el.addEventListener('click', ev => { if (ev.target === el) this.vhlMcClose(); });
  };
  proto.vhlMcGoalLine = function (e) {
    const sc = this.vhlPlayerById(e.scorerId), a1 = this.vhlPlayerById(e.assist1Id), a2 = this.vhlPlayerById(e.assist2Id);
    const who = sc ? this.vPlayerLink(sc.id, sc.name) : 'Автор не указан';
    const assistNames = p => p ? this.vPlayerLink(p.id, p.name) : '';
    const assistTxt = e.shootoutWinner ? '' : a1 ? ` (${assistNames(a1)}${a2 ? ', ' + assistNames(a2) : ''})` : (sc ? ' (без передач)' : '');
    const tag = e.shootoutWinner ? '<span class="mc-tag">буллиты</span>' : e.period === 'ОТ' ? '<span class="mc-tag">ОТ</span>' : '';
    return `<li data-goal="${e._n}"><span class="t">${esc(this, e.period)} ${esc(this, e.time)}</span> <b>${who}</b>${assistTxt} ${tag}</li>`;
  };
  proto.vhlMcRender = function () {
    const S = this._vmc; if (!S) return;
    const fm = S.fm, home = this.vhlTeamById(fm.homeId), away = this.vhlTeamById(fm.awayId);
    const goals = fm.events.filter(e => e.kind === 'goal'); goals.forEach((e, i) => e._n = i + 1);
    const byHome = h => goals.filter(e => (e.teamId === fm.homeId) === h);
    const hero = document.getElementById('vmc-hero');
    if (hero) {
      const resLabel = fm.ot === 2 ? ' Б' : fm.ot === 1 ? ' ОТ' : '';
      const emblem = id => this.vClubEmblemSvg ? this.vClubEmblemSvg(id) : '';
      hero.innerHTML = `<div><div class="club-badge emb">${emblem(fm.homeId)}</div><div class="club-name">${this.vClubLink(fm.homeId, home ? home.name : '')}</div><ul class="mc-goals">${byHome(true).map(e => this.vhlMcGoalLine(e)).join('')}</ul></div>
        <div><div class="score">${fm.hs} : ${fm.as}<span class="tiny muted">${resLabel}</span></div></div>
        <div><div class="club-badge emb">${emblem(fm.awayId)}</div><div class="club-name">${this.vClubLink(fm.awayId, away ? away.name : '')}</div><ul class="mc-goals">${byHome(false).map(e => this.vhlMcGoalLine(e)).join('')}</ul></div>`;
      hero.querySelectorAll('.mc-goals li').forEach(li => li.addEventListener('click', () => { S.sel = S.sel === Number(li.dataset.goal) ? 0 : Number(li.dataset.goal); this.vhlMcDrawRink(); this.vhlMcRenderDetail(); }));
    }
    const bench = document.getElementById('vmc-bench');
    if (bench) bench.innerHTML = `<span>СКАМЕЙКА «${esc(this, home ? home.name.toUpperCase() : '')}»</span><span class="pen">ШТРАФНОЙ БОКС</span><span>СКАМЕЙКА «${esc(this, away ? away.name.toUpperCase() : '')}»</span>`;
    const shots = document.getElementById('vmc-shots');
    if (shots) shots.innerHTML = `<thead><tr><th></th><th class="numeric">1-й</th><th class="numeric">2-й</th><th class="numeric">3-й</th><th class="numeric">Итог</th><th class="numeric">Штраф, мин</th></tr></thead><tbody>
      <tr><td class="team-cell">${this.vClubLink(fm.homeId, home ? home.name : '')}</td><td class="numeric">${fm.shotsPH[0]}</td><td class="numeric">${fm.shotsPH[1]}</td><td class="numeric">${fm.shotsPH[2]}</td><td class="numeric"><b>${fm.shotsH}</b></td><td class="numeric">${fm.pimH}</td></tr>
      <tr><td class="team-cell">${this.vClubLink(fm.awayId, away ? away.name : '')}</td><td class="numeric">${fm.shotsPA[0]}</td><td class="numeric">${fm.shotsPA[1]}</td><td class="numeric">${fm.shotsPA[2]}</td><td class="numeric"><b>${fm.shotsA}</b></td><td class="numeric">${fm.pimA}</td></tr></tbody>`;
    this.vhlMcRenderTimeline(fm);
    this.vhlMcDrawRink();
    this.vhlMcRenderDetail();
  };
  /* ---------- «Минута матча»: статичная шкала голов/удалений (переиспользует стили .mc-tl КХЛ) ---------- */
  proto.vhlMcRenderTimeline = function (fm) {
    const root = document.getElementById('vmc-tl'); if (!root) return;
    const hasOT = fm.ot === 1 || fm.ot === 2;
    const total = hasOT ? 65 : 60;
    const offset = { '1П': 0, '2П': 20, '3П': 40, 'ОТ': 60 };
    const minuteOf = e => { const off = offset[e.period]; if (off == null) return null; const [mm, ss] = String(e.time).split(':').map(Number); return off + (mm || 0) + (ss || 0) / 60; };
    const pct = v => Math.min(100, Math.max(0, v / total * 100));
    const marks = (fm.timeline || []).map(e => {
      const t = minuteOf(e); if (t == null) return '';
      const x = pct(t);
      if (e.kind === 'penalty') {
        const pl = this.vhlPlayerById(e.playerId);
        return `<span class="tlm pen" style="left:${x}%" title="Удаление${pl ? ': ' + esc(this, pl.name) : ''}, ${e.minutes} мин, ${esc(this, e.period)} ${esc(this, e.time)}"></span>`;
      }
      const sc = this.vhlPlayerById(e.scorerId), home = e.teamId === fm.homeId;
      return `<span class="tlm goal ${home ? 'h' : 'a'}" style="left:${x}%" title="Гол, ${esc(this, e.period)} ${esc(this, e.time)}">${sc?.number || ''}</span>`;
    }).join('');
    const seg = hasOT ? 'repeat(3,1fr) ' + (5 / 20) + 'fr' : 'repeat(3,1fr)';
    const per = (name, a, b) => `<span class="tl-per on" style="left:${pct((a + b) / 2)}%">${name}</span>`;
    const ticks = [0, 20, 40, 60].concat(hasOT ? [total] : []).map(v => `<span class="tl-tick" style="left:${pct(v)}%">${v}</span>`).join('');
    root.innerHTML = `<div class="tl-head"><h3>Минута матча</h3><span class="tl-right">итог</span></div>
      <div class="tl"><div class="tl-dyn"><div class="tl-track" style="grid-template-columns:${seg}"><i></i><i></i><i></i>${hasOT ? '<i></i>' : ''}</div><div class="tl-fill" style="width:100%"></div>${marks}${per('1-й период', 0, 20)}${per('2-й период', 20, 40)}${per('3-й период', 40, 60)}${hasOT ? per('ОТ', 60, total) : ''}${ticks}</div></div>
      <div class="tl-leg"><span class="h">гол хозяев</span><span class="a">гол гостей</span><span class="p">удаление</span></div>`;
  };
  proto.vhlMcRenderDetail = function () {
    const S = this._vmc, det = document.getElementById('vmc-detail'); if (!S || !det) return;
    const goals = S.fm.events.filter(e => e.kind === 'goal'); goals.forEach((e, i) => e._n = i + 1);
    const g = goals.find(e => e._n === S.sel);
    if (!g) { det.innerHTML = goals.length ? '<span class="muted">Нажми на гол в списке или на шайбу на льду, чтобы увидеть подробности.</span>' : '<span class="muted">В этом матче не было голов.</span>'; return; }
    const sc = this.vhlPlayerById(g.scorerId), a1 = this.vhlPlayerById(g.assist1Id), a2 = this.vhlPlayerById(g.assist2Id);
    const team = this.vhlTeamById(g.teamId);
    det.innerHTML = `<b>Гол ${g._n} · ${esc(this, g.period)} ${esc(this, g.time)} · ${esc(this, team ? team.name : '')}</b><div>${esc(this, sc ? sc.name : 'Автор не указан')}${a1 ? ` <span class="muted">(${esc(this, a1.name)}${a2 ? ', ' + esc(this, a2.name) : ''})</span>` : ''}</div><div class="muted">Место броска: ${esc(this, this.goalZoneName(g.shotZone))}${g.shootoutWinner ? ' · победный бросок в серии буллитов' : g.period === 'ОТ' ? ' · победный гол в овертайме' : ''}</div>`;
  };
  /* ---------- упрощённая площадка (своя, не трогает #rink-canvas КХЛ) ---------- */
  proto.vhlMcDrawRink = function () {
    const S = this._vmc; if (!S) return;
    const canvas = document.getElementById('vmc-rink'); if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const L = 42, T = 38, W = 816, H = 344, CY = T + H / 2, GL = L + W * .17, GR = L + W * .83, CX = L + W / 2;
    ctx.clearRect(0, 0, 900, 420);
    ctx.save();
    // лёд + оранжевая рамка (как в КХЛ)
    ctx.fillStyle = '#f4f1ea'; ctx.strokeStyle = '#e8743b'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(L - 24, T - 20, W + 48, H + 40, 44); ctx.fill(); ctx.stroke();
    // цветная «бегущая строка» вдоль бортов
    const ticker = y => { const colors = ['#c23a4e', '#fbbf24', '#1f5fa8', '#6b7280']; let x = L - 10, i = 0; while (x < L + W + 10) { ctx.fillStyle = colors[i % 4]; ctx.beginPath(); ctx.roundRect(x, y, 8, 8, 2); ctx.fill(); x += 16; i++; } };
    ticker(T - 15); ticker(T + H + 7);
    // осевые линии
    ctx.strokeStyle = '#c23a4e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(CX, T); ctx.lineTo(CX, T + H); ctx.stroke();
    ctx.strokeStyle = '#1f5fa8'; ctx.lineWidth = 5;
    [L + W * .38, L + W * .62].forEach(x => { ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + H); ctx.stroke(); });
    // центральный круг
    ctx.strokeStyle = '#1f5fa8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX, CY, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1f5fa8'; ctx.beginPath(); ctx.arc(CX, CY, 2.6, 0, Math.PI * 2); ctx.fill();
    // точки нейтральной зоны
    ctx.fillStyle = '#c23a4e';
    [[L + W * .33, CY - 54], [L + W * .33, CY + 54], [L + W * .67, CY - 54], [L + W * .67, CY + 54]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    // круги вбрасывания с крестовинами
    const faceoff = (x, y) => {
      ctx.strokeStyle = '#c23a4e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c23a4e'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2;
      [[-34, -14, -24, -14], [-34, 14, -24, 14], [24, -14, 34, -14], [24, 14, 34, 14]].forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(x + x1, y + y1); ctx.lineTo(x + x2, y + y2); ctx.stroke(); });
    };
    [[L + W * .22, CY - H * .24], [L + W * .22, CY + H * .24], [L + W * .78, CY - H * .24], [L + W * .78, CY + H * .24]].forEach(([x, y]) => faceoff(x, y));
    // вратарские площадки (веера) — полупрозрачные, чтобы не забивать маркеры голов рядом с воротами
    ctx.fillStyle = 'rgba(31,95,168,.10)'; ctx.strokeStyle = '#1f5fa8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(GL, CY, 34, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(GR, CY, 34, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c23a4e';
    [[GL, CY], [GR, CY]].forEach(([x, y]) => { ctx.beginPath(); ctx.roundRect(x - 2, y - 24, 4, 48, 2); ctx.fill(); });
    ctx.restore();

    const fm = S.fm, K = this.matchKits ? this.matchKits({ homeId: fm.homeId, awayId: fm.awayId }) : null;
    const goals = fm.events.filter(e => e.kind === 'goal').map((e, i) => ({ e, n: i + 1, home: e.teamId === fm.homeId }));
    const pts = vhlLayoutGoals(goals);
    this._vmcPucks = [];
    for (const p of pts) {
      const k = K ? (p.g.home ? K.h : K.a) : null, col = k ? k.f : (p.g.home ? '#0e7490' : '#c2415b');
      ctx.save(); ctx.translate(p.x, p.y);
      // тёмный контрастный ореол под маркером — чтобы бледные (белые/жёлтые) цвета формы не терялись на кремовом льду
      ctx.shadowColor = 'rgba(10,16,26,.35)'; ctx.shadowBlur = 5;
      ctx.fillStyle = '#16233a'; ctx.beginPath(); ctx.arc(0, 0, 15.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = col; ctx.strokeStyle = k ? k.e : '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (p.g.e.period === 'ОТ' || p.g.e.shootoutWinner) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 19.5, 0, Math.PI * 2); ctx.stroke(); }
      if (p.g.n === S.sel) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = k ? k.i : '#ffffff'; ctx.font = '700 13px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 15.14.4: раньше на шайбе стоял порядковый номер гола (1,2,3…) — не то же самое, что принято
      // в КХЛ, где на шайбе номер автора гола на свитере. Показываем номер автора, если он известен
      // (sc.number из базы ВХЛ/КХЛ), и только для голов без привязанного автора — откатываемся на
      // порядковый номер, чтобы шайба не осталась пустой.
      const scNum = this.vhlPlayerById(p.g.e.scorerId);
      ctx.fillText(scNum && scNum.number ? String(scNum.number) : String(p.g.n), 0, .5);
      ctx.restore();
      this._vmcPucks.push({ x: p.x, y: p.y, n: p.g.n });
    }
    if (!canvas._vmcClickBound) {
      canvas._vmcClickBound = true;
      canvas.addEventListener('click', ev => {
        const rect = canvas.getBoundingClientRect(), sx = canvas.width / rect.width, x = (ev.clientX - rect.left) * sx, y = (ev.clientY - rect.top) * sx;
        let best = null, bd = 22 * 22;
        for (const p of this._vmcPucks || []) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
        if (!best || !this._vmc) return;
        this._vmc.sel = this._vmc.sel === best.n ? 0 : best.n;
        this.vhlMcDrawRink(); this.vhlMcRenderDetail();
      });
    }
  };
})();
