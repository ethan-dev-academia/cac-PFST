"""Generate the FNO training set: sampled scenarios -> solver -> .npz.

    python -m pfst.generate --n 3000 --workers 18

Resumable: sample k is fully determined by (seed, k) and is skipped if its file exists.
Output data/dataset/{train,test}/s{k:05d}.npz, one file per scenario, float32:
    z         (128,128) terrain, m NAVD88 (before edits)
    dz        (128,128) edit elevation change, m (ponds < 0, raised roads > 0)
    coast     (128,128) bool, Dirichlet surge cells
    h_max     (128,128) max depth over the event, m (coast cells included)
    h_final   (128,128) depth at t = 20 h, m
    eta_max   (128,128) max water-surface elevation, m
    t_wet     (128,128) first-wet time, s (-1 = never)
    rain_in, surge_ft, tile, synthetic, budget_* scalars
"""
import argparse
import json
import os
import pathlib
import time
import traceback

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np  # noqa: E402

from . import dem, geo, rainfall, scenario, surge, synthetic, tiles  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "dataset"
P_SYNTHETIC = 0.15


def sample(k, seed, catalog):
    """Scenario k (deterministic). Returns (z, meta, edits)."""
    rng = np.random.default_rng([seed, k])
    if rng.random() < P_SYNTHETIC:
        z = synthetic.synthetic_tile(rng)
        meta = {"tile": f"synthetic-{k}", "synthetic": True, "split": "train"}
    else:
        t = catalog[rng.integers(len(catalog))]
        z = dem.load_tile(t["id"])
        meta = {"tile": t["id"], "synthetic": False, "split": t["split"]}
    coast = tiles.surge_mask(z)

    # rainfall: a return period, then a depth anywhere in its 90% CI (covers the ensemble)
    has_coast = coast.sum() >= tiles.COAST_MIN_CELLS
    if has_coast and rng.random() < 0.12:
        rain_in = 0.0                                   # surge only
    else:
        rp = rainfall.RETURN_PERIODS[rng.integers(len(rainfall.RETURN_PERIODS))]
        _, lo, hi = rainfall.ATLAS14_24H[rp]
        rain_in = float(rng.uniform(lo, hi))
    # surge: peak level ft NAVD88; ~60% of coastal scenarios carry a surge
    if has_coast and (rain_in == 0.0 or rng.random() < 0.6):
        surge_ft = float(rng.uniform(1.5, 10.0))
    else:
        surge_ft = surge.TIDE_M / geo.FT

    edits = []
    land = ~coast & (z > 0.3)
    land_cells = np.argwhere(land)
    if len(land_cells) and rng.random() < 0.4:
        # ponds favour low ground: choose among the lowest 40% of land cells
        low = land_cells[np.argsort(z[land])[: max(1, int(0.4 * len(land_cells)))]]
        for _ in range(rng.integers(1, 4)):
            c = low[rng.integers(len(low))]
            edits.append({"type": "pond", "center": c.tolist(), "radius": float(rng.uniform(2, 7)),
                          "depth_m": float(rng.uniform(1.0, 3.0))})
    if len(land_cells) and rng.random() < 0.3:
        p0 = land_cells[rng.integers(len(land_cells))]
        path = [p0.tolist()]
        for _ in range(rng.integers(1, 3)):
            ang = rng.uniform(0, 2 * np.pi)
            L = rng.uniform(15, 60)
            path.append([path[-1][0] + L * np.sin(ang), path[-1][1] + L * np.cos(ang)])
        edits.append({"type": "road", "path": path, "width": float(rng.uniform(1, 3)),
                      "raise_m": float(rng.uniform(0.3, 1.2))})
    meta.update(rain_in=rain_in, surge_ft=surge_ft)
    return z, coast, meta, edits


def work(job):
    k, seed, catalog = job
    try:
        z, coast, meta, edits = sample(k, seed, catalog)
        path = OUT / meta["split"] / f"s{k:05d}.npz"
        if path.exists():
            return k, "skip", 0.0
        t0 = time.time()
        res, inp = scenario.solve(z, meta["rain_in"], meta["surge_ft"], edits, coast=coast)
        b = res.budget
        rel = abs(b["residual"]) / b["V_ref"]
        if not np.isfinite(res.h_max).all() or rel > 1e-8:
            raise RuntimeError(f"bad run: rel residual {rel:.2e}")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp.npz")
        f32 = np.float32
        np.savez_compressed(
            tmp, z=z.astype(f32), dz=inp["dz"].astype(f32), coast=coast,
            h_max=res.h_max.astype(f32), h_final=res.h_final.astype(f32),
            eta_max=res.eta_max.astype(f32),
            t_wet=np.where(np.isfinite(res.t_wet_first), res.t_wet_first, -1).astype(f32),
            rain_in=meta["rain_in"], surge_ft=meta["surge_ft"], tile=meta["tile"],
            synthetic=meta["synthetic"], edits=json.dumps(edits),
            **{f"budget_{kk}": float(v) for kk, v in b.items()})
        os.replace(tmp, path)
        return k, "ok", time.time() - t0
    except Exception:
        return k, "error: " + traceback.format_exc(limit=3), 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3000)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    args = ap.parse_args()

    catalog = tiles.load_catalog()["tiles"]
    for t in catalog:  # warm the DEM cache in the parent
        dem.load_tile(t["id"])
    jobs = [(k, args.seed, catalog) for k in range(args.start, args.start + args.n)]
    from multiprocessing import Pool
    t0, done, errors = time.time(), 0, 0
    log = OUT / "generate.log"
    OUT.mkdir(parents=True, exist_ok=True)
    with Pool(args.workers) as pool, log.open("a") as lf:
        for k, status, wall in pool.imap_unordered(work, jobs):
            done += 1
            errors += status.startswith("error")
            line = f"{time.strftime('%H:%M:%S')} {done}/{len(jobs)} s{k:05d} {status[:400]} {wall:.0f}s"
            lf.write(line + "\n"); lf.flush()
            if status != "skip" or done % 100 == 0:
                el = time.time() - t0
                print(f"{line}  elapsed {el / 60:.1f} min, errors {errors}", flush=True)


if __name__ == "__main__":
    main()
