// Hexaland — гра через інтернет без власного сервера.
// Хост (ПК-стіл або телефон, що створив кімнату) запускає рушій engine.js і реєструється в PeerJS
// під ID «hexaland-v2-<КОД>». Гравці з'єднуються з ним напряму по WebRTC (data channel, JSON).
// Повідомлення: клієнт → хост  {t:"sub", token} | {t:"call", id, path, body} | {t:"ping"}
//               хост → клієнт  {t:"state", st}  | {t:"react", r} | {t:"res", id, res} | {t:"pong"}
(function (g) {
  "use strict";
  const PREFIX = "hexaland-v2-";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // без 0/O, 1/I — щоб легко диктувати
  const CODE_LEN = 5;
  // дії, які може робити лише хост (стіл або телефон-хост), а не гравці через мережу
  const HOST_ONLY = new Set(["/api/start", "/api/lobby", "/api/settings", "/api/addbot", "/api/kick", "/api/hostteam", "/api/rollall"]);

  const newCode = () => Array.from({ length: CODE_LEN }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  const normCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  // ---------- хост
  // local — window.HEXLOCAL (рушій); onStatus(status, info) — "connecting" | "online" | "reconnecting" | "taken" | "error"
  function startHost(code, local, onStatus) {
    let peer = null, tries = 0, stopped = false;
    const conns = new Map();   // conn -> { sub, last }
    const status = (s, info) => { try { onStatus && onStatus(s, info); } catch (e) { console.error(e); } };

    function send(conn, msg) { try { if (conn.open) conn.send(msg); } catch (e) { /* канал закрився */ } }
    function drop(conn) {
      const c = conns.get(conn);
      if (!c) return;
      conns.delete(conn);
      if (c.sub) local.unsubscribe(c.sub);
      try { conn.close(); } catch (e) {}
    }
    function setup(conn) {
      const c = { sub: null, last: Date.now() };
      conns.set(conn, c);
      conn.on("data", async m => {
        c.last = Date.now();
        if (!m || typeof m !== "object") return;
        if (m.t === "ping") return send(conn, { t: "pong" });
        if (m.t === "sub") {
          if (c.sub) local.unsubscribe(c.sub);
          c.sub = local.subscribe(typeof m.token === "string" ? m.token : null,
            st => send(conn, { t: "state", st }), r => send(conn, { t: "react", r }), { remote: true });
          return;
        }
        if (m.t === "call") {
          const path = String(m.path || "");
          const res = HOST_ONLY.has(path) ? { ok: false, error: "Це може зробити лише хост" } : await local.call(path, m.body || {});
          send(conn, { t: "res", id: m.id, res });
        }
      });
      conn.on("close", () => drop(conn));
      conn.on("error", () => drop(conn));
    }

    function open() {
      if (stopped) return;
      status("connecting");
      peer = new Peer(PREFIX + code, { debug: 1 });
      peer.on("open", () => { tries = 0; status("online"); });
      peer.on("connection", conn => {
        if (conn.open) setup(conn); else conn.on("open", () => setup(conn));
      });
      peer.on("disconnected", () => { if (!stopped) status("reconnecting"); });
      peer.on("error", e => {
        if (e.type === "unavailable-id") {
          // після перезавантаження сторінки старий ID ще може бути зайнятий кілька секунд
          peer.destroy();
          if (++tries < 20) setTimeout(open, 2500); else status("taken");
        } else if (e.type === "browser-incompatible") status("error", "Цей браузер не підтримує WebRTC");
        else if (e.type !== "peer-unavailable") status("reconnecting");
      });
    }
    open();

    // сторож: перепідключаємо сигнальний сервер і прибираємо «мовчазних» гравців
    setInterval(() => {
      if (stopped || !peer) return;
      if (peer.destroyed) { if (tries === 0) open(); }
      else if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
      const now = Date.now();
      for (const [conn, c] of conns) if (now - c.last > 20000) drop(conn);
    }, 4000);

    return {
      get players() { return conns.size; },
      stop() { stopped = true; for (const conn of [...conns.keys()]) drop(conn); if (peer) peer.destroy(); },
    };
  }

  // ---------- гравець (клієнт)
  // Одне з'єднання на сторінку; connect() лише змінює токен і обробники.
  function makeClient(code) {
    let peer = null, conn = null, open = false, token = null, h = {}, seq = 0, lastData = 0, notFound = 0, retryT = null;
    const pending = new Map();
    const waiters = [];

    function fire(name, arg) { try { h[name] && h[name](arg); } catch (e) { console.error(e); } }
    function setOpen(v) {
      if (open === v) return;
      open = v;
      if (v) { notFound = 0; fire("onOpen"); while (waiters.length) waiters.shift()(); }
      else fire("onError", notFound >= 2 ? "notfound" : "lost");
    }
    function scheduleRetry(ms) { clearTimeout(retryT); retryT = setTimeout(dial, ms); }

    function ensurePeer() {
      if (peer && !peer.destroyed) return peer;
      peer = new Peer({ debug: 1 });
      peer.on("open", () => dial());
      peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });
      peer.on("error", e => {
        if (e.type === "peer-unavailable") { notFound++; conn = null; if (open) setOpen(false); else fire("onError", notFound >= 2 ? "notfound" : "lost"); scheduleRetry(3000); }
        else if (e.type === "browser-incompatible") fire("onError", "browser");
        else { setOpen(false); scheduleRetry(3000); }
      });
      return peer;
    }
    function dial() {
      clearTimeout(retryT);
      const p = ensurePeer();
      if (!p.open) return;          // підключимося в peer.on("open")
      if (conn) { try { conn.close(); } catch (e) {} }
      const c = conn = p.connect(PREFIX + code, { serialization: "json", reliable: true });
      c.on("open", () => {
        if (c !== conn) return;
        lastData = Date.now();
        c.send({ t: "sub", token });
        setOpen(true);
      });
      c.on("data", m => {
        if (c !== conn || !m) return;
        lastData = Date.now();
        if (m.t === "state") fire("onState", m.st);
        else if (m.t === "react") fire("onReact", m.r);
        else if (m.t === "res" && pending.has(m.id)) { pending.get(m.id)(m.res); pending.delete(m.id); }
      });
      const lost = () => { if (c !== conn) return; conn = null; setOpen(false); scheduleRetry(1500); };
      c.on("close", lost);
      c.on("error", lost);
      // якщо канал так і не відкрився — пробуємо ще раз
      setTimeout(() => { if (c === conn && !c.open) { try { c.close(); } catch (e) {} lost(); } }, 12000);
    }
    // пінг; якщо хост мовчить — перепідключаємось
    setInterval(() => {
      if (!conn || !open) return;
      try { conn.send({ t: "ping" }); } catch (e) {}
      if (Date.now() - lastData > 14000) { const c = conn; conn = null; try { c.close(); } catch (e) {} setOpen(false); scheduleRetry(500); }
    }, 4000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !open) scheduleRetry(100);
    });

    return {
      connect(tok, handlers) {
        token = tok || null; h = handlers || {};
        if (open && conn) { try { conn.send({ t: "sub", token }); } catch (e) {} setTimeout(() => fire("onOpen")); }
        else dial();
        return { close() {} };
      },
      async post(path, body) {
        if (!open) {
          const ok = await new Promise(res => { waiters.push(() => res(true)); setTimeout(() => res(false), 8000); });
          if (!ok) return { ok: false, error: "Немає зв'язку з хостом гри" };
        }
        const id = ++seq;
        return new Promise(res => {
          pending.set(id, res);
          try { conn.send({ t: "call", id, path, body: body || {} }); } catch (e) { pending.delete(id); return res({ ok: false, error: "Немає зв'язку з хостом гри" }); }
          setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ ok: false, error: "Хост не відповідає" }); } }, 10000);
        });
      },
    };
  }

  g.HEXP2P = { PREFIX, newCode, normCode, startHost, makeClient, CODE_LEN };
})(window);
