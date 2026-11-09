#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hexaland — сервер гри (стіл).

Запуск:     python server.py          (або Hexaland.exe)
Стіл (ПК):  http://localhost:8765/table   (відкривається автоматично)
Телефони:   http://<IP цього комп'ютера>:8765   (або QR-код у лобі)

Працює на чистому Python 3.8+, без додаткових бібліотек.
Зв'язок: телефони/стіл отримують стан через Server-Sent Events (/events),
а дії надсилають POST-запитами (/api/...).
"""
import json
import math
import os
import queue
import random
import secrets
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qr import qr_svg  # noqa: E402  (свій генератор QR, без бібліотек)

# ----------------------------------------------------------------- налаштування
PORT = int(os.environ.get("HEXALAND_PORT", "8765"))
MIN_PLAYERS = 2           # скільки гравців треба для «Старт»
MAX_PLAYERS = 8
HAND_SIZE = 3             # скільки карт у руці
EXTRA_CARDS = 12          # колода = кількість сот + руки гравців + запас + спецкарти
SURVIVE_BONUS = 5         # режим «На очки»: бонус тим, хто вижив
LOBBY_GRACE_SEC = 20      # через скільки секунд офлайн-гравця прибирає з лобі

# у зібраному .exe (PyInstaller) файли лежать у тимчасовій папці sys._MEIPASS
BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
ASSET_TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
               ".mp4": "video/mp4", ".webm": "video/webm"}

# розміри поля: радіус у сотах (3 -> 37 сот, 4 -> 61, 5 -> 91)
BOARD_SIZES = {"small": 3, "medium": 4, "large": 5}
SIZE_NAMES = {"small": "Мале", "medium": "Середнє", "large": "Велике"}

MODES = {
    "classic": {"name": "Класика", "icon": "🏆", "desc": "Виживає останній на полі"},
    "team":    {"name": "Командна", "icon": "🤝", "desc": "Дві команди. Своїх не вибиваєш — перемагає команда, що вижила"},
    "points":  {"name": "На очки", "icon": "⭐", "desc": f"Очко за кожну пройдену карту, +{SURVIVE_BONUS} тим, хто вижив"},
}
TIMERS = [0, 15, 30, 60]  # секунд на хід (0 — без таймера)
TEAMS = [{"id": 0, "name": "Сонце", "icon": "☀️", "hex": "#f2b43c"},
         {"id": 1, "name": "Місяць", "icon": "🌙", "hex": "#7fb3ff"}]
REACTIONS = ["😂", "😱", "🔥", "👏", "😡", "🤔", "💀", "🎉"]

# Спецкарти. main=True — основні (увімкнені за замовчуванням), решта — у списку в лобі.
# tile — особливий малюнок ліній (інакше лінії випадкові).
SPECIALS = {
    "extra":   {"name": "Ще хід",     "icon": "⚡", "main": True,  "desc": "Після цієї карти ходиш ще раз"},
    "swap":    {"name": "Обмін",      "icon": "🔄", "main": True,  "desc": "Міняєшся картами з наступним гравцем"},
    "mirror":  {"name": "Відбивач",   "icon": "↩️", "main": True,  "tile": "mirror",
                "desc": "Усі лінії розвертають назад — пастка для того, хто стоїть поруч"},
    "portal":  {"name": "Телепорт",   "icon": "🌀", "main": True,
                "desc": "Після ходу фішка стрибає у випадкову точку на краю. Рятує від вильоту"},
    "highway": {"name": "Магістраль", "icon": "✳️", "main": False, "tile": "highway",
                "desc": "Усі лінії прямі — наскрізь через центр"},
    "corners": {"name": "Кути",       "icon": "🌸", "main": False, "tile": "corners",
                "desc": "Лінії огинають кути — короткі повороти"},
    "thief":   {"name": "Злодій",     "icon": "🦝", "main": False, "desc": "Забираєш випадкову карту в наступного гравця"},
    "skip":    {"name": "Пропуск",    "icon": "⏸️", "main": False, "desc": "Наступний гравець пропускає хід"},
}

COLORS = [
    {"id": "red",    "name": "Червоний",    "hex": "#e53935"},
    {"id": "orange", "name": "Помаранчевий", "hex": "#fb8c00"},
    {"id": "yellow", "name": "Жовтий",      "hex": "#fdd835"},
    {"id": "green",  "name": "Зелений",     "hex": "#43a047"},
    {"id": "teal",   "name": "Бірюзовий",   "hex": "#00acc1"},
    {"id": "blue",   "name": "Синій",       "hex": "#1e88e5"},
    {"id": "purple", "name": "Фіолетовий",  "hex": "#8e24aa"},
    {"id": "pink",   "name": "Рожевий",     "hex": "#ec407a"},
]
COLOR_IDS = {c["id"] for c in COLORS}

# ------------------------------------------------------------------- геометрія
# Соти «гострим верхом», осьові координати (q, r).
# Грань e (0..5) веде до сусіда DIRS[e]; грань 0 — праворуч, далі за годинниковою.
# На кожній грані дві точки. Точка соти має індекс i = грань*2 + slot (0..11).
# Позиція фішки {q, r, i}: фішка стоїть у точці i соти (q, r) і «дивиться» в цю соту —
# саме туди гравець кладе наступну карту.
DIRS = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)]
SQRT3 = math.sqrt(3)


def in_board(q, r, radius):
    return max(abs(q), abs(r), abs(q + r)) <= radius


def board_cells(radius):
    return [(q, r) for r in range(-radius, radius + 1)
            for q in range(-radius, radius + 1) if in_board(q, r, radius)]


def point_xy(q, r, i):
    """Координати точки i соти (q, r) (у розмірах соти = 1)."""
    edge, slot = divmod(i, 2)
    cx, cy = SQRT3 * (q + r / 2), 1.5 * r
    a0, a1 = math.radians(60 * edge - 30), math.radians(60 * edge + 30)
    x0, y0 = cx + math.cos(a0), cy + math.sin(a0)
    x1, y1 = cx + math.cos(a1), cy + math.sin(a1)
    t = (1 + slot) / 3
    return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t


def border_points(radius):
    """Усі точки на зовнішньому краї поля, відсортовані по колу."""
    pts = []
    for q, r in board_cells(radius):
        for e, (dq, dr) in enumerate(DIRS):
            if not in_board(q + dq, r + dr, radius):
                for s in (0, 1):
                    x, y = point_xy(q, r, e * 2 + s)
                    pts.append(({"q": q, "r": r, "i": e * 2 + s}, math.atan2(y, x)))
    pts.sort(key=lambda p: p[1])
    return [p[0] for p in pts]


def scatter_positions(n, radius):
    """Кидає n фішок випадково по колу поля, але не впритул одна до одної."""
    border = border_points(radius)
    total = len(border)
    step = total / n
    jitter = int(step // 3)
    offset = random.randrange(total)
    idx = [(offset + round(i * step) + random.randint(-jitter, jitter)) % total for i in range(n)]
    random.shuffle(idx)
    return [dict(border[i]) for i in idx]


# ----------------------------------------------------------------------- карти
# Карта — це 6 ліній, що з'єднують 12 точок попарно: match[a] = b і match[b] = a.
def random_card():
    pts = list(range(12))
    random.shuffle(pts)
    m = [0] * 12
    for a, b in zip(pts[0::2], pts[1::2]):
        m[a], m[b] = b, a
    return m


def special_tile(kind):
    if kind == "mirror":    # обидві точки однієї грані — розворот назад
        return [i ^ 1 for i in range(12)]
    if kind == "highway":   # навпроти — пряма через центр
        return [(i + 6) % 12 for i in range(12)]
    if kind == "corners":   # сусідні точки біля кожного кута
        return [(i + 1) % 12 if i % 2 else (i - 1) % 12 for i in range(12)]
    return random_card()


def rot_match(m, rot):
    """Карта, повернута на rot*60° за годинниковою стрілкою."""
    out = [0] * 12
    for a in range(12):
        out[(a + 2 * rot) % 12] = (m[a] + 2 * rot) % 12
    return out


def trace(board, cards, q, r, i, radius):
    """Веде фішку по лініях. Повертає (живий?, позиція (q, r, i), пройдені відрізки)."""
    segs = []
    for _ in range(1000):
        tile = board.get((q, r))
        if tile is None:
            return True, (q, r, i), segs
        j = rot_match(cards[tile[0]], tile[1])[i]
        segs.append((q, r, i, j))
        e, s = divmod(j, 2)
        nq, nr = q + DIRS[e][0], r + DIRS[e][1]
        if not in_board(nq, nr, radius):
            return False, (q, r, j), segs     # вилетів за край поля
        q, r, i = nq, nr, ((e + 3) % 6) * 2 + (1 - s)
    return False, (q, r, i), segs


# ------------------------------------------------------------------- стан гри
def err(message):
    return {"ok": False, "error": message}


class Game:
    def __init__(self):
        self.lock = threading.RLock()
        self.phase = "lobby"   # lobby | dice | game | over
        self.players = {}      # id -> {id, name, color, team, pos, alive, trail, score, offline_since}
        self.tokens = {}       # секретний токен -> id
        self.subs = {}         # черга підписника -> id гравця або None (стіл/глядач)
        self.join_url = ""
        self.game_id = 0
        self.last_react = {}
        self.settings = {"size": "small", "mode": "classic", "timer": 0,
                         "specials": [k for k, v in SPECIALS.items() if v["main"]]}
        self._reset_round()

    @property
    def radius(self):
        return BOARD_SIZES[self.settings["size"]]

    @property
    def team_mode(self):
        return self.settings["mode"] == "team"

    def _reset_round(self):
        self.cards = {}        # id карти -> match
        self.specials = {}     # id карти -> вид спецкарти
        self.deck = []
        self.hands = {}        # id гравця -> [id карт]
        self.board = {}        # (q, r) -> (id карти, rot)
        self.order = []
        self.turn = None
        self.turn_deadline = None
        self.skip = set()
        self.winners = []
        self.win_team = None
        self.seq = 0
        self.last_move = None
        self.dice = None       # кидок кубика: хто ходить першим

    # --- службове
    def is_online(self, pid):
        return any(v == pid for v in self.subs.values())

    def team_of(self, pid):
        return self.players[pid].get("team", 0)

    def public_state(self):
        ids = self.order if self.order else list(self.players)
        ids = [pid for pid in ids if pid in self.players]
        left = None
        if self.turn_deadline and self.phase == "game":
            left = max(0, int((self.turn_deadline - time.time()) * 1000))
        return {
            "phase": self.phase,
            "gameId": self.game_id,
            "players": [{
                "id": p["id"], "name": p["name"], "color": p["color"], "team": p.get("team", 0),
                "pos": p["pos"], "alive": p["alive"], "trail": p["trail"], "score": p.get("score", 0),
                "online": self.is_online(p["id"]), "handCount": len(self.hands.get(p["id"], [])),
            } for p in (self.players[pid] for pid in ids)],
            "turn": self.turn,
            "turnLeftMs": left,
            "board": [{"q": q, "r": r, "card": c, "rot": rot} for (q, r), (c, rot) in self.board.items()],
            "cards": self.cards,
            "specials": self.specials,
            "deckCount": len(self.deck),
            "winners": self.winners,
            "winTeam": self.win_team,
            "lastMove": self.last_move,
            "dice": self.dice,
            "settings": self.settings,
            "options": {
                "sizes": [{"id": k, "name": SIZE_NAMES[k], "radius": v, "cells": len(board_cells(v))}
                          for k, v in BOARD_SIZES.items()],
                "modes": [dict(v, id=k) for k, v in MODES.items()],
                "timers": TIMERS,
                "specials": [dict(v, id=k) for k, v in SPECIALS.items()],
                "teams": TEAMS,
                "reactions": REACTIONS,
            },
            "colors": COLORS,
            "minPlayers": MIN_PLAYERS,
            "maxPlayers": MAX_PLAYERS,
            "boardRadius": self.radius,
            "joinUrl": self.join_url,
        }

    def broadcast(self):
        base = self.public_state()
        plain = json.dumps(base, ensure_ascii=False)
        cache = {}
        for q, pid in list(self.subs.items()):
            if pid and pid in self.hands:        # кожен бачить тільки свою руку
                if pid not in cache:
                    cache[pid] = json.dumps(dict(base, hand=self.hands[pid]), ensure_ascii=False)
                q.put(("message", cache[pid]))
            else:
                q.put(("message", plain))

    # --- підписки (SSE)
    def subscribe(self, q, token):
        with self.lock:
            pid = self.tokens.get(token) if token else None
            self.subs[q] = pid
            if pid:
                self.players[pid]["offline_since"] = None
            self.broadcast()
            return pid

    def unsubscribe(self, q):
        with self.lock:
            pid = self.subs.pop(q, None)
            if pid and pid in self.players and not self.is_online(pid):
                self.players[pid]["offline_since"] = time.time()
            self.broadcast()

    def cleanup(self):
        """Прибирає з лобі гравців, які давно відключилися."""
        with self.lock:
            if self.phase != "lobby":
                return
            now = time.time()
            gone = [pid for pid, p in self.players.items()
                    if p["offline_since"] and now - p["offline_since"] > LOBBY_GRACE_SEC]
            for pid in gone:
                self._remove(pid)
            if gone:
                self.broadcast()

    def _remove(self, pid):
        self.players.pop(pid, None)
        for t in [t for t, v in self.tokens.items() if v == pid]:
            del self.tokens[t]

    def _smaller_team(self, exclude=None):
        counts = [0, 0]
        for p in self.players.values():
            if p["id"] != exclude:
                counts[p.get("team", 0)] += 1
        return 0 if counts[0] <= counts[1] else 1

    # --- лобі
    def join(self, token, name, color):
        name = " ".join(str(name or "").split())[:16]
        if not name:
            return err("Введи ім'я")
        if color not in COLOR_IDS:
            return err("Вибери колір")
        with self.lock:
            pid = self.tokens.get(token) if token else None
            me = self.players.get(pid) if pid else None
            if me is not None and self.phase != "lobby":
                return {"ok": True, "id": pid, "token": token}
            if me is None and self.phase != "lobby":
                return err("Гра вже йде — зачекай наступної")
            for p in self.players.values():
                if p["id"] == pid:
                    continue
                if p["color"] == color:
                    return err("Цей колір уже зайнятий")
                if p["name"].lower() == name.lower():
                    return err("Таке ім'я вже є")
            if me is None:
                if len(self.players) >= MAX_PLAYERS:
                    return err("Стіл заповнений")
                pid, token = secrets.token_hex(4), secrets.token_urlsafe(16)
                self.tokens[token] = pid
                me = self.players[pid] = {"id": pid, "name": name, "color": color,
                                          "team": self._smaller_team(), "pos": None, "alive": True,
                                          "trail": [], "score": 0, "offline_since": time.time()}
                print(f"  + {name} ({color})")
            else:
                me["name"], me["color"] = name, color
            self.broadcast()
            return {"ok": True, "id": pid, "token": token}

    def leave(self, token):
        with self.lock:
            pid = self.tokens.get(token)
            if pid and self.phase == "lobby":
                print(f"  - {self.players[pid]['name']}")
                self._remove(pid)
                self.broadcast()
            return {"ok": True}

    def set_team(self, token, team, pid=None):
        with self.lock:
            pid = pid if pid in self.players else self.tokens.get(token)
            if not pid or self.phase != "lobby":
                return err("Команду можна змінити тільки в лобі")
            if team not in (0, 1):
                return err("Немає такої команди")
            self.players[pid]["team"] = team
            self.broadcast()
            return {"ok": True}

    def set_setting(self, key, value):
        with self.lock:
            if self.phase != "lobby":
                return err("Налаштування можна міняти тільки в лобі")
            s = self.settings
            if key == "size" and value in BOARD_SIZES:
                s["size"] = value
            elif key == "mode" and value in MODES:
                if value == "team" and s["mode"] != "team":     # розподіляємо по черзі
                    for n, p in enumerate(self.players.values()):
                        p["team"] = n % 2
                s["mode"] = value
            elif key == "timer" and value in TIMERS:
                s["timer"] = value
            elif key == "special" and isinstance(value, dict) and value.get("id") in SPECIALS:
                on = [k for k in s["specials"] if k != value["id"]]
                if value.get("on"):
                    on.append(value["id"])
                s["specials"] = [k for k in SPECIALS if k in on]
            else:
                return err("Невідоме налаштування")
            self.broadcast()
            return {"ok": True}

    # --- старт і кубик
    def start(self):
        with self.lock:
            if len(self.players) < MIN_PLAYERS:
                return err(f"Потрібно щонайменше {MIN_PLAYERS} гравці")
            if self.team_mode and len({p.get("team", 0) for p in self.players.values()}) < 2:
                return err("У кожній команді має бути хоча б один гравець")
            self._reset_round()
            self.game_id += 1
            n = len(board_cells(self.radius)) + HAND_SIZE * len(self.players) + EXTRA_CARDS
            for k in range(n):
                self.cards[f"c{k}"] = random_card()
            copies = 3 if self.settings["size"] == "large" else 2
            for kind in self.settings["specials"]:
                for k in range(copies):
                    cid = f"s_{kind}{k}"
                    self.cards[cid] = special_tile(SPECIALS[kind].get("tile", kind))
                    self.specials[cid] = kind
            self.deck = list(self.cards)
            random.shuffle(self.deck)
            self.order = list(self.players)
            random.shuffle(self.order)
            for pid, pos in zip(self.order, scatter_positions(len(self.order), self.radius)):
                p = self.players[pid]
                p.update(pos=pos, alive=True, trail=[], score=0, offline_since=None)
                self.hands[pid] = [self.deck.pop() for _ in range(HAND_SIZE)]
            # спершу всі кидають кубик — хто ходить першим
            self.dice = {"round": 1, "pending": list(self.order), "rolls": {}, "all": {},
                         "tied": [], "tieValue": None, "first": None}
            self.phase = "dice"
            print(f"  >> СТАРТ: {len(self.order)} гравців, режим {self.settings['mode']}, кидаємо кубик")
            self.broadcast()
            return {"ok": True}

    def roll(self, token=None, everyone=False):
        with self.lock:
            d = self.dice
            if self.phase != "dice" or d is None or d["first"]:
                return err("Зараз не час кидати кубик")
            if everyone:                              # стіл кидає за всіх, хто ще не кинув
                who = [p for p in d["pending"] if p not in d["rolls"]]
            else:
                pid = self.tokens.get(token)
                if pid not in d["pending"]:
                    return err("Зараз перекидають інші гравці")
                if pid in d["rolls"]:
                    return err("Ти вже кинув")
                who = [pid]
            for pid in who:
                v = random.randint(1, 6)
                d["rolls"][pid] = v
                d["all"].setdefault(pid, []).append(v)
                print(f"  [кубик] {self.players[pid]['name']}: {v}")
            if all(p in d["rolls"] for p in d["pending"]):
                top = max(d["rolls"][p] for p in d["pending"])
                tied = [p for p in d["pending"] if d["rolls"][p] == top]
                if len(tied) == 1:
                    d["first"] = tied[0]
                    print(f"  >> першим ходить {self.players[tied[0]]['name']}")
                    threading.Timer(3.2, self._begin, args=(self.game_id,)).start()
                else:                                 # нічия — перекидають тільки ті, хто викинув найбільше
                    d.update(round=d["round"] + 1, pending=tied, rolls={}, tied=tied, tieValue=top)
            self.broadcast()
            return {"ok": True}

    def _begin(self, game_id):
        with self.lock:
            if self.game_id != game_id or self.phase != "dice":
                return
            d = self.dice
            first = d["first"]
            # далі — за першим кидком (більше — раніше), однакові — випадково
            rest = sorted((p for p in self.order if p != first),
                          key=lambda p: (-d["all"].get(p, [0])[0], random.random()))
            order = [first] + rest
            if self.team_mode:                        # команди ходять по черзі
                lines = {0: [p for p in order if self.team_of(p) == 0],
                         1: [p for p in order if self.team_of(p) == 1]}
                t, order = self.team_of(first), []
                while lines[0] or lines[1]:
                    if lines[t]:
                        order.append(lines[t].pop(0))
                    t = 1 - t
            self.order = order
            self.phase = "game"
            self._set_turn(first)
            self.broadcast()

    def _set_turn(self, pid):
        self.turn = pid
        t = self.settings["timer"]
        self.turn_deadline = time.time() + t if t else None

    # --- хід
    def _next_alive(self, pid):
        n = len(self.order)
        k = self.order.index(pid)
        for d in range(1, n):
            cand = self.order[(k + d) % n]
            if self.players[cand]["alive"]:
                return cand
        return None

    def _allies(self, a, b):
        return self.team_mode and self.team_of(a) == self.team_of(b)

    def simulate(self, cell, card, rot, placer):
        """Що станеться, якщо покласти карту в cell. Повертає (нове поле, результати по гравцях)."""
        board = dict(self.board)
        board[cell] = (card, rot)
        res = {}
        for pid in self.order:
            p = self.players[pid]
            if not p["alive"]:
                continue
            q, r, i = p["pos"]["q"], p["pos"]["r"], p["pos"]["i"]
            if (q, r) == cell:
                alive, pos, segs = trace(board, self.cards, q, r, i, self.radius)
            else:
                alive, pos, segs = True, (q, r, i), []
            res[pid] = {"alive": alive, "pos": pos, "segs": segs,
                        "reason": None if alive else "out", "rescued": False}
        # телепорт рятує того, хто його поклав, від вильоту за край
        if self.specials.get(card) == "portal" and placer in res and res[placer]["reason"] == "out":
            res[placer].update(alive=True, reason=None, rescued=True)
        # зіткнення: дві фішки в одній точці або на одній лінії назустріч — обидві вибувають
        crashed = set()
        spots = {}
        for pid, x in res.items():
            if x["alive"] and not x["rescued"]:
                spots.setdefault(x["pos"], []).append(pid)
        for group in spots.values():
            for n, a in enumerate(group):
                for b in group[n + 1:]:
                    if not self._allies(a, b):
                        crashed.update((a, b))
        lines = {pid: {(q, r, min(a, b), max(a, b)) for q, r, a, b in x["segs"]} for pid, x in res.items()}
        movers = [pid for pid in res if lines[pid]]
        for n, a in enumerate(movers):
            for b in movers[n + 1:]:
                if lines[a] & lines[b] and not self._allies(a, b):
                    crashed.update((a, b))
        for pid in crashed:
            res[pid].update(alive=False, reason="crash", rescued=False)
        return board, res

    def place(self, token, card, rot):
        with self.lock:
            return self._place(self.tokens.get(token), card, rot)

    def _place(self, pid, card, rot, forced=False):
        if self.phase != "game":
            return err("Гра не йде")
        if pid != self.turn:
            return err("Зараз не твій хід")
        hand = self.hands.get(pid, [])
        if card not in hand:
            return err("Такої карти в тебе немає")
        try:
            rot = int(rot) % 6
        except (TypeError, ValueError):
            return err("Погане положення карти")
        me = self.players[pid]
        cell = (me["pos"]["q"], me["pos"]["r"])
        board, res = self.simulate(cell, card, rot, pid)
        if not res[pid]["alive"] and not forced:
            # самогубний хід дозволено, тільки якщо інших варіантів немає
            for c in hand:
                for k in range(6):
                    if (c, k) != (card, rot) and self.simulate(cell, c, k, pid)[1][pid]["alive"]:
                        return err("Так ти вибуваєш, а є безпечний варіант. Покрути карту або візьми іншу.")
        kind = self.specials.get(card)
        self.board = board
        hand.remove(card)
        died, moves, points_mode = [], {}, self.settings["mode"] == "points"
        for qpid, x in res.items():
            p = self.players[qpid]
            q, r, i = x["pos"]
            p["pos"] = {"q": q, "r": r, "i": i}
            if x["segs"]:
                p["trail"].extend([list(s) for s in x["segs"]])
                moves[qpid] = [list(s) for s in x["segs"]]
                if points_mode:
                    p["score"] = p.get("score", 0) + len(x["segs"])
            if not x["alive"]:
                p["alive"] = False
                died.append(qpid)
                self.deck.extend(self.hands.get(qpid, []))   # карти вибулого — назад у колоду
                self.hands[qpid] = []
        if died:
            random.shuffle(self.deck)

        # ефекти спецкарт
        effect = None
        if kind == "portal" and me["alive"]:
            target = self._teleport_target(pid)
            if target:
                effect = {"kind": "portal", "from": dict(me["pos"]), "to": target}
                me["pos"] = target
            elif res[pid]["rescued"]:                      # нікуди стрибати — таки вилетів
                me["alive"] = False
                died.append(pid)
                self.deck.extend(hand)
                self.hands[pid] = []
                hand = self.hands[pid]
        if me["alive"]:
            self._draw(pid)                                 # нова карта щоходу
            hand = self.hands[pid]
        nxt = self._next_alive(pid)
        if kind == "extra" and me["alive"]:
            effect = {"kind": "extra"}
        elif kind == "swap" and me["alive"] and nxt:
            self.hands[pid], self.hands[nxt] = self.hands[nxt], self.hands[pid]
            effect = {"kind": "swap", "with": nxt}
        elif kind == "thief" and me["alive"] and nxt and self.hands.get(nxt):
            stolen = random.choice(self.hands[nxt])
            self.hands[nxt].remove(stolen)
            self.hands[pid].append(stolen)
            effect = {"kind": "thief", "from": nxt}
        elif kind == "skip" and nxt:
            self.skip.add(nxt)
            effect = {"kind": "skip", "who": nxt}

        self.seq += 1
        self.last_move = {"seq": self.seq, "pid": pid, "q": cell[0], "r": cell[1], "card": card,
                          "special": kind, "effect": effect, "auto": forced,
                          "moves": moves, "died": died}
        names = ", ".join(self.players[d]["name"] for d in died)
        print(f"  {me['name']}: карта в ({cell[0]},{cell[1]})" + (f" [{kind}]" if kind else "")
              + (" [час вийшов]" if forced else "") + (f" — вибули: {names}" if died else ""))

        if not self._check_end(died):
            self._advance(extra=(kind == "extra" and me["alive"]))
        self.broadcast()
        return {"ok": True}

    def _teleport_target(self, pid):
        """Випадкова вільна точка на краю поля перед порожньою сотою."""
        taken = {(p["pos"]["q"], p["pos"]["r"], p["pos"]["i"]) for x, p in self.players.items()
                 if x != pid and p["alive"] and p["pos"]}
        options = []
        for q, r in board_cells(self.radius):
            if (q, r) in self.board:
                continue
            for e, (dq, dr) in enumerate(DIRS):
                if not in_board(q + dq, r + dr, self.radius):
                    for s in (0, 1):
                        if (q, r, e * 2 + s) not in taken:
                            options.append({"q": q, "r": r, "i": e * 2 + s})
        return random.choice(options) if options else None

    def tick(self):
        """Таймер: якщо час вийшов — кладемо випадкову карту у випадковому положенні."""
        with self.lock:
            if self.phase == "game" and self.turn_deadline and time.time() >= self.turn_deadline:
                pid = self.turn
                hand = self.hands.get(pid) or []
                if hand:
                    self._place(pid, random.choice(hand), random.randrange(6), forced=True)
                else:
                    self._advance()
                    self.broadcast()

    def _check_end(self, died):
        alive = [x for x in self.order if self.players[x]["alive"]]
        full = len(self.board) == len(board_cells(self.radius))
        mode = self.settings["mode"]
        if mode == "points":
            if not alive or (len(alive) == 1 and len(self.order) > 1) or full:
                self._finish_points()
                return True
            return False
        if mode == "team":
            teams_alive = {self.team_of(x) for x in alive}
            if not alive:
                self._finish([])                              # обидві команди вибули разом — нічия
                return True
            if len(teams_alive) == 1:
                self._finish_team(teams_alive.pop())
                return True
            if full:
                self._finish_stalemate()
                return True
            return False
        if not alive:
            self._finish(died)                                # усі вибули разом — нічия
            return True
        if (len(alive) == 1 and len(self.order) > 1) or full:
            self._finish(alive)
            return True
        return False

    def _draw(self, pid):
        hand = self.hands.setdefault(pid, [])
        while len(hand) < HAND_SIZE and self.deck:
            hand.append(self.deck.pop())

    def _advance(self, extra=False):
        if extra and self.players[self.turn]["alive"] and self.hands.get(self.turn):
            self._set_turn(self.turn)
            return
        n = len(self.order)
        start = self.order.index(self.turn)
        for attempt in range(2):
            for k in range(1, n + 1):
                cand = self.order[(start + k) % n]
                if not self.players[cand]["alive"]:
                    continue
                if cand in self.skip and attempt == 0:
                    self.skip.discard(cand)
                    continue
                self._draw(cand)
                if self.hands.get(cand):
                    self._set_turn(cand)
                    return
        self._finish_stalemate()

    def _finish_stalemate(self):
        """Ходити більше нікому (немає карт або поле заповнене)."""
        alive = [x for x in self.order if self.players[x]["alive"]]
        mode = self.settings["mode"]
        if mode == "points":
            return self._finish_points()
        if mode == "team":
            counts = {0: 0, 1: 0}
            for x in alive:
                counts[self.team_of(x)] += 1
            if counts[0] == counts[1]:
                return self._finish(alive)
            return self._finish_team(0 if counts[0] > counts[1] else 1)
        self._finish(alive)

    def _finish_team(self, team):
        self.win_team = team
        self._finish([x for x in self.order if self.team_of(x) == team])

    def _finish_points(self):
        for x in self.order:
            if self.players[x]["alive"]:
                self.players[x]["score"] = self.players[x].get("score", 0) + SURVIVE_BONUS
        top = max(self.players[x].get("score", 0) for x in self.order)
        self._finish([x for x in self.order if self.players[x].get("score", 0) == top])

    def _finish(self, winners):
        self.phase = "over"
        self.turn = None
        self.turn_deadline = None
        self.winners = winners
        print("  ** КІНЕЦЬ: " + (", ".join(self.players[w]["name"] for w in winners) or "нічия"))

    def to_lobby(self):
        with self.lock:
            self.phase = "lobby"
            self._reset_round()
            for pid in [pid for pid in self.players if not self.is_online(pid)]:
                self._remove(pid)
            for p in self.players.values():
                p.update(pos=None, alive=True, trail=[], score=0)
            self.broadcast()
            return {"ok": True}

    # --- реакції
    def react(self, token, emoji):
        with self.lock:
            pid = self.tokens.get(token)
            if not pid or emoji not in REACTIONS:
                return err("Не можна")
            now = time.time()
            if now - self.last_react.get(pid, 0) < 0.6:
                return {"ok": True}
            self.last_react[pid] = now
            msg = json.dumps({"pid": pid, "emoji": emoji, "t": now}, ensure_ascii=False)
            for q in list(self.subs):
                q.put(("react", msg))
            return {"ok": True}


GAME = Game()


# --------------------------------------------------------------------- HTTP
PAGES = {"/": ("client.html", "text/html"), "/index.html": ("client.html", "text/html"),
         "/table": ("table.html", "text/html"), "/hex.js": ("hex.js", "application/javascript"),
         "/net.js": ("net.js", "application/javascript")}


class Handler(BaseHTTPRequestHandler):
    server_version = "Hexaland/0.3"

    def log_message(self, fmt, *args):
        pass  # тиша в консолі

    def is_host(self):
        return self.client_address[0] in {"127.0.0.1", "::1", "::ffff:127.0.0.1", lan_ip()}

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/events":
            token = parse_qs(url.query).get("token", [""])[0]
            return self.events(token)
        if url.path == "/qr.svg":      # QR-код з адресою для телефонів
            body = qr_svg(GAME.join_url).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(body)
        path = "/assets/hexaland.ico" if url.path == "/favicon.ico" else url.path
        if path.startswith("/assets/"):   # логотип та іконки
            name = os.path.basename(path)
            file_path, ctype = os.path.join(ASSETS_DIR, name), ASSET_TYPES.get(os.path.splitext(name)[1])
        else:
            page = PAGES.get(path)
            if not page:
                return self.send_error(404)
            file_path, ctype = os.path.join(WEB_DIR, page[0]), page[1] + "; charset=utf-8"
        if not ctype:
            return self.send_error(404)
        try:
            with open(file_path, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(404)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(length) or b"{}") if length else {}
        except (ValueError, json.JSONDecodeError):
            return self.send_json(err("bad json"), 400)
        path = urlparse(self.path).path
        tok = data.get("token")
        player_api = {
            "/api/join": lambda: GAME.join(tok, data.get("name"), data.get("color")),
            "/api/leave": lambda: GAME.leave(tok),
            "/api/team": lambda: GAME.set_team(tok, data.get("team")),
            "/api/place": lambda: GAME.place(tok, data.get("card"), data.get("rot")),
            "/api/roll": lambda: GAME.roll(tok),
            "/api/react": lambda: GAME.react(tok, data.get("emoji")),
        }
        host_api = {
            "/api/start": GAME.start,
            "/api/lobby": GAME.to_lobby,
            "/api/rollall": lambda: GAME.roll(everyone=True),
            "/api/settings": lambda: GAME.set_setting(data.get("key"), data.get("value")),
            "/api/hostteam": lambda: GAME.set_team(None, data.get("team"), pid=data.get("pid")),
        }
        if path in player_api:
            return self.send_json(player_api[path]())
        if path in host_api:
            if not self.is_host():
                return self.send_json(err("Це може робити тільки стіл"), 403)
            return self.send_json(host_api[path]())
        self.send_json(err("not found"), 404)

    def events(self, token):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = queue.Queue()
        GAME.subscribe(q, token)
        try:
            self.wfile.write(b"retry: 1500\n\n")
            while True:
                try:
                    event, msg = q.get(timeout=10)
                    chunk = (f"event: {event}\n" if event != "message" else "") + f"data: {msg}\n\n"
                except queue.Empty:
                    chunk = ": ping\n\n"  # тримає з'єднання живим
                self.wfile.write(chunk.encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            GAME.unsubscribe(q)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"  # на Windows не дає запустити двічі на тому ж порту


# ------------------------------------------------------------------- запуск
_LAN_IP = None


def lan_ip():
    global _LAN_IP
    if _LAN_IP is None:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("10.255.255.255", 1))  # пакет нікуди не йде, просто вибирає мережу
            _LAN_IP = s.getsockname()[0]
        except OSError:
            _LAN_IP = "127.0.0.1"
        finally:
            s.close()
    return _LAN_IP


def all_ips():
    try:
        ips = socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        ips = []
    return [ip for ip in dict.fromkeys([lan_ip()] + ips) if not ip.startswith("127.")]


def janitor():
    n = 0
    while True:
        time.sleep(0.5)
        n += 1
        try:
            GAME.tick()
            if n % 4 == 0:
                GAME.cleanup()
        except Exception as e:  # щоб таймер не помер від випадкової помилки
            print("  ! помилка таймера:", e)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if os.name == "nt":
        os.system("title Hexaland — сервер")
    GAME.join_url = f"http://{lan_ip()}:{PORT}"
    try:
        httpd = Server(("0.0.0.0", PORT), Handler)
    except OSError as e:
        print(f"Не вдалося зайняти порт {PORT}: {e}\nМожливо, сервер уже запущений.")
        return
    threading.Thread(target=janitor, daemon=True).start()

    print("=" * 52)
    print("  HEXALAND — сервер запущено")
    print(f"  Стіл:      http://localhost:{PORT}/table")
    for ip in all_ips():
        print(f"  Телефони:  http://{ip}:{PORT}")
    print("  Зупинити:  Ctrl+C")
    print("=" * 52)

    if "--no-browser" not in sys.argv:
        threading.Timer(0.7, lambda: webbrowser.open(f"http://localhost:{PORT}/table")).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nЗупинено.")


if __name__ == "__main__":
    main()
