# Pasco Flood Screening Tool

> "Pasco just committed $235 million to flood mitigation with a five-year deadline. Here's a tool that shows where each dollar removes the most water."

The idea comes from the PINO paper: a Fourier Neural Operator trained on our own synthetic solver runs. Here the PDE is 2D overland flow on the county's lidar terrain instead of groundwater.
- **Inputs:** a 1.28 km elevation tile, a design storm (NOAA Atlas 14), a coastal surge level, and drainage edits (retention ponds, raised roads, culverts).
- **Output:** max inundation depth across the tile, with p10/p90 bands.

**Honest framing:** this is screening-grade. It does not replace the county's engineering models. It is a way to decide which neighborhoods get the full study first.

> `SOLVER_SPEC.md` is the only binding contract (for `floodsolver/`). Everything else here describes the direction and the current build. Cut order and pitfalls are in [`ROADMAP.md`](ROADMAP.md); verified data endpoints and units are in [`DATA_SOURCES.md`](DATA_SOURCES.md).

## Two faces of the same app

- **Residents:** search an address and get *"your parcel: 0.4 ft (p10 0.1, p90 1.1)"* for a 10-yr storm, a 100-yr storm and a Helene-scale surge.
- **County:** place a retention pond or raise a road, run, and see how many homes drop out of the > 1 ft footprint. The report exports a one-page PDF memo.

## Status

| Piece | State |
|---|---|
| Solver `floodsolver/` | Done. Spec v1.4, 9/9 contract tests. Stable on real lidar tiles; mass closes to ~1e-14 |
| Data pipeline `pfst/` | Done. County-wide tile classification (1,351 tiles: coastal / low-lying / higher ground), 126-tile training catalog weighted coastal-first, DEM fetch + cleanup, Atlas 14 + SCS III storms, Helene surge, edits |
| Dataset `python -m pfst.generate` | Seeded. 96-scenario seed set made locally; the full 3,000 runs on the GPU box (`training/README.md`) |
| FNO training `training/` | Ready, not trained. Smoke-tested end to end; the API loads its checkpoint |
| API `api/` | Done. FastAPI; runs the solver as a fallback until `models/fno.pt` exists |
| App `app/` | Done. "Pasco Flood Check", Expo (iOS / Android / web-desktop), designed to `app/DESIGN.md`. Mac: sidebar + map; iPhone: map + bottom sheet; light/dark. Places (saved addresses, plain-language risk, FEMA zone, what to do), Explore (any area, storm + surge), Projects (ponds / raised roads, homes kept dry, cost per home, ranking, PDF memo), Settings |

## Architecture

```
SWFWMD lidar ─► pfst.dem (ft→m, nodata/Gulf, light sink fill) ─┐
Atlas 14 + SCS III ─► pfst.rainfall ───────────────────────────┤
Helene @ 8726724 ─► pfst.surge ────────────────────────────────┼─► floodsolver.run ─► data/dataset/*.npz
random ponds / roads ─► pfst.scenario ─────────────────────────┘                          │
                                                                                          ▼
                                          training/train.py: FNO + mass-balance loss ─► models/fno.pt
                                                                                          │
     api/ (FastAPI) ◄─────────────────────────────────────────────────────────────────────┘
       /predict: 30-member ensemble → mean/p10/p90, PNG overlay, homes flagged (solver fallback: 3 members)
       /viz/map.html (MapLibre, 3D terrain + extruded buildings)  /viz/explorer.html (three.js)
         ▲
     app/ (Expo): WebView on iOS/Android, iframe on web/desktop · search · scenario sheet · report/PDF
```

### Modeling choices (screening assumptions)
- **Solver:** local-inertial shallow water (Bates 2010, θ = 0.8 per de Almeida 2012), not the diffusive wave from the first sketch. See `SOLVER_SPEC.md`.
- **Tiles:** 128×128 cells of 10 m (1.28 km) on a fixed UTM 17N grid.
  - **Coverage:** `pfst/grid.json` classifies every tile in the county as coastal, low-lying (10th-percentile ground under ~10 ft) or higher ground, so nothing on the map is blank.
  - **Overlapping analysis tiles:** a run for an address or project uses the tile on a half-tile (640 m) lattice that is *centred* on it (e.g. `E258.5N2443.5`). The point of interest is always at least 320 m from the model's free-outfall edges, where results are least reliable.
- **Storm and surge:** a 24-hr Atlas 14 depth with an SCS Type III distribution, peaking at t = 12 h. The surge is the Helene hydrograph at Clearwater Beach, rescaled to the requested peak and aligned with the rain peak. The run lasts 20 h, which checks show is long enough for peak depth (< 2 cm change after that).
- **Fixed parameters:** Manning n = 0.05, initial abstraction 0.5 in, infiltration 5 mm/hr, all tile edges free outfall.
- **Not modeled:** storm drains and inflow from outside the tile.
- **"Home flagged":** a building whose own cell has more than 1 ft of water at peak. The lidar raises building pads, so this approximates water above the slab.
- **Uncertainty:** the FNO runs 30 ensemble members:
  - rainfall drawn from the Atlas 14 90% CI;
  - surge ±2 ft;
  - DEM noise at the lidar RMSE (0.1 m).

  The solver fallback runs 3 members (low / central / high).

## Running it

```bash
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: . .venv/bin/activate
pip install -r requirements-api.txt
pytest                                            # solver contract + pipeline tests

uvicorn api.main:app --port 8000                  # API + visual pages; open http://localhost:8000
cd app && npm install && npx expo start           # w = web/desktop; scan the QR with Expo Go for a phone
```

- **Phones:** the app looks for the API on the same machine as the Expo dev server, at port 8000. Otherwise set `EXPO_PUBLIC_API_URL=http://<lan-ip>:8000`.
- **Expo Go:** everything used (WebView, print, sharing) ships in Expo Go, so no dev build is needed.

**Pretrained model:** the API falls back to the (slow) solver until `models/fno.pt` exists. Grab the trained checkpoint — distributed as a GitHub release asset, not committed — with:

```bash
python scripts/fetch_model.py        # downloads models/fno.pt (~70 MB)
```

Then restart the API and `/health` reports `"backend": "fno"` with sub-second predictions. Point elsewhere with `PFST_MODEL=/path/to/fno.pt`.

**Training** (GPU machine): start with [`GPU_HANDOFF.md`](GPU_HANDOFF.md), then [`training/README.md`](training/README.md). Generate the dataset, smoke test, then train. Drop `models/fno.pt` next to the API and `/health` switches from `solver` to `fno`.

## Repo layout

| Path | What |
|---|---|
| `SOLVER_SPEC.md` | Binding solver contract (scheme, boundaries, tests, revision log) |
| `floodsolver/` | `solver.py` (pure numpy), `analytic.py` (reference solutions) |
| `pfst/` | Pipeline: `geo` tile grid, `dem`, `rainfall`, `surge`, `scenario` (edits → solver), `tiles` catalog (`tiles.json`), `synthetic` DEMs, `generate` dataset, `features` FNO channels, `layers` county/FEMA GIS |
| `training/` | `data.py`, `model.py` (FNO), `train.py`, runbook |
| `api/` | `main.py` endpoints, `predictor.py` (FNO / solver backends), `render.py`, `static/` visual pages |
| `app/` | Expo app (`App.tsx`, `src/`) |
| `tests/` | `test_solver.py` (spec §7 T1–T8), `test_pipeline.py` |
| `diagnostics/` | Committed one-off solver checks |
| `data/`, `models/` | Generated, git-ignored (DEM cache, dataset, API cache, checkpoints) |
