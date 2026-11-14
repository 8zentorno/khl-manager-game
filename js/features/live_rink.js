/* KHL Manager 14.7.13 — «Живая коробка»: игроки-кружки с номерами в формах клубов двигаются по льду в реальном времени.
   Физика шайбы (скольжение, отскоки от бортов и ворот, вылет за площадку), разгон и торможение игроков, расталкивание,
   вбрасывания на девяти точках с борьбой обеих команд, силовые, блоки, сейвы, голы, удаления и штрафной бокс,
   большинство и снятый вратарь — всё по событиям и счётчикам движка (броски, силовые, блоки, вбрасывания),
   поэтому статистика матча и картинка совпадают, а результат матча не меняется.
   Коробка нарисована по реальной разметке 60 × 22,86 м; после матча на ней остаётся карта голов. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  if (!proto) return;

  /* ---------- геометрия холста 900×420: площадка 60 × 22,86 м ---------- */
  const CW = 900, CH = 420, S = 816 / 60, L = 42, RX = 858, W = 816, H = 22.86 * S, T = 64, B = T + H, CX = 450, CY = T + H / 2, RC = 8.5 * S;
  const GXL = L + 3.6 * S, GXR = RX - 3.6 * S, BLl = L + W * .345, BRl = RX - W * .345;
  const FXL = L + W * .19, FXR = RX - W * .19, FY1 = T + H * .25, FY2 = T + H * .75, FR = 4.5 * S, NXL = L + W * .377, NXR = RX - W * .377;
  const POST = 1.83 * S / 2, NETD = 1.12 * S, CREASE = 1.8 * S;
  const SPOTS = [[CX, CY], [FXL, FY1], [FXL, FY2], [FXR, FY1], [FXR, FY2], [NXL, FY1], [NXL, FY2], [NXR, FY1], [NXR, FY2]];
  const PR = 10.5, GR = 10.5;
  const BENCH = [[L + 60, T - 50, 210], [RX - 270, T - 50, 210]], BOX = [CX - 58, T - 54, 116, 32];
  const rnd = (a, b) => a + Math.random() * (b - a), lerp = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // 14.7.20: разворот с ограничением угловой скорости (p.turn, рад/с) — вместо мгновенного
  // довода вектора скорости к цели. На месте/на малом ходу разворот разрешён быстрее, чтобы
  // не выглядел «вязким» при остановках и борьбе у бортика.
  function steer(p, tx, ty, want, dt) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.hypot(p.vx, p.vy);
    const curA = v > 4 ? Math.atan2(p.vy, p.vx) : Math.atan2(dy, dx);
    const wantA = Math.atan2(dy, dx);
    let da = wantA - curA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const slowBonus = 1 + Math.max(0, 1 - v / 90) * 1.4;
    const maxDa = (p.turn || 5.5) * dt * slowBonus;
    const a = curA + clamp(da, -maxDa, maxDa);
    const acc = p.acc || 300, k = Math.min(1, acc * dt / (acc * dt + 60));
    const targetSp = Math.min(want, d * 3);
    p.vx = lerp(p.vx, Math.cos(a) * targetSp, k); p.vy = lerp(p.vy, Math.sin(a) * targetSp, k);
  }
  function contain(p, m) {
    const x0 = L + m, x1 = RX - m, y0 = T + m, y1 = B - m, rc = RC - m; let n = null;
    if (p.x < x0) { p.x = x0; n = [1, 0]; } if (p.x > x1) { p.x = x1; n = [-1, 0]; } if (p.y < y0) { p.y = y0; n = [0, 1]; } if (p.y > y1) { p.y = y1; n = [0, -1]; }
    for (const [cx, cy] of [[L + RC, T + RC], [RX - RC, T + RC], [L + RC, B - RC], [RX - RC, B - RC]]) {
      const ix = cx < CX ? p.x < cx : p.x > cx, iy = cy < CY ? p.y < cy : p.y > cy;
      if (ix && iy) { const d = Math.hypot(p.x - cx, p.y - cy); if (d > rc) { p.x = cx + (p.x - cx) / d * rc; p.y = cy + (p.y - cy) / d * rc; n = [(cx - p.x) / rc, (cy - p.y) / rc]; } }
    }
    return n;
  }
  const nearestSpot = (x, y, f) => SPOTS.filter(f || (() => true)).sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y))[0];
  const endSpot = (x, y) => nearestSpot(x, y, s => s[0] === FXL || s[0] === FXR);

  /* ---------- статичная площадка (кэш) ---------- */
  function paintRink(ctx, names, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d1827'; ctx.fillRect(0, 0, CW, CH);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 64; i++) {
      const x = L + 8 + i * (W - 16) / 63;
      for (const y of [4 + r * 5, B + 14 + r * 5]) { ctx.fillStyle = ['#3b7094', '#d4a451', '#a34c61', '#4b9b86'][(i + r) % 4]; ctx.globalAlpha = .4 + ((i * 7 + r * 3) % 6) / 10; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1.5;
    BENCH.forEach(([x, y, w], i) => {
      ctx.fillStyle = '#152238'; ctx.strokeStyle = '#2c3e5c'; ctx.beginPath(); ctx.roundRect(x, y, w, 26, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5d7598'; ctx.font = '600 9px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(('СКАМЕЙКА «' + (names[i] || '') + '»').toUpperCase(), x + w / 2, y + 17);
    });
    ctx.beginPath(); ctx.roundRect(BOX[0], BOX[1], BOX[2], BOX[3], 6); ctx.fillStyle = '#1d1626'; ctx.fill(); ctx.strokeStyle = '#2c3e5c'; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(L, T, W, H, RC); ctx.fillStyle = '#f6f3ec'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(L, T, W, H, RC); ctx.clip();
    const red = '#c8362e', blue = '#2b63b8';
    ctx.strokeStyle = red; ctx.lineWidth = 2; [GXL, GXR].forEach(x => { ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); });
    ctx.strokeStyle = blue; ctx.lineWidth = 4; [BLl, BRl].forEach(x => { ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); });
    ctx.strokeStyle = red; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(CX, T); ctx.lineTo(CX, B); ctx.stroke();
    ctx.strokeStyle = blue; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX, CY, FR, 0, 7); ctx.stroke();
    ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(CX, CY, 4, 0, 7); ctx.fill();
    for (const x of [FXL, FXR]) for (const y of [FY1, FY2]) {
      ctx.strokeStyle = red; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, FR, 0, 7); ctx.stroke();
      ctx.fillStyle = red; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      ctx.lineWidth = 1.6; for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x + sx * 6, y + sy * 4); ctx.lineTo(x + sx * 22, y + sy * 4); ctx.moveTo(x + sx * 6, y + sy * 4); ctx.lineTo(x + sx * 6, y + sy * 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + sx * 18, y + sy * (FR - 2)); ctx.lineTo(x + sx * 18, y + sy * (FR + 8)); ctx.stroke();
      }
    }
    for (const x of [NXL, NXR]) for (const y of [FY1, FY2]) { ctx.fillStyle = red; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    for (const [gx, dir] of [[GXL, 1], [GXR, -1]]) {
      ctx.fillStyle = '#8cc3e8'; ctx.strokeStyle = red; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(gx, CY - CREASE); ctx.arc(gx, CY, CREASE, -Math.PI / 2, Math.PI / 2, dir < 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      const x0 = gx, x1 = gx - dir * NETD;
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(Math.min(x0, x1), CY - POST, NETD, POST * 2);
      ctx.strokeStyle = '#d8dde6'; ctx.lineWidth = .8; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(Math.min(x0, x1), CY + k * POST / 3.5); ctx.lineTo(Math.max(x0, x1), CY + k * POST / 3.5); ctx.stroke(); }
      ctx.strokeStyle = red; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, CY - POST); ctx.lineTo(x1, CY - POST); ctx.lineTo(x1, CY + POST); ctx.lineTo(x0, CY + POST); ctx.stroke();
    }
    ctx.strokeStyle = red; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX, B, 3 * S, Math.PI, 0); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#e8891f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(L, T, W, H, RC); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(L - 5, T - 5, W + 10, H + 10, RC + 5); ctx.stroke();
    ctx.fillStyle = '#5d7598'; ctx.font = '600 9px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ШТРАФНОЙ БОКС', CX, BOX[1] + 20);
  }
  function benchNames(app, m) {
    if (!m) return ['', ''];
    const h = app.teamById(m.homeId), a = app.teamById(m.awayId);
    return [h ? h.name : '', a ? a.name : ''];
  }
  let cache = null;
  function bg(app, m, dpr) {
    const key = (m ? m.homeId + '|' + m.awayId : '') + '|' + dpr;
    if (cache && cache.key === key) return cache.c;
    const c = document.createElement('canvas'); c.width = CW * dpr; c.height = CH * dpr;
    paintRink(c.getContext('2d'), benchNames(app, m), dpr);
    cache = { key, c }; return c;
  }
  // статичная площадка для карты голов (вызывается из drawRink ядра)
  proto.rkBase = function (match) {
    const canvas = document.getElementById('rink-canvas'); if (!canvas || !canvas.getContext) return false;
    if (canvas.width !== CW) { canvas.width = CW; canvas.height = CH; }
    const m = match || (this.state && this.currentMatchId ? (this.state.matches || []).find(x => x.id === this.currentMatchId) : null);
    const ctx = canvas.getContext('2d'); if (!ctx || typeof ctx.setTransform !== 'function' || typeof ctx.drawImage !== 'function' || typeof ctx.roundRect !== 'function') return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CW, CH);
    try { ctx.drawImage(bg(this, m, 1), 0, 0); } catch (e) { return false; }
    return true;
  };
  // карта голов: координаты бросков в новой разметке
  proto.mcLayout = function (goals) {
    const KX = (BLl - GXL) / 133, KY = H / 344;
    const pts = goals.map(g => { const dx = g.e.shotDx * KX, dy = g.e.shotDy * KY; return { g, x: g.home ? GXR - dx : GXL + dx, y: CY + dy }; });
    const D = 30;
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
    for (const p of pts) { p.x = clamp(p.x, L + 22, RX - 22); p.y = clamp(p.y, T + 20, B - 20); }
    return pts;
  };

  /* ---------- живой матч ---------- */
  const DUR = { goal: 2.8, save: 1.3, block: 1.1, hit: .9, stop: 1.7, penalty: 2.2, penEnd: .6, fight: 2.2, so: 2.8, inter: 1.8, final: 0 };
  const PRI = { goal: 0, penalty: 0, penEnd: 0, fight: 0, so: 0, inter: 0, final: 0, stop: 1, save: 2, hit: 3, block: 3, xstop: 4 };
  const sumArr = a => (a || []).reduce((x, y) => x + y, 0);

  const mcDraw = proto.drawRink;
  // 14.7.18: перемотка ещё не законченного матча назад больше не подменяет живую коробку
  // «картой голов» (это экран для уже сыгранного матча — отсюда и отметки у ворот вместо
  // игроков). Вместо этого показываем стоп-кадр по снимку состава и позиций той минуты
  // (см. rkSnapshot/rkCaptureHist/rkHistDraw), а само живое состояние (_rk) не рвём —
  // аниматор просто ставится на паузу (rkFreeze) и продолжает с того же места при возврате
  // к прямому эфиру.
  proto.drawRink = function (match) {
    const live = this.liveMatch;
    const sameLive = !!(live && match && live.matchId === match.id && !live.finished && !live.quick && this.state);
    if (sameLive) {
      try { this.rkInjectViewToggle(); } catch (e) {}
      // 14.7.24: вариант Б — переключатель «Коробка»/«Только голы». В режиме «Только голы»
      // аниматор просто ставится на паузу (rkFreeze, как при просмотре истории), а не
      // разрушается — переключение обратно на «Коробку» продолжает с тех же позиций без
      // рывка. Сама симуляция матча (минуты/события) идёт отдельным тикером и не замирает.
      if (this.rkViewMode() === 'goals') {
        this.rkFreeze();
        this.rkClearLineUi();
        // 14.7.26: rkLive() скрывает #rink-label/#rink-legend/#rink-detail (rk-hide) —
        // они не нужны в режиме «Коробка» (там своя подпись звена). При переключении на
        // «Только голы» это самая обычная карта голов, где эти элементы и нужны —
        // раньше их никто не открывал заново, и легенда/подписи оставались скрытыми навсегда.
        ['rink-label', 'rink-legend', 'rink-detail'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('rk-hide'); });
        return mcDraw.apply(this, arguments);
      }
      if (this._mcViewNow == null) {
        try { this.rkLive(live, match); return; } catch (e) { console.error('KHL Manager live rink:', e); this.rkStop(); return mcDraw.apply(this, arguments); }
      }
      this.rkFreeze();
      this.rkClearLineUi();
      try { if (this.rkHistDraw(live, match, this._mcViewNow)) return; } catch (e) { console.error('KHL Manager rink history:', e); }
    } else {
      this.rkStop();
      this.rkClearLineUi();
      const bar = document.getElementById('rink-view-toggle'); if (bar && bar.remove) bar.remove();
    }
    return mcDraw.apply(this, arguments);
  };
  // Подпись звена относится только к активному аниматору «Коробка» — при переключении
  // в «Только голы», при перемотке назад или уходе с live-матча её не показываем (данных
  // «кто сейчас на льду» в эти моменты нет).
  proto.rkClearLineUi = function () {
    const lab = document.getElementById('rink-line-label'); if (lab) lab.innerHTML = '';
  };

  // --- 14.7.24: вид коробки (вариант Б из концепта «Живая коробка 2.0») ---
  proto.rkViewMode = function () {
    return (this.state && this.state.rinkViewMode === 'goals') ? 'goals' : 'box';
  };
  proto.setRinkViewMode = function (mode) {
    if (!this.state) return;
    this.state.rinkViewMode = (mode === 'goals') ? 'goals' : 'box';
    try { this.persistQuietly(); } catch (e) {}
    try { this.renderMatchCenter(); } catch (e) { this.renderAll && this.renderAll(); }
  };
  proto.rkInjectViewToggle = function () {
    const canvas = document.getElementById('rink-canvas'); if (!canvas || !canvas.insertAdjacentElement) return;
    let bar = document.getElementById('rink-view-toggle');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'rink-view-toggle'; bar.className = 'mc-filters';
      bar.innerHTML = '<span class="mc-lab">Вид коробки</span><button type="button" class="mc-pill" data-rkv="box">Коробка</button><button type="button" class="mc-pill" data-rkv="goals">Только голы</button>';
      canvas.insertAdjacentElement('beforebegin', bar);
      const self = this;
      bar.addEventListener('click', ev => { const b = ev.target.closest('[data-rkv]'); if (b) self.setRinkViewMode(b.dataset.rkv); });
    }
    const mode = this.rkViewMode();
    bar.querySelectorAll('[data-rkv]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rkv === mode)));
  };
  proto.rkStop = function () {
    const R = this._rk; if (!R) return;
    if (R.raf) cancelAnimationFrame(R.raf);
    const c = document.getElementById('rink-canvas'); if (c && c.width !== CW) { c.width = CW; c.height = CH; }
    ['rink-label', 'rink-legend', 'rink-detail'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('rk-hide'); });
    this._rk = null;
  };
  // ставим аниматор на паузу, не разрушая его (в отличие от rkStop) — используется, пока
  // смотрим прошлую минуту матча, который на самом деле продолжается.
  proto.rkFreeze = function () {
    const R = this._rk; if (!R) return;
    if (R.raf) { cancelAnimationFrame(R.raf); R.raf = null; }
  };
  // компактный снимок: кто на льду у каждой команды, их координаты и место шайбы —
  // достаточно, чтобы на перемотке честно нарисовать стоп-кадр той минуты.
  proto.rkSnapshot = function () {
    const R = this._rk; if (!R) return null;
    const pack = p => ({ id: p.id, num: p.num, role: p.role, gk: !!p.gk, t: p.t, x: Math.round(p.x), y: Math.round(p.y) });
    return {
      ice: [0, 1].map(ti => ({ sk: R.ice[ti].sk.filter(p => p.st === 'ice').map(pack), gk: R.ice[ti].gk ? pack(R.ice[ti].gk) : null })),
      box: R.box.map(pack),
      puck: { x: Math.round(R.puck.x), y: Math.round(R.puck.y) }
    };
  };
  // снимок пишется на объект самого живого матча (live), а не на _rk — он должен пережить
  // паузу/перемотку и даже переинициализацию аниматора, а не исчезать вместе с ним.
  proto.rkCaptureHist = function (live) {
    if (!live) return;
    const snap = this.rkSnapshot(); if (!snap) return;
    const mi = Math.max(0, Math.floor(live.visibleMinute || 0));
    live.rinkHist = live.rinkHist || {};
    live.rinkHist[mi] = snap;
  };
  // стоп-кадр по снимку: ближайший сохранённый снимок на момент «минута ≤ запрошенной».
  proto.rkHistDraw = function (live, match, minute) {
    const hist = live.rinkHist; if (!hist) return false;
    const keys = Object.keys(hist).map(Number).filter(n => n <= minute + 0.001);
    if (!keys.length) return false;
    const snap = hist[Math.max(...keys)];
    const canvas = document.getElementById('rink-canvas'); if (!canvas || !canvas.getContext) return false;
    const K = this.matchKits(match), teams = [K.h, K.a];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== CW * dpr) { canvas.width = CW * dpr; canvas.height = CH * dpr; }
    const ctx = canvas.getContext('2d'); if (!ctx || typeof ctx.setTransform !== 'function') return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try { ctx.drawImage(bg(this, match, dpr), 0, 0); } catch (e) { return false; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ['rink-label', 'rink-legend', 'rink-detail'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('rk-hide'); });
    const cnt = snap.ice.map(s => s.sk.length);
    if (cnt[0] !== cnt[1]) { ctx.fillStyle = '#9fb3cf'; ctx.font = '600 10px Inter,system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${cnt[0]} на ${cnt[1]}`, RX - 4, T - 10); }
    if (snap.box.length) {
      ctx.fillStyle = '#1d1626'; ctx.beginPath(); ctx.roundRect(BOX[0], BOX[1], BOX[2], BOX[3], 6); ctx.fill(); ctx.strokeStyle = '#e05252'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const everyone = [];
    snap.ice.forEach((side, ti) => { side.sk.forEach(p => everyone.push(p)); if (side.gk) everyone.push(side.gk); });
    const drawCircle = (p, boxed) => {
      const k = teams[p.t] || teams[0], r = p.gk ? GR : PR;
      ctx.save(); ctx.shadowColor = 'rgba(10,20,35,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = k.f; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.lineWidth = p.gk ? 3 : 2.5; ctx.strokeStyle = k.e; ctx.stroke();
      if (p.gk) { ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, r - 3.5, 0, 7); ctx.stroke(); }
      ctx.fillStyle = k.i; ctx.font = '800 ' + (String(p.num).length > 2 ? 8.5 : 10) + 'px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.num, p.x, p.y + .5);
      ctx.restore();
    };
    everyone.sort((a, b) => a.y - b.y).forEach(p => drawCircle(p));
    snap.box.forEach((p, i) => drawCircle({ ...p, x: BOX[0] + 24 + i * 24, y: BOX[1] + 16 }));
    if (snap.puck) { ctx.beginPath(); ctx.arc(snap.puck.x, snap.puck.y, 4.2, 0, 7); ctx.fillStyle = '#10151d'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = '#cfe4f2'; ctx.stroke(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  };

  // 14.7.20: персональный профиль движения по skills.skating (вместо одной скорости на всех
  // в целевых тройках rkStep) + навыки для усталости/вратаря, используемые ниже.
  function mkPlayer(p, ti) {
    const pos = p.pos || 'C';
    const sk = (p.skills && p.skills.skating) || p.ovr || 70;
    const gkSkill = (p.skills && p.skills.goalkeeping) || p.ovr || 70;
    const stamSkill = (p.skills && p.skills.stamina) || p.ovr || 70;
    return {
      id: p.id, num: p.number != null && p.number !== '' ? String(p.number) : '', t: ti, gk: pos === 'G', role: pos === 'D' ? 'd' : pos === 'C' ? 'c' : 'w', x: CX, y: CY, vx: 0, vy: 0, ph: rnd(0, 9), st: 'bench', hold: 0,
      maxV: 95 + (sk - 70) * .9, acc: 260 + (sk - 70) * 3, turn: 5.5 + (sk - 70) * .03,
      gkSkill, stamSkill, stam: 1, ice: 0, bfly: 0
    };
  }
  // 14.7.27: случайная целевая длительность смены пятёрки (сек. игрового времени) —
  // в среднем 35–45 с, изредка короткий «вылет» или длинная смена с удержанием зоны.
  function sampleShiftTarget() {
    const r = Math.random();
    if (r < .15) return rnd(10, 15);
    if (r < .85) return rnd(35, 45);
    return rnd(60, 90);
  }
  proto.rkInit = function (live, m) {
    const canvas = document.getElementById('rink-canvas');
    const K = this.matchKits(m);
    const R = this._rk = { matchId: m.id, canvas, seen: new Set(), initDone: false, queue: [], cur: null, speed: 1, time: 0, flash: 0, battle: null, fo: null, mode: 'whistle', mt: .6, msgT: 0,
      teams: [{ id: live.homeId, kit: K.h, dir: 1 }, { id: live.awayId, kit: K.a, dir: -1 }], pobj: new Map(), lines: [],
      // li[ti].f/.d — индекс ЗВЕНА/ПАРЫ, которые СЕЙЧАС находятся на льду (не «предпочитаемый
      // источник», как раньше) — меняется только через rkPerformShift, целой группой разом.
      li: [{ f: 0, d: 0 }, { f: 0, d: 0 }],
      // независимые таймеры смены нападения/защиты каждой команды (14.7.27, «настоящая ротация»).
      shift: [{ f: { elapsed: 0, target: sampleShiftTarget() }, d: { elapsed: 0, target: sampleShiftTarget() } }, { f: { elapsed: 0, target: sampleShiftTarget() }, d: { elapsed: 0, target: sampleShiftTarget() } }],
      ice: [{ sk: [], gk: null }, { sk: [], gk: null }], box: [], base: null, last: performance.now(), lastTick: performance.now(), tickSpan: this.LIVE_TICK_MS || 1700, lastSec: 0 };
    // 14.7.27: границы звеньев/пар в самой коробке строим ИЗ ТОГО ЖЕ снимка (lineupSnapshot),
    // которым пользуются подпись «сейчас на льду» и вкладка «Составы» — раньше коробка сама
    // пересчитывала эти границы из live.activeH/activeA независимо, и при малейшем расхождении
    // порядка (перестановка, замена вратаря между сохранением снимка и стартом аниматора)
    // получалась путаница «3 игрока звена 1 + 1 игрок звена 4» из прошлой жалобы.
    [live.activeH, live.activeA].forEach((act, ti) => {
      const teamId = R.teams[ti].id, snapTeam = live.lineupSnapshot && live.lineupSnapshot[teamId];
      let F, D, goalieSrc;
      if (snapTeam && (snapTeam.forwards || []).length) {
        const byId = id => this.playerById(id) || (act.skaters || []).find(p => p.id === id) || (act.goalie && act.goalie.id === id ? act.goalie : null);
        F = (snapTeam.forwards || []).map(byId).filter(Boolean);
        D = (snapTeam.defense || []).map(byId).filter(Boolean);
        goalieSrc = snapTeam.goalieId ? byId(snapTeam.goalieId) : act.goalie;
      } else {
        F = (act.forwards || act.skaters.filter(p => p.pos !== 'D')).slice(0, 12);
        D = (act.defense || act.skaters.filter(p => p.pos === 'D')).slice(0, 6);
        goalieSrc = act.goalie;
      }
      const fl = []; for (let i = 0; i < F.length; i += 3) fl.push(F.slice(i, i + 3)); const dl = []; for (let i = 0; i < D.length; i += 2) dl.push(D.slice(i, i + 2));
      R.lines[ti] = { F: fl.filter(l => l.length), D: dl.filter(l => l.length), G: goalieSrc || null };
      const all = [...F, ...D, ...(goalieSrc ? [goalieSrc] : [])];
      all.forEach(p => { if (!R.pobj.has(p.id)) R.pobj.set(p.id, mkPlayer(p, ti)); });
    });
    R.fo = { x: CX, y: CY };
    [0, 1].forEach(ti => { this.rkFillIce(ti, 5, true); });
    R.puck = { x: CX, y: CY, vx: 0, vy: 0, owner: null, to: null, cool: 0, air: 0, out: 0, lastT: -1, touched: true, shot: false, beat: false, block: null };
    this.rkCaptureHist(live);
    return R;
  };
  const obj = (R, id) => (id != null && R.pobj.get(id)) || null;
  // объект игрока по id (если его нет среди звеньев — создаём по базе)
  proto.rkObj = function (pid, ti) {
    const R = this._rk; if (pid == null) return null; let p = R.pobj.get(pid); if (p) return p;
    const src = (this.db && this.db.players || []).find(x => String(x.id) === String(pid)); if (!src || ti == null || ti < 0) return null;
    p = mkPlayer(src, ti); R.pobj.set(pid, p); return p;
  };
  proto.rkPenalized = function (live, pid) {
    const vm = live.visibleMinute || 0;
    return (live.penalties || []).some(x => String(x.playerId) === String(pid) && (x.queued || x.expiresAt > vm)) || Object.values(live.sentOff || {}).some(a => a.includes(pid)) || Object.values(live.injured || {}).some(a => a.includes(pid));
  };
  // выпустить/снять игроков, чтобы на льду было нужное число полевых
  proto.rkFillIce = function (ti, want, instant, noTrim) {
    const R = this._rk, live = this.liveMatch, ice = R.ice[ti], ln = R.lines[ti], li = R.li[ti];
    const bx = BENCH[ti][0] + BENCH[ti][2] / 2, by = BENCH[ti][1] + 13;
    const onIce = p => ice.sk.includes(p);
    const spawn = p => { if (instant) { p.x = CX + rnd(-80, 80); p.y = CY + rnd(-80, 80); } else { p.x = bx + rnd(-40, 40); p.y = by; } p.vx = p.vy = 0; p.st = 'ice'; ice.sk.push(p); };
    const pool = () => {
      const f = ln.F.length ? ln.F[li.f % ln.F.length] : [], d = ln.D.length ? ln.D[li.d % ln.D.length] : [];
      const order = [...d, ...f, ...ln.D.flat(), ...ln.F.flat()];
      return order.map(p => R.pobj.get(p.id)).filter(p => p && !onIce(p) && p.st !== 'box' && !this.rkPenalized(live, p.id));
    };
    let guard = 0;
    while (ice.sk.length < want && guard++ < 30) { const c = pool()[0]; if (!c) break; spawn(c); }
    // во время формирования вбрасывания (R.mode==='drop') не трогаем состав —
    // иначе розыгрыш у точки ломается, когда смена численности (овертайм, снятие
    // вратаря) совпадает с самим моментом броска шайбы.
    if (noTrim) return;
    let trimGuard = 0;
    while (ice.sk.length > want && trimGuard++ < 20) {
      const keep = R.cur && R.cur.keep ? R.cur.keep : [];
      const cand = ice.sk.filter(p => p !== R.puck.owner && !keep.includes(p));
      const p = (cand.length ? cand : ice.sk)[0]; this.rkToBench(p);
    }
  };
  proto.rkToBench = function (p) {
    const R = this._rk; [0, 1].forEach(ti => { R.ice[ti].sk = R.ice[ti].sk.filter(x => x !== p); if (R.ice[ti].gk === p) R.ice[ti].gk = null; });
    if (R.puck.owner === p) { R.puck.owner = null; R.puck.cool = .2; }
    p.st = 'out';
  };
  proto.rkEnsure = function (pid, ti) {
    const R = this._rk; const p = this.rkObj(pid, ti); if (!p || p.gk) return null;
    if (p.st === 'ice') return p;
    if (p.st === 'box') return null;
    const ice = R.ice[ti].sk, same = ice.filter(x => x.role === p.role && x !== R.puck.owner);
    let swap = (same.length ? same : ice.filter(x => x !== R.puck.owner))[0];
    // не найдено, кого заменить (например, вся пятёрка держит шайбу) — но состав
    // не должен расти сверх предельной численности (6 — с учётом пустых ворот).
    if (!swap && ice.length >= 6) swap = ice[0];
    if (swap) this.rkToBench(swap);
    const bx = BENCH[ti][0] + BENCH[ti][2] / 2; p.x = bx + rnd(-40, 40); p.y = BENCH[ti][1] + 13; p.vx = p.vy = 0; p.st = 'ice'; R.ice[ti].sk.push(p);
    return p;
  };
  proto.rkGoalieSync = function (ti) {
    const R = this._rk, live = this.liveMatch, m = live.simulatedMatch, mp = m.liveManpower || {}, ice = R.ice[ti];
    const pulled = mp.goaliePulledTeamId && String(mp.goaliePulledTeamId) === String(R.teams[ti].id);
    const act = ti ? live.activeA : live.activeH;
    if (pulled) { if (ice.gk) { this.rkToBench(ice.gk); } return; }
    if (!ice.gk) {
      const g = act.goalie ? (R.pobj.get(act.goalie.id) || (R.pobj.set(act.goalie.id, mkPlayer(act.goalie, ti)), R.pobj.get(act.goalie.id))) : null;
      if (g) { g.gk = true; g.st = 'ice'; const gx = R.teams[ti].dir > 0 ? GXL : GXR; if (!(g.x > L && g.x < RX && g.y > T)) { g.x = gx + R.teams[ti].dir * 8; g.y = CY; } ice.gk = g; }
    }
  };
  proto.rkManpower = function () {
    const R = this._rk, live = this.liveMatch, m = live.simulatedMatch, mp = m.liveManpower || {};
    [0, 1].forEach(ti => {
      let want = ti ? mp.away : mp.home; if (!Number.isFinite(want)) want = 5;
      const pulled = mp.goaliePulledTeamId && String(mp.goaliePulledTeamId) === String(R.teams[ti].id);
      want = clamp(want, 3, 6); if (!pulled) want = Math.min(want, 5);
      // удалённые, попавшие в бокс/скамейку
      R.ice[ti].sk.filter(p => this.rkPenalized(live, p.id) && !(R.cur && R.cur.k === 'penalty' && R.cur.pid === p.id)).forEach(p => this.rkToBench(p));
      if (R.mode !== 'so' && !live.inShootout) this.rkFillIce(ti, want, false, R.mode === 'drop');
      this.rkGoalieSync(ti);
    });
    const vm = live.visibleMinute || 0;
    R.box = R.box.filter(p => (live.penalties || []).some(x => String(x.playerId) === String(p.id) && (x.queued || x.expiresAt > vm)) || Object.values(live.sentOff || {}).some(a => a.includes(p.id)));
    [...R.pobj.values()].forEach(p => { if (p.st === 'box' && !R.box.includes(p)) p.st = 'bench'; });
  };

  /* ---------- синхронизация с движком: события и счётчики минуты ---------- */
  proto.rkSync = function (live, m) {
    const R = this._rk, now = performance.now();
    R.lastTick = now;
    this.rkCaptureHist(live);
    const vis = this.mcVisibleEvents ? this.mcVisibleEvents(m) : (m.events || []);
    const fresh = vis.filter(e => !R.seen.has(e)); fresh.forEach(e => R.seen.add(e));
    const c = live.cnt || null;
    const counters = { sh: [c ? sumArr(c.h.shots) : 0, c ? sumArr(c.a.shots) : 0], hit: [c ? sumArr(c.h.hits) : 0, c ? sumArr(c.a.hits) : 0], bl: [c ? sumArr(c.h.blocks) : 0, c ? sumArr(c.a.blocks) : 0], fo: c ? sumArr(c.h.faceoffs) + sumArr(c.a.faceoffs) : 0 };
    if (!R.initDone) { R.initDone = true; R.base = counters; this.rkManpower(); return; }
    const d = { sh: [counters.sh[0] - R.base.sh[0], counters.sh[1] - R.base.sh[1]], hit: [counters.hit[0] - R.base.hit[0], counters.hit[1] - R.base.hit[1]], bl: [counters.bl[0] - R.base.bl[0], counters.bl[1] - R.base.bl[1]], fo: counters.fo - R.base.fo };
    R.base = counters;
    const ti = id => String(id) === String(live.homeId) ? 0 : String(id) === String(live.awayId) ? 1 : -1;
    const eps = []; let stops = 0;
    fresh.sort((a, b) => this.eventMinute(a) - this.eventMinute(b)).forEach(e => {
      const t = ti(e.teamId), txt = e.text || '';
      switch (e.kind) {
        case 'goal': if (t < 0) break; if (e.penaltyShot) eps.push({ k: 'so', t, shooter: e.scorerId, outcome: 'goal', text: 'Штрафной бросок' }); else { eps.push({ k: 'goal', t, scorer: e.scorerId, a1: e.assist1Id, en: !!e.emptyNet, ev: e }); d.sh[t]--; } break;
        case 'save': if (t < 0) break; eps.push({ k: 'save', t, shooter: e.actorId }); d.sh[t]--; break;
        case 'block': if (t < 0) break; eps.push({ k: 'block', t: 1 - t, blocker: e.actorId, shooter: e.targetId }); d.bl[t]--; break;
        case 'hit': if (t < 0) break; eps.push({ k: 'hit', t, hitter: e.actorId, victim: e.targetId }); d.hit[t]--; break;
        case 'icing': eps.push({ k: 'stop', kind: 'icing', t: t >= 0 ? t : Math.floor(Math.random() * 2) }); stops++; break;
        case 'offside': eps.push({ k: 'stop', kind: 'offside', t }); stops++; break;
        case 'injury': eps.push({ k: 'stop', kind: 'injury', pid: e.playerId, t }); stops++; break;
        case 'timeout': eps.push({ k: 'stop', kind: 'timeout', t }); stops++; break;
        case 'faceoff':
          if (e.period === 'Б') break;
          if (/ловушк|фиксирует|накрыва/i.test(txt)) { eps.push({ k: 'stop', kind: 'freeze', t }); stops++; }
          else if (/овертайм/i.test(txt)) { eps.push({ k: 'stop', kind: 'center', t }); stops++; }
          else if (e.stoppage) { eps.push({ k: 'stop', kind: Math.random() < .5 ? 'out' : 'generic', t }); stops++; }
          break;
        case 'penalty': case 'penaltyStart': case 'delayedPenalty':
          if (e.kind === 'delayedPenalty' || e.playerId == null) break;
          eps.push({ k: 'penalty', t, pid: e.playerId, gk: !!e.goaliePenalty }); stops++; break;
        case 'penaltyEnd': case 'penaltyReturn': case 'penaltySegmentEnd': case 'misconductEnd': if (e.playerId != null) eps.push({ k: 'penEnd', pid: e.playerId, t }); break;
        case 'fight': eps.push({ k: 'fight', t, a: e.playerId, b: e.opponentPlayerId }); stops++; break;
        case 'intermission': eps.push({ k: 'inter' }); break;
        case 'final': eps.push({ k: 'final' }); break;
        case 'shootoutAttempt': eps.push({ k: 'so', t, shooter: e.scorerId, outcome: e.outcome, text: 'Буллит' }); break;
        case 'penaltyShotAttempt': if (t >= 0) eps.push({ k: 'so', t, shooter: e.playerId, outcome: 'save', text: 'Штрафной бросок' }); break;
        default: break;
      }
      // отложенные удаления иногда фиксируются текстом внутри события свистка
      // (вне игры/проброс/вбрасывание), а не отдельным событием 'penalty' — без
      // этого игрок так и не уезжал в бокс, хотя численность уже менялась.
      if (e.kind !== 'penalty' && e.kind !== 'penaltyStart' && Array.isArray(e.penaltyDetails) && e.penaltyDetails.length) {
        e.penaltyDetails.forEach(pd => {
          if (pd.playerId == null) return;
          const pt = ti(pd.teamId);
          eps.push({ k: 'penalty', t: pt, pid: pd.playerId, gk: !!pd.goaliePenalty }); stops++;
        });
      }
    });
    if (!live.inShootout) {
      [0, 1].forEach(t => { for (let i = 0; i < d.sh[t]; i++) eps.push({ k: 'save', t, x: true }); for (let i = 0; i < Math.min(2, d.hit[t]); i++) eps.push({ k: 'hit', t, x: true }); for (let i = 0; i < Math.min(1, d.bl[t]); i++) eps.push({ k: 'block', t: 1 - t, x: true }); });
      const extraStops = Math.min(2, d.fo - stops); for (let i = 0; i < extraStops; i++) eps.push({ k: 'stop', kind: Math.random() < .3 ? 'out' : 'generic', x: true, t: Math.floor(Math.random() * 2) });
    }
    eps.forEach(ep => { ep.pri = ep.x && ep.k === 'stop' ? PRI.xstop : PRI[ep.k]; ep.dur = DUR[ep.k] || 1; });
    R.queue.push(...eps);
    this.rkManpower();
    this.rkBudget();
  };
  // уложить очередь эпизодов в реальное время между минутами
  // («Полная достоверность»: такт сам по себе медленнее (см. LIVE_TICK_MS), скорость
  // показа разгоняется мягко (не выше ×1.3), а порог срезания эпизодов снисходительнее —
  // почти ничего не пропадает. Приоритет 0 (гол/удаление/драка/перерыв) не срезается
  // никогда; если очередь всё равно не помещается в окно — pri1 ограничивается одной
  // «остановкой», а на самый крайний случай есть предохранитель от затяжного отставания,
  // см. ниже.
  proto.rkBudget = function () {
    const R = this._rk, budget = R.tickSpan / 1000, dropMul = 3.0;
    const total = () => R.queue.reduce((s, e) => s + e.dur, 0) + (R.cur ? Math.max(0, R.cur.dur - R.cur.t) : 0);
    for (const lvl of [4, 3, 2]) { if (total() <= budget * dropMul) break; R.queue = R.queue.filter(e => e.pri < lvl); }
    if (total() > budget * dropMul) { let n = 0; R.queue = R.queue.filter(e => e.pri !== 1 || n++ < 1); }
    // предохранитель: если даже после срезов очередь скопилась надолго (гол за голом,
    // удаление на удаление без пауз между ними) — временно разрешаем досчитать быстрее
    // обычного потолка, чтобы коробка не отставала от табло всё сильнее до конца матча.
    const overflow = total() / Math.max(.6, budget);
    const speedCap = overflow > 4 ? 2.4 : 1.3;
    R.speed = clamp(overflow, 1, speedCap);
  };

  proto.rkLive = function (live, m) {
    let R = this._rk;
    if (!R || R.matchId !== m.id) { this.rkStop(); R = this.rkInit(live, m); }
    ['rink-label', 'rink-legend', 'rink-detail'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('rk-hide'); });
    this.rkSync(live, m);
    if (!R.raf) { R.last = performance.now(); const loop = t => { if (this._rk !== R) return; R.raf = requestAnimationFrame(loop); this.rkFrame(t); }; R.raf = requestAnimationFrame(loop); }
  };

  /* ---------- шаг симуляции ---------- */
  const skaters = (R, ti) => R.ice[ti].sk.filter(p => p.st === 'ice');
  const gxT = (R, ti) => R.teams[ti].dir > 0 ? GXR : GXL, gxO = (R, ti) => R.teams[ti].dir > 0 ? GXL : GXR, offBlue = (R, ti) => R.teams[ti].dir > 0 ? BRl : BLl;
  const inOffZone = (R, ti, x) => (x - offBlue(R, ti)) * R.teams[ti].dir > 0;
  const zoneSpot = (R, ti, y) => (gxO(R, ti) < CX ? (y < CY ? SPOTS[1] : SPOTS[2]) : (y < CY ? SPOTS[3] : SPOTS[4]));
  function whistle(R, spot, delay) {
    const d = delay == null ? 1.0 : delay;
    R.mode = 'whistle'; R.mt = d; R.woDelay = d;
    // шайба едет к точке вбрасывания плавно (из того места, где остановилась игра),
    // а не появляется там мгновенно.
    R.foFrom = { x: R.puck.x, y: R.puck.y };
    R.fo = { x: spot[0], y: spot[1] };
    R.puck.owner = null; R.puck.to = null; R.puck.vx = R.puck.vy = 0; R.puck.air = 0; R.puck.out = 0; R.battle = null;
  }
  function foTargets(R, ti) {
    const dir = R.teams[ti].dir, { x, y } = R.fo, ys = y < CY ? 1 : -1;
    return { c: [x - dir * 9, y], w1: [x - dir * 5, y - 44], w2: [x - dir * 5, y + 44], d1: [x - dir * 60, y - ys * 26], d2: [x - dir * 60, y + ys * 32], e: [x - dir * 30, y + ys * 60] };
  }
  function give(R, p) { R.puck.owner = p; R.puck.to = null; p.hold = 0; R.puck.lastT = p.t; R.puck.touched = true; R.puck.cool = 0; R.puck.shot = false; R.puck.block = null; }
  function release(R, vx, vy, o) {
    const w = R.puck.owner; R.puck.owner = null; R.puck.vx = vx; R.puck.vy = vy; R.puck.cool = .28; R.puck.rel = w; R.puck.air = o && o.air ? 1 : 0;
    R.puck.touched = false; R.puck.to = (o && o.to) || null; R.puck.shot = !!(o && o.shot); R.puck.beat = !!(o && o.beat); R.puck.block = (o && o.block) || null; R.puck.freeze = !!(o && o.freeze); if (w) R.puck.lastT = w.t;
  }
  // 14.7.20: упреждение пасующего теперь считается от реального времени полёта шайбы
  // (расстояние/скорость), а не фиксированных 0.35 с — на длинных передачах партнёр успевает
  // уйти заметно дальше, чем даёт постоянное упреждение.
  function passTo(R, p, m) {
    const d0 = dist(p, m), sp = clamp(220 + d0 * .9, 220, 400), ft = d0 / sp;
    const lead = { x: m.x + m.vx * ft, y: m.y + m.vy * ft }, a = Math.atan2(lead.y - p.y, lead.x - p.x) + rnd(-.06, .06);
    release(R, Math.cos(a) * sp, Math.sin(a) * sp, { to: m });
  }
  function shoot(R, p, o) {
    const ti = p.t, gx = gxT(R, ti), g = R.ice[1 - ti].gk;
    let ay;
    if (o.result === 'goal') {
      // 14.7.20: бросок «в гол» больше не может случайно улететь прямо в текущую позицию
      // вратаря — зона, которую нужно облетать, тем шире, чем выше goalkeeping соперника.
      if (g) {
        const gy = clamp(g.y, CY - POST, CY + POST), avoidHalf = clamp(9 + ((g.gkSkill || 70) - 55) * .3, 7, POST - 2);
        let tries = 0, pick; do { pick = CY + (Math.random() < .5 ? -1 : 1) * rnd(3, POST - 2); tries++; } while (Math.abs(pick - gy) < avoidHalf && tries < 6);
        ay = pick;
      } else ay = CY + (Math.random() < .5 ? -1 : 1) * rnd(3, POST - 2);
    }
    else if (o.result === 'save') ay = g ? clamp(g.y + rnd(-6, 6), CY - POST, CY + POST) : CY;
    else ay = CY + rnd(-POST, POST);
    const a = Math.atan2(ay - R.puck.y, gx - R.puck.x), sp = rnd(460, 560);
    release(R, Math.cos(a) * sp, Math.sin(a) * sp, { shot: true, beat: o.result === 'goal', block: o.block || null, freeze: !!o.freeze });
  }
  function dumpOut(R, p) {
    const ti = p.t, dir = R.teams[ti].dir, ty = R.puck.y < CY ? T + 10 : B - 10, tx = clamp(R.puck.x + dir * rnd(200, 360), L + 40, RX - 40), a = Math.atan2(ty - R.puck.y, tx - R.puck.x);
    release(R, Math.cos(a) * 480, Math.sin(a) * 480, { air: true });
  }
  // отдать шайбу команде ti (ошибка соперника / перехват)
  function turnover(R, ti) {
    const o = R.puck.owner, sk = skaters(R, ti); if (!sk.length) return;
    const tgt = sk.sort((a, b) => dist(a, R.puck) - dist(b, R.puck))[0];
    if (o) { const a = Math.atan2(tgt.y - R.puck.y, tgt.x - R.puck.x) + rnd(-.1, .1); release(R, Math.cos(a) * 260, Math.sin(a) * 260, { to: tgt }); }
    else R.puck.to = tgt;
  }

  proto.rkFrame = function (now) {
    const R = this._rk, live = this.liveMatch; if (!R || !live) return;
    const dt0 = Math.min(.05, (now - R.last) / 1000); R.last = now;
    const vis = document.visibilityState !== 'hidden' && (document.getElementById('view-match') || {}).classList && document.getElementById('view-match').classList.contains('active');
    if (!vis) return;
    const paused = !!(live.paused && !live.runMode) || !!live.pendingShootoutPick || !!live.forcedSub;
    if (!paused) { try { this.rkStep(dt0 * R.speed); } catch (e) { console.error('KHL Manager rink step:', e); } }
    try { this.mcTickClockDom(); } catch (e) {}
    try { this.rkTrackLines(live); } catch (e) {}
    this.rkDraw();
  };

  // --- 14.7.24/14.7.27: подпись звена+пары на льду (п.4 концепта «Живая коробка 2.0»).
  // Работает только пока активен аниматор «Коробка» — именно его собственная симуляция
  // смен является источником данных «кто сейчас на льду»; в «Только голы»-режиме аниматор
  // на паузе, поэтому отслеживание тоже просто не идёт. 14.7.27: журнал смен убран по
  // просьбе игрока (при старой, не работавшей ротации он показывал смены раз в час —
  // вводил в заблуждение); вместо него — отдельное голосование по нападающим и отдельно
  // было одно общее голосование по всем 5 полевым сразу — из-за этого подпись могла не
  // совпадать с тем, кто реально на льду, и пару защитников вообще никогда не показывала).
  function majorityGroup(app, snapTeam, ids, wantKind) {
    if (!snapTeam || !ids.length) return null;
    const counts = new Map();
    for (const id of ids) {
      const g = app.lineupGroupFor(snapTeam, id);
      if (!g || g.kind !== wantKind) continue;
      const prev = counts.get(g.n) || 0; counts.set(g.n, prev + 1);
    }
    let best = null, bestN = 0;
    counts.forEach((n, num) => { if (n > bestN) { bestN = n; best = num; } });
    return best;
  }
  proto.rkTrackLines = function (live) {
    const R = this._rk; if (!R || !live) return;
    if (this.rkViewMode && this.rkViewMode() !== 'box') return;
    const snap = live.lineupSnapshot; if (!snap) return;
    const labels = [0, 1].map(ti => {
      const teamId = R.teams[ti].id;
      const ids = (R.ice[ti].sk || []).filter(p => p.st === 'ice').map(p => p.id);
      return { teamId, f: majorityGroup(this, snap[teamId], ids, 'forward'), d: majorityGroup(this, snap[teamId], ids, 'defense') };
    });
    R._lineLabels = labels;
    this.rkRenderLineLabel(labels);
  };
  proto.rkRenderLineLabel = function (labels) {
    const canvas = document.getElementById('rink-canvas'); if (!canvas || !canvas.insertAdjacentElement) return;
    let el = document.getElementById('rink-line-label');
    if (!el) {
      el = document.createElement('div'); el.id = 'rink-line-label'; el.className = 'rk-line-label';
      const toggle = document.getElementById('rink-view-toggle');
      if (toggle && toggle.insertAdjacentElement) toggle.insertAdjacentElement('afterend', el);
      else canvas.insertAdjacentElement('beforebegin', el);
    }
    const parts = labels.filter(l => l.f || l.d).map(l => {
      const t = this.teamById(l.teamId);
      const bits = [];
      if (l.f) bits.push('Атакующее звено ' + l.f);
      if (l.d) bits.push('Пара защитников ' + l.d);
      return `<b>${this.escape(t ? t.name : '')}</b>: ${bits.join(' · ')}`;
    });
    el.innerHTML = parts.length ? 'Сейчас на льду — ' + parts.join(' · ') : '';
  };

  // секунды на часах матча бегут в реальном времени между тактами движка (который
  // считает только целыми минутами) — чисто визуальная интерполяция, на результат
  // и события матча не влияет.
  proto.mcLiveSeconds = function () {
    const R = this._rk, live = this.liveMatch;
    if (!R || !live) return 0;
    if (live.paused && !live.runMode) return R.lastSec || 0;
    const span = R.tickSpan || 1700;
    const elapsed = performance.now() - (R.lastTick || performance.now());
    const s = Math.max(0, Math.min(59, Math.floor(elapsed * 60 / span)));
    R.lastSec = s;
    return s;
  };
  proto.mcTickClockDom = function () {
    const live = this.liveMatch; if (!live || live.finished) return;
    const el = document.getElementById('mc-clock-main'); if (!el) return;
    el.textContent = this.liveClock(live.visibleMinute || 0, live.simulatedMatch, this.mcLiveSeconds());
  };

  proto.rkStep = function (dt) {
    const R = this._rk, live = this.liveMatch, P = R.puck; R.time += dt; R.flash = Math.max(0, R.flash - dt * 2); P.cool = Math.max(0, P.cool - dt);
    // численность на льду сверяется с движком каждый кадр (а не раз в такт ~1.2 с),
    // поэтому любой перекос (после гола, смены периода и т.п.) выправляется почти
    // мгновенно, а не висит на экране секунду-другую.
    try { this.rkManpower(); } catch (e) {}
    // 14.7.20: усталость полевых игроков по skills.stamina — копится на льду, восстанавливается
    // на скамейке/в боксе; сказывается на личном maxV ниже (см. движение). Там же угасает
    // «бабочка» вратаря (bfly, визуальный жест при сейве — см. rkPuck/rkDraw).
    [...R.pobj.values()].forEach(p => {
      if (p.gk) { if (p.bfly > 0) p.bfly = Math.max(0, p.bfly - dt); return; }
      if (p.st === 'ice') { p.ice = (p.ice || 0) + dt; const drain = .012 * clamp(1 - ((p.stamSkill || 70) - 70) / 200, .5, 1.35); p.stam = clamp((p.stam == null ? 1 : p.stam) - drain * dt, .6, 1); }
      else { p.stam = clamp((p.stam == null ? 1 : p.stam) + .05 * dt, .6, 1); p.ice = 0; }
    });
    const targets = new Map(); const pp = { x: P.x + P.vx * .45, y: P.y + P.vy * .45 }; contain(pp, PR + 2);
    let cur = R.cur;
    if (!cur && R.queue.length) { cur = R.cur = R.queue.shift(); cur.t = 0; this.rkSetup(cur); }
    if (cur && (R.mode === 'play' || cur.k === 'so' || cur.k === 'fight')) cur.t += dt;
    const att = P.owner ? P.owner.t : (P.to ? P.to.t : (P.lastT < 0 ? 0 : P.lastT)), def = 1 - att;

    /* --- свисток / вбрасывание --- */
    if (R.mode === 'whistle' || R.mode === 'faceoff' || R.mode === 'drop') {
      R.mt -= dt;
      [0, 1].forEach(ti => {
        const ft = foTargets(R, ti), sk = skaters(R, ti);
        const fw = [...sk.filter(p => p.role === 'c'), ...sk.filter(p => p.role === 'w')], ds = sk.filter(p => p.role === 'd'), keys = new Map();
        fw.forEach((p, i) => keys.set(p, i === 0 ? 'c' : i === 1 ? 'w1' : i === 2 ? 'w2' : 'e')); ds.forEach((p, i) => keys.set(p, i === 0 ? 'd1' : i === 1 ? 'd2' : 'e'));
        sk.forEach(p => targets.set(p, [...ft[keys.get(p) || 'e'], 90]));
        const g = R.ice[ti].gk; if (g) targets.set(g, [gxO(R, ti) + R.teams[ti].dir * 8, CY, 60]);
      });
      if (R.mode === 'whistle') {
        // шайба едет к точке вбрасывания плавно, а не телепортируется туда мгновенно
        const dur = R.woDelay || 1, k = clamp(1 - Math.max(0, R.mt) / dur, 0, 1), ek = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const from = R.foFrom || R.fo;
        P.x = lerp(from.x, R.fo.x, ek); P.y = lerp(from.y, R.fo.y, ek); P.vx = P.vy = 0;
      } else if (R.mode === 'faceoff') { P.x = R.fo.x; P.y = R.fo.y; P.vx = P.vy = 0; }
      if (R.mode === 'whistle' && R.mt <= 0) { R.mode = 'faceoff'; R.mt = .9; }
      else if (R.mode === 'faceoff' && R.mt <= 0) { R.mode = 'drop'; R.mt = rnd(.35, .6); }
      else if (R.mode === 'drop') {
        [0, 1].forEach(ti => { const c = skaters(R, ti).find(p => p.role === 'c') || skaters(R, ti)[0]; if (c) targets.set(c, [R.fo.x + Math.sin(c.ph * 5 + R.time * 40) * 5, R.fo.y + Math.cos(c.ph * 4 + R.time * 34) * 5, 110]); });
        this.rkTieUp(targets, .75);
        P.x = R.fo.x + rnd(-2, 2); P.y = R.fo.y + rnd(-2, 2); P.vx = P.vy = 0;
        if (R.mt <= 0) {
          const w = cur && cur.foWin != null ? cur.foWin : (Math.random() < .5 ? 0 : 1);
          const sk = skaters(R, w), c = sk.find(p => p.role === 'c') || sk[0];
          P.owner = null; P.lastT = w; P.cool = .1; P.touched = true; R.foAfter = 1.0; R.foLoser = 1 - w;
          if (Math.random() < .2 || !c) { const a = rnd(0, 6.28); P.vx = Math.cos(a) * 60; P.vy = Math.sin(a) * 60; P.to = null; }
          else { const d = sk.find(p => p.role === 'd' && Math.hypot(p.x - R.fo.x, p.y - R.fo.y) > 20) || c; const a = Math.atan2(d.y - P.y, d.x - P.x); P.vx = Math.cos(a) * 150; P.vy = Math.sin(a) * 150; P.to = d; }
          R.mode = 'play';
          if (cur && (cur.k === 'stop' || cur.k === 'penalty' || cur.k === 'fight' || cur.k === 'inter' || cur.k === 'goal') && cur.phase === 'fo') R.cur = cur = null;
        }
      }
    } else if (R.mode === 'celebrate') {
      R.mt -= dt;
      [0, 1].forEach(ti => { const g = R.ice[ti].gk; if (g) targets.set(g, [gxO(R, ti) + R.teams[ti].dir * 8, CY, 60]);
        skaters(R, ti).forEach((p, i) => targets.set(p, ti === R.celT ? [CX + R.teams[ti].dir * (200 + i * 6), CY + (i - 2) * 22, 120] : [CX - R.teams[ti].dir * 120, CY + (i - 2) * 40, 70])); });
      // 14.7.20: автор гола на секунду подъезжает именно к ассистенту (а не просто
      // стягивается к общей точке со всеми) — короткий обмен «передачей», затем расходятся
      // с остальными по общей формуле выше.
      if (cur && cur.k === 'goal' && cur.shooterObj && cur.shooterObj.st === 'ice') {
        const cx2 = CX + R.teams[R.celT].dir * 110;
        targets.set(cur.shooterObj, [cx2 - 8, CY, 95]);
        if (cur.a1Obj && cur.a1Obj.st === 'ice') targets.set(cur.a1Obj, [cx2 + 8, CY, 95]);
      }
      if (R.mt <= 0) { if (cur && cur.k === 'goal') { cur.phase = 'fo'; } whistle(R, SPOTS[0], .8); }
    } else if (R.mode === 'so') {
      this.rkStepShootout(dt, targets);
    } else { /* --- игра --- */
      const o = P.owner;
      if (o) {
        o.hold += dt;
        const dir = R.teams[o.t].dir, inZ = inOffZone(R, o.t, o.x), press = skaters(R, def).some(p => dist(p, o) < 28);
        const want = cur && cur.t > 0 && (cur.k === 'goal' || cur.k === 'save' || cur.k === 'block') && cur.team === o.t;
        const gx = gxT(R, o.t), dgGoal = Math.hypot(gx - o.x, CY - o.y);
        // 14.7.20: для гола с известным реальным местом броска (shotPt) готовность бросать
        // проверяется по близости именно к этой точке, а не к воротам «в среднем».
        const dg = (cur && cur.k === 'goal' && cur.shotPt) ? Math.hypot(cur.shotPt.x - o.x, cur.shotPt.y - o.y) : dgGoal;
        const nearGate = (cur && cur.k === 'goal' && cur.shotPt) ? 26 : (cur && cur.k === 'block' ? 250 : 185);
        if (want) {
          const shooter = cur.shooterObj && cur.shooterObj.st === 'ice' ? cur.shooterObj : null;
          if (shooter && shooter !== o && o.hold > .25 && cur.t < cur.dur + 1.2) { passTo(R, o, shooter); }
          else if (dg < nearGate && (o.hold > .3 || cur.t > cur.dur + 1) || cur.t > cur.dur + 2.2) {
            const blk = cur.k === 'block' ? (cur.blockerObj && cur.blockerObj.st === 'ice' ? cur.blockerObj : skaters(R, def).sort((a, b) => dist(a, o) - dist(b, o))[0]) : null;
            shoot(R, o, { result: cur.k === 'goal' ? 'goal' : cur.k === 'save' ? 'save' : 'block', block: blk, freeze: cur.freeze });
            if (cur.k !== 'goal') cur.phase = 'done';
            else cur.phase = 'fly';
          }
        } else if (cur && cur.k === 'stop' && cur.kind === 'out' && cur.phase === 'get' && cur.team === o.t) { dumpOut(R, o); cur.phase = 'fly'; }
        else if (o.hold > rnd(.8, 1.8) || (press && o.hold > .4)) {
          const mates = skaters(R, o.t).filter(p => p !== o);
          const sc = p => { const open = Math.min(...skaters(R, def).map(q => dist(q, p)), 200); return (p.x - o.x) * dir * .5 + open * 1.4 - dist(o, p) * .25 + (inOffZone(R, o.t, p.x) ? 30 : 0); };
          const best = mates.sort((a, b) => sc(b) - sc(a))[0];
          if (best && (sc(best) > -40 || o.hold > 2.2)) passTo(R, o, best);
        }
      }
      /* --- цели: расстановки --- */
      const loose = !P.owner;
      [0, 1].forEach(ti => {
        const t = R.teams[ti], dir = t.dir, sk = skaters(R, ti), g = R.ice[ti].gk;
        // 14.7.20: скорость выхода на дугу теперь зависит от goalkeeping (быстрее у классных вратарей)
        if (g) { const gxo = gxO(R, ti), a = Math.atan2(P.y - CY, (P.x - gxo) * dir), ca = clamp(a, -1.1, 1.1), gSp = 70 * clamp(.82 + ((g.gkSkill || 70) - 70) * .006, .65, 1.3); targets.set(g, [gxo + dir * (5 + Math.cos(ca) * 14), CY + Math.sin(ca) * 15, gSp]); }
        const my = ti === att, inZ = inOffZone(R, my ? ti : 1 - ti, P.x), base = P.x;
        let pts;
        if (my) pts = inZ ? [[gxT(R, ti) - dir * 118, CY - 70], [gxT(R, ti) - dir * 118, CY + 70], [gxT(R, ti) - dir * 30, CY - 90], [gxT(R, ti) - dir * 30, CY + 90], [gxT(R, ti) - dir * 70, CY], [gxT(R, ti) - dir * 150, CY]]
          : [[clamp(base - dir * 120, L + 30, RX - 30), CY - 64], [clamp(base - dir * 120, L + 30, RX - 30), CY + 64], [clamp(base + dir * 90, L + 30, RX - 30), CY - 86], [clamp(base + dir * 90, L + 30, RX - 30), CY + 86], [clamp(base + dir * 40, L + 30, RX - 30), CY + Math.sin(R.time * 3) * 30], [clamp(base - dir * 40, L + 30, RX - 30), CY]];
        else { const b1 = lerp(gxO(R, ti), P.x, inZ ? .3 : .42), b2 = lerp(gxO(R, ti), P.x, inZ ? .55 : .65); pts = [[b1, CY - 50], [b1, CY + 50], [b2, CY - 78], [b2, CY + 78], [b2, CY], [lerp(gxO(R, ti), P.x, .2), CY]]; }
        const ds = sk.filter(p => p.role === 'd'), fs = sk.filter(p => p.role !== 'd'); let di = 0, fi = 0;
        sk.forEach(p => { let a; if (p.role === 'd') a = pts[di++ < 2 ? di - 1 : 5]; else { const j = fi++; a = pts[j === 0 ? 4 : j === 1 ? 2 : j === 2 ? 3 : 5]; } targets.set(p, [a[0] + Math.sin(p.ph * 3 + R.time * 9) * 8, a[1] + Math.cos(p.ph * 2 + R.time * 7) * 6, 78]); });
        if (loose) { const ch = P.to && P.to.t === ti && P.to.st === 'ice' ? P.to : sk.sort((a, b) => dist(a, pp) - dist(b, pp))[0]; if (ch) targets.set(ch, [pp.x, pp.y, 118]); }
        else if (P.owner.t === ti) {
          const oo = P.owner, inZo = inOffZone(R, ti, oo.x);
          const tx = inZo ? clamp(gxT(R, ti) - dir * (oo.hold * 30 + 50), L + 30, RX - 30) : clamp(offBlue(R, ti) + dir * 60, L + 30, RX - 30);
          const ty = inZo ? CY + Math.sin(oo.ph + R.time * 5) * 60 : clamp(oo.y + Math.sin(oo.ph + R.time * 4) * 40, T + 40, B - 40);
          targets.set(oo, [tx, ty, 105]);
        } else { const oo = P.owner, pr = sk.sort((a, b) => dist(a, oo) - dist(b, oo))[0]; if (pr) targets.set(pr, [oo.x + oo.vx * .25, oo.y + oo.vy * .25, 112]); }
      });
      if (R.foAfter > 0) {
        R.foAfter -= dt; this.rkTieUp(targets, .6);
        const lc = skaters(R, R.foLoser).find(p => p.role === 'c'); if (lc) targets.set(lc, [pp.x, pp.y, 112]);
      }
      /* --- режиссёр --- */
      if (cur) this.rkDirect(cur, targets, pp);
    }
    /* --- борьба --- */
    if (R.mode === 'play' && !P.owner && !P.air && !P.out && Math.hypot(P.vx, P.vy) < 90 && !(cur && cur.k === 'fight')) {
      const near = [0, 1].map(ti => skaters(R, ti).filter(p => dist(p, P) < PR + 9));
      if (near[0].length && near[1].length && !R.battle) R.battle = { t: rnd(.5, 1.0), f: [...near[0], ...near[1]] };
    }
    if (R.battle) {
      R.battle.t -= dt; R.battle.f.forEach(p => targets.set(p, [P.x + Math.sin(p.ph * 5 + R.time * 40) * 12, P.y + Math.cos(p.ph * 4 + R.time * 34) * 10, 90]));
      P.vx += rnd(-60, 60); P.vy += rnd(-60, 60);
      if (R.battle.t <= 0) {
        const f = R.battle.f.filter(p => p.st === 'ice'); let w = f[Math.floor(Math.random() * f.length)];
        if (cur && cur.team != null && (cur.k === 'goal' || cur.k === 'save' || cur.k === 'block' || cur.k === 'hit')) { const pref = f.filter(p => p.t === (cur.k === 'hit' ? 1 - cur.team : cur.team)); if (pref.length) w = pref[0]; }
        // 14.7.20: исход борьбы — не мгновенная передача шайбы победителю, а короткий
        // рикошет от ближайшего к шайбе соперника («щита») в его сторону; подбирает он
        // её сам уже обычной физикой подбора свободной шайбы (P.to) через пару кадров.
        const shield = f.filter(p => p !== w).sort((a, b) => dist(a, P) - dist(b, P))[0];
        R.battle = null;
        if (w) {
          if (shield && dist(shield, P) < PR + 7) { const a = Math.atan2(w.y - P.y, w.x - P.x) + rnd(-.25, .25); P.owner = null; P.vx = Math.cos(a) * 130; P.vy = Math.sin(a) * 130; P.cool = .12; P.touched = true; P.lastT = shield.t; P.to = w; }
          else give(R, w);
        }
      }
    }
    /* --- движение игроков --- */
    const everyone = [];
    [0, 1].forEach(ti => { everyone.push(...R.ice[ti].sk); if (R.ice[ti].gk) everyone.push(R.ice[ti].gk); });
    [...R.pobj.values()].forEach(p => { if (p.st === 'out') everyone.push(p); });
    everyone.forEach(p => {
      if (p.st === 'out') { const bx = BENCH[p.t][0] + BENCH[p.t][2] / 2, by = BENCH[p.t][1] + 13; const d = Math.hypot(bx - p.x, by - p.y); if (d < 8) { p.st = 'bench'; return; } p.x += (bx - p.x) / d * Math.min(d, 160 * dt); p.y += (by - p.y) / d * Math.min(d, 160 * dt); return; }
      const tg = targets.get(p);
      // 14.7.20: ситуативный «потолок» скорости (tg[2]) теперь масштабируется личным
      // профилем игрока (maxV считался от skills.skating в mkPlayer, 95 — база для 70 очков
      // навыка) и усталостью (p.stam); вратарь по-прежнему без личного скейла — у него своя
      // логика выноса/скорости на дуге (см. цели выше).
      const perScale = p.gk ? .9 : clamp((p.maxV || 95) / 95, .55, 1.4) * (p.stam == null ? 1 : p.stam);
      const maxV = (tg ? tg[2] : 70) * perScale;
      if (tg) {
        const d = Math.hypot(tg[0] - p.x, tg[1] - p.y) || 1, want = Math.min(maxV, d * 3);
        if (p.gk || !p.turn) { const k = Math.min(1, 5 * dt); p.vx += ((tg[0] - p.x) / d * want - p.vx) * k; p.vy += ((tg[1] - p.y) / d * want - p.vy) * k; }
        else steer(p, tg[0], tg[1], want, dt);
      }
      else { p.vx *= Math.pow(.1, dt); p.vy *= Math.pow(.1, dt); }
      p.x += p.vx * dt; p.y += p.vy * dt;
    });
    const ice = everyone.filter(p => p.st === 'ice');
    for (let it = 0; it < 2; it++) for (let i = 0; i < ice.length; i++) for (let j = i + 1; j < ice.length; j++) {
      const a = ice[i], b = ice[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, min = PR * 2 + 2;
      if (d < min) { const push = (min - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
    }
    ice.forEach(p => { if (p.y > T + 6) { const n = contain(p, PR + 2); if (n) { p.vx *= .5; p.vy *= .5; } } if (p.gk) { const g = gxO(R, p.t), d = R.teams[p.t].dir; p.x = clamp(p.x, Math.min(g - 6 * d, g + 40 * d), Math.max(g - 6 * d, g + 40 * d)); p.y = clamp(p.y, CY - CREASE - 4, CY + CREASE + 4); } });
    R.box.forEach((p, i) => { p.x = BOX[0] + 24 + i * 24; p.y = BOX[1] + 16; });
    /* --- шайба --- */
    this.rkPuck(dt);
  };
  proto.rkTieUp = function (targets, k) {
    const R = this._rk; const A = skaters(R, 0).filter(p => p.role === 'w'), Bw = skaters(R, 1).filter(p => p.role === 'w');
    for (let i = 0; i < Math.min(A.length, Bw.length, 2); i++) { const a = A[i], b = Bw[i]; if (R.puck.owner !== a) targets.set(a, [lerp(a.x, b.x, k), lerp(a.y, b.y, k), 85]); if (R.puck.owner !== b) targets.set(b, [lerp(b.x, a.x, k), lerp(b.y, a.y, k), 85]); }
  };

  /* ---------- режиссёр: эпизоды по событиям движка ---------- */
  proto.rkSetup = function (cur) {
    const R = this._rk, live = this.liveMatch;
    cur.phase = 'get'; cur.team = cur.t; cur.keep = [];
    switch (cur.k) {
      case 'goal': case 'save': case 'block': {
        const pid = cur.k === 'goal' ? cur.scorer : cur.shooter;
        if (pid != null) { const p = this.rkEnsure(pid, cur.team); if (p) { cur.shooterObj = p; cur.keep.push(p); } }
        if (cur.k === 'block' && cur.blocker != null) { const b = this.rkEnsure(cur.blocker, 1 - cur.team); if (b) { cur.blockerObj = b; cur.keep.push(b); } }
        if (cur.k === 'save' && !cur.x && Math.random() < .35) cur.freeze = true;
        if (cur.k === 'goal' && cur.en) cur.dur = 2.2;
        // 14.7.20: гол — из того самого места броска, что уже детерминированно посчитано
        // для карты голов (match_center.js: ensureGoalPlace/shotZone/shotDx/shotDy). Берём
        // через mcGoals (сама кэширует место на событии) и переводим в координаты живой
        // коробки готовой раскладкой mcLayout — так место на коробке и на карте голов после
        // матча совпадает буквально.
        if (cur.k === 'goal' && cur.ev) {
          try {
            const m = live.simulatedMatch, goals = this.mcGoals(m), gEntry = goals.find(x => x.e === cur.ev);
            if (gEntry) { const pts = this.mcLayout([gEntry]); if (pts[0]) cur.shotPt = { x: pts[0].x, y: pts[0].y }; }
          } catch (e) {}
          if (cur.a1 != null) { const a1p = this.rkEnsure(cur.a1, cur.team); if (a1p) { cur.a1Obj = a1p; cur.keep.push(a1p); } }
        }
        if (R.mode !== 'play') cur.wait = true;
        break; }
      case 'hit': {
        if (cur.hitter != null) { const h = this.rkEnsure(cur.hitter, cur.team); if (h) { cur.hitterObj = h; cur.keep.push(h); } }
        if (cur.victim != null) { const v = this.rkEnsure(cur.victim, 1 - cur.team); if (v) { cur.victimObj = v; cur.keep.push(v); } }
        break; }
      case 'stop': {
        if (cur.kind === 'out' && R.mode === 'play') { cur.team = cur.t >= 0 ? cur.t : (R.puck.owner ? R.puck.owner.t : 0); cur.phase = 'get'; }
        else this.rkWhistleFor(cur);
        break; }
      case 'penalty': {
        const p = cur.gk ? null : this.rkObj(cur.pid, cur.t); if (p && p.gk) { cur.phase = 'fo'; }
        const spot = cur.t >= 0 ? zoneSpot(R, cur.t, R.puck.y) : nearestSpot(R.puck.x, R.puck.y);
        whistle(R, spot, 1.6); cur.phase = 'fo';
        if (p && !p.gk && cur.t >= 0) { if (p.st !== 'ice') this.rkEnsure(p.id, cur.t); this.rkToBox(p); }
        // 14.7.27: команда, которой только что назначили удаление, не успевает поменять
        // пятёрку на этом же свистке (правило КХЛ — замены только после остановки, и
        // «пострадавшая» в моменте удаления команда её не получает) — у соперника же
        // обычный шанс на смену как на любом другом свистке.
        this.rkCheckShiftChange(cur.t >= 0 ? cur.t : -1);
        break; }
      case 'penEnd': {
        const p = obj(R, cur.pid); if (p && p.st === 'box') { R.box = R.box.filter(x => x !== p); p.st = 'bench'; p.x = BOX[0] + BOX[2] / 2; p.y = BOX[1] + 16; }
        cur.phase = 'done'; break; }
      case 'fight': {
        const a = cur.a != null ? this.rkEnsure(cur.a, cur.team) : null, b = cur.b != null ? this.rkEnsure(cur.b, 1 - cur.team) : null;
        cur.fa = a; cur.fb = b; cur.keep = [a, b].filter(Boolean); R.puck.owner = null; R.puck.vx = R.puck.vy = 0; R.mode = 'play'; break; }
      case 'inter': {
        whistle(R, SPOTS[0], 1.4); cur.phase = 'fo';
        // 14.7.27: начало нового периода — свежий старт с 1-го звена/1-й пары у обеих команд
        // (как часто бывает в хоккее), а не произвольный сдвиг счётчика.
        R.li[0] = { f: 0, d: 0 }; R.li[1] = { f: 0, d: 0 };
        R.shift[0] = { f: { elapsed: 0, target: sampleShiftTarget() }, d: { elapsed: 0, target: sampleShiftTarget() } };
        R.shift[1] = { f: { elapsed: 0, target: sampleShiftTarget() }, d: { elapsed: 0, target: sampleShiftTarget() } };
        break; }
      case 'final': { whistle(R, SPOTS[0], 99); cur.phase = 'done'; break; }
      case 'so': { this.rkStartShootout(cur); break; }
      default: cur.phase = 'done';
    }
  };
  proto.rkToBox = function (p) {
    const R = this._rk; this.rkToBench(p); p.st = 'box'; if (!R.box.includes(p)) R.box.push(p);
  };
  proto.rkWhistleFor = function (cur) {
    const R = this._rk, P = R.puck; let spot;
    const t = cur.t >= 0 ? cur.t : (P.owner ? P.owner.t : 0);
    if (cur.kind === 'icing') spot = zoneSpot(R, t, P.y);
    else if (cur.kind === 'offside') spot = nearestSpot(P.x, P.y, s => s[0] === NXL || s[0] === NXR);
    else if (cur.kind === 'center') spot = SPOTS[0];
    else if (cur.kind === 'freeze') spot = endSpot(P.x, P.y);
    else spot = nearestSpot(P.x, P.y);
    whistle(R, spot, cur.kind === 'timeout' ? 2.4 : 1.1); cur.phase = 'fo';
    if (cur.kind === 'injury' && cur.pid != null) { const p = obj(R, cur.pid); if (p && p.st === 'ice') this.rkToBench(p); }
    // 14.7.27: настоящая ротация пятёрками — на каждом свистке проверяем независимые
    // таймеры нападения/защиты обеих команд (см. rkCheckShiftChange).
    this.rkCheckShiftChange(-1);
  };
  // 14.7.27: вес «кого выпустить следующим» — топ-звенья получают смену чаще (как в
  // справке: лидер — 25–30 смен за матч, четвёртое звено — 10–15), но не детерминированно
  // по кругу, а случайным выбором с весами; текущее звено/пара исключены — поменять надо
  // ОБЯЗАТЕЛЬНО не на себя же.
  function weightedNextLine(candidates, curIdx) {
    const idxs = candidates.filter(i => i !== curIdx);
    if (!idxs.length) return curIdx;
    const W = [4, 3, 2, 1, 1, 1];
    const weights = idxs.map(i => W[i] != null ? W[i] : 1), total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let k = 0; k < idxs.length; k++) { r -= weights[k]; if (r <= 0) return idxs[k]; }
    return idxs[idxs.length - 1];
  }
  // 14.7.27: полноценная смена ОДНОЙ группы (нападение ИЛИ защита) команды ti целиком —
  // снимаем с льда всех игроков текущего звена/пары этого вида, выбираем следующее
  // звено/пару (с весами выше) и даём движку (rkManpower→rkFillIce) выпустить его.
  // Неполное последнее звено/пара (нечётное число защитников в активном составе) в
  // саму ротацию не участвует — иначе на льду оказывалась бы одна «половинка» пары,
  // а вторым местом движок добирал бы кого-то из другой пары (старая путаница).
  proto.rkPerformShift = function (ti, kind) {
    const R = this._rk; if (!R) return;
    const ln = R.lines[ti], li = R.li[ti]; if (!ln) return;
    const groups = kind === 'f' ? ln.F : ln.D; if (!groups || groups.length < 2) return;
    const fullSize = kind === 'f' ? 3 : 2;
    const eligible = groups.map((g, i) => i).filter(i => groups[i].length === fullSize);
    if (eligible.length < 2) return;
    const curIdx = (kind === 'f' ? li.f : li.d) % groups.length;
    const curGroup = groups[curIdx] || [];
    curGroup.forEach(src => { const p = R.pobj.get(src.id); if (p && p.st === 'ice') this.rkToBench(p); });
    const nextIdx = weightedNextLine(eligible, curIdx);
    if (kind === 'f') li.f = nextIdx; else li.d = nextIdx;
    this.rkManpower();
  };
  // 14.7.27: независимые таймеры «сколько эта пятёрка уже отыграла» для нападения и
  // защиты каждой команды — продвигаются на каждой остановке игры (движок считает матч
  // целыми минутами, поэтому берём усреднённый интервал между остановками, а не секундомер
  // реального времени). skipTeam — команда, которой только что назначили удаление: по
  // правилам КХЛ замены на этом конкретном свистке у неё нет (см. вызов в case 'penalty').
  const RK_STOP_GAP_SEC = 18;
  proto.rkCheckShiftChange = function (skipTeam) {
    const R = this._rk; if (!R || !R.shift) return;
    [0, 1].forEach(ti => {
      if (ti === skipTeam) return;
      const sh = R.shift[ti]; if (!sh) return;
      ['f', 'd'].forEach(kind => {
        const s = sh[kind]; s.elapsed += RK_STOP_GAP_SEC;
        if (s.elapsed >= s.target) { s.elapsed = 0; s.target = sampleShiftTarget(); this.rkPerformShift(ti, kind); }
      });
    });
  };
  proto.rkDirect = function (cur, targets, pp) {
    const R = this._rk, P = R.puck;
    if (cur.phase === 'done') { R.cur = null; return; }
    switch (cur.k) {
      case 'goal': case 'save': case 'block': {
        if (cur.phase === 'get') { if (!(P.owner && P.owner.t === cur.team)) { if (cur.t > .15 && !(P.to && P.to.t === cur.team && !P.owner)) turnover(R, cur.team); } }
        // 14.7.20: как только автор гола реально завладел шайбой — ведём его именно в точку
        // реального броска (а не куда расставила общая логика «атака у чужих ворот»).
        if (cur.shotPt && cur.k === 'goal' && cur.shooterObj && cur.shooterObj.st === 'ice' && P.owner === cur.shooterObj) {
          const sp0 = targets.get(cur.shooterObj); targets.set(cur.shooterObj, [cur.shotPt.x, cur.shotPt.y, sp0 ? sp0[2] : 105]);
        }
        if (cur.phase === 'fly' && cur.t > cur.dur + 3) { cur.phase = 'done'; }
        if (cur.phase !== 'fly' && cur.t > cur.dur + 4) { cur.phase = 'done'; }
        break; }
      case 'hit': {
        const v = cur.victimObj && cur.victimObj.st === 'ice' ? cur.victimObj : (P.owner && P.owner.t !== cur.team ? P.owner : skaters(R, 1 - cur.team)[0]);
        const h = cur.hitterObj && cur.hitterObj.st === 'ice' ? cur.hitterObj : skaters(R, cur.team).sort((a, b) => dist(a, v || P) - dist(b, v || P))[0];
        if (!v || !h) { cur.phase = 'done'; break; }
        if (cur.phase === 'get') { if (!(P.owner === v)) { if (P.owner && P.owner !== v && P.owner.t === v.t && cur.t > .2 && P.owner.hold > .2) passTo(R, P.owner, v); else if (P.owner && P.owner.t !== v.t && cur.t > .15) turnover(R, v.t); else if (!P.owner) P.to = v; } else cur.phase = 'chase'; }
        if (cur.phase === 'chase' || cur.t > .9) { targets.set(h, [v.x + v.vx * .3, v.y + v.vy * .3, 125]); }
        if ((cur.phase === 'chase' && dist(h, v) < PR * 2 + 4) || cur.t > cur.dur + 1.5) {
          const a = Math.atan2(v.y - h.y, v.x - h.x); v.vx += Math.cos(a) * 170; v.vy += Math.sin(a) * 170; h.vx -= Math.cos(a) * 50; h.vy -= Math.sin(a) * 50;
          if (P.owner === v) { release(R, Math.cos(a + rnd(-1.4, 1.4)) * 140, Math.sin(a + rnd(-1.4, 1.4)) * 140); P.touched = true; }
          R.hitFx = { x: (v.x + h.x) / 2, y: (v.y + h.y) / 2, t: .5 }; cur.phase = 'done';
        }
        break; }
      case 'stop': {
        if (cur.kind === 'out') {
          if (cur.phase === 'get') { if (!(P.owner && P.owner.t === cur.team) && cur.t > .15) turnover(R, cur.team); if (cur.t > 2.2) { cur.phase = 'fly'; if (P.owner) dumpOut(R, P.owner); } }
          else if (cur.phase === 'fly' && !P.out && cur.t > 3.5) { this.rkWhistleFor(Object.assign(cur, { kind: 'generic' })); }
        }
        break; }
      case 'fight': {
        const a = cur.fa, b = cur.fb; if (!a || !b || a.st !== 'ice' || b.st !== 'ice') { cur.phase = 'done'; break; }
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        targets.set(a, [mx + Math.sin(R.time * 30) * 8, my + Math.cos(R.time * 26) * 6, 120]); targets.set(b, [mx - Math.sin(R.time * 30) * 8, my - Math.cos(R.time * 26) * 6, 120]);
        R.fightFx = { x: mx, y: my };
        if (cur.t > cur.dur) { R.fightFx = null; this.rkToBox(a); this.rkToBox(b); whistle(R, nearestSpot(P.x, P.y), 1.2); cur.phase = 'fo'; }
        break; }
      default: break;
    }
  };

  /* ---------- шайба ---------- */
  proto.rkPuck = function (dt) {
    const R = this._rk, P = R.puck, o = P.owner, cur = R.cur;
    if (R.mode === 'so') return;
    // 14.7.20: короткий затухающий след шайбы на быстрых свободных отрезках (бросок,
    // сильная передача) — несколько последних точек вместо одного фиксированного штриха.
    if (!o && R.mode === 'play' && Math.hypot(P.vx, P.vy) > 150) { R.trail = R.trail || []; R.trail.push({ x: P.x, y: P.y }); if (R.trail.length > 6) R.trail.shift(); }
    else if (R.trail && R.trail.length) R.trail.length = 0;
    if (o) {
      const sp = Math.hypot(o.vx, o.vy), fx = sp > 8 ? o.vx / sp : R.teams[o.t].dir, fy = sp > 8 ? o.vy / sp : 0, side = Math.sin(R.time * 85 + o.ph) * 6;
      const tx = o.x + fx * 14 - fy * side, ty = o.y + fy * 14 + fx * side;
      P.vx = (tx - P.x) * 18; P.vy = (ty - P.y) * 18; P.x += P.vx * dt; P.y += P.vy * dt;
      if (o.gk) { whistle(R, endSpot(P.x, P.y), 1.1); if (cur && (cur.k === 'save')) { cur.phase = 'done'; } }
      return;
    }
    if (R.mode !== 'play') return;
    const fr = P.out ? .25 : (P.air ? .9 : .45);
    P.vx *= Math.pow(fr, dt); P.vy *= Math.pow(fr, dt);
    const px = P.x; P.x += P.vx * dt; P.y += P.vy * dt;
    if (P.out) { P.outT = (P.outT || 0) + dt; if (P.outT > .7) { P.out = 0; P.outT = 0; whistle(R, nearestSpot(P.x, P.y), 1.1); if (cur && cur.k === 'stop') cur.phase = 'fo'; } return; }
    for (const ti of [0, 1]) {
      const gx = gxT(R, ti), dir = R.teams[ti].dir;
      if ((px - gx) * dir < 0 && (P.x - gx) * dir >= 0 && Math.abs(P.y - CY) < POST && P.lastT === ti && !P.air && P.beat) {
        R.flash = 1; R.mode = 'celebrate'; R.mt = 1.5; R.celT = ti; P.vx = P.vy = 0; P.x = gx + dir * 8; P.beat = false; return;
      }
      const nx0 = Math.min(gx, gx + dir * NETD), nx1 = Math.max(gx, gx + dir * NETD);
      if (P.x > nx0 - 3 && P.x < nx1 + 3 && Math.abs(P.y - CY) < POST + 3 && !((px - gx) * dir < 0)) {
        if (Math.abs(P.y - CY) > POST - 2) { P.vy *= -.5; P.y = CY + Math.sign(P.y - CY) * (POST + 4); } else { P.vx *= -.5; P.x = px; }
      } else if (Math.abs(P.y - CY) < POST + 3 && (px - gx) * dir < 0 && (P.x - gx) * dir >= 0) { P.vx *= -.4; P.x = gx - dir * 2; P.beat = false; }
    }
    const n = contain(P, 4);
    if (n) {
      if (P.air && Math.hypot(P.vx, P.vy) > 250) { P.out = 1; P.outT = 0; P.x -= n[0] * 6; P.y -= n[1] * 6; P.vx *= .55; P.vy *= .55; return; }
      // 14.7.20: упругость борта теперь разная — задний борт (за воротами, нормаль по X)
      // отражает резче, продольный «витринный» борт (нормаль по Y) глушит сильнее.
      const dot = P.vx * n[0] + P.vy * n[1], rest = Math.abs(n[0]) > Math.abs(n[1]) ? .82 : .55;
      P.vx -= 2 * dot * n[0] * rest; P.vy -= 2 * dot * n[1] * rest; P.air = 0;
    }
    if (P.air && Math.hypot(P.vx, P.vy) < 260) P.air = 0;
    if (P.air) return;
    const sp = Math.hypot(P.vx, P.vy);
    const all = []; [0, 1].forEach(ti => { all.push(...skaters(R, ti)); if (R.ice[ti].gk) all.push(R.ice[ti].gk); });
    for (const p of all) {
      const d = dist(p, P);
      if (p.gk) {
        if (d < GR + 5 && p.t !== P.lastT && !P.beat) {
          const a = Math.atan2(P.y - p.y, P.x - p.x);
          if (P.shot) p.bfly = .3; // 14.7.20: вратарь реагировал на бросок — короткая «бабочка» в отрисовке
          if (P.freeze || (P.shot && sp > 200 && Math.random() < .3)) { give(R, p); }
          else { P.vx = Math.cos(a + rnd(-.8, .8)) * rnd(120, 220); P.vy = Math.sin(a + rnd(-.8, .8)) * rnd(120, 220); P.cool = .2; P.lastT = p.t; P.touched = true; P.shot = false; }
          break;
        }
        continue;
      }
      if (d < PR + 5 && P.cool <= 0) {
        if (P.block && p === P.block) { const a = Math.atan2(P.y - p.y, P.x - p.x); P.vx = Math.cos(a) * 120; P.vy = Math.sin(a) * 120; P.cool = .2; P.touched = true; P.lastT = p.t; P.shot = false; P.block = null; R.hitFx = { x: p.x, y: p.y, t: .4, blk: true }; break; }
        if (sp > 400 && !(P.block && p === P.block)) { const a = Math.atan2(P.y - p.y, P.x - p.x); P.vx = Math.cos(a) * sp * .5; P.vy = Math.sin(a) * sp * .5; P.cool = .15; P.touched = true; P.lastT = p.t; P.shot = false; P.beat = false; break; }
        const want = cur && cur.team != null && (cur.k === 'goal' || cur.k === 'save' || cur.k === 'block') ? cur.team : (cur && cur.k === 'hit' ? 1 - cur.team : null);
        if (p === P.to || p.t === P.lastT || (want != null ? p.t === want : Math.random() < .35)) { give(R, p); break; }
        else { const a = Math.atan2(P.y - p.y, P.x - p.x); P.vx = Math.cos(a) * 90; P.vy = Math.sin(a) * 90; P.cool = .2; P.touched = true; break; }
      }
    }
  };

  /* ---------- буллиты и штрафные броски ---------- */
  proto.rkStartShootout = function (cur) {
    const R = this._rk, ti = cur.t, shooter = cur.shooter != null ? obj(R, cur.shooter) : null;
    [0, 1].forEach(t => { skaters(R, t).forEach(p => this.rkToBench(p)); this.rkGoalieSync(t); });
    R.mode = 'so'; R.battle = null; cur.phase = 'run';
    const sh = shooter || { id: 'so', num: '', t: ti, gk: false, role: 'c', x: 0, y: 0, vx: 0, vy: 0, ph: 0, st: 'ice', hold: 0 };
    sh.st = 'ice'; sh.x = CX; sh.y = CY; sh.vx = sh.vy = 0; R.ice[ti].sk = [sh]; cur.sh = sh;
    R.puck.x = CX; R.puck.y = CY; R.puck.vx = R.puck.vy = 0; R.puck.owner = sh; R.puck.beat = false; R.puck.air = 0; R.puck.out = 0; R.puck.lastT = ti;
    const g = R.ice[1 - ti].gk; if (g) { g.x = gxT(R, ti) - R.teams[ti].dir * 10; g.y = CY; }
  };
  proto.rkStepShootout = function (dt, targets) {
    const R = this._rk, cur = R.cur, P = R.puck; if (!cur || cur.k !== 'so') { R.mode = 'play'; return; }
    const ti = cur.t, dir = R.teams[ti].dir, sh = cur.sh, gx = gxT(R, ti), g = R.ice[1 - ti].gk;
    if (g) targets.set(g, [gx - dir * (6 + Math.max(0, 14 - cur.t * 6)), CY + Math.sin(R.time * 4) * 4, 60]);
    if (cur.phase === 'run') {
      targets.set(sh, [gx - dir * 60, CY + Math.sin(R.time * 3) * 18, 110]);
      const o = P.owner; if (o) { const sp = Math.hypot(o.vx, o.vy), fx = sp > 8 ? o.vx / sp : dir, fy = sp > 8 ? o.vy / sp : 0, side = Math.sin(R.time * 85) * 6; P.x = o.x + fx * 14 - fy * side; P.y = o.y + fy * 14 + fx * side; }
      if (Math.abs(sh.x - (gx - dir * 70)) < 16 || cur.t > 2.4) {
        const out = cur.outcome; let ay = out === 'goal' ? CY + (Math.random() < .5 ? -1 : 1) * rnd(4, POST - 2) : out === 'save' ? CY + rnd(-6, 6) : CY + (Math.random() < .5 ? -1 : 1) * (POST + rnd(6, 14));
        const a = Math.atan2(ay - P.y, gx - P.x); P.owner = null; P.vx = Math.cos(a) * 520; P.vy = Math.sin(a) * 520; cur.phase = 'fly'; cur.ft = 0;
      }
    } else {
      cur.ft += dt; P.vx *= Math.pow(.5, dt); P.vy *= Math.pow(.5, dt); const px = P.x; P.x += P.vx * dt; P.y += P.vy * dt;
      if (cur.outcome === 'goal' && (px - gx) * dir < 0 && (P.x - gx) * dir >= 0) { R.flash = 1; P.vx = P.vy = 0; P.x = gx + dir * 8; }
      else if (cur.outcome === 'save' && g && dist(g, P) < GR + 6) { P.vx = -P.vx * .3; P.vy = rnd(-120, 120); }
      else if ((P.x - gx) * dir > 4 && cur.outcome !== 'goal') { P.vx *= -.4; }
      contain(P, 4);
      if (cur.ft > 1.3) { cur.phase = 'done'; R.cur = null; R.mode = 'whistle'; R.mt = .6; R.fo = { x: CX, y: CY }; P.vx = P.vy = 0; P.x = CX; P.y = CY; if (!this.liveMatch.inShootout) { [0, 1].forEach(t => this.rkFillIce(t, 5, false)); } }
    }
  };

  /* ---------- отрисовка ---------- */
  proto.rkDraw = function () {
    const R = this._rk, live = this.liveMatch; if (!R || !live) return; const m = live.simulatedMatch, canvas = R.canvas; if (!canvas || !m) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== CW * dpr) { canvas.width = CW * dpr; canvas.height = CH * dpr; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg(this, m, dpr), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = R.puck;
    /* штрафбокс: таймер */
    if (R.box.length) {
      const vm = live.visibleMinute || 0; let left = 0;
      (live.penalties || []).forEach(x => { if (R.box.some(p => String(p.id) === String(x.playerId))) left = Math.max(left, (x.expiresAt || 0) - vm); });
      ctx.fillStyle = '#1d1626'; ctx.beginPath(); ctx.roundRect(BOX[0], BOX[1], BOX[2], BOX[3], 6); ctx.fill(); ctx.strokeStyle = '#e05252'; ctx.lineWidth = 1.5; ctx.stroke();
      if (left > 0) { ctx.fillStyle = '#e08585'; ctx.font = '600 9px Inter,system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText('ШТРАФ ' + Math.floor(left) + ':' + String(Math.round((left % 1) * 60)).padStart(2, '0'), BOX[0] + 24 + R.box.length * 24 - 10, BOX[1] + 20); }
    }
    const mp = m.liveManpower; if (mp && (mp.home !== mp.away || mp.goaliePulledTeamId)) { ctx.fillStyle = '#9fb3cf'; ctx.font = '600 10px Inter,system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${mp.home} на ${mp.away}` + (mp.goaliePulledTeamId ? ' · пустые ворота' : ''), RX - 4, T - 10); }
    if (R.mode === 'faceoff' || R.mode === 'whistle' || R.mode === 'drop') { ctx.strokeStyle = 'rgba(54,198,224,.6)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(R.fo.x, R.fo.y, 15, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (R.battle) { ctx.strokeStyle = 'rgba(224,82,82,.55)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(P.x, P.y, 28, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (R.fightFx) { ctx.strokeStyle = 'rgba(224,120,40,.7)'; ctx.lineWidth = 2.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(R.fightFx.x, R.fightFx.y, 30, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (R.hitFx) { R.hitFx.t -= 1 / 60; if (R.hitFx.t <= 0) R.hitFx = null; else { ctx.strokeStyle = R.hitFx.blk ? 'rgba(54,120,224,.8)' : 'rgba(232,120,40,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(R.hitFx.x, R.hitFx.y, 18 + (0.5 - R.hitFx.t) * 30, 0, 7); ctx.stroke(); } }
    /* игроки */
    const everyone = [...R.pobj.values()].filter(p => p.st === 'ice' || p.st === 'out' || p.st === 'box');
    everyone.sort((a, b) => a.y - b.y).forEach(p => {
      const k = R.teams[p.t].kit, r = p.gk ? GR : PR, sp2 = Math.hypot(p.vx, p.vy);
      // 14.7.20: легкое покачивание при беге (использует уже существующее p.ph — раньше
      // применялось только для джиттера в борьбе/вбрасывании) и короткая «бабочка» у
      // вратаря при сейве (p.bfly, угасает в rkStep).
      let dx = 0, dy = 0;
      if (!p.gk && sp2 > 40) { const a = Math.atan2(p.vy, p.vx), amp = Math.min(1.6, sp2 / 140); dx = Math.cos(a + Math.PI / 2) * Math.sin(R.time * 14 + p.ph * 3) * amp; dy = Math.sin(a + Math.PI / 2) * Math.sin(R.time * 14 + p.ph * 3) * amp; }
      const px = p.x + dx, py = p.y + dy, bfly = p.gk && p.bfly > 0 ? Math.min(1, p.bfly / .3) : 0;
      ctx.save(); ctx.shadowColor = 'rgba(10,20,35,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.beginPath();
      if (bfly > 0) ctx.ellipse(px, py, r * (1 + bfly * .55), r * (1 - bfly * .3), 0, 0, 7);
      else ctx.arc(px, py, r, 0, 7);
      ctx.fillStyle = k.f; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.lineWidth = p.gk ? 3 : 2.5; ctx.strokeStyle = k.e; ctx.stroke();
      if (p.gk) { ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(px, py, r * (1 + bfly * .55) - 3.5, r * (1 - bfly * .3) - 3.5, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = k.i; ctx.font = '800 ' + (p.num.length > 2 ? 8.5 : 10) + 'px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.num, px, py + .5);
      ctx.restore();
      // направление движения — короткая «клюшка»-чёрточка наружу от кружка
      if (sp2 > 6) { const a = Math.atan2(p.vy, p.vx); ctx.strokeStyle = k.e; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * r * .5, py + Math.sin(a) * r * .5); ctx.lineTo(px + Math.cos(a) * (r + 7), py + Math.sin(a) * (r + 7)); ctx.stroke(); }
      if (p === P.owner) { ctx.strokeStyle = 'rgba(54,198,224,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 7); ctx.stroke(); }
    });
    /* шайба */
    const sp = Math.hypot(P.vx, P.vy);
    if (R.trail && R.trail.length > 1) { for (let i = 0; i < R.trail.length - 1; i++) { const a = (i + 1) / R.trail.length; ctx.beginPath(); ctx.arc(R.trail[i].x, R.trail[i].y, 1.6 + a, 0, 7); ctx.fillStyle = 'rgba(16,21,29,' + (.08 + a * .22) + ')'; ctx.fill(); } }
    const up = P.air || P.out;
    if (up) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(P.x + 5, P.y + 7, 5, 3, 0, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(P.x, P.y - (up ? 4 : 0), up ? 5.2 : 4.2, 0, 7); ctx.fillStyle = '#10151d'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = '#cfe4f2'; ctx.stroke();
    if (R.flash > 0) { ctx.fillStyle = 'rgba(232,184,75,' + (R.flash * .28) + ')'; ctx.beginPath(); ctx.roundRect(L, T, W, H, RC); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  /* ---------- завершение матча: остановить анимацию и показать карту голов ---------- */
  const baseComplete = proto.completeLiveMatch;
  proto.completeLiveMatch = function (live) {
    const r = baseComplete.apply(this, arguments);
    try { this.rkStop(); } catch (e) { }
    return r;
  };
})();
