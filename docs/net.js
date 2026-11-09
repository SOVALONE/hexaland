// Hexaland — зв'язок екрана з грою.
// • Екран хоста (стіл або телефон, що створив кімнату): рушій у батьківському вікні host.html (window.parent.HEXLOCAL).
// • Гравець: з'єднання з хостом через інтернет (p2p.js, WebRTC). Код кімнати — у параметрі ?r=КОД.
(function (g) {
  let local = null, host = null;
  try { if (g.parent !== g && g.parent.HEXLOCAL) { local = g.parent.HEXLOCAL; host = g.parent.HEXHOST || null; } } catch (e) { /* інший домен */ }
  const room = host ? host.code : HEXP2P.normCode(new URLSearchParams(location.search).get("r"));
  const client = !local && room ? HEXP2P.makeClient(room) : null;

  g.NET = {
    local: !!local,          // цей екран — на пристрої хоста
    isHost: !!local,
    room,                    // код кімнати
    hostInfo: host,          // {code, kind, joinUrl, status, onStatus(fn)} — лише на хості
    // підписка на стан; повертає об'єкт із close()
    connect(token, h) {
      if (local) {
        const sub = local.subscribe(token || null, h.onState, h.onReact);
        setTimeout(() => h.onOpen && h.onOpen());
        return { close() { local.unsubscribe(sub); } };
      }
      if (!client) { setTimeout(() => h.onError && h.onError("noroom")); return { close() {} }; }
      return client.connect(token, h);
    },
    async post(path, body) {
      if (local) return local.call(path, body || {});
      if (!client) return { ok: false, error: "Немає коду кімнати" };
      return client.post(path, body || {});
    },
  };
})(window);
