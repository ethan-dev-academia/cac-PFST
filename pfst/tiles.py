"""Tile catalog: which real tiles are used for training / held out, plus per-tile metadata.

`python -m pfst.tiles build` surveys west Pasco, downloads DEMs, counts buildings and
writes pfst/tiles.json (committed). Everything else reads the catalog.
"""
import argparse
import json
import pathlib
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from scipy import ndimage

from . import dem, geo, layers

CATALOG = pathlib.Path(__file__).with_name("tiles.json")

# West Pasco study area (lon/lat)
STUDY_BBOX = (-82.80, 28.17, -82.62, 28.44)
PLACES = {  # rough centres, for labelling only
    "Aripeka": (-82.66, 28.43), "Hudson": (-82.69, 28.36), "Sea Pines": (-82.70, 28.32),
    "Bayonet Point": (-82.68, 28.33), "Port Richey": (-82.72, 28.27),
    "New Port Richey": (-82.72, 28.24), "Holiday": (-82.74, 28.19),
}
# Open Gulf / tidal water: connected to the tile edge and below this elevation (m NAVD88)
COAST_Z = 0.0
COAST_MIN_CELLS = 64


def surge_mask(z):
    """Cells of open coastal water: z < COAST_Z, in a component touching the edge."""
    low = z < COAST_Z
    lab, n = ndimage.label(low)
    if n == 0:
        return np.zeros_like(low)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndimage.sum(low, lab, index=np.arange(1, n + 1))
    keep = [l for l in edge_labels if sizes[l - 1] >= COAST_MIN_CELLS]
    return np.isin(lab, keep)


def nearest_place(lon, lat):
    return min(PLACES, key=lambda k: (PLACES[k][0] - lon) ** 2 + (PLACES[k][1] - lat) ** 2)


def survey_tile(tid):
    try:
        z = dem.load_tile(tid)
    except dem.CoverageError:
        return None
    m = surge_mask(z)
    nb = layers.count("buildings", geo.tile_bbox_utm(tid))
    lon, lat = geo.tile_center_lonlat(tid)
    land = ~m & (z > COAST_Z)
    return {
        "id": tid, "lon": lon, "lat": lat, "place": nearest_place(lon, lat),
        "buildings": int(nb), "coastal": bool(m.sum() >= COAST_MIN_CELLS),
        "coast_cells": int(m.sum()), "land_frac": float(land.mean()),
        "z_p10": float(np.percentile(z, 10)), "z_median": float(np.median(z)),
        "z_max": float(z.max()),
        "slope_p99": float(np.percentile(np.hypot(*np.gradient(z, geo.DX)), 99)),
    }


def candidates():
    x0, y0 = geo.lonlat_to_utm(STUDY_BBOX[0], STUDY_BBOX[1])
    x1, y1 = geo.lonlat_to_utm(STUDY_BBOX[2], STUDY_BBOX[3])
    return [geo.tile_id(ix, iy)
            for ix in range(int(x0 // geo.TILE_M), int(x1 // geo.TILE_M) + 1)
            for iy in range(int(y0 // geo.TILE_M), int(y1 // geo.TILE_M) + 1)]


def select(survey, n_train=40, n_test=8, seed=0):
    """Populated tiles, low ground first, all coastal populated tiles included.

    Held-out tiles are drawn across places so the test set spans the study area.
    """
    pop = [s for s in survey if s["buildings"] >= 150 and s["land_frac"] > 0.3]
    coastal = [s for s in pop if s["coastal"]]
    inland = sorted([s for s in pop if not s["coastal"]], key=lambda s: s["z_median"])
    chosen = coastal + inland[: max(0, n_train + n_test - len(coastal))]
    chosen = chosen[: n_train + n_test]
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(chosen))
    test_ids, places_used = set(), set()
    for k in order:  # one test tile per place first, then fill
        s = chosen[k]
        if len(test_ids) < n_test and s["place"] not in places_used:
            test_ids.add(s["id"]); places_used.add(s["place"])
    for k in order:
        if len(test_ids) < n_test:
            test_ids.add(chosen[k]["id"])
    for s in chosen:
        s["split"] = "test" if s["id"] in test_ids else "train"
    return chosen


def load_catalog():
    return json.loads(CATALOG.read_text())


def tile_info(tid):
    for s in load_catalog()["tiles"]:
        if s["id"] == tid:
            return s
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build"])
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    cands = candidates()
    print(f"surveying {len(cands)} candidate tiles")
    with ThreadPoolExecutor(args.workers) as ex:
        survey = [s for s in ex.map(survey_tile, cands) if s is not None]
    chosen = select(survey)
    CATALOG.write_text(json.dumps({"study_bbox": STUDY_BBOX, "tiles": chosen,
                                   "survey": survey}, indent=1))
    n_c = sum(s["coastal"] for s in chosen)
    print(f"chose {len(chosen)} tiles ({n_c} coastal), "
          f"{sum(s['split'] == 'test' for s in chosen)} held out -> {CATALOG}")


if __name__ == "__main__":
    main()
