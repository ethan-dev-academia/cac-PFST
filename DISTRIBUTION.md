# Running / distributing the app with the model baked in

The flood model is a PyTorch (FNO) network — it runs in the **Python API**, not in
the JavaScript app. So "shipping the model" means shipping the API + the checkpoint
together. The app is served by that same API at `/app`, so **one process hosts
everything** (UI + predictions). No Node is needed at runtime — the app is shipped
pre-built in `app/dist`.

## Option A — one-click launcher (needs Python 3.11+ on the machine)

1. Get the model once: `python scripts/fetch_model.py` (or copy `models/fno.pt` in).
2. Double-click **`start.bat`** (Windows) or **`start.command`** (macOS), or run `python run.py`.
   - First run creates `.venv` and installs the API + a **CPU** build of PyTorch
     (no GPU needed to serve the model).
3. The browser opens `http://localhost:8000/app/`.

Rebuild the bundled app after UI changes: `cd app && npx expo export --platform web`.

## Option B — standalone installer (no Python needed)

A frozen build under `installer/` wraps the API (PyInstaller, CPU torch, model
embedded) in a desktop shell. Build it on the target OS:

- **Windows:** `installer/build_windows.ps1` → `installer/dist/*.exe` (NSIS).
- **macOS:** must be built on a Mac (a `.dmg` can't be cross-built from Windows);
  use `installer/build_mac.sh` on macOS or a macOS CI runner.

## Option C — GitHub release asset

`models/` is git-ignored, so the checkpoint travels as a release asset (68 MB, well
under GitHub's 2 GB limit):

```bash
gh release create model-v0.1 models/fno.pt --title "FNO model v0.1" \
   --notes-file data/release_notes.md --repo ethan-dev-academia/cac-PFST
```

Then `python scripts/fetch_model.py` pulls it into `models/fno.pt`.
