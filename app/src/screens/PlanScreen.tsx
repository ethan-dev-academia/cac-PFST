import { Pressable, TextInput, View } from "react-native";
import { analyzeProject, costPerHome, estimateCost, getPrediction, money, removed } from "../services";
import { Project, uid, useStore } from "../store";
import { useTheme, useType } from "../theme";
import { Button, Card, Empty, Group, Header, Icon, Progress, Row, Segmented, Txt } from "../ui";
import { confirm } from "./PlaceScreen";

const STORMS = [{ rp: 10, label: "Heavy" }, { rp: 25, label: "Major" }, { rp: 100, label: "Severe" }];

export function newProject() {
  const st = useStore.getState();
  const id = uid();
  st.upsertProject({ id, name: `Project ${st.projects.length + 1}`, tileId: "", place: "", edits: [], costUsd: 0,
                     rp: 25, surgeFt: st.presets?.tide_ft ?? 0.61, updatedAt: Date.now() });
  st.set({ activeProjectId: id, tool: null, edits: [], draftRoad: [], baseline: null, project: null, tileId: null, sheet: "peek" });
}

/** Called by the app when the map is tapped while a project is picking its site. */
export function setProjectSite(p: Project, tileId: string, place: string) {
  useStore.getState().upsertProject({ ...p, tileId, place, updatedAt: Date.now() });
  useStore.getState().set({ tileId, edits: [], baseline: null, project: null, sheet: "half" });
}

function outcome(p: Project) {
  const r = removed(p);
  if (r == null) return null;
  if (r > 0) return `Keeps ${r} more home${r > 1 ? "s" : ""} out of deep water`;
  if (r < 0) return `${-r} more home${-r > 1 ? "s" : ""} flood with this change`;
  return "No change in homes with deep water";
}

function ProjectList() {
  const st = useStore(); const t = useTheme();
  const ranked = st.projects.filter((p) => costPerHome(p) != null).sort((a, b) => costPerHome(a)! - costPerHome(b)!);
  return (
    <View style={{ gap: 22 }}>
      <Header title="Projects" subtitle="Pasco has $235 million for flood fixes. Compare where each dollar keeps the most homes dry." />
      <Button title="New project" icon="add" onPress={newProject} />
      {ranked.length > 0 && (
        <Group title="Best value" footer="Cost divided by homes kept out of more than a foot of water. Lower is better.">
          {ranked.map((p, i) => (
            <Row key={p.id} icon={i === 0 ? "trophy" : "ellipse-outline"} iconColor={i === 0 ? "#FF9500" : t.label3}
              title={p.name} subtitle={`${removed(p)} homes · ${money(p.costUsd)} · ${p.place}`} value={`${money(costPerHome(p)!)} / home`}
              onPress={() => st.set({ activeProjectId: p.id })} />
          ))}
        </Group>
      )}
      {st.projects.length === 0 ? (
        <Card>
          <Empty icon="construct-outline" title="No projects yet"
            body="Start one, tap where it goes on the map, then add a retention pond or raise a road. We'll show how many homes it keeps dry." />
        </Card>
      ) : (
        <Group title="All projects" footer="Saved on this device only.">
          {st.projects.map((p) => (
            <Row key={p.id} icon="construct" iconBg="#5E5CE6" title={p.name}
              subtitle={[p.place || "No site yet", outcome(p) ?? (p.edits.length ? "Not run yet" : "No changes yet")].join(" · ")}
              onPress={() => st.set({ activeProjectId: p.id })} />
          ))}
        </Group>
      )}
    </View>
  );
}

