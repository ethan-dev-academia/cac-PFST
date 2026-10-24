# Pasco Flood Screening Tool

> "Pasco just committed $235 million to flood mitigation with a five-year deadline. Here's a tool that shows where each dollar removes the most water."

The idea comes from the PINO paper: a Fourier Neural Operator trained on our own synthetic solver runs. Here the PDE is 2D overland flow on the county's LiDAR terrain instead of groundwater.
- **Inputs:** an elevation tile, rainfall intensity or surge height at the coast, and the state of the drainage (culverts, retention ponds, raised roads).
- **Output:** inundation depth across the tile.

**Honest framing:** this is screening-grade. It does not replace the county's engineering models. It is a way to decide which neighborhoods get the full study first.

> **Status of this document:** the product and architecture below describe the *direction*, not exact specs. The only binding contract so far is [`SOLVER_SPEC.md`](SOLVER_SPEC.md) for the solver. The cut list and known pitfalls are in [`ROADMAP.md`](ROADMAP.md).

## Two faces of the same app

### Residents
Type an address and see the depth under a 10-year storm, a 100-year storm and a Helene-scale surge. Depths are shown with bands, because terrain and rainfall are uncertain. For example: *"your parcel: 0.4 ft (p10 0.1, p90 1.1) in a 25-year storm."*

### County
Draw a proposed project (a retention pond here, raise this road, clear this culvert) and see how many homes drop out of the inundation footprint. That gives a per-dollar ranking for the $235M, which nobody on staff can do interactively today.

## Data (all public)
- Pasco / SWFWMD LiDAR DEM (10 m cells, 128×128 tiles)
- FEMA flood zones
- NOAA Atlas 14 rainfall (2-yr to 100-yr return periods)
- County stormwater project list (the funded project sites)
- USGS Helene/Milton high-water marks (for validation)

## Architecture

```
DEM tiles + forcing ──► floodsolver (numpy) ──► ~3,000 scenarios (.npz)
                                                     │
                                                     ▼
                         FNO + mass-balance loss (neuraloperator)
                                                     │
                                                     ▼
            FastAPI POST /predict (ensemble → mean / p10 / p90 + stats)
                                                     │
                                                     ▼
              Expo / React Native app (Map · Scenario · Report)
```

### Backend (Python)

1. **Solver** (`floodsolver/`, done: v1.4, all 9 tests pass). 2D overland flow on a grid.
   - State: water depth h(x,y,t). Water surface η = z + h, where z is the terrain.
   - Inputs: a DEM tile (128×128, 10 m cells), rainfall rate r(t), boundary head at coast cells (surge), and infrastructure (`dz` for ponds and raised roads, culvert links).
   - Output: max depth over the event, h_max(x,y).
   - The original idea was a diffusive-wave Manning flux, q = −(h^(5/3)/n)·∇η/|∇η|^(1/2), stepped explicitly with a CFL-limited dt. **What was actually built** is the local-inertial scheme (Bates 2010, θ-weighted per de Almeida 2012) with semi-implicit friction. [`SOLVER_SPEC.md`](SOLVER_SPEC.md) is authoritative on this.
   - It is validated on a tilted plane (kinematic steady state), bowls, a ridge, surge extent and a culvert.
2. **Dataset** (next). About 3,000 scenarios:
   - 20–30 real DEM tiles from west Pasco (Hudson, Sea Pines, Port Richey, Holiday), plus synthetic bumps.
   - Rainfall from NOAA Atlas 14 return periods (2-yr to 100-yr) and surge from 0 to 8 ft.
   - Random infrastructure edits (pond, raised road).
   - Saved as `(inputs, h_max)` `.npz` files and run overnight.
3. **FNO.** Uses the `neuraloperator` package.
   - Input channels: DEM, rainfall-total map, surge-boundary map and infrastructure mask. Output: h_max.
   - The loss gets a physics term: the mass-balance residual (water in = rainfall + inflow − outflow − storage). It is cheap and keeps the model honest.
   - Trains on a laptop GPU or Colab in a few hours. Target: relative L2 under 10% on held-out tiles.
4. **Uncertainty.** No Bayesian net. Instead the operator runs over an ensemble with ±20% rainfall, ±2 ft surge and DEM noise. That is 30 forward passes in under a second, returning mean, p10 and p90 per cell.
5. **API.** FastAPI with one endpoint.
   - `POST /predict` takes `{tile_id, rainfall_return_period, surge_ft, edits: [...]}`.
   - It returns the depth grid (mean/p10/p90) as a base64 PNG with alpha (colormap generated server-side) or as a flat array, plus summary stats (cells above 1 ft, homes flagged).
   - The model is preloaded at startup. Hosting is the Render/Railway/Fly free tier; inference at this size needs no GPU.

### App (Expo + React Native)

Stack: Expo, react-native-maps (or `@rnmapbox/maps` for better raster overlays), expo-location, Zustand for state, plain `fetch` to the API. It targets desktop and mobile.

Three screens:
- **Map.**
  - Pasco basemap, with FEMA flood zones as a toggle layer and the county's funded project sites as pins.
  - The depth overlay is a raster image placed at the tile's bounds. It should be a **3D layer** that can be explored visually in depth.
  - Tapping a cell shows the depth with its band.
  - Address lookup uses Expo geocoding.
- **Scenario.** A bottom sheet with:
  - a return-period picker (2/10/25/100-yr), a surge slider and a "Helene preset";
  - an edit mode where you tap to place a retention pond or draw a raised road segment.
  - Run sends it to the API and the overlay updates.
- **Report.**
  - A side-by-side before/after of the scenario and "homes removed from >1 ft inundation".
  - An Export button that writes a one-page PDF (expo-print) in the memo style the planners already saw.

## Repo layout

| Path | What |
|---|---|
| `SOLVER_SPEC.md` | Binding solver contract (scheme, boundaries, tests, revision log) |
| `floodsolver/` | `solver.py` (pure numpy), `analytic.py` (reference solutions) |
| `tests/test_solver.py` | Spec §7 tests T1–T8 |
| `diagnostics/` | Committed one-off checks (stability, Jacobians, convergence) |
| `ROADMAP.md` | Cut order, known pitfalls |

Planned (not yet created): dataset generation, FNO training, `api/` (FastAPI), `app/` (Expo).

## Running the tests

```
pip install numpy pytest
pytest
```
