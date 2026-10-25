// Long-running analyses that outlive any one screen: saved-place scenarios and project runs.
import { api, depthAt, Edit, M_TO_FT, Prediction } from "./api";
import { SCENARIOS } from "./risk";
import { Place, Project, useStore } from "./store";

const cache = new Map<string, Prediction>();

export async function getPrediction(key: string): Promise<Prediction | null> {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const r = await api.job(key);
    if (r.status === "done") { cache.set(key, r as Prediction); return r as Prediction; }
  } catch {}
  return null;
}
function remember(p: Prediction) { cache.set(p.key, p); return p; }

/** Depth band (ft) at a place for one scenario, or null if not computed yet. */
export function placeDepth(p: Prediction | null | undefined, place: Place) {
  const cell = place.geo.cell;
  if (!p || !cell) return null;
  return { mean: depthAt(p.grids.mean, cell) * M_TO_FT, p10: depthAt(p.grids.p10, cell) * M_TO_FT, p90: depthAt(p.grids.p90, cell) * M_TO_FT };
}

const queue: (() => Promise<void>)[] = [];
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) { try { await queue.shift()!(); } catch {} }
  pumping = false;
  useStore.getState().set({ running: null });
}

/** Run all resident scenarios for a place (sequentially, in the background). */
export function analyzePlace(placeId: string) {
  for (const sc of SCENARIOS) {
    queue.push(async () => {
      const st = useStore.getState();
      const place = st.places.find((p) => p.id === placeId);
      if (!place || !place.geo.cell || place.results[sc.key]) return;
      const label = `${place.name}: ${sc.title}`;
      st.set({ running: { label, elapsed: 0, eta: 120 } });
      const pred = remember(await api.predict({ tile_id: place.geo.tile_id, ...sc.body },
        (el, eta) => useStore.getState().set({ running: { label, elapsed: el, eta } })));
      const cur = useStore.getState().places.find((p) => p.id === placeId);
      if (cur) useStore.getState().upsertPlace({ ...cur, results: { ...cur.results, [sc.key]: pred.key } });
    });
  }
  pump();
}

/** Baseline + with-project runs for a project; updates the saved project with results. */
export function analyzeProject(projectId: string, onDone?: (base: Prediction, proj: Prediction | null) => void) {
  queue.push(async () => {
    const st = useStore.getState();
    const pr = st.projects.find((p) => p.id === projectId);
    if (!pr) return;
    const body = { tile_id: pr.tileId, return_period: pr.rp, surge_ft: pr.surgeFt };
    const tick = (label: string) => (el: number, eta: number) => useStore.getState().set({ running: { label, elapsed: el, eta } });
    st.set({ running: { label: `${pr.name}: baseline`, elapsed: 0, eta: 120 }, error: null });
    const base = remember(await api.predict({ ...body, edits: [] }, tick(`${pr.name}: baseline`)));
    let proj: Prediction | null = null;
    if (pr.edits.length) {
      proj = remember(await api.predict({ ...body, edits: pr.edits as Edit[] }, tick(`${pr.name}: with project`)));
    }
    const b = base.stats, a = proj?.stats;
    const cur = useStore.getState().projects.find((p) => p.id === projectId);
    if (cur) {
      useStore.getState().upsertProject({
        ...cur, baselineKey: base.key, projectKey: proj?.key, homesBefore: b.mean.homes_flagged,
        homesAfter: a?.mean.homes_flagged, inFootprint: a?.homes_in_footprint ?? 0,
        removedBand: a ? [b.p10.homes_flagged - a.p10.homes_flagged, b.p90.homes_flagged - a.p90.homes_flagged].sort((x, y) => x - y) as [number, number] : undefined,
        updatedAt: Date.now(),
      });
    }
    onDone?.(base, proj);
  });
  pump();
}

export function removed(p: Project) {
  return p.homesBefore != null && p.homesAfter != null ? p.homesBefore - p.homesAfter : null;
}
export function costPerHome(p: Project) {
  const r = removed(p);
  return r && r > 0 ? p.costUsd / r : null;
}
export const money = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;

/** Rough planning-level cost: excavation ~ $40/yd³ (+30% land/design) for ponds, ~$4M per mile for raising roads. */
export function estimateCost(edits: Edit[]) {
  let usd = 0;
  for (const e of edits) {
    if (e.type === "pond") usd += Math.PI * e.radius_m ** 2 * e.depth_m * 1.308 * 40 * 1.3;
    if (e.type === "road") {
      let len = 0;
      for (let i = 1; i < e.path.length; i++) len += Math.hypot(e.path[i][0] - e.path[i - 1][0], e.path[i][1] - e.path[i - 1][1]) * 10;
      usd += (len / 1609) * 4e6 * Math.max(0.5, e.raise_m / 0.6);
    }
  }
  return Math.round(usd / 1000) * 1000;
}

/** Full-screen "watch it flood": load a result and hand the screen to the map / 3D view. */
export async function watchFlood(key: string, title: string, sub: string, view: "3d" | "map" = "3d") {
  const p = await getPrediction(key);
  if (!p) return;
  useStore.getState().set({ tileId: p.tile_id, baseline: p, project: null, showing: "baseline", view, showcase: { title, sub, key } });
}
