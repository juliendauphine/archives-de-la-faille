/* Visualiseur de parties (porté de visu_lol) — données de /replay_api?id=<MATCH_ID> (replay.py),
   ou de ../replays/<MATCH_ID>.json pour un hébergement statique (build.py).
   Ouvert dans une iframe par replay.html : replay/index.html#<MATCH_ID>&t=<secondes>&speed=<x> */
(() => {
  "use strict";

  // ------------------------------------------------------------------ constantes
  const MAP_PX = 640;
  const MAP_MIN = { x: -120, y: -120 };
  const MAP_MAX = { x: 14870, y: 14980 };
  const PLATES_FALL_AT = 14 * 60 * 1000;
  const INHIB_RESPAWN = 5 * 60 * 1000;
  const SPEEDS = [1, 5, 10, 20, 40, 80];
  const TEAM_CLASS = { 100: "blue", 200: "red" };
  const TEAM_ORDER = [200, 100]; // comme dans la vidéo : ROUGE en haut
  const TEAM_LABEL = { 100: "BLUE", 200: "RED" };
  const STACKABLE = new Set([2003, 2055, 2031, 2033, 2138, 2139, 2140, 2150, 2151, 2152, 2010]);

  // Bâtiments de la Faille de l'invocateur (coordonnées jeu)
  const BUILDINGS = [
    // Équipe bleue (100)
    t(100, "TOP_LANE", "OUTER_TURRET", 981, 10441), t(100, "TOP_LANE", "INNER_TURRET", 1512, 6699), t(100, "TOP_LANE", "BASE_TURRET", 1169, 4287),
    t(100, "MID_LANE", "OUTER_TURRET", 5846, 6396), t(100, "MID_LANE", "INNER_TURRET", 5048, 4812), t(100, "MID_LANE", "BASE_TURRET", 3651, 3696),
    t(100, "BOT_LANE", "OUTER_TURRET", 10504, 1029), t(100, "BOT_LANE", "INNER_TURRET", 6919, 1483), t(100, "BOT_LANE", "BASE_TURRET", 4281, 1253),
    t(100, "MID_LANE", "NEXUS_TURRET", 1748, 2270), t(100, "MID_LANE", "NEXUS_TURRET", 2177, 1807),
    i(100, "TOP_LANE", 1171, 3571), i(100, "MID_LANE", 3203, 3208), i(100, "BOT_LANE", 3452, 1236),
    { team: 100, kind: "nexus", x: 1550, y: 1650 },
    // Équipe rouge (200)
    t(200, "TOP_LANE", "OUTER_TURRET", 4318, 13875), t(200, "TOP_LANE", "INNER_TURRET", 7943, 13411), t(200, "TOP_LANE", "BASE_TURRET", 10481, 13650),
    t(200, "MID_LANE", "OUTER_TURRET", 8955, 8510), t(200, "MID_LANE", "INNER_TURRET", 9767, 10113), t(200, "MID_LANE", "BASE_TURRET", 11134, 11207),
    t(200, "BOT_LANE", "OUTER_TURRET", 13866, 4505), t(200, "BOT_LANE", "INNER_TURRET", 13327, 8226), t(200, "BOT_LANE", "BASE_TURRET", 13624, 10572),
    t(200, "MID_LANE", "NEXUS_TURRET", 12611, 13084), t(200, "MID_LANE", "NEXUS_TURRET", 13052, 12612),
    i(200, "TOP_LANE", 11261, 13676), i(200, "MID_LANE", 11598, 11667), i(200, "BOT_LANE", 13604, 11316),
    { team: 200, kind: "nexus", x: 13250, y: 13230 },
  ];
  function t(team, lane, tier, x, y) { return { team, kind: "tower", lane, tier, x, y }; }
  function i(team, lane, x, y) { return { team, kind: "inhib", lane, x, y }; }

  const DRAGON_COLORS = {
    CHEMTECH_DRAGON: "#40f80f", HEXTECH_DRAGON: "#5b93c4", FIRE_DRAGON: "#ee3a39",
    EARTH_DRAGON: "#a3776a", WATER_DRAGON: "#009788", AIR_DRAGON: "#42a5f6", ELDER_DRAGON: "#f0d77c",
  };
  const DRAGON_NAMES = {
    CHEMTECH_DRAGON: "Chemtech", HEXTECH_DRAGON: "Hextech", FIRE_DRAGON: "Infernal",
    EARTH_DRAGON: "Mountain", WATER_DRAGON: "Ocean", AIR_DRAGON: "Cloud", ELDER_DRAGON: "Elder",
  };
  const EPIC_INFO = {
    HORDE: { name: "Voidgrubs", color: "#b56cf0" },
    RIFTHERALD: { name: "Rift Herald", color: "#b56cf0" },
    BARON_NASHOR: { name: "Baron Nashor", color: "#b56cf0" },
    ATAKHAN: { name: "Atakhan", color: "#e0485a" },
  };
  const FX_COLORS = { DRAGON: "#f08a24", BARON_NASHOR: "#b56cf0", RIFTHERALD: "#b56cf0", HORDE: "#b56cf0", ATAKHAN: "#e0485a" };

  const SVG = {
    drake: (c) => `<svg viewBox="0 0 24 24"><path fill="${c}" d="M12 2l3.6 6.2L22 6l-3.4 7.2L20 21l-8-4-8 4 1.4-7.8L2 6l6.4 2.2z"/></svg>`,
    HORDE: (c) => `<svg viewBox="0 0 24 24" fill="${c}"><ellipse cx="12" cy="14" rx="6.5" ry="6"/><circle cx="12" cy="6.5" r="3.5"/><path d="M3 10l3 2M21 10l-3 2M3 18l3-1.5M21 18l-3-1.5" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
    RIFTHERALD: (c) => `<svg viewBox="0 0 24 24"><path fill="${c}" d="M1.5 12Q12 1.5 22.5 12Q12 22.5 1.5 12z"/><circle cx="12" cy="12" r="4" fill="#15151c"/><circle cx="12" cy="12" r="2" fill="${c}"/></svg>`,
    BARON_NASHOR: (c) => `<svg viewBox="0 0 24 24"><path fill="${c}" d="M3 21l1.6-14 4.4 5L12 3l3 9 4.4-5L21 21z"/></svg>`,
    ATAKHAN: (c) => `<svg viewBox="0 0 24 24"><path fill="${c}" d="M12 2c5 5 7 9 5 14-1 3-3 5-5 6-2-1-4-3-5-6-2-5 0-9 5-14z"/></svg>`,
    generic: (c) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="${c}"/></svg>`,
    tower: `<svg viewBox="0 0 24 24"><path fill="currentColor" stroke="#0b0b10" stroke-width="1.4" d="M12 1.5l4 4.2v3.6l2.6 2.2-2.6 2.2V20l-4 2.5L8 20v-6.3L5.4 11.5 8 9.3V5.7z"/></svg>`,
    inhib: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#0b0b10" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`,
    nexus: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3.2 2.2"/><circle cx="12" cy="12" r="7" fill="currentColor" stroke="#0b0b10" stroke-width="1"/><circle cx="12" cy="12" r="3" fill="#0b0b10"/></svg>`,
    kill: (c) => `<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="#0b0b10" stroke-width="5" stroke-linecap="round"/><path d="M5 5l14 14M19 5L5 19" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  };

  // ------------------------------------------------------------------ état
  const $ = (s) => document.querySelector(s);
  const S = { game: null, t: 0, playing: false, speed: 20, last: 0, rows: {}, champs: {}, blds: [], fx: new Map(), heads: {}, mons: [], recalls: new Map(), events: null, bubbles: new Map(), hoverEv: null };
  const MONSTER_SOON = 90000; // affiche l'icône (pointillés + compte à rebours) 90 s avant l'apparition

  // ------------------------------------------------------------------ utilitaires
  const toPx = (x, y) => [
    ((x - MAP_MIN.x) / (MAP_MAX.x - MAP_MIN.x)) * MAP_PX,
    MAP_PX - ((y - MAP_MIN.y) / (MAP_MAX.y - MAP_MIN.y)) * MAP_PX,
  ];
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const fmtGold = (g) => Math.round(g).toLocaleString("en-US");
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const teamColor = (team) => getComputedStyle(document.documentElement).getPropertyValue(team === 100 ? "--blue" : "--red").trim();

  /** dernier index i tel que arr[i][0] <= t (arr trié) */
  function lastIdx(arr, t, key = (a) => a[0]) {
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (key(arr[m]) <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function interpSeries(times, values, t) {
    const k = lastIdx(times, t, (x) => x);
    if (k < 0) return values[0];
    if (k >= times.length - 1) return values[values.length - 1];
    const f = (t - times[k]) / (times[k + 1] - times[k]);
    return values[k] + (values[k + 1] - values[k]) * f;
  }
  function interpTrack(track, t) {
    if (!track.length) return null;
    const k = lastIdx(track, t);
    if (k < 0) return [track[0][1], track[0][2]];
    if (k >= track.length - 1) return [track[k][1], track[k][2]];
    const a = track[k], b = track[k + 1];
    const f = (t - a[0]) / Math.max(1, b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // ------------------------------------------------------------------ chargement
  const CACHE = {};
  async function fetchGame(id) {
    if (CACHE[id]) return CACHE[id];
    const q = encodeURIComponent(id);
    for (const url of [`../replay_api?id=${q}`, `../replays/${q}.json`]) {
      try { const r = await fetch(url); if (r.ok) return (CACHE[id] = await r.json()); } catch (_) { /* source suivante */ }
    }
    throw new Error(`Partie ${id} introuvable`);
  }

  function message(html) {
    S.game = null; S.events = null; setPlaying(false);
    $("#teams").innerHTML = `<p class="msg">${html}</p>`;
  }

  async function loadGame(id) {
    try { init(await fetchGame(id)); return true; }
    catch (e) { console.error(e); message(`Impossible de charger la partie <code>${id.replace(/[<>&"]/g, "")}</code>.`); return false; }
  }

  // ------------------------------------------------------------------ initialisation d'une partie
  function init(game) {
    S.game = game; S.t = 0; S.fx.forEach((e) => e.remove()); S.fx.clear();
    setPlaying(false);
    game.byPid = Object.fromEntries(game.participants.map((p) => [p.pid, p]));
    game.kills.sort((a, b) => a.t - b.t);

    $("#map-img").src = `${game.ddragon}/img/map/map11.png`;
    buildPanel(game);
    buildBuildings(game);
    buildChamps(game);
    buildMonsters(game);
    S.recalls.forEach((e) => e.remove()); S.recalls.clear();
    buildMarkers(game);
    buildEvents(game);
    buildGoldGraph(game);
    render();
  }

  function buildPanel(game) {
    const root = $("#teams"); root.innerHTML = ""; S.rows = {}; S.heads = {};
    // objectifs épiques affichés : grubs, herald, baron + tout autre type présent dans la partie
    const epicTypes = ["HORDE", "RIFTHERALD", "BARON_NASHOR"];
    game.objectives.forEach((o) => { if (o.type !== "DRAGON" && !epicTypes.includes(o.type)) epicTypes.push(o.type); });
    game.epicTypes = epicTypes;

    TEAM_ORDER.forEach((team, ti) => {
      const cls = TEAM_CLASS[team];
      const head = el("div", `team-head ${cls}`);
      head.innerHTML = `
        <div class="tname"><span>${TEAM_LABEL[team]}</span><span class="drakes"></span></div>
        <div class="epics">${epicTypes.map((ty) => {
          const info = EPIC_INFO[ty] || { name: ty, color: "#b56cf0" };
          return `<span class="epic" data-type="${ty}" data-tip="${info.name}">${(SVG[ty] || SVG.generic)(info.color)}<b>0</b></span>`;
        }).join("")}</div>
        <div class="col">${ti === 0 ? "KDA" : ""}</div><div class="col">${ti === 0 ? "CS" : ""}</div><div class="col gold-h">${ti === 0 ? "GOLD" : ""}</div>`;
      root.appendChild(head);
      S.heads[team] = { drakes: head.querySelector(".drakes"), epics: head.querySelectorAll(".epic"), key: "" };

      const block = el("div", "team-rows");
      game.participants.filter((p) => p.team === team).forEach((p) => {
        const row = el("div", `row ${cls}`);
        const spells = p.spells.map((s) => s ? `<img src="${s.icon}" alt="" data-tip="${s.name}">` : `<span class="slot"></span>`).join("");
        row.innerHTML = `
          <div class="rune" data-tip="${p.keystone ? p.keystone.name : ""}">
            ${p.keystone ? `<img class="ks" src="${p.keystone.icon}" alt="">` : ""}
            ${p.secondary ? `<img class="sec" src="${p.secondary.icon}" alt="">` : ""}
          </div>
          <div class="spells">${spells}</div>
          <div class="lvl">1</div>
          <div class="portrait" data-pid="${p.pid}"><img src="${p.champIcon}" alt="${p.champ}"><span class="respawn"></span></div>
          <div class="items"></div>
          <div class="trinket"></div>
          <div class="kda">0/0/0</div>
          <div class="cs">0</div>
          <div class="gold">0</div>`;
        block.appendChild(row);
        S.rows[p.pid] = {
          row, lvl: row.querySelector(".lvl"), items: row.querySelector(".items"), trinket: row.querySelector(".trinket"),
          kda: row.querySelector(".kda"), cs: row.querySelector(".cs"), gold: row.querySelector(".gold"),
          respawn: row.querySelector(".respawn"), itemsKey: null, prevItems: new Set(), cache: {},
        };
      });
      root.appendChild(block);
    });
  }

  function buildBuildings(game) {
    const layer = $("#layer-buildings"); layer.innerHTML = "";
    S.blds = BUILDINGS.map((b) => ({ ...b, downs: [], plates: [] }));
    const dist = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const kindOf = (k) => (k === "TOWER_BUILDING" ? "tower" : k === "INHIBITOR_BUILDING" ? "inhib" : "nexus");

    game.buildings.forEach((ev) => {
      const kind = kindOf(ev.kind);
      const cands = S.blds.filter((b) => b.team === ev.team && b.kind === kind);
      if (!cands.length) return;
      const b = cands.reduce((best, c) => (dist(c, ev) < dist(best, ev) ? c : best));
      b.downs.push([ev.t, kind === "inhib" ? ev.t + INHIB_RESPAWN : Infinity]);
      ev.bx = b.x; ev.by = b.y;
    });
    game.plates.forEach((ev) => {
      const b = S.blds.find((x) => x.team === ev.team && x.tier === "OUTER_TURRET" && x.lane === ev.lane);
      if (b) b.plates.push(ev.t);
    });
    if (!game.surrender && game.winner) {
      const nex = S.blds.find((b) => b.kind === "nexus" && b.team !== game.winner);
      nex.downs.push([game.duration, Infinity]);
    }

    S.blds.forEach((b) => {
      const d = el("div", `bld ${b.kind} ${TEAM_CLASS[b.team]}`, SVG[b.kind]);
      if (b.tier === "OUTER_TURRET") { b.plateEl = el("span", "plates"); d.appendChild(b.plateEl); }
      const [px, py] = toPx(b.x, b.y);
      d.style.left = `${px}px`; d.style.top = `${py}px`;
      b.el = d; layer.appendChild(d);
    });
  }

  function buildChamps(game) {
    const layer = $("#layer-champs"); layer.innerHTML = ""; S.champs = {};
    // les rouges sont dessinés au-dessus des bleus, comme la vidéo
    [...game.participants].sort((a, b) => a.team - b.team).forEach((p) => {
      const c = el("div", `champ ${TEAM_CLASS[p.team]}`, `<img src="${p.champIcon}" alt="">`);
      c.dataset.pid = p.pid;
      layer.appendChild(c);
      S.champs[p.pid] = c;
    });
  }

  // Icônes des dragons élémentaires (viewer/img/drakes) ; Ancien / type inconnu : SVG de secours
  const DRAKE_ICONS = new Set(["WATER_DRAGON", "FIRE_DRAGON", "AIR_DRAGON", "EARTH_DRAGON", "HEXTECH_DRAGON", "CHEMTECH_DRAGON"]);
  function drakeIcon(sub) {
    if (DRAKE_ICONS.has(sub)) return `<img class="drake-ico" src="img/drakes/${sub}.png" alt="">`;
    return SVG.drake(DRAGON_COLORS[sub] || "#9a9aaa");
  }

  function monsterLook(m) {
    if (m.type === "DRAGON") {
      const c = DRAGON_COLORS[m.sub] || "#9a9aaa";
      return { color: c, svg: drakeIcon(m.sub), name: m.sub ? `${DRAGON_NAMES[m.sub]} Drake` : "Dragon" };
    }
    const info = EPIC_INFO[m.type] || { name: m.type, color: "#b56cf0" };
    return { color: info.color, svg: (SVG[m.type] || SVG.generic)(info.color), name: info.name };
  }

  function buildMonsters(game) {
    const layer = $("#layer-monsters"); layer.innerHTML = "";
    S.mons = (game.monsters || []).map((m) => {
      const look = monsterLook(m);
      const e = el("div", "mon off", look.svg);
      e.style.color = look.color;
      e.dataset.tip = `${look.name} · apparition ${fmtTime(m.spawn)}${m.end < game.duration ? ` → ${fmtTime(m.end)}` : ""}`;
      const [px, py] = toPx(m.x, m.y);
      e.style.left = `${px}px`; e.style.top = `${py}px`;
      const timer = el("span", "timer"); e.appendChild(timer);
      let badge = null;
      if (m.count) { badge = el("span", "badge", "<b></b>"); e.appendChild(badge); }
      layer.appendChild(e);
      return { m, e, timer, badge, state: "" };
    });
  }

  function renderMonsters(t) {
    const visible = [];
    S.mons.forEach((M) => {
      const { m, e } = M;
      let state = "off";
      if (t >= m.spawn && t < m.end) state = "alive";
      else if (t >= m.spawn - MONSTER_SOON && t < m.spawn) state = "soon";
      if (state !== M.state) { e.className = `mon ${state}`; M.state = state; }
      if (state === "off") return;
      visible.push(M);
      M.timer.textContent = state === "soon" ? fmtTime(m.spawn - t) : "";
      if (M.badge) M.badge.firstChild.textContent = m.count - (m.kills || []).filter((k) => k <= t).length;
    });
    // plusieurs monstres dans la même fosse : on les écarte horizontalement
    const groups = {};
    visible.forEach((M) => (groups[`${M.m.x},${M.m.y}`] ||= []).push(M));
    Object.values(groups).forEach((g) => g.forEach((M, k) => {
      M.e.style.transform = `translateX(${(k - (g.length - 1) / 2) * 40}px)`;
    }));
  }

  // Retours à la base : cercle blanc qui se remplit pendant la canalisation, puis s'estompe sur place
  const RECALL_R = 24, RECALL_C = 2 * Math.PI * RECALL_R;
  function renderRecalls(t) {
    const g = S.game;
    const fade = Math.min(30000, Math.max(2000, S.speed * 900));
    const active = new Set();
    (g.recalls || []).forEach((r, n) => {
      if (t < r.t0 || t >= r.t1 + fade) return;
      const key = `r${n}`; active.add(key);
      let e = S.recalls.get(key);
      if (!e) {
        e = el("div", "recall", `<svg viewBox="0 0 54 54"><circle class="bg" cx="27" cy="27" r="${RECALL_R}"/><circle class="arc" cx="27" cy="27" r="${RECALL_R}"/></svg>`);
        place(e, r.x, r.y);
        $("#layer-recalls").appendChild(e); S.recalls.set(key, e);
      }
      const p = Math.min(1, (t - r.t0) / (r.t1 - r.t0));
      e.querySelector(".arc").style.strokeDasharray = `${p * RECALL_C} ${RECALL_C}`;
      e.style.opacity = t < r.t1 ? 1 : 1 - (t - r.t1) / fade;
    });
    for (const [key, e] of S.recalls) if (!active.has(key)) { e.remove(); S.recalls.delete(key); }
  }

  // ------------------------------------------------------------------ bulles d'événements (barre de lecture)
  const LANE_FR = { TOP_LANE: "top", MID_LANE: "mid", BOT_LANE: "bot" };
  const TOWER_FR = { OUTER_TURRET: "Tour extérieure", INNER_TURRET: "Tour intérieure", BASE_TURRET: "Tour d'inhibiteur", NEXUS_TURRET: "Tour du Nexus" };
  const MULTI_FR = { 2: "DOUBLE KILL", 3: "TRIPLE KILL", 4: "QUADRA KILL", 5: "PENTAKILL" };
  const SWORDS = `<svg class="b-vs" viewBox="0 0 24 24"><path d="M4 3l9 9-2 2-9-9V3zM20 3h2v2l-6.5 6.5-2-2zM3 19l5-5 2 2-5 5H3zM14 16l2-2 6 6v2h-2z" fill="currentColor"/></svg>`;

  function buildEvents(game) {
    const ev = [];
    const specialAt = (pid, t) => game.specials.filter((s) => s.killer === pid && Math.abs(s.t - t) < 50);
    game.kills.forEach((k) => {
      const sp = specialAt(k.killer, k.t);
      let title = "";
      const multi = sp.find((s) => s.type === "KILL_MULTI");
      if (multi) title = MULTI_FR[multi.multi] || `${multi.multi}× KILL`;
      else if (sp.some((s) => s.type === "KILL_FIRST_BLOOD")) title = "PREMIER SANG";
      if (sp.some((s) => s.type === "KILL_ACE")) title = title ? `${title} · ACE` : "ACE";
      const team = game.byPid[k.killer]?.team ?? (game.byPid[k.victim].team === 100 ? 200 : 100);
      ev.push({ kind: "kill", t: k.t, team, data: k, title });
    });
    game.objectives.forEach((o) => ev.push({ kind: "obj", t: o.t, team: o.team, data: o }));
    game.buildings.forEach((b) => ev.push({ kind: "bld", t: b.t, team: b.team === 100 ? 200 : 100, data: b }));
    ev.sort((a, b) => a.t - b.t);
    S.events = ev;
    clearBubbles();
  }

  function champImg(pid, cls = "") {
    const p = S.game.byPid[pid];
    if (!p) return `<span class="b-champ none ${cls}">${SVG.tower}</span>`; // tour / sbires
    return `<img class="b-champ ${TEAM_CLASS[p.team]} ${cls}" src="${p.champIcon}" alt="${p.champ}" title="${p.champ}">`;
  }

  function bubbleHTML(e) {
    const d = e.data;
    let title = e.title || "", body = "", sub = "";
    if (e.kind === "kill") {
      body = `${champImg(d.killer)}${SWORDS}${champImg(d.victim, "victim")}`;
      const killer = S.game.byPid[d.killer], victim = S.game.byPid[d.victim];
      sub = `${killer ? killer.champ : "Exécuté"} → ${victim.champ}`;
      if (d.assists.length) body += `<span class="b-assists">${d.assists.map((a) => champImg(a, "mini")).join("")}</span>`;
    } else if (e.kind === "obj") {
      const look = monsterLook({ type: d.type, sub: d.sub });
      title = title || look.name.toUpperCase();
      body = `${champImg(d.killer)}${SWORDS}<span class="b-icon" style="color:${look.color}">${look.svg}</span>`;
      if (d.assists?.length) body += `<span class="b-assists">${d.assists.map((a) => champImg(a, "mini")).join("")}</span>`;
    } else {
      const isInhib = d.kind === "INHIBITOR_BUILDING";
      title = (isInhib ? "INHIBITEUR" : (TOWER_FR[d.tower] || "Tour").toUpperCase()) + (LANE_FR[d.lane] ? ` ${LANE_FR[d.lane].toUpperCase()}` : "");
      body = `${champImg(d.killer)}${SWORDS}<span class="b-icon ${TEAM_CLASS[d.team]}">${isInhib ? SVG.inhib : SVG.tower}</span>`;
    }
    return `${title ? `<div class="b-title">${title}</div>` : ""}<div class="b-body">${body}</div>${sub ? `<div class="b-sub">${sub}</div>` : ""}<span class="b-time">${fmtTime(e.t)}</span>`;
  }

  function placeBubbles(list) {
    // list : [{e, el}] → position horizontale (bornée aux bords) + empilement si chevauchement
    const W = $("#timebar").offsetWidth;
    const placed = [];
    list.forEach(({ e, el: b }) => {
      const x = (e.t / S.game.duration) * W;
      const half = b.offsetWidth / 2;
      const cx = Math.max(half, Math.min(W - half, x));
      let level = 0;
      while (placed.some((p) => p.level === level && Math.abs(p.cx - cx) < (p.half + half + 6))) level++;
      placed.push({ cx, half, level });
      b.style.left = `${cx}px`;
      b.style.bottom = `${8 + level * (b.offsetHeight + 6)}px`;
      b.style.setProperty("--arrow", `${x - cx}px`);
      b.classList.toggle("stacked", level > 0);
    });
  }

  // Bulles : déclenchées quand la lecture passe sur un événement, elles vivent
  // BUBBLE_MS en temps réel (même en pause), avec un fondu sur la fin.
  const BUBBLE_MS = 2500, BUBBLE_FADE = 0.15;
  function triggerBubbles(t0, t1) {
    if (!S.events || t1 <= t0) return;
    const now = performance.now();
    for (const e of S.events) {
      if (e.t > t1) break;
      if (e.t > t0 && !S.bubbles.has(e)) {
        const b = el("div", `bubble ${TEAM_CLASS[e.team]}`, bubbleHTML(e));
        b.born = now; $("#bubbles").appendChild(b); S.bubbles.set(e, b);
      }
    }
  }
  function clearBubbles() { S.bubbles.forEach((b) => b.remove()); S.bubbles.clear(); }
  function renderBubbles() {
    const now = performance.now();
    for (const [e, b] of S.bubbles) if (now - b.born >= BUBBLE_MS) { b.remove(); S.bubbles.delete(e); }
    // au plus 3 bulles : on garde les plus récentes
    const all = [...S.bubbles.keys()].sort((x, y) => x.t - y.t);
    all.slice(0, -3).forEach((e) => { S.bubbles.get(e).remove(); S.bubbles.delete(e); });
    $("#bubbles").style.visibility = S.hoverEv ? "hidden" : ""; // le survol a la priorité
    const list = all.slice(-3).map((e) => {
      const b = S.bubbles.get(e), f = (now - b.born) / BUBBLE_MS;
      b.style.opacity = f < 1 - BUBBLE_FADE ? 1 : (1 - f) / BUBBLE_FADE;
      return { e, el: b };
    });
    // les plus anciennes en bas, la plus récente au-dessus
    placeBubbles(list);
  }

  function setupHoverBubbles() {
    const seekEl = $("#seek"), hover = $("#hover-bubble");
    seekEl.addEventListener("mousemove", (ev) => {
      if (!S.events) return;
      const r = $("#timebar").getBoundingClientRect();
      const tAt = ((ev.clientX - r.left) / r.width) * S.game.duration;
      const tol = (7 / r.width) * S.game.duration; // 7 px écran autour du curseur
      const near = S.events.filter((e) => Math.abs(e.t - tAt) <= tol);
      if (!near.length) { hideHover(); return; }
      const best = near.reduce((a, b) => (Math.abs(b.t - tAt) < Math.abs(a.t - tAt) ? b : a));
      // regroupe les événements simultanés (teamfight) autour du plus proche
      const group = S.events.filter((e) => Math.abs(e.t - best.t) <= 3000).slice(0, 5);
      S.hoverEv = best;
      hover.innerHTML = group.map((e) => `<div class="bubble static ${TEAM_CLASS[e.team]}">${bubbleHTML(e)}</div>`).join("");
      hover.hidden = false;
      const W = $("#timebar").offsetWidth, x = (best.t / S.game.duration) * W;
      const half = hover.offsetWidth / 2, cx = Math.max(half, Math.min(W - half, x));
      hover.style.left = `${cx}px`;
      hover.style.setProperty("--arrow", `${x - cx}px`);
      renderBubbles();
    });
    seekEl.addEventListener("mouseleave", hideHover);
    function hideHover() {
      if (!S.hoverEv) return;
      S.hoverEv = null; hover.hidden = true; renderBubbles();
    }
  }

  // ------------------------------------------------------------------ courbe d'écart d'or
  // diff > 0 : l'équipe rouge mène (affichée en haut, comme dans le panneau)
  function goldDiffAt(game, t) {
    let d = 0;
    game.participants.forEach((p) => {
      const v = interpSeries(game.frameTimes, game.gold[p.pid], t);
      d += p.team === 200 ? v : -v;
    });
    return d;
  }
  const GG = { W: 630, H: 86, X0: 56, X1: 606, PAD: 8 };
  function buildGoldGraph(game) {
    const root = $("#goldgraph");
    const diffs = game.frameTimes.map((t) => goldDiffAt(game, t));
    const end = goldDiffAt(game, game.duration);
    const pts = game.frameTimes.map((t, i) => [t, diffs[i]]);
    if (pts[pts.length - 1][0] < game.duration) pts.push([game.duration, end]);
    const max = Math.max(1000, ...pts.map((p) => Math.abs(p[1])));
    const mid = GG.H / 2, amp = mid - GG.PAD;
    const X = (t) => GG.X0 + (t / game.duration) * (GG.X1 - GG.X0);
    const Y = (d) => mid - (d / max) * amp;
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    const area = `${line}L${X(game.duration).toFixed(1)},${mid}L${GG.X0},${mid}Z`;
    const k = (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
    root.innerHTML = `
      <svg viewBox="0 0 ${GG.W} ${GG.H}" width="${GG.W}" height="${GG.H}">
        <defs>
          <clipPath id="gg-top"><rect x="0" y="0" width="${GG.W}" height="${mid}"/></clipPath>
          <clipPath id="gg-bot"><rect x="0" y="${mid}" width="${GG.W}" height="${mid}"/></clipPath>
          <clipPath id="gg-past"><rect id="gg-past-rect" x="0" y="0" width="0" height="${GG.H}"/></clipPath>
        </defs>
        <text class="gg-label" x="18" y="${mid - 2}">ÉCART</text><text class="gg-label" x="18" y="${mid + 11}">D'OR</text>
        <text class="gg-scale red" x="${GG.X0 - 6}" y="${GG.PAD + 7}">+${k(max)}</text>
        <text class="gg-scale blue" x="${GG.X0 - 6}" y="${GG.H - GG.PAD + 1}">+${k(max)}</text>
        ${Array.from({ length: Math.floor(game.duration / 300000) }, (_, i) => (i + 1) * 300000).map((tt) =>
          `<line class="gg-grid" x1="${X(tt).toFixed(1)}" x2="${X(tt).toFixed(1)}" y1="${GG.PAD}" y2="${GG.H - GG.PAD}"/><text class="gg-min" x="${(X(tt) + 3).toFixed(1)}" y="${GG.H - 3}">${tt / 60000}'</text>`).join("")}
        <line class="gg-zero" x1="${GG.X0}" x2="${GG.X1}" y1="${mid}" y2="${mid}"/>
        <g class="gg-future">
          <path d="${area}" class="gg-fill red" clip-path="url(#gg-top)"/>
          <path d="${area}" class="gg-fill blue" clip-path="url(#gg-bot)"/>
        </g>
        <g clip-path="url(#gg-past)">
          <path d="${area}" class="gg-fill red" clip-path="url(#gg-top)"/>
          <path d="${area}" class="gg-fill blue" clip-path="url(#gg-bot)"/>
          <path d="${line}" class="gg-line red" clip-path="url(#gg-top)"/>
          <path d="${line}" class="gg-line blue" clip-path="url(#gg-bot)"/>
        </g>
        <line id="gg-cursor" class="gg-cursor" x1="0" x2="0" y1="1" y2="${GG.H - 1}"/>
        <circle id="gg-dot" r="2.6"/>
      </svg>`;
    S.gg = { X, Y, cursor: root.querySelector("#gg-cursor"), dot: root.querySelector("#gg-dot"), past: root.querySelector("#gg-past-rect") };

    // survol : valeur à l'instant pointé ; clic : aller à cet instant
    const svg = root.querySelector("svg");
    const timeAt = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * GG.W;
      return Math.max(0, Math.min(1, (x - GG.X0) / (GG.X1 - GG.X0))) * game.duration;
    };
    svg.onmousemove = (ev) => {
      const t = timeAt(ev), d = goldDiffAt(game, t);
      const who = Math.abs(d) < 1 ? "Égalité" : `<span style="color:${teamColor(d > 0 ? 200 : 100)}">${d > 0 ? "RED" : "BLUE"} +${fmtGold(Math.abs(d))}</span>`;
      root.dataset.tip = `<b>${fmtTime(t)}</b> · ${who}`;
    };
    svg.onclick = (ev) => seek(timeAt(ev));
  }

  function renderGold(t) {
    const g = S.game, d = goldDiffAt(g, t);
    const fmtLead = (v) => (v >= 1000 ? `+${(v / 1000).toFixed(1)}k` : `+${Math.round(v)}`);
    const lead = Math.abs(d) >= 1 ? fmtLead(Math.abs(d)) : "";
    $("#lead-red").textContent = d > 0 ? lead : "";
    $("#lead-blue").textContent = d < 0 ? lead : "";
    if (S.gg) {
      const x = S.gg.X(t), y = S.gg.Y(d);
      S.gg.cursor.setAttribute("x1", x); S.gg.cursor.setAttribute("x2", x);
      S.gg.dot.setAttribute("cx", x); S.gg.dot.setAttribute("cy", y);
      S.gg.dot.setAttribute("class", d >= 0 ? "red" : "blue");
      S.gg.past.setAttribute("width", x);
    }
  }

  function buildMarkers(game) {
    const root = $("#markers"); root.innerHTML = "";
    const pct = (t) => `${(t / game.duration) * 100}%`;
    game.kills.forEach((k) => {
      const team = game.byPid[k.killer]?.team ?? (game.byPid[k.victim].team === 100 ? 200 : 100);
      const m = el("div", `mk ${TEAM_CLASS[team]}`); m.style.left = pct(k.t); root.appendChild(m);
    });
    game.buildings.forEach((b) => {
      const m = el("div", "mk bld"); m.style.left = pct(b.t);
      m.style.background = teamColor(b.team === 100 ? 200 : 100); root.appendChild(m);
    });
    game.objectives.forEach((o) => {
      const m = el("div", "mk obj"); m.style.left = pct(o.t);
      m.style.background = o.type === "DRAGON" ? (DRAGON_COLORS[o.sub] || FX_COLORS.DRAGON) : (FX_COLORS[o.type] || "#b56cf0");
      root.appendChild(m);
    });
  }

  // ------------------------------------------------------------------ rendu
  function isDead(pid, t) {
    for (const [d0, d1] of S.game.deaths[pid]) if (t >= d0 && t < d1) return d1;
    return 0;
  }

  function render() {
    const g = S.game; if (!g) return;
    const t = S.t;
    $("#clock").textContent = fmtTime(t);
    $("#progress").style.width = `${(t / g.duration) * 100}%`;
    $("#seek").value = Math.round((t / g.duration) * 1000);

    // ---- KDA & score
    const kda = {}; g.participants.forEach((p) => (kda[p.pid] = [0, 0, 0]));
    const score = { 100: 0, 200: 0 };
    for (const k of g.kills) {
      if (k.t > t) break;
      kda[k.victim][1]++;
      if (kda[k.killer]) { kda[k.killer][0]++; score[g.byPid[k.killer].team]++; }
      k.assists.forEach((a) => kda[a] && kda[a][2]++);
    }
    $("#score-red").textContent = score[200];
    $("#score-blue").textContent = score[100];
    renderGold(t);

    // ---- lignes joueurs
    g.participants.forEach((p) => {
      const R = S.rows[p.pid], pid = p.pid;
      const lv = g.levels[pid][Math.max(0, lastIdx(g.levels[pid], t))][1];
      setText(R, "lvl", lv);
      setText(R, "kda", kda[pid].join("/"));
      setText(R, "cs", Math.floor(interpSeries(g.frameTimes, g.cs[pid], t)));
      setText(R, "gold", fmtGold(interpSeries(g.frameTimes, g.gold[pid], t)));
      const respawn = isDead(pid, t);
      R.row.classList.toggle("dead", !!respawn);
      if (respawn) R.respawn.textContent = Math.ceil((respawn - t) / 1000);
      renderItems(R, g.items[pid][Math.max(0, lastIdx(g.items[pid], t))]);
    });

    // ---- en-têtes d'équipe (dragons, objectifs)
    TEAM_ORDER.forEach((team) => {
      const H = S.heads[team];
      const objs = g.objectives.filter((o) => o.t <= t && o.team === team);
      const key = objs.length;
      if (H.key === key) return;
      H.key = key;
      H.drakes.innerHTML = objs.filter((o) => o.type === "DRAGON")
        .map((o) => `<span data-tip="${DRAGON_NAMES[o.sub] || o.sub} Drake · ${fmtTime(o.t)}">${drakeIcon(o.sub)}</span>`).join("");
      // DRAGON_SOUL_GIVEN a souvent teamId = 0 : l'âme revient à l'équipe qui a 4 dragons élémentaires
      const elemDrakes = objs.filter((o) => o.type === "DRAGON" && o.sub !== "ELDER_DRAGON").length;
      const soul = g.souls.find((s) => s.t <= t && (s.team ? s.team === team : elemDrakes >= 4));
      if (soul) H.drakes.insertAdjacentHTML("beforeend", `<span class="muted" style="font-size:10px;color:var(--gold)" data-tip="Dragon Soul">${soul.name} soul</span>`);
      H.epics.forEach((e) => {
        const n = objs.filter((o) => o.type === e.dataset.type).length;
        e.querySelector("b").textContent = n; e.classList.toggle("has", n > 0);
      });
    });

    // ---- bâtiments
    S.blds.forEach((b) => {
      const down = b.downs.some(([d0, d1]) => t >= d0 && t < d1);
      b.el.classList.toggle("down", down);
      if (b.plateEl) {
        const left = 5 - b.plates.filter((pt) => pt <= t).length;
        b.plateEl.textContent = t < PLATES_FALL_AT && !down ? left : "";
      }
    });

    // ---- champions sur la carte
    g.participants.forEach((p) => {
      const c = S.champs[p.pid];
      const dead = isDead(p.pid, t);
      c.classList.toggle("hidden", !!dead);
      if (dead) return;
      const pos = interpTrack(g.tracks[p.pid], t);
      if (!pos) return;
      const [px, py] = toPx(pos[0], pos[1]);
      c.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    });

    renderMonsters(t);
    renderRecalls(t);
    renderFx(t);

    // ---- bannière de fin
    const banner = $("#banner");
    if (t >= g.duration && g.winner) {
      banner.hidden = false;
      banner.textContent = `VICTOIRE ${g.winner === 100 ? "BLEUE" : "ROUGE"}${g.surrender ? " (reddition)" : ""}`;
      banner.style.color = teamColor(g.winner);
    } else banner.hidden = true;
  }

  function setText(R, key, val) {
    if (R.cache[key] === val) return;
    R.cache[key] = val; R[key].textContent = val;
  }

  function renderItems(R, snap) {
    const [, items, trinket] = snap;
    const key = items.join(",") + "|" + trinket;
    if (R.itemsKey === key) return;
    const first = R.itemsKey === null || !S.playing; // pas d'animation lors d'un seek
    R.itemsKey = key;
    const g = S.game;
    // regroupe les consommables empilables
    const slots = [];
    items.forEach((id) => {
      const s = STACKABLE.has(id) && slots.find((x) => x.id === id);
      if (s) s.n++; else slots.push({ id, n: 1 });
    });
    const img = (id) => `<img src="${g.ddragon}/img/item/${id}.png" alt="">`;
    const now = new Set(slots.map((s) => s.id));
    let html = "";
    for (let k = 0; k < 6; k++) {
      const s = slots[k];
      if (!s) { html += `<span class="slot"></span>`; continue; }
      const isNew = !first && !R.prevItems.has(s.id);
      html += `<span class="slot${isNew ? " new" : ""}" data-tip="${g.itemNames[s.id] || s.id}">${img(s.id)}${s.n > 1 ? `<span class="count">${s.n}</span>` : ""}</span>`;
    }
    R.items.innerHTML = html;
    R.trinket.innerHTML = trinket ? `<span class="slot" data-tip="${g.itemNames[trinket] || trinket}">${img(trinket)}</span>` : `<span class="slot"></span>`;
    R.prevItems = now;
  }

  // effets temporaires (kills, objectifs, bâtiments) — fonction pure du temps, donc compatible avec le seek
  function renderFx(t) {
    const g = S.game;
    const D = Math.min(90000, Math.max(6000, S.speed * 1800)); // durée de vie en temps de jeu
    const active = new Map();
    const push = (key, t0, make) => { if (t >= t0 && t < t0 + D) active.set(key, { t0, make }); };

    g.kills.forEach((k, n) => push(`k${n}`, k.t, () => {
      const team = g.byPid[k.killer]?.team ?? (g.byPid[k.victim].team === 100 ? 200 : 100);
      const e = el("div", "fx kill", SVG.kill(teamColor(team)));
      place(e, k.x, k.y); return e;
    }));
    g.objectives.forEach((o, n) => push(`o${n}`, o.t, () => {
      const e = el("div", "fx ring");
      e.style.color = o.type === "DRAGON" ? FX_COLORS.DRAGON : (FX_COLORS[o.type] || "#b56cf0");
      e.dataset.grow = "1"; place(e, o.x, o.y); return e;
    }));
    g.buildings.forEach((b, n) => push(`b${n}`, b.t, () => {
      const e = el("div", "fx ring"); e.style.color = "#ffffff";
      e.dataset.grow = "1"; place(e, b.bx ?? b.x, b.by ?? b.y); return e;
    }));

    // supprime les effets expirés
    for (const [key, e] of S.fx) if (!active.has(key)) { e.remove(); S.fx.delete(key); }
    // crée / met à jour
    for (const [key, { t0, make }] of active) {
      let e = S.fx.get(key);
      if (!e) { e = make(); $("#layer-fx").appendChild(e); S.fx.set(key, e); }
      const f = (t - t0) / D;
      e.style.opacity = f < 0.75 ? 1 : 1 - (f - 0.75) / 0.25;
      if (e.dataset.grow) {
        const size = 26 + 34 * Math.min(1, f * 3);
        e.style.width = e.style.height = `${size}px`;
      } else {
        e.style.transform = `translate(-50%, -50%) scale(${f < 0.08 ? 0.4 + f * 7.5 : 1})`;
      }
    }
  }
  function place(e, x, y) { const [px, py] = toPx(x, y); e.style.left = `${px}px`; e.style.top = `${py}px`; }

  // ------------------------------------------------------------------ lecture
  function setPlaying(on) {
    S.playing = on;
    document.body.classList.toggle("playing", on);
    S.last = performance.now();
  }
  function tick(now) {
    if (S.playing && S.game) {
      const dt = Math.min(100, now - S.last);
      const prev = S.t;
      S.t = Math.min(S.game.duration, S.t + dt * S.speed);
      if (S.t >= S.game.duration) setPlaying(false);
      triggerBubbles(prev, S.t);
      render();
    }
    if (S.bubbles.size) renderBubbles();
    S.last = now;
    requestAnimationFrame(tick);
  }
  function seek(ms) { S.t = Math.max(0, Math.min(S.game.duration, ms)); clearBubbles(); render(); }

  function buildSpeeds() {
    const root = $("#speeds");
    SPEEDS.forEach((sp, k) => {
      const b = el("button", sp === S.speed ? "on" : "", `${sp}×`);
      b.title = `Vitesse ${sp}× (touche ${k + 1})`;
      b.onclick = () => setSpeed(sp);
      root.appendChild(b);
    });
  }
  function setSpeed(sp) {
    S.speed = sp;
    [...$("#speeds").children].forEach((b) => b.classList.toggle("on", b.textContent === `${sp}×`));
    render();
  }

  // ------------------------------------------------------------------ mise à l'échelle & tooltips
  function fit() {
    const st = $("#stage");
    const s = Math.min(innerWidth / 1280, innerHeight / 780);
    st.style.transform = `scale(${s})`;
    st.style.left = `${(innerWidth - 1280 * s) / 2}px`;
    st.style.top = `${(innerHeight - 780 * s) / 2}px`;
  }

  function setupTooltip() {
    const tip = $("#tooltip");
    document.addEventListener("mousemove", (ev) => {
      const target = ev.target.closest("[data-tip], .portrait, .champ");
      let html = "";
      if (target && S.game) {
        const pid = target.dataset.pid;
        if (pid) {
          const p = S.game.byPid[pid];
          html = `<b>${p.name}</b>${p.tag ? `<span class="muted">#${p.tag}</span>` : ""}<br>${p.champ} <span class="muted">· ${p.position || ""}</span>`;
        } else if (target.dataset.tip) html = target.dataset.tip;
      }
      if (!html) { tip.hidden = true; return; }
      tip.innerHTML = html; tip.hidden = false;
      tip.style.left = `${ev.clientX + 14}px`; tip.style.top = `${ev.clientY + 14}px`;
    });
  }

  // ------------------------------------------------------------------ démarrage
  function main() {
    fit(); addEventListener("resize", fit);
    buildSpeeds(); setupTooltip(); setupHoverBubbles();

    $("#btn-play").onclick = () => {
      if (!S.game) return;
      if (!S.playing && S.t >= S.game.duration) S.t = 0;
      setPlaying(!S.playing);
    };
    $("#seek").addEventListener("input", (e) => S.game && seek((e.target.value / 1000) * S.game.duration));
    addEventListener("keydown", (e) => {
      if (!S.game || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); $("#btn-play").click(); }
      else if (e.key === "ArrowRight") seek(S.t + 15000);
      else if (e.key === "ArrowLeft") seek(S.t - 15000);
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(S.game.duration);
      else if (/^[1-9]$/.test(e.key) && SPEEDS[+e.key - 1]) setSpeed(SPEEDS[+e.key - 1]);
    });

    // URL : index.html#<MATCH_ID>&t=<secondes>&speed=<x>  (ex. #EUW1_8052330346&t=1260)
    const fromHash = async () => {
      const [id, ...args] = location.hash.slice(1).split("&");
      const params = Object.fromEntries(args.map((kv) => kv.split("=")));
      if (!id) { message("Choisis une partie dans la liste au-dessus du replay."); return; }
      if ((S.game?.id !== id) && !(await loadGame(decodeURIComponent(id)))) return;
      if (params.speed && SPEEDS.includes(+params.speed)) setSpeed(+params.speed);
      if (params.t) seek(+params.t * 1000);
    };
    addEventListener("hashchange", fromHash);
    fromHash();
    requestAnimationFrame(tick);
  }

  main();
})();
