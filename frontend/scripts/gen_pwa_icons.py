"""Genera los iconos PWA (pwa-192.png y pwa-512.png) que el manifest referencia.

El favicon.svg original (logo de marca) usa filtros de desenfoque gaussiano y
colores display-p3 que los rasterizadores puros-Python no reproducen bien, así
que aquí dibujamos un icono temático de "portfolio tracker" (gráfico ascendente)
con los colores del tema. Para un icono de marca pixel-perfect, usar
https://realfavicongenerator.net/ con public/favicon.svg.

Uso:
    python frontend/scripts/gen_pwa_icons.py

Requiere: Pillow.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "public"

# Paleta del tema (ver index.css / vite.config.ts theme_color #1a1f2e)
BG_TOP = (26, 31, 46)       # #1a1f2e
BG_BOTTOM = (15, 18, 28)    # un poco más oscuro para degradado sutil
ACCENT = (134, 59, 255)     # #863bff (morado de marca)
ACCENT_2 = (71, 191, 255)   # #47bfff (cian de acento)
GRID = (255, 255, 255, 22)  # rejilla muy tenue

SS = 4  # supersampling para bordes suaves


def _vertical_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        grad.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return grad.resize((size, size))


def _rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(size: int) -> Image.Image:
    S = size * SS
    radius = int(S * 0.22)

    base = _vertical_gradient(S, BG_TOP, BG_BOTTOM).convert("RGBA")
    draw = ImageDraw.Draw(base)

    # Zona segura para contenido (maskable): 80% central
    pad = int(S * 0.20)
    inner = S - 2 * pad

    def px(fx: float, fy: float) -> tuple[float, float]:
        """Coordenada fraccional (0-1) dentro de la zona segura -> píxel absoluto."""
        return pad + fx * inner, pad + fy * inner

    # Línea de cero / eje sutil
    draw.line([px(0.0, 1.0), px(1.0, 1.0)], fill=(255, 255, 255, 28), width=max(2, S // 200))

    # Gráfico ascendente (línea quebrada con tendencia alcista)
    pts_frac = [(0.02, 0.78), (0.22, 0.62), (0.40, 0.70), (0.58, 0.40), (0.78, 0.48), (0.98, 0.10)]
    pts = [px(x, y) for x, y in pts_frac]

    # Relleno bajo la curva (área) con el morado translúcido
    area = pts + [px(0.98, 1.0), px(0.02, 1.0)]
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(overlay).polygon(area, fill=(ACCENT[0], ACCENT[1], ACCENT[2], 60))
    base = Image.alpha_composite(base, overlay)
    draw = ImageDraw.Draw(base)

    # La línea principal
    lw = max(3, int(S * 0.035))
    draw.line(pts, fill=ACCENT_2, width=lw, joint="curve")

    # Puntos / nodos
    r = lw * 1.1
    for i, (x, y) in enumerate(pts):
        color = ACCENT if i != len(pts) - 1 else ACCENT_2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)

    # Flecha en el extremo superior derecho (indicando alza)
    ex, ey = pts[-1]
    a = lw * 2.6
    draw.polygon([(ex, ey - a * 1.1), (ex - a * 0.9, ey + a * 0.2), (ex + a * 0.9, ey + a * 0.2)], fill=ACCENT_2)

    # Recorte a esquinas redondeadas
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.paste(base, (0, 0), _rounded_mask(S, radius))

    return out.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        icon = make_icon(size)
        dest = OUT_DIR / f"pwa-{size}.png"
        icon.save(dest, "PNG")
        print(f"escrito {dest} ({size}x{size})")


if __name__ == "__main__":
    main()
