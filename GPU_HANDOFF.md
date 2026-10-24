# GPU machine handoff: generate the dataset, train the FNO

Brief for a Claude Code session on the training machine. Read this, then `CLAUDE.md` and `training/README.md`.

## Context

Pasco Flood Screening Tool. A numpy overland-flow solver (`floodsolver/`) produces synthetic flood runs on real lidar tiles, and a Fourier Neural Operator learns to imitate it. A FastAPI backend and an Expo app serve the predictions.

Everything except training was built and tested on a laptop (PR #2, branch `pipeline-v1`). **This machine's job:**
1. Finish generating the dataset.
2. Train the FNO.
3. Hand back `models/fno.pt`.

## Goal and done criteria

- `data/dataset/{train,test}/` holds about 3,000 scenarios (k = 0–2999, seed 2026, catalog `pfst/tiles.json` from coverage-v2) and `generate.log` shows no errors.
- `models/fno.pt` exists, with best **held-out relative L2 of h_max below 0.10**. The held-out set is the 16 test tiles in `pfst/tiles.json`. IoU of the > 1 ft footprint and MAE are reported too.
- Report back: the final metrics line, the epoch count, wall time, and the GPU used.

## Steps

### 1. Setup
```bash
git clone https://github.com/ethan-dev-academia/cac-PFST && cd cac-PFST
git checkout pipeline-v1            # or main, if PR #2 is merged
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cu<XYZ>   # match the CUDA driver (nvidia-smi)
pip install neuraloperator          # 2.0.0 with torch 2.14 is the combination that was tested
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
pytest                              # 17 tests, ~3 min; all must pass before going further
```

### 2. Seed data (saves ~1.5 h)
**The tile catalog changed in coverage-v2** (126 tiles: every low-lying tile plus 24 higher-ground tiles, sampled coastal-first). The first seed release (`seed-dataset-2026-k0-95`) was made with the old 48-tile catalog and **must not be used**: scenario k would not match. Use the v2 seed release if it exists (`seed-dataset-v2-2026-k0-95`). Otherwise skip this step; the generator just makes those 96 itself.

With the v2 archive, from the repo root run:
```bash
gh release download seed-dataset-v2-2026-k0-95 -p '*.tgz' -D data/   # or download it in a browser into data/
tar -xzf data/seed_dataset_v2_2026_k0-95.tgz -C data/                # creates data/dataset/{train,test}/s00000..s00095.npz
```

### 3. Generate the rest (CPU-bound, long-running)
The solver is pure numpy, and `SOLVER_SPEC.md` §9 requires that, so **the GPU does not help here**.
- Each scenario takes about 60–120 s on one core.
- Set `--workers` to the number of **physical** cores (`lscpu` on Linux: cores per socket × sockets). SMT threads make every job slower.
```bash
nohup python -m pfst.generate --n 3000 --workers <physical_cores> > data/generate.out 2>&1 &
```
- **Resumable:** the generator skips files that already exist, so re-run the same command after any interruption.
- **Progress:** `tail data/dataset/generate.log`. Errors appear as `error:` lines; `grep -c error data/dataset/generate.log` should print 0.
- **Expect** about `3000 × 90 s / cores` (roughly 4 h on 16 cores). DEM tiles download on first use, which needs internet.
- **To train sooner:** a first model can start once about 1,000 samples exist. The full set is the target.

### 4. Train
```bash
python training/train.py --smoke                    # 2 epochs on 16 samples; checks the loop on GPU
python training/train.py --epochs 150 --batch 16    # full run; writes models/fno.pt + models/fno_metrics.json
```
- Each epoch prints train/test rel-L2, IoU > 1 ft, MAE and the mass term. The best test checkpoint is kept.
- If held-out rel-L2 plateaus above 0.10, try these in order:
  1. more data;
  2. `--width 96` or `--modes 48`;
  3. `--epochs 300`;
  4. `--lr 5e-4`.

  Report what was tried.
- RAM: the loader keeps the full set in memory (about 1.7 GB at 3k samples). Use `--no-preload` if that's tight.

### 5. Verify the checkpoint through the API
```bash
pip install -r requirements-api.txt
uvicorn api.main:app --port 8000 &
curl localhost:8000/health          # must say "backend": "fno"
curl -X POST localhost:8000/predict -H 'content-type: application/json' \
     -d '{"tile_id":"E259N2444","return_period":100}' | head -c 400
```
- The solver gives about **48 homes over 1 ft** for this Port Richey 100-yr case (band 27–96). A sane model should be in that range.

### 6. Hand back
- Copy `models/fno.pt` and `models/fno_metrics.json` to the dev machine's `cac-PFST/models/`.
- `data/` and `models/` are git-ignored, so **don't commit them**. A release asset is fine if that's how the file needs to move.

## Rules
- **Do not modify** `floodsolver/`, `tests/test_solver.py` or `SOLVER_SPEC.md`. The spec is a binding contract; report problems instead of patching.
- **Do not change** `--seed` (2026), `pfst/tiles.json` or the scenario sampler in `pfst/generate.py` mid-run. Sample k is defined by `(seed, k)`, and mixing definitions corrupts the dataset.
- Code changes, such as to training, go on a branch with a PR. Commits carry **no Co-Authored-By or "Generated with Claude" lines**.
- Ask before deleting `data/dataset/` or anything else long-running.

## Known gotchas
- `neuraloperator` adds a `_metadata` key to state dicts. `training/model.py` already strips it on load.
- Deep `h_max` values (4–7 m) are real. They come from excavated retention ponds filling up, and from below-sea-level land under high surge.
- The FNO doesn't take culvert edits; ponds and raised roads reach it through the `dz` channel. The API ignores culverts when the FNO backend is active.
