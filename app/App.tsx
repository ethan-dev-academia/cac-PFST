import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { API, api, Edit, Prediction } from "./src/api";
import { Sheet } from "./src/components/Sheet";
import { VizFrame, VizHandle } from "./src/components/VizFrame";
import { Welcome } from "./src/components/Welcome";
import { AboutScreen } from "./src/screens/AboutScreen";
import { ExploreScreen } from "./src/screens/ExploreScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PlaceScreen } from "./src/screens/PlaceScreen";
import { PlanScreen, setProjectSite } from "./src/screens/PlanScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { getPrediction } from "./src/services";
import { Tab, useStore } from "./src/store";
import { R, useTheme } from "./src/theme";
import { haptic, Icon, IconName, Segmented, Txt } from "./src/ui";

const MAP_URL = `${API}/viz/map.html?api=${encodeURIComponent(API)}`;
const EXPLORER_URL = `${API}/viz/explorer.html?api=${encodeURIComponent(API)}&hidden=1&embed=1`;
const SIDEBAR_W = 400;
const NAV: { value: Tab; label: string }[] = [
  { value: "home", label: "Places" }, { value: "explore", label: "Explore" }, { value: "plan", label: "Projects" },
];

function useHydrated() {
  const [h, setH] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setH(true)), []);
  return h;
}

function MapButton({ icon, label, onPress, on }: { icon: IconName; label: string; onPress: () => void; on?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { haptic.tap(); onPress(); }} accessibilityLabel={label} accessibilityRole="button"
      style={({ hovered, pressed }: any) => [s.mapBtn, { backgroundColor: t.sheet, shadowColor: t.shadow }, (hovered || pressed) && { opacity: 0.8 }]}>
      <Icon name={icon} size={20} color={on ? t.tint : t.label} />
    </Pressable>
  );
}

