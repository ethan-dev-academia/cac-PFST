#!/usr/bin/env python
"""Write a half-precision copy of models/fno.pt and verify it predicts the same.

FNO weights are mostly complex spectral tensors; storing them at half precision
(complex32 / float16) roughly halves the file. load_checkpoint casts back to the
model's float32/complex64 on load, so inference is unaffected beyond rounding.
"""
import pathlib
import sys

import torch

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "training"))
from model import load_checkpoint  # noqa: E402

SRC = ROOT / "models" / "fno.pt"
DST = ROOT / "models" / "fno_fp16.pt"


def half(v):
    if torch.is_tensor(v) and v.is_floating_point():
        return v.half()
    if torch.is_tensor(v) and v.is_complex():
        return v.to(torch.complex32)
    return v


def main():
    ck = torch.load(SRC, map_location="cpu", weights_only=False)
    ck_small = dict(ck)
    ck_small["state_dict"] = {k: half(v) for k, v in ck["state_dict"].items()}
    torch.save(ck_small, DST)
    print(f"src  {SRC.stat().st_size/1e6:6.1f} MB")
    print(f"fp16 {DST.stat().st_size/1e6:6.1f} MB")

    m0, _ = load_checkpoint(SRC)
    m1, _ = load_checkpoint(DST)
    torch.manual_seed(0)
    x = torch.randn(2, 7, 128, 128)
    with torch.no_grad():
        y0, y1 = m0(x), m1(x)
    diff = (y0 - y1).abs()
    rel = diff.mean() / y0.abs().mean()
    print(f"max abs diff {diff.max().item():.4e} m,  mean rel diff {rel.item():.4e}")
    ok = rel.item() < 1e-2
    print("VERDICT:", "ok (indistinguishable for screening)" if ok else "TOO LOSSY — keep float32")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
