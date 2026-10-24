"""Offline checks for the data pipeline (no network): rainfall, surge, edits, features, geo."""
import numpy as np

from pfst import dem, features, geo, rainfall, scenario, surge, tiles


def test_design_storm_integrates_to_total():
    st = rainfall.design_storm(100)
    total = float(np.sum(st.rates * np.diff(st.edges)))
    assert abs(total - 13.3 * rainfall.IN) < 1e-12
    assert st(-1.0) == 0.0 and st(25 * 3600) == 0.0
    # Type III peaks in the 15 min before t = 12 h
    assert st.edges[np.argmax(st.rates)] == 11.75 * 3600


def test_atlas14_bands_ordered():
    for rp, (mean, lo, hi) in rainfall.ATLAS14_24H.items():
        assert lo < mean < hi


def test_surge_peak_and_tide():
    s = surge.surge_from_ft(7.62, t_peak=12 * 3600)
    assert abs(s(12 * 3600) - 7.62 * geo.FT) < 1e-9
    assert abs(s(-1e7) - surge.TIDE_M) < 1e-12
    calm = surge.surge_from_ft(0.0)
    assert calm(0.0) == surge.TIDE_M


def test_tile_id_roundtrip_and_cells():
    tid = geo.tile_for_lonlat(-82.715, 28.271)
    assert tid == "E259N2444"
    x0, y0, x1, y1 = geo.tile_bbox_utm(tid)
    lon, lat = geo.utm_to_lonlat(x0 + 64.5 * geo.DX, y1 - 20.5 * geo.DX)   # centre of cell (20, 64)
    assert geo.lonlat_to_cell(tid, lon, lat) == (20, 64)
    r, c = geo.cells_from_lonlat(tid, [[lon, lat]])
    assert abs(r[0] - 20) < 1e-6 and abs(c[0] - 64) < 1e-6


def test_edits():
    z = np.full((geo.N, geo.N), 2.0)
    z[60:70, 60:70] = 1.0
    dz, culverts = scenario.apply_edits(z, [
        {"type": "pond", "center": [64, 64], "radius": 3, "depth_m": 2.0},
        {"type": "road", "path": [[10, 10], [10, 50]], "width": 1, "raise_m": 0.5},
        {"type": "culvert", "a": [5, 5], "b": [5, 100], "diameter_m": 1.0},
    ])
    assert np.isclose((z + dz)[64, 64], -1.0)            # flat floor 2 m below the pond's lowest cell
    assert dz[10, 10:51].min() == 0.5 and dz[11, 30] == 0.0
    assert len(culverts) == 1 and np.isclose(culverts[0][4], np.pi / 4)


def test_surge_mask_only_edge_connected_water():
    z = np.full((geo.N, geo.N), 1.0)
    z[:, :20] = -1.0          # Gulf on the west edge
    z[60:70, 60:70] = -1.0    # inland pit: not coast
    m = tiles.surge_mask(z)
    assert m[:, :20].all() and not m[60:70, 60:70].any()


def test_light_fill_keeps_real_ponds():
    z = np.full((geo.N, geo.N), 2.0) + np.linspace(0, 1, geo.N)[None, :]
    z[30, 30] -= 0.05          # lidar pit: filled
    z[80:90, 80:90] -= 1.5     # pond: kept
    out = dem.light_fill(z)
    assert out[30, 30] > z[30, 30] and np.array_equal(out[80:90, 80:90], z[80:90, 80:90])


def test_feature_channels():
    z = np.random.default_rng(0).normal(2, 1, (geo.N, geo.N))
    x = features.make_inputs(z, np.zeros_like(z), z < 0, 9.27, 7.62)
    assert x.shape == (features.N_IN, geo.N, geo.N) and x.dtype == np.float32
    assert np.allclose(x[3], 9.27 * rainfall.IN / 0.3)
