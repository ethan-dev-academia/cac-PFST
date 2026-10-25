#!/usr/bin/env python
"""One-time setup for running the Pasco Flood Screening Tool locally.

Creates a .venv and installs the API + a CPU build of PyTorch + neuraloperator
(no GPU required to *serve* the trained model). The app is shipped pre-built in
app/dist, so Node is not needed. Run once, then use run.py (or start.bat /
start.command).
"""
import pathlib
import subprocess
import sys
import venv

ROOT = pathlib.Path(__file__).resolve().parent
VENV = ROOT / ".venv"


def venv_python():
    win = VENV / "Scripts" / "python.exe"
    return str(win if win.exists() else VENV / "bin" / "python")


def pip(*args):
    subprocess.check_call([venv_python(), "-m", "pip", *args])


def main():
    if not VENV.exists():
        print("creating virtual environment (.venv) ...")
        venv.EnvBuilder(with_pip=True).create(VENV)
    pip("install", "--upgrade", "pip", "-q")
    print("installing the API ...")
    pip("install", "-q", "-r", str(ROOT / "requirements-api.txt"))
    print("installing PyTorch (CPU build) ...")
    pip("install", "-q", "torch", "--index-url", "https://download.pytorch.org/whl/cpu")
    print("installing neuraloperator ...")
    pip("install", "-q", "neuraloperator")
    print("\ndone. start the app with:  python run.py")
    if not (ROOT / "models" / "fno.pt").exists():
        print("tip: fetch the trained model first:  python scripts/fetch_model.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
