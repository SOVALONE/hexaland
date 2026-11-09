#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Збирає браузерну версію Hexaland для itch.io (гра на одному екрані + боти).

    python build_itch.py      ->  dist/hexaland-itch.zip

На itch.io: Create new project → Kind of project: HTML → завантаж цей zip → постав
«This file will be played in the browser».
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = ["index.html", "table.html", "client.html", "hex.js", "net.js", "engine.js"]
ASSETS = ["logo.svg", "hexaland.ico", "icon-180.png", "logo-512.png", "nosleep.mp4", "nosleep.webm"]


def main():
    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "hexaland-itch.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in WEB:
            z.write(os.path.join(ROOT, "web", name), name)           # index.html — у корені архіву
        for name in ASSETS:
            z.write(os.path.join(ROOT, "assets", name), "assets/" + name)
    print("Готово:", out, f"({os.path.getsize(out) // 1024} КБ)")


if __name__ == "__main__":
    main()
