"""Tile grid and coordinate helpers.

Tiles are 128 x 128 cells of 10 m on a fixed UTM 17N (EPSG:26917) grid, so any
point in the county maps to exactly one tile id. Tile "E258N2444" covers
x in [258*1280, 259*1280), y in [2444*1280, 2445*1280). Array row 0 is the
northern edge (SOLVER_SPEC §1).
"""
from functools import lru_cache

import numpy as np
from pyproj import Transformer

N = 128
DX = 10.0
TILE_M = N * DX
UTM = 26917
FT = 0.3048


@lru_cache(maxsize=None)
def _tf(src, dst):
    return Transformer.from_crs(src, dst, always_xy=True)


def lonlat_to_utm(lon, lat):
    return _tf(4326, UTM).transform(lon, lat)


def utm_to_lonlat(x, y):
    return _tf(UTM, 4326).transform(x, y)


def tile_id(ix, iy):
    return f"E{ix}N{iy}"


def parse_tile_id(tid):
    e, n = tid[1:].split("N")
    return int(e), int(n)


def tile_for_lonlat(lon, lat):
    x, y = lonlat_to_utm(lon, lat)
    return tile_id(int(x // TILE_M), int(y // TILE_M))


def tile_bbox_utm(tid):
    ix, iy = parse_tile_id(tid)
    return ix * TILE_M, iy * TILE_M, (ix + 1) * TILE_M, (iy + 1) * TILE_M


def tile_corners_lonlat(tid):
    """[[lon, lat] x 4]: top-left, top-right, bottom-right, bottom-left (MapLibre image order)."""
    x0, y0, x1, y1 = tile_bbox_utm(tid)
    return [list(utm_to_lonlat(x, y)) for x, y in ((x0, y1), (x1, y1), (x1, y0), (x0, y0))]


def tile_center_lonlat(tid):
    x0, y0, x1, y1 = tile_bbox_utm(tid)
    return utm_to_lonlat((x0 + x1) / 2, (y0 + y1) / 2)


def lonlat_to_cell(tid, lon, lat):
    """(row, col) of the cell containing lon/lat, or None if outside the tile."""
    x0, y0, x1, y1 = tile_bbox_utm(tid)
    x, y = lonlat_to_utm(lon, lat)
    col = int((x - x0) // DX)
    row = int((y1 - y) // DX)
    if 0 <= row < N and 0 <= col < N:
        return row, col
    return None


def cells_from_lonlat(tid, coords):
    """Vectorised lonlat_to_cell; returns float (row, col) arrays (fractional, unclipped)."""
    x0, y0, x1, y1 = tile_bbox_utm(tid)
    lon, lat = np.asarray(coords, dtype=float).T
    x, y = _tf(4326, UTM).transform(lon, lat)
    return (y1 - np.asarray(y)) / DX - 0.5, (np.asarray(x) - x0) / DX - 0.5
