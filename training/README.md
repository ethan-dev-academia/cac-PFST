# Training the FNO surrogate (GPU machine)

Everything up to training is in the repo. The dataset is deterministic: scenario `k` is fully determined by `(--seed, k)`. So any machine can regenerate any slice of it, and several machines can split the work.

## 0. Setup

```bash
git clone https://github.com/ethan-dev-academia/cac-PFST && cd cac-PFST
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt                   # numpy, scipy, pyproj, tifffile, requests
# PyTorch for your CUDA version (https://pytorch.org/get-started/locally/), then:
pip install neuraloperator
pytest                                            # solver contract tests, ~75 s
```

## 1. Data: generate it, or copy it

**Generation is CPU-bound.** The solver is pure numpy (SOLVER_SPEC §9), so the GPU does not speed it up. Each scenario is a 20-h event on a 128×128 tile and takes about 60–120 s on one core. 3,000 scenarios take roughly `3000 × 90 s / cores`, which is about 4 h on 16 physical cores.

```bash
python -m pfst.generate --n 3000 --workers <physical cores>        # resumable; re-run to continue
# split across machines, same seed:
python -m pfst.generate --start 0    --n 1500      # machine A
python -m pfst.generate --start 1500 --n 1500      # machine B
```

- DEM tiles download on first use (SWFWMD image server) into `data/dem/` and are cached after that.
- Output goes to `data/dataset/{train,test}/sNNNNN.npz`; the `test` split is the 8 held-out tiles in `pfst/tiles.json`.
- A seed set of the first 96 scenarios (`--seed 2026`, k = 0–95) was generated on the dev laptop. Copy `data/dataset/` over to skip them; the generator skips files that exist.
- Use **physical** cores for `--workers`, not threads. On an SMT laptop, 18 workers on 10 cores ran each job 2–3× slower.

## 2. Smoke test, then train

```bash
python training/train.py --smoke                  # 2 epochs on 16 samples: checks the whole loop
python training/train.py --epochs 150 --batch 16  # full run; picks cuda / mps / cpu automatically
```

Writes `models/fno.pt` (best held-out-tile checkpoint) and `models/fno_metrics.json`. Each epoch prints held-out relative L2 of `h_max` on land cells (target **< 0.10**), IoU of the > 1 ft footprint, MAE, and the mass-balance term.

Model: `neuraloperator` FNO, 32×32 modes, width 64, 4 layers, 7 input channels (`pfst/features.py`), 2 outputs (h_max, h_final). Inputs are augmented with the 8 rotations/flips.

Loss: rel-L2(h_max) + 0.5·rel-L2(h_final) + 0.1·mass + 1.0·order.
- **mass:** |Σ predicted h_final·dx² − stored volume| / V_ref. The stored volume is from the solver's §6 budget, so the network is held to the run's water balance.
- **order:** penalises h_final > h_max.

Knobs: `--modes`, `--width`, `--layers`, `--lr`, `--w-mass`, `--w-order`, `--no-preload` (if RAM is short; the full set is about 1.7 GB float32).

## 3. Use it

Copy `models/fno.pt` into the repo's `models/` on the API host (or set `PFST_MODEL=/path/fno.pt`) and restart the API. `/health` then reports `"backend": "fno"`, and `/predict` runs a 30-member ensemble in about a second instead of the 2-minute solver fallback.
