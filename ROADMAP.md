# Roadmap

This is direction, not contract.

## Cuts if behind (in this order)

1. Drop road-raising (keep ponds only)
2. Cut the ensemble down to three fixed scenarios
3. Drop the PDF export (use a screenshot instead)
4. Drop surge (rainfall only)

**Never drop the solver or the trained operator. They are the entry.**

## Things that will bite you

- **DEM preprocessing:** handle nodata and lightly fill sinks, or the solver pools water in LiDAR noise. *Handled in `pfst/dem.py`: Gulf vs county-line nodata, and only sinks ≤ 10 cm are filled.*
- **Steep cells:** the explicit dt gets tiny on steep cells. Note that the spec forbids slope caps or stability tweaks inside the solver (`SOLVER_SPEC.md` §9). Handle this in tile preprocessing or tile selection, or raise it as a spec change. *In practice real tiles (p99 slope up to 0.23) ran stably, with a median dt of about 1 s; no change needed so far.*
- **Raster overlays:** react-native-maps raster overlays want PNG with alpha, so generate the colormap server-side. *Done (`api/render.py`). The map uses MapLibre in a WebView instead; never set `raster-resampling: nearest` on overlays.*
- **Expo Go limits:** Expo Go can't do everything. If a native module (e.g. `@rnmapbox/maps`, or the 3D layer) fights you, switch to a dev build early, not in the last week. *Current build uses only Expo Go modules (WebView, print, sharing).*
- **Solver sanity check:** a tilted plane with uniform rain should give the kinematic depth profile (spec T3). If it doesn't, nothing else matters yet.

## Video

Opening line: *"Pasco just committed $235 million to flood mitigation with a five-year deadline. Here's a tool that shows where each dollar removes the most water."*

## Throughput

- The solver is CPU-only numpy, so the dataset has to be generated on CPU. Use `--workers` = physical cores; on SMT laptops more workers slow every job.
- If generation becomes the bottleneck, porting the solver to GPU (cupy/torch) would need a spec revision (§9 says pure numpy in v1).
