import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useStore } from "../store";
import { C, R } from "../theme";
import { Slider } from "./Slider";

const RPS = [2, 10, 25, 100];
const HELENE = 7.62;

interface Props { onRun: () => void; onReport: () => void; onShow: (which: "baseline" | "project") => void; compact: boolean }

export function ScenarioSheet({ onRun, onReport, onShow, compact }: Props) {
  const st = useStore();
  const open = st.sheetOpen;
  const setOpen = (v: boolean) => st.set({ sheetOpen: v });
  const tile = st.tileMeta ?? st.tiles.find((t) => t.id === st.tileId);
  const rpInfo = st.presets?.return_periods.find((r) => r.years === st.rp);
  const tide = st.presets?.tide_ft ?? 0.61;
  const surgeOn = st.surgeFt > tide + 0.05;
  const b = st.baseline?.stats, p = st.project?.stats;
  const removed = b && p ? b.mean.homes_flagged - p.mean.homes_flagged : null;

  if (!st.tileId) {
    return (
      <View style={[s.sheet, s.hint]}>
        <Text style={s.h1}>Where does each dollar remove the most water?</Text>
        <Text style={s.body}>Tap a highlighted neighborhood tile, or search an address, to screen flood depth under design storms and Helene-scale surge.</Text>
        <Text style={s.note}>Screening-grade · not a replacement for engineering models</Text>
      </View>
    );
  }
  return (
    <View style={[s.sheet, compact && { maxHeight: "58%" }]}>
      <Pressable onPress={() => setOpen(!open)} style={s.grab}><View style={s.grabber} /></Pressable>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>{tile?.place ?? "Tile"} <Text style={s.dim}>· {st.tileId}</Text></Text>
          <Text style={s.small}>{tile ? `${tile.buildings.toLocaleString()} buildings · ` : ""}
            {st.backend === "fno" ? "Neural operator · instant, 30-member ensemble" : "Physics solver · ~2 min per scenario (no model loaded)"}</Text>
        </View>
      </View>
      {open && (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={s.label}>Design storm <Text style={s.dim}>· NOAA Atlas 14, 24-hr</Text></Text>
            <View style={s.chips}>
              {RPS.map((rp) => {
                const info = st.presets?.return_periods.find((r) => r.years === rp);
                const on = st.rp === rp;
                return (
                  <Pressable key={rp} onPress={() => st.set({ rp, baseline: null, project: null })} style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipT, on && s.chipTOn]}>{rp}-yr</Text>
                    <Text style={s.chipS}>{info ? `${info.rain_in}"` : ""}</Text>
                  </Pressable>
                );
              })}
            </View>
            {rpInfo && <Text style={s.small}>{rpInfo.rain_in} in over 24 h · 90% band {rpInfo.rain_lo_in}–{rpInfo.rain_hi_in} in</Text>}
          </View>

          <View>
            <View style={s.rowBetween}>
              <Text style={s.label}>Coastal surge <Text style={s.dim}>· peak ft NAVD88</Text></Text>
              <Text style={[s.value, surgeOn && { color: C.warn }]}>{surgeOn ? `${st.surgeFt.toFixed(1)} ft` : "Normal tide"}</Text>
            </View>
            <Slider value={st.surgeFt} min={tide} max={10} step={0.1} marks={[HELENE]}
                    onChange={(v) => st.set({ surgeFt: v, baseline: null, project: null })} />
            <View style={s.chips}>
              <Pressable onPress={() => st.set({ surgeFt: HELENE, rp: 2, baseline: null, project: null })} style={[s.chip, Math.abs(st.surgeFt - HELENE) < 0.05 && s.chipWarn]}>
                <Text style={[s.chipT, { color: C.warn }]}>Helene preset</Text><Text style={s.chipS}>7.6 ft</Text>
              </Pressable>
              <Pressable onPress={() => st.set({ surgeFt: tide, baseline: null, project: null })} style={s.chip}>
                <Text style={s.chipT}>No surge</Text>
              </Pressable>
            </View>
            {!tile?.coastal && surgeOn && <Text style={s.small}>This tile has no open coastline, so surge has no effect here.</Text>}
          </View>

          <View>
            <Text style={s.label}>Proposed project <Text style={s.dim}>· tap the map to place</Text></Text>
            <View style={s.chips}>
              <Pressable onPress={() => st.set({ tool: st.tool === "pond" ? null : "pond" })} style={[s.chip, st.tool === "pond" && s.chipOk]}>
                <Text style={[s.chipT, st.tool === "pond" && { color: C.ok }]}>◎ Retention pond</Text>
              </Pressable>
              <Pressable onPress={() => st.set({ tool: st.tool === "road" ? null : "road", draftRoad: [] })} style={[s.chip, st.tool === "road" && s.chipOk]}>
                <Text style={[s.chipT, st.tool === "road" && { color: C.ok }]}>╱ Raise road</Text>
              </Pressable>
              {st.edits.length > 0 && (
                <Pressable onPress={st.undoEdit} style={s.chip}><Text style={s.chipT}>↶ Undo</Text></Pressable>
              )}
            </View>
            <Text style={s.small}>
              {st.tool === "pond" ? "Tap where the pond goes — 40 m radius, 2 m deep."
                : st.tool === "road" ? `Tap points along the road (${st.draftRoad.length} so far), then press Done.`
                : st.edits.length ? `${st.edits.length} edit${st.edits.length > 1 ? "s" : ""}: ${st.edits.map((e) => e.type).join(", ")}`
                : "Optional — compare a pond or raised road against the baseline."}
            </Text>
            {st.tool === "road" && st.draftRoad.length >= 2 && (
              <Pressable onPress={() => { st.addEdit({ type: "road", path: st.draftRoad, width_m: 15, raise_m: 0.6 }); st.set({ draftRoad: [], tool: null }); }}
                         style={[s.chip, s.chipOk, { alignSelf: "flex-start", marginTop: 6 }]}>
                <Text style={[s.chipT, { color: C.ok }]}>Done — raise 2 ft</Text>
              </Pressable>
            )}
          </View>

          <View style={s.chips}>
            {([["fema", "FEMA zones"], ["observed", "Observed flooding"], ["swfwmd", "SWFWMD 100-yr"], ["buildings", "3D buildings"]] as const).map(([k, label]) => (
              <Pressable key={k} onPress={() => st.set({ layers: { ...st.layers, [k]: !st.layers[k] } })} style={[s.tog, st.layers[k] && s.togOn]}>
                <Text style={[s.togT, st.layers[k] && { color: C.ink }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {st.running ? (
        <View style={s.progress}>
          <View style={s.rowBetween}><Text style={s.small}>{st.running.label}</Text><Text style={s.small}>{Math.round(st.running.elapsed)} s</Text></View>
          <View style={s.pTrack}><View style={[s.pFill, { width: `${Math.min(96, (st.running.elapsed / st.running.eta) * 100)}%` }]} /></View>
        </View>
      ) : (
        <Pressable onPress={onRun} style={({ pressed }) => [s.run, pressed && { opacity: 0.85 }]}>
          <Text style={s.runT}>{st.baseline ? "Re-run scenario" : "Run scenario"}</Text>
        </Pressable>
      )}
      {st.error && <Text style={[s.small, { color: C.bad }]}>{st.error}</Text>}

      {b && (
        <View style={s.results}>
          <View style={{ flex: 1 }}>
            <Text style={s.kpi}>{(p ?? b).mean.homes_flagged}</Text>
            <Text style={s.small}>homes over 1 ft · band {(p ?? b).p10.homes_flagged}–{(p ?? b).p90.homes_flagged}</Text>
          </View>
          {removed !== null && (
            <View style={{ flex: 1 }}>
              <Text style={[s.kpi, { color: removed > 0 ? C.ok : C.muted }]}>{removed > 0 ? `−${removed}` : removed === 0 ? "±0" : `+${-removed}`}</Text>
              <Text style={s.small}>homes removed by project</Text>
            </View>
          )}
          <View style={{ gap: 6 }}>
            {st.project && (
              <View style={s.seg}>
                {(["baseline", "project"] as const).map((w) => (
                  <Pressable key={w} onPress={() => onShow(w)} style={[s.segB, st.showing === w && s.segOn]}>
                    <Text style={[s.segT, st.showing === w && { color: C.ink }]}>{w === "baseline" ? "Before" : "After"}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable onPress={onReport} style={s.reportBtn}><Text style={s.reportT}>Report ›</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 12, right: 12, bottom: 12, maxWidth: 460, padding: 16, paddingTop: 6, gap: 12,
           borderRadius: R.lg, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, maxHeight: "78%",
           shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, elevation: 12 },
  hint: { paddingTop: 16, gap: 8 },
  grab: { alignItems: "center", paddingVertical: 6 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
  headRow: { flexDirection: "row", alignItems: "center" },
  h1: { color: C.ink, fontSize: 17, fontWeight: "700" },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  note: { color: C.faint, fontSize: 11, marginTop: 2 },
  dim: { color: C.faint, fontWeight: "500" },
  small: { color: C.muted, fontSize: 12, marginTop: 4 },
  label: { color: C.ink, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  value: { color: C.ink, fontSize: 13, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.sm, backgroundColor: "rgba(255,255,255,0.04)",
          borderWidth: 1, borderColor: C.line, flexDirection: "row", alignItems: "baseline", gap: 6 },
  chipOn: { backgroundColor: C.accentDim, borderColor: "rgba(76,195,255,0.6)" },
  chipWarn: { backgroundColor: "rgba(255,181,71,0.14)", borderColor: "rgba(255,181,71,0.6)" },
  chipOk: { backgroundColor: "rgba(62,230,168,0.12)", borderColor: "rgba(62,230,168,0.6)" },
  chipT: { color: C.muted, fontSize: 13, fontWeight: "600" },
  chipTOn: { color: C.ink },
  chipS: { color: C.faint, fontSize: 11 },
  tog: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line },
  togOn: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.3)" },
  togT: { color: C.faint, fontSize: 11, fontWeight: "600" },
  run: { height: 48, borderRadius: R.md, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  runT: { color: "#03111f", fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  progress: { gap: 6 },
  pTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  pFill: { height: 6, backgroundColor: C.accent },
  results: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  kpi: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  seg: { flexDirection: "row", padding: 3, borderRadius: R.sm, backgroundColor: "rgba(255,255,255,0.05)" },
  segB: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  segOn: { backgroundColor: C.accentDim },
  segT: { color: C.muted, fontSize: 12, fontWeight: "700" },
  reportBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.sm, borderWidth: 1, borderColor: "rgba(76,195,255,0.5)", alignItems: "center" },
  reportT: { color: C.accent, fontWeight: "700", fontSize: 13 },
});
