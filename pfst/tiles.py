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
    "Trinity": (-82.67, 28.18), "Odessa": (-82.59, 28.19), "Shady Hills": (-82.55, 28.41),
    "Spring Hill": (-82.58, 28.46), "Land O' Lakes": (-82.46, 28.22), "Lutz": (-82.46, 28.15),
    "Wesley Chapel": (-82.33, 28.24), "Zephyrhills": (-82.18, 28.23), "Dade City": (-82.20, 28.36),
    "San Antonio": (-82.27, 28.34),
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


# sampling weight per class when drawing training scenarios ("coastal first")
CLASS_WEIGHT = {"coastal": 2.0, "low": 1.0, "higher": 0.4}
N_HIGHER = 24        # populated higher-ground tiles mixed in so the model generalises inland
TEST_FRAC = 0.12


def select(grid_tiles, survey_by_id, seed=0):
    """Training catalog: every low-lying tile + a sample of populated higher-ground tiles.

    Classes come from the county grid (pfst/grid.json); the precise surge mask and stats
    from the full-resolution survey. Held-out tiles are drawn per class and place.
    """
    rng = np.random.default_rng(seed)
    low = [g for g in grid_tiles if g["cls"] in ("coastal", "low") and g["id"] in survey_by_id]
    higher = [g for g in grid_tiles if g["cls"] == "higher" and (g.get("b") or 0) >= 100
              and g["id"] in survey_by_id]
    higher = [higher[k] for k in rng.permutation(len(higher))[:N_HIGHER]]
    chosen = []
    for g in low + higher:
        s = dict(survey_by_id[g["id"]])
        s["cls"] = g["cls"]
        s["weight"] = CLASS_WEIGHT[g["cls"]]
        chosen.append(s)
    # held-out: stratified by (class, place), ~TEST_FRAC of each stratum, at least one per class
    strata = {}
    for s in chosen:
        strata.setdefault((s["cls"], s["place"]), []).append(s)
    for s in chosen:
        s["split"] = "train"
    for key, group in sorted(strata.items()):
        k = int(round(len(group) * TEST_FRAC))
        for i in rng.permutation(len(group))[:k]:
            group[i]["split"] = "test"
    for cls in CLASS_WEIGHT:
        group = [s for s in chosen if s["cls"] == cls]
        if group and not any(s["split"] == "test" for s in group):
            group[rng.integers(len(group))]["split"] = "test"
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
    from . import county
    grid = json.loads(county.GRID.read_text())["tiles"]
    rng = np.random.default_rng(1)
    higher = [g for g in grid if g["cls"] == "higher" and (g.get("b") or 0) >= 100]
    cands = [g["id"] for g in grid if g["cls"] in ("coastal", "low")]
    cands += [higher[k]["id"] for k in rng.permutation(len(higher))[:N_HIGHER * 2]]
    print(f"surveying {len(cands)} tiles at full resolution")
    with ThreadPoolExecutor(args.workers) as ex:
        survey = [s for s in ex.map(survey_tile, cands) if s is not None]
    chosen = select(grid, {s["id"]: s for s in survey})
    CATALOG.write_text(json.dumps({"source": "pfst/grid.json", "class_weight": CLASS_WEIGHT,
                                   "tiles": chosen}, indent=1))
    from collections import Counter
    print(f"chose {len(chosen)} tiles {dict(Counter(s['cls'] for s in chosen))}, "
          f"{sum(s['split'] == 'test' for s in chosen)} held out -> {CATALOG}")


if __name__ == "__main__":
    main()
