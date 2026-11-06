/* KHL Manager 7.32 — age model, contract expiry and season review.
 *
 * Scope: ONE season (2026/27). Nothing here rolls the league over to a next season.
 *  - Age-dependent development: young players grow, 25-28 is the peak, decline starts after ~29.
 *  - Contracts: every player has `contractUntil` (season-end year: 2027 = expires after 2026/27).
 *    Real contract data is not available yet, so `contractEstimated` is true for all of them.
 *  - seasonReview(): pure read-only summary (ageing, risers/fallers, expiring contracts).
 *
 * Loaded last, patches KHLManagerApp.prototype in the same style as the earlier modules.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;

  const SEASON_DAYS = 250;          // days between season start and the end of the Cup
  const BASE_SEASON_RATE = 1.3;     // OVR a profileRate=1 player gains over a full season in the legacy engine
  const MODEL_VERSION = 1;

  /** Expected OVR change over one season for a player of this age at season start. */
  function ageTarget(age) {
    const pts = [[17, 3.6], [18, 3.2], [19, 2.6], [20, 2.0], [21, 1.5], [22, 1.0], [23, 0.7], [24, 0.4],
                 [25, 0.15], [26, 0.0], [28, 0.0], [29, -0.2], [30, -0.4], [31, -0.6], [32, -0.8],
                 [33, -1.0], [34, -1.3], [35, -1.6], [36, -1.9], [40, -2.4]];
    if (age <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (age <= pts[i][0]) {
        const [a0, v0] = pts[i - 1], [a1, v1] = pts[i];
        return v0 + (v1 - v0) * (age - a0) / (a1 - a0);
      }
    }
    return pts[pts.length - 1][1];
  }
  proto.ageTargetPerSeason = ageTarget;

  function parseBirth(p) {
    if (!p || !p.birthDate) return null;
    const t = Date.parse(p.birthDate + 'T12:00:00Z');
    return Number.isFinite(t) ? t : null;
  }

  /** Decimal age on the given date (ms timestamp); falls back to 27 when the birth date is unknown. */
  proto.ageOn = function (p, dateMs) {
    const b = parseBirth(p);
    if (b === null) return 27;
    return (dateMs - b) / (365.25 * 86400000);
  };
  proto.seasonStartMs = function () {
    return Date.parse((this.state && this.state.seasonStart || '2026-09-03') + 'T12:00:00Z');
  };
  proto.currentDateMs = function () {
    return this.seasonStartMs() + (this.state ? Number(this.state.dayIndex || 0) : 0) * 86400000;
  };
  /** Whole years on the given date by the calendar: the age increases exactly on the birthday. */
  proto.exactAgeOn = function (p, dateMs) {
    const b = parseBirth(p);
    if (b === null) return 27;
    const bd = new Date(b), d = new Date(dateMs);
    let age = d.getUTCFullYear() - bd.getUTCFullYear();
    if (d.getUTCMonth() < bd.getUTCMonth() || (d.getUTCMonth() === bd.getUTCMonth() && d.getUTCDate() < bd.getUTCDate())) age--;
    return age;
  };
  /** Age as shown to the user: whole years at the current game date. */
  proto.ageYears = function (p) { return this.exactAgeOn(p, this.currentDateMs()); };
  proto.isBirthdayToday = function (p) {
    const b = parseBirth(p);
    if (b === null) return false;
    const bd = new Date(b), d = new Date(this.currentDateMs());
    return bd.getUTCMonth() === d.getUTCMonth() && bd.getUTCDate() === d.getUTCDate();
  };
  /** "1 год", "2 года", "5 лет", "21 год", "33 года", "41 год". */
  proto.ageText = function (n) {
    n = Math.round(Number(n) || 0);
    const m100 = n % 100, m10 = n % 10;
    const w = (m100 >= 11 && m100 <= 14) ? 'лет' : m10 === 1 ? 'год' : (m10 >= 2 && m10 <= 4) ? 'года' : 'лет';
    return n + ' ' + w;
  };
  /** Age as shown to the user (decimal; changes continuously). */
  proto.playerAge = function (p) { return this.ageOn(p, this.currentDateMs()); };
  proto.playerAgeAtSeasonStart = function (p) { return this.ageOn(p, this.seasonStartMs()); };
  /** Last year of the season the game is currently in (2026/27 -> 2027). */
  proto.seasonEndYear = function () {
    const n = Math.max(1, Number(this.state && this.state.seasonNumber) || 1);
    return 2027 + n - 1;
  };

  /* ---- development profile -------------------------------------------------------------- */
  function applyAgeProfile(app, p, d) {
    const age = app.playerAgeAtSeasonStart(p);
    const target = ageTarget(age);
    const ovr = Number(p.ovr) || 70;
    const h = app.makeStableHash(p.id + ':age');
    const mult = 0.7 + (h % 7) * 0.1;                      // personal talent 0.7 .. 1.3
    const ceilingRoom = Math.max(0, (99 - ovr) / 25);      // stars have less room to grow
    if (target > 0.05) {
      const t = target * mult * Math.min(1, 0.55 + ceilingRoom);
      d.profileRate = Math.max(0.05, Math.min(6, t / BASE_SEASON_RATE));
      const reach = age < 25 ? Math.ceil(t * 3) + 1 : age < 27 ? 1 : 0;
      d.potential = Math.min(99, Math.max(ovr + (d.growth || 0), ovr + reach));
      d.declinePerDay = 0;
    } else {
      d.profileRate = 0.05;                                 // nearly no learning
      d.potential = ovr + Math.max(0, d.growth || 0);        // no further upside
      d.declinePerDay = (-target * (0.5 + (h % 11) * 0.1)) / SEASON_DAYS; // 0.5x .. 1.5x of the age norm
    }
    // random-looking but stable starting fraction, so small yearly declines are not rounded away for everybody
    if (d.declineXP == null) d.declineXP = (app.makeStableHash(p.id + ':dx') % 100) / 100;
    d.declined = d.declined || 0;
    d.am = MODEL_VERSION;
  }

  const basePlayerDev = proto.playerDev;
  proto.playerDev = function (playerOrId) {
    const d = basePlayerDev.call(this, playerOrId);
    if (d && d.am !== MODEL_VERSION) {
      const id = typeof playerOrId === 'string' ? playerOrId : playerOrId && playerOrId.id;
      const p = typeof playerOrId === 'string' ? this.db.players.find(x => x.id === id) : playerOrId;
      if (p) applyAgeProfile(this, p, d);
    }
    return d;
  };

  const baseAdvance = proto.advancePlayerDays;
  proto.advancePlayerDays = function (days) {
    baseAdvance.call(this, days);
    if (!this.state || !(Number(days) > 0)) return;
    const n = Math.min(400, Math.max(1, Math.round(days)));
    for (const p of this.db.players) {
      const d = this.playerDev(p);
      if (!d || !(d.declinePerDay > 0)) continue;
      d.declineXP += d.declinePerDay * n;
      while (d.declineXP >= 1 && (Number(p.ovr) || 70) + (d.growth || 0) > 45) {
        d.declineXP -= 1;
        d.growth = (d.growth || 0) - 1;
        d.declined = (d.declined || 0) + 1;
        d.potential = Math.min(d.potential, (Number(p.ovr) || 70) + d.growth);   // a veteran does not grow back
        d.growthXP = Math.min(d.growthXP || 0, 20);
        // age wears out legs and stamina first
        const key = (d.declined % 2) ? 'skating' : 'stamina';
        if (d.skills && d.skills[key] > 40) d.skills[key] -= 1;
        d.morale = Math.max(0, d.morale - 0.5);
      }
    }
  };

  /* ---- contracts --------------------------------------------------------------------------- */
  proto.contractYearsLeft = function (p) {
    if (!p || !Number.isFinite(Number(p.contractUntil))) return null;
    return Number(p.contractUntil) - this.seasonEndYear() + 1;   // 1 = expires after this season
  };
  proto.expiringContracts = function (teamId) {
    return this.teamPlayers(teamId)
      .filter(p => this.contractYearsLeft(p) === 1)
      .sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
  };

  /* ---- season review (read-only) ------------------------------------------------------------ */
  proto.seasonReview = function () {
    if (!this.state) return null;
    const uid = this.state.teamId;
    const rows = this.db.players.map(p => {
      const now = this.permanentOVR(p);
      return { id: p.id, name: p.name, teamId: p.teamId, pos: p.pos, age: this.ageYears(p), ovr0: Number(p.ovr) || 70,
               ovr1: now, delta: now - (Number(p.ovr) || 70), contractUntil: p.contractUntil, est: !!p.contractEstimated };
    });
    const mine = rows.filter(r => r.teamId === uid);
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const expiring = this.expiringContracts(uid);
    const sal = expiring.reduce((s, p) => s + (p.salary || 0), 0);
    const byDelta = mine.filter(r => r.delta !== 0).sort((a, b) => b.delta - a.delta || b.ovr1 - a.ovr1);
    return {
      season: '2026/27', finished: !!this.state.seasonFinished,
      avgAge: avg(mine.map(r => r.age)),
      young: mine.filter(r => r.age < 22).length, veterans: mine.filter(r => r.age >= 34).length,
      retireWatch: mine.filter(r => r.age >= 37),
      expiring: expiring.map(p => ({ id: p.id, name: p.name, pos: p.pos, age: this.ageYears(p), ovr: this.permanentOVR(p),
                                    salary: p.salary, until: p.contractUntil, est: !!p.contractEstimated })),
      expiringSalary: sal,
      risers: byDelta.filter(r => r.delta > 0).slice(0, 5),
      fallers: byDelta.filter(r => r.delta < 0).reverse().slice(0, 5),
      teamDelta: mine.reduce((s, r) => s + r.delta, 0)
    };
  };

  /* ---- UI: card in the "Развитие" tab ---------------------------------------------------------- */
  proto.renderAgeContractsCard = function () {
    const host = document.getElementById('development-summary');
    if (!host || !this.state) return;
    let card = document.getElementById('age-contracts-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'age-contracts-card';
      card.className = 'card';
      card.style.marginBottom = '1rem';
      host.parentNode.insertBefore(card, host.nextSibling);
    }
    const r = this.seasonReview();
    if (!r) return;
    const esc = s => this.escape ? this.escape(String(s)) : String(s);
    const sign = v => (v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '0');
    const list = (arr, empty) => arr.length ? arr.map(x =>
      `<li>${esc(x.name)} <span class="muted">· ${esc(this.positionLabel ? this.positionLabel(x.pos) : x.pos)} · ${this.ageText(x.age)} · ${x.ovr0}→${x.ovr1} (${sign(x.delta)})</span></li>`).join('') : `<li class="muted">${empty}</li>`;
    const exp = r.expiring.length ? r.expiring.map(x =>
      `<tr><td>${esc(x.name)}</td><td>${esc(this.positionLabel ? this.positionLabel(x.pos) : x.pos)}</td><td>${x.age}</td><td>${Math.round(x.ovr)}</td><td>${this.money ? this.money(x.salary) : x.salary} млн</td><td>${x.until}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">В этом сезоне контракты не истекают.</td></tr>';
    card.innerHTML = `
      <div class="eyebrow">Возраст и развитие · ${r.season}${r.finished ? ' · итоги сезона' : ''}</div>
      <div class="metric-row" style="margin:.6rem 0">
        <div class="metric"><div class="label">Средний возраст</div><div class="value">${r.avgAge.toFixed(1)}</div><div class="sub">молодых до 22: ${r.young} · ветеранов 34+: ${r.veterans}</div></div>
        <div class="metric"><div class="label">Рост состава</div><div class="value">${sign(r.teamDelta)}</div><div class="sub">сумма изменений OVR</div></div>
      </div>
      <div class="grid grid-equal">
        <div><strong>Растут</strong><ul class="small">${list(r.risers, 'Пока без изменений')}</ul></div>
        <div><strong>Сдают</strong><ul class="small">${list(r.fallers, 'Пока без изменений')}</ul></div>
      </div>
      ${r.retireWatch.length ? `<p class="small muted">Возможное завершение карьеры: ${r.retireWatch.map(x => esc(x.name) + ' (' + x.age + ')').join(', ')}.</p>` : ''}`;
  };

  const baseRenderDev = proto.renderDevelopment;
  proto.renderDevelopment = function () {
    baseRenderDev.apply(this, arguments);
    if (!this.state) return;
    try {
      const sum = document.getElementById('development-summary');
      if (sum && typeof sum.innerHTML === 'string') sum.innerHTML = sum.innerHTML.replace('+-', '−').replace('>+0<', '>0<');
      this.renderAgeContractsCard();
    } catch (e) { console.warn('KHL Manager 7.32 age card:', e); }
  };
})();
