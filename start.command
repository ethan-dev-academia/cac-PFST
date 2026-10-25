#!/bin/bash
# Pasco Flood Screening Tool - macOS / Linux launcher
cd "$(dirname "$0")" || exit 1
if [ ! -d .venv ]; then
  echo "First run: setting up the environment. This takes a few minutes..."
  python3 setup_env.py || { echo "Setup failed. Install Python 3.11+ first."; exit 1; }
fi
.venv/bin/python run.py
