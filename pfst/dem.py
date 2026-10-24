"""DEM tiles from the SWFWMD Pasco 2018 lidar image server.

The server stores elevations in US survey feet (NAVD88). Everything returned
here is metres. Raw downloads are cached under data/dem/raw, processed tiles
under data/dem.
"""
import heapq
import io
import pathlib
import time

import numpy as np
import requests
import tifffile
from scipy import ndimage

from . import geo

IMAGE_SERVER = "https://www45.swfwmd.state.fl.us/arcgisimg/rest/services/DEM/PascoDEM18/ImageServer"
DATA = pathlib.Path(__file__).resolve().parents[1] / "data"
RAW_DIR = DATA / "dem" / "raw"
DEM_DIR = DATA / "dem"

# valid elevation range for the county in feet (server min is -4.07, max 301.9)
VALID_FT = (-20.0, 400.0)
# offshore nodata: filled as Gulf at this elevation; a rim below SEA_RIM_FT means "coast"
SEA_FT = -3.0
SEA_RIM_FT = 3.0
# sinks shallower than this are treated as lidar/resampling noise and filled
MAX_FILL_M = 0.10


def fetch_raw_ft(tid, retries=4):
    """128x128 float32 elevations in feet for tile `tid`, cached on disk."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{tid}.tif"
    if not path.exists():
        x0, y0, x1, y1 = geo.tile_bbox_utm(tid)
        params = {
            "bbox": f"{x0},{y0},{x1},{y1}", "bboxSR": geo.UTM, "imageSR": geo.UTM,
            "size": f"{geo.N},{geo.N}", "format": "tiff", "pixelType": "F32",
            "interpolation": "RSP_BilinearInterpolation", "f": "image",
        }
        for attempt in range(retries):
            try:
                r = requests.get(f"{IMAGE_SERVER}/exportImage", params=params, timeout=60)
                r.raise_for_status()
                if not r.content.startswith((b"II*", b"MM\0*")):
                    raise ValueError(f"not a TIFF: {r.content[:200]!r}")
                break
            except (requests.RequestException, ValueError):
                if attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt)
        path.write_bytes(r.content)
    a = tifffile.imread(io.BytesIO(path.read_bytes())).astype(np.float32)
    if a.shape != (geo.N, geo.N):
        raise ValueError(f"{tid}: unexpected shape {a.shape}")
    return a


class CoverageError(ValueError):
    """Tile is (partly) outside the lidar coverage on land, or entirely offshore."""


def fill_nodata(z_ft):
    """Fill nodata (server returns -3.4e38 outside coverage).

    Coverage ends in two ways: offshore (Gulf) and at the county line (land).
    A nodata region whose valid rim is low (median < SEA_RIM_FT) is Gulf and is set to
    SEA_FT; small interior voids take their nearest valid neighbour; a large nodata
    region with a high rim is out-of-county land and the tile is rejected.
    """
    bad = ~np.isfinite(z_ft) | (z_ft < VALID_FT[0]) | (z_ft > VALID_FT[1])
    if bad.mean() > 0.9:
        raise CoverageError("tile is outside lidar coverage")
    z = np.where(bad, np.nan, z_ft).astype(float)
    if bad.any():
        lab, n = ndimage.label(bad)
        for k in range(1, n + 1):
            region = lab == k
            rim = ndimage.binary_dilation(region) & ~bad
            if region.sum() <= 16:
                continue  # small void: nearest-neighbour below
            if np.median(z_ft[rim]) < SEA_RIM_FT:
                z[region] = SEA_FT
            elif region.sum() > 0.02 * region.size:
                raise CoverageError("tile crosses the edge of lidar coverage on land")
        still = np.isnan(z)
        if still.any():
            idx = ndimage.distance_transform_edt(still, return_distances=False, return_indices=True)
            z = z[tuple(idx)]
    return z, bad


def priority_flood(z):
    """Depression-filled surface (Barnes et al. 2014), draining to the tile edge."""
    ny, nx = z.shape
    filled = z.astype(float).copy()
    done = np.zeros(z.shape, dtype=bool)
    heap = []
    for j in range(ny):
        for i in (0, nx - 1):
            heap.append((filled[j, i], j, i)); done[j, i] = True
    for i in range(1, nx - 1):
        for j in (0, ny - 1):
            heap.append((filled[j, i], j, i)); done[j, i] = True
    heapq.heapify(heap)
    while heap:
        e, j, i = heapq.heappop(heap)
        for dj, di in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            jj, ii = j + dj, i + di
            if 0 <= jj < ny and 0 <= ii < nx and not done[jj, ii]:
                done[jj, ii] = True
                if filled[jj, ii] < e:
                    filled[jj, ii] = e
                heapq.heappush(heap, (filled[jj, ii], jj, ii))
    return filled


def light_fill(z, max_fill=MAX_FILL_M):
    """Fill only depressions whose full depth is <= max_fill. Real ponds stay."""
    filled = priority_flood(z)
    depth = filled - z
    labels, n = ndimage.label(depth > 0, structure=np.ones((3, 3)))
    if n == 0:
        return z.copy()
    deepest = ndimage.maximum(depth, labels, index=np.arange(1, n + 1))
    shallow = np.concatenate(([False], deepest <= max_fill))[labels]
    out = z.copy()
    out[shallow] = filled[shallow]
    return out


def load_tile(tid):
    """Processed DEM in metres NAVD88 (float64 (128,128)), cached as .npy."""
    DEM_DIR.mkdir(parents=True, exist_ok=True)
    path = DEM_DIR / f"{tid}.npy"
    if path.exists():
        return np.load(path)
    z_ft, _ = fill_nodata(fetch_raw_ft(tid))
    z = light_fill(z_ft.astype(float) * geo.FT)
    np.save(path, z)
    return z
