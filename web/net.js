// Hexaland — зв'язок зі «столом».
// • Звичайна гра: сервер server.py (Server-Sent Events + POST-запити).
// • Гра в браузері на одному екрані (itch.io): рушій engine.js у батьківському вікні (window.parent.HEXLOCAL).
(function (g) {
  let local = null;
  try { if (g.parent !== g && g.parent.HEXLOCAL) local = g.parent.HEXLOCAL; } catch (e) { /* інший домен — значить сервер */ }

  g.NET = {
    local: !!local,
    // підписка на стан; повертає об'єкт із close()
    connect(token, h) {
      if (local) {
        const sub = local.subscribe(token || null, h.onState, h.onReact);
        setTimeout(() => h.onOpen && h.onOpen());
        return { close() { local.unsubscribe(sub); } };
      }
      const es = new EventSource("/events" + (token ? "?token=" + encodeURIComponent(token) : ""));
      es.onopen = () => h.onOpen && h.onOpen();
      es.onerror = () => h.onError && h.onError();
      es.onmessage = e => h.onState(JSON.parse(e.data));
      es.addEventListener("react", e => h.onReact && h.onReact(JSON.parse(e.data)));
      return es;
    },
    async post(path, body) {
      if (local) return local.call(path, body || {});
      try {
        const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
        return await r.json();
      } catch (e) { return { ok: false, error: "Немає зв'язку зі столом" }; }
    },
  };
})(window);
