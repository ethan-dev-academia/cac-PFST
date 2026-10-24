# CLAUDE.md

Pasco Flood Screening Tool: a numpy overland-flow solver generates synthetic runs, an FNO surrogate is trained on them, FastAPI serves ensemble predictions, and an Expo/React Native app (desktop + mobile) is the front end for residents and county planners. See `README.md` for the product and `ROADMAP.md` for the cut order and pitfalls.

## Source-of-truth hierarchy

1. `SOLVER_SPEC.md` is a **binding contract** for `floodsolver/`. Implement exactly what it says. Never loosen a tolerance, never edit a test to make it pass, never add smoothing, slope floors or stability tweaks. If the spec looks wrong, stop and report it. Spec changes get a revision-log entry (§10).
2. `README.md` / `ROADMAP.md` describe the direction for everything else (dataset, FNO, API, app). They are not exact specs. Ask before treating details there as fixed requirements.
3. Where the README idea and the spec disagree, the spec wins. Example: the idea said "diffusive wave", but the built solver is local-inertial, θ = 0.8.

## Conventions

- Solver units are SI internally. mm/hr and ft conversions happen only in I/O helpers.
- DEM from the SWFWMD server is in **US feet** (NAVD88). Convert to metres before the solver. Endpoints and gotchas are in `DATA_SOURCES.md`.
- Arrays are `(ny, nx)`, row 0 = north. The grid is 128×128 at 10 m.
- Diagnostic scripts go in `diagnostics/`, are committed, and have a one-line header saying what they check.
- Tests: `pytest` (run from the repo root; `pythonpath = ["."]` is set in `pyproject.toml`).

## Layout and run

- `pfst/` data pipeline, `training/` FNO, `api/` FastAPI (+ `api/static/` MapLibre and three.js pages), `app/` Expo. See README "Running it".
- Tests: `pytest` (solver contract + offline pipeline tests). App: `cd app && npx tsc --noEmit`.
- The visual layer is plain HTML served by the API at `/viz`. The app embeds it (WebView native, iframe web) and talks over postMessage (`api/static/common.js`). Visual changes go in `api/static/`, not in React Native.
- MapLibre gotcha: `raster-resampling: "nearest"` renders RGBA image/canvas overlays black. Don't use it.
- `data/` and `models/` are generated and git-ignored. The dataset is deterministic in `(seed, k)`.
- `app/AGENTS.md`: check versioned Expo docs (SDK 58) before touching Expo APIs.
