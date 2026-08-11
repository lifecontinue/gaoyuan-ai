#!/usr/bin/env python3
"""
生成 northgarden 风格的背景图案与音效素材。
输出：
  assets/img/ng-pattern.svg   暖米色有机植物无缝纹理
  assets/audio/ng-ambient.wav 轻柔循环环境音
  assets/audio/ng-chime.wav   短促交互提示音
"""

import math
import os
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_IMG = ROOT / "assets" / "img" / "ng-pattern.svg"
OUT_AUDIO_AMBIENT = ROOT / "assets" / "audio" / "ng-ambient.wav"
OUT_AUDIO_CHIME = ROOT / "assets" / "audio" / "ng-chime.wav"

# ------------------------------------------------------------------- SVG
def _rot(p, angle, cx=0, cy=0):
    x, y = p[0] - cx, p[1] - cy
    return (
        x * math.cos(angle) - y * math.sin(angle) + cx,
        x * math.sin(angle) + y * math.cos(angle) + cy,
    )


def leaf_path(cx, cy, angle, length, width, bend=0.22, wobble=0.12):
    """返回一片手绘感叶子的 path d 字符串。"""
    # 局部坐标：叶子从 (0,0) 向上生长到 (0,-length)
    half_w = width / 2
    tip_bend = length * bend * (random.random() * 2 - 1)
    tip_x = tip_bend
    tip_y = -length

    # 控制点抖动
    c1x = -half_w + wobble * half_w * (random.random() * 2 - 1)
    c1y = -length * 0.38
    c2x = half_w + wobble * half_w * (random.random() * 2 - 1)
    c2y = -length * 0.38

    pts = [(0, 0), (c1x, c1y), (tip_x, tip_y), (c2x, c2y), (0, 0)]
    rotated = [_rot(p, angle, 0, 0) for p in pts]
    shifted = [(x + cx, y + cy) for x, y in rotated]

    d = f"M {shifted[0][0]:.2f} {shifted[0][1]:.2f}"
    d += f" Q {shifted[1][0]:.2f} {shifted[1][1]:.2f}, {shifted[2][0]:.2f} {shifted[2][1]:.2f}"
    d += f" Q {shifted[3][0]:.2f} {shifted[3][1]:.2f}, {shifted[4][0]:.2f} {shifted[4][1]:.2f}"
    return d


def rosette(cx, cy, n=6, length=70, width=16):
    paths = []
    base = random.random() * math.tau
    for i in range(n):
        angle = base + (math.tau / n) * i + (random.random() * 0.35 - 0.175)
        paths.append(
            f'<path d="{leaf_path(cx, cy, angle, length * (0.85 + random.random() * 0.35), width * (0.85 + random.random() * 0.3))}" '
            f'stroke-width="{1.2 + random.random() * 0.8:.2f}"/>'
        )
    # 中心小圆
    paths.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{2.5 + random.random() * 1.5:.2f}" fill="#1a1a1a" stroke="none"/>')
    return "\n".join(paths)


def spray(cx, cy, angle, n=5, length=60):
    paths = []
    for i in range(n):
        a = angle + (i - n / 2) * 0.45 + (random.random() * 0.3 - 0.15)
        l = length * (0.7 + random.random() * 0.5)
        paths.append(
            f'<path d="{leaf_path(cx, cy, a, l, 11 + random.random() * 6, bend=0.18)}" '
            f'stroke-width="{1.0 + random.random() * 0.8:.2f}"/>'
        )
    return "\n".join(paths)


def ring(cx, cy, n=7, radius=45):
    paths = []
    for i in range(n):
        a = (math.tau / n) * i + random.random() * 0.3
        sx = cx + math.cos(a) * radius * 0.7
        sy = cy + math.sin(a) * radius * 0.7
        ex = cx + math.cos(a) * radius * (1.1 + random.random() * 0.25)
        ey = cy + math.sin(a) * radius * (1.1 + random.random() * 0.25)
        # 让笔画有点弧度
        mx = (sx + ex) / 2 + math.cos(a + math.pi / 2) * 8
        my = (sy + ey) / 2 + math.sin(a + math.pi / 2) * 8
        paths.append(
            f'<path d="M {sx:.2f} {sy:.2f} Q {mx:.2f} {my:.2f}, {ex:.2f} {ey:.2f}" '
            f'stroke-width="{1.4 + random.random() * 0.6:.2f}" stroke-linecap="round"/>'
        )
    return "\n".join(paths)


