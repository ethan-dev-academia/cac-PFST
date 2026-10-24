"""Scenario -> solver inputs. Shared by the dataset generator and the API's solver backend.

A scenario is plain data:
    rain_in      24-hr rainfall depth (in), SCS Type III, peak at t = 12 h
    surge_ft     peak water level at the coast (ft NAVD88); <= tide means no surge
    edits        list of dicts in tile cell coordinates (row, col floats):
                   {"type": "pond", "center": [r, c], "radius": cells, "depth_m": m}
                   {"type": "road", "path": [[r, c], ...], "width": cells, "raise_m": m}
                   {"type": "culvert", "a": [r, c], "b": [r, c], "diameter_m": m}
Fixed physics (screening assumptions, see README): Manning n = 0.05, initial abstraction
0.5 in, infiltration 5 mm/hr, all tile edges open (free outfall), 20-h simulation.
"""
import numpy as np
from scipy import ndimage

from floodsolver.solver import run

from . import geo, rainfall, surge, tiles

MANNING_N = 0.05
IA_M = 0.5 * rainfall.IN
FC_MS = 5.0 / 1000 / 3600
T_END = 20 * 3600.0  # peak depth is reached by then: <2 cm change after 20 h in worst-case checks
T_PEAK = 12 * 3600.0
OPEN = {"N": "open", "S": "open", "E": "open", "W": "open"}


def _disk(center, radius):
    rr, cc = np.mgrid[0:geo.N, 0:geo.N]
    return (rr - center[0]) ** 2 + (cc - center[1]) ** 2 <= radius ** 2


def _polyline(path, width):
    m = np.zeros((geo.N, geo.N), bool)
    pts = np.asarray(path, float)
    for (r0, c0), (r1, c1) in zip(pts[:-1], pts[1:]):
        k = int(np.ceil(max(abs(r1 - r0), abs(c1 - c0)) * 2)) + 1
        for t in np.linspace(0, 1, k):
            r, c = r0 + t * (r1 - r0), c0 + t * (c1 - c0)
            ri, ci = int(round(r)), int(round(c))
            if 0 <= ri < geo.N and 0 <= ci < geo.N:
                m[ri, ci] = True
    if width > 1:
        m = ndimage.binary_dilation(m, iterations=int(round((width - 1) / 2)) or 1)
    return m


def apply_edits(z, edits):
    """(dz, culvert links) from edit dicts. Ponds are excavated to a flat floor."""
    dz = np.zeros_like(z)
    culverts = []
    for e in edits or ():
        t = e["type"]
        if t == "pond":
            m = _disk(e["center"], e.get("radius", 4))
            floor = z[m].min() - e.get("depth_m", 2.0)
            dz[m] = np.minimum(dz[m], floor - z[m])
        elif t == "road":
            m = _polyline(e["path"], e.get("width", 1.5))
            dz[m] = np.maximum(dz[m], e.get("raise_m", 0.5))
        elif t == "culvert":
            (ra, ca), (rb, cb) = [[int(round(v)) for v in p] for p in (e["a"], e["b"])]
            if not all(0 <= v < geo.N for v in (ra, ca, rb, cb)):
                continue
            d = e.get("diameter_m", 0.9)
            z_inv = min(z[ra, ca], z[rb, cb])
            culverts.append((ra, ca, rb, cb, np.pi * d * d / 4, 0.6, z_inv))
        else:
            raise ValueError(f"unknown edit type {t!r}")
    return dz, culverts


def solve(z, rain_in, surge_ft, edits=(), coast=None, record_every=None):
    """Run the solver for one scenario. Returns (Result, inputs dict)."""
    dz, culverts = apply_edits(z, edits)
    if coast is None:
        coast = tiles.surge_mask(z)
    storm = rainfall.design_storm(total_in=max(rain_in, 0.0))
    s_fn = surge.surge_from_ft(surge_ft, t_peak=T_PEAK)
    kw = {}
    if coast.any():
        kw = {"surge_mask": coast, "surge_fn": s_fn}
        h0 = np.where(coast, np.maximum(s_fn(0.0) - (z + dz), 0.0), 0.0)
    else:
        h0 = None
    res = run(z, MANNING_N, geo.DX, storm, T_END, rain_breakpoints=storm.breakpoints,
              dz=dz, edges=OPEN, culverts=culverts, Ia=IA_M, f_c=FC_MS, h0=h0,
              record_every=record_every, **kw)
    inputs = {"dz": dz, "coast": coast, "rain_in": float(rain_in),
              "surge_ft": float(surge_ft), "n_culverts": len(culverts)}
    return res, inputs


def depth_above_ground(res, z, inputs):
    """h_max with permanent open water (coastal Dirichlet cells) masked to 0."""
    h = res.h_max.copy()
    h[inputs["coast"]] = 0.0
    return h
