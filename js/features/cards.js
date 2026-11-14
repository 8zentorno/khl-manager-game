/* KHL Manager 14.0 — карточки игроков и клубов.
   Нажатие на имя игрока или название клуба (по всей лиге) открывает отдельный экран. Назад возвращает туда, откуда пришли.
   История карьеры по сезонам пока не копится (нужен переход между сезонами), карточка показывает текущий сезон. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const sgn = n => (n > 0 ? '+' : '') + n;
  const SK = [['shooting', 'Бросок', 'Бр'], ['passing', 'Пас', 'Пас'], ['skating', 'Катание', 'Кат'], ['defense', 'Оборона', 'Об'], ['stamina', 'Выносливость', 'Вын']];
  const POS = { LW: 'Левый нападающий', C: 'Центральный нападающий', RW: 'Правый нападающий', D: 'Защитник', G: 'Вратарь' };
  const CONF = { west: 'Западная конференция', east: 'Восточная конференция' };

  /* ---------- подсказки по данным ---------- */
  proto.birthText = function (p) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(p.birthDate || ''));
    return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
  };
  proto.playerById = function (id) { return this.db.players.find(p => p.id === id) || null; };
  proto.cardSkater = function (s) {
    const gp = s.gp || 0, g = s.g || 0, a = s.a || 0, sh = s.shots || 0;
    return { gp, g, a, pts: g + a, pm: s.plusMinus || 0, shots: sh, pct: sh ? (g / sh * 100).toFixed(1) + '%' : '—', pim: s.pim, toi: s.toi != null && gp ? mmss(s.toi / gp) : '—' };
  };
  proto.cardGoalie = function (s) {
    const gp = s.goalieGP || 0, sa = s.goalieShots || 0, sv = s.goalieSaves || 0, ga = s.goalieGA || 0;
    return { gp, w: s.goalieW || 0, sv: sa ? (sv / sa).toFixed(3).replace(/^0/, '') : '—', gaa: gp ? (ga / gp).toFixed(2).replace('.', ',') : '—', so: s.shutouts || 0, sa, svs: sv, ga };
  };
  proto.teamRankLine = function (p) {
    const st = this.state, list = this.teamPlayers(p.teamId);
    if (p.pos === 'G') {
      const gs = list.filter(x => x.pos === 'G').sort((a, b) => ((st.playerStats[b.id] || {}).goalieGP || 0) - ((st.playerStats[a.id] || {}).goalieGP || 0));
      return gs[0] && gs[0].id === p.id ? 'Основной вратарь клуба' : 'Запасной вратарь клуба';
    }
    const sk = list.filter(x => x.pos !== 'G').sort((a, b) => { const A = st.playerStats[a.id] || {}, B = st.playerStats[b.id] || {}; return (B.pts || 0) - (A.pts || 0) || (B.g || 0) - (A.g || 0); });
    const i = sk.findIndex(x => x.id === p.id), s = st.playerStats[p.id] || {};
    return (s.gp || 0) ? (i + 1) + '-й в клубе по очкам' : 'Ещё не набирал очков';
  };
  proto.cardContract = function (p) {
    const until = Number.isFinite(Number(p.contractUntil)) ? 'до ' + p.contractUntil : '';
    let sal = ''; try { sal = this.money(this.payrollOf ? this.payrollOf(p) : p.salary) + ' млн'; } catch (e) { }
    return [until, sal].filter(Boolean).join(', ') || '—';
  };

  /* ---------- графики ---------- */
  function radar(vals, base) {
    const n = vals.length, cx = 110, cy = 100, r = 70, pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r * v / 100, cy + Math.sin(a) * r * v / 100]; };
    let g = '';[40, 60, 80, 100].forEach(k => { g += `<polygon class="cd-rg" points="${vals.map((_, i) => pt(i, k).join(',')).join(' ')}"/>`; });
    vals.forEach((v, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 124); g += `<line class="cd-rg" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text class="cd-rl" x="${lx}" y="${ly + 3}" text-anchor="middle">${SK[i][2]} ${v}</text>`; });
    if (base) g += `<polygon class="cd-rb" points="${base.map((v, i) => pt(i, v).join(',')).join(' ')}"/>`;
    g += `<polygon class="cd-rv" points="${vals.map((v, i) => pt(i, v).join(',')).join(' ')}"/>`;
    return `<svg class="cd-radar" viewBox="0 0 220 200" role="img" aria-label="Навыки">${g}</svg>`;
  }
  function chart(series, labels) {
    const W = 520, H = 180, L = 34, R = 14, T = 12, B = 24, all = series.flatMap(s => s.v.filter(x => x != null));
    if (!all.length) return '';
    const lo = Math.floor(Math.min(...all)) - 1, hi = Math.ceil(Math.max(...all)) + 1, step = Math.max(1, Math.ceil((hi - lo) / 4)), mn = lo, mx = lo + step * 4;
    const X = i => L + (W - L - R) * (labels.length === 1 ? .5 : i / (labels.length - 1)), Y = v => T + (H - T - B) * (1 - (v - mn) / ((mx - mn) || 1));
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = mn + step * k; g += `<line class="cd-ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="cd-al" x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`; }
    labels.forEach((l, i) => { g += `<text class="cd-al" x="${X(i)}" y="${H - 7}" text-anchor="middle">${E(l)}</text>`; });
    series.forEach(s => {
      let d = ''; s.v.forEach((v, i) => { if (v != null) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
      g += `<path class="cd-ln ${s.cls}" d="${d}"/>`;
      s.v.forEach((v, i) => { if (v != null) g += `<circle class="cd-dt ${s.cls}" cx="${X(i)}" cy="${Y(v)}" r="3"><title>${E(labels[i])}: ${v}</title></circle>`; });
    });
    return `<svg class="cd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График рейтинга">${g}</svg>`;
  }
  function bars(vals, labels) {
    const W = 520, H = 120, B = 20, mx = Math.max(1, ...vals), bw = (W - 16) / Math.max(1, vals.length);
    let g = '';
    vals.forEach((v, i) => { const h = (H - B - 14) * v / mx; g += `<rect class="cd-bar" x="${8 + i * bw + 4}" y="${H - B - h}" width="${Math.max(2, bw - 8)}" height="${h}" rx="3"><title>${E(labels[i])}: ${v}</title></rect><text class="cd-al" x="${8 + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${E(labels[i])}</text><text class="cd-al" x="${8 + i * bw + bw / 2}" y="${H - B - h - 3}" text-anchor="middle">${v}</text>`; });
    return `<svg class="cd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Очки по матчам">${g}</svg>`;
  }
  proto.cdName = function (p) { return `<span class="nm" data-pl="${E(p.id)}">${E(p.name)}</span>`; };
  proto.cdTeam = function (id, text) { const t = this.teamById(id); return t ? `<span class="nm" data-cl="${E(id)}">${E(text || t.name)}</span>` : E(text || id); };


  /* ---------- контракт и травмы (14.2) ---------- */
  const CT_NOTE = { '1-way': 'Играет только в основной команде. В фарм-клубе получает полную зарплату.', '2-way': 'Играет в основной команде и в фарм-клубе. В фарм-клубе получает часть зарплаты.', '3-way': 'Играет в основной команде и в фарм-клубе. В фарм-клубе получает часть зарплаты, а игрок до 20 лет может играть в МХЛ.' };
  proto.cdContractBox = function (p) {
    const name = this.contractName ? this.contractName(p) : (p.contract || '—');
    let farm = '';
    if (p.contract && p.contract !== '1-way' && this.farmSalary && this.farmShare) {
      try { farm = `<div class="small muted">В фарме: ${E(this.money(this.farmSalary(p)))} млн (${Math.round(this.farmShare(p) * 100)}% от зарплаты), ${E(this.farmLeague ? this.farmLeague(p) : 'ВХЛ')}.</div>`; } catch (e) { }
    }
    return `<div class="cd-box"><h4>Контракт</h4><div class="cd-chips" style="margin:0 0 .4rem"><span class="cd-chip y">${E(p.contract || '—')}</span><span class="cd-chip">${E(name)}</span></div><div><b>${E(this.cardContract(p))}</b></div><div class="small muted" style="margin-top:.3rem">${E(CT_NOTE[p.contract] || '')}</div>${farm}</div>`;
  };
  proto.cdInjuryBox = function (p) {
    const list = this.playerInjuries ? this.playerInjuries(p.id) : [], SEV = { light: 'лёгкая', medium: 'средняя', severe: 'тяжёлая' };
    const pl = (n, a, b, c) => { const m = n % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };
    const miss = r => r[2] === 'severe' ? (r[3] ? `около ${r[3]} ${pl(r[3], 'дня', 'дней', 'дней')}` : 'долго') : r[2] === 'medium' ? `${r[3] || 1} ${pl(r[3] || 1, 'матч', 'матча', 'матчей')}` : 'следующий матч';
    const body = list.length ? `<div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Дата</th><th>Травма</th><th>Пропуск</th><th>Тяжесть</th></tr></thead><tbody>${list.map(r => `<tr><td>${E(this.formatDate ? this.formatDate(r[0]) : r[0])}</td><td style="white-space:normal;text-align:left">${E(r[1])}</td><td>${E(miss(r))}</td><td>${SEV[r[2]] || ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">В этом сезоне травм не было.</p>';
    return `<div class="cd-box"><h4>Травмы сезона</h4>${body}</div>`;
  };

  /* ---------- карточка игрока ---------- */
  const PTABS = [['ov', 'Обзор'], ['st', 'Статистика'], ['dv', 'Развитие'], ['cr', 'Карьера']];
  const kpi = (v, l) => `<div class="cd-kpi"><b>${v}</b><span>${l}</span></div>`;
  proto.cdKpis = function (p, s) {
    if (p.pos === 'G') { const x = this.cardGoalie(s); return `<div class="cd-kpis">${kpi(x.gp, 'Матчи')}${kpi(x.w, 'Победы')}${kpi(x.sv, '%ОТР')}${kpi(x.gaa, 'КН')}${kpi(x.ga, 'ПШ')}${kpi(x.so, 'Сухие')}</div>`; }
    const x = this.cardSkater(s);
    return `<div class="cd-kpis">${kpi(x.gp, 'Матчи')}${kpi(x.g, 'Шайбы')}${kpi(x.a, 'Передачи')}${kpi(x.pts, 'Очки')}${kpi(sgn(x.pm), '+/−')}${kpi(x.toi, 'Время')}</div>`;
  };
  /* Счёт: первое число хозяева, второе гости; цвет по результату нашей стороны. */
  proto.cdScore = function (homeScore, awayScore, win, ot, so) {
    return `<span class="${win ? 'cd-w' : 'cd-l'}">${homeScore}–${awayScore}${so ? ' (Б)' : ot ? ' (ОТ)' : ''}</span>`;
  };
  // период: 'season' (чемпионат), 'po' (плей-офф), 'all'; n — только последние n матчей (для «Обзора»)
  proto.cdMatchRows = function (p, range, n) {
    let rows = this.playerAllMatches ? this.playerAllMatches(p.id) : this.playerLastMatches(p.id, 99);
    if (range === 'po') rows = rows.filter(r => r.po); else if (range !== 'all') rows = rows.filter(r => !r.po);
    return n ? rows.slice(0, n) : rows;   // новые сверху
  };
  proto.cdMatchId = function (r) {
    const m = (this.state.matches || []).find(x => x.played && x.dateOffset === r.day && (r.home ? x.awayId === r.oppId : x.homeId === r.oppId));
    return m ? m.id : '';
  };
  proto.cdLastTable = function (p, n, range) {
    const rows = this.cdMatchRows(p, range || 'all', n), G = p.pos === 'G';
    if (!rows.length) return '<p class="muted small">Матчей в этом сезоне ещё не было.</p>';
    const head = G ? '<th>Дата</th><th>Соперник</th><th>Счёт</th><th>Брос.</th><th>Пропущ.</th><th>%ОТР</th>' : '<th>Дата</th><th>Соперник</th><th>Счёт</th><th>Ш</th><th>П</th><th>+/−</th><th>Время</th><th>Штр.</th>';
    const body = rows.map(r => {
      const sc = this.cdScore(r.home ? r.gf : r.ga, r.home ? r.ga : r.gf, r.win, r.ot, r.so);
      const opp = this.cdTeam(r.oppId);
      const date = this.cdShortDate(r.day), mid = this.cdMatchId(r), tr = mid ? ` data-cd="calmatch:${E(mid)}" title="Открыть матч"` : '';
      return G ? `<tr${tr}><td>${E(date)}</td><td>${opp}</td><td>${sc}</td><td>${r.sa}</td><td>${r.sa - r.sv}</td><td>${r.sa ? (r.sv / r.sa).toFixed(3).replace(/^0/, '') : '—'}</td></tr>`
        : `<tr${tr}><td>${E(date)}</td><td>${opp}</td><td>${sc}</td><td>${r.g}</td><td>${r.a}</td><td>${sgn(r.pm)}</td><td>${mmss(r.toi)}</td><td>${r.pim || 0}</td></tr>`;
    }).join('');
    return `<div class="cd-tw"><table class="cd-tbl mt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  };
  proto.cdShortDate = function (day) { try { const d = this.clubCalDate(day); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); } catch (e) { return String(day); } };
  // компактная лента очков по матчам, слева направо по датам
  proto.cdSpark = function (rows) {
    if (!rows.length) return '';
    const list = rows.slice().reverse(), mx = Math.max(1, ...list.map(r => r.g + r.a));
    return `<div class="cd-spark" role="img" aria-label="Очки по матчам">${list.map(r => { const v = r.g + r.a; return `<i class="${v ? '' : 'z'}${r.po ? ' po' : ''}" style="height:${v ? Math.round(8 + 30 * v / mx) : 2}px" title="${E(this.cdTeamName(r.oppId))}: ${v}"></i>`; }).join('')}</div><div class="muted tiny">Очки по матчам, слева направо по датам${rows.some(r => r.po) ? '; золотые — плей-офф' : ''}</div>`;
  };
  proto.cdTeamName = function (id) { return (this.teamById(id) || {}).name || String(id); };
  proto.cdSkills = function (p, d) {
    if (!d || !d.skills) return '';
    const sb = d.sb || d.skills;
    if (p.pos === 'G') {
      return [['goalkeeping', 'Игра в воротах'], ['defense', 'Защита'], ['stamina', 'Выносливость']].map(([k, n]) => this.cdSkillBar(n, d.skills[k], sb[k])).join('');
    }
    return `<div class="cd-center">${radar(SK.map(x => d.skills[x[0]]), SK.map(x => sb[x[0]]))}<div class="muted tiny">Пунктир: начало сезона</div></div>`;
  };
  proto.cdSkillBar = function (n, v, v0) {
    const dl = v - v0;
    return `<div class="cd-sk"><span>${n}</span><div class="cd-bar-t"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div><span><b>${v}</b> <em class="${dl > 0 ? 'cd-up' : dl < 0 ? 'cd-dn' : 'muted'}">${dl > 0 ? '▲+' + dl : dl < 0 ? '▼' + dl : '='}</em></span></div>`;
  };
  proto.cdSkillBars = function (p, d) {
    if (!d || !d.skills) return '';
    const sb = d.sb || d.skills;
    const list = p.pos === 'G' ? [['goalkeeping', 'Игра в воротах'], ['defense', 'Защита'], ['stamina', 'Выносливость']] : SK.map(x => [x[0], x[1]]);
    return list.map(([k, n]) => this.cdSkillBar(n, d.skills[k], sb[k])).join('');
  };
  proto.playerCardHtml = function (id, tab, range) {
    const p = this.playerById(id); if (!p) return '<div class="card"><p>Игрок не найден.</p></div>';
    const st = this.state, d = this.playerDev(p), s = st.playerStats[p.id] || {}, own = p.teamId === st.teamId, team = this.teamById(p.teamId);
    const G = p.pos === 'G', perm = Math.round(this.permanentOVR(p)), eff = Math.round(this.effectiveOVR(p));
    const line = G ? 0 : Number(this.playerLine(p)) || 0, injured = this.hasActiveInjury && this.hasActiveInjury(p);
    const chips = [];
    if (!G) chips.push(`<span class="cd-chip b">${line >= 1 && line <= 4 ? line + '-е звено' : 'Запас'}</span>`);
    chips.push(`<span class="cd-chip g">${E(this.teamRankLine(p))}</span>`);
    chips.push(`<span class="cd-chip">Контракт: ${E(this.cardContract(p))}</span>`);
    if (p.foreign) chips.push('<span class="cd-chip y">Легионер</span>');
    if (injured) chips.push('<span class="cd-chip r">🩹 Травма</span>');
    if (own && d && d.potential) chips.push(`<span class="cd-chip y">Потенциал ${d.potential}</span>`);
    const kit = this.kitFor ? this.kitFor(p.teamId, true) : { f: '#3a4658', i: '#fff' };
    const initials = p.name.split(/\s+/).map(x => x[0]).slice(0, 2).join('');
    const hero = `<div class="cd-hero"><div class="cd-ava" style="background:${kit.f};color:${kit.i}" aria-hidden="true">${E(initials)}</div><div class="cd-who"><h2>${E(p.name)}${this.kaBadge ? this.kaBadge(p) : ''}</h2>`
      + `<div class="cd-meta">${E(POS[p.pos] || p.pos)} · №${E(p.number || '—')} · ${E(this.birthText(p))} (${this.ageText(this.ageYears(p))}) · ${E(p.height || '—')} см, ${E(p.weight || '—')} кг · хват ${E(p.grip || '—')} · ${this.cdTeam(p.teamId)}</div>`
      + `<div class="cd-chips">${chips.join('')}</div></div><div class="cd-ovr"><b>${perm}</b><span>рейтинг</span>${eff !== perm ? `<small>сейчас ${eff}</small>` : ''}</div></div>`;
    const tabs = `<div class="cd-tabs" role="tablist">${PTABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-cd="ptab:${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'ov') {
      body = `<div class="cd-grid"><div class="cd-box"><h4>Сезон ${this.seasonLabel()}</h4>${this.cdKpis(p, s)}<h4>Последние 5 матчей</h4>${this.cdLastTable(p, 5, 'all')}</div><div class="cd-box"><h4>Навыки</h4>${this.cdSkills(p, d)}</div></div>`;
    } else if (tab === 'st') {
      const po = st.playoff && st.playoff.playerStats && st.playoff.playerStats[p.id], hasPo = po && (po.gp || po.goalieGP);
      const seg = [['season', 'Чемпионат'], ['po', 'Плей-офф'], ['all', 'Всё вместе']];
      const r = seg.some(x => x[0] === range) ? range : 'season';
      const seq = `<div class="cd-seg">${seg.map(([k, l]) => `<button type="button" class="${r === k ? 'on' : ''}" data-cd="pstat:${k}">${l}</button>`).join('')}</div>`;
      const sumS = (x, y) => { const o = {}; for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) o[k] = (x && x[k] || 0) + (y && y[k] || 0); return o; };
      const src = r === 'po' ? (po || {}) : r === 'all' ? sumS(s, po) : s;
      const full = G ? this.cardGoalie(src) : this.cardSkater(src);
      const mrows = this.cdMatchRows(p, r);
      const inner = this.cdKpis(p, src) + (G
        ? `<div class="cd-tw"><table class="cd-tbl"><tbody><tr><td>Бросков по воротам</td><td>${full.sa}</td></tr><tr><td>Отражено</td><td>${full.svs}</td></tr><tr><td>Пропущено</td><td>${full.ga}</td></tr></tbody></table></div>`
        : `<div class="cd-tw"><table class="cd-tbl"><tbody><tr><td>Броски</td><td>${full.shots}</td></tr><tr><td>Реализация</td><td>${full.pct}</td></tr><tr><td>Штрафные минуты</td><td>${full.pim == null ? '—' : full.pim}</td></tr><tr><td>Среднее время на льду</td><td>${full.toi}</td></tr></tbody></table></div>`)
        + (r === 'po' && !hasPo ? '<p class="muted small">В плей-офф этого сезона игрок ещё не играл.</p>' : '')
        + `<h4>Матчи (${mrows.length})</h4>` + this.cdLastTable(p, 0, r);
      body = `<div class="cd-box">${seq}${inner}</div><div class="cd-grid" style="margin-top:.8rem">${this.cdContractBox(p)}${this.cdInjuryBox(p)}</div>`;
    } else if (tab === 'dv') {
      const hist = this.ratingHistory(p.id), labels = hist.map(h => this.monthLabel(h[0]));
      const ch = hist.length ? chart([{ cls: 'p', v: hist.map(h => Math.round(h[1])) }, { cls: 'e', v: hist.map(h => Math.round(h[2])) }], labels) + (hist.length === 1 ? '<p class="muted small" style="margin:.3rem 0 0">Развитие появится после первых месяцев сезона.</p>' : '') : '';
      let own_block = '';
      if (own && d) {
        const goal = d.goal || {}, val = this.playerGoalValue ? this.playerGoalValue(p, d) : 0, pct = goal.target > 0 ? Math.min(100, val / goal.target * 100) : 0;
        own_block = `<div class="cd-box"><h4>Тренировка и цель</h4><div class="small">Тренировка: ${E(this.trainingLabel ? this.trainingLabel(d.training) : d.training)}${d.growth ? ` · рост за сезон +${d.growth}` : ''}</div>`
          + (goal.target ? `<div class="small muted">Цель сезона: ${val}/${goal.target}</div><div class="cd-bar-t"><i style="width:${pct}%"></i></div>` : '')
          + `<p><button type="button" class="btn btn-quiet" data-cd="dev">Настроить в разделе «Развитие»</button></p></div>`;
      }
      body = `<div class="cd-grid"><div class="cd-box"><h4>Рейтинг по месяцам</h4>${ch}<div class="muted tiny">Синий: постоянный рейтинг. Золотой пунктир: игровой, с формой и моралью, на начало месяца.</div></div><div class="cd-box"><h4>Навыки: изменения за сезон</h4>${this.cdSkillBars(p, d)}</div>${own_block}</div>`;
    } else {
      const ps = (st.playoff && st.playoff.playerStats && st.playoff.playerStats[p.id]) || {};
      const x = G ? this.cardGoalie(s) : this.cardSkater(s), y = G ? this.cardGoalie(ps) : this.cardSkater(ps);
      const cells = r => G ? `<td>${r.gp}</td><td>${r.w}</td><td>${r.sv}</td><td>${r.gaa}</td><td>${r.ga}</td><td>${r.so}</td>` : `<td>${r.gp}</td><td>${r.g}</td><td>${r.a}</td><td><b>${r.pts}</b></td><td>${sgn(r.pm)}</td>`;
      const tot = G ? (() => { const gp = x.gp + y.gp, sa = x.sa + y.sa, sv = x.svs + y.svs, ga = x.ga + y.ga; return { gp, w: x.w + y.w, sv: sa ? (sv / sa).toFixed(3).replace(/^0/, '') : '—', gaa: gp ? (ga / gp).toFixed(2).replace('.', ',') : '—', ga, so: x.so + y.so }; })()
        : { gp: x.gp + y.gp, g: x.g + y.g, a: x.a + y.a, pts: x.pts + y.pts, pm: x.pm + y.pm };
      const hasPo = y.gp > 0, lab = this.seasonLabel(), club = this.cdTeam(p.teamId);
      body = `<div class="cd-box"><h4>Карьера по сезонам</h4><div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Сезон</th><th>Клуб</th><th>Лига</th>${G ? '<th>И</th><th>В</th><th>%ОТР</th><th>КН</th><th>ПШ</th><th>СО</th>' : '<th>И</th><th>Ш</th><th>П</th><th>О</th><th>+/−</th>'}<th>Рейтинг</th></tr></thead><tbody>`
        + `<tr class="cur"><td>${lab}</td><td>${club}</td><td>КХЛ · регулярный</td>${cells(x)}<td><b>${perm}</b></td></tr>`
        + (hasPo ? `<tr class="cur"><td>${lab}</td><td>${club}</td><td>КХЛ · плей-офф</td>${cells(y)}<td></td></tr>`
          + `<tr class="cur"><td colspan="3"><b>Всего за сезон ${lab}</b></td>${cells(tot)}<td></td></tr>` : '')
        + `</tbody></table></div>`
        + `<p class="muted small">Сезоны, которые вы доиграете, будут добавляться сюда.</p></div>`;
    }
    return `<div class="cd-top"><button type="button" class="btn btn-quiet" data-cd="back">← Назад</button></div>${hero}${tabs}${body}`;
  };

  /* ---------- карточка клуба ---------- */
  proto.clubCardHtml = function (id, tab) {
    const t = this.teamById(id); if (!t) return '<div class="card"><p>Клуб не найден.</p></div>';
    const st = this.state, ss = st.standings[id] || {}, conf = String(t.conf || '').toLowerCase();
    const confRows = this.standingsFor(conf), confRank = confRows.findIndex(x => x.id === id) + 1;
    const all = this.db.teams.map(x => ({ id: x.id, ...(st.standings[x.id] || {}) })).sort((a, b) => (b.pts || 0) - (a.pts || 0) || (b.gf - b.ga) - (a.gf - a.ga));
    const divRows = this.divisionRows ? this.divisionRows(t.div) : [], divRank = divRows.findIndex(x => x.id === id) + 1;
    const arena = (this.stadiumFor && this.stadiumFor(id)) || {};
    const kit = this.kitFor(id, true);
    const hero = `<div class="cd-hero"><div class="cd-ava sq" style="background:${kit.f};color:${kit.i}" aria-hidden="true">${E(t.name.slice(0, 1))}</div><div class="cd-who"><h2>${E(t.name)}</h2>`
      + `<div class="cd-meta"><span class="cd-lk" data-cd="stand:conf:${E(conf)}">${E(CONF[conf] || '')}</span> · <span class="cd-lk" data-cd="stand:div:${E(t.div)}">Дивизион ${E(this.divisionName(t.div))}</span> · тренер ${E(t.coach || '—')}${arena.name ? ' · ' + E(arena.name) + ' (' + Number(arena.capacity || 0).toLocaleString('ru-RU') + ')' : ''}</div>`
      + `<div class="cd-chips">${id === st.teamId ? '<span class="cd-chip b">Ваш клуб</span>' : ''}</div></div><div class="cd-ovr"><b>${ss.gp ? confRank : '—'}</b><span>в конференции</span></div></div>`;
    const tabs = `<div class="cd-tabs" role="tablist">${[['ov', 'Обзор'], ['cal', 'Календарь'], ['roster', 'Состав'], ['tr', 'Трансферы'], ['fin', 'Финансы']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-cd="ctab:${k}">${l}</button>`).join('')}</div>`;
    const played = st.matches.filter(m => m.played && !m.cancelled && (m.homeId === id || m.awayId === id)).sort((a, b) => b.dateOffset - a.dateOffset);
    // статистика клуба: чемпионат / плей-офф / всё вместе (по умолчанию всё вместе, как в карточке игрока)
    const crange = (this._card && this._card.id === id && this._card.crange) || 'all';
    const sumS0 = (x, y) => { const o = {}; for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) o[k] = (x && x[k] || 0) + (y && y[k] || 0); return o; };
    const cst = pid => { const a = st.playerStats[pid] || {}, b = (st.playoff && st.playoff.playerStats && st.playoff.playerStats[pid]) || {}; return crange === 'season' ? a : crange === 'po' ? b : sumS0(a, b); };
    const cseg = `<div class="cd-seg" style="margin-bottom:.5rem">${[['season', 'Чемпионат'], ['po', 'Плей-офф'], ['all', 'Всё вместе']].map(([k, l]) => `<button type="button" class="${crange === k ? 'on' : ''}" data-cd="cstat:${k}">${l}</button>`).join('')}</div>`;
    let body;
    if (tab === 'fin') {
      body = this.clubFinanceHtml ? this.clubFinanceHtml(id) : '';
    } else if (tab === 'tr') {
      body = this.clubTransfersHtml ? this.clubTransfersHtml(id) : '';
    } else if (tab === 'cal') {
      body = this.clubCalendarHtml(id, this._card && this._card.id === id ? this._card : {});
    } else if (tab === 'roster') {
      const groups = [['F', 'Нападающие', p => ['LW', 'C', 'RW'].includes(p.pos)], ['D', 'Защитники', p => p.pos === 'D'], ['G', 'Вратари', p => p.pos === 'G']];
      const ord = { LW: 0, C: 1, RW: 2, D: 3, G: 4 }, cs = (this._card && this._card.id === id && this._card.sort) || {};
      body = cseg + groups.map(([gk, name, f]) => {
        const G = gk === 'G', srt = cs[gk] || [null, 1];
        const rows = this.teamPlayers(id).filter(f).map(p => { const s0 = cst(p.id), x = G ? this.cardGoalie(s0) : this.cardSkater(s0);
          return { p, pos: ord[p.pos], name: p.name, age: this.ageYears(p) | 0, ovr: Math.round(this.permanentOVR(p)), gp: x.gp, g: x.g || 0, a: x.a || 0, pts: x.pts || 0, w: x.w || 0, sv: parseFloat(x.sv) || 0, gaa: x.gaa === '—' ? 99 : parseFloat(String(x.gaa).replace(',', '.')), ga: x.ga || 0, x }; });
        rows.sort((A, B) => {
          if (srt[0]) { const k = srt[0], va = A[k], vb = B[k], c = typeof va === 'string' ? va.localeCompare(vb, 'ru') : va - vb; if (c) return c * srt[1]; }
          return A.pos - B.pos || B.ovr - A.ovr || A.name.localeCompare(B.name, 'ru');
        });
        const cols = G ? [['name', 'Игрок'], ['pos', 'Поз.'], ['age', 'Возр.'], ['ovr', 'Рейт.'], ['gp', 'И'], ['w', 'В'], ['sv', '%ОТР'], ['gaa', 'КН'], ['ga', 'ПШ']] : [['name', 'Игрок'], ['pos', 'Поз.'], ['age', 'Возр.'], ['ovr', 'Рейт.'], ['gp', 'И'], ['g', 'Ш'], ['a', 'П'], ['pts', 'О']];
        const head = cols.map(([k, l]) => `<th class="cd-sort${srt[0] === k ? ' on' : ''}" data-cd="csort:${gk}:${k}" role="button" tabindex="0" aria-sort="${srt[0] === k ? (srt[1] > 0 ? 'ascending' : 'descending') : 'none'}" title="Сортировать">${l}${srt[0] === k ? (srt[1] > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
        const trs = rows.map(r => { const p = r.p, x = r.x;
          return `<tr><td>${this.cdName(p)}${this.kaBadge ? this.kaBadge(p) : ''}${p.foreign ? ' <span class="cd-chip y">Лег.</span>' : ''}</td><td>${E(this.positionLabel(p.pos))}</td><td>${r.age}</td><td><b>${r.ovr}</b></td>`
            + (G ? `<td>${x.gp}</td><td>${x.w}</td><td>${x.sv}</td><td>${x.gaa}</td><td>${x.ga}</td>` : `<td>${x.gp}</td><td>${x.g}</td><td>${x.a}</td><td><b>${x.pts}</b></td>`) + '</tr>'; }).join('');
        return `<div class="cd-box"><h4>${name}</h4><div class="cd-tw"><table class="cd-tbl"><thead><tr>${head}</tr></thead><tbody>${trs}</tbody></table></div></div>`;
      }).join('');
    } else {
      const form = played.slice(0, 5).map(m => { const home = m.homeId === id, gf = home ? m.homeScore : m.awayScore, ga = home ? m.awayScore : m.homeScore, opp = home ? m.awayId : m.homeId;
        return `<div class="fr"><span>${this.cdTeam(opp)}</span><span class="nm" data-cd="calmatch:${E(m.id)}" title="Открыть матч">${this.cdScore(m.homeScore, m.awayScore, gf > ga, m.ot && !m.so, m.so)}</span></div>`; }).join('') || '<span class="muted small">Матчей ещё не было.</span>';
      const next = st.matches.filter(m => !m.played && !m.cancelled && (m.homeId === id || m.awayId === id)).sort((a, b) => a.dateOffset - b.dateOffset)[0];
      const nextHtml = next ? `${this.formatDate ? this.formatDate(next.dateOffset) : ''}: ${next.homeId === id ? 'дома с ' : 'в гостях у '}${this.cdTeam(next.homeId === id ? next.awayId : next.homeId)}` : 'Матчей больше нет.';
      const pl = this.teamPlayers(id), sk = pl.filter(p => p.pos !== 'G').sort((a, b) => { const A = cst(a.id), B = cst(b.id); return (B.pts || 0) - (A.pts || 0) || (B.g || 0) - (A.g || 0); }).slice(0, 5);
      const gk = pl.filter(p => p.pos === 'G').sort((a, b) => (cst(b.id).goalieW || 0) - (cst(a.id).goalieW || 0) || (cst(b.id).goalieGP || 0) - (cst(a.id).goalieGP || 0))[0];
      const skRows = sk.map((p, i) => { const x = this.cardSkater(cst(p.id)); return `<tr><td>${i + 1}. ${this.cdName(p)}</td><td>${x.gp}</td><td>${x.g}</td><td>${x.a}</td><td><b>${x.pts}</b></td></tr>`; }).join('');
      const gRow = gk ? (() => { const x = this.cardGoalie(cst(gk.id)); return `<div class="small" style="margin-top:.5rem">Вратарь: ${this.cdName(gk)}, ${x.w} побед, %ОТР ${x.sv}, КН ${x.gaa}, ПШ ${x.ga}</div>`; })() : '';
      body = `<div class="cd-grid"><div class="cd-box"><h4>Сезон ${this.seasonLabel()}</h4><div class="cd-kpis">${kpi(ss.gp || 0, 'Матчи')}${kpi(ss.pts || 0, 'Очки')}${kpi((ss.gf || 0) + '-' + (ss.ga || 0), 'Шайбы')}${kpi(ss.gp ? divRank : '—', 'В дивизионе')}${kpi(ss.gp ? confRank : '—', 'В конф.')}</div>`
        + `<h4>Последние 5 матчей</h4><div class="cd-last5">${form}</div><h4>Ближайший матч</h4><div class="small">${nextHtml}</div>${this.leadershipLineHtml ? `<h4>Капитан и ассистенты</h4><div class="cd-ka">${this.leadershipLineHtml(id)}</div>` : ''}</div>`
        + `<div class="cd-box"><h4>Лучшие игроки</h4>${cseg}<div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Игрок</th><th>И</th><th>Ш</th><th>П</th><th>О</th></tr></thead><tbody>${skRows}</tbody></table></div>${gRow}</div></div>`;
    }
    return `<div class="cd-top"><button type="button" class="btn btn-quiet" data-cd="back">← Назад</button></div>${hero}${tabs}${tab === 'ov' && this.clubFactsHtml ? this.clubFactsHtml(id) : ''}${body}`;
  };

  /* ---------- навигация ---------- */
  proto.openPlayerCard = function (id) { this.cardOpen({ t: 'player', id, tab: 'ov', range: 'season' }); };
  proto.openClubCard = function (id) { this.cardOpen({ t: 'club', id, tab: 'ov' }); };
  proto.cardOpen = function (entry) {
    if (!this.state) return;
    const cur = this._card;
    if (cur && document.querySelector('#view-' + cur.t + '.active')) { (this._cardStack = this._cardStack || []).push(cur); }
    else { this._cardStack = []; const act = document.querySelector('.view.active'); this._cardRoot = act ? act.id.replace(/^view-/, '') : 'dashboard'; }
    this._card = entry;
    this.cardShow();
  };
  proto.cardShow = function () {
    const c = this._card; if (!c) return;
    this.switchTab(c.t);
    this.cardRender();
    try { window.scrollTo(0, 0); } catch (e) { }
  };
  proto.cardRender = function () {
    const c = this._card; if (!c || !this.state) return;
    const host = document.getElementById('view-' + c.t); if (!host) return;
    host.innerHTML = '<div class="cd-wrap">' + (c.t === 'player' ? this.playerCardHtml(c.id, c.tab, c.range) : this.clubCardHtml(c.id, c.tab)) + '</div>';
  };
  proto.cardBack = function () {
    const prev = (this._cardStack || []).pop();
    if (prev) { this._card = prev; this.cardShow(); return; }
    this._card = null; this.switchTab(this._cardRoot || 'dashboard');
    const b = document.querySelector('.nav button[data-view="' + (this._cardRoot || 'dashboard') + '"]'); if (b) b.classList.add('active');
  };

  /* ---------- события ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-pl],[data-cl]');
    if (a && typeof app !== 'undefined' && app.state) {
      e.preventDefault(); e.stopPropagation();
      if (a.dataset.pl) app.openPlayerCard(a.dataset.pl); else app.openClubCard(a.dataset.cl);
      return;
    }
    const b = e.target.closest && e.target.closest('[data-cd]');
    if (!b || typeof app === 'undefined' || !app._card) return;
    const pr = String(b.dataset.cd).split(':'), k = pr[0], v = pr[1], c = app._card;
    if (k === 'back') app.cardBack();
    else if (k === 'ptab') { c.tab = v; app.cardRender(); }
    else if (k === 'ctab') { c.tab = v; app.cardRender(); }
    else if (k === 'fprice') { app.finSetPrice(Number(v)); app.cardRender(); }
    else if (k === 'finv') { if (v === 'arena') app.finInvestArena(); app.cardRender(); }
    else if (k === 'cmon') { c.mo = (c.mo || 0) + Number(v); c.csel = null; app.cardRender(); }
    else if (k === 'cday') { c.csel = Number(v); app.cardRender(); }
    else if (k === 'calmatch') { const mid = String(b.dataset.cd).slice(String(b.dataset.cd).indexOf(':') + 1); app.currentMatchId = mid; app.switchTab('match'); try { app.renderMatchCenter(); } catch (er) { } }
    else if (k === 'csort') {
      const key = pr[2], sm = c.sort || (c.sort = {}), cur = sm[v] || [null, 1], txt = key === 'name' || key === 'pos';
      if (cur[0] !== key) sm[v] = [key, txt ? 1 : -1];
      else if ((txt && cur[1] > 0) || (!txt && cur[1] < 0)) sm[v] = [key, -cur[1]];
      else sm[v] = [null, 1];
      app.cardRender();
    }
    else if (k === 'stand') { app.openStandings(v, pr[2]); }
    else if (k === 'pstat') { c.range = v; app.cardRender(); }
    else if (k === 'cstat') { c.crange = v; app.cardRender(); }
    else if (k === 'dev') { app.switchTab('development'); const nb = document.querySelector('.nav button[data-view="development"]'); if (nb) nb.classList.add('active'); }
  }, true);

  const baseAll = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAll.apply(this, arguments);
    try { if (this._card && document.querySelector('#view-' + this._card.t + '.active')) this.cardRender(); } catch (e) { console.warn('card render', e); }
    return r;
  };

  // Текст события с кликабельными игроками: полное имя, а если его нет в тексте, то фамилия (в передачах)
  proto.linkNames = function (text, ids) {
    let h = E(text), seen = new Set();
    const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const id of ids || []) {
      if (!id || seen.has(id)) continue; seen.add(id);
      const p = (this.db.players || []).find(x => x.id === id); if (!p) continue;
      const full = E(p.name), sur = E(String(p.name).trim().split(/\s+/).slice(-1)[0]), tag = t => `<span class="nm" data-pl="${E(p.id)}">${t}</span>`;
      if (h.includes(full)) { h = h.replace(full, tag(full)); continue; }
      const re = new RegExp('(^|[\\s№\\d(,])(' + rx(sur) + ')(?![A-Za-zА-Яа-яЁё])');
      if (re.test(h)) h = h.replace(re, (m0, a, b) => a + tag(b));
    }
    return h;
  };

  /* Названия клубов в таблицах, календаре, плей-офф, статистике и матч-центре становятся ссылками. */
  const ROOTS = ['view-standings', 'view-schedule', 'view-playoffs', 'view-stats', 'view-match', 'view-finances', 'next-match-card'];
  let NAMES = null;
  const names = () => { if (!NAMES && typeof app !== 'undefined' && app.db) { NAMES = new Map(app.db.teams.map(t => [t.name, t.id])); } return NAMES; };
  let CMAP = null;
  const cnames = () => { if (!CMAP && typeof app !== 'undefined' && app.db) CMAP = new Map(app.db.teams.filter(t => t.coach).map(t => [String(t.coach).replace(/\s*\(и\.о\.\)/, '').trim(), t.id])); return CMAP || new Map(); };
  function decorate(root) {
    const map = names(); if (!map || !root) return;
    const w = document.createTreeWalker(root, 4), hit = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const v = n.nodeValue; if (!v || v.length > 60) continue;
      const par = n.parentElement; if (!par || par.closest('[data-cl],[data-pl],[data-co],button,a,select,option,textarea,script,style,.nav,#match-log,.live-ticker')) continue;
      const core = v.trim().replace(/\s*◀$/, '');
      if (map.has(core)) hit.push([n, core, map.get(core)]);
      else if (cnames().has(core)) hit.push([n, core, cnames().get(core), 'co']);
    }
    for (const [n, core, id, kind] of hit) {
      const v = n.nodeValue, i = v.indexOf(core), span = document.createElement('span');
      span.className = 'nm'; if (kind === 'co') span.dataset.co = id; else span.dataset.cl = id; span.textContent = core;
      const frag = document.createDocumentFragment();
      if (i > 0) frag.appendChild(document.createTextNode(v.slice(0, i)));
      frag.appendChild(span);
      if (i + core.length < v.length) frag.appendChild(document.createTextNode(v.slice(i + core.length)));
      n.parentNode.replaceChild(frag, n);
    }
  }
  proto.decorateClubNames = decorate;
  function boot() {
    if (typeof MutationObserver === 'undefined') return;
    let queued = new Set(), busy = false;
    const flush = () => { busy = false; const q = queued; queued = new Set(); q.forEach(n => { if (n.isConnected) decorate(n); }); };
    const mo = new MutationObserver(recs => {
      for (const r of recs) r.addedNodes.forEach(n => { if (n.nodeType === 1 && !(n.dataset && n.dataset.cl !== undefined)) queued.add(n); });
      if (!busy && queued.size) { busy = true; (window.requestAnimationFrame || setTimeout)(flush); }
    });
    ROOTS.forEach(id => { const el = document.getElementById(id); if (el) mo.observe(el, { childList: true, subtree: true }); });
  }
  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
