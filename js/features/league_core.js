/* 15.4.0 (архитектура): первый срез Этапа 1 роадмапа «мультилиговая архитектура» —
   абстракция League над существующими db.js (КХЛ) и vhl.js (ВХЛ). Чисто аддитивный слой:
   ничего из существующих вызовов (db.teams/db.players/vhlState и т.п.) не меняется и не удаляется —
   этот модуль только даёт единый интерфейс поверх них, чтобы остальные этапы (общий матч-движок,
   обобщённый менеджмент-стек, МХЛ) могли опираться на него, а не на db.js напрямую.
   См. роадмап: https://claude.ai/artifact/1w7j3ZUxeF6VHgsTWcbMzv

   ВАЖНО (найдено при разборе перед миграцией teamById/teamPlayers, 15.4.1):
   у КХЛ и ВХЛ принципиально разное хранение «живых» данных карьеры.
   - КХЛ: конструктор KHLManagerApp делает глубокую копию KHL_DATABASE в this.db
     (js/core/game.js) — трейды/контракты мутируют this.db.players[i].teamId и т.п.
     Поэтому league('KHL') читает this.db, а НЕ глобальный KHL_DATABASE: иначе трейды,
     контракты и подписания не отражались бы в этом интерфейсе.
   - ВХЛ: такой копии нет — весь код (vhl_model.js, vhl_transfers.js, search.js и т.п.)
     читает и мутирует глобальный VHL_DATABASE прямо. Поэтому league('VHL') читает его.
   league() — метод экземпляра (не статический объект), именно по этой причине. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;

  function vhlDb() { return (typeof VHL_DATABASE !== 'undefined') ? VHL_DATABASE : null; }

  proto.leagueIds = function () { return ['KHL', 'VHL']; };

  // Контракт лиги: { id, name, teams(), players(), team(id), teamPlayers(teamId) }.
  proto.league = function (leagueId) {
    const self = this;
    if (leagueId === 'KHL') {
      return {
        id: 'KHL',
        name: 'КХЛ',
        teams() { return self.db ? self.db.teams : []; },
        players() { return self.db ? self.db.players : []; },
        team(teamId) { return self.db ? (self.db.teams.find((t) => t.id === teamId) || null) : null; },
        teamPlayers(teamId) { return self.db ? self.db.players.filter((p) => p.teamId === teamId) : []; }
      };
    }
    if (leagueId === 'VHL') {
      return {
        id: 'VHL',
        name: 'ВХЛ',
        // Возвращает те же объекты, что и VHL_DATABASE.teams/players — без копирования,
        // чтобы код, мутирующий поля клуба/игрока по ссылке (budget, clubId и т.п.), не ломался.
        teams() { const d = vhlDb(); return d ? d.teams : []; },
        players() { const d = vhlDb(); return d ? d.players : []; },
        team(teamId) { const d = vhlDb(); if (!d) return null; return d.teams.find((x) => x.id === teamId) || null; },
        // vhl.js хранит клубную привязку как clubId (не teamId, как в db.js) — нормализуем здесь. 15.9.0:
        // принадлежность может быть переопределена трансфером между клубами ВХЛ — читаем через оверлей
        // (vhlEffectiveClubId), а не p.clubId напрямую, иначе обменянные игроки «вернутся» на старое место.
        teamPlayers(teamId) { const d = vhlDb(); if (!d) return []; return d.players.filter((p) => (self.vhlEffectiveClubId ? self.vhlEffectiveClubId(p) : p.clubId) === teamId); }
      };
    }
    return null;
    // МХЛ (Этап 5 роадмапа) добавится сюда же, когда появится реальный ростер.
  };

  proto.leagueTeam = function (leagueId, teamId) {
    const L = this.league(leagueId); return L ? L.team(teamId) : null;
  };

  proto.leagueTeamPlayers = function (leagueId, teamId) {
    const L = this.league(leagueId); return L ? L.teamPlayers(teamId) : [];
  };

  // Клубные id между КХЛ и ВХЛ не гарантированно уникальны глобально (хотя по факту не пересекаются) —
  // поэтому там, где лига неизвестна заранее, сначала пробуем по префиксу игрока, затем перебором.
  proto.leagueOfPlayer = function (playerId) {
    if (typeof playerId === 'string') {
      if (playerId.indexOf('v_') === 0) return 'VHL';
      if (playerId.indexOf('p_') === 0) return 'KHL';
    }
    for (const id of this.leagueIds()) {
      if (this.league(id).players().some((p) => p.id === playerId)) return id;
    }
    return null;
  };

  proto.leagueOfTeam = function (teamId) {
    for (const id of this.leagueIds()) {
      if (this.league(id).teams().some((t) => t.id === teamId)) return id;
    }
    return null;
  };
})();
