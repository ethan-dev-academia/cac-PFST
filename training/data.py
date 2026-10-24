"""Dataset of solver runs for FNO training (reads data/dataset/{train,test}/*.npz)."""
import pathlib
import sys

import numpy as np
import torch
from torch.utils.data import Dataset

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pfst.features import make_inputs  # noqa: E402

DX2 = 100.0  # cell area, m²


def load_sample(path):
    d = np.load(path, allow_pickle=False)
    x = make_inputs(d["z"], d["dz"], d["coast"], float(d["rain_in"]), float(d["surge_ft"]))
    y = np.stack([d["h_max"], d["h_final"]]).astype(np.float32)
    land = (~d["coast"]).astype(np.float32)[None]
    # Mass balance target for the physics term: stored volume at the end of the event.
    # The solver closes §6 to < 1e-10, so this equals
    # V0 + rain - infiltration - outflow + boundary inflow (all from the run's budget).
    v_final = float(d["h_final"].sum()) * DX2
    phys = np.array([v_final, float(d["budget_V_ref"])], np.float32)
    return x, y, land, phys


class FloodDataset(Dataset):
    """In-memory (the full set is ~3k x 9 x 64 KB ≈ 1.7 GB float32; use preload=False if short)."""

    def __init__(self, split, root=ROOT / "data" / "dataset", augment=False, preload=True, limit=None):
        self.files = sorted((pathlib.Path(root) / split).glob("s*.npz"))
        self.files = [f for f in self.files if not f.name.endswith(".tmp.npz")][:limit]
        if not self.files:
            raise FileNotFoundError(f"no samples in {pathlib.Path(root) / split}")
        self.augment = augment
        self.cache = [load_sample(f) for f in self.files] if preload else None

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        x, y, land, phys = self.cache[i] if self.cache is not None else load_sample(self.files[i])
        if self.augment:  # dihedral group: physics is invariant to rotations/reflections
            k = np.random.randint(4)
            x, y, land = (np.rot90(a, k, axes=(1, 2)) for a in (x, y, land))
            if np.random.rand() < 0.5:
                x, y, land = (a[:, :, ::-1] for a in (x, y, land))
        return (torch.from_numpy(np.ascontiguousarray(x)), torch.from_numpy(np.ascontiguousarray(y)),
                torch.from_numpy(np.ascontiguousarray(land)), torch.from_numpy(phys))