function ProjectEditor({ p, onRunDone }: { p: Project; onRunDone: () => void }) {
  const st = useStore(); const t = useTheme(); const ty = useType();
  const save = (patch: Partial<Project>) => st.upsertProject({ ...p, ...patch, updatedAt: Date.now() });
  const r = removed(p);
  const cph = costPerHome(p);
  const est = estimateCost(p.edits);
  const tide = st.presets?.tide_ft ?? 0.61;
  const back = () => st.set({ activeProjectId: null, tool: null, draftRoad: [] });

  return (
    <View style={{ gap: 22 }}>
      <Header title={p.name} subtitle={p.place ? `${p.place} area` : "Choose a site"} back="Projects" onBack={back} />

      {!p.tileId ? (
        <Card style={{ alignItems: "center" }}>
          <Empty icon="locate" title="Tap where the project goes" body="We'll model the 1.3 km area centred on that spot, so the project sits in the middle of the simulation." />
        </Card>
      ) : (
        <>
          {/* outcome first */}
          {p.homesBefore != null && !st.running && (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: r && r > 0 ? t.ok : r && r < 0 ? t.bad : t.label3 }}>
              <Txt v="title3">{outcome(p)}</Txt>
              <Txt v="subhead" color="label2">
                {p.homesBefore} homes get more than a foot of water today; {p.homesAfter} would with this project
                {p.removedBand && r ? ` (likely ${p.removedBand[0]} to ${p.removedBand[1]} fewer)` : ""}.{cph ? ` That's ${money(cph)} per home kept dry.` : ""}
              </Txt>
              {!!p.inFootprint && <Txt v="footnote" color="bad">The pond covers {p.inFootprint} building{p.inFootprint > 1 ? "s" : ""}. Move it to an open lot, or budget to buy them.</Txt>}
              {r != null && r <= 0 && <Txt v="footnote" color="label2">Try a pond where water collects just upstream of the flooded homes, or raise the road that traps water.</Txt>}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Segmented value={st.showing} onChange={(v) => st.set({ showing: v })} style={{ flex: 1 }}
                  options={[{ value: "baseline", label: "Today" }, { value: "project", label: "With project" }]} />
                <Button small kind="tinted" icon="document-text" title="Memo" onPress={() => st.set({ screen: "report" })} />
              </View>
            </Card>
          )}
          {st.running && <Card><Progress label={st.running.label.replace(/^.*?: /, "")} elapsed={st.running.elapsed} eta={st.running.eta}
            note="We run the area twice: today, and with your project." /></Card>}

          <Group title="Changes" footer={st.tool === "pond" ? "Tap the map inside the dashed square to place the pond." : st.tool === "road" ? `Tap points along the road (${st.draftRoad.length} so far), then Done.` : undefined}>
            {p.edits.map((e, i) => (
              <Row key={i} icon={e.type === "pond" ? "water" : "trending-up"} iconBg={e.type === "pond" ? "#0A84FF" : "#8E8E93"}
                title={e.type === "pond" ? "Retention pond" : "Raised road"}
                subtitle={e.type === "pond" ? `${Math.round(e.radius_m * 2 * 3.281)} ft across, ${Math.round(e.depth_m * 3.281)} ft deep` : `Raised ${(e.raise_m * 3.281).toFixed(0)} ft along ${e.path.length} points`}
                right={<Pressable hitSlop={10} accessibilityLabel="Remove change" onPress={() => { const edits = p.edits.filter((_, k) => k !== i); save({ edits }); st.set({ edits }); }}>
                  <Icon name="remove-circle" size={22} color={t.bad} /></Pressable>} />
            ))}
            <Row icon="add-circle" iconColor={t.tint} title={st.tool === "pond" ? "Placing a pond… (tap to cancel)" : "Add a retention pond"} chevron={false}
              onPress={() => st.set({ tool: st.tool === "pond" ? null : "pond", draftRoad: [], sheet: st.tool === "pond" ? "half" : "peek" })} />
            <Row icon="add-circle" iconColor={t.tint} title={st.tool === "road" ? "Drawing a road… (tap to cancel)" : "Raise a road"} chevron={false}
              onPress={() => st.set({ tool: st.tool === "road" ? null : "road", draftRoad: [], sheet: st.tool === "road" ? "half" : "peek" })} />
          </Group>
          {st.tool === "road" && st.draftRoad.length >= 2 && (
            <Button title="Done: raise this road 2 ft" icon="checkmark" kind="tinted" onPress={() => {
              const edits = [...p.edits, { type: "road" as const, path: st.draftRoad, width_m: 15, raise_m: 0.6 }];
              save({ edits }); st.set({ edits, draftRoad: [], tool: null, sheet: "half" });
            }} />
          )}

          <Group title="Cost" footer={`Planning estimate ${money(est)}: ponds about $40 per cubic yard dug, roads about $4M per mile raised. Replace it with your bid.`}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, minHeight: 50 }}>
              <Txt v="title3" color="label2">$</Txt>
              <TextInput style={[ty.title3, { flex: 1, color: t.label, padding: 0, marginLeft: 4, outlineStyle: "none" } as any]} keyboardType="numeric"
                value={p.costUsd ? p.costUsd.toLocaleString("en-US") : ""} placeholder={est.toLocaleString("en-US")} placeholderTextColor={t.label3}
                onChangeText={(v) => save({ costUsd: Number(v.replace(/[^0-9]/g, "")) || 0 })} accessibilityLabel="Project cost in dollars" />
            </View>
          </Group>

          <Group title="Test against" footer={p.surgeFt > tide + 0.05 ? "With a 7.6 ft hurricane surge, like Helene." : undefined}>
            <View style={{ padding: 12, gap: 10 }}>
              <Segmented value={String(p.rp)} onChange={(v) => save({ rp: Number(v) })} options={STORMS.map((s) => ({ value: String(s.rp), label: `${s.label} storm` }))} />
              <Segmented value={p.surgeFt > tide + 0.05 ? "surge" : "none"} onChange={(v) => save({ surgeFt: v === "surge" ? 7.62 : tide })}
                options={[{ value: "none", label: "Rain only" }, { value: "surge", label: "Rain + surge" }]} />
            </View>
          </Group>

          {!st.running && (
            <Button title={p.homesBefore != null ? "Run again" : "Run project"} icon="play" disabled={p.edits.length === 0}
              onPress={() => { save({ costUsd: p.costUsd || est }); analyzeProject(p.id, onRunDone); }} />
          )}
          {p.edits.length === 0 && <Txt v="footnote" color="label3" center>Add at least one change to run.</Txt>}
          <Group>
            <Row title="Move the site" icon="locate" onPress={() => { save({ tileId: "", place: "", edits: [], homesBefore: undefined, homesAfter: undefined }); st.set({ tileId: null, edits: [], baseline: null, project: null, sheet: "peek" }); }} />
          </Group>
        </>
      )}
      <Group>
        <Row title="Delete project" destructive onPress={() => confirm(`Delete ${p.name}?`, () => st.removeProject(p.id), "Delete")} />
      </Group>
    </View>
  );
}

export function PlanScreen() {
  const st = useStore();
  const p = st.projects.find((x) => x.id === st.activeProjectId);
  if (!p) return <ProjectList />;
  return <ProjectEditor p={p} onRunDone={async () => {
    const cur = useStore.getState().projects.find((x) => x.id === p.id);
    if (!cur?.baselineKey) return;
    const base = await getPrediction(cur.baselineKey);
    const proj = cur.projectKey ? await getPrediction(cur.projectKey) : null;
    useStore.getState().set({ baseline: base, project: proj, showing: proj ? "project" : "baseline", sheet: "half" });
  }} />;
}
