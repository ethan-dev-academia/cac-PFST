// One-page planning memo (HTML) for expo-print.
import type { Prediction, TileSummary } from "./api";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

function storm(p: Prediction) {
  const sc = p.scenario;
  const rain = sc.return_period ? `${sc.return_period}-yr, 24-hr storm (${sc.rain_in} in)` : `${sc.rain_in} in rainfall`;
  return sc.surge_ft > 0.7 ? `${rain} with ${sc.surge_ft.toFixed(1)} ft surge` : rain;
}

export function memoHtml(opts: { tile?: TileSummary; tileId: string; baseline: Prediction; project: Prediction | null; imagery: string | null }) {
  const { tile, tileId, baseline: b, project: p, imagery } = opts;
  const bs = b.stats, ps = p?.stats;
  const removed = ps ? bs.mean.homes_flagged - ps.mean.homes_flagged : null;
  const removedLo = ps ? bs.p10.homes_flagged - ps.p10.homes_flagged : null;
  const removedHi = ps ? bs.p90.homes_flagged - ps.p90.homes_flagged : null;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const edits = (p?.scenario.edits ?? []).map((e: any) => e.type === "pond"
    ? `Retention pond, ${e.radius_m ?? 40} m radius, ${e.depth_m ?? 2} m deep`
    : `Raised road segment, +${(((e.raise_m ?? 0.6) / 0.3048)).toFixed(1)} ft, ${e.path?.length ?? 0} vertices`);
  const panel = (pred: Prediction, title: string) => `
    <div class="panel"><div class="ptitle">${title}</div>
      <div class="map">${imagery ? `<img src="${imagery}">` : ""}<img src="data:image/png;base64,${pred.overlay_png}"></div>
      <div class="pstat"><b>${pred.stats.mean.homes_flagged}</b> homes &gt; 1 ft <span>(${pred.stats.p10.homes_flagged}–${pred.stats.p90.homes_flagged})</span></div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 0.6in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11pt; line-height: 1.4; }
    .hdr { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
    .hdr h1 { font-size: 15pt; margin: 0; letter-spacing: .02em; }
    .meta { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #444; display: grid; grid-template-columns: 70px 1fr; row-gap: 2px; margin: 8px 0 10px; }
    .meta b { color: #111; }
    .kpis { display: flex; gap: 10px; margin: 10px 0; font-family: Helvetica, Arial, sans-serif; }
    .kpi { flex: 1; border: 1px solid #bbb; padding: 8px 10px; }
    .kpi .n { font-size: 20pt; font-weight: 700; }
    .kpi .l { font-size: 8.5pt; color: #444; }
    .panels { display: flex; gap: 10px; }
    .panel { flex: 1; }
    .ptitle { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .map { position: relative; width: 100%; aspect-ratio: 1; background: #ddd; border: 1px solid #999; }
    .map img { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
    .pstat { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; margin-top: 4px; } .pstat span { color: #555; }
    h2 { font-size: 11pt; margin: 12px 0 4px; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    .fine { font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #555; margin-top: 12px; border-top: 1px solid #bbb; padding-top: 6px; }
  </style></head><body>
    <div class="hdr"><h1>MEMORANDUM — Flood Screening Result</h1></div>
    <div class="meta">
      <b>TO</b><span>Pasco County Stormwater Planning</span>
      <b>DATE</b><span>${date}</span>
      <b>AREA</b><span>${esc(tile?.place ?? "")} — tile ${tileId} (1.28 km × 1.28 km, 10 m cells)</span>
      <b>EVENT</b><span>${esc(storm(b))}</span>
      <b>PROJECT</b><span>${edits.length ? esc(edits.join("; ")) : "None — baseline conditions only"}</span>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="n">${bs.mean.homes_flagged}</div><div class="l">homes with &gt; 1 ft of water, baseline (band ${bs.p10.homes_flagged}–${bs.p90.homes_flagged} of ${bs.homes_total})</div></div>
      ${ps ? `<div class="kpi"><div class="n">${ps.mean.homes_flagged}</div><div class="l">with project (band ${ps.p10.homes_flagged}–${ps.p90.homes_flagged})</div></div>
      <div class="kpi"><div class="n">${removed! > 0 ? "−" + removed : removed}</div><div class="l">homes removed from &gt; 1 ft inundation (band ${Math.min(removedLo!, removedHi!)}–${Math.max(removedLo!, removedHi!)})</div></div>` : ""}
      <div class="kpi"><div class="n">${bs.mean.area_over_1ft_acres}</div><div class="l">acres over 1 ft, baseline</div></div>
    </div>
    <div class="panels">${panel(b, "Before")}${p ? panel(p, "After — with project") : ""}</div>
    <h2>Finding</h2>
    <p>${ps
      ? `Under the ${esc(storm(b))}, the proposed project is estimated to remove <b>${removed}</b> homes from the &gt; 1 ft inundation footprint in this tile (uncertainty band ${Math.min(removedLo!, removedHi!)} to ${Math.max(removedLo!, removedHi!)}). Dividing the project cost by this figure gives a per-home screening metric for ranking against other candidate sites.`
      : `Under the ${esc(storm(b))}, an estimated <b>${bs.mean.homes_flagged}</b> of ${bs.homes_total} structures in this tile see more than 1 ft of water at the building pad (band ${bs.p10.homes_flagged}–${bs.p90.homes_flagged}).`}</p>
    <h2>Recommendation</h2>
    <ul><li>Use this result to prioritize the tile for a detailed engineering study, not as a design basis.</li>
        <li>Confirm drainage connections (pipes, culverts) that the screening model does not represent.</li></ul>
    <div class="fine">Method: 2D local-inertial overland-flow solver on 2018 SWFWMD lidar (10 m), NOAA Atlas 14 24-hr rainfall (SCS Type III),
      surge shaped on the Helene record at NOAA gauge 8726724; ${b.backend === "fno" ? `Fourier neural operator surrogate, ${b.members}-member ensemble` : `${b.members}-member solver ensemble`} for p10/p90 bands.
      Storm drains are not modeled; tile edges are free outfalls. Screening-grade: intended to decide which neighborhoods get the full study first.
      Pasco Flood Screening Tool.</div>
  </body></html>`;
}
