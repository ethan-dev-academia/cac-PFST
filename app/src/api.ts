import Constants from "expo-constants";
import { Platform } from "react-native";

// API base: EXPO_PUBLIC_API_URL wins; otherwise the dev machine that serves the bundle, port 8000.
function defaultApi(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof location !== "undefined") return `${location.protocol}//${location.hostname}:8000`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:8000`;
}
export const API = defaultApi();

export type Cell = [number, number];
export type Edit =
  | { type: "pond"; center: Cell; radius_m: number; depth_m: number }
  | { type: "road"; path: Cell[]; width_m: number; raise_m: number };

export interface TileSummary {
  id: string; place: string; buildings: number; coastal: boolean; split: string;
  center: [number, number]; corners: [number, number][];
}
export interface BandStats { homes_flagged: number; cells_over_1ft: number; area_over_1ft_acres: number; max_depth_ft: number }
export interface Prediction {
  status: "done"; key: string; backend: "fno" | "solver"; members: number; tile_id: string;
  scenario: { return_period: number | null; rain_in: number; rain_band_in: [number, number]; surge_ft: number; edits: Edit[] };
  grids: { mean: string; p10: string; p90: string };
  overlay_png: string;
  stats: { p10: BandStats; mean: BandStats; p90: BandStats; homes_total: number };
  compute_s: number;
}
export interface Running { status: "running" | "error"; job_id: string; elapsed_s: number; eta_s: number; error?: string }
export interface Presets {
  return_periods: { years: number; rain_in: number; rain_lo_in: number; rain_hi_in: number }[];
  tide_ft: number; helene: { surge_ft: number; return_period: number; note: string };
}
export interface GeocodeResult { label: string; lon: number; lat: number; tile_id: string; cell: Cell | null; source: string }

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, init);
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).detail ?? msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}

export const api = {
  health: () => j<{ ok: boolean; backend: string; info: any }>("/health"),
  tiles: () => j<{ tiles: TileSummary[] }>("/tiles"),
  presets: () => j<Presets>("/presets"),
  tileMeta: (tid: string) => j<TileSummary>(`/tiles/${tid}?light=true`),
  tileAt: (lon: number, lat: number) => j<{ tile_id: string; cell: Cell | null }>(`/tiles/at?lon=${lon}&lat=${lat}`),
  geocode: (q: string) => j<{ results: GeocodeResult[] }>(`/geocode?q=${encodeURIComponent(q)}`),
  imageryUrl: (tid: string) => `${API}/tiles/${tid}/imagery.jpg`,

  /** POST /predict, then poll /jobs/{id} until done. onProgress gets elapsed seconds. */
  async predict(body: { tile_id: string; return_period?: number | null; rain_in?: number; surge_ft?: number; edits?: Edit[] },
                onProgress?: (elapsed: number, eta: number) => void, signal?: { cancelled: boolean }): Promise<Prediction> {
    let r = await j<Prediction | Running>("/predict", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ coords: "cell", frames: true, ...body }),
    });
    const t0 = Date.now();
    while (r.status !== "done") {
      if (r.status === "error") throw new Error((r as Running).error || "prediction failed");
      if (signal?.cancelled) throw new Error("cancelled");
      onProgress?.((Date.now() - t0) / 1000 + ((r as Running).elapsed_s || 0), (r as Running).eta_s || 120);
      await new Promise((res) => setTimeout(res, 2000));
      r = await j<Prediction | Running>(`/jobs/${(r as Running).job_id}`);
    }
    return r as Prediction;
  },
};

// uint16 mm grid (base64) -> depth in metres at a cell
export function depthAt(b64: string, cell: Cell): number {
  const bin = typeof atob === "function" ? atob(b64) : "";
  const k = (cell[0] * 128 + cell[1]) * 2;
  if (!bin) return 0;
  return (bin.charCodeAt(k) | (bin.charCodeAt(k + 1) << 8)) / 1000;
}
export const M_TO_FT = 1 / 0.3048;
