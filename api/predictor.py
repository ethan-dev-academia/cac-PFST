"""Prediction backends for the API.

FNOPredictor   models/fno.pt present: 30-member ensemble (rain within the Atlas 14 90% CI,
               surge ±2 ft, DEM noise ~ lidar RMSE) in one batched forward pass.
SolverPredictor no model yet: runs the real solver for 3 members (low / central / high),
               in parallel processes; ~1-2 min, so the API runs it as a background job.
Both return h_max statistics on land (coast cells are permanent water and masked out).
"""
import os
import pathlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy import ndimage

from pfst import features, geo, rainfall, scenario

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODEL_PATH = pathlib.Path(os.environ.get("PFST_MODEL", ROOT / "models" / "fno.pt"))
SURGE_SD_FT = 1.0       # ensemble surge spread, clipped to ±2 ft
DEM_NOISE_M = 0.10      # lidar RMSEz 0.33 ft
N_ENSEMBLE = 30


def rain_band(return_period=None, rain_in=None):
    """(central, low, high) 24-hr depth in inches."""
    if return_period is not None:
        return rainfall.ATLAS14_24H[int(return_period)]
    return rain_in, rain_in * 0.8, rain_in * 1.2


def _surge_has_effect(surge_ft):
    return surge_ft > scenario.surge.TIDE_M / geo.FT + 1e-6


class FNOPredictor:
    name = "fno"
    is_async = False

    def __init__(self, path=MODEL_PATH):
        import sys
        import torch
        sys.path.insert(0, str(ROOT / "training"))
        from model import load_checkpoint
        self.torch = torch
        torch.set_num_threads(max(1, (os.cpu_count() or 2) // 2))
        self.model, ck = load_checkpoint(path)
        self.info = {"epoch": ck.get("epoch"), "test": ck.get("test"), "path": str(path)}

    def predict(self, z, coast, dz, edits, rain, surge_ft, frames=False, seed=0):
        # culvert edits are not FNO inputs (v1); ponds and roads arrive through dz
        rng = np.random.default_rng(seed)
        c, lo, hi = rain
        mode = min(max(c, lo), hi)
        rains = rng.triangular(lo, mode, hi, N_ENSEMBLE) if hi > lo else np.full(N_ENSEMBLE, c)
        rains[0] = c
        if _surge_has_effect(surge_ft):
            surges = surge_ft + np.clip(rng.normal(0, SURGE_SD_FT, N_ENSEMBLE), -2, 2)
        else:
            surges = np.full(N_ENSEMBLE, surge_ft)
        surges[0] = surge_ft
        noise = ndimage.gaussian_filter(rng.normal(0, 1, (N_ENSEMBLE, geo.N, geo.N)), (0, 1.5, 1.5))
        noise *= DEM_NOISE_M / noise[1:].std()
        noise[0] = 0
        x = features.make_inputs_batch(z, dz, coast, rains, surges, z_noise=noise)
        with self.torch.no_grad():
            out = self.model(self.torch.from_numpy(x)).numpy()
        h = out[:, 0]
        h[:, coast] = 0.0
        return {"mean": h.mean(0), "p10": np.percentile(h, 10, axis=0),
                "p90": np.percentile(h, 90, axis=0), "central": h[0],
                "members": int(N_ENSEMBLE), "frames": None}


def _solve_member(args):
    z, rain_in, surge_ft, edits, coast, record = args
    res, inp = scenario.solve(z, rain_in, surge_ft, edits, coast=coast,
                              record_every=1200 if record else None)   # 20-min frames for the flood animation
    h = scenario.depth_above_ground(res, z, inp)
    frames = None
    if record:
        frames = [(t, np.where(coast, 0.0, hh)) for t, hh in res.snapshots if t >= 7 * 3600]
    return h, frames


class SolverPredictor:
    name = "solver"
    is_async = True

    def __init__(self, workers=3):
        self.pool = ProcessPoolExecutor(workers)
        self.info = {"members": 3, "note": "no trained model found; running the numpy solver"}

    def predict(self, z, coast, dz, edits, rain, surge_ft, frames=True, seed=0):
        c, lo, hi = rain
        if _surge_has_effect(surge_ft):
            s_lo, s_hi = max(surge_ft - 2, 0.0), surge_ft + 2
        else:
            s_lo = s_hi = surge_ft
        jobs = [(z, lo, s_lo, edits, coast, False), (z, c, surge_ft, edits, coast, frames),
                (z, hi, s_hi, edits, coast, False)]
        (h_lo, _), (h_c, fr), (h_hi, _) = list(self.pool.map(_solve_member, jobs))
        return {"mean": h_c, "p10": np.minimum(h_lo, h_c), "p90": np.maximum(h_hi, h_c),
                "central": h_c, "members": 3, "frames": fr}


def make_predictor():
    if MODEL_PATH.exists():
        try:
            return FNOPredictor(MODEL_PATH)
        except Exception as e:  # torch / neuralop missing or bad checkpoint
            print(f"[pfst] could not load {MODEL_PATH}: {e!r}; falling back to solver")
    return SolverPredictor()
