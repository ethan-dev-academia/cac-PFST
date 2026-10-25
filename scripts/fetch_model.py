#!/usr/bin/env python
"""Download the trained FNO checkpoint into models/fno.pt.

The checkpoint (~70 MB) is distributed as a GitHub release asset rather than
committed to the repo (models/ is git-ignored). Run this once after cloning to
give the API its fast `fno` backend:

    python scripts/fetch_model.py

Override the release tag with PFST_MODEL_TAG if a newer model is published.
"""
import os
import pathlib
import urllib.request

REPO = "ethan-dev-academia/cac-PFST"
TAG = os.environ.get("PFST_MODEL_TAG", "model-v0.1")
URL = f"https://github.com/{REPO}/releases/download/{TAG}/fno.pt"

dst = pathlib.Path(__file__).resolve().parent.parent / "models" / "fno.pt"
dst.parent.mkdir(parents=True, exist_ok=True)

print(f"downloading {URL}\n       -> {dst}")
urllib.request.urlretrieve(URL, dst)
print(f"done: {dst.stat().st_size / 1e6:.0f} MB")
