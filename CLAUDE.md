# CLAUDE.md

Pasco Flood Screening Tool: a numpy overland-flow solver generates synthetic runs, an FNO surrogate is trained on them, FastAPI serves ensemble predictions, and an Expo/React Native app (desktop + mobile) is the front end for residents and county planners. See `README.md` for the product and `ROADMAP.md` for the cut order and pitfalls.

## Source-of-truth hierarchy

1. `SOLVER_SPEC.md` is a **binding contract** for `floodsolver/`. Implement exactly what it says. Never loosen a tolerance, never edit a test to make it pass, never add smoothing, slope floors or stability tweaks. If the spec looks wrong, stop and report it. Spec changes get a revision-log entry (§10).
2. `README.md` / `ROADMAP.md` describe the direction for everything else (dataset, FNO, API, app). They are not exact specs. Ask before treating details there as fixed requirements.
3. Where the README idea and the spec disagree, the spec wins. Example: the idea said "diffusive wave", but the built solver is local-inertial, θ = 0.8.

## Conventions

- Solver units are SI internally. mm/hr and ft conversions happen only in I/O helpers.
- Arrays are `(ny, nx)`, row 0 = north. The grid is 128×128 at 10 m.
- Diagnostic scripts go in `diagnostics/`, are committed, and have a one-line header saying what they check.
- Tests: `pytest` (run from the repo root; `pythonpath = ["."]` is set in `pyproject.toml`).

## Planned components (not yet built)

- Dataset generation: ~3k scenarios → `.npz`
- FNO training (`neuraloperator`, mass-balance loss term, target rel-L2 < 10%)
- `api/`: FastAPI `POST /predict`, ensemble → mean/p10/p90, server-side PNG colormap
- `app/`: Expo, react-native-maps or `@rnmapbox/maps`, Zustand. Screens: Map (3D depth layer, FEMA toggle, address lookup), Scenario, Report (expo-print PDF)
