/* KHL Manager 8.9 — news desk rework.
 *  - Club names and player surnames are declined (падежи, род/число глаголов, числительные).
 *  - The feed is calmer: your club gets full coverage, the rest of the league is summarised (Итоги дня, Анонс дня, Звезда дня).
 *  - New stories: Игрок недели / месяца, playoff berth clinched / lost, playoff pairs, series leads and results, champion.
 *  - Filters: Мой клуб / Лига / ...; the feed keeps 600 entries (about 30 game days).
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const CASES = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'];

  /* ---------------- team names ---------------- */
  const T = {};
  const reg = (id, g, forms) => { T[id] = { g, f: forms.length === 1 ? Array(6).fill(forms[0]) : forms }; };
  reg('ska', 'm', ['СКА']);
  reg('spartak', 'm', ['Спартак', 'Спартака', 'Спартаку', 'Спартак', 'Спартаком', 'Спартаке']);
  reg('torpedo', 'n', ['Торпедо']);
  reg('lada', 'f', ['Лада', 'Лады', 'Ладе', 'Ладу', 'Ладой', 'Ладе']);
  reg('sochi', 'm', ['Сочи']);
  reg('dinamo_mn', 'n', ['Динамо Мн']);
  reg('dinamo_msk', 'n', ['Динамо Мск']);
  reg('shanghai', 'p', ['Шанхайские Драконы', 'Шанхайских Драконов', 'Шанхайским Драконам', 'Шанхайских Драконов', 'Шанхайскими Драконами', 'Шанхайских Драконах']);
  reg('lokomotiv', 'm', ['Локомотив', 'Локомотива', 'Локомотиву', 'Локомотив', 'Локомотивом', 'Локомотиве']);
  reg('severstal', 'f', ['Северсталь', 'Северстали', 'Северстали', 'Северсталь', 'Северсталью', 'Северстали']);
  reg('cska', 'm', ['ЦСКА']);
  reg('avtomobilist', 'm', ['Автомобилист', 'Автомобилиста', 'Автомобилисту', 'Автомобилист', 'Автомобилистом', 'Автомобилисте']);
  reg('akbars', 'm', ['Ак Барс', 'Ак Барса', 'Ак Барсу', 'Ак Барс', 'Ак Барсом', 'Ак Барсе']);
  reg('metallurg', 'm', ['Металлург Мг', 'Металлурга Мг', 'Металлургу Мг', 'Металлург Мг', 'Металлургом Мг', 'Металлурге Мг']);
  reg('neftekhimik', 'm', ['Нефтехимик', 'Нефтехимика', 'Нефтехимику', 'Нефтехимик', 'Нефтехимиком', 'Нефтехимике']);
  reg('traktor', 'm', ['Трактор', 'Трактора', 'Трактору', 'Трактор', 'Трактором', 'Тракторе']);
  reg('avangard', 'm', ['Авангард', 'Авангарда', 'Авангарду', 'Авангард', 'Авангардом', 'Авангарде']);
  reg('admiral', 'm', ['Адмирал', 'Адмирала', 'Адмиралу', 'Адмирал', 'Адмиралом', 'Адмирале']);
  reg('amur', 'm', ['Амур', 'Амура', 'Амуру', 'Амур', 'Амуром', 'Амуре']);
  reg('barys', 'm', ['Барыс', 'Барыса', 'Барысу', 'Барыс', 'Барысом', 'Барысе']);
  reg('salavat', 'm', ['Салават Юлаев', 'Салавата Юлаева', 'Салавату Юлаеву', 'Салават Юлаев', 'Салаватом Юлаевым', 'Салавате Юлаеве']);
  reg('sibir', 'f', ['Сибирь', 'Сибири', 'Сибири', 'Сибирь', 'Сибирью', 'Сибири']);

  const teamOf = (app, t) => (typeof t === 'string' ? app.teamById(t) : t);
  proto.tn = function (t, c) {
    const team = teamOf(this, t); if (!team) return '';
    const e = T[team.id]; const i = Math.max(0, CASES.indexOf(c || 'nom'));
    return e ? e.f[i] : team.name;
  };
  proto.teamGender = function (t) { const team = teamOf(this, t); return (team && T[team.id] && T[team.id].g) || 'm'; };
  /** Past-tense verb in the club's gender/number: tv(team, 'обыграл') -> обыграл / обыграла / обыграло / обыграли */
  proto.tv = function (t, masc) {
    const g = this.teamGender(t);
    return g === 'f' ? masc + 'а' : g === 'n' ? masc + 'о' : g === 'p' ? masc + 'и' : masc;
  };
  /** Present tense: tp(team, 'продлевает') -> продлевает / продлевают */
  proto.tp = function (t, third) {
    return this.teamGender(t) === 'p' ? third.replace(/ет$/, 'ют').replace(/ит$/, 'ят') : third;
  };
  proto.plu = function (n, forms) {
    n = Math.abs(Math.round(n));
    const a = n % 100, b = n % 10;
    return (a >= 11 && a <= 14) ? forms[2] : b === 1 ? forms[0] : (b >= 2 && b <= 4) ? forms[1] : forms[2];
  };

  /* ---------------- surnames ---------------- */
  function declSurname(s, c, foreign) {
    if (!s || c === 'nom') return s;
    const ci = { gen: 0, dat: 1, acc: 2, ins: 3, prep: 4 }[c];
    if (ci == null) return s;
    const adj = (stem, ins) => stem + ['ого', 'ому', 'ого', ins, 'ом'][ci];
    if (/(ский|цкий)$/i.test(s)) return adj(s.slice(0, -2), 'им');
    if (/ый$/i.test(s)) return adj(s.slice(0, -2), 'ым');
    if (/ой$/i.test(s)) return adj(s.slice(0, -2), 'ым');
    if (/ий$/i.test(s)) return adj(s.slice(0, -2), 'им');
    if (/(ых|их|ко|[оеёиуюэы])$/i.test(s)) return s;
    if (/(ец|ок|ек)$/i.test(s)) return s;
    if (/[ая]$/i.test(s)) {
      if (foreign) return s;
      const soft = /я$/i.test(s), stem = s.slice(0, -1);
      const hush = /[гкхжчшщ]$/i.test(stem);
      return stem + (soft ? ['и', 'е', 'ю', 'ей', 'е'] : [hush ? 'и' : 'ы', 'е', 'у', 'ой', 'е'])[ci];
    }
    if (/[йь]$/i.test(s)) {
      if (foreign && /ь$/i.test(s)) return s;
      return s.slice(0, -1) + ['я', 'ю', 'я', 'ем', 'е'][ci];
    }
    if (/[бвгджзклмнпрстфхцчшщ]$/i.test(s)) {
      const ruPoss = !foreign && /(ов|ев|ёв|ин|ын)$/i.test(s);
      return s + ['а', 'у', 'а', ruPoss ? 'ым' : 'ом', 'е'][ci];
    }
    return s;
  }
  /** Surname of a player in the given case ("Шерстнев" -> "Шерстнева"). */
  proto.sn = function (p, c) {
    const name = String((p && p.name) || p || '').trim();
    const last = name.split(/\s+/).slice(-1)[0];
    return declSurname(last, c || 'nom', !!(p && p.foreign));
  };
  /** Full name in the given case: first names are left in the nominative only when unsure. */
  proto.pn = function (p, c) {
    const name = String((p && p.name) || '').trim();
    if (!c || c === 'nom') return name;
    const parts = name.split(/\s+/);
    return parts.slice(0, -1).concat(this.sn(p, c)).join(' ');
  };

  /* ---------------- publishing ---------------- */
  const posWord = p => (p.pos === 'D' ? 'Защитник' : p.pos === 'G' ? 'Вратарь' : 'Нападающий');
  proto.newsGate = function (key, item) {
    const parts = key.split(':'), type = parts[0], my = this.state.teamId, meta = this.state.newsMeta;
    switch (type) {
      case 'form': return false;
      case 'coach-quote': case 'coach-criticism': case 'ref-protest': case 'attendance-up': case 'attendance-down': case 'dressing-room':
        return parts[2] === my;
      case 'preview': case 'result': return (item.teamIds || []).includes(my);
      case 'table-race-8': {
        const d = Number(item.dateOffset) || 0;
        if (meta.lastTable != null && d - meta.lastTable < 7) return false;
        meta.lastTable = d; return true;
      }
      case 'upset': {
        if ((item.teamIds || []).includes(my)) return true;
        const d = Number(item.dateOffset) || 0;
        return this.state.news.filter(n => n.dateOffset === d && String(n.key).startsWith('upset:') && !(n.teamIds || []).includes(my)).length < 2;
      }
      default: return true;
    }
  };
  proto.publishNews = function (item) {
    if (!this.state) return null;
    this.ensureNewsState();
    const key = String(item.key || `${item.category || 'press'}:${item.matchId || 'league'}:${item.headline || ''}`);
    if (this.state.news.some(n => n.key === key)) return null;
    if (this.newsGate(key, item) === false) return null;
    const fix = s => String(s || '').replace(/\.\.(?!\.)/g, '.');
    const mine = (item.teamIds || []).includes(this.state.teamId);
    const entry = {
      id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key,
      category: item.category || 'press', icon: item.icon || '📰',
      headline: fix(item.headline || 'Новости лиги'), body: fix(item.body),
      dateOffset: Math.min(Number(item.dateOffset ?? this.state.dayIndex ?? 0), Number(this.state.dayIndex || 0)), createdAt: Date.now(),
      teamIds: Array.isArray(item.teamIds) ? item.teamIds : [], matchId: item.matchId || null, read: false,
      scope: item.scope || (mine ? 'club' : 'league'), tag: item.tag || null
    };
    this.state.news.unshift(entry);
    this.state.news = this.state.news.slice(0, 900);
    return entry;
  };
  /* ---------------- previews ---------------- */
  proto.matchesOnDate = function (date) {
    return this.state.matches.filter(m => Number(m.dateOffset) === Number(date) && !m.cancelled);
  };
  const gamesWord = (app, n) => n + ' ' + app.plu(n, ['игра', 'игры', 'игр']);
  proto.dayCardTitle = function (prefix, ms) {
    const n = ms.length;
    if (ms[0] && ms[0].playoff) return `${prefix} Кубка Гагарина: ${gamesWord(this, n)}`;
    return `${prefix} — ${ms[0] && ms[0].round && !(this.state && this.state.calendar) ? ms[0].round + '-й тур: ' : ''}${gamesWord(this, n)}`;
  };
  // one card per match day, published one day ahead and containing every game of the day (yours too)
  proto.ensureAnons = function (date) {
    this.ensureNewsState();
    const ms = this.matchesOnDate(date); if (!ms.length) return null;
    const dby = m => { const d = this.derbyOf && this.derbyOf(m.homeId, m.awayId); return d ? ` · 🔥 ${d.name}` : ''; };
    const lines = ms.map(m => { const h = this.teamById(m.homeId), a = this.teamById(m.awayId); return `${h.name} — ${a.name}${dby(m)}`; });
    const headline = this.dayCardTitle('Анонс игрового дня', ms), body = lines.join('\n');
    const key = `anons:${date}`, ex = this.state.news.find(n => n.key === key);
    if (ex) { ex.headline = headline; ex.body = body; return ex; }
    return this.publishNews({ key, category: 'preview', icon: '📣', tag: 'Анонс дня', headline, body, dateOffset: Math.max(0, Number(date) - 1), teamIds: [], scope: 'league' });
  };
  const basePreview = proto.publishMatchPreviewNews;
  proto.publishMatchPreviewNews = function (match) {
    if (!this.state || !match) return null;
    const my = this.state.teamId, date = Number(match.dateOffset) || 0, today = Number(this.state.dayIndex) || 0;
    if (!match.played && !match.cancelled && date - today <= 1) this.ensureAnons(date);
    if (match.homeId !== my && match.awayId !== my) return null;
    if (date - today > 1) return null;                      // not earlier than the day before, like the day card
    const e = basePreview.call(this, match);
    if (e) {
      e.dateOffset = Math.min(Math.max(0, date - 1), today);  // dated the day it is published
      e.body = String(e.body || '').replace(/\.\.(?!\.)/g, '.');
      { const d = this.derbyOf && this.derbyOf(match.homeId, match.awayId); if (d && !/дерби|побоище/i.test(e.body)) e.body += `\n🔥 ${d.name}${d.level === 2 ? ': принципиальная встреча' : ''}`; }
    }
    return e;
  };

  /* ---------------- results and everything after a match ---------------- */
  proto.gamePoints = function (match) {
    const map = new Map();
    const add = (pid, kind) => {
      if (!pid) return; const p = this.db.players.find(x => x.id === pid); if (!p) return;
      const r = map.get(pid) || { p, g: 0, a: 0 }; if (kind === 'g') r.g++; else r.a++; map.set(pid, r);
    };
    (match.events || []).filter(e => e.kind === 'goal').forEach(e => { add(e.scorerId, 'g'); add(e.assist1Id, 'a'); add(e.assist2Id, 'a'); });
    return [...map.values()];
  };
  const ptsWord = (app, n) => n + ' ' + app.plu(n, ['очко', 'очка', 'очков']);
  const goalsAssists = (app, r) => `${r.g} ${app.plu(r.g, ['гол', 'гола', 'голов'])} и ${r.a} ${app.plu(r.a, ['передача', 'передачи', 'передач'])}`;
  const resultSuffix = m => (m.so ? ' (Б)' : m.ot ? ' (ОТ)' : '');

  // published once the last game of the match day is over
  proto.publishResultsDigest = function (date) {
    this.ensureNewsState();
    const ms = this.matchesOnDate(date); if (!ms.length || ms.some(m => !m.played)) return null;
    const lines = ms.map(m => { const d = this.derbyOf && this.derbyOf(m.homeId, m.awayId); return `${this.teamById(m.homeId).name} ${m.homeScore}:${m.awayScore} ${this.teamById(m.awayId).name}${resultSuffix(m)}${d ? ` · 🔥 ${d.name}` : ''}`; });
    const headline = this.dayCardTitle('Итоги дня', ms), body = lines.join('\n');
    const key = `digest:${date}`, ex = this.state.news.find(n => n.key === key);
    if (ex) { ex.headline = headline; ex.body = body; return ex; }
    return this.publishNews({ key, category: 'result', icon: '📋', tag: 'Итоги дня', headline, body, dateOffset: date, teamIds: [], scope: 'league' });
  };

  proto.publishMatchResultNews = function (match, previousTop, history) {
    if (!this.state || !match || !match.played || match.cancelled) return;
    const home = this.teamById(match.homeId), away = this.teamById(match.awayId); if (!home || !away) return;
    const my = this.state.teamId, mine = home.id === my || away.id === my;
    const h = Number(match.homeScore) || 0, a = Number(match.awayScore) || 0;
    const date = Number(match.dateOffset) || this.state.dayIndex;
    const winner = h === a ? null : (h > a ? home : away), loser = winner ? (winner.id === home.id ? away : home) : null;
    const meta = this.state.newsMeta;
    const comp = match.playoff ? 'Кубок Гагарина' : 'Регулярный чемпионат';
    const how = match.so ? ' по буллитам' : match.ot ? ' в овертайме' : '';

    // 1) the result: full story for your club, one line in the league digest for the rest
    this.publishResultsDigest(date);
    if (mine && winner) {
      const margin = Math.abs(h - a), shutout = (h === 0 || a === 0);
      const wv = v => this.tv(winner, v);
      const headline = (match.so || match.ot) ? `${winner.name} ${wv('обыграл')} ${this.tn(loser, 'acc')}${how}`
        : shutout ? `${winner.name} ${wv('обыграл')} ${this.tn(loser, 'acc')} всухую`
        : margin >= 4 ? `${winner.name} ${wv('разгромил')} ${this.tn(loser, 'acc')}`
        : margin >= 3 ? `${winner.name} уверенно ${wv('обыграл')} ${this.tn(loser, 'acc')}`
        : margin === 1 ? `${winner.name} ${wv('вырвал')} победу у ${this.tn(loser, 'gen')}`
        : `${winner.name} ${wv('обыграл')} ${this.tn(loser, 'acc')}`;
      let body = `${comp}: ${home.name} ${h}:${a} ${away.name}${match.so ? ' — победа по буллитам' : match.ot ? ' — победа в овертайме' : ''}.`;
      if (match.homeShots != null && match.awayShots != null) body += ` Броски: ${match.homeShots}–${match.awayShots}.`;
      this.publishNews({ key: `result:${match.id}`, category: 'result', icon: '🏒', headline, body, dateOffset: date, teamIds: [home.id, away.id], matchId: match.id });
    }
    if (history) return;

    // 2) upset
    if (winner) {
      try {
        let sh = null, sa = null; try { sh = this.getStrength(home.id); sa = this.getStrength(away.id); } catch (e) {}
        const diff = (Number(sh && sh.overall) || 75) - (Number(sa && sa.overall) || 75);
        let upset = (winner.id === home.id && diff <= -4.5) || (winner.id === away.id && diff >= 4.5);
        const wr = this.conferenceRank(winner.id), lr = this.conferenceRank(loser.id), same = winner.conf === loser.conf;
        if (same && wr >= lr + 4) upset = true;
        const wp = Number(this.state.standings[winner.id] && this.state.standings[winner.id].pts) || 0, lp = Number(this.state.standings[loser.id] && this.state.standings[loser.id].pts) || 0;
        if (same && lp >= wp + 8) upset = true;
        if (upset) this.publishNews({
          key: `upset:${match.id}`, category: 'press', icon: '⚡',
          headline: `Сенсация: ${winner.name} ${this.tv(winner, 'обыграл')} фаворита — ${this.tn(loser, 'acc')}`,
          body: `${winner.name} ${this.tv(winner, 'победил')} ${this.tn(loser, 'acc')} со счётом ${winner.id === home.id ? h : a}:${winner.id === home.id ? a : h}${how}. Положение команд и предматчевые оценки не обещали такого исхода.`,
          dateOffset: date, teamIds: [winner.id, loser.id], matchId: match.id
        });
      } catch (e) {}
    }

    // 3) injuries: all of yours, only serious ones elsewhere
    const injuries = new Map();
    [...(match.injuries || []), ...(match.events || []).filter(e => e.kind === 'injury').map(e => ({ playerId: e.playerId, teamId: e.teamId, severity: e.severity, injuryType: e.injuryType }))].forEach(i => { if (i && i.playerId) injuries.set(i.playerId, i); });
    for (const [pid, inj] of injuries) {
      const p = this.db.players.find(x => x.id === pid); if (!p) continue;
      const dev = this.playerDev(p), d = (dev && dev.injury) || {};
      const sev = inj.severity || d.severity || 'light';
      if (p.teamId !== my && sev !== 'severe') continue;
      const desc = sev === 'severe' ? 'тяжёлую травму' : sev === 'medium' ? 'травму средней степени' : 'лёгкое повреждение';
      const kind = inj.injuryType || d.injuryType || '';
      const term = d.gamesRemaining ? ` Ожидаемый срок — ещё ${d.gamesRemaining} ${this.plu(d.gamesRemaining, ['матч', 'матча', 'матчей'])}.`
        : d.daysRemaining ? ` Ожидаемый срок — около ${d.daysRemaining} ${this.plu(d.daysRemaining, ['дня', 'дней', 'дней'])}.`
        : sev === 'light' ? ' Он сможет сыграть в следующем матче.' : '';
      const headline = sev === 'severe' ? `Тяжёлая травма: ${p.name} (${this.teamById(p.teamId).name})` : sev === 'medium' ? `Травма: ${p.name} выбыл из строя` : `${p.name} получил повреждение`;
      this.publishNews({
        key: `injury:${match.id}:${pid}`, category: 'injury', icon: '🩹', headline,
        body: `Пресс-служба ${this.tn(p.teamId, 'gen')} сообщает: ${p.name} (${this.positionLabel(p.pos)}) получил ${desc}${kind ? ' — ' + kind : ''}.${term}`,
        dateOffset: date, teamIds: [p.teamId], matchId: match.id
      });
    }

    // 4) streaks (your club from 3, the others from 5)
    for (const tid of [home.id, away.id]) {
      const streak = this.teamMatchStreak(tid, !!match.playoff);
      if (!streak || streak.type === 'D') continue;
      const n = streak.count, min = tid === my ? 3 : 5;
      if (n < min || !(n === 3 || n === 5 || n === 7 || n % 5 === 0)) continue;
      const team = this.teamById(tid), won = streak.type === 'W';
      const games = `${n} ${this.plu(n, ['матч', 'матча', 'матчей'])} подряд`;
      this.publishNews({
        key: `streak:${match.id}:${tid}:${streak.type}:${n}`, category: 'series', icon: won ? '📈' : '📉',
        headline: won ? `${team.name} ${this.tv(team, 'выиграл')} ${games}` : `${team.name} ${this.tv(team, 'проиграл')} ${games}`,
        body: won ? `${team.name} ${this.tv(team, 'выиграл')} ${games}${match.playoff ? ' в плей-офф' : ' в регулярном чемпионате'}. Команда набрала ход.`
          : `${team.name} ${this.tv(team, 'проиграл')} ${games}. Давление на тренерский штаб растёт.`,
        dateOffset: date, teamIds: [tid], matchId: match.id
      });
      if (!won && n >= 5 && tid === my && (n === 5 || n === 7 || n === 10 || (n > 10 && n % 5 === 0))) {
        const topics = [['игрой большинства', 'реализацию большинства'], ['игрой меньшинства', 'действия в меньшинстве'], ['игрой первого звена', 'результативность первого звена'], ['игрой второго звена', 'вклад второго звена'], ['игрой третьего звена', 'работу третьего звена'], ['игрой четвёртого звена', 'надёжность четвёртого звена']];
        const seed = String(tid).split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) + n, tp = topics[seed % topics.length];
        this.publishNews({
          key: `coach-criticism:${match.id}:${tid}:${n}`, category: 'press', icon: '🎙️', headline: `Тренер недоволен ${tp[0]}`,
          body: `После серии из ${n} ${this.plu(n, ['поражения', 'поражений', 'поражений'])} подряд тренерский штаб ${this.tn(tid, 'gen')} потребовал улучшить ${tp[1]}. Давление на команду усиливается, и следующие матчи становятся особенно важными.`,
          dateOffset: date, teamIds: [tid], matchId: match.id
        });
      }
    }

    // 5) scoring race (leader change, then every 10 points)
    if (!match.playoff) {
      const top = this.currentTopLeagueScorer();
      if (top) {
        const oldId = (previousTop && previousTop.player && previousTop.player.id) || meta.topScorerId || null, pts = top.stats.pts || 0;
        if (pts >= 10 && (top.player.id !== oldId || pts % 10 === 0)) this.publishNews({
          key: `leader:${top.player.id}:${pts}`, category: 'leader', icon: '🥅',
          headline: top.player.id !== oldId && oldId ? `${top.player.name} возглавил гонку бомбардиров` : `${top.player.name} — лучший бомбардир лиги`,
          body: `${posWord(top.player)} ${this.tn(top.player.teamId, 'gen')} набрал ${ptsWord(this, pts)} (${top.stats.g || 0} ${this.plu(top.stats.g || 0, ['гол', 'гола', 'голов'])} и ${top.stats.a || 0} ${this.plu(top.stats.a || 0, ['передача', 'передачи', 'передач'])}) и лидирует среди бомбардиров лиги.`,
          dateOffset: date, teamIds: [top.player.teamId], matchId: match.id
        });
        if (pts >= 5) meta.topScorerId = top.player.id;
      }
    }

    // 6) star of the day, player of the week / month
    this.updateAwards(match, home, away, h, a, date);

    // 7) table and playoffs
    try { if (match.playoff) this.publishPlayoffNews(match, date); else this.publishTableNews(match, date); } catch (e) { console.warn('KHL Manager 8.9 news:', e); }

    // 8) atmosphere
    this.publishAtmosphereNews(match, { home, away, h, a, winner, loser, winnerId: winner ? winner.id : null });
  };

  /* ---------------- awards ---------------- */
  proto.updateAwards = function (match, home, away, h, a, date) {
    const meta = this.state.newsMeta;
    const rows = this.gamePoints(match);
    // star of the day
    if (!meta.starDay || meta.starDay.date !== date) meta.starDay = { date, pid: null, pts: 0, g: 0, a: 0, mid: null };
    for (const r of rows) {
      const pts = r.g + r.a, s = meta.starDay;
      if (pts > s.pts || (pts === s.pts && r.g > s.g)) Object.assign(s, { pid: r.p.id, pts, g: r.g, a: r.a, mid: match.id });
    }
    const s = meta.starDay;
    if (s.pid && s.pts >= 3) {
      const p = this.db.players.find(x => x.id === s.pid), m = this.state.matches.find(x => x.id === s.mid);
      if (p && m) {
        const opp = m.homeId === p.teamId ? m.awayId : m.homeId;
        const sc = `${m.homeScore}:${m.awayScore}`;
        const headline = s.g >= 3 ? `Хет-трик: ${p.name}` : `Звезда дня: ${p.name}`;
        const body = `${posWord(p)} ${this.tn(p.teamId, 'gen')} набрал ${ptsWord(this, s.pts)} (${goalsAssists(this, s)}) в игре против ${this.tn(opp, 'gen')}. Итог матча — ${m.homeScore}:${m.awayScore}.`;
        const ex = this.state.news.find(n => n.key === `star:${date}`);
        if (ex) Object.assign(ex, { headline, body, teamIds: [p.teamId], matchId: m.id });
        else this.publishNews({ key: `star:${date}`, category: 'award', icon: '⭐', tag: 'Звезда дня', headline, body, dateOffset: date, teamIds: [p.teamId], matchId: m.id });
      }
    }
    // week / month accumulators
    for (const [slot, len, title, minPts, icon] of [['wk', 7, 'Игрок недели', 4, '🏅'], ['mo', 30, 'Игрок месяца', 8, '🏆']]) {
      const id = Math.floor(date / len);
      const acc = meta[slot] || (meta[slot] = { id, pts: {} });
      if (acc.id !== id) {
        if (id > acc.id) {
          const best = Object.entries(acc.pts).sort((x, y) => (y[1].g + y[1].a) - (x[1].g + x[1].a) || y[1].g - x[1].g)[0];
          if (best && best[1].g + best[1].a >= minPts) {
            const p = this.db.players.find(x => x.id === best[0]);
            if (p) this.publishNews({
              key: `${slot}:${acc.id}`, category: 'award', icon, tag: title, headline: `${title}: ${p.name}`,
              body: `${posWord(p)} ${this.tn(p.teamId, 'gen')} набрал ${ptsWord(this, best[1].g + best[1].a)} (${goalsAssists(this, best[1])}) и признан лучшим игроком ${slot === 'wk' ? 'прошедшей недели' : 'месяца'} в лиге.`,
              dateOffset: date, teamIds: [p.teamId]
            });
          }
        }
        meta[slot] = { id, pts: {} };
      }
      const cur = meta[slot];
      for (const r of rows) { const x = cur.pts[r.p.id] || (cur.pts[r.p.id] = { g: 0, a: 0 }); x.g += r.g; x.a += r.a; }
    }
  };

  /* ---------------- table and playoffs ---------------- */
  proto.publishTableNews = function (match, date) {
    const my = this.state.teamId;
    for (const conf of ['West', 'East']) {
      let rows; try { rows = this.standingsFor(conf.toLowerCase()); } catch (e) { rows = null; }
      if (!rows || !rows.length) continue;
      if (!rows.some(t => t.id === match.homeId || t.id === match.awayId)) continue;
      const info = rows.map(t => ({ id: t.id, pts: Number(t.pts) || 0, gp: Number(t.gp) || 0, rem: Math.max(0, this.teamSeasonGames(t.id) - (Number(t.gp) || 0)) }));
      for (const t of info) {
        if (t.gp < 20) continue;
        const reach = info.filter(x => x.id !== t.id && x.pts + 2 * x.rem >= t.pts).length;
        const above = info.filter(x => x.id !== t.id && x.pts > t.pts + 2 * t.rem).length;
        const team = this.teamById(t.id);
        if (reach <= 7) this.publishNews({
          key: `clinch:${t.id}`, category: 'playoff', icon: '✅', headline: `${team.name} ${this.tv(team, 'гарантировал')} себе место в плей-офф`,
          body: `Набрав ${ptsWord(this, t.pts)}, ${team.name} уже не может опуститься ниже 8-го места в конференции.`,
          dateOffset: date, teamIds: [t.id], scope: t.id === my ? 'club' : 'league'
        });
        else if (above >= 8) this.publishNews({
          key: `out:${t.id}`, category: 'playoff', icon: '❌', headline: `${team.name} ${({ f: 'лишилась', n: 'лишилось', p: 'лишились' })[T[team.id].g] || 'лишился'} шансов на плей-офф`,
          body: `Даже победы во всех оставшихся матчах не позволят ${this.tn(team, 'dat')} войти в восьмёрку конференции.`,
          dateOffset: date, teamIds: [t.id], scope: t.id === my ? 'club' : 'league'
        });
      }
    }
  };
  proto.publishPlayoffNews = function (match, date) {
    const po = this.state.playoff; if (!po || !po.started) return;
    const meta = this.state.newsMeta;
    this.announcePlayoffStage(date);
    const all = [...(po.series || []), ...(po.history || []).flatMap(h => h.series || [])];
    const s = all.find(x => x.id === match.seriesId); if (!s) return;
    const A = this.teamById(s.teamA), B = this.teamById(s.teamB); if (!A || !B) return;
    const wa = s.winsA || 0, wb = s.winsB || 0;
    const lead = wa >= wb ? A : B, trail = lead === A ? B : A, wl = Math.max(wa, wb), wt = Math.min(wa, wb);
    const scope = [A.id, B.id].includes(this.state.teamId) ? 'club' : 'league';
    if (s.complete) {
      const win = this.teamById(s.winnerId), los = win.id === A.id ? B : A;
      const next = ({ 1: 'во второй раунд', 2: 'в полуфинал', 3: 'в финал Кубка Гагарина', 4: 'в финале' })[s.stage] || 'дальше';
      this.publishNews({
        key: `series-end:${s.id}`, category: 'playoff', icon: '🏆', scope,
        headline: s.stage === 4 ? `${win.name} ${this.tv(win, 'выиграл')} финальную серию` : `${win.name} ${this.tv(win, 'выбил')} ${this.tn(los, 'acc')} — ${wl}:${wt}`,
        body: s.stage === 4 ? `${win.name} ${this.tv(win, 'обыграл')} ${this.tn(los, 'acc')} в серии ${wl}:${wt} и завоёвывает Кубок Гагарина.` : `${win.name} ${this.tv(win, 'выиграл')} серию у ${this.tn(los, 'gen')} со счётом ${wl}:${wt} и выходит ${next}.`,
        dateOffset: date, teamIds: [A.id, B.id], matchId: match.id
      });
    } else if (wl === 3 && wt <= 1) {
      this.publishNews({
        key: `series-lead:${s.id}:${wa}:${wb}`, category: 'playoff', icon: '📊', scope,
        headline: `${lead.name} ${this.tv(lead, 'повёл')} в серии с ${this.tn(trail, 'ins')} — ${wl}:${wt}`,
        body: `${this.tn(lead, 'dat')} не хватает одной победы, чтобы завершить серию.`,
        dateOffset: date, teamIds: [A.id, B.id], matchId: match.id
      });
    } else if (wl === 3 && wt === 3) {
      this.publishNews({
        key: `series-last:${s.id}`, category: 'playoff', icon: '🔥', scope,
        headline: `Седьмой матч: ${A.name} — ${B.name}`,
        body: `Серия сравнялась со счётом 3:3. Всё решится в одном матче.`, dateOffset: date, teamIds: [A.id, B.id], matchId: match.id
      });
    }
    if (po.completed && po.championId) {
      const c = this.teamById(po.championId);
      this.publishNews({
        key: `champion:${po.championId}`, category: 'playoff', icon: '🏆', scope: po.championId === this.state.teamId ? 'club' : 'league',
        headline: `${c.name} — обладатель Кубка Гагарина`, body: `${c.name} ${this.tv(c, 'стал')} победителем плей-офф КХЛ сезона 2026/27.`, dateOffset: date, teamIds: [c.id]
      });
    }
  };
  proto.announcePlayoffStage = function (date) {
    const po = this.state.playoff, meta = this.state.newsMeta;
    if (!po || !po.started || !(po.series || []).length) return;
    const stage = Number(po.stage) || 1;
    if (stage <= (meta.poStage || 0)) return;
    meta.poStage = stage;
    const pairs = po.series.map(s => `${this.teamById(s.teamA).name} — ${this.teamById(s.teamB).name}`).join('\n');
    const nm = this.playoffStageName ? this.playoffStageName(stage) : stage + '-й раунд';
    const mineIn = po.series.some(s => s.teamA === this.state.teamId || s.teamB === this.state.teamId);
    this.publishNews({
      key: `po-stage:${stage}`, category: 'playoff', icon: '🏒', tag: 'Плей-офф',
      headline: stage === 1 ? 'Старт плей-офф Кубка Гагарина' : `Начался раунд «${nm}»`, body: `Пары раунда:\n${pairs}`,
      dateOffset: date, teamIds: [], scope: mineIn ? 'club' : 'league'
    });
  };
  const baseStartPo = proto.ensurePlayoffsStarted;
  if (typeof baseStartPo === 'function') proto.ensurePlayoffsStarted = function () {
    const r = baseStartPo.apply(this, arguments);
    try { if (this.state && this.state.playoff && this.state.playoff.started) this.announcePlayoffStage(Number(this.state.dayIndex) || 0); } catch (e) {}
    return r;
  };

  /* ---------------- atmosphere (club-only stories, weekly league items) ---------------- */
  proto.publishAtmosphereNews = function (match, ctx) {
    ctx = ctx || {};
    if (!this.state || !match) return;
    const home = ctx.home || this.teamById(match.homeId), away = ctx.away || this.teamById(match.awayId); if (!home || !away) return;
    const my = this.state.teamId, mine = home.id === my || away.id === my;
    const date = Number(match.dateOffset) || this.state.dayIndex || 0;
    const meta = this.state.newsMeta;
    if (!meta.videoReplayAnnounced) {
      meta.videoReplayAnnounced = true;
      this.publishNews({ key: `video-replay-tech:${this.state.createdAt || 'career'}`, category: 'press', icon: '📺', headline: 'На аренах тестируют расширенную систему видеоповторов', body: 'На нескольких аренах КХЛ тестируют расширенную систему видеоповторов. В отдельных спорных эпизодах решение будут принимать после просмотра записи.', dateOffset: date, teamIds: [] });
    }
    if (mine) {
      const late = (match.events || []).filter(e => e.kind === 'penalty' && (e.period === '3П' || e.period === 3 || e.period === '3'));
      if (late.length && Math.random() < 0.32) {
        const ev = late[Math.floor(Math.random() * late.length)], club = this.teamById(ev.teamId) || home;
        if (club.id === my) this.publishNews({ key: `ref-protest:${match.id}:${club.id}`, category: 'press', icon: '🧑‍⚖️', headline: `Спорное решение судей: ${club.name} ${this.tv(club, 'подал')} протест`, body: 'После матча клуб подал протест на удаление в третьем периоде. В штабе считают эпизод спорным и намерены запросить разъяснения у судейского департамента.', dateOffset: date, teamIds: [club.id, club.id === home.id ? away.id : home.id], matchId: match.id });
      }
    }
    // the race for eighth place: at most once a week (the gate enforces it)
    if (!match.playoff && Math.random() < 0.42) {
      try {
        const cands = [];
        for (const conf of ['west', 'east']) {
          const ranked = this.standingsFor(conf).filter(t => Number(t.gp || 0) >= 5), near = ranked.slice(5, 11);
          for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) for (let k = j + 1; k < near.length; k++) {
            const trio = [near[i], near[j], near[k]], pts = trio.map(t => Number(t.pts) || 0), spread = Math.max(...pts) - Math.min(...pts), ranks = trio.map(t => ranked.findIndex(x => x.id === t.id) + 1);
            if (spread <= 2 && ranks.some(r => r >= 7 && r <= 9)) cands.push({ trio, spread, conf });
          }
        }
        cands.sort((x, y) => x.spread - y.spread);
        const race = cands[0];
        if (race) {
          const clubs = race.trio.slice().sort((x, y) => (Number(y.pts) || 0) - (Number(x.pts) || 0)).map(t => t.name);
          this.publishNews({ key: `table-race-8:${match.id}:${race.conf}`, category: 'playoff', icon: '📊', headline: 'Борьба за восьмое место обостряется', body: `Три команды — ${clubs.join(', ')} — претендуют на 8-е место в конференции. Разница между ними всего ${race.spread} ${this.plu(race.spread, ['очко', 'очка', 'очков'])}. Каждый ближайший матч может изменить границу зоны плей-офф.`, dateOffset: date, teamIds: race.trio.map(t => t.id), matchId: match.id });
        }
      } catch (e) {}
    }
    this.publishCoachComments(match, { home, away, h: ctx.h, a: ctx.a, winner: ctx.winner || null, loser: ctx.loser || null, winnerId: ctx.winnerId || null });
    if (mine) {
      const tid = my, club = this.teamById(tid), streak = this.teamMatchStreak(tid, !!match.playoff);
      if (streak && [3, 5, 7, 10].includes(streak.count)) {
        const n = streak.count;
        if (streak.type === 'W') this.publishNews({ key: `attendance-up:${match.id}:${tid}:${n}`, category: 'press', icon: '🏟️', headline: `Интерес к домашним матчам ${this.tn(club, 'gen')} растёт`, body: `После серии из ${n} ${this.plu(n, ['победы', 'побед', 'побед'])} интерес болельщиков к домашним матчам клуба вырос примерно на 15%. Удачные результаты возвращают зрителей на трибуны.`, dateOffset: date, teamIds: [tid], matchId: match.id });
        else if (streak.type === 'L') this.publishNews({ key: `attendance-down:${match.id}:${tid}:${n}`, category: 'press', icon: '🏟️', headline: `Болельщики ${this.tn(club, 'gen')} ждут ответа команды`, body: `На фоне серии из ${n} ${this.plu(n, ['поражения', 'поражений', 'поражений'])} интерес к домашним матчам клуба снизился примерно на 15%. Болельщики ждут реакции команды и тренерского штаба.`, dateOffset: date, teamIds: [tid], matchId: match.id });
      }
      if (Math.random() < 0.12 && streak && streak.type === 'L' && streak.count >= 3) {
        const leading = this.teamPlayers(tid).map(p => ({ p, st: this.state.playerStats[p.id] || {} })).sort((x, y) => (Number(y.st.pts) || 0) - (Number(x.st.pts) || 0)).slice(0, 2);
        if (leading.length >= 2) {
          const rec = Math.random() < 0.5;
          this.publishNews({
            key: `dressing-room:${match.id}:${tid}`, category: 'press', icon: rec ? '🤝' : '🗣️',
            headline: rec ? `${club.name}: команда пытается сплотиться` : `В раздевалке ${this.tn(club, 'gen')} обсуждают напряжение`,
            body: rec ? `После непростого отрезка тренер провёл беседу с лидерами команды — ${this.sn(leading[0].p)} и ${this.sn(leading[1].p)}. Источники отмечают, что команда старается оставить разногласия позади и сосредоточиться на хоккее.`
              : `По данным источников, в команде наметилось напряжение между лидерами команды — ${this.sn(leading[0].p)} и ${this.sn(leading[1].p)}; тренер провёл беседу. В клубе ситуацию публично не комментируют.`,
            dateOffset: date, teamIds: [tid], matchId: match.id
          });
        }
      }
    }
  };

  /* ---------------- feed ---------------- */
  const FILTERS = [['all', 'Все'], ['club', 'Мой клуб'], ['league', 'Лига'], ['preview', 'Анонсы'], ['result', 'Результаты'], ['injury', 'Травмы'], ['transfer', 'Трансферы'], ['series', 'Серии'], ['leader', 'Бомбардиры'], ['award', 'Награды'], ['playoff', 'Плей-офф и таблица'], ['press', 'Пресса']];
  proto.setNewsFilter = function (f) {
    this.newsFilter = FILTERS.some(x => x[0] === f) ? f : 'all';
    this.renderNews();
  };
  proto.renderNews = function () {
    if (!this.state) return;
    this.ensureNewsState();
    const root = document.getElementById('news-feed'); if (!root) return;
    for (const n of this.state.news.slice()) if (n.category === 'preview' && n.matchId) { const m = this.state.matches.find(x => x.id === n.matchId); if (m && !m.played && !m.cancelled) this.publishMatchPreviewNews(m); }
    try {
      const next = this.state.matches.filter(m => !m.played && !m.cancelled && Number(m.dateOffset) >= Number(this.state.dayIndex || 0)).map(m => Number(m.dateOffset)).sort((x, y) => x - y)[0];
      if (next != null && next - Number(this.state.dayIndex || 0) <= 1) this.ensureAnons(next);
    } catch (e) {}
    const today = Number(this.state.dayIndex || 0);
    this.state.news.forEach(n => { if (Number(n.dateOffset) > today) n.dateOffset = today; });
    const my = this.state.teamId;
    const scopeOf = n => n.scope || ((n.teamIds || []).includes(my) ? 'club' : 'league');
    const list = this.state.news.slice().sort((a, b) => (Number(b.dateOffset) || 0) - (Number(a.dateOffset) || 0) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const unread = list.filter(n => !n.read).length;
    const played = (this.state.matches || []).filter(m => m.played && !m.cancelled && (m.homeId === my || m.awayId === my)).length;
    const clubNews = list.filter(n => scopeOf(n) === 'club').length;
    const summary = document.getElementById('news-summary');
    if (summary) summary.innerHTML = [['Новые новости', unread, 'Не отмечены прочитанными'], ['Матчей сыграно', played, 'Матчи вашей команды'], ['Новости клуба', clubNews, 'В ленте за последние дни']].map(([a, b, c]) => `<div class="metric"><div class="label">${a}</div><div class="value">${b}</div><div class="sub">${c}</div></div>`).join('');
    const badge = document.getElementById('news-unread-count'); if (badge) { badge.textContent = String(unread); badge.classList.toggle('hidden', unread === 0); }
    const filter = this.newsFilter || 'all';
    const fb = document.getElementById('news-filters');
    if (fb) fb.innerHTML = FILTERS.map(([k, l]) => `<button class="btn news-filter${k === filter ? ' active' : ''}" onclick="app.setNewsFilter('${k}')">${l}</button>`).join('');
    const shown = list.filter(n => filter === 'all' || (filter === 'club' || filter === 'league' ? scopeOf(n) === filter : n.category === filter));
    const icons = { preview: '📣', result: '🏒', injury: '🩹', series: '📈', leader: '🥅', press: '📰', award: '⭐', playoff: '🏆', transfer: '✍️' };
    const labels = { preview: 'Анонс матча', result: 'Итог матча', injury: 'Травмы', series: 'Серии', leader: 'Бомбардиры', press: 'Пресса', award: 'Награды', playoff: 'Плей-офф и таблица', transfer: 'Трансфер' };
    root.innerHTML = shown.length ? shown.map(n => {
      const ids = (n.teamIds || []).filter(id => this.teamById(id)), teams = ids.map((id, i) => ({ name: this.teamById(id).name, dot: this.kitDot ? this.kitDot(id, ids.length === 2 ? i === 0 : true, 's') : '' }));
      return `<article class="news-entry ${n.read ? '' : 'unread'}" data-nd="${Number(n.dateOffset) || 0}" data-nmid="${this.escape(n.matchId || '')}" data-nt="${this.escape((n.teamIds || []).join(','))}" data-ncat="${this.escape(n.category || '')}"><div class="news-icon">${this.escape(n.icon || icons[n.category] || '📰')}</div><div class="news-content"><div class="news-meta"><span>${this.escape(this.formatDate(Number(n.dateOffset) || 0))}</span><span class="news-tag ${this.escape(n.category)}">${this.escape((n.tag === 'transfer' ? 'Трансфер' : n.tag) || labels[n.category] || 'Пресса')}</span>${scopeOf(n) === 'club' ? '<span class="badge green">Мой клуб</span>' : ''}${!n.read ? '<span class="badge red">Новое</span>' : ''}</div><h3 class="news-title">${this.escape(n.headline)}</h3><div class="news-body">${this.escape(n.body)}</div>${teams.length ? `<div class="news-teams">${teams.map(t => t.dot + this.escape(t.name)).join(' · ')}</div>` : ''}</div></article>`;
    }).join('') : '<div class="news-empty">В этой категории пока нет публикаций. Новости появятся по мере развития сезона и проведения матчей.</div>';
  };
})();