function Shell() {
  const st = useStore(); const t = useTheme(); const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const hydrated = useHydrated();
  const mapRef = useRef<VizHandle>(null);
  const xRef = useRef<VizHandle>(null);
  const scroll = useRef<any>(null);
  const both = (m: object) => { mapRef.current?.post(m); xRef.current?.post(m); };

  useEffect(() => {
    api.health().then((h) => st.set({ backend: h.backend, apiOk: true })).catch(() => st.set({ apiOk: false }));
    api.presets().then((p) => st.set({ presets: p, surgeFt: p.tide_ft })).catch(() => {});
  }, []);

  const activeProject = st.projects.find((p) => p.id === st.activeProjectId);
  const openPlace = st.places.find((p) => p.id === st.openPlaceId);
  const shown: Prediction | null = st.showing === "project" && st.project ? st.project : st.baseline;
  const allEdits = (): Edit[] => st.draftRoad.length > 1 ? [...st.edits, { type: "road", path: st.draftRoad, width_m: 15, raise_m: 0.6 }] : st.edits;
  const sheetH = useMemo(() => ({ peek: 118 + ins.bottom, half: Math.round(height * 0.5), full: height - ins.top - 10 }), [height, ins.top, ins.bottom]);

  // ---- map sync ---------------------------------------------------------------------------------
  useEffect(() => { both({ type: "theme", dark: t.dark, style: st.mapStyle }); }, [t.dark, st.mapStyle]);
  useEffect(() => {
    both({ type: "load", tile_id: st.tileId });
    if (!st.tileId) { st.set({ tileMeta: null }); return; }
    api.tileMeta(st.tileId).then((m) => useStore.getState().tileId === m.id && st.set({ tileMeta: m })).catch(() => {});
  }, [st.tileId]);
  useEffect(() => { both({ type: "edits", edits: allEdits() }); }, [st.edits, st.draftRoad]);
  useEffect(() => { mapRef.current?.post({ type: "layers", layers: st.layers }); }, [st.layers]);
  useEffect(() => { xRef.current?.post({ type: "visible", on: st.view === "3d" }); }, [st.view]);
  useEffect(() => { both(shown ? { type: "result", key: shown.key } : { type: "clear" }); }, [shown?.key]);
  const mapPad = () => wide ? { top: 70, left: 40, right: 70, bottom: 40 }
    : { top: ins.top + 60, left: 24, right: 64, bottom: (st.sheet === "full" ? sheetH.half : sheetH[st.sheet]) + 16 };
  const padRef = useRef(mapPad); padRef.current = mapPad;
  useEffect(() => { mapRef.current?.post({ type: "padding", pad: mapPad() }); }, [wide, st.sheet, sheetH, ins.top]);   // keep the area clear of the sheet
  useEffect(() => {   // focus a place: fly there and pin it
    const f = st.focus;
    if (!f) return;
    if (f.tileId !== useStore.getState().tileId) selectTile(f.tileId, false);
    setTimeout(() => { both({ type: "pin", cell: f.cell, lonlat: f.lonlat }); mapRef.current?.post({ type: "flyTo", lonlat: f.lonlat, zoom: 15.4 }); }, 300);
  }, [st.focus?.t]);
  useEffect(() => { if (st.replay) both({ type: "play" }); }, [st.replay]);
  useEffect(() => {   // showcase: the flood gets the whole screen
    const sc = st.showcase;
    xRef.current?.post({ type: "showcase", on: !!sc, title: sc?.title, sub: sc?.sub });
    if (sc) mapRef.current?.post({ type: "padding", pad: { top: 90, left: 40, right: 70, bottom: 110 } });
    else mapRef.current?.post({ type: "padding", pad: padRef.current() });
  }, [st.showcase?.key, st.showcase?.title]);
  useEffect(() => {   // the address pin only shows while that place is open
    if (!(st.tab === "home" && st.openPlaceId)) both({ type: "pin", cell: null, lonlat: null });
  }, [st.tab, st.openPlaceId]);
  useEffect(() => {   // an open project drives the map
    if (st.tab !== "plan" || !activeProject) return;
    const s0 = useStore.getState();
    if (activeProject.tileId !== s0.tileId) {
      s0.set({ tileId: activeProject.tileId || null, edits: activeProject.edits, baseline: null, project: null, showing: "baseline" });
      Promise.all([activeProject.baselineKey && getPrediction(activeProject.baselineKey), activeProject.projectKey && getPrediction(activeProject.projectKey)])
        .then(([b, p]) => useStore.getState().activeProjectId === activeProject.id && useStore.getState().set({ baseline: b || null, project: p || null, showing: p ? "project" : "baseline" }));
    }
  }, [st.tab, activeProject?.id, activeProject?.tileId]);
  useEffect(() => { scroll.current?.scrollTo?.({ y: 0, animated: false }); }, [st.tab, st.openPlaceId, st.activeProjectId]);

  // ---- keyboard (desktop): ⌘K search, Esc back ---------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      const s0 = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); s0.set({ tab: "home", openPlaceId: null, sheet: "full" });
        setTimeout(() => (document.querySelector('input[aria-label="Search an address"]') as HTMLInputElement | null)?.focus(), 50);
      } else if (e.key === "Escape") {
        if (s0.showcase) s0.set({ showcase: null, view: "map" });
        else if (s0.screen === "report") s0.set({ screen: "main" });
        else if (s0.tool) s0.set({ tool: null, draftRoad: [] });
        else if (s0.openPlaceId) s0.set({ openPlaceId: null });
        else if (s0.activeProjectId) s0.set({ activeProjectId: null });
        else if (s0.tab === "explore" && s0.tileId) s0.set({ tileId: null, baseline: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- map taps -----------------------------------------------------------------------------------
  const onViz = useCallback((m: any) => {
    const s0 = useStore.getState();
    const proj = s0.projects.find((p) => p.id === s0.activeProjectId);
    if (m.type === "ready") {
      const target = m.view === "map" ? mapRef.current : xRef.current;
      target?.post({ type: "theme", dark: t.dark, style: s0.mapStyle });
      if (m.view === "map") target?.post({ type: "padding", pad: padRef.current() });
      if (s0.tileId) target?.post({ type: "load", tile_id: s0.tileId, fly: true });
      const cur = s0.showing === "project" && s0.project ? s0.project : s0.baseline;
      if (cur) target?.post({ type: "result", key: cur.key });
      target?.post({ type: "layers", layers: s0.layers });
      if (m.view === "explorer") target?.post({ type: "visible", on: s0.view === "3d" });
      return;
    }
    const lonlat: [number, number] | undefined = m.lonlat;
    if (s0.tab === "plan" && proj && !proj.tileId && lonlat) {
      haptic.commit();
      api.tileAt(lonlat[0], lonlat[1]).then(async (tl) => {
        const meta = await api.tileMeta(tl.tile_id).catch(() => null);
        setProjectSite(proj, tl.tile_id, meta?.place ?? "Pasco");
      }).catch((e) => s0.set({ error: e.message }));
      return;
    }
    if (m.type === "tapOutside" && lonlat) {
      if (s0.tab === "plan" && proj) return;
      haptic.tap();
      api.tileAt(lonlat[0], lonlat[1]).then((tl) => { selectTile(tl.tile_id); useStore.getState().set({ tab: "explore", openPlaceId: null, sheet: "half" }); })
        .catch((e) => s0.set({ error: e.message }));
    } else if (m.type === "tap" && m.cell) {
      if (s0.tool === "pond") {
        haptic.commit();
        const e: Edit = { type: "pond", center: m.cell, radius_m: 40, depth_m: 2 };
        s0.addEdit(e); s0.set({ tool: null, sheet: "half" });
        if (s0.tab === "plan" && proj) s0.upsertProject({ ...proj, edits: [...proj.edits, e], updatedAt: Date.now() });
      } else if (s0.tool === "road") { haptic.tap(); s0.set({ draftRoad: [...s0.draftRoad, m.cell] }); }
    }
  }, [t.dark]);

  function selectTile(tid: string, clear = true) {
    useStore.getState().set({ tileId: tid, ...(clear ? { baseline: null, project: null, edits: [], draftRoad: [], tool: null, showing: "baseline" as const } : {}), error: null });
  }
  async function showOnMap(key: string, view: "map" | "3d") {
    const p = await getPrediction(key);
    if (!p) return;
    useStore.getState().set({ tileId: p.tile_id, baseline: p, project: null, showing: "baseline", edits: [], view, sheet: "peek" });
  }

  const content = (
    st.tab === "about" ? <AboutScreen />
    : st.tab === "plan" ? <PlanScreen />
    : st.tab === "explore" ? <ExploreScreen />
    : openPlace ? <PlaceScreen place={openPlace} onShowOnMap={showOnMap} />
    : <HomeScreen />
  );
  const navTab: Tab = st.tab === "about" ? "home" : st.tab;
  const nav = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Segmented value={navTab} onChange={(v) => st.set({ tab: v, sheet: st.sheet === "peek" ? "half" : st.sheet })} options={NAV} style={{ flex: 1 }} />
      <Pressable onPress={() => { haptic.tap(); st.set({ tab: st.tab === "about" ? "home" : "about", sheet: "full" }); }} hitSlop={8}
        accessibilityLabel="Settings" style={({ hovered }: any) => [s.gear, { backgroundColor: st.tab === "about" ? t.tintSoft : t.fill }, hovered && { opacity: 0.7 }]}>
        <Icon name="settings-outline" size={18} color={st.tab === "about" ? t.tint : t.label} />
      </Pressable>
    </View>
  );
  const hint = st.tool === "pond" ? "Tap inside the dashed square to place the pond"
    : st.tool === "road" ? "Tap points along the road to raise"
    : st.tab === "plan" && activeProject && !activeProject.tileId ? "Tap the map where the project goes" : null;

  return (
    <View style={[s.root, { backgroundColor: t.bg }]}>
      <StatusBar style={t.dark ? "light" : "dark"} />

      {/* map: always mounted (WebGL state survives navigation) */}
      <View style={[s.map, { left: wide && !st.showcase ? SIDEBAR_W : 0 }]}>
        <VizFrame ref={mapRef} url={MAP_URL} visible={st.view === "map"} onMessage={onViz} bg={t.bg} />
        <VizFrame ref={xRef} url={EXPLORER_URL} visible={st.view === "3d"} onMessage={onViz} bg={t.bg} />
        <View style={[s.mapTools, { top: wide ? 12 : ins.top + 8 }]} pointerEvents="box-none">
          <MapButton icon={st.view === "3d" ? "map-outline" : "cube-outline"} label={st.view === "3d" ? "Show map" : "Show 3D"} on={st.view === "3d"}
            onPress={() => st.set({ view: st.view === "3d" ? "map" : "3d" })} />
          <MapButton icon={st.mapStyle === "satellite" ? "earth" : "earth-outline"} label="Satellite" on={st.mapStyle === "satellite"}
            onPress={() => st.set({ mapStyle: st.mapStyle === "satellite" ? "streets" : "satellite" })} />
          <MapButton icon="locate-outline" label="Show all of Pasco" onPress={() => mapRef.current?.post({ type: "home" })} />
        </View>
        {st.showcase && (
          <>
            <Pressable onPress={() => { haptic.tap(); st.set({ showcase: null, view: "map" }); }} accessibilityLabel="Done"
              style={({ hovered }: any) => [s.done, { top: wide ? 16 : ins.top + 8, backgroundColor: t.sheet, shadowColor: t.shadow }, hovered && { opacity: 0.85 }]}>
              <Icon name="chevron-back" size={18} color={t.tint} /><Txt v="headline" color="tint">Done</Txt>
            </Pressable>
            {st.view === "map" && (
              <View style={[s.mapCaption, { left: wide ? 110 : 16, right: wide ? undefined : 66, top: wide ? 16 : ins.top + 56, backgroundColor: t.sheet, shadowColor: t.shadow }]} pointerEvents="none">
                <Txt v="title3">{st.showcase.title}</Txt>
                <Txt v="subhead" color="label2">{st.showcase.sub}</Txt>
              </View>
            )}
            <View style={[s.showBar, { bottom: (wide ? 20 : ins.bottom + 16) + (st.view === "map" ? 74 : 0) }]} pointerEvents="box-none">
              {st.view === "3d" && <Pressable onPress={() => { haptic.commit(); both({ type: "play" }); }} accessibilityLabel="Replay the storm"
                style={({ hovered }: any) => [s.pill, { backgroundColor: t.tint }, hovered && { opacity: 0.88 }]}>
                <Icon name="refresh" size={18} color="#fff" /><Txt v="headline" color="#FFFFFF">Replay</Txt>
              </Pressable>}
              <Pressable onPress={() => { haptic.tap(); st.set({ view: st.view === "3d" ? "map" : "3d" }); }}
                style={({ hovered }: any) => [s.pill, { backgroundColor: t.sheet, shadowColor: t.shadow }, hovered && { opacity: 0.88 }]}>
                <Icon name={st.view === "3d" ? "map" : "cube"} size={18} color={t.label} /><Txt v="headline">{st.view === "3d" ? "Map view" : "3D view"}</Txt>
              </Pressable>
            </View>
          </>
        )}
        {hint && (
          <View style={[s.hint, wide ? { top: 12, alignSelf: "center" } : { top: ins.top + 8, left: 12, right: 64 }, { backgroundColor: t.tint }]} pointerEvents="none">
            <Txt v="subhead" color="#FFFFFF" center style={{ fontWeight: "600" }}>{hint}</Txt>
          </View>
        )}
      </View>

      {st.showcase ? null : wide ? (
        <View style={[s.sidebar, { width: SIDEBAR_W, backgroundColor: t.sidebar, borderRightColor: t.separator }]}>
          <View style={[s.sideHead, { borderBottomColor: t.separator }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={[s.logo, { backgroundColor: t.tint }]}><Icon name="water" size={14} color="#fff" /></View>
              <Txt v="headline">Pasco Flood Check</Txt>
            </View>
            {nav}
          </View>
          <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{content}</ScrollView>
        </View>
      ) : (
        <Sheet detent={st.sheet} onDetent={(d) => st.set({ sheet: d })} heights={sheetH} header={nav} scrollRef={scroll}>{content}</Sheet>
      )}

      {st.apiOk === false && (
        <View style={[s.banner, { top: wide ? 12 : ins.top + 60, backgroundColor: t.surface, shadowColor: t.shadow }]}>
          <Icon name="cloud-offline-outline" size={18} color={t.bad} />
          <Txt v="subhead">Can't reach the flood service.</Txt>
          <Pressable onPress={() => api.health().then((h) => st.set({ backend: h.backend, apiOk: true })).catch(() => {})}><Txt v="subhead" color="tint">Retry</Txt></Pressable>
        </View>
      )}
      {!st.seenIntro && hydrated && <Welcome />}
      {st.screen === "report" && <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}><ReportScreen /></View>}
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><Shell /></SafeAreaProvider>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  map: { position: "absolute", top: 0, right: 0, bottom: 0, overflow: "hidden" },
  mapTools: { position: "absolute", right: 12, gap: 8, zIndex: 20 },
  mapBtn: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  hint: { position: "absolute", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, zIndex: 21 },
  sidebar: { position: "absolute", left: 0, top: 0, bottom: 0, borderRightWidth: StyleSheet.hairlineWidth },
  sideHead: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  logo: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  gear: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  done: { position: "absolute", left: 16, zIndex: 30, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 8, paddingRight: 14, height: 40,
          borderRadius: 20, shadowOpacity: 1, shadowRadius: 8, elevation: 4 },
  mapCaption: { position: "absolute", left: 110, maxWidth: 420, padding: 14, borderRadius: R.lg, gap: 2, zIndex: 25, shadowOpacity: 1, shadowRadius: 12, elevation: 4 },
  showBar: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 10, zIndex: 30 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, height: 44, borderRadius: 22, shadowOpacity: 1, shadowRadius: 10, elevation: 4 },
  banner: { position: "absolute", alignSelf: "center", flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 16, paddingVertical: 10,
            borderRadius: R.md, zIndex: 60, shadowOpacity: 1, shadowRadius: 16, elevation: 8 },
});
