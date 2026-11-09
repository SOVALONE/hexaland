// Hexaland — спільна геометрія і малювання карт (для столу і телефона).
// Соти «гострим верхом», осьові координати (q, r). Точка i = грань*2 + slot (0..11).
(function (g) {
  const SQ3 = Math.sqrt(3);
  const SVGNS = "http://www.w3.org/2000/svg";
  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const f = v => v.toFixed(2);

  const inBoard = (q, r, R) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= R;
  const cellXY = (q, r, S) => [S * SQ3 * (q + r / 2), S * 1.5 * r];
  function corner(i, S) { const a = Math.PI / 180 * (60 * i - 30); return [S * Math.cos(a), S * Math.sin(a)]; }
  function hexPoints(cx, cy, S) {
    return [0, 1, 2, 3, 4, 5].map(i => { const [x, y] = corner(i, S); return f(cx + x) + "," + f(cy + y); }).join(" ");
  }
  function pointLocal(i, S) {
    const e = i >> 1, t = (1 + (i & 1)) / 3;
    const [x0, y0] = corner(e, S), [x1, y1] = corner(e + 1, S);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  }
  function pointXY(p, S) { const [cx, cy] = cellXY(p.q, p.r, S), [x, y] = pointLocal(p.i, S); return [cx + x, cy + y]; }
  function inward(i) { const a = Math.PI / 180 * 60 * (i >> 1); return [-Math.cos(a), -Math.sin(a)]; }

  // крива від точки a до точки b всередині соти з центром (cx, cy)
  function curve(a, b, S, cx, cy) {
    const [ax, ay] = pointLocal(a, S), [bx, by] = pointLocal(b, S);
    const L = Math.max(0.3 * S, 0.5 * Math.hypot(ax - bx, ay - by));
    const na = inward(a), nb = inward(b);
    return {
      start: `M ${f(cx + ax)} ${f(cy + ay)}`,
      c: ` C ${f(cx + ax + na[0] * L)} ${f(cy + ay + na[1] * L)} ${f(cx + bx + nb[0] * L)} ${f(cy + by + nb[1] * L)} ${f(cx + bx)} ${f(cy + by)}`,
    };
  }
  function segPath(a, b, S, cx, cy) { const c = curve(a, b, S, cx, cy); return c.start + c.c; }
  // шлях з кількох відрізків [q, r, a, b] одним рядком (для анімації)
  // (після телепорту шлях розривається — тоді починаємо новий відрізок, а не тягнемо лінію через поле)
  function trailPath(segs, S) {
    let d = "", last = null;
    for (const [q, r, a, b] of segs) {
      const [cx, cy] = cellXY(q, r, S), c = curve(a, b, S, cx, cy);
      const [sx, sy] = pointLocal(a, S);
      const start = [cx + sx, cy + sy];
      if (!last || Math.hypot(start[0] - last[0], start[1] - last[1]) > 0.5) d += (d ? " " : "") + c.start;
      d += c.c;
      const [ex, ey] = pointLocal(b, S);
      last = [cx + ex, cy + ey];
    }
    return d;
  }

  function rotMatch(m, rot) {
    const out = new Array(12);
    for (let a = 0; a < 12; a++) out[(a + 2 * rot) % 12] = (m[a] + 2 * rot) % 12;
    return out;
  }

  // board: {"q,r": {card, rot}}, cards: {id: match}
  function trace(board, cards, R, q, r, i) {
    const segs = [];
    for (let n = 0; n < 1000; n++) {
      const t = board[q + "," + r];
      if (!t) return { alive: true, pos: { q, r, i }, segs };
      const j = rotMatch(cards[t.card], t.rot)[i];
      segs.push([q, r, i, j]);
      const e = j >> 1, s = j & 1, nq = q + DIRS[e][0], nr = r + DIRS[e][1];
      if (!inBoard(nq, nr, R)) return { alive: false, pos: { q, r, i: j }, segs };
      q = nq; r = nr; i = ((e + 3) % 6) * 2 + (1 - s);
    }
    return { alive: false, pos: { q, r, i }, segs };
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // малює карту: шестикутник + 6 ліній. match уже повернутий. badge — значок спецкарти.
  function drawTile(parent, cx, cy, S, match, cls, badge, rotBadge) {
    const gr = el("g", { class: "tile " + (cls || "") + (badge ? " special" : "") }, parent);
    el("polygon", { points: hexPoints(cx, cy, S * 0.985), class: "tile-bg" }, gr);
    for (let a = 0; a < 12; a++) {
      const b = match[a];
      if (a < b) el("path", { d: segPath(a, b, S, cx, cy), class: "tile-line" }, gr);
    }
    if (badge) {
      const bg = el("g", { class: "badge", transform: `translate(${f(cx)} ${f(cy)}) rotate(${rotBadge || 0})` }, gr);
      el("circle", { r: S * 0.3, class: "badge-bg" }, bg);
      const t = el("text", { y: S * 0.12, "text-anchor": "middle", "font-size": S * 0.32 }, bg);
      t.textContent = badge;
    }
    return gr;
  }

  // статичне поле цілком (для глядача на телефоні)
  function renderBoard(svg, state, colorHex, S) {
    const R = state.boardRadius, icons = {};
    for (const s of state.options.specials) icons[s.id] = s.icon;
    svg.innerHTML = "";
    const ex = S * SQ3 * (R + 0.5) + 30, ey = S * (1.5 * R + 1) + 30;
    svg.setAttribute("viewBox", `${-ex} ${-ey} ${ex * 2} ${ey * 2}`);
    const gC = el("g", {}, svg), gT = el("g", {}, svg), gL = el("g", { class: "trails" }, svg), gP = el("g", {}, svg);
    for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) {
      if (!inBoard(q, r, R)) continue;
      const [cx, cy] = cellXY(q, r, S);
      el("polygon", { points: hexPoints(cx, cy, S), class: "cell" }, gC);
    }
    for (const t of state.board) {
      const [cx, cy] = cellXY(t.q, t.r, S), kind = state.specials[t.card];
      drawTile(gT, cx, cy, S, rotMatch(state.cards[t.card], t.rot), "", kind && icons[kind]);
    }
    for (const p of state.players) {
      if (p.trail.length) el("path", { d: trailPath(p.trail, S), class: "trail", stroke: colorHex[p.color] }, gL);
    }
    for (const p of state.players) {
      if (!p.pos) continue;
      const [x, y] = pointXY(p.pos, S);
      const g = el("g", { class: "bpiece" + (p.alive ? "" : " dead") + (p.id === state.turn ? " turn" : ""),
                          transform: `translate(${f(x)} ${f(y)})` }, gP);
      if (p.id === state.turn) el("circle", { r: S * 0.42, class: "ring" }, g);
      el("circle", { r: S * 0.26, fill: colorHex[p.color], class: "body" }, g);
      const t = el("text", { y: -S * 0.42, "text-anchor": "middle", "font-size": S * 0.32 }, g);
      t.textContent = p.name;
    }
  }

  // грань кубика: сітка 3x3 з крапками
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieFace(v) {
    const on = PIPS[v] || [];
    let h = "";
    for (let k = 0; k < 9; k++) h += `<i${on.includes(k) ? ' class="on"' : ""}></i>`;
    return h;
  }

  g.HX = { SQ3, DIRS, inBoard, cellXY, corner, hexPoints, pointLocal, pointXY, segPath, trailPath,
           rotMatch, trace, el, drawTile, renderBoard, dieFace, sfx: makeSfx(), keepAwake: makeKeepAwake() };

  // ---------- щоб екран не згасав під час гри
  // 1) Wake Lock API — працює лише на https або localhost (тобто на столі-ПК);
  // 2) на телефонах (звичайний http у локальній мережі) — крихітне беззвучне відео по колу (прийом NoSleep.js).
  // Браузер дозволяє запустити відео лише після дотику, тож on() треба викликати з обробника натискання.
  function makeKeepAwake() {
    let lock = null, video = null, wanted = false, mode = null;
    const listeners = [];
    const notify = () => listeners.forEach(fn => { try { fn(mode); } catch (e) {} });
    async function on() {
      wanted = true;
      if ("wakeLock" in navigator && window.isSecureContext) {
        try {
          if (!lock) {
            lock = await navigator.wakeLock.request("screen");
            lock.addEventListener("release", () => { lock = null; if (mode === "wakelock") { mode = null; notify(); } });
          }
          mode = "wakelock"; notify(); return mode;
        } catch (e) { /* не вийшло — пробуємо відео */ }
      }
      if (!video) {
        video = document.createElement("video");
        video.muted = true; video.loop = true;
        video.setAttribute("muted", ""); video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
        video.setAttribute("aria-hidden", "true");
        video.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:-1";
        for (const [src, type] of [["assets/nosleep.webm", "video/webm"], ["assets/nosleep.mp4", "video/mp4"]]) {
          const s = document.createElement("source"); s.src = src; s.type = type; video.appendChild(s);
        }
        // iOS інколи «засинає» на кінці циклу — перемотуємо трохи раніше
        video.addEventListener("timeupdate", () => { if (video.currentTime > 1.5) video.currentTime = 0.1; });
        document.body.appendChild(video);
      }
      try { await video.play(); mode = "video"; } catch (e) { mode = null; }
      notify();
      return mode;
    }
    function off() {
      wanted = false;
      if (lock) { lock.release().catch(() => {}); lock = null; }
      if (video) video.pause();
      mode = null; notify();
    }
    // після повернення у вкладку блокування треба взяти знову
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wanted && mode !== "video") on();
    });
    return { on, off, get wanted() { return wanted; }, get mode() { return mode; }, onChange(fn) { listeners.push(fn); } };
  }

  // ---------- звуки (синтез Web Audio, без файлів)
  function makeSfx() {
    let ctx = null, on = true;
    try { on = localStorage.getItem("hexaland-sound") !== "off"; } catch (e) {}
    const unlock = () => {
      try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
    };
    if (typeof window !== "undefined") ["pointerdown", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));
    function tone(freq, dur, type, vol, delay, slideTo) {
      if (!on || !ctx || ctx.state !== "running") return;
      const t0 = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function noise(dur, vol, delay, hp) {
      if (!on || !ctx || ctx.state !== "running") return;
      const t0 = ctx.currentTime + (delay || 0), n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const src = ctx.createBufferSource(), gn = ctx.createGain(), fl = ctx.createBiquadFilter();
      fl.type = "highpass"; fl.frequency.value = hp || 800; src.buffer = buf; gn.gain.value = vol || 0.2;
      src.connect(fl).connect(gn).connect(ctx.destination); src.start(t0);
    }
    return {
      get on() { return on; },
      set on(v) { on = v; try { localStorage.setItem("hexaland-sound", v ? "on" : "off"); } catch (e) {} },
      place() { noise(0.07, 0.35, 0, 1800); tone(180, 0.12, "triangle", 0.25); },
      move(n) { tone(320, 0.35 + 0.15 * (n || 1), "sine", 0.08, 0, 700); },
      out() { tone(420, 0.6, "sawtooth", 0.12, 0, 60); noise(0.4, 0.25, 0.05, 300); },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", 0.18, i * 0.13)); tone(1047, 0.9, "sine", 0.12, 0.55); },
      dice() { for (let i = 0; i < 6; i++) noise(0.04, 0.3, i * 0.06, 2500); },
      turn() { tone(880, 0.12, "sine", 0.12); tone(1320, 0.2, "sine", 0.1, 0.09); },
      tick() { tone(1500, 0.05, "square", 0.05); },
      special() { [660, 990, 1320].forEach((f, i) => tone(f, 0.18, "sine", 0.12, i * 0.06)); },
      pop() { tone(600, 0.08, "sine", 0.1, 0, 1200); },
    };
  }
})(window);
