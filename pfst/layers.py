"""Pasco County ArcGIS feature layers: buildings, addresses, flood zones, flood model.

See DATA_SOURCES.md. Queries are by UTM bbox; results cached as JSON under data/layers.
"""
import json
import pathlib
import time

import numpy as np
import requests

from . import geo

ORG = "https://services6.arcgis.com/Mo4MddfRHpFwT7UF/ArcGIS/rest/services"
LAYERS = {
    "buildings": f"{ORG}/Building_Footprints_gisweb/FeatureServer/0",
    "addresses": f"{ORG}/PascoMapper_Addresses/FeatureServer/16",
    # current effective FIRM zones (the county's FemaFloodZones layer is pre-2014 legacy zones)
    "fema": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
    "swfwmd_flood": f"{ORG}/SWFWMD_Flood_Model/FeatureServer/3",
}
CACHE = pathlib.Path(__file__).resolve().parents[1] / "data" / "layers"


def _get(url, params, retries=4):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=90)
            r.raise_for_status()
            d = r.json()
            if "error" in d:
                raise ValueError(d["error"])
            return d
        except (requests.RequestException, ValueError):
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def count(layer, bbox_utm):
    d = _get(f"{LAYERS[layer]}/query", {
        "where": "1=1", "geometry": ",".join(map(str, bbox_utm)), "geometryType": "esriGeometryEnvelope",
        "inSR": geo.UTM, "spatialRel": "esriSpatialRelIntersects", "returnCountOnly": "true", "f": "json"})
    return d["count"]


def _esri_to_geojson(d):
    """Esri JSON polygons/points -> GeoJSON features (for MapServers without f=geojson)."""
    feats = []
    for f in d.get("features", []):
        g = f.get("geometry") or {}
        if "rings" in g:
            geom = {"type": "Polygon", "coordinates": g["rings"]}
        elif "x" in g:
            geom = {"type": "Point", "coordinates": [g["x"], g["y"]]}
        else:
            continue
        feats.append({"type": "Feature", "properties": f.get("attributes", {}), "geometry": geom})
    return feats


def query_geojson(layer, bbox_utm, out_fields="*", out_sr=4326, page=2000):
    """All features in bbox as a GeoJSON FeatureCollection (paged)."""
    if "/MapServer/" in LAYERS[layer]:
        d = _get(f"{LAYERS[layer]}/query", {
            "where": "1=1", "geometry": ",".join(map(str, bbox_utm)), "geometryType": "esriGeometryEnvelope",
            "inSR": geo.UTM, "outSR": out_sr, "spatialRel": "esriSpatialRelIntersects",
            "outFields": out_fields, "returnGeometry": "true", "f": "json"})
        return {"type": "FeatureCollection", "features": _esri_to_geojson(d)}
    feats, offset = [], 0
    while True:
        d = _get(f"{LAYERS[layer]}/query", {
            "where": "1=1", "geometry": ",".join(map(str, bbox_utm)),
            "geometryType": "esriGeometryEnvelope", "inSR": geo.UTM, "outSR": out_sr,
            "spatialRel": "esriSpatialRelIntersects", "outFields": out_fields,
            "resultOffset": offset, "resultRecordCount": page, "f": "geojson"})
        feats += d.get("features", [])
        if not d.get("properties", {}).get("exceededTransferLimit") and not d.get("exceededTransferLimit"):
            if len(d.get("features", [])) < page:
                break
        offset += page
    return {"type": "FeatureCollection", "features": feats}


def tile_layer(layer, tid, out_fields="*"):
    """Cached GeoJSON of a layer clipped (by intersection) to a tile."""
    path = CACHE / layer / f"{tid}.geojson"
    if path.exists():
        return json.loads(path.read_text())
    fc = query_geojson(layer, geo.tile_bbox_utm(tid), out_fields)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fc))
    return fc


def _centroid(geom):
    """Mean of outer-ring vertices (good enough for building footprints)."""
    t = geom["type"]
    if t == "Point":
        return geom["coordinates"][:2]
    outer = [geom["coordinates"][0]] if t == "Polygon" else [p[0] for p in geom["coordinates"]]
    pts = np.concatenate([np.asarray(r, float)[:, :2] for r in outer])
    return pts.mean(axis=0).tolist()


def building_cells(tid):
    """(row, col) int arrays of building centroids inside the tile, + lon/lat array."""
    fc = tile_layer("buildings", tid, out_fields="OBJECTID")
    pts = [_centroid(f["geometry"]) for f in fc["features"] if f.get("geometry")]
    if not pts:
        return np.zeros(0, int), np.zeros(0, int), np.zeros((0, 2))
    pts = np.asarray(pts, float)
    r, c = geo.cells_from_lonlat(tid, pts)
    r, c = np.rint(r).astype(int), np.rint(c).astype(int)
    keep = (r >= 0) & (r < geo.N) & (c >= 0) & (c < geo.N)
    return r[keep], c[keep], pts[keep]
