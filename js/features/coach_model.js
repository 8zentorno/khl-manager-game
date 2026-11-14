/* KHL Manager 14.5 — тренеры: навыки, влияние на матчи, карточка тренера; плоские аватарки игроков и тренеров.
 * Навыки считаются из имени тренера (без случайности, без расхода RNG движка), сила эффекта «средняя».
 * Навыки «звенья», «запас», «игра по ходу матча» пока только показываются: заработают с обновлением тактик.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------- навыки ---------- */
  const SKILLS = [
    ['tactics', 'Тактика', 'Качество схем и расстановки: атака и защита команды, сила выбранного стиля', 1],
    ['motivation', 'Мотивация', 'Мораль игроков: держится в серии поражений, растёт после побед', 1],
    ['development', 'Развитие игроков', 'Рост потенциала молодых (до 25 лет)', 1],
    ['lines', 'Работа со звеньями', 'Скорость притирки звеньев: химия растёт быстрее', 1],
    ['bench', 'Работа с запасом', 'Усталость от стиля игры и качество замен', 1],
    ['discipline', 'Дисциплина', 'Меньше или больше удалений у команды', 1],
    ['special', 'Спецбригады', 'Сила большинства и меньшинства', 1],
    ['ingame', 'Игра по ходу матча', 'Скорость смены стиля, реакция на счёт, снятие вратаря', 1]
  ];
  const PARAMS = { atk: 1.2, def: 1.9, disc: .10, sp: .05, mor: .05, dev: .01, guilty: .04 }; // «средняя» сила: ~±4% к голам
  proto.COACH_SKILLS = SKILLS; proto.COACH_PARAMS = PARAMS;

  const cache = new Map();
  proto.coachOf = function (teamId) {
    const t = this.teamById ? this.teamById(teamId) : null; if (!t || !t.coach) return null;
    const key = teamId + '|' + t.coach; let c = cache.get(key); if (c) return c;
    const interim = /\(и\.о\.\)/.test(t.coach), name = t.coach.replace(/\s*\(и\.о\.\)/, '').trim(), sk = {};
    SKILLS.forEach(([k]) => {
      const u = (hash(name + '#a' + k) % 1000 + hash(name + '#b' + k) % 1000) / 2000;
      sk[k] = clamp(Math.round(40 + 55 * u - (interim && (k === 'tactics' || k === 'ingame') ? 4 : 0)), 40, 95);
    });
    const ovr = Math.round(SKILLS.reduce((a, s) => a + sk[s[0]], 0) / SKILLS.length);
    const top = SKILLS.slice().sort((a, b) => sk[b[0]] - sk[a[0]])[0][0];
    const STYLE = { tactics: 'тактик', motivation: 'мотиватор', development: 'воспитатель молодёжи', lines: 'мастер звеньев', bench: 'мастер ротации', discipline: 'дисциплинатор', special: 'мастер спецбригад', ingame: 'импровизатор' };
    c = { id: 'co_' + teamId, teamId, name, interim, skills: sk, ovr, style: STYLE[top] || '', age: 42 + hash(name + '#age') % 26 };
    const fix = (typeof KHL_COACH_DATA !== 'undefined') && KHL_COACH_DATA[teamId];   // 14.7.7: навыки заданы вручную
    if (fix && fix.name === name) {
      SKILLS.forEach(([k], i) => { sk[k] = fix.sk[i]; });
      c.ovr = fix.ovr; c.age = fix.age;
      const top2 = SKILLS.slice().sort((x, y) => sk[y[0]] - sk[x[0]])[0][0]; c.style = STYLE[top2] || '';
    }
    cache.set(key, c); return c;
  };
  const eff = (c, k) => clamp(((c && c.skills[k]) - 67) / 28, -1, 1) || 0;
  proto.coachEffect = function (teamId, k) { return eff(this.coachOf(teamId), k); };
  proto.coachPenMul = function (teamId) { return 1 - PARAMS.disc * this.coachEffect(teamId, 'discipline'); };
  proto.coachGuiltyShift = function (homeId, awayId) { return (this.coachEffect(awayId, 'discipline') - this.coachEffect(homeId, 'discipline')) * PARAMS.guilty; };
  proto.coachStrengthDelta = function (teamId) { const e = this.coachEffect(teamId, 'tactics'); return { attack: PARAMS.atk * e, defense: PARAMS.def * e }; };

  /* сила команды: тренер добавляет к атаке и защите (общий рейтинг «overall» не трогаем) */
  const baseStr = proto.getStrength;
  proto.getStrength = function (teamId) {
    const s = baseStr.apply(this, arguments);
    if (!s || !s.attack) return s;
    const d = this.coachStrengthDelta(teamId); if (!d.attack && !d.defense) return s;
    return Object.assign({}, s, { attack: s.attack + d.attack, defense: s.defense + d.defense, coachAtk: d.attack, coachDef: d.defense });
  };
  /* большинство и меньшинство */
  const baseSp = proto.specialPowerFactors;
  if (baseSp) proto.specialPowerFactors = function (teamId, ppP, oppId, pkP) {
    const fx = baseSp.apply(this, arguments); if (!fx) return fx;
    const m = clamp(1 + PARAMS.sp * (this.coachEffect(teamId, 'special') - this.coachEffect(oppId, 'special')), .9, 1.1);
    return Object.assign({}, fx, { p: fx.p * m });
  };
  /* мораль и рост молодых после каждого матча */
  const baseAMD = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function (match) {
    baseAMD.apply(this, arguments);
    if (!this.state || !match || !match.played || match.coachDevApplied) return;
    match.coachDevApplied = true;
    for (const tid of [match.homeId, match.awayId]) {
      const em = this.coachEffect(tid, 'motivation'), ed = this.coachEffect(tid, 'development');
      for (const p of this.teamPlayers(tid)) {
        const d = this.playerDev(p); if (!d) continue;
        if (em && typeof d.morale === 'number') d.morale = clamp(d.morale + PARAMS.mor * em, 0, 100);
        if (ed && typeof d.potXP === 'number' && this.playerAge(p) < 25 && (d.gamesPlayed || 0) > 0) d.potXP += PARAMS.dev * ed;
      }
    }
  };

  /* ---------- аватарки ---------- */
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return .299 * c[0] + .587 * c[1] + .114 * c[2]; };
  const ink = f => lum(f) > 150 ? '#16202f' : '#ffffff';
  const shade = (hex, d) => '#' + [1, 3, 5].map(i => clamp(parseInt(hex.slice(i, i + 2), 16) + d, 0, 255).toString(16).padStart(2, '0')).join('');
  const SKIN = ['#f6dcc3', '#f1cfae', '#ecc29c', '#e3b48b'], HAIR = ['#1c1a18', '#3a2a1f', '#5b3b22', '#8a5a2b', '#c49a52'];
  const BG = ['#cfe3f5', '#f5dcc8', '#d9ecd6', '#ecdcf2', '#f4eec4', '#d6e0ea'];
  const SPECIAL_SKIN = { p_shd_26: '#7a4b2e' }; // Дживани Смит
  const pick = (h, a, s) => a[(h >>> s) % a.length];
  function beardSvg(level, hc) {
    const B = `fill="${hc}"`;
    switch (level) {
      case 1: return `<path ${B} opacity=".28" d="M21 34C21 46 43 46 43 34C43 40 39 43 32 43C25 43 21 40 21 34Z"/>`;
      case 2: return `<path ${B} d="M22 36C23 43 28 43.5 32 43.5C36 43.5 41 43 42 36C40 40 37 41 32 41C27 41 24 40 22 36Z"/>`;
      case 3: return `<path ${B} d="M21 33C21 47 43 47 43 33C43 38 39 41 32 41C25 41 21 38 21 33Z"/><path ${B} d="M27 37.5q5-2.5 10 0q-5-1-10 0Z"/>`;
      case 4: return `<path ${B} d="M20.5 32C19.5 50 44.5 50 43.5 32C43.5 38 39 40.5 32 40.5C25 40.5 20.5 38 20.5 32Z"/><path ${B} d="M26 37q6-3.5 12 0q-6-1.5-12 0Z"/>`;
      case 5: return `<path ${B} d="M20 31C17 52 47 52 44 31C44 38 39 40 32 40C25 40 20 38 20 31Z"/><path ${B} d="M23 44C24 56 40 56 41 44Z"/><path ${B} d="M25 36.5q7-4 14 0q-7-2-14 0Z"/>`;
      default: return '';
    }
  }
  function faceSvg(h, age, goalie, kit, skin, id) {
    let hc = pick(h, HAIR, 7); if (age >= 36) hc = '#b9bcc2'; else if (age >= 32 && h % 3 === 0) hc = '#8c8f96';
    const roll = (h >>> 11) % 100; // борода: от большой до малой
    let beard = 0; if (age >= 20) beard = roll < 40 ? 0 : roll < 56 ? 1 : roll < 72 ? 2 : roll < 84 ? 3 : roll < 94 ? 4 : 5;
    const plast = (h >>> 15) % 7 === 0, sd = shade(skin, -16);
    let s = `<rect x="27" y="39" width="10" height="10" fill="${sd}"/><circle cx="20.5" cy="31" r="2.8" fill="${skin}"/><circle cx="43.5" cy="31" r="2.8" fill="${skin}"/><ellipse cx="32" cy="30" rx="11.5" ry="13.5" fill="${skin}"/>`;
    s += `<path fill="${hc}" opacity=".9" d="M20.5 30C19.5 26 21 24 22.5 24C21.5 27 21.5 28 22 30ZM43.5 30C44.5 26 43 24 41.5 24C42.5 27 42.5 28 42 30Z"/>`;
    s += `<path fill="${kit.f}" d="M19.5 29C18 12 46 12 44.5 29L41 26C37 22 27 22 23 26Z"/><path fill="${kit.e}" d="M30 12.6h4v8h-4Z"/><path fill="${kit.f}" d="M18 28h5v8h-3.5ZM46 28h-5v8h3.5Z"/>`;
    s += beardSvg(beard, hc);
    if (goalie) return s + `<path fill="#f4f6fa" d="M19.5 30C19 13 45 13 44.5 30C44.5 40 40 46 32 46C24 46 19.5 40 19.5 30Z"/><rect x="22" y="29" width="20" height="4" rx="2" fill="#16202f"/><path d="M32 17V27" stroke="${kit.f}" stroke-width="3.5"/><path d="M26 37H38M26 41H38" stroke="#aab2c0" stroke-width="1.3"/>`;
    s += `<path d="M24.5 27.5h5M34.5 27.5h5" stroke="${shade(hc, -10)}" stroke-width="1.6" stroke-linecap="round"/><circle cx="27" cy="31.5" r="1.5" fill="#222"/><circle cx="37" cy="31.5" r="1.5" fill="#222"/><path d="M28.5 38q3.5 2.2 7 0" stroke="${beard >= 3 ? '#f4e3d8' : '#8a4a3a'}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    if (plast) s += `<rect x="36" y="34" width="6" height="2.6" rx="1" fill="#f1d7b6" transform="rotate(-25 39 35)"/>`;
    return s;
  }
  proto.playerAvatarSvg = function (p) {
    const h = hash(p.id || p.name), kit = this.kitFor ? this.kitFor(p.teamId, true) : { f: '#3a4658', e: '#ffffff' };
    const f = kit.f || '#3a4658', e = kit.e || kit.t || '#ffffff', skin = SPECIAL_SKIN[p.id] || pick(h, SKIN, 3);
    const age = this.ageYears ? this.ageYears(p) : 27, bg = lum(f) > 170 ? '#3a4a63' : pick(h, BG, 5), uid = 'pa' + String(p.id).replace(/\W/g, '');
    return `<svg viewBox="0 0 64 64" role="img" aria-label="${E(p.name)}"><defs><clipPath id="${uid}"><circle cx="32" cy="32" r="31"/></clipPath></defs><g clip-path="url(#${uid})"><rect width="64" height="64" fill="${bg}"/><path d="M5 66C5 52 17 46 32 46S59 52 59 66Z" fill="${f}"/><path d="M24 46L32 55L40 46" fill="none" stroke="${e}" stroke-width="3.5"/>${faceSvg(h, age, p.pos === 'G', { f, e }, skin, p.id)}</g></svg>`;
  };
  proto.coachAvatarSvg = function (c) {
    const kit = this.kitFor ? this.kitFor(c.teamId, true) : { f: '#3a4658', e: '#fff' }, f = kit.f || '#3a4658', e = kit.e || '#fff', i = ink(f);
    return `<svg viewBox="0 0 64 64" role="img" aria-label="${E(c.name)}"><circle cx="32" cy="32" r="30" fill="${f}" stroke="${e}" stroke-width="2.5"/><circle cx="32" cy="22" r="9" fill="${i}" opacity=".92"/><path d="M13 52c2-13 10-17 19-17s17 4 19 17z" fill="${i}" opacity=".92"/><rect x="38" y="38" width="14" height="18" rx="2" fill="#f4f6fa" stroke="#16202f" stroke-width="1.2" transform="rotate(12 45 47)"/><path d="M41 43h8M41 47h8M41 51h5" stroke="#16202f" stroke-width="1.1" transform="rotate(12 45 47)"/>${c.interim ? '<rect x="2" y="2" width="26" height="12" rx="6" fill="#f2c315"/><text x="15" y="11" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="9" fill="#16202f">и.о.</text>' : ''}</svg>`;
  };
  proto.coachLink = function (teamId, text) {
    const c = this.coachOf(teamId); if (!c) return E(text || '—');
    return `<span class="nm" data-co="${E(teamId)}">${E(text || c.name)}</span>`;
  };

  /* ---------- карточка тренера ---------- */
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const fx = v => (v >= 0 ? '+' : '−') + f1(Math.abs(v));
  proto.coachSeasonStats = function (teamId) {
    const ss = (this.state.standings || {})[teamId] || {}, gp = ss.gp || 0;
    const sp = this.specialLeagueTable ? (this.specialLeagueTable()[teamId] || {}) : {};
    const losses = (ss.l || 0), otl = (ss.otl || 0) + (ss.sol || 0);
    return { gp, regw: ss.regw || 0, otw: ss.otw || 0, sow: ss.sow || 0, l: losses, otl, pts: ss.pts || 0, gf: ss.gf || 0, ga: ss.ga || 0,
      ptsPct: gp ? Math.round((ss.pts || 0) / (3 * gp) * 100) : null, pp: sp.ppOpp ? Math.round(sp.ppG / sp.ppOpp * 100) : null, pk: sp.pkOpp ? Math.round((sp.pkOpp - sp.pkGA) / sp.pkOpp * 100) : null };
  };
  proto.coachCardHtml = function (teamId) {
    const c = this.coachOf(teamId), t = this.teamById(teamId); if (!c || !t) return '<div class="card"><p>Тренер не найден.</p></div>';
    const s = this.coachSeasonStats(teamId), cf = this.clubFacts ? this.clubFacts(teamId) : { cups: [], finals: [] };
    const chips = [`<span class="cd-chip b">Рейтинг тренера ${c.ovr}</span>`, `<span class="cd-chip">${E(c.style)}</span>`];
    if (c.interim) chips.push('<span class="cd-chip y">Исполняющий обязанности</span>');
    if (teamId === this.state.teamId) chips.push('<span class="cd-chip g">Ваш тренер</span>');
    const hero = `<div class="cd-hero"><div class="cd-ava pic" aria-hidden="true">${this.coachAvatarSvg(c)}</div><div class="cd-who"><h2>${E(c.name)}</h2><div class="cd-meta">Главный тренер · ${this.cdTeam(teamId)} · ${c.age} лет</div><div class="cd-chips">${chips.join('')}</div></div><div class="cd-ovr"><b>${c.ovr}</b><span>рейтинг</span></div></div>`;
    const skills = SKILLS.map(([k, l, d, on]) => `<div class="co-sk${on ? '' : ' off'}"><span class="co-n" title="${E(d)}">${E(l)}</span><span class="co-bar"><i style="width:${c.skills[k]}%"></i></span><b>${c.skills[k]}</b></div>`).join('');
    const dl = this.coachStrengthDelta(teamId), pm = this.coachEffect(teamId, 'discipline'), sm = this.coachEffect(teamId, 'special');
    const effects = `<ul class="co-ul"><li>Тактика ${c.skills.tactics}: к атаке команды ${fx(dl.attack)}, к защите ${fx(dl.defense)} пункта в матчах.</li>`
      + `<li>Мотивация ${c.skills.motivation}: ${this.coachEffect(teamId, 'motivation') >= 0 ? 'мораль игроков растёт быстрее' : 'мораль игроков растёт медленнее'}.</li>`
      + `<li>Развитие ${c.skills.development}: ${this.coachEffect(teamId, 'development') >= 0 ? 'потенциал молодых растёт охотнее' : 'молодые развиваются медленнее'}.</li>`
      + `<li>Дисциплина ${c.skills.discipline}: ${Math.abs(pm) < .05 ? 'штрафов столько же, сколько у среднего тренера' : (pm >= 0 ? 'штрафов меньше' : 'штрафов больше') + ' примерно на ' + Math.round(Math.abs(pm) * PARAMS.disc * 100) + '%'}.</li>`
      + `<li>Спецбригады ${c.skills.special}: ${Math.abs(sm) < .05 ? 'шанс гола в большинстве на среднем уровне' : 'шанс гола в большинстве ' + (sm >= 0 ? 'выше' : 'ниже') + ' примерно на ' + f1(Math.abs(sm) * PARAMS.sp * 100) + '%'}.</li></ul>`
      + `<p class="co-note">Тактика усиливает плюсы выбранного стиля. Звенья ускоряют химию, запас снижает усталость, «В игре» ускоряет смену стиля и определяет решения тренера по ходу матча.</p>`;
    const kp = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
    const season = `<div class="co-kp">${kp(s.gp, 'матчей')}${kp(s.regw, 'побед в осн. время')}${kp(s.otw, 'побед в ОТ')}${kp(s.sow, 'побед по буллитам')}${kp(s.l, 'поражений')}${kp(s.otl, 'поражений в ОТ/буллиты')}${kp(s.pts, 'очков')}${kp(s.ptsPct == null ? '—' : s.ptsPct + '%', 'процент очков')}${kp(s.gf + '–' + s.ga, 'шайбы')}${kp(s.pp == null ? '—' : s.pp + '%', 'большинство')}${kp(s.pk == null ? '—' : s.pk + '%', 'меньшинство')}</div>`;
    const career = `<div class="co-kp">${kp(1, 'сезон в клубе')}${kp(1, 'сезон в КХЛ')}${kp(s.gp, 'матчей')}${kp(s.ptsPct == null ? '—' : s.ptsPct + '%', 'процент очков')}${kp('2026/27', 'лучший сезон')}${kp('2026/27', 'худший сезон')}</div><p class="co-note">Пока в игре один сезон, поэтому карьера показывает текущий. После смены сезона данные начнут копиться.</p>`;
    return `<div class="cd-top"><button type="button" class="btn btn-quiet" data-cd="back">← Назад</button></div>${hero}`
      + `<div class="cd-grid2"><div class="cd-box"><h4>Навыки</h4>${skills}</div><div class="cd-box"><h4>Что даёт команде</h4>${effects}</div></div>`
      + `<div class="cd-box"><h4>Сезон ${this.seasonLabel()}, регулярный чемпионат</h4>${season}</div><div class="cd-box"><h4>Карьера</h4>${career}</div>`;
  };
  proto.openCoachCard = function (teamId) { this.cardOpen({ t: 'coach', id: teamId, tab: 'ov' }); };
  const baseRender = proto.cardRender;
  proto.cardRender = function () {
    const c = this._card;
    if (!c || c.t !== 'coach' || !this.state) return baseRender.apply(this, arguments);
    const host = document.getElementById('view-coach'); if (host) host.innerHTML = '<div class="cd-wrap">' + this.coachCardHtml(c.id) + '</div>';
  };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-co]');
    if (!a || typeof app === 'undefined' || !app.state) return;
    e.preventDefault(); e.stopPropagation(); app.openCoachCard(a.dataset.co);
  }, true);

  /* аватарка игрока в карточке и ссылка на тренера в карточке клуба */
  const basePlayer = proto.playerCardHtml;
  proto.playerCardHtml = function (id) {
    const html = basePlayer.apply(this, arguments), p = this.playerById(id); if (!p) return html;
    return html.replace(/<div class="cd-ava"[^>]*aria-hidden="true">[^<]*<\/div>/, `<div class="cd-ava pic" aria-hidden="true">${this.playerAvatarSvg(p)}</div>`);
  };
  const baseClub = proto.clubCardHtml;
  proto.clubCardHtml = function (id) {
    let html = baseClub.apply(this, arguments); const c = this.coachOf(id); if (!c) return html;
    const full = (this.teamById(id).coach || '');
    return html.replace('тренер ' + E(full), 'тренер ' + this.coachLink(id, full));
  };
})();
