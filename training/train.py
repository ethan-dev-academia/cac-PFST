"""Train the FNO surrogate on solver runs.

    python training/train.py --epochs 150 --batch 16            # GPU picked automatically
    python training/train.py --smoke                            # 2 epochs on 16 samples, CPU ok

Writes models/fno.pt (best held-out rel-L2) and models/fno_metrics.json.
Loss (per sample, land cells only):
    rel_L2(h_max) + 0.5 rel_L2(h_final)
  + w_mass * |sum(h_final_pred) dx² - V_final| / V_ref     (mass balance, §6 budget)
  + w_order * mean(relu(h_final_pred - h_max_pred))        (max depth >= final depth)
"""
import argparse
import json
import pathlib
import sys
import time

import torch
from torch.utils.data import DataLoader

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from data import DX2, ROOT, FloodDataset  # noqa: E402
from model import DEFAULT_CONFIG, build  # noqa: E402

FT1 = 0.3048


def rel_l2(pred, true, mask):
    num = ((pred - true) ** 2 * mask).flatten(1).sum(1)
    den = (true ** 2 * mask).flatten(1).sum(1)
    return torch.sqrt(num / den.clamp_min(1e-4))  # dry samples: absolute error, ~1 cm floor


def losses(out, y, land, phys, w_mass, w_order):
    hmax_p, hfin_p = out[:, :1], out[:, 1:]
    l_max = rel_l2(hmax_p, y[:, :1], land)
    l_fin = rel_l2(hfin_p, y[:, 1:], land)
    v_pred = hfin_p.flatten(1).sum(1) * DX2
    l_mass = (v_pred - phys[:, 0]).abs() / phys[:, 1]
    l_order = torch.relu(hfin_p - hmax_p).flatten(1).mean(1)
    total = l_max + 0.5 * l_fin + w_mass * l_mass + w_order * l_order
    return total.mean(), {"rel_l2_hmax": l_max.mean().item(), "rel_l2_hfinal": l_fin.mean().item(),
                          "mass": l_mass.mean().item(), "order": l_order.mean().item()}


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    agg, n = {"rel_l2_hmax": 0.0, "mass": 0.0, "iou_1ft": 0.0, "mae_m": 0.0}, 0
    for x, y, land, phys in loader:
        x, y, land, phys = (t.to(device) for t in (x, y, land, phys))
        out = model(x)
        _, parts = losses(out, y, land, phys, 0, 0)
        b = x.shape[0]
        p1 = (out[:, :1] > FT1) & (land > 0)
        t1 = (y[:, :1] > FT1) & (land > 0)
        inter = (p1 & t1).flatten(1).sum(1).float()
        union = (p1 | t1).flatten(1).sum(1).float()
        iou = torch.where(union > 0, inter / union.clamp_min(1), torch.ones_like(union))
        agg["rel_l2_hmax"] += parts["rel_l2_hmax"] * b
        agg["mass"] += parts["mass"] * b
        agg["iou_1ft"] += iou.sum().item()
        agg["mae_m"] += (((out[:, :1] - y[:, :1]).abs() * land).flatten(1).sum(1)
                         / land.flatten(1).sum(1).clamp_min(1)).sum().item()
        n += b
    model.train()
    return {k: v / n for k, v in agg.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "data" / "dataset"))
    ap.add_argument("--out", default=str(ROOT / "models"))
    ap.add_argument("--epochs", type=int, default=150)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--w-mass", type=float, default=0.1)
    ap.add_argument("--w-order", type=float, default=1.0)
    ap.add_argument("--modes", type=int, default=32)
    ap.add_argument("--width", type=int, default=64)
    ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--no-preload", action="store_true")
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    limit = 16 if args.smoke else None
    epochs = 2 if args.smoke else args.epochs
    train_ds = FloodDataset("train", args.data, augment=True, preload=not args.no_preload, limit=limit)
    test_ds = FloodDataset("test", args.data, augment=False, preload=not args.no_preload, limit=limit)
    print(f"device {device}; {len(train_ds)} train / {len(test_ds)} held-out-tile samples")
    tl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=args.workers, drop_last=len(train_ds) > args.batch)
    vl = DataLoader(test_ds, batch_size=args.batch, num_workers=args.workers)

    config = {**DEFAULT_CONFIG, "n_modes": [args.modes, args.modes], "hidden_channels": args.width,
              "n_layers": args.layers}
    model = build(config).to(device)
    print(f"params {sum(p.numel() for p in model.parameters()) / 1e6:.2f} M")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=epochs * max(1, len(tl)))

    out_dir = pathlib.Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)
    best, history = float("inf"), []
    for ep in range(epochs):
        t0, run = time.time(), {}
        for x, y, land, phys in tl:
            x, y, land, phys = (t.to(device) for t in (x, y, land, phys))
            loss, parts = losses(model(x), y, land, phys, args.w_mass, args.w_order)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step()
            for k, v in parts.items():
                run[k] = run.get(k, 0.0) + v / len(tl)
        val = evaluate(model, vl, device)
        history.append({"epoch": ep, "train": run, "test": val, "sec": time.time() - t0})
        print(f"ep {ep:3d}  train relL2 {run['rel_l2_hmax']:.3f}  test relL2 {val['rel_l2_hmax']:.3f} "
              f"IoU>1ft {val['iou_1ft']:.3f}  MAE {val['mae_m'] * 100:.1f} cm  mass {val['mass']:.3f}  "
              f"({time.time() - t0:.0f}s)", flush=True)
        if val["rel_l2_hmax"] < best:
            best = val["rel_l2_hmax"]
            torch.save({"config": config, "state_dict": model.state_dict(), "epoch": ep, "test": val,
                        "channels": __import__("pfst.features", fromlist=["CHANNELS"]).CHANNELS},
                       out_dir / "fno.pt")
    (out_dir / "fno_metrics.json").write_text(json.dumps({"best_test_rel_l2": best, "history": history}, indent=1))
    print(f"best held-out rel-L2 {best:.4f} -> {out_dir / 'fno.pt'}  (target < 0.10)")


if __name__ == "__main__":
    main()
