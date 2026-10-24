import { create } from "zustand";
import type { Cell, Edit, GeocodeResult, Prediction, Presets, TileSummary } from "./api";

export type View = "map" | "3d";
export type Tool = null | "pond" | "road";
export type Showing = "baseline" | "project";

export interface Parcel {
  place: GeocodeResult;
  results: Record<string, Prediction | undefined>; // "10", "100", "helene"
}

interface State {
  view: View;
  screen: "main" | "report";
  tiles: TileSummary[];
  presets: Presets | null;
  backend: string;
  tileId: string | null;
  tileMeta: TileSummary | null;
  rp: number;
  surgeFt: number;
  edits: Edit[];
  tool: Tool;
  draftRoad: Cell[];
  baseline: Prediction | null;
  project: Prediction | null;
  showing: Showing;
  running: { label: string; elapsed: number; eta: number } | null;
  error: string | null;
  parcel: Parcel | null;
  layers: { fema: boolean; observed: boolean; swfwmd: boolean; buildings: boolean };
  tapInfo: any | null;
  sheetOpen: boolean;
  set: (p: Partial<State>) => void;
  addEdit: (e: Edit) => void;
  undoEdit: () => void;
}

export const useStore = create<State>((set) => ({
  view: "map",
  screen: "main",
  tiles: [],
  presets: null,
  backend: "…",
  tileId: null,
  tileMeta: null,
  rp: 25,
  surgeFt: 0.61,
  edits: [],
  tool: null,
  draftRoad: [],
  baseline: null,
  project: null,
  showing: "baseline",
  running: null,
  error: null,
  parcel: null,
  layers: { fema: false, observed: false, swfwmd: false, buildings: true },
  tapInfo: null,
  sheetOpen: true,
  set: (p) => set(p),
  addEdit: (e) => set((s) => ({ edits: [...s.edits, e], project: null })),
  undoEdit: () => set((s) => ({ edits: s.edits.slice(0, -1), project: null })),
}));
