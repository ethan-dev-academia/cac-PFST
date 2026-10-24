import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { API, api, Edit, GeocodeResult, Prediction } from "./src/api";
import { ParcelCard, PARCEL_RUNS } from "./src/components/ParcelCard";
import { ScenarioSheet } from "./src/components/ScenarioSheet";
import { SearchBar } from "./src/components/SearchBar";
import { VizFrame, VizHandle } from "./src/components/VizFrame";
import { ReportScreen } from "./src/screens/ReportScreen";
import { useStore } from "./src/store";
import { C, R } from "./src/theme";

const MAP_URL = `${API}/viz/map.html?api=${encodeURIComponent(API)}`;
const EXPLORER_URL = `${API}/viz/explorer.html?api=${encodeURIComponent(API)}&hidden=1&embed=1`;

export default function App() {
  const st = useStore();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const mapRef = useRef<VizHandle>(null);
  const xRef = useRef<VizHandle>(null);
  const both = (m: object) => { mapRef.current?.post(m); xRef.current?.post(m); };

  // boot
  useEffect(() => {
    api.health().then((h) => st.set({ backend: h.backend })).catch(() => st.set({ error: `API not reachable at ${API}` }));
    api.tiles().then((t) => st.set({ tiles: t.tiles })).catch(() => {});
    api.presets().then((p) => st.set({ presets: p, surgeFt: p.tide_ft })).catch(() => {});
  }, []);

  const shown: Prediction | null = st.showing === "project" && st.project ? st.project : st.baseline;
  const allEdits = (): Edit[] => st.draftRoad.length > 1
    ? [...st.edits, { type: "road", path: st.draftRoad, width_m: 15, raise_m: 0.6 }] : st.edits;

  // keep both visual layers in sync with app state
  useEffect(() => {
    if (!st.tileId) return;
    both({ type: "load", tile_id: st.tileId });
    const known = st.tiles.find((t) => t.id === st.tileId);
    st.set({ tileMeta: known ?? null });
    if (!known) api.tileMeta(st.tileId).then((m) => useStore.getState().tileId === m.id && st.set({ tileMeta: m })).catch(() => {});
  }, [st.tileId]);
  useEffect(() => { both({ type: "edits", edits: allEdits() }); }, [st.edits, st.draftRoad]);
  useEffect(() => { mapRef.current?.post({ type: "layers", layers: st.layers }); }, [st.layers]);
  useEffect(() => { xRef.current?.post({ type: "visible", on: st.view === "3d" }); }, [st.view]);
  useEffect(() => { both(shown ? { type: "result", key: shown.key } : { type: "clear" }); }, [shown?.key]);

  const onViz = useCallback((m: any) => {
    const s = useStore.getState();
    if (m.type === "ready") {
      const target = m.view === "map" ? mapRef.current : xRef.current;
      if (s.tileId) target?.post({ type: "load", tile_id: s.tileId, fly: true });
      const cur = s.showing === "project" && s.project ? s.project : s.baseline;
      if (cur) target?.post({ type: "result", key: cur.key });
      target?.post({ type: "layers", layers: s.layers });
      if (m.view === "explorer") target?.post({ type: "visible", on: s.view === "3d" });
      if (s.parcel?.place.cell) target?.post({ type: "pin", cell: s.parcel.place.cell, lonlat: [s.parcel.place.lon, s.parcel.place.lat] });
    } else if (m.type === "selectTile") {
      if (m.tile_id !== s.tileId) selectTile(m.tile_id);
    } else if (m.type === "tapOutside" && m.lonlat) {
      api.tileAt(m.lonlat[0], m.lonlat[1]).then((t) => selectTile(t.tile_id)).catch(() => {});
    } else if (m.type === "tap" && m.cell) {
      if (s.tool === "pond") { s.addEdit({ type: "pond", center: m.cell, radius_m: 40, depth_m: 2 }); s.set({ tool: null }); }
      else if (s.tool === "road") s.set({ draftRoad: [...s.draftRoad, m.cell] });
      else s.set({ tapInfo: m });
    }
  }, []);

  function selectTile(tid: string) {
    useStore.getState().set({ tileId: tid, baseline: null, project: null, edits: [], draftRoad: [], tool: null, showing: "baseline", error: null });
  }

  async function run() {
    const s = useStore.getState();
    if (!s.tileId) return;
    const body = { tile_id: s.tileId, return_period: s.rp, surge_ft: s.surgeFt };
    s.set({ error: null, running: { label: "Running baseline…", elapsed: 0, eta: 120 }, baseline: null, project: null, showing: "baseline" });
    try {
      const base = await api.predict({ ...body, edits: [] }, (el, eta) => s.set({ running: { label: "Running baseline…", elapsed: el, eta } }));
      s.set({ baseline: base });
      const edits = allEdits();
      if (edits.length) {
        s.set({ running: { label: "Running with project…", elapsed: 0, eta: 120 } });
        const proj = await api.predict({ ...body, edits }, (el, eta) => s.set({ running: { label: "Running with project…", elapsed: el, eta } }));
        s.set({ project: proj, showing: "project", edits, draftRoad: [] });
      }
      if (compactRef.current) s.set({ sheetOpen: false });   // let the map show the result on phones
    } catch (e: any) { s.set({ error: e.message }); }
    finally { s.set({ running: null }); }
  }

  async function pickAddress(r: GeocodeResult) {
    const s = useStore.getState();
    s.set({ parcel: { place: r, results: {} } });
    if (r.tile_id !== s.tileId) selectTile(r.tile_id);
    both({ type: "pin", cell: r.cell, lonlat: [r.lon, r.lat] });
    if (!r.cell) return;
    for (const run of PARCEL_RUNS) {
      const label = `Your parcel: ${run.label}…`;
      s.set({ running: { label, elapsed: 0, eta: 120 } });
      try {
        const p = await api.predict({ tile_id: r.tile_id, ...run.body }, (el, eta) => s.set({ running: { label, elapsed: el, eta } }));
        const cur = useStore.getState().parcel;
        if (!cur || cur.place !== r) break;
        s.set({ parcel: { ...cur, results: { ...cur.results, [run.key]: p } }, baseline: p, project: null, showing: "baseline",
                rp: p.scenario.return_period ?? s.rp, surgeFt: p.scenario.surge_ft });
      } catch (e: any) { s.set({ error: e.message }); break; }
    }
    s.set({ running: null, ...(compactRef.current ? { sheetOpen: false } : {}) });
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill}>
        <VizFrame ref={mapRef} url={MAP_URL} visible={st.view === "map"} onMessage={onViz} />
        <VizFrame ref={xRef} url={EXPLORER_URL} visible={st.view === "3d"} onMessage={onViz} />
      </View>

      <View style={[s.top, !compact && { right: undefined, width: 560 }]} pointerEvents="box-none">
        {!compact && <View style={s.brand}><Text style={s.brandT}>PFST</Text></View>}
        <SearchBar onPick={pickAddress} />
        <View style={s.seg}>
          {(["map", "3d"] as const).map((v) => (
            <Pressable key={v} onPress={() => st.set({ view: v })} style={[s.segB, st.view === v && s.segOn]}>
              <Text style={[s.segT, st.view === v && { color: C.ink }]}>{v === "map" ? "Map" : "3D"}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {st.parcel && (
        <ParcelCard parcel={st.parcel} onClose={() => { st.set({ parcel: null }); both({ type: "pin", cell: null }); }}
                    onShow={(p) => st.set({ baseline: p, project: null, showing: "baseline" })} />
      )}

      {st.tool && (
        <View style={s.toolHint} pointerEvents="none">
          <Text style={s.toolHintT}>{st.tool === "pond" ? "Tap the map to place a retention pond" : "Tap points along the road to raise"}</Text>
        </View>
      )}

      <ScenarioSheet compact={compact} onRun={run} onReport={() => st.set({ screen: "report" })}
                     onShow={(w) => st.set({ showing: w })} />

      {/* report draws over the map so the visual frames (and their WebGL state) stay alive */}
      {st.screen === "report" && <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}><ReportScreen /></View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg0 },
  top: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", gap: 8, alignItems: "flex-start", zIndex: 20 },
  brand: { height: 46, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: C.accent, justifyContent: "center" },
  brandT: { color: "#03111f", fontWeight: "900", letterSpacing: 1.5, fontSize: 13 },
  seg: { flexDirection: "row", height: 46, padding: 4, borderRadius: R.md, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line },
  segB: { paddingHorizontal: 14, justifyContent: "center", borderRadius: 10 },
  segOn: { backgroundColor: C.accentDim },
  segT: { color: C.muted, fontWeight: "700", fontSize: 13 },
  toolHint: { position: "absolute", top: 70, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: "rgba(62,230,168,0.18)", borderWidth: 1, borderColor: "rgba(62,230,168,0.6)" },
  toolHintT: { color: C.ok, fontWeight: "700", fontSize: 13 },
});
