import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from "react-native";
import { API, api, Edit, GeocodeResult, Prediction } from "./src/api";
import { ScenarioSheet } from "./src/components/ScenarioSheet";
import { SearchBar } from "./src/components/SearchBar";
import { VizFrame, VizHandle } from "./src/components/VizFrame";
import { AboutScreen } from "./src/screens/AboutScreen";
import { addPlace, HomeScreen } from "./src/screens/HomeScreen";
import { PlaceScreen } from "./src/screens/PlaceScreen";
import { PlanScreen, setProjectSite } from "./src/screens/PlanScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { getPrediction } from "./src/services";
import { Tab, useStore } from "./src/store";
import { C, R } from "./src/theme";
import { Icon, IconName } from "./src/ui";

const MAP_URL = `${API}/viz/map.html?api=${encodeURIComponent(API)}`;
const EXPLORER_URL = `${API}/viz/explorer.html?api=${encodeURIComponent(API)}&hidden=1&embed=1`;
const TABS: { key: Tab; label: string; icon: IconName; on: IconName }[] = [
  { key: "home", label: "My places", icon: "home-outline", on: "home" },
  { key: "explore", label: "Explore", icon: "map-outline", on: "map" },
  { key: "plan", label: "Plan", icon: "construct-outline", on: "construct" },
  { key: "about", label: "About", icon: "information-circle-outline", on: "information-circle" },
];
const PANEL_W = 420;
const RAIL_W = 76;

