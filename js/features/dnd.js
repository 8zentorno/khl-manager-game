/* KHL Manager 9.13.0 — перетаскивание игроков: схема льда («Состав»), вид «Список» и спецбригады.
   Мышь: потянуть. Телефон: удержать ~0,25 с и вести пальцем (обычная прокрутка и нажатие работают как раньше).
   Состав меняется один раз, при отпускании; сразу показывается подсказка с кнопкой «Отменить». */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  const HOLD_MS = 250, MOVE_PX = 6, TOUCH_SLOP = 9, EDGE = 70, SCROLL_STEP = 14;
  const getApp = () => (typeof app !== 'undefined' ? app : null);
  const typeOf = id => String(id || '')[0];
  const fits = (slotId, pos) => typeOf(slotId) === 'F' ? ['LW', 'C', 'RW'].includes(pos) : typeOf(slotId) === 'D' ? pos === 'D' : pos === 'G';
  let pending = null, drag = null, raf = 0, toastTimer = 0;

  /* ---------- источники и цели ---------- */
  function sourceAt(el) {
    const a = getApp(); if (!a || !a.state || !el || !el.closest) return null;
    let n;
    if ((n = el.closest('.sch-lines .sch-chip[data-slot]')) && !n.classList.contains('empty')) {
      const from = n.dataset.slot, pid = (a.state.slotAssignments || {})[from];
      return pid ? { ctx: 'lines', el: n, pid, from } : null;
    }
    if ((n = el.closest('.sch-lines [data-dnd-pid]'))) return { ctx: 'lines', el: n, pid: n.dataset.dndPid, from: '' };
    if ((n = el.closest('.line-slot .slot-player[data-player-id]'))) return { ctx: 'lines', el: n, pid: n.dataset.playerId, from: n.closest('.line-slot').dataset.slot };
    if ((n = el.closest('.bench-player[data-player-id]'))) return { ctx: 'lines', el: n, pid: n.dataset.playerId, from: '' };
    if ((n = el.closest('.sch-chip[data-sp-unit]')) && !n.classList.contains('empty')) {
      const unit = n.dataset.spUnit, slot = n.dataset.spSlot;
      let pid = ''; try { pid = (a.ensureSpecialTeamsDraft76()[unit] || {})[slot] || ''; } catch (e) {}
      return pid ? { ctx: 'sp', el: n, pid, from: { unit, slot } } : null;
    }
    return null;
  }
  function targetAt(el, ctx) {
    if (!el || !el.closest) return null;
    if (ctx === 'lines') {
      const n = el.closest('.sch-lines .sch-chip[data-slot], .line-slot[data-slot]');
      if (n) return { el: n, slot: n.dataset.slot };
      const b = el.closest('[data-dnd-bench]');
      return b ? { el: b, bench: true } : null;
    }
    const n = el.closest('.sch-chip[data-sp-unit]');
    return n ? { el: n, unit: n.dataset.spUnit, slot: n.dataset.spSlot } : null;
  }
  function allTargets(ctx) {
    return ctx === 'lines' ? [...document.querySelectorAll('.sch-lines .sch-chip[data-slot], .line-slot[data-slot]')]
      : [...document.querySelectorAll('.sch-chip[data-sp-unit]')];
  }
  const playerOf = pid => { const a = getApp(); return a ? a.db.players.find(p => String(p.id) === String(pid)) : null; };
  function compatible(src, el) {
    const p = playerOf(src.pid); if (!p) return false;
    const slot = src.ctx === 'lines' ? el.dataset.slot : el.dataset.spSlot;
    if (!slot) return false;
    return src.ctx === 'lines' ? fits(slot, p.pos) : typeOf(slot) === typeOf(src.from.slot);
  }

  /* ---------- жест ---------- */
  function startDrag(x, y, touch) {
    const src = pending.src; clearPending();
    const a = getApp(), p = playerOf(src.pid);
    if (src.ctx === 'lines' && !src.from && p && a.hasActiveInjury && a.hasActiveInjury(p)) { toast('Травмированного игрока нельзя поставить в состав.'); return; }
    const r = src.el.getBoundingClientRect(), ghost = src.el.cloneNode(true);
    ghost.removeAttribute('onclick'); ghost.classList.add('dnd-ghost'); ghost.style.width = r.width + 'px';
    ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; ghost.style.right = 'auto'; ghost.style.bottom = 'auto';
    document.body.appendChild(ghost); document.body.classList.add('dnd-active'); src.el.classList.add('dnd-src');
    drag = { src, ghost, x, y, touch, over: null };
    for (const t of allTargets(src.ctx)) { if (t === src.el) continue; t.classList.add(compatible(src, t) ? 'dnd-ok' : 'dnd-no'); }
    if (touch && navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    loop();
  }
  function move(x, y) {
    if (!drag) return;
    drag.x = x; drag.y = y; drag.ghost.style.left = x + 'px'; drag.ghost.style.top = y + 'px';
    const el = document.elementFromPoint(x, y), t = targetAt(el, drag.src.ctx);
    if (drag.over && (!t || drag.over !== t.el)) drag.over.classList.remove('dnd-over', 'dnd-bench-hot');
    drag.over = t ? t.el : null;
    if (t) t.el.classList.add(t.bench ? 'dnd-bench-hot' : 'dnd-over');
  }
  function loop() {
    if (!drag) return;
    const y = drag.y; if (y < EDGE) window.scrollBy(0, -SCROLL_STEP); else if (y > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
    raf = requestAnimationFrame(loop);
  }
  function cleanup() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (drag) {
      drag.ghost.remove(); drag.src.el.classList.remove('dnd-src');
      document.querySelectorAll('.dnd-ok,.dnd-no,.dnd-over,.dnd-bench-hot').forEach(n => n.classList.remove('dnd-ok', 'dnd-no', 'dnd-over', 'dnd-bench-hot'));
    }
    document.body.classList.remove('dnd-active'); drag = null;
  }
  function clearPending() { if (pending) { clearTimeout(pending.timer); pending = null; } }
  function swallowClick() {
    const h = e => { if (e.target && e.target.closest && e.target.closest('#dnd-toast')) return; e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', h, true); setTimeout(() => window.removeEventListener('click', h, true), 400);
  }
  function drop(x, y) {
    if (!drag) return;
    const src = drag.src, el = document.elementFromPoint(x, y), t = targetAt(el, src.ctx);
    cleanup(); swallowClick();
    if (!t) return;
    try { (src.ctx === 'lines' ? dropLines : dropSpecial)(src, t); } catch (e) { console.error('dnd', e); }
  }
  function cancel() { cleanup(); clearPending(); }

  /* ---------- применение ---------- */
  function dropLines(src, t) {
    const a = getApp(), st = a.state, snap = JSON.stringify(st.slotAssignments || {}), me = playerOf(src.pid);
    const name = p => p ? a.surname ? a.surname(p) : p.name : '';
    const undo = () => { st.slotAssignments = JSON.parse(snap); a.syncLineAssignmentsFromSlots(); a.renderRoster(); a.persistQuietly(); };
    if (t.bench) {
      if (!src.from) return;
      st.slotAssignments[src.from] = ''; a.syncLineAssignmentsFromSlots(); a.renderRoster(); a.persistQuietly();
      toast(`${name(me)} убран из состава`, undo); return;
    }
    if (t.slot === src.from) return;
    if (!fits(t.slot, me.pos)) { toast(`На это место нельзя поставить: ${a.positionLabel ? a.positionLabel(me.pos) : me.pos}`); return; }
    const old = playerOf((st.slotAssignments || {})[t.slot]);
    a.assignSlot(t.slot, src.pid);
    if ((st.slotAssignments || {})[t.slot] !== src.pid) return; // отказ внутри assignSlot
    toast(old ? (src.from ? `${name(me)} ⇄ ${name(old)}` : `${name(me)} заменил ${name(old)}`) : `${name(me)} → ${a.schemeLineSlotName ? a.schemeLineSlotName(t.slot) : t.slot}`, undo);
  }
  function dropSpecial(src, t) {
    const a = getApp(), draft = a.ensureSpecialTeamsDraft76();
    const f = src.from; if (f.unit === t.unit && f.slot === t.slot) return;
    if (typeOf(f.slot) !== typeOf(t.slot)) { toast('Нападающего нельзя поставить на место защитника и наоборот.'); return; }
    const A = draft[f.unit][f.slot] || '', B = (draft[t.unit] || {})[t.slot] || '', pb = playerOf(B);
    if (pb && a.isPlayerUnavailable(pb)) { toast('Травмированного игрока нельзя поставить в бригаду.'); return; }
    const apply = (ua, sa, va, ub, sb, vb) => { draft[ua][sa] = va; draft[ub][sb] = vb; a._specialTeamsRecommendation76 = ''; a.renderSpecialTeams(); };
    apply(f.unit, f.slot, B, t.unit, t.slot, A);
    const nm = p => p ? (a.surname ? a.surname(p) : p.name) : '';
    toast(pb ? `${nm(playerOf(A))} ⇄ ${nm(pb)}` : `${nm(playerOf(A))} перемещён`, () => apply(f.unit, f.slot, A, t.unit, t.slot, B));
  }

  /* ---------- подсказка с отменой ---------- */
  function toast(text, undo) {
    let el = document.getElementById('dnd-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dnd-toast'; el.className = 'dnd-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = ''; const s = document.createElement('span'); s.textContent = text; el.appendChild(s);
    if (undo) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Отменить'; b.onclick = () => { try { undo(); } catch (e) { console.error('dnd undo', e); } el.classList.remove('on'); }; el.appendChild(b); }
    el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 6000);
  }

  /* ---------- мышь ---------- */
  document.addEventListener('mousedown', e => {
    if (e.button !== 0 || drag) return;
    const src = sourceAt(e.target); if (!src) return;
    e.preventDefault(); // без текстового выделения и без встроенного HTML5-переноса
    pending = { src, x: e.clientX, y: e.clientY, touch: false };
  });
  document.addEventListener('mousemove', e => {
    if (drag && !drag.touch) { move(e.clientX, e.clientY); return; }
    if (pending && !pending.touch && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > MOVE_PX) startDrag(e.clientX, e.clientY, false);
  });
  document.addEventListener('mouseup', e => { if (drag && !drag.touch) drop(e.clientX, e.clientY); else if (pending && !pending.touch) clearPending(); });

  /* ---------- палец ---------- */
  document.addEventListener('touchstart', e => {
    if (drag || e.touches.length !== 1) { cancel(); return; }
    const src = sourceAt(e.target); if (!src) return;
    const t = e.touches[0];
    pending = { src, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, touch: true, timer: setTimeout(() => { if (pending) startDrag(pending.x, pending.y, true); }, HOLD_MS) };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const t = e.touches[0]; if (!t) return;
    if (drag && drag.touch) { if (e.cancelable) e.preventDefault(); move(t.clientX, t.clientY); return; }
    if (pending && pending.touch) {
      pending.x = t.clientX; pending.y = t.clientY;
      if (Math.hypot(t.clientX - pending.sx, t.clientY - pending.sy) > TOUCH_SLOP) clearPending();
    }
  }, { passive: false });
  document.addEventListener('touchend', e => {
    if (drag && drag.touch) { const t = e.changedTouches[0]; if (e.cancelable) e.preventDefault(); drop(t ? t.clientX : drag.x, t ? t.clientY : drag.y); } else clearPending();
  }, { passive: false });
  document.addEventListener('touchcancel', cancel, { passive: true });
  document.addEventListener('contextmenu', e => { if (pending || drag) e.preventDefault(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) cancel(); });
  if (typeof window !== 'undefined') window.__dnd = { sourceAt, targetAt, fits };
})();
