"""Design rainfall: NOAA Atlas 14 24-hr depths + an SCS 24-hr temporal pattern.

Depths are inches (as published). `design_storm` returns SI (m/s) for the solver.
"""
import numpy as np

IN = 0.0254

# NOAA Atlas 14 vol. 9, PDS, 24-hr depth (in), lat 28.27 lon -82.72 (Port Richey).
# Pulled 2026-10-24 from hdsc.nws.noaa.gov cgi_readH5.py; see DATA_SOURCES.md.
ATLAS14_24H = {
    2: (4.78, 4.06, 5.65),     # (mean, lower 90% CI, upper 90% CI)
    5: (5.98, 5.06, 7.08),
    10: (7.21, 6.06, 8.58),
    25: (9.27, 7.71, 11.9),
    50: (11.1, 8.95, 14.4),
    100: (13.3, 10.2, 17.6),
}
RETURN_PERIODS = tuple(ATLAS14_24H)

# NRCS TR-55 24-hr cumulative distributions P(t)/P24, t in hours.
# Type III applies to the Florida Gulf coast; Type II kept for sensitivity runs.
_T = [0, 2, 4, 6, 7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 11.75, 12, 12.5, 13, 13.5, 14,
      15, 16, 17, 18, 20, 22, 24]
SCS = {
    "III": [0, .020, .043, .072, .089, .115, .130, .148, .167, .189, .216, .250, .298, .339,
            .500, .702, .751, .785, .811, .854, .886, .910, .928, .958, .981, 1.0],
    "II": [0, .022, .048, .080, .098, .120, .133, .147, .163, .181, .204, .235, .283, .357,
           .663, .735, .772, .799, .820, .854, .880, .903, .922, .952, .976, 1.0],
}


def depth_in(return_period, which="mean"):
    mean, lo, hi = ATLAS14_24H[int(return_period)]
    return {"mean": mean, "lo": lo, "hi": hi}[which]


class DesignStorm:
    """Piecewise-constant hyetograph. Callable rain_fn(t) -> m/s, plus breakpoints.

    `t_offset` (s) shifts the storm start relative to simulation t = 0.
    """

    def __init__(self, total_m, kind="III", t_offset=0.0):
        self.total_m = float(total_m)
        t_h = np.asarray(_T, float)
        frac = np.asarray(SCS[kind], float)
        self.edges = t_h * 3600.0 + t_offset
        self.rates = np.diff(frac) * self.total_m / np.diff(self.edges)

    def __call__(self, t):
        k = np.searchsorted(self.edges, t, side="right") - 1
        if k < 0 or k >= len(self.rates):
            return 0.0
        return float(self.rates[k])

    @property
    def breakpoints(self):
        return tuple(self.edges)

    def peak_rate(self):
        return float(self.rates.max())


def design_storm(return_period=None, total_in=None, kind="III", t_offset=0.0):
    if total_in is None:
        total_in = depth_in(return_period)
    return DesignStorm(total_in * IN, kind, t_offset)
