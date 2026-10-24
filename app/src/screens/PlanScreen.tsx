import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { analyzeProject, costPerHome, estimateCost, getPrediction, money, removed } from "../services";
import { Project, uid, useStore } from "../store";
import { C, R } from "../theme";
import { Button, Card, Empty, Icon, Pill, SectionTitle, Stat, T } from "../ui";

const RPS = [10, 25, 100];

export function newProject() {
  const st = useStore.getState();
  const id = uid();
  st.upsertProject({ id, name: `Project ${st.projects.length + 1}`, tileId: "", place: "", edits: [], costUsd: 0,
                     rp: 25, surgeFt: st.presets?.tide_ft ?? 0.61, updatedAt: Date.now() });
  st.set({ activeProjectId: id, tool: null, edits: [], draftRoad: [], baseline: null, project: null, tileId: null });
}

/** Called by the app when the map is tapped while a project is picking its site. */
export function setProjectSite(p: Project, tileId: string, place: string) {
  useStore.getState().upsertProject({ ...p, tileId, place, updatedAt: Date.now() });
  useStore.getState().set({ tileId, edits: [], baseline: null, project: null });
}

function Ranking({ projects }: { projects: Project[] }) {
  const ranked = projects.filter((p) => costPerHome(p) != null).sort((a, b) => costPerHome(a)! - costPerHome(b)!);
  if (!ranked.length) return null;
  const best = costPerHome(ranked[0])!;
  return (
    <Card>
      <Text style={T.h3}>Best value per home protected</Text>
      <Text style={T.faint}>Cost ÷ homes removed from &gt; 1 ft of flooding. Lower is better.</Text>
      {ranked.map((p, i) => {
        const cph = costPerHome(p)!;
        return (
          <Pressable key={p.id} onPress={() => useStore.getState().set({ activeProjectId: p.id })} style={s.rankRow}>
            <Text style={[s.rankN, i === 0 && { color: C.ok }]}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={T.h3} numberOfLines={1}>{p.name}</Text>
                <Text style={[T.h3, { color: i === 0 ? C.ok : C.ink }]}>{money(cph)}/home</Text>
              </View>
              <View style={s.barTrack}><View style={[s.bar, { width: `${Math.max(6, (best / cph) * 100)}%`, backgroundColor: i === 0 ? C.ok : C.accent }]} /></View>
              <Text style={T.faint}>{removed(p)} homes · {money(p.costUsd)} · {p.place}</Text>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

function ProjectList() {
  const st = useStore();
  return (
    <ScrollView contentContainerStyle={s.body}>
      <View style={{ gap: 6 }}>
        <Text style={T.kicker}>$235M · 5-YEAR PROGRAM</Text>
        <Text style={T.h1}>Where does each dollar remove the most water?</Text>
        <Text style={T.body}>Sketch a retention pond or a raised road, run a design storm, and compare projects by cost per home protected.</Text>
      </View>
      <Button title="New project" icon="add" onPress={newProject} />
      <Ranking projects={st.projects} />
      <SectionTitle title={`Projects (${st.projects.length})`} />
      {st.projects.length === 0 ? (
        <Empty icon="construct-outline" title="No projects yet" body="Start one, tap its site on the map, then add ponds or raised roads. Projects are saved on this device." />
      ) : st.projects.map((p) => {
        const r = removed(p);
        return (
          <Card key={p.id} onPress={() => st.set({ activeProjectId: p.id })} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.h3}>{p.name}</Text>
              <Text style={T.small}>{p.place || "Site not chosen"} · {p.edits.length} edit{p.edits.length === 1 ? "" : "s"} · {p.rp}-yr storm</Text>
            </View>
            {r != null ? <Pill label={r > 0 ? `−${r} homes` : `${r} homes`} color={r > 0 ? C.ok : C.muted} /> : <Pill label="not run" color={C.faint} />}
            <Icon name="chevron-forward" size={18} color={C.faint} />
          </Card>
        );
      })}
    </ScrollView>
  );
}

function ProjectEditor({ p, onRunDone, onShow }: { p: Project; onRunDone: () => void; onShow: (which: "baseline" | "project") => void }) {
  const st = useStore();
  const save = (patch: Partial<Project>) => st.upsertProject({ ...p, ...patch, updatedAt: Date.now() });
  const r = removed(p);
  const cph = costPerHome(p);
  const est = estimateCost(p.edits);
  const tide = st.presets?.tide_ft ?? 0.61;
  const step = !p.tileId ? 1 : p.edits.length === 0 ? 2 : 3;
  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => st.set({ activeProjectId: null, tool: null })} style={s.back} hitSlop={10}>
        <Icon name="chevron-back" size={18} color={C.accent} /><Text style={s.backT}>Projects</Text>
      </Pressable>
      <TextInput value={p.name} onChangeText={(name) => save({ name })} style={[T.h1, s.nameInput]} />

      <View style={s.steps}>
        {["Pick site", "Add edits", "Run"].map((t, i) => (
          <View key={t} style={[s.step, step === i + 1 && s.stepOn, step > i + 1 && s.stepDone]}>
            <Text style={[s.stepT, step >= i + 1 && { color: C.ink }]}>{step > i + 1 ? "✓ " : `${i + 1}. `}{t}</Text>
          </View>
        ))}
      </View>

      {!p.tileId ? (
        <Card style={{ borderColor: "rgba(76,195,255,0.5)" }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="locate" size={22} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>Tap the project site on the map</Text>
              <Text style={T.small}>We model the 1.3 km square centred there, so your project is never near a model edge.</Text>
            </View>
          </View>
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View><Text style={T.h3}>{p.place}</Text><Text style={T.faint}>Analysis tile {p.tileId}</Text></View>
              <Pressable onPress={() => { save({ tileId: "", place: "", edits: [], homesBefore: undefined, homesAfter: undefined }); st.set({ tileId: null, edits: [], baseline: null, project: null }); }}>
                <Text style={s.link}>Move site</Text>
              </Pressable>
            </View>
          </Card>

          <SectionTitle title="Edits" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title="Retention pond" icon="ellipse-outline" kind={st.tool === "pond" ? "ok" : "ghost"} onPress={() => st.set({ tool: st.tool === "pond" ? null : "pond" })} style={{ flex: 1 }} />
            <Button title="Raise road" icon="trending-up" kind={st.tool === "road" ? "ok" : "ghost"} onPress={() => st.set({ tool: st.tool === "road" ? null : "road", draftRoad: [] })} style={{ flex: 1 }} />
          </View>
          <Text style={T.small}>
            {st.tool === "pond" ? "Tap the map to place a pond (40 m radius, 2 m deep)."
              : st.tool === "road" ? `Tap points along the road (${st.draftRoad.length} so far), then Done.`
              : "Pick a tool, then tap inside the dashed square."}
          </Text>
          {st.tool === "road" && st.draftRoad.length >= 2 && (
            <Button title="Done — raise 2 ft" icon="checkmark" kind="ok" onPress={() => {
              const edits = [...p.edits, { type: "road" as const, path: st.draftRoad, width_m: 15, raise_m: 0.6 }];
              save({ edits, costUsd: p.costUsd && p.costUsd !== est ? p.costUsd : estimateCost(edits) });
              st.set({ edits, draftRoad: [], tool: null });
            }} />
          )}
          {p.edits.map((e, i) => (
            <Card key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10 }}>
              <Icon name={e.type === "pond" ? "ellipse-outline" : "trending-up"} size={18} color={C.ok} />
              <Text style={[T.body, { flex: 1, color: C.ink }]}>{e.type === "pond" ? `Pond · ${e.radius_m} m radius, ${e.depth_m} m deep` : `Raised road · ${e.path.length} points, +${(e.raise_m / 0.3048).toFixed(1)} ft`}</Text>
              <Pressable hitSlop={8} onPress={() => { const edits = p.edits.filter((_, k) => k !== i); save({ edits }); st.set({ edits }); }}>
                <Icon name="close" size={18} color={C.muted} />
              </Pressable>
            </Card>
          ))}

          <SectionTitle title="Cost and storm" />
          <Card>
            <Text style={T.small}>Estimated cost (edit to your bid)</Text>
            <View style={s.costRow}>
              <Text style={s.costDollar}>$</Text>
              <TextInput style={s.costInput} keyboardType="numeric" value={p.costUsd ? String(p.costUsd) : ""} placeholder={String(est)}
                placeholderTextColor={C.faint} onChangeText={(t) => save({ costUsd: Number(t.replace(/[^0-9]/g, "")) || 0 })} />
            </View>
            <Text style={T.faint}>Planning estimate {money(est)}: ponds ≈ $40/yd³ excavated +30%; road raising ≈ $4M/mile per 2 ft.</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {RPS.map((rp) => (
                <Pressable key={rp} onPress={() => save({ rp })} style={[s.chip, p.rp === rp && s.chipOn]}><Text style={[s.chipT, p.rp === rp && { color: C.ink }]}>{rp}-yr</Text></Pressable>
              ))}
              <Pressable onPress={() => save({ surgeFt: p.surgeFt > tide + 0.05 ? tide : 7.62 })} style={[s.chip, p.surgeFt > tide + 0.05 && s.chipWarn]}>
                <Text style={[s.chipT, p.surgeFt > tide + 0.05 && { color: C.warn }]}>+ Helene surge</Text>
              </Pressable>
            </View>
          </Card>

          {st.running ? (
            <Card>
              <Text style={T.small}>{st.running.label} · {Math.round(st.running.elapsed)} s</Text>
              <View style={s.barTrack}><View style={[s.bar, { width: `${Math.min(96, (st.running.elapsed / st.running.eta) * 100)}%`, backgroundColor: C.accent }]} /></View>
            </Card>
          ) : (
            <Button title={p.homesBefore != null ? "Re-run project" : "Run project"} icon="play" disabled={p.edits.length === 0}
              onPress={() => { save({ costUsd: p.costUsd || est }); analyzeProject(p.id, onRunDone); }} />
          )}

          {p.homesBefore != null && (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Stat value={r != null ? (r > 0 ? `−${r}` : String(r)) : "—"} label="homes removed from > 1 ft" color={r && r > 0 ? C.ok : C.muted}
                      sub={p.removedBand ? `band ${p.removedBand[0]} to ${p.removedBand[1]}` : undefined} />
                <Stat value={cph ? money(cph) : "—"} label="cost per home protected" />
              </View>
              <Text style={T.small}>{p.homesBefore} homes flooded before → {p.homesAfter ?? "?"} after, in a {p.rp}-yr storm{p.surgeFt > tide + 0.05 ? " with Helene surge" : ""}.</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="Before" kind={st.showing === "baseline" ? "primary" : "ghost"} onPress={() => onShow("baseline")} style={{ flex: 1 }} />
                <Button title="After" kind={st.showing === "project" ? "primary" : "ghost"} onPress={() => onShow("project")} style={{ flex: 1 }} />
                <Button title="Memo" icon="document-text-outline" kind="ghost" onPress={() => st.set({ screen: "report" })} style={{ flex: 1 }} />
              </View>
            </Card>
          )}
        </>
      )}
      <Button title="Delete project" icon="trash-outline" kind="danger" onPress={() => st.removeProject(p.id)} />
    </ScrollView>
  );
}

export function PlanScreen({ onShow }: { onShow: (which: "baseline" | "project") => void }) {
  const st = useStore();
  const p = st.projects.find((x) => x.id === st.activeProjectId);
  if (!p) return <ProjectList />;
  return <ProjectEditor p={p} onShow={onShow} onRunDone={async () => {
    const cur = useStore.getState().projects.find((x) => x.id === p.id);
    if (!cur?.baselineKey) return;
    const base = await getPrediction(cur.baselineKey);
    const proj = cur.projectKey ? await getPrediction(cur.projectKey) : null;
    useStore.getState().set({ baseline: base, project: proj, showing: proj ? "project" : "baseline" });
  }} />;
}

const s = StyleSheet.create({
  body: { padding: 18, gap: 12, paddingBottom: 40 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backT: { color: C.accent, fontWeight: "700", fontSize: 14 },
  link: { color: C.accent, fontWeight: "700", fontSize: 13 },
  nameInput: { padding: 0, outlineStyle: "none" } as any,
  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, alignItems: "center" },
  stepOn: { borderColor: C.accent, backgroundColor: C.accentDim },
  stepDone: { borderColor: "rgba(62,230,168,0.5)" },
  stepT: { color: C.faint, fontSize: 12, fontWeight: "700" },
  rankRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  rankN: { color: C.muted, fontSize: 20, fontWeight: "900", width: 22, textAlign: "center" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  costDollar: { color: C.muted, fontSize: 24, fontWeight: "800" },
  costInput: { flex: 1, color: C.ink, fontSize: 24, fontWeight: "800", padding: 0, outlineStyle: "none" } as any,
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.sm, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.accentDim, borderColor: "rgba(76,195,255,0.6)" },
  chipWarn: { backgroundColor: "rgba(255,181,71,0.14)", borderColor: "rgba(255,181,71,0.6)" },
  chipT: { color: C.muted, fontSize: 13, fontWeight: "700" },
});
