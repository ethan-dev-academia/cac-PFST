#!/usr/bin/env python
"""Launch the Pasco Flood Screening Tool locally.

Starts the API (which also serves the app at /app) and opens a browser.
Prefers the project's virtualenv if one exists, otherwise the current Python.

    python run.py                 # http://localhost:8000/app/
    PFST_PORT=8010 python run.py  # a different port

For a machine without the dependencies yet, run `python setup_env.py` once first.
"""
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent
PORT = int(os.environ.get("PFST_PORT", "8000"))


def _venv_python():
    win = ROOT / ".venv" / "Scripts" / "python.exe"
    nix = ROOT / ".venv" / "bin" / "python"
    if win.exists():
        return str(win)
    if nix.exists():
        return str(nix)
    return sys.executable


def main():
    model = ROOT / "models" / "fno.pt"
    if not model.exists():
        print("note: models/fno.pt not found — the app will run the slower physics solver.")
        print("      get the trained model with:  python scripts/fetch_model.py")

    py = _venv_python()
    env = dict(os.environ)
    env.setdefault("PFST_MODEL", str(model))
    print(f"starting the flood service on http://localhost:{PORT} ...")
    proc = subprocess.Popen([py, "-m", "uvicorn", "api.main:app", "--port", str(PORT)],
                            cwd=str(ROOT), env=env)
    url = f"http://localhost:{PORT}"
    for _ in range(90):
        try:
            urllib.request.urlopen(url + "/health", timeout=1)
            break
        except Exception:
            if proc.poll() is not None:
                print("the service exited early; see the output above.")
                return proc.returncode or 1
            time.sleep(1)
    print(f"ready. opening {url}/app/")
    webbrowser.open(f"{url}/app/")
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
