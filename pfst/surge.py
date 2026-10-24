"""Storm-surge boundary: the Helene hydrograph at Clearwater Beach (NOAA 8726724), rescaled.

Water levels are metres NAVD88. The gauge record (6-min, verified) is committed as
helene_8726724.csv; peak 2.322 m (7.62 ft) at 2024-09-27 03:00 UTC.
"""
import csv
import pathlib
from functools import lru_cache

import numpy as np

from .geo import FT

CSV = pathlib.Path(__file__).with_name("helene_8726724.csv")
# Station datums (NAVD88 = 3.52 ft above STND): MSL -0.32 ft, MHW +0.61 ft NAVD88
MSL_M = -0.32 * FT
MHW_M = 0.61 * FT
HELENE_PEAK_FT = 7.62
TIDE_M = MHW_M  # background still-water level used when there is no surge


@lru_cache(maxsize=None)
def helene_record():
    """(t_rel_s, wl_m): seconds relative to the peak, water level m NAVD88."""
    with CSV.open() as f:
        rows = [r for r in csv.reader(f)][1:]
    t = np.array([np.datetime64(r[0].strip().replace(" ", "T")) for r in rows if r[1].strip()])
    wl = np.array([float(r[1]) for r in rows if r[1].strip()])
    k = int(np.argmax(wl))
    return (t - t[k]).astype("timedelta64[s]").astype(float), wl


class Surge:
    """surge_fn(t) -> water-surface elevation (m NAVD88).

    The Helene record, rescaled about the background tide so its peak equals
    `peak_m`, with the peak at simulation time `t_peak`. Outside the record: tide.
    """

    def __init__(self, peak_m, t_peak=12 * 3600.0, tide_m=TIDE_M):
        self.peak_m = float(peak_m)
        self.t_peak = float(t_peak)
        self.tide_m = float(tide_m)
        t_rel, wl = helene_record()
        scale = (self.peak_m - tide_m) / (wl.max() - tide_m)
        self.t = t_rel + self.t_peak
        self.wl = tide_m + np.maximum(wl - tide_m, 0.0) * max(scale, 0.0)

    def __call__(self, t):
        if self.peak_m <= self.tide_m:
            return self.tide_m
        return float(np.interp(t, self.t, self.wl, left=self.tide_m, right=self.tide_m))


def surge_from_ft(peak_ft, **kw):
    return Surge(peak_ft * FT, **kw)