export default function App() {
  const st = useStore();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const mapRef = useRef<VizHandle>(null);
  const xRef = useRef<VizHandle>(null);
  const both = (m: object) => { mapRef.current?.post(m); xRef.current?.post(m); };

  // boot
  useEffect(() => {
    api.health().then((h) => st.set({ backend: h.backend, apiOk: true })).catch(() => st.set({ apiOk: false, error: `Can't reach the flood API at ${API}` }));
    api.presets().then((p) => st.set({ presets: p, surgeFt: p.tide_ft })).catch(() => {});
  }, []);

  const activeProject = st.projects.find((p) => p.id === st.activeProjectId);
  const openPlace = st.places.find((p) => p.id === st.openPlaceId);
  const shown: Prediction | null = st.showing === "project" && st.project ? st.project : st.baseline;
  const allEdits = (): Edit[] => st.draftRoad.length > 1
    ? [...st.edits, { type: "road", path: st.draftRoad, width_m: 15, raise_m: 0.6 }] : st.edits;

  // where the map sits for this layout
  const mapVisible = wide || st.tab === "explore" || (st.tab === "plan" && !!activeProject);
  const splitPlan = !wide && st.tab === "plan" && !!activeProject;
  const mapBox: ViewStyle = wide ? { left: RAIL_W + PANEL_W, top: 0, right: 0, bottom: 0 }
    : splitPlan ? { left: 0, top: 0, right: 0, height: Math.round(height * 0.42) }
    : { left: 0, top: 0, right: 0, bottom: 64 };

  // keep both visual layers in sync with app state
  useEffect(() => {
    both({ type: "load", tile_id: st.tileId });
    if (!st.tileId) { st.set({ tileMeta: null }); return; }
    api.tileMeta(st.tileId).then((m) => useStore.getState().tileId === m.id && st.set({ tileMeta: m })).catch(() => {});
  }, [st.tileId]);
  useEffect(() => { both({ type: "edits", edits: allEdits() }); }, [st.edits, st.draftRoad]);
  useEffect(() => { mapRef.current?.post({ type: "layers", layers: st.layers }); }, [st.layers]);
  useEffect(() => { xRef.current?.post({ type: "visible", on: st.view === "3d" && mapVisible }); }, [st.view, mapVisible]);
  useEffect(() => { both(shown ? { type: "result", key: shown.key } : { type: "clear" }); }, [shown?.key]);
  useEffect(() => {
    const floatingSheet = !wide && st.tab === "explore" && st.tileId;
    mapRef.current?.post({ type: "padding", pad: { top: 80, left: 40, right: 40, bottom: floatingSheet ? Math.min(340, height * 0.45) : 50 } });
  }, [wide, st.tab, st.tileId, height]);
  // focus a place: fly there, pin it, outline its analysis square
  useEffect(() => {
    const f = st.focus;
    if (!f) return;
    if (f.tileId !== useStore.getState().tileId) selectTile(f.tileId);
    setTimeout(() => {
      both({ type: "pin", cell: f.cell, lonlat: f.lonlat });
      mapRef.current?.post({ type: "flyTo", lonlat: f.lonlat, zoom: 15.6 });
    }, 300);
  }, [st.focus?.t]);
  // a project's tile and edits drive the map while it is open
  useEffect(() => {
    if (st.tab !== "plan" || !activeProject) return;
    const s = useStore.getState();
    if (activeProject.tileId !== s.tileId) {
      s.set({ tileId: activeProject.tileId || null, edits: activeProject.edits, baseline: null, project: null, showing: "baseline" });
      Promise.all([activeProject.baselineKey && getPrediction(activeProject.baselineKey), activeProject.projectKey && getPrediction(activeProject.projectKey)])
        .then(([b, p]) => useStore.getState().activeProjectId === activeProject.id && useStore.getState().set({ baseline: b || null, project: p || null, showing: p ? "project" : "baseline" }));
    }
  }, [st.tab, activeProject?.id, activeProject?.tileId]);

  const onViz = useCallback((m: any) => {
    const s = useStore.getState();
    const proj = s.projects.find((p) => p.id === s.activeProjectId);
    if (m.type === "ready") {
      const target = m.view === "map" ? mapRef.current : xRef.current;
      if (s.tileId) target?.post({ type: "load", tile_id: s.tileId, fly: true });
      const cur = s.showing === "project" && s.project ? s.project : s.baseline;
      if (cur) target?.post({ type: "result", key: cur.key });
      target?.post({ type: "layers", layers: s.layers });
      if (m.view === "explorer") target?.post({ type: "visible", on: s.view === "3d" });
      return;
    }
    const lonlat: [number, number] | undefined = m.lonlat;
    // planner: the first tap picks the project site (a tile centred on it)
    if (s.tab === "plan" && proj && !proj.tileId && lonlat) {
      api.tileAt(lonlat[0], lonlat[1]).then(async (t) => {
        const meta = await api.tileMeta(t.tile_id).catch(() => null);
        setProjectSite(proj, t.tile_id, meta?.place ?? "Pasco");
      }).catch((e) => s.set({ error: e.message }));
      return;
    }
    if (m.type === "tapOutside" && lonlat) {
      if (s.tab === "plan" && proj) return;                   // stay on the project's tile
      api.tileAt(lonlat[0], lonlat[1]).then((t) => selectTile(t.tile_id)).catch((e) => s.set({ error: e.message }));
      if (!wide && s.tab !== "explore") s.set({ tab: "explore" });
    } else if (m.type === "tap" && m.cell) {
      if (s.tool === "pond") {
        const e: Edit = { type: "pond", center: m.cell, radius_m: 40, depth_m: 2 };
        s.addEdit(e); s.set({ tool: null });
        if (s.tab === "plan" && proj) s.upsertProject({ ...proj, edits: [...proj.edits, e], updatedAt: Date.now() });
      } else if (s.tool === "road") s.set({ draftRoad: [...s.draftRoad, m.cell] });
      else s.set({ tapInfo: m });
    }
  }, [wide]);

  function selectTile(tid: string) {
    useStore.getState().set({ tileId: tid, baseline: null, project: null, edits: [], draftRoad: [], tool: null, showing: "baseline", error: null, sheetOpen: true });
  }

  async function run() {
    const s = useStore.getState();
    if (!s.tileId) return;
    const body = { tile_id: s.tileId, return_period: s.rp, surge_ft: s.surgeFt };
    const tick = (label: string) => (el: number, eta: number) => s.set({ running: { label, elapsed: el, eta } });
    s.set({ error: null, running: { label: "Running baseline…", elapsed: 0, eta: 120 }, baseline: null, project: null, showing: "baseline" });
    try {
      const base = await api.predict({ ...body, edits: [] }, tick("Running baseline…"));
      s.set({ baseline: base });
      const edits = allEdits();
      if (edits.length) {
        const proj = await api.predict({ ...body, edits }, tick("Running with project…"));
        s.set({ project: proj, showing: "project", edits, draftRoad: [] });
      }
      if (!wide) s.set({ sheetOpen: false });
    } catch (e: any) { s.set({ error: e.message }); }
    finally { s.set({ running: null }); }
  }

  async function showOnMap(key: string, view: "map" | "3d") {
    const p = await getPrediction(key);
    if (!p) return;
    const place = useStore.getState().places.find((x) => x.id === useStore.getState().openPlaceId);
    useStore.getState().set({ tileId: p.tile_id, baseline: p, project: null, showing: "baseline", edits: [], view,
                              ...(wide ? {} : { tab: "explore", sheetOpen: false }) });
    if (place) setTimeout(() => both({ type: "pin", cell: place.geo.cell, lonlat: [place.geo.lon, place.geo.lat] }), 400);
  }

  function pickFromMap(r: GeocodeResult) { addPlace(r); useStore.getState().set({ tab: "home" }); }

  const panel = (
    st.tab === "home" ? (openPlace ? <PlaceScreen place={openPlace} onShowOnMap={showOnMap} /> : <HomeScreen />)
    : st.tab === "plan" ? <PlanScreen onShow={(w) => st.set({ showing: w })} />
    : st.tab === "about" ? <AboutScreen />
    : wide ? <ScenarioSheet docked compact={false} onRun={run} onReport={() => st.set({ screen: "report" })} onShow={(w) => st.set({ showing: w })} />
    : null
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />

      {/* map + 3D stay mounted; layout only moves or hides them */}
      <View style={[s.mapArea, mapBox, !mapVisible && s.hidden]} pointerEvents={mapVisible ? "box-none" : "none"}>
        <VizFrame ref={mapRef} url={MAP_URL} visible={st.view === "map"} onMessage={onViz} />
        <VizFrame ref={xRef} url={EXPLORER_URL} visible={st.view === "3d"} onMessage={onViz} />
        <View style={[s.mapTop, wide && { justifyContent: "flex-start" }]} pointerEvents="box-none">
          {!wide && st.tab === "explore" && <SearchBar onPick={pickFromMap} />}
          <View style={s.seg}>
            {(["map", "3d"] as const).map((v) => (
              <Pressable key={v} onPress={() => st.set({ view: v })} style={[s.segB, st.view === v && s.segOn]}>
                <Icon name={v === "map" ? "map-outline" : "cube-outline"} size={15} color={st.view === v ? C.ink : C.muted} />
                <Text style={[s.segT, st.view === v && { color: C.ink }]}>{v === "map" ? "Map" : "3D"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {st.tool && (
          <View style={s.toolHint} pointerEvents="none">
            <Text style={s.toolHintT}>{st.tool === "pond" ? "Tap inside the dashed square to place a pond" : "Tap points along the road to raise"}</Text>
          </View>
        )}
        {st.tab === "plan" && activeProject && !activeProject.tileId && (
          <View style={s.toolHint} pointerEvents="none"><Text style={s.toolHintT}>Tap the map where the project goes</Text></View>
        )}
        {st.running && st.tab !== "explore" && (
          <View style={s.runChip} pointerEvents="none">
            <View style={s.spinDot} /><Text style={s.runT} numberOfLines={1}>{st.running.label} · {Math.round(st.running.elapsed)} s</Text>
          </View>
        )}
        {!wide && st.tab === "explore" && (
          <ScenarioSheet compact onRun={run} onReport={() => st.set({ screen: "report" })} onShow={(w) => st.set({ showing: w })} />
        )}
      </View>

      {/* content panel */}
      {wide ? (
        <View style={s.wideRow} pointerEvents="box-none">
          <View style={s.rail}>
            <View style={s.logo}><Icon name="water" size={22} color="#03111f" /></View>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => st.set({ tab: t.key })} style={({ hovered }: any) => [s.railB, st.tab === t.key && s.railOn, hovered && st.tab !== t.key && { backgroundColor: "rgba(255,255,255,0.04)" }]}>
                <Icon name={st.tab === t.key ? t.on : t.icon} size={22} color={st.tab === t.key ? C.accent : C.muted} />
                <Text style={[s.railT, st.tab === t.key && { color: C.ink }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.panel}>{panel}</View>
        </View>
      ) : (
        <>
          {panel && (
            <View style={[s.mobilePanel, splitPlan && { top: Math.round(height * 0.42), borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg }]}>{panel}</View>
          )}
          <View style={s.tabbar}>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => st.set({ tab: t.key })} style={s.tabB}>
                <Icon name={st.tab === t.key ? t.on : t.icon} size={22} color={st.tab === t.key ? C.accent : C.muted} />
                <Text style={[s.tabT, st.tab === t.key && { color: C.accent }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {st.apiOk === false && (
        <View style={s.banner}><Icon name="cloud-offline-outline" size={16} color={C.bad} /><Text style={s.bannerT}>{st.error}</Text></View>
      )}

      {/* report draws over everything so the visual frames (and their WebGL state) stay alive */}
      {st.screen === "report" && <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}><ReportScreen /></View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg0 },
  mapArea: { position: "absolute", overflow: "hidden" },
  hidden: { opacity: 0 },
  mapTop: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", gap: 8, alignItems: "flex-start", zIndex: 20, justifyContent: "flex-end" },
  seg: { flexDirection: "row", height: 46, padding: 4, borderRadius: R.md, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line },
  segB: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, justifyContent: "center", borderRadius: 10 },
  segOn: { backgroundColor: C.accentDim },
  segT: { color: C.muted, fontWeight: "700", fontSize: 13 },
  toolHint: { position: "absolute", top: 70, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: "rgba(62,230,168,0.18)", borderWidth: 1, borderColor: "rgba(62,230,168,0.6)" },
  toolHintT: { color: C.ok, fontWeight: "700", fontSize: 13 },
  runChip: { position: "absolute", bottom: 16, alignSelf: "center", maxWidth: "90%", flexDirection: "row", alignItems: "center", gap: 8,
             paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  spinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  runT: { color: C.ink, fontSize: 12, fontWeight: "600" },
  wideRow: { position: "absolute", left: 0, top: 0, bottom: 0, flexDirection: "row" },
  rail: { width: RAIL_W, backgroundColor: "#040913", borderRightWidth: 1, borderRightColor: C.line, alignItems: "center", paddingTop: 14, gap: 6 },
  logo: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  railB: { width: 64, paddingVertical: 10, borderRadius: R.md, alignItems: "center", gap: 4 },
  railOn: { backgroundColor: C.accentDim },
  railT: { color: C.muted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  panel: { width: PANEL_W, backgroundColor: C.bg0, borderRightWidth: 1, borderRightColor: C.line },
  mobilePanel: { position: "absolute", left: 0, right: 0, top: 0, bottom: 64, backgroundColor: C.bg0 },
  tabbar: { position: "absolute", left: 0, right: 0, bottom: 0, height: 64, flexDirection: "row", backgroundColor: "#040913", borderTopWidth: 1, borderTopColor: C.line },
  tabB: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabT: { color: C.muted, fontSize: 10, fontWeight: "700" },
  banner: { position: "absolute", top: 10, alignSelf: "center", flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 14, paddingVertical: 8,
            borderRadius: 999, backgroundColor: "rgba(255,84,104,0.15)", borderWidth: 1, borderColor: "rgba(255,84,104,0.5)", zIndex: 60 },
  bannerT: { color: C.ink, fontSize: 12, fontWeight: "600" },
});
