"""County-wide tile classification (every 1.28 km tile in the Pasco lidar coverage).

    python -m pfst.county

One coarse (40 m) DEM export of the whole county + a building count per tile ->
pfst/grid.json. Each tile gets a class:
    coastal   low-lying and touching open Gulf / tidal water (surge + rain)
    low       low-lying inland: 10th-percentile ground < LOW_M (rain-driven flooding)
    higher    higher ground: modeled on demand, lower flood exposure
Tiles with < 10 % lidar coverage (outside Pasco) are dropped.
"""
import io
import json
import pathlib
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
import tifffile
from scipy import ndimage

from . import dem, geo, layers

GRID = pathlib.Path(__file__).with_name("grid.json")
# tile index extent of the SWFWMD Pasco 2018 coverage (server extent, State Plane -> UTM 17N)
IX = (252, 311)
IY = (2434, 2463)
COARSE = 32          # pixels per tile edge in the coarse export (1280 m / 32 = 40 m)
LOW_M = 3.0          # "low-lying": 10th-percentile ground under ~10 ft NAVD88


def coarse_dem():
    """(ny*32, nx*32) metres, NaN outside coverage, row 0 = north edge of IY[1]."""
    nx, ny = IX[1] - IX[0], IY[1] - IY[0]
    x0, y0, x1, y1 = IX[0] * geo.TILE_M, IY[0] * geo.TILE_M, IX[1] * geo.TILE_M, IY[1] * geo.TILE_M
    r = requests.get(f"{dem.IMAGE_SERVER}/exportImage", timeout=180, params={
        "bbox": f"{x0},{y0},{x1},{y1}", "bboxSR": geo.UTM, "imageSR": geo.UTM,
        "size": f"{nx * COARSE},{ny * COARSE}", "format": "tiff", "pixelType": "F32",
        "interpolation": "RSP_BilinearInterpolation", "f": "image"})
    r.raise_for_status()
    a = tifffile.imread(io.BytesIO(r.content)).astype(float)
    bad = ~np.isfinite(a) | (a < dem.VALID_FT[0]) | (a > dem.VALID_FT[1])
    return np.where(bad, np.nan, a * geo.FT)


def classify(z):
    """Per-tile class from the coarse grid. Returns list of dicts (without buildings)."""
    nx, ny = IX[1] - IX[0], IY[1] - IY[0]
    # open water: nodata touching the export edge with a low rim, or ground below 0 m
    nod = np.isnan(z)
    lab, n = ndimage.label(nod)
    sea = np.zeros_like(nod)
    for k in range(1, n + 1):
        reg = lab == k
        rim = ndimage.binary_dilation(reg) & ~nod
        if rim.any() and np.median(z[rim]) < dem.SEA_RIM_FT * geo.FT:
            sea |= reg
    water = sea | (np.nan_to_num(z, nan=99) < 0.0)
    out = []
    for j in range(ny):
        for i in range(nx):
            blk = z[j * COARSE:(j + 1) * COARSE, i * COARSE:(i + 1) * COARSE]
            wblk = water[j * COARSE:(j + 1) * COARSE, i * COARSE:(i + 1) * COARSE]
            valid = np.isfinite(blk)
            sea_frac = float(sea[j * COARSE:(j + 1) * COARSE, i * COARSE:(i + 1) * COARSE].mean())
            if valid.mean() < 0.10 and sea_frac < 0.5:
                continue                                   # outside the county coverage
            land = valid & ~wblk
            if land.mean() < 0.03:
                cls = "water"
                z10 = zmed = None
            else:
                z10 = float(np.percentile(blk[land], 10))
                zmed = float(np.median(blk[land]))
                low = z10 < LOW_M
                cls = ("coastal" if wblk.mean() > 0.02 else "low") if low else "higher"
            tid = geo.tile_id(IX[0] + i, IY[1] - 1 - j)
            out.append({"id": tid, "cls": cls, "z10": None if z10 is None else round(z10, 2),
                        "zmed": None if zmed is None else round(zmed, 2),
                        "land": round(float(land.mean()), 3)})
    return out


def main():
    z = coarse_dem()
    grid = classify(z)
    todo = [g for g in grid if g["cls"] != "water"]
    print(f"{len(grid)} tiles in coverage; counting buildings in {len(todo)}")

    def count(g):
        try:
            g["b"] = int(layers.count("buildings", geo.tile_bbox_utm(g["id"])))
        except Exception:
            g["b"] = None
        return g
    with ThreadPoolExecutor(12) as ex:
        list(ex.map(count, todo))
    for g in grid:
        g.setdefault("b", 0)
        lon, lat = geo.tile_center_lonlat(g["id"])
        g["lon"], g["lat"] = round(lon, 5), round(lat, 5)
    GRID.write_text(json.dumps({"low_m": LOW_M, "tiles": grid}, separators=(",", ":")))
    from collections import Counter
    c = Counter(g["cls"] for g in grid)
    b = Counter()
    for g in grid:
        b[g["cls"]] += g["b"] or 0
    print({k: (c[k], b[k]) for k in c}, "->", GRID)


if __name__ == "__main__":
    main()
