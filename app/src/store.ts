import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Cell, Edit, GeocodeResult, PointInfo, Prediction, Presets, TileSummary } from "./api";

export type Tab = "home" | "explore" | "plan" | "about";
export type View = "map" | "3d";
export type Tool = null | "pond" | "road";
export type Showing = "baseline" | "project";

/** A saved address. Results hold prediction keys (the API caches the predictions). */
export interface Place {
  id: string;
  name: string;
  geo: GeocodeResult;
  info?: PointInfo;
  results: Record<string, string>;   // scenario key -> prediction key
  addedAt: number;
}

/** A county project: edits on a tile centred on the site, with a cost estimate. */
export interface Project {
  id: string;
  name: string;
  tileId: string;
  place: string;
  edits: Edit[];
  costUsd: number;
  rp: number;
  surgeFt: number;
  baselineKey?: string;
  projectKey?: string;
  homesBefore?: number;
  homesAfter?: number;
  removedBand?: [number, number];
  updatedAt: number;
}

interface Persisted { places: Place[]; projects: Project[]; seenIntro: boolean }

interface State extends Persisted {
  tab: Tab;
  view: View;
  screen: "main" | "report";
  openPlaceId: string | null;
  activeProjectId: string | null;
  tiles: TileSummary[];
  presets: Presets | null;
  backend: string;
  apiOk: boolean | null;
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
  layers: { fema: boolean; observed: boolean; swfwmd: boolean; buildings: boolean; grid: boolean };
  tapInfo: any | null;
  sheetOpen: boolean;
  focus: { lonlat: [number, number]; cell: [number, number] | null; tileId: string; t: number } | null;
  set: (p: Partial<State>) => void;
  addEdit: (e: Edit) => void;
  undoEdit: () => void;
  upsertPlace: (p: Place) => void;
  removePlace: (id: string) => void;
  upsertProject: (p: Project) => void;
  removeProject: (id: string) => void;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>()(persist((set) => ({
  places: [],
  projects: [],
  seenIntro: false,
  tab: "home",
  view: "map",
  screen: "main",
  openPlaceId: null,
  activeProjectId: null,
  tiles: [],
  presets: null,
  backend: "…",
  apiOk: null,
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
  layers: { fema: false, observed: false, swfwmd: false, buildings: true, grid: true },
  tapInfo: null,
  sheetOpen: true,
  focus: null,
  set: (p) => set(p),
  addEdit: (e) => set((s) => ({ edits: [...s.edits, e], project: null })),
  undoEdit: () => set((s) => ({ edits: s.edits.slice(0, -1), project: null })),
  upsertPlace: (p) => set((s) => ({ places: [p, ...s.places.filter((x) => x.id !== p.id)] })),
  removePlace: (id) => set((s) => ({ places: s.places.filter((x) => x.id !== id), openPlaceId: s.openPlaceId === id ? null : s.openPlaceId })),
  upsertProject: (p) => set((s) => ({ projects: [p, ...s.projects.filter((x) => x.id !== p.id)] })),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((x) => x.id !== id), activeProjectId: s.activeProjectId === id ? null : s.activeProjectId })),
}), {
  name: "pfst-v1",
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s): Persisted => ({ places: s.places, projects: s.projects, seenIntro: s.seenIntro }),
}));
