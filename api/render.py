"""Server-side encodings: depth PNG overlays (RGBA) and compact base64 grids."""
import base64
import io

import numpy as np
from PIL import Image

# depth (m) -> colour stops; transparent below 5 cm. 1 ft = 0.305 m is the "flooded" line.
STOPS = np.array([0.05, 0.15, 0.305, 0.6, 1.0, 2.0])
COLORS = np.array([
    [165, 230, 255, 90],
    [96, 196, 255, 150],
    [38, 132, 255, 190],
    [24, 80, 220, 215],
    [52, 30, 170, 230],
    [90, 10, 120, 240],
], float)


def depth_rgba(h):
    h = np.asarray(h, float)
    out = np.zeros(h.shape + (4,), np.uint8)
    wet = h >= STOPS[0]
    x = np.clip(h[wet], STOPS[0], STOPS[-1])
    for ch in range(4):
        out[..., ch][wet] = np.interp(x, STOPS, COLORS[:, ch]).astype(np.uint8)
    return out


def png_b64(rgba, scale=4):
    img = Image.fromarray(rgba, "RGBA")
    if scale > 1:  # nearest keeps 10 m cells crisp on the map
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def depth_png_b64(h, scale=4):
    return png_b64(depth_rgba(h), scale)


def grid_mm_b64(h):
    """Depth grid as little-endian uint16 millimetres, row-major, base64."""
    mm = np.clip(np.rint(np.asarray(h) * 1000.0), 0, 65535).astype("<u2")
    return base64.b64encode(mm.tobytes()).decode()


def grid_f32_b64(a):
    return base64.b64encode(np.asarray(a, "<f4").tobytes()).decode()


def mask_b64(m):
    return base64.b64encode(np.asarray(m, np.uint8).tobytes()).decode()
