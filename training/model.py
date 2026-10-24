"""FNO surrogate: inputs (B, 7, 128, 128) -> (h_max, h_final) depths (B, 2, 128, 128) in m."""
import torch
import torch.nn as nn
import torch.nn.functional as F

DEFAULT_CONFIG = {"n_modes": [32, 32], "hidden_channels": 64, "n_layers": 4,
                  "in_channels": 7, "out_channels": 2}


class FloodFNO(nn.Module):
    def __init__(self, n_modes=(32, 32), hidden_channels=64, n_layers=4, in_channels=7, out_channels=2):
        super().__init__()
        from neuralop.models import FNO
        self.fno = FNO(n_modes=tuple(n_modes), hidden_channels=hidden_channels, n_layers=n_layers,
                       in_channels=in_channels, out_channels=out_channels)

    def forward(self, x):
        # softplus keeps depths >= 0 without a hard clip (gradients survive at h = 0)
        return F.softplus(self.fno(x), beta=20.0)


def build(config):
    return FloodFNO(**{**DEFAULT_CONFIG, **config})


def load_checkpoint(path, map_location="cpu"):
    ck = torch.load(path, map_location=map_location, weights_only=False)
    model = build(ck["config"])
    # neuraloperator models add a non-tensor "_metadata" entry to their state_dict
    model.load_state_dict({k: v for k, v in ck["state_dict"].items() if not k.endswith("_metadata")})
    model.eval()
    return model, ck
