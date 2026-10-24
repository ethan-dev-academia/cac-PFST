"""Tile grid and coordinate helpers.

Tiles are 128 x 128 cells of 10 m on a fixed UTM 17N (EPSG:26917) grid, so any
point in the county maps to exactly one tile id. Tile "E258N2444" covers
x in [258*1280, 259*1280), y in [2444*1280, 2445*1280). Array row 0 is the
northern edge (SOLVER_SPEC §1).

Overlapping analysis tiles: ids may sit on a half-tile (640 m) lattice, e.g.
"E259.5N2444". `analysis_tile_for_lonlat` returns the lattice tile whose centre is
nearest a point, so that point is always >= 320 m from the tile's (modeled) edges.
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


def _fmt(v):
    v = float(v)
    if abs(v * 2 - round(v * 2)) > 1e-9:
        raise ValueError(f"tile index {v} is not on the half-tile lattice")
    return str(int(v)) if v == int(v) else f"{v:.1f}"


def tile_id(ix, iy):
    return f"E{_fmt(ix)}N{_fmt(iy)}"


def parse_tile_id(tid):
    """(ix, iy) in tile units; ints for base tiles, x.5 for half-offset tiles."""
    e, n = tid[1:].split("N")
    ix, iy = float(e), float(n)
    _fmt(ix), _fmt(iy)
    return (int(ix) if ix == int(ix) else ix), (int(iy) if iy == int(iy) else iy)


def tile_for_lonlat(lon, lat):
    x, y = lonlat_to_utm(lon, lat)
    return tile_id(int(x // TILE_M), int(y // TILE_M))


def analysis_tile_for_lonlat(lon, lat):
    """Half-lattice tile centred nearest (lon, lat): the point sits in its central 640 m."""
    x, y = lonlat_to_utm(lon, lat)
    half = TILE_M / 2
    return tile_id((round(x / half) - 1) / 2, (round(y / half) - 1) / 2)


def base_tile_of(tid):
    """Base (integer-grid) tile containing the centre of `tid`."""
    x0, y0, x1, y1 = tile_bbox_utm(tid)
    return tile_id(int(((x0 + x1) / 2) // TILE_M), int(((y0 + y1) / 2) // TILE_M))


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
