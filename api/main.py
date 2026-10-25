"""Pasco Flood Screening API.

    uvicorn api.main:app --reload --port 8000

Endpoints
  GET  /health                    backend in use (fno | solver) and model info
  GET  /tiles                     catalog of prepared tiles (bounds, place, buildings)
  GET  /tiles/at?lon=&lat=        tile id + cell for any point (DEM fetched on demand)
  GET  /tiles/{id}                terrain grid, coast mask, buildings (for the 3D view)
  GET  /tiles/{id}/imagery.jpg    satellite image of the tile (Esri World Imagery), cached
  GET  /tiles/{id}/layers/{name}  GeoJSON clipped to the tile: fema, observed_flooding,
                                  swfwmd_100yr
  GET  /geocode?q=                Pasco address points (prefix match), Census fallback
  GET  /presets                   return periods, Atlas 14 depths, Helene preset
  POST /predict                   scenario -> depth mean/p10/p90 + PNG overlay + stats
  GET  /jobs/{id}                 poll a running solver-backend prediction
"""
import hashlib
import json
import pathlib
import threading
import time
import uuid

import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from pfst import county, dem, geo, layers, rainfall, scenario, surge, tiles

from . import render
from .predictor import make_predictor, rain_band

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
FT1 = 0.3048

app = FastAPI(title="Pasco Flood Screening API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.mount("/viz", StaticFiles(directory=pathlib.Path(__file__).with_name("static"), html=True), name="viz")

STATE = {"predictor": None}
JOBS = {}
LOCK = threading.Lock()

layers.LAYERS["observed_flooding"] = f"{layers.ORG}/PascoMapper_Storm/FeatureServer/6"
layers.LAYERS["swfwmd_100yr"] = layers.LAYERS["swfwmd_flood"]
TILE_LAYERS = {"fema": "FLD_ZONE,ZONE_SUBTY,STATIC_BFE", "observed_flooding": "*", "swfwmd_100yr": "Elevation_100yr"}


@app.on_event("startup")
def _startup():
    STATE["predictor"] = make_predictor()  # preload the model once
    CACHE.mkdir(parents=True, exist_ok=True)


def predictor():
    if STATE["predictor"] is None:
        _startup()
    return STATE["predictor"]


# ---------------------------------------------------------------- tiles
def _tile_or_404(tid):
    try:
        geo.parse_tile_id(tid)
        return dem.load_tile(tid)
    except dem.CoverageError as e:
        raise HTTPException(404, f"{tid}: {e}")
    except (ValueError, IndexError):
        raise HTTPException(400, f"bad tile id {tid!r}")


_GRID = None


def grid_index():
    global _GRID
    if _GRID is None:
        _GRID = {g["id"]: g for g in json.loads(county.GRID.read_text())["tiles"]}
    return _GRID


def tile_class(tid):
    g = grid_index().get(geo.base_tile_of(tid))
    return g["cls"] if g else "outside"


def _tile_summary(t):
    return {**{k: t[k] for k in ("id", "place", "buildings", "coastal", "split", "z_median")}, "cls": tile_class(t["id"]),
            "center": [t["lon"], t["lat"]], "corners": geo.tile_corners_lonlat(t["id"])}


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/viz/map.html")


@app.get("/health")
def health():
    p = predictor()
    return {"ok": True, "backend": p.name, "info": p.info}


@app.get("/tiles")
def list_tiles():
    cat = tiles.load_catalog()
    return {"study_bbox": cat["study_bbox"], "tiles": [_tile_summary(t) for t in cat["tiles"]]}


@app.get("/grid")
def county_grid():
    """Every 1.28 km tile in the county coverage, classified, as GeoJSON (for the map)."""
    feats = []
    for g in grid_index().values():
        c = geo.tile_corners_lonlat(g["id"])
        feats.append({"type": "Feature", "properties": {k: g.get(k) for k in ("id", "cls", "b", "z10", "zmed")},
                      "geometry": {"type": "Polygon", "coordinates": [[*c, c[0]]]}})
    return {"type": "FeatureCollection", "low_m": county.LOW_M, "features": feats}


@app.get("/tiles/at")
def tile_at(lon: float, lat: float):
    """Analysis tile centred on the point (overlapping half-lattice), so it is never near an edge."""
    tid = geo.analysis_tile_for_lonlat(lon, lat)
    _tile_or_404(tid)
    return {"tile_id": tid, "cell": geo.lonlat_to_cell(tid, lon, lat), "corners": geo.tile_corners_lonlat(tid),
            "cls": tile_class(tid)}


@app.get("/tiles/{tid}")
def tile_detail(tid: str, light: bool = False):
    z = _tile_or_404(tid)
    coast = tiles.surge_mask(z)
    if light:  # summary only (same shape as /tiles entries), no grids
        info = tiles.tile_info(tid)
        if info:
            return _tile_summary(info)
        lon, lat = geo.tile_center_lonlat(tid)
        try:
            nb = len(layers.building_cells(tid)[0])
        except Exception:
            nb = 0
        return {"id": tid, "place": tiles.nearest_place(lon, lat), "buildings": nb, "cls": tile_class(tid),
                "coastal": bool(coast.sum() >= tiles.COAST_MIN_CELLS), "split": "on-demand",
                "z_median": float(np.median(z)), "center": [lon, lat], "corners": geo.tile_corners_lonlat(tid)}
    try:
        r, c, pts = layers.building_cells(tid)
    except Exception:
        r, c, pts = np.zeros(0, int), np.zeros(0, int), np.zeros((0, 2))
    info = tiles.tile_info(tid) or {}
    lon, lat = geo.tile_center_lonlat(tid)
    return {
        "id": tid, "place": info.get("place") or tiles.nearest_place(lon, lat),
        "n": geo.N, "dx": geo.DX, "center": [lon, lat], "corners": geo.tile_corners_lonlat(tid),
        "z_b64": render.grid_f32_b64(z), "z_min": float(z.min()), "z_max": float(z.max()),
        "coast_b64": render.mask_b64(coast), "coastal": bool(coast.any()),
        "buildings": [[int(a), int(b), round(float(p[0]), 6), round(float(p[1]), 6)]
                      for a, b, p in zip(r, c, pts)],
        "imagery": f"/tiles/{tid}/imagery.jpg",
    }


@app.get("/tiles/{tid}/imagery.jpg")
def tile_imagery(tid: str):
    path = CACHE / "imagery" / f"{tid}.jpg"
    if not path.exists():
        x0, y0, x1, y1 = geo.tile_bbox_utm(tid)
        r = requests.get("https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export",
                         params={"bbox": f"{x0},{y0},{x1},{y1}", "bboxSR": geo.UTM, "imageSR": geo.UTM,
                                 "size": "1024,1024", "format": "jpg", "f": "image"}, timeout=60)
        if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
            raise HTTPException(502, "imagery service unavailable")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


@app.get("/tiles/{tid}/buildings")
def tile_buildings(tid: str):
    """Building footprints (GeoJSON) with the tile cell of each centroid, for 3D extrusion."""
    geo.parse_tile_id(tid)
    fc = layers.tile_layer("buildings", tid, out_fields="OBJECTID")
    feats = []
    for f in fc["features"]:
        if not f.get("geometry"):
            continue
        lon, lat = layers._centroid(f["geometry"])
        cell = geo.lonlat_to_cell(tid, lon, lat)
        if cell:
            feats.append({"type": "Feature", "geometry": f["geometry"],
                          "properties": {"r": cell[0], "c": cell[1], "k": cell[0] * geo.N + cell[1]}})
    return {"type": "FeatureCollection", "features": feats}


@app.get("/tiles/{tid}/layers/{name}")
def tile_layer(tid: str, name: str):
    if name not in TILE_LAYERS:
        raise HTTPException(404, f"unknown layer {name!r}; one of {sorted(TILE_LAYERS)}")
    geo.parse_tile_id(tid)
    return layers.tile_layer(name, tid, out_fields=TILE_LAYERS[name])


# ---------------------------------------------------------------- geocoding
@app.get("/geocode")
def geocode(q: str, limit: int = 6):
    q = q.strip().upper().replace("'", "''")
    out = []
    if len(q) >= 3:
        try:
            d = layers._get(f"{layers.LAYERS['addresses']}/query", {
                "where": f"FULL_ADDRESS LIKE '{q.split(',')[0].strip()}%' AND STATUS='ACTIVE'",
                "outFields": "FULL_ADDRESS,MAILING_CITY,ZIP_CODE5,LATITUDE,LONGITUDE",
                "returnGeometry": "false", "resultRecordCount": limit, "orderByFields": "FULL_ADDRESS", "f": "json"},
                retries=2)
            for f in d.get("features", []):
                a = f["attributes"]
                if a.get("LATITUDE") and a.get("LONGITUDE"):
                    out.append({"label": f"{a['FULL_ADDRESS']}, {a['MAILING_CITY'].title()} {a['ZIP_CODE5']}",
                                "lon": a["LONGITUDE"], "lat": a["LATITUDE"], "source": "pasco"})
        except Exception:
            pass
    if not out and len(q) >= 5:
        try:
            r = requests.get("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
                             params={"address": q if "FL" in q else q + ", FL", "benchmark": "Public_AR_Current",
                                     "format": "json"}, timeout=20)
            for m in r.json()["result"]["addressMatches"][:limit]:
                out.append({"label": m["matchedAddress"].title(), "lon": m["coordinates"]["x"],
                            "lat": m["coordinates"]["y"], "source": "census"})
        except Exception:
            pass
    for o in out:
        o["tile_id"] = geo.analysis_tile_for_lonlat(o["lon"], o["lat"])
        o["cell"] = geo.lonlat_to_cell(o["tile_id"], o["lon"], o["lat"])
    return {"results": out}


@app.get("/point")
def point_info(lon: float, lat: float):
    """Everything known about a location without running a model: FEMA zone, ground, tile class."""
    tid = geo.analysis_tile_for_lonlat(lon, lat)
    out = {"lon": lon, "lat": lat, "tile_id": tid, "cell": geo.lonlat_to_cell(tid, lon, lat), "cls": tile_class(tid)}
    try:
        z = dem.load_tile(tid)
        r, c = out["cell"]
        out["ground_ft"] = round(float(z[r, c]) / geo.FT, 1)
    except Exception:
        out["ground_ft"] = None
    try:
        x, y = geo.lonlat_to_utm(lon, lat)
        d = layers._get(f"{layers.LAYERS['fema']}/query", {
            "geometry": f"{x},{y}", "geometryType": "esriGeometryPoint", "inSR": geo.UTM,
            "spatialRel": "esriSpatialRelIntersects", "outFields": "FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF",
            "returnGeometry": "false", "f": "json"}, retries=4)
        a = (d.get("features") or [{}])[0].get("attributes", {})
        bfe = a.get("STATIC_BFE")
        out["fema"] = {"zone": a.get("FLD_ZONE"), "subtype": a.get("ZONE_SUBTY"),
                       "sfha": a.get("SFHA_TF") == "T", "bfe_ft": bfe if bfe and bfe > -9000 else None}
    except Exception:
        out["fema"] = None
    return out


# Featured flood scenarios for the app's "See it in action" gallery. Computed once, then cached.
SHOWCASES = [
    {"id": "helene-port-richey", "title": "Helene-level surge", "place": "Port Richey waterfront",
     "blurb": "A 7.6 ft storm tide pushes up the canals and into the streets.",
     "lonlat": [-82.7375, 28.2745], "request": {"return_period": 2, "surge_ft": 7.62}},
    {"id": "hudson-hurricane", "title": "Hurricane surge + heavy rain", "place": "Hudson coast",
     "blurb": "Surge and a 1-in-25 rain together, on the lowest ground in the county.",
     "lonlat": [-82.708, 28.364], "request": {"return_period": 25, "surge_ft": 7.62}},
    {"id": "severe-port-richey", "title": "Severe rainstorm", "place": "Downtown Port Richey",
     "blurb": "13 inches of rain in a day: watch the low streets fill first.",
     "lonlat": [-82.7113, 28.2760], "request": {"return_period": 100}},
    {"id": "severe-holiday", "title": "Severe rainstorm", "place": "Holiday",
     "blurb": "Dense neighbourhoods with nowhere for the water to go.",
     "lonlat": [-82.76, 28.19], "request": {"return_period": 100}},
]


def _showcase_req(sc):
    return PredictRequest(tile_id=geo.analysis_tile_for_lonlat(*sc["lonlat"]), frames=True, **sc["request"])


@app.get("/showcases")
def showcases():
    out = []
    for sc in SHOWCASES:
        req = _showcase_req(sc)
        key = _key(req)
        cached = CACHE / f"{key}.json"
        stats = None
        if cached.exists():
            r = json.loads(cached.read_text())
            stats = {"homes": r["stats"]["mean"]["homes_flagged"], "acres": r["stats"]["mean"]["area_over_1ft_acres"]}
        out.append({**{k: sc[k] for k in ("id", "title", "place", "blurb")}, "tile_id": req.tile_id, "key": key,
                    "request": req.model_dump(), "ready": cached.exists(), "stats": stats,
                    "thumb": f"/tiles/{req.tile_id}/imagery.jpg"})
    return {"showcases": out}


@app.post("/showcases/warm")
def warm_showcases():
    """Start computing any showcase that isn't cached yet (solver backend: a few minutes each)."""
    started = []
    for sc in SHOWCASES:
        r = predict(_showcase_req(sc))
        if r.get("status") != "done":
            started.append(sc["id"])
    return {"started": started}


@app.get("/presets")
def presets():
    return {
        "return_periods": [{"years": rp, "rain_in": v[0], "rain_lo_in": v[1], "rain_hi_in": v[2]}
                           for rp, v in rainfall.ATLAS14_24H.items()],
        "tide_ft": round(surge.TIDE_M / geo.FT, 2),
        "helene": {"surge_ft": surge.HELENE_PEAK_FT, "return_period": 2,
                   "note": "Helene peak at Clearwater Beach gauge 8726724, 7.62 ft NAVD88, 2024-09-26"},
        "flood_threshold_ft": 1.0,
    }


# ---------------------------------------------------------------- prediction
class Edit(BaseModel):
    type: str                                   # pond | road | culvert
    center: list[float] | None = None           # pond
    radius_m: float = 40.0
    depth_m: float = 2.0
    path: list[list[float]] | None = None       # road
    width_m: float = 15.0
    raise_m: float = 0.6
    a: list[float] | None = None                # culvert ends
    b: list[float] | None = None
    diameter_m: float = 0.9


class PredictRequest(BaseModel):
    tile_id: str
    return_period: int | None = Field(None, description="2, 5, 10, 25, 50, 100")
    rain_in: float | None = None
    surge_ft: float | None = None
    edits: list[Edit] = []
    coords: str = Field("cell", description="'cell' = [row, col]; 'lonlat' = [lon, lat]")
    frames: bool = True


def _to_cells(tid, pts, coords):
    if coords == "cell":
        return [list(map(float, p)) for p in pts]
    r, c = geo.cells_from_lonlat(tid, pts)
    return [[float(a), float(b)] for a, b in zip(r, c)]


def _scenario_edits(req):
    out = []
    for e in req.edits:
        if e.type == "pond" and e.center:
            out.append({"type": "pond", "center": _to_cells(req.tile_id, [e.center], req.coords)[0],
                        "radius": e.radius_m / geo.DX, "depth_m": e.depth_m})
        elif e.type == "road" and e.path and len(e.path) >= 2:
            out.append({"type": "road", "path": _to_cells(req.tile_id, e.path, req.coords),
                        "width": e.width_m / geo.DX, "raise_m": e.raise_m})
        elif e.type == "culvert" and e.a and e.b:
            a, b = _to_cells(req.tile_id, [e.a, e.b], req.coords)
            out.append({"type": "culvert", "a": a, "b": b, "diameter_m": e.diameter_m})
        else:
            raise HTTPException(400, f"incomplete edit: {e.model_dump()}")
    return out


def _stats(h, z, tid, dz):
    try:
        r, c, _ = layers.building_cells(tid)
    except Exception:
        r = c = np.zeros(0, int)
    flood = dz >= 0  # water standing in an excavated pond is storage, not flooding
    keep = flood[r, c] if len(r) else np.zeros(0, bool)   # buildings under a pond footprint are not "flooded homes"
    out = {"homes_in_footprint": int((~keep).sum())}
    for k in ("p10", "mean", "p90"):
        over = (h[k] > FT1) & flood
        out[k] = {"homes_flagged": int(((h[k][r, c] > FT1) & keep).sum()) if len(r) else 0,
                  "cells_over_1ft": int(over.sum()),
                  "area_over_1ft_acres": round(float(over.sum()) * geo.DX ** 2 / 4046.86, 1),
                  "max_depth_ft": round(float(np.where(flood, h[k], 0).max()) / geo.FT, 2)}
    out["homes_total"] = int(len(r))
    depths = {k: np.rint(h[k][r, c] / geo.FT * 100).astype(int).tolist() for k in ("p10", "mean", "p90")}
    return out, depths


def _compute(req, key):
    z = dem.load_tile(req.tile_id)
    coast = tiles.surge_mask(z)
    edits = _scenario_edits(req)
    dz, _ = scenario.apply_edits(z, edits)
    rain = rain_band(req.return_period, req.rain_in if req.rain_in is not None else 0.0)
    surge_ft = req.surge_ft if req.surge_ft is not None else surge.TIDE_M / geo.FT
    p = predictor()
    t0 = time.time()
    h = p.predict(z, coast, dz, edits, rain, surge_ft, frames=req.frames)
    stats, bdepth = _stats(h, z, req.tile_id, dz)
    result = {
        "status": "done", "key": key, "backend": p.name, "members": h["members"], "tile_id": req.tile_id,
        "scenario": {"return_period": req.return_period, "rain_in": rain[0], "rain_band_in": [rain[1], rain[2]],
                     "surge_ft": surge_ft, "edits": [e.model_dump(exclude_none=True) for e in req.edits]},
        "grids": {k: render.grid_mm_b64(h[k]) for k in ("p10", "mean", "p90")},
        "dz_b64": render.grid_f32_b64(dz),
        "overlay_png": render.depth_png_b64(h["mean"]),
        "stats": stats, "building_depth_ft_x100": bdepth,
        "compute_s": round(time.time() - t0, 2),
    }
    if h.get("frames"):
        result["frames"] = {"t_h": [round(t / 3600, 2) for t, _ in h["frames"]],
                            "grids": [render.grid_mm_b64(f) for _, f in h["frames"]]}
    (CACHE / f"{key}.json").write_text(json.dumps(result))
    return result


def _key(req):
    p = predictor()
    blob = json.dumps({"b": p.name, "info": str(p.info.get("epoch")), **req.model_dump()}, sort_keys=True)
    return hashlib.sha1(blob.encode()).hexdigest()[:20]


@app.post("/predict")
def predict(req: PredictRequest):
    _tile_or_404(req.tile_id)
    if req.return_period is not None and req.return_period not in rainfall.ATLAS14_24H:
        raise HTTPException(400, f"return_period must be one of {list(rainfall.ATLAS14_24H)}")
    if req.return_period is None and req.rain_in is None and req.surge_ft is None:
        raise HTTPException(400, "give return_period or rain_in, and/or surge_ft")
    key = _key(req)
    cached = CACHE / f"{key}.json"
    if cached.exists():
        return json.loads(cached.read_text())
    if not predictor().is_async:
        return _compute(req, key)
    with LOCK:  # one background job per distinct scenario
        if key not in JOBS or JOBS[key]["status"] == "error":
            JOBS[key] = {"status": "running", "job_id": key, "started": time.time()}

            def runner():
                try:
                    _compute(req, key)
                    JOBS[key]["status"] = "done"
                except Exception as e:  # surface to the client
                    JOBS[key].update(status="error", error=repr(e))
            threading.Thread(target=runner, daemon=True).start()
    j = JOBS[key]
    return {**j, "elapsed_s": round(time.time() - j["started"], 1), "eta_s": 120}


@app.get("/jobs/{job_id}/overlay.png")
def job_overlay(job_id: str, band: str = "mean"):
    """Depth overlay PNG (RGBA) for a finished prediction; band = mean | p10 | p90."""
    import base64
    from fastapi.responses import Response
    cached = CACHE / f"{job_id}.json"
    if not cached.exists() or band not in ("mean", "p10", "p90"):
        raise HTTPException(404, "unknown job or band")
    r = json.loads(cached.read_text())
    if band == "mean":
        png = base64.b64decode(r["overlay_png"])
    else:
        mm = np.frombuffer(base64.b64decode(r["grids"][band]), "<u2").reshape(geo.N, geo.N) / 1000.0
        png = base64.b64decode(render.depth_png_b64(mm))
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/jobs/{job_id}")
def job(job_id: str):
    cached = CACHE / f"{job_id}.json"
    if cached.exists():
        return json.loads(cached.read_text())
    j = JOBS.get(job_id)
    if not j:
        raise HTTPException(404, "unknown job")
    return {**j, "elapsed_s": round(time.time() - j["started"], 1), "eta_s": 120}
