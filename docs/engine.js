// Hexaland — рушій гри в браузері (онлайн-версія).
// Порт класу Game із server.py: ті самі правила, режими, таймер, спецкарти, кубик — плюс боти.
// Рушій працює на пристрої хоста (ПК-стіл або телефон, що створив кімнату). Інші гравці підключаються
// через WebRTC (p2p.js), а екрани хоста (iframe) — напряму через window.HEXLOCAL (див. net.js).
(function (g) {
  "use strict";
  const MIN_PLAYERS = 2, MAX_PLAYERS = 8, HAND_SIZE = 3, EXTRA_CARDS = 12, SURVIVE_BONUS = 5;
  const BOARD_SIZES = { small: 3, medium: 4, large: 5 };
  const SIZE_NAMES = { small: "Мале", medium: "Середнє", large: "Велике" };
  const MODES = {
    classic: { name: "Класика", icon: "🏆", desc: "Виживає останній на полі" },
    team: { name: "Командна", icon: "🤝", desc: "Дві команди. Своїх не вибиваєш — перемагає команда, що вижила" },
    points: { name: "На очки", icon: "⭐", desc: `Очко за кожну пройдену карту, +${SURVIVE_BONUS} тим, хто вижив` },
  };
  const TIMERS = [0, 15, 30, 60];
  const TEAMS = [{ id: 0, name: "Сонце", icon: "☀️", hex: "#f2b43c" }, { id: 1, name: "Місяць", icon: "🌙", hex: "#7fb3ff" }];
  const REACTIONS = ["😂", "😱", "🔥", "👏", "😡", "🤔", "💀", "🎉"];
  const SPECIALS = {
    extra:   { name: "Ще хід", icon: "⚡", main: true, desc: "Після цієї карти ходиш ще раз" },
    swap:    { name: "Обмін", icon: "🔄", main: true, desc: "Міняєшся картами з наступним гравцем" },
    mirror:  { name: "Відбивач", icon: "↩️", main: true, tile: "mirror", desc: "Усі лінії розвертають назад — пастка для того, хто стоїть поруч" },
    portal:  { name: "Телепорт", icon: "🌀", main: true, desc: "Після ходу фішка стрибає у випадкову точку на краю. Рятує від вильоту" },
    highway: { name: "Магістраль", icon: "✳️", main: false, tile: "highway", desc: "Усі лінії прямі — наскрізь через центр" },
    corners: { name: "Кути", icon: "🌸", main: false, tile: "corners", desc: "Лінії огинають кути — короткі повороти" },
    thief:   { name: "Злодій", icon: "🦝", main: false, desc: "Забираєш випадкову карту в наступного гравця" },
    skip:    { name: "Пропуск", icon: "⏸️", main: false, desc: "Наступний гравець пропускає хід" },
  };
  const COLORS = [
    { id: "red", name: "Червоний", hex: "#e53935" }, { id: "orange", name: "Помаранчевий", hex: "#fb8c00" },
    { id: "yellow", name: "Жовтий", hex: "#fdd835" }, { id: "green", name: "Зелений", hex: "#43a047" },
    { id: "teal", name: "Бірюзовий", hex: "#00acc1" }, { id: "blue", name: "Синій", hex: "#1e88e5" },
    { id: "purple", name: "Фіолетовий", hex: "#8e24aa" }, { id: "pink", name: "Рожевий", hex: "#ec407a" },
  ];
  const BOT_NAMES = ["Біп", "Буп", "Ґвинтик", "Чіп", "Байт", "Піксель", "Робі", "Тостер"];
  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const SQRT3 = Math.sqrt(3);

  // ---------- допоміжне
  const rnd = n => Math.floor(Math.random() * n);
  const choice = a => a[rnd(a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const randId = n => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[rnd(36)]).join("");
  const err = message => ({ ok: false, error: message });
  const key = (q, r) => q + "," + r;
  const pkey = p => p.q + "," + p.r + "," + p.i;
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- геометрія
  const inBoard = (q, r, R) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= R;
  function boardCells(R) {
    const out = [];
    for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) if (inBoard(q, r, R)) out.push([q, r]);
    return out;
  }
  function pointXY(q, r, i) {
    const e = i >> 1, s = i & 1, cx = SQRT3 * (q + r / 2), cy = 1.5 * r;
    const a0 = Math.PI / 180 * (60 * e - 30), a1 = Math.PI / 180 * (60 * e + 30), t = (1 + s) / 3;
    const x0 = cx + Math.cos(a0), y0 = cy + Math.sin(a0), x1 = cx + Math.cos(a1), y1 = cy + Math.sin(a1);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  }
  function borderPoints(R) {
    const pts = [];
    for (const [q, r] of boardCells(R)) DIRS.forEach(([dq, dr], e) => {
      if (inBoard(q + dq, r + dr, R)) return;
      for (const s of [0, 1]) { const [x, y] = pointXY(q, r, e * 2 + s); pts.push([{ q, r, i: e * 2 + s }, Math.atan2(y, x)]); }
    });
    pts.sort((a, b) => a[1] - b[1]);
    return pts.map(p => p[0]);
  }
  function scatterPositions(n, R) {
    const border = borderPoints(R), total = border.length, step = total / n, jitter = Math.floor(step / 3), offset = rnd(total);
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(((offset + Math.round(i * step) + rnd(2 * jitter + 1) - jitter) % total + total) % total);
    return shuffle(idx).map(i => Object.assign({}, border[i]));
  }

  // ---------- карти
  function randomCard() {
    const pts = shuffle([...Array(12).keys()]), m = new Array(12);
    for (let k = 0; k < 12; k += 2) { m[pts[k]] = pts[k + 1]; m[pts[k + 1]] = pts[k]; }
    return m;
  }
  function specialTile(kind) {
    if (kind === "mirror") return [...Array(12).keys()].map(i => i ^ 1);
    if (kind === "highway") return [...Array(12).keys()].map(i => (i + 6) % 12);
    if (kind === "corners") return [...Array(12).keys()].map(i => i % 2 ? (i + 1) % 12 : (i + 11) % 12);
    return randomCard();
  }
  function rotMatch(m, rot) {
    const out = new Array(12);
    for (let a = 0; a < 12; a++) out[(a + 2 * rot) % 12] = (m[a] + 2 * rot) % 12;
    return out;
  }
  function trace(board, cards, q, r, i, R) {
    const segs = [];
    for (let n = 0; n < 1000; n++) {
      const t = board[key(q, r)];
      if (!t) return { alive: true, pos: { q, r, i }, segs };
      const j = rotMatch(cards[t[0]], t[1])[i];
      segs.push([q, r, i, j]);
      const e = j >> 1, s = j & 1, nq = q + DIRS[e][0], nr = r + DIRS[e][1];
      if (!inBoard(nq, nr, R)) return { alive: false, pos: { q, r, i: j }, segs };
      q = nq; r = nr; i = ((e + 3) % 6) * 2 + (1 - s);
    }
    return { alive: false, pos: { q, r, i }, segs };
  }

  // ---------- гра
  class Game {
    constructor() {
      this.phase = "lobby";
      this.players = new Map();
      this.tokens = new Map();
      this.subs = new Set();
      this.gameId = 0;
      this.lastReact = {};
      this.offlineSince = {};
      this.room = ""; this.joinUrl = ""; this.hostKind = "table";
      this.settings = { size: "small", mode: "classic", timer: 0, specials: Object.keys(SPECIALS).filter(k => SPECIALS[k].main) };
      this.resetRound();
      setInterval(() => this.tick(), 500);
    }
    get radius() { return BOARD_SIZES[this.settings.size]; }
    get teamMode() { return this.settings.mode === "team"; }
    teamOf(pid) { return this.players.get(pid).team || 0; }
    resetRound() {
      this.cards = {}; this.specials = {}; this.deck = []; this.hands = {}; this.board = {};
      this.order = []; this.turn = null; this.turnDeadline = null; this.skip = new Set();
      this.winners = []; this.winTeam = null; this.seq = 0; this.lastMove = null; this.dice = null;
      this.botTimer && clearTimeout(this.botTimer); this.botTimer = null;
    }

    publicState() {
      const ids = (this.order.length ? this.order : [...this.players.keys()]).filter(id => this.players.has(id));
      return {
        phase: this.phase, gameId: this.gameId,
        players: ids.map(id => {
          const p = this.players.get(id);
          return { id, name: p.name, color: p.color, team: p.team || 0, pos: p.pos, alive: p.alive, trail: p.trail,
                   score: p.score || 0, online: this.isOnline(id), bot: !!p.bot, handCount: (this.hands[id] || []).length };
        }),
        turn: this.turn,
        turnLeftMs: this.turnDeadline && this.phase === "game" ? Math.max(0, this.turnDeadline - Date.now()) : null,
        board: Object.entries(this.board).map(([k, [card, rot]]) => { const [q, r] = k.split(",").map(Number); return { q, r, card, rot }; }),
        cards: this.cards, specials: this.specials, deckCount: this.deck.length,
        winners: this.winners, winTeam: this.winTeam, lastMove: this.lastMove, dice: this.dice, settings: this.settings,
        options: {
          sizes: Object.entries(BOARD_SIZES).map(([id, radius]) => ({ id, name: SIZE_NAMES[id], radius, cells: boardCells(radius).length })),
          modes: Object.entries(MODES).map(([id, v]) => Object.assign({ id }, v)),
          timers: TIMERS, specials: Object.entries(SPECIALS).map(([id, v]) => Object.assign({ id }, v)),
          teams: TEAMS, reactions: REACTIONS,
        },
        colors: COLORS, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, boardRadius: this.radius,
        joinUrl: this.joinUrl, room: this.room, hostKind: this.hostKind,
        spectators: [...this.subs].filter(s => s.remote && !(s.pid && this.players.has(s.pid))).length,
      };
    }
    isOnline(pid) {
      const p = this.players.get(pid);
      if (!p) return false;
      if (p.bot) return true;
      for (const s of this.subs) if (s.pid === pid) return true;
      return false;
    }
    broadcast() {
      const base = JSON.stringify(this.publicState());
      for (const s of this.subs) {
        const st = JSON.parse(base);
        if (s.pid && this.hands[s.pid]) st.hand = this.hands[s.pid].slice();
        setTimeout(() => { try { s.onState(st); } catch (e) { console.error(e); } });
      }
      this.scheduleBots();
      if (this.onChange) setTimeout(() => this.onChange(JSON.parse(base)));
    }

    subscribe(token, onState, onReact, opts) {
      const s = { pid: this.tokens.get(token) || null, onState, onReact, remote: !!(opts && opts.remote) };
      this.subs.add(s); this.broadcast();
      return s;
    }
    unsubscribe(s) { if (this.subs.delete(s)) this.broadcast(); }
    tokenOf(pid) { for (const [t, p] of this.tokens) if (p === pid) return t; return null; }

    smallerTeam() {
      const c = [0, 0];
      for (const p of this.players.values()) c[p.team || 0]++;
      return c[0] <= c[1] ? 0 : 1;
    }
    join(token, name, color, bot) {
      name = String(name || "").split(/\s+/).filter(Boolean).join(" ").slice(0, 16);
      if (!name) return err("Введи ім'я");
      if (!COLORS.some(c => c.id === color)) return err("Вибери колір");
      let pid = token ? this.tokens.get(token) : null;
      const me = pid ? this.players.get(pid) : null;
      if (me && this.phase !== "lobby") return { ok: true, id: pid, token };
      if (!me && this.phase !== "lobby") return err("Гра вже йде — зачекай наступної");
      for (const p of this.players.values()) {
        if (p.id === pid) continue;
        if (p.color === color) return err("Цей колір уже зайнятий");
        if (p.name.toLowerCase() === name.toLowerCase()) return err("Таке ім'я вже є");
      }
      if (!me) {
        if (this.players.size >= MAX_PLAYERS) return err("Стіл заповнений");
        pid = randId(8); token = randId(20);
        this.tokens.set(token, pid);
        this.players.set(pid, { id: pid, name, color, team: this.smallerTeam(), pos: null, alive: true, trail: [], score: 0, bot: !!bot });
      } else { me.name = name; me.color = color; }
      this.broadcast();
      return { ok: true, id: pid, token };
    }
    addBot() {
      if (this.phase !== "lobby") return err("Ботів можна додати тільки в лобі");
      const used = new Set([...this.players.values()].map(p => p.color)), names = new Set([...this.players.values()].map(p => p.name));
      const color = COLORS.find(c => !used.has(c.id));
      if (!color) return err("Стіл заповнений");
      const name = "🤖 " + (BOT_NAMES.find(n => !names.has("🤖 " + n)) || "Бот");
      return this.join(null, name, color.id, true);
    }
    remove(pid) {
      this.players.delete(pid);
      for (const [t, p] of [...this.tokens]) if (p === pid) this.tokens.delete(t);
    }
    kick(pid) {
      if (this.phase !== "lobby" || !this.players.has(pid)) return err("Не можна");
      this.remove(pid); this.broadcast(); return { ok: true };
    }
    leave(token) {
      const pid = this.tokens.get(token);
      if (pid && this.phase === "lobby") { this.remove(pid); this.broadcast(); }
      return { ok: true };
    }
    setTeam(token, team, pid) {
      pid = this.players.has(pid) ? pid : this.tokens.get(token);
      if (!pid || this.phase !== "lobby") return err("Команду можна змінити тільки в лобі");
      if (team !== 0 && team !== 1) return err("Немає такої команди");
      this.players.get(pid).team = team; this.broadcast(); return { ok: true };
    }
    setSetting(k, v) {
      if (this.phase !== "lobby") return err("Налаштування можна міняти тільки в лобі");
      const s = this.settings;
      if (k === "size" && v in BOARD_SIZES) s.size = v;
      else if (k === "mode" && v in MODES) {
        if (v === "team" && s.mode !== "team") [...this.players.values()].forEach((p, n) => { p.team = n % 2; });
        s.mode = v;
      } else if (k === "timer" && TIMERS.includes(v)) s.timer = v;
      else if (k === "special" && v && v.id in SPECIALS) {
        const on = s.specials.filter(x => x !== v.id);
        if (v.on) on.push(v.id);
        s.specials = Object.keys(SPECIALS).filter(x => on.includes(x));
      } else return err("Невідоме налаштування");
      this.broadcast(); return { ok: true };
    }

    start() {
      if (this.players.size < MIN_PLAYERS) return err(`Потрібно щонайменше ${MIN_PLAYERS} гравці`);
      if (this.teamMode && new Set([...this.players.values()].map(p => p.team || 0)).size < 2)
        return err("У кожній команді має бути хоча б один гравець");
      this.resetRound();
      this.gameId++;
      const n = boardCells(this.radius).length + HAND_SIZE * this.players.size + EXTRA_CARDS;
      for (let k = 0; k < n; k++) this.cards["c" + k] = randomCard();
      const copies = this.settings.size === "large" ? 3 : 2;
      for (const kind of this.settings.specials) for (let k = 0; k < copies; k++) {
        const cid = `s_${kind}${k}`;
        this.cards[cid] = specialTile(SPECIALS[kind].tile || kind); this.specials[cid] = kind;
      }
      this.deck = shuffle(Object.keys(this.cards));
      this.order = shuffle([...this.players.keys()]);
      scatterPositions(this.order.length, this.radius).forEach((pos, k) => {
        const p = this.players.get(this.order[k]);
        Object.assign(p, { pos, alive: true, trail: [], score: 0 });
        this.hands[p.id] = this.deck.splice(-HAND_SIZE);
      });
      this.dice = { round: 1, pending: this.order.slice(), rolls: {}, all: {}, tied: [], tieValue: null, first: null };
      this.phase = "dice";
      this.broadcast();
      return { ok: true };
    }
    roll(token, everyone) {
      const d = this.dice;
      if (this.phase !== "dice" || !d || d.first) return err("Зараз не час кидати кубик");
      let who;
      if (everyone === true) who = d.pending.filter(p => !(p in d.rolls));
      else {
        const pid = typeof everyone === "string" ? everyone : this.tokens.get(token);
        if (!d.pending.includes(pid)) return err("Зараз перекидають інші гравці");
        if (pid in d.rolls) return err("Ти вже кинув");
        who = [pid];
      }
      for (const pid of who) { const v = 1 + rnd(6); d.rolls[pid] = v; (d.all[pid] = d.all[pid] || []).push(v); }
      if (d.pending.every(p => p in d.rolls)) {
        const top = Math.max(...d.pending.map(p => d.rolls[p]));
        const tied = d.pending.filter(p => d.rolls[p] === top);
        if (tied.length === 1) { d.first = tied[0]; const gid = this.gameId; setTimeout(() => this.begin(gid), 3200); }
        else Object.assign(d, { round: d.round + 1, pending: tied, rolls: {}, tied, tieValue: top });
      }
      this.broadcast();
      return { ok: true };
    }
    begin(gid) {
      if (this.gameId !== gid || this.phase !== "dice") return;
      const d = this.dice, first = d.first;
      const rest = this.order.filter(p => p !== first).map(p => [p, -(d.all[p] || [0])[0], Math.random()])
        .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
      let order = [first, ...rest];
      if (this.teamMode) {
        const lines = { 0: order.filter(p => this.teamOf(p) === 0), 1: order.filter(p => this.teamOf(p) === 1) };
        let t = this.teamOf(first); order = [];
        while (lines[0].length || lines[1].length) { if (lines[t].length) order.push(lines[t].shift()); t = 1 - t; }
      }
      this.order = order;
      this.phase = "game";
      this.setTurn(first);
      this.broadcast();
    }
    setTurn(pid) { this.turn = pid; const t = this.settings.timer; this.turnDeadline = t ? Date.now() + t * 1000 : null; }

    nextAlive(pid) {
      const n = this.order.length, k = this.order.indexOf(pid);
      for (let d = 1; d < n; d++) { const c = this.order[(k + d) % n]; if (this.players.get(c).alive) return c; }
      return null;
    }
    allies(a, b) { return this.teamMode && this.teamOf(a) === this.teamOf(b); }

    simulate(cell, card, rot, placer) {
      const board = Object.assign({}, this.board); board[key(cell[0], cell[1])] = [card, rot];
      const res = {};
      for (const pid of this.order) {
        const p = this.players.get(pid);
        if (!p.alive) continue;
        const { q, r, i } = p.pos;
        const t = (q === cell[0] && r === cell[1]) ? trace(board, this.cards, q, r, i, this.radius) : { alive: true, pos: { q, r, i }, segs: [] };
        res[pid] = { alive: t.alive, pos: t.pos, segs: t.segs, reason: t.alive ? null : "out", rescued: false };
      }
      if (this.specials[card] === "portal" && res[placer] && res[placer].reason === "out")
        Object.assign(res[placer], { alive: true, reason: null, rescued: true });
      const crashed = new Set(), spots = {};
      for (const [pid, x] of Object.entries(res)) if (x.alive && !x.rescued) (spots[pkey(x.pos)] = spots[pkey(x.pos)] || []).push(pid);
      for (const grp of Object.values(spots)) for (let a = 0; a < grp.length; a++) for (let b = a + 1; b < grp.length; b++)
        if (!this.allies(grp[a], grp[b])) { crashed.add(grp[a]); crashed.add(grp[b]); }
      const lines = {};
      for (const [pid, x] of Object.entries(res)) lines[pid] = new Set(x.segs.map(([q, r, a, b]) => `${q},${r},${Math.min(a, b)},${Math.max(a, b)}`));
      const movers = Object.keys(res).filter(pid => lines[pid].size);
      for (let a = 0; a < movers.length; a++) for (let b = a + 1; b < movers.length; b++) {
        const A = movers[a], B = movers[b];
        if (!this.allies(A, B) && [...lines[A]].some(x => lines[B].has(x))) { crashed.add(A); crashed.add(B); }
      }
      for (const pid of crashed) Object.assign(res[pid], { alive: false, reason: "crash", rescued: false });
      return { board, res };
    }

    place(token, card, rot, pidOverride, forced) {
      const pid = pidOverride || this.tokens.get(token);
      if (this.phase !== "game") return err("Гра не йде");
      if (pid !== this.turn) return err("Зараз не твій хід");
      let hand = this.hands[pid] || [];
      if (!hand.includes(card)) return err("Такої карти в тебе немає");
      rot = ((parseInt(rot, 10) || 0) % 6 + 6) % 6;
      const me = this.players.get(pid), cell = [me.pos.q, me.pos.r];
      const { board, res } = this.simulate(cell, card, rot, pid);
      if (!res[pid].alive && !forced) {
        for (const c of hand) for (let k = 0; k < 6; k++)
          if (!(c === card && k === rot) && this.simulate(cell, c, k, pid).res[pid].alive)
            return err("Так ти вибуваєш, а є безпечний варіант. Покрути карту або візьми іншу.");
      }
      const kind = this.specials[card];
      this.board = board;
      hand.splice(hand.indexOf(card), 1);
      const died = [], moves = {}, pointsMode = this.settings.mode === "points";
      for (const [qpid, x] of Object.entries(res)) {
        const p = this.players.get(qpid);
        p.pos = Object.assign({}, x.pos);
        if (x.segs.length) {
          p.trail.push(...x.segs.map(s => s.slice())); moves[qpid] = x.segs.map(s => s.slice());
          if (pointsMode) p.score = (p.score || 0) + x.segs.length;
        }
        if (!x.alive) { p.alive = false; died.push(qpid); this.deck.push(...(this.hands[qpid] || [])); this.hands[qpid] = []; }
      }
      if (died.length) shuffle(this.deck);
      let effect = null;
      if (kind === "portal" && me.alive) {
        const target = this.teleportTarget(pid);
        if (target) { effect = { kind: "portal", from: Object.assign({}, me.pos), to: target }; me.pos = target; }
        else if (res[pid].rescued) { me.alive = false; died.push(pid); this.deck.push(...this.hands[pid]); this.hands[pid] = []; }
      }
      if (me.alive) this.draw(pid);
      const nxt = this.nextAlive(pid);
      if (kind === "extra" && me.alive) effect = { kind: "extra" };
      else if (kind === "swap" && me.alive && nxt) { [this.hands[pid], this.hands[nxt]] = [this.hands[nxt], this.hands[pid]]; effect = { kind: "swap", with: nxt }; }
      else if (kind === "thief" && me.alive && nxt && (this.hands[nxt] || []).length) {
        const st = choice(this.hands[nxt]); this.hands[nxt].splice(this.hands[nxt].indexOf(st), 1); this.hands[pid].push(st);
        effect = { kind: "thief", from: nxt };
      } else if (kind === "skip" && nxt) { this.skip.add(nxt); effect = { kind: "skip", who: nxt }; }
      this.seq++;
      this.lastMove = { seq: this.seq, pid, q: cell[0], r: cell[1], card, special: kind || null, effect, auto: !!forced, moves, died };
      if (!this.checkEnd(died)) this.advance(kind === "extra" && me.alive);
      this.broadcast();
      return { ok: true };
    }
    teleportTarget(pid) {
      const taken = new Set([...this.players.values()].filter(p => p.id !== pid && p.alive && p.pos).map(p => pkey(p.pos)));
      const opts = [];
      for (const [q, r] of boardCells(this.radius)) {
        if (this.board[key(q, r)]) continue;
        DIRS.forEach(([dq, dr], e) => {
          if (inBoard(q + dq, r + dr, this.radius)) return;
          for (const s of [0, 1]) { const p = { q, r, i: e * 2 + s }; if (!taken.has(pkey(p))) opts.push(p); }
        });
      }
      return opts.length ? choice(opts) : null;
    }
    tick() {
      // хто відключився: у лобі — прибираємо через хвилину, у грі — ходимо за нього як бот
      const now = Date.now();
      for (const p of this.players.values()) {
        if (p.bot || this.isOnline(p.id)) { delete this.offlineSince[p.id]; continue; }
        if (!this.offlineSince[p.id]) this.offlineSince[p.id] = now;
      }
      const off = pid => this.offlineSince[pid] ? now - this.offlineSince[pid] : 0;
      if (this.phase === "lobby") {
        const gone = [...this.players.keys()].filter(pid => off(pid) > 60000);
        if (gone.length) { gone.forEach(pid => this.remove(pid)); this.broadcast(); }
      } else if (this.phase === "dice" && this.dice && !this.dice.first) {
        const late = this.dice.pending.find(pid => !(pid in this.dice.rolls) && off(pid) > 8000);
        if (late) this.roll(null, late);
      } else if (this.phase === "game" && this.turn && off(this.turn) > 20000 && !this.botTimer) {
        this.botMove(this.turn);
        return;
      }
      if (this.phase === "game" && this.turnDeadline && Date.now() >= this.turnDeadline) {
        const hand = this.hands[this.turn] || [];
        if (hand.length) this.place(null, choice(hand), rnd(6), this.turn, true);
        else { this.advance(false); this.broadcast(); }
      }
    }
    checkEnd(died) {
      const alive = this.order.filter(x => this.players.get(x).alive);
      const full = Object.keys(this.board).length === boardCells(this.radius).length;
      const mode = this.settings.mode;
      if (mode === "points") {
        if (!alive.length || (alive.length === 1 && this.order.length > 1) || full) { this.finishPoints(); return true; }
        return false;
      }
      if (mode === "team") {
        const ta = new Set(alive.map(x => this.teamOf(x)));
        if (!alive.length) { this.finish([]); return true; }
        if (ta.size === 1) { this.finishTeam([...ta][0]); return true; }
        if (full) { this.finishStalemate(); return true; }
        return false;
      }
      if (!alive.length) { this.finish(died); return true; }
      if ((alive.length === 1 && this.order.length > 1) || full) { this.finish(alive); return true; }
      return false;
    }
    draw(pid) { const h = this.hands[pid] = this.hands[pid] || []; while (h.length < HAND_SIZE && this.deck.length) h.push(this.deck.pop()); }
    advance(extra) {
      if (extra && this.players.get(this.turn).alive && (this.hands[this.turn] || []).length) { this.setTurn(this.turn); return; }
      const n = this.order.length, start = this.order.indexOf(this.turn);
      for (let attempt = 0; attempt < 2; attempt++) for (let k = 1; k <= n; k++) {
        const c = this.order[(start + k) % n];
        if (!this.players.get(c).alive) continue;
        if (this.skip.has(c) && attempt === 0) { this.skip.delete(c); continue; }
        this.draw(c);
        if ((this.hands[c] || []).length) { this.setTurn(c); return; }
      }
      this.finishStalemate();
    }
    finishStalemate() {
      const alive = this.order.filter(x => this.players.get(x).alive), mode = this.settings.mode;
      if (mode === "points") return this.finishPoints();
      if (mode === "team") {
        const c = { 0: 0, 1: 0 }; alive.forEach(x => c[this.teamOf(x)]++);
        return c[0] === c[1] ? this.finish(alive) : this.finishTeam(c[0] > c[1] ? 0 : 1);
      }
      this.finish(alive);
    }
    finishTeam(t) { this.winTeam = t; this.finish(this.order.filter(x => this.teamOf(x) === t)); }
    finishPoints() {
      for (const x of this.order) { const p = this.players.get(x); if (p.alive) p.score = (p.score || 0) + SURVIVE_BONUS; }
      const top = Math.max(...this.order.map(x => this.players.get(x).score || 0));
      this.finish(this.order.filter(x => (this.players.get(x).score || 0) === top));
    }
    finish(w) { this.phase = "over"; this.turn = null; this.turnDeadline = null; this.winners = w; }
    toLobby() {
      this.phase = "lobby"; this.resetRound();
      for (const p of this.players.values()) Object.assign(p, { pos: null, alive: true, trail: [], score: 0 });
      this.broadcast(); return { ok: true };
    }
    react(token, emoji) {
      const pid = this.tokens.get(token);
      if (!pid || !REACTIONS.includes(emoji)) return err("Не можна");
      if (Date.now() - (this.lastReact[pid] || 0) < 600) return { ok: true };
      this.lastReact[pid] = Date.now();
      const msg = { pid, emoji, t: Date.now() };
      for (const s of this.subs) if (s.onReact) setTimeout(() => s.onReact(clone(msg)));
      return { ok: true };
    }

    // ---------- збереження (щоб хост міг перезавантажити сторінку і продовжити)
    snapshot() {
      const keys = ["phase", "gameId", "settings", "cards", "specials", "deck", "hands", "board", "order", "turn",
                    "turnDeadline", "winners", "winTeam", "seq", "lastMove", "dice"];
      const o = {};
      for (const k of keys) o[k] = this[k];
      o.players = [...this.players.values()]; o.tokens = [...this.tokens]; o.skip = [...this.skip];
      return clone(o);
    }
    load(o) {
      this.resetRound();
      for (const k of Object.keys(o)) if (!["players", "tokens", "skip"].includes(k)) this[k] = o[k];
      this.players = new Map(o.players.map(p => [p.id, p]));
      this.tokens = new Map(o.tokens); this.skip = new Set(o.skip || []);
      if (this.turnDeadline) this.turnDeadline = Math.max(this.turnDeadline, Date.now() + 10000);
      if (this.phase === "dice" && this.dice && this.dice.first) { const gid = this.gameId; setTimeout(() => this.begin(gid), 2000); }
      this.broadcast();
    }

    // ---------- боти
    scheduleBots() {
      if (this.botTimer) return;
      if (this.phase === "dice" && this.dice && !this.dice.first) {
        const bot = this.dice.pending.find(p => this.players.get(p).bot && !(p in this.dice.rolls));
        if (bot) this.botTimer = setTimeout(() => { this.botTimer = null; this.roll(null, bot); }, 700 + rnd(500));
      } else if (this.phase === "game" && this.turn && this.players.get(this.turn).bot) {
        const seq = this.seq, pid = this.turn;
        this.botTimer = setTimeout(() => {
          this.botTimer = null;
          if (this.seq === seq && this.turn === pid && this.phase === "game") this.botMove(pid);
        }, 1300 + rnd(900));
      }
    }
    botMove(pid) {
      const me = this.players.get(pid), cell = [me.pos.q, me.pos.r];
      let best = null, bestScore = -Infinity;
      for (const c of this.hands[pid] || []) for (let k = 0; k < 6; k++) {
        const { res } = this.simulate(cell, c, k, pid);
        let sc = res[pid].alive ? 100 + res[pid].segs.length * (this.settings.mode === "points" ? 6 : 2) : -1000;
        for (const [o, x] of Object.entries(res)) {
          if (o === pid || x.alive) continue;
          sc += this.allies(o, pid) ? -60 : 40;            // вибити суперника — добре, союзника — погано
        }
        sc += Math.random() * 3;
        if (sc > bestScore) { bestScore = sc; best = [c, k]; }
      }
      if (best) this.place(null, best[0], best[1], pid, false);
    }
  }

  const game = new Game();
  // той самий набір запитів, що й у server.py
  const api = {
    "/api/join": b => game.join(b.token, b.name, b.color),
    "/api/leave": b => game.leave(b.token),
    "/api/team": b => game.setTeam(b.token, b.team),
    "/api/place": b => game.place(b.token, b.card, b.rot),
    "/api/roll": b => game.roll(b.token),
    "/api/react": b => game.react(b.token, b.emoji),
    "/api/start": () => game.start(),
    "/api/lobby": () => game.toLobby(),
    "/api/rollall": () => game.roll(null, true),
    "/api/settings": b => game.setSetting(b.key, b.value),
    "/api/hostteam": b => game.setTeam(null, b.team, b.pid),
    "/api/addbot": () => game.addBot(),
    "/api/kick": b => game.kick(b.pid),
  };
  g.HEXLOCAL = {
    game,
    subscribe: (token, onState, onReact, opts) => game.subscribe(token, onState, onReact, opts),
    unsubscribe: s => game.unsubscribe(s),
    call: async (path, body) => {
      const fn = api[path];
      if (!fn) return err("not found");
      try { return clone(fn(clone(body || {}))); } catch (e) { console.error(e); return err("Помилка: " + e.message); }
    },
  };
})(window);
