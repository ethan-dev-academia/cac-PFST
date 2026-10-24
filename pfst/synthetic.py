"""Synthetic DEM tiles with Pasco-like relief, for dataset diversity.

Smooth bumps and hollows on a gentle tilt, with lidar-scale noise; half of them get a
coastline (ground falling below sea level toward one edge) so surge is exercised.
"""
import numpy as np
from scipy import ndimage

from . import dem, geo


def synthetic_tile(rng):
    n = geo.N
    yy, xx = np.mgrid[0:n, 0:n] / (n - 1)
    z = np.zeros((n, n))
    for _ in range(rng.integers(4, 14)):
        cy, cx = rng.uniform(-0.1, 1.1, 2)
        s = rng.uniform(0.05, 0.3)
        z += rng.normal(0, 1.5) * np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * s * s))
    z += ndimage.gaussian_filter(rng.normal(0, 1, (n, n)), rng.uniform(3, 8)) * rng.uniform(2, 8)
    ang = rng.uniform(0, 2 * np.pi)
    ramp = np.cos(ang) * xx + np.sin(ang) * yy
    z += rng.uniform(0, 6) * ramp
    z = (z - z.min()) / max(np.ptp(z), 1e-6) * rng.uniform(2.0, 9.0) + rng.uniform(0.3, 2.0)
    if rng.random() < 0.5:  # coastline: lower one side below sea level
        side = rng.integers(4)
        d = [yy, 1 - yy, xx, 1 - xx][side]
        width = rng.uniform(0.1, 0.35)
        z = np.where(d < width, np.minimum(z, -0.9 + (d / width) * (z + 0.9) * 0.6), z)
    z += rng.normal(0, 0.03, (n, n))
    return dem.light_fill(z)