def generate_pattern():
    random.seed(7)
    size = 1200
    margin = 120

    clusters = []
    specs = [
        (rosette, 220, 220, 7, 75, 18),
        (rosette, 900, 180, 6, 65, 15),
        (rosette, 580, 620, 8, 85, 20),
        (rosette, 150, 950, 6, 60, 14),
        (rosette, 980, 920, 7, 70, 16),
        (spray, 420, 180, 0.9, 5, 55),
        (spray, 780, 420, 2.4, 5, 50),
        (spray, 250, 620, -0.8, 5, 48),
        (spray, 1050, 520, 1.6, 5, 52),
        (ring, 600, 320, 7, 42),
        (ring, 110, 430, 8, 38),
        (ring, 920, 720, 7, 40),
        (ring, 360, 820, 8, 36),
    ]

    for spec in specs:
        func, *args = spec
        clusters.append(func(*args))

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect width="100%" height="100%" fill="#f2efe7"/>
  <g fill="none" stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" opacity="0.055">
    {"\n    ".join(clusters)}
  </g>
</svg>
'''
    return svg


# ------------------------------------------------------------------- Audio
def write_wav(path, samples, rate=22050):
    os.makedirs(path.parent, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = []
        for s in samples:
            s = max(-1.0, min(1.0, s))
            frames.append(struct.pack("<h", int(s * 32767)))
        w.writeframes(b"".join(frames))


def generate_ambient(duration=12.0, rate=22050):
    # 柔和 pad：几个低音乐音 + 慢速颤音/震音
    freqs = [110.00, 164.81, 196.00, 261.63]  # A2, E3, G3, C4
    amps = [0.14, 0.10, 0.07, 0.05]
    total = int(duration * rate)
    samples = []
    for i in range(total):
        t = i / rate
        s = 0.0
        for f, a in zip(freqs, amps):
            detune = 1.0 + 0.003 * math.sin(2 * math.pi * 0.13 * t + f * 0.07)
            s += a * math.sin(2 * math.pi * f * detune * t)
        # 慢速震音
        s *= 0.82 + 0.18 * math.sin(2 * math.pi * 0.048 * t)
        samples.append(s)
    return samples


def generate_chime(duration=0.75, rate=22050, freq=528.0):
    total = int(duration * rate)
    samples = []
    for i in range(total):
        t = i / rate
        env = math.exp(-4.2 * t)
        s = 0.0
        s += 0.50 * math.sin(2 * math.pi * freq * t) * env
        s += 0.22 * math.sin(2 * math.pi * freq * 2.0 * t) * (env ** 1.25)
        s += 0.10 * math.sin(2 * math.pi * freq * 3.0 * t) * (env ** 1.55)
        s += 0.06 * math.sin(2 * math.pi * freq * 4.5 * t) * (env ** 2.0)
        # 轻微闪烁
        s *= 0.94 + 0.06 * math.sin(2 * math.pi * 9 * t)
        samples.append(s * 0.45)
    return samples


if __name__ == "__main__":
    OUT_IMG.write_text(generate_pattern(), encoding="utf-8")
    print(f"pattern -> {OUT_IMG} ({OUT_IMG.stat().st_size} bytes)")

    write_wav(OUT_AUDIO_AMBIENT, generate_ambient())
    print(f"ambient -> {OUT_AUDIO_AMBIENT} ({OUT_AUDIO_AMBIENT.stat().st_size} bytes)")

    write_wav(OUT_AUDIO_CHIME, generate_chime())
    print(f"chime   -> {OUT_AUDIO_CHIME} ({OUT_AUDIO_CHIME.stat().st_size} bytes)")
