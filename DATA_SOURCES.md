# Data sources

Training needs only the DEM tiles, the five 24-hr rainfall depths and a surge hydrograph shape as inputs, with the solver producing the labels. Address points, building footprints and high-water marks are for the app and validation, not training.

All sources were checked 2026-10-24; findings are noted per source.

## DEM (training input)

**Image server:** `https://www45.swfwmd.state.fl.us/arcgisimg/rest/services/DEM/PascoDEM18/ImageServer`

Example 128×128 × 10 m tile export (UTM 17N; that tile is near Port Richey):
```
/exportImage?bbox=331290,3128310,332570,3129590&bboxSR=26917&imageSR=26917
            &size=128,128&format=tiff&pixelType=F32
            &interpolation=RSP_BilinearInterpolation&f=image
```
- **Elevations are in US survey feet** (NAVD88, Geoid12B; vertical CRS 6360). Multiply by 0.3048 before giving them to the solver, which works in SI units.
- The native grid is 2.5 ft on FL State Plane West, ftUS (EPSG 6443). Passing `imageSR=26917` makes the server resample to a 10 m UTM grid; without it you get State Plane pixels.
- Pass `pixelType=F32` explicitly. Outside coverage the server returns **−3.4e38**. Coverage ends offshore (filled as Gulf at −3 ft) and at the county line on land (those tiles are rejected); `pfst/dem.py` tells them apart by the elevation of the rim around the gap.
- Lidar accuracy is 0.33 ft RMSEz, so DEM-noise perturbations in the ensemble should be about ±0.1 m.
- Server limits: 15000 × 4100 px per request.
- The test tile above was about 3–28 ft with no voids. Its slopes had a median of 0.022, a p99 of 0.11 and a max of 0.25, steeper than the solver's validation range (< 0.03). The solver stayed stable on these tiles: a 100-yr run took 114 s, mass closed to 1e-14, no clipping.
- **Bulk fallback:** https://chs.coast.noaa.gov/htdata/raster5/elevation/FL_Pasco_DEM_2018_9459 (also on S3: `noaa-nos-coastal-lidar-pds/dem/FL_Pasco_DEM_2018_9459`)
- **Metadata:** `fl2018_pasco_dem_m9459_met_forHumans.html` in the same folder.

## Rainfall (training input): NOAA Atlas 14, 24-hr depth, partial-duration series

Pulled at lat 28.27, lon −82.72 (Port Richey) from
`https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py?lat=28.27&lon=-82.72&type=pf&data=depth&units=english&series=pds`
(24-hr row = index 9; columns = 1, 2, 5, 10, 25, 50, 100, 200, 500, 1000 yr).

| Return period | 24-hr depth (in) | 90% CI (in) |
|---|---|---|
| 2-yr | 4.78 | 4.06 – 5.65 |
| 10-yr | 7.21 | 6.06 – 8.58 |
| 25-yr | 9.27 | 7.71 – 11.9 |
| 50-yr | 11.1 | 8.95 – 14.4 |
| 100-yr | 13.3 | 10.2 – 17.6 |

The 90% CI is a better-grounded ensemble band than the planned flat ±20%. A temporal distribution is still needed (e.g. SCS Type II/III or Atlas 14 temporal curves) to turn a 24-hr depth into `rain_fn(t)`.

## Surge (training input shape + Helene preset)

**Clearwater Beach gauge 8726724:** https://tidesandcurrents.noaa.gov/waterlevels.html?id=8726724
- API: `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_level&station=8726724&begin_date=20240926&end_date=20240927&datum=NAVD&units=english&time_zone=lst_ldt&format=csv`
- **Helene peak: 7.62 ft NAVD88 at 2024-09-26 23:00 local.**
- Station datums (ft): NAVD88 = 3.52 above STND, MSL −0.32 ft NAVD88, MHW +0.61 ft NAVD88 (used as the no-surge tide). The record is committed as `pfst/helene_8726724.csv`.
- Milton (Oct 9–10) peaked at only 2.25 ft at this gauge, because it caused negative surge north of landfall. Milton is not a surge case for west Pasco.
- The gauge is in Pinellas, about 25 km south of west Pasco, so use it for the hydrograph shape and the HWMs for local peaks.

**USGS storm-tide sensors and HWMs:** https://stn.wim.usgs.gov/FEV/. Export the CSV manually from the viewer; the scripted STNServices query returned nothing. This is for validation only.

## Homes and validation layers (not training)

These live in the Pasco ArcGIS org, `https://services6.arcgis.com/Mo4MddfRHpFwT7UF/ArcGIS/rest/services`.

| Layer | Path | Use |
|---|---|---|
| Address points | `PascoMapper_Addresses/FeatureServer/16` (**layer 16, not 0**: `/0` returns "Invalid URL") | "homes flagged", address lookup |
| Building footprints | `Building_Footprints_gisweb/FeatureServer/0` | Better than address points for counting structures in a footprint |
| SWFWMD flood model, Flood Areas | `SWFWMD_Flood_Model/FeatureServer/3` (field `Elevation_100yr`) | **The district's own 100-yr flood polygons. This is the best validation target for the 100-yr run.** |
| FEMA flood zones | **Use FEMA NFHL** `hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` (current AE/VE/X; MapServer, so `f=json` not `f=geojson`). The county's `FemaFloodZones` layer holds pre-2014 legacy zones (A9, C…), so don't use it for current zones | App toggle layer (raster export) and per-tile GeoJSON |
| Observed flooding | `PascoMapper_Storm/FeatureServer/6` (357 polygons countywide) | Map overlay; validation |
| Stormwater | `PascoMapper_Storm`, `AGOL_Stormwater`, `Pasco_Stormwater_Gates_1` | Culverts/structures for edits |

Query template: `.../query?where=1%3D1&geometry=XMIN,YMIN,XMAX,YMAX&geometryType=esriGeometryEnvelope&inSR=4326&outFields=*&f=json`. In the test bbox there were 849 addresses, 1,386 buildings and 232 flood-area polygons.
