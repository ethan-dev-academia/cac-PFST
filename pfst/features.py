"""FNO input channels, shared by training and the API (numpy only, no torch).

Channels (all (128,128), float32, O(1) scale):
    0  z_eff / 5            terrain after edits, m NAVD88 (absolute: surge is absolute)
    1  (z_eff - median) / 2 local relief
    2  dz / 2               infrastructure edits (ponds < 0, raised roads > 0)
    3  rain_m / 0.3         24-hr rainfall total, uniform map
    4  coast                Dirichlet surge cells (0/1)
    5  coast * surge_m / 3  surge-boundary map: peak water level on coast cells
    6  surge_m / 3          peak water level, uniform map
Targets: h_max and h_final in metres (2 channels).
"""
import numpy as np

from .geo import FT
from .rainfall import IN

CHANNELS = ["z_eff", "relief", "dz", "rain", "coast", "surge_boundary", "surge_level"]
N_IN = len(CHANNELS)
N_OUT = 2


def make_inputs(z, dz, coast, rain_in, surge_ft):
    z_eff = z + dz
    rain_m = rain_in * IN
    surge_m = surge_ft * FT
    coast = coast.astype(np.float32)
    x = np.stack([
        z_eff / 5.0,
        (z_eff - np.median(z_eff)) / 2.0,
        dz / 2.0,
        np.full_like(z, rain_m / 0.3),
        coast,
        coast * surge_m / 3.0,
        np.full_like(z, surge_m / 3.0),
    ]).astype(np.float32)
    return x


def make_inputs_batch(z, dz, coast, rain_in, surge_ft, z_noise=None):
    """Stack of inputs for an ensemble: rain_in, surge_ft are 1-D arrays; z_noise (k,128,128)."""
    out = []
    for k in range(len(rain_in)):
        zk = z if z_noise is None else z + z_noise[k]
        out.append(make_inputs(zk, dz, coast, rain_in[k], surge_ft[k]))
    return np.stack(out)
