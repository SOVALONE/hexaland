# -*- coding: utf-8 -*-
"""
Мінімальний генератор QR-коду (байтовий режим, рівень корекції M, версії 1–10)
на чистому Python — без бібліотек, щоб працювало офлайн.
Алгоритм за специфікацією ISO/IEC 18004 (за мотивами бібліотеки Nayuki, MIT).

    from qr import qr_svg
    svg_text = qr_svg("http://192.168.0.5:8765")
"""

# таблиці для рівня M, індекс = версія (0 не використовується)
ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
FORMAT_BITS_M = 0
MAX_VERSION = 10


def _raw_modules(ver):
    n = (16 * ver + 128) * ver + 64
    if ver >= 2:
        na = ver // 7 + 2
        n -= (25 * na - 10) * na - 55
        if ver >= 7:
            n -= 36
    return n


def _data_codewords(ver):
    return _raw_modules(ver) // 8 - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver]


# --- Ріда — Соломона над GF(256)
def _gf_mul(x, y):
    z = 0
    for i in range(7, -1, -1):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z & 0xFF


def _rs_divisor(degree):
    result = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = _gf_mul(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = _gf_mul(root, 0x02)
    return result


def _rs_remainder(data, divisor):
    result = [0] * len(divisor)
    for b in data:
        factor = b ^ result.pop(0)
        result.append(0)
        for i, coef in enumerate(divisor):
            result[i] ^= _gf_mul(coef, factor)
    return result


def _bit(x, i):
    return (x >> i) & 1 != 0


class _QR:
    def __init__(self, ver, codewords, mask=None):
        self.ver = ver
        self.size = ver * 4 + 17
        n = self.size
        self.mod = [[False] * n for _ in range(n)]
        self.fn = [[False] * n for _ in range(n)]
        self._function_patterns()
        self._draw_codewords(codewords)
        if mask is None:
            best, best_pen = 0, None
            for m in range(8):
                self._apply_mask(m)
                self._format_bits(m)
                pen = self._penalty()
                if best_pen is None or pen < best_pen:
                    best, best_pen = m, pen
                self._apply_mask(m)   # XOR назад
            mask = best
        self._apply_mask(mask)
        self._format_bits(mask)

    def _set(self, x, y, dark):
        self.mod[y][x] = dark
        self.fn[y][x] = True

    def _function_patterns(self):
        n = self.size
        for i in range(n):
            self._set(6, i, i % 2 == 0)
            self._set(i, 6, i % 2 == 0)
        for cx, cy in ((3, 3), (n - 4, 3), (3, n - 4)):
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < n and 0 <= y < n:
                        self._set(x, y, max(abs(dx), abs(dy)) not in (2, 4))
        pos = self._align_positions()
        last = len(pos) - 1
        for i, ax in enumerate(pos):
            for j, ay in enumerate(pos):
                if (i == 0 and j == 0) or (i == 0 and j == last) or (i == last and j == 0):
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self._set(ax + dx, ay + dy, max(abs(dx), abs(dy)) != 1)
        self._format_bits(0)   # резервуємо місце
        if self.ver >= 7:
            rem = self.ver
            for _ in range(12):
                rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
            bits = self.ver << 12 | rem
            for i in range(18):
                b = _bit(bits, i)
                a, c = n - 11 + i % 3, i // 3
                self._set(a, c, b)
                self._set(c, a, b)

    def _align_positions(self):
        if self.ver == 1:
            return []
        na = self.ver // 7 + 2
        step = (self.ver * 8 + na * 3 + 5) // (na * 4 - 4) * 2
        res = [self.size - 7 - i * step for i in range(na - 1)] + [6]
        return list(reversed(res))

    def _format_bits(self, mask):
        data = FORMAT_BITS_M << 3 | mask
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = (data << 10 | rem) ^ 0x5412
        n = self.size
        for i in range(6):
            self._set(8, i, _bit(bits, i))
        self._set(8, 7, _bit(bits, 6))
        self._set(8, 8, _bit(bits, 7))
        self._set(7, 8, _bit(bits, 8))
        for i in range(9, 15):
            self._set(14 - i, 8, _bit(bits, i))
        for i in range(8):
            self._set(n - 1 - i, 8, _bit(bits, i))
        for i in range(8, 15):
            self._set(8, n - 15 + i, _bit(bits, i))
        self._set(8, n - 8, True)

    def _draw_codewords(self, data):
        n, i = self.size, 0
        right = n - 1
        while right >= 1:
            if right == 6:
                right = 5
            for vert in range(n):
                for j in range(2):
                    x = right - j
                    upward = ((right + 1) & 2) == 0
                    y = n - 1 - vert if upward else vert
                    if not self.fn[y][x] and i < len(data) * 8:
                        self.mod[y][x] = _bit(data[i >> 3], 7 - (i & 7))
                        i += 1
            right -= 2

    def _apply_mask(self, m):
        f = [lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0,
             lambda x, y: (x + y) % 3 == 0, lambda x, y: (x // 3 + y // 2) % 2 == 0,
             lambda x, y: x * y % 2 + x * y % 3 == 0, lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
             lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0][m]
        for y in range(self.size):
            for x in range(self.size):
                if not self.fn[y][x] and f(x, y):
                    self.mod[y][x] = not self.mod[y][x]

    def _penalty(self):
        n, m, pen = self.size, self.mod, 0
        lines = [row for row in m] + [[m[y][x] for y in range(n)] for x in range(n)]
        for line in lines:                     # довгі серії одного кольору
            run, prev = 0, None
            for v in line + [None]:
                if v == prev:
                    run += 1
                else:
                    if run >= 5:
                        pen += 3 + (run - 5)
                    run, prev = 1, v
            # схожі на шукач візерунки 1:1:3:1:1 (з 4 світлими поруч, край поля — світлий)
            s = "0000" + "".join("1" if v else "0" for v in line) + "0000"
            pen += 40 * sum(1 for k in range(len(s) - 10)
                            if s[k:k + 11] in ("10111010000", "00001011101"))
        for y in range(n - 1):                 # квадрати 2x2
            for x in range(n - 1):
                c = m[y][x]
                if c == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    pen += 3
        dark = sum(sum(row) for row in m)      # баланс темних/світлих
        total = n * n
        pen += ((abs(dark * 20 - total * 10) + total - 1) // total - 1) * 10
        return pen


def _encode(text):
    data = text.encode("utf-8")
    for ver in range(1, MAX_VERSION + 1):
        cc_bits = 8 if ver <= 9 else 16
        cap = _data_codewords(ver) * 8
        if 4 + cc_bits + 8 * len(data) <= cap:
            break
    else:
        raise ValueError("текст задовгий для QR")
    bits = [0, 1, 0, 0] + [_bit(len(data), i) for i in range(cc_bits - 1, -1, -1)]
    for b in data:
        bits += [_bit(b, i) for i in range(7, -1, -1)]
    bits += [0] * min(4, cap - len(bits))
    bits += [0] * (-len(bits) % 8)
    pad = 0xEC
    while len(bits) < cap:
        bits += [_bit(pad, i) for i in range(7, -1, -1)]
        pad ^= 0xEC ^ 0x11
    codewords = [int("".join("1" if b else "0" for b in bits[i:i + 8]), 2) for i in range(0, len(bits), 8)]

    # блоки + корекція + переплітання
    nb, ecl = NUM_BLOCKS[ver], ECC_PER_BLOCK[ver]
    raw = _raw_modules(ver) // 8
    n_short = nb - raw % nb
    short_len = raw // nb
    div = _rs_divisor(ecl)
    blocks, k = [], 0
    for i in range(nb):
        ln = short_len - ecl + (0 if i < n_short else 1)
        dat = codewords[k:k + ln]
        k += ln
        ecc = _rs_remainder(dat, div)
        if i < n_short:
            dat = dat + [0]
        blocks.append(dat + ecc)
    out = []
    for i in range(len(blocks[0])):
        for j, blk in enumerate(blocks):
            if i != short_len - ecl or j >= n_short:
                out.append(blk[i])
    return _QR(ver, out)


def qr_matrix(text):
    """Матриця модулів: list[list[bool]] (True = темний)."""
    return _encode(text).mod


def qr_svg(text, quiet=4, dark="#15110d", light="#ffffff"):
    m = qr_matrix(text)
    n = len(m) + quiet * 2
    path = "".join(f"M{x + quiet} {y + quiet}h1v1h-1z"
                   for y, row in enumerate(m) for x, v in enumerate(row) if v)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
            f'<rect width="{n}" height="{n}" fill="{light}"/><path d="{path}" fill="{dark}"/></svg>')
