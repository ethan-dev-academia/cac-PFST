import { Switch, View } from "react-native";
import { api } from "../api";
import { Slider } from "../components/Slider";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { Button, Card, Disclosure, Empty, Group, Header, Progress, Row, Segmented, Txt } from "../ui";
import { newProject, setProjectSite } from "./PlanScreen";

export const STORMS = [
  { rp: 2, label: "Common", words: "a common storm", rain: "4.8 in of rain in a day, most years" },
  { rp: 10, label: "Heavy", words: "a heavy storm", rain: "7.2 in in a day, about 1-in-10 each year" },
  { rp: 25, label: "Major", words: "a major storm", rain: "9.3 in in a day, about 1-in-25 each year" },
  { rp: 100, label: "Severe", words: "a severe storm", rain: "13.3 in in a day, about 1-in-100 each year" },
] as const;
const HELENE = 7.62;

export function stormWords(rp: number | null | undefined, surgeFt: number, tide: number) {
  const st = STORMS.find((s) => s.rp === rp);
  const rain = st ? st.words : "this storm";
  return surgeFt > tide + 0.05 ? `${rain} with a ${surgeFt.toFixed(1)} ft hurricane surge` : rain;
}

/** Run the current area: baseline only (projects live in the Projects tab). */
export async function runArea() {
  const s = useStore.getState();
  if (!s.tileId) return;
  const tick = (el: number, eta: number) => useStore.getState().set({ running: { label: "Simulating the storm…", elapsed: el, eta } });
  s.set({ error: null, running: { label: "Simulating the storm…", elapsed: 0, eta: 120 }, baseline: null, project: null, showing: "baseline" });
  try {
    const base = await api.predict({ tile_id: s.tileId, return_period: s.rp, surge_ft: s.surgeFt, edits: [] }, tick);
    useStore.getState().set({ baseline: base, sheet: "half" });
  } catch (e: any) { useStore.getState().set({ error: e.message }); }
  finally { useStore.getState().set({ running: null }); }
}

function Layers() {
  const st = useStore(); const t = useTheme();
  const items: [keyof typeof st.layers, string, string][] = [
    ["grid", "Low-lying areas", "Shades the county by how low the ground is"],
    ["fema", "FEMA flood zones", "The official flood insurance map"],
    ["observed", "Reported flooding", "Places the county has recorded flooding"],
    ["swfwmd", "Water district flood areas", "SWFWMD's own 1-in-100 year flood model"],
    ["buildings", "3D buildings", "Coloured by flood depth after a run"],
  ];
  return (
    <Group title="Map layers">
      {items.map(([k, title, sub]) => (
        <Row key={k} title={title} subtitle={sub} right={
          <Switch value={st.layers[k]} onValueChange={(v) => st.set({ layers: { ...st.layers, [k]: v } })}
            trackColor={{ true: "#34C759", false: t.fill }} {...({ activeThumbColor: "#fff" } as any)} />} />
      ))}
    </Group>
  );
}

export function ExploreScreen() {
  const st = useStore();
  const tide = st.presets?.tide_ft ?? 0.61;
  const tile = st.tileMeta;
  const surgeOn = st.surgeFt > tide + 0.05;
  const b = st.baseline?.stats;
  const storm = STORMS.find((s) => s.rp === st.rp) ?? STORMS[2];

  if (!st.tileId) {
    return (
      <View style={{ gap: 22 }}>
        <Header title="Explore" subtitle="Check any neighbourhood in Pasco." />
        <Card>
          <Empty icon="hand-left-outline" title="Tap anywhere on the map"
            body="We'll check the 1.3 km area around that spot. Blue shading marks low-lying ground where floods start." />
        </Card>
        <Layers />
      </View>
    );
  }
  const clsWords = tile?.cls === "coastal" ? "Low-lying, on the coast" : tile?.cls === "low" ? "Low-lying" : tile?.cls === "higher" ? "Higher ground" : "";
  return (
    <View style={{ gap: 22 }}>
      <Header title={tile ? `${tile.place} area` : "This area"} subtitle={[clsWords, tile ? `${tile.buildings.toLocaleString()} buildings` : ""].filter(Boolean).join(" · ")}
        back="Explore" onBack={() => st.set({ tileId: null, baseline: null, project: null })} />

      {/* answer card */}
      {b && st.baseline ? (
        <Card>
          <Txt v="title3">{b.mean.homes_flagged === 0
            ? `No homes here get more than a foot of water in ${stormWords(st.baseline.scenario.return_period, st.baseline.scenario.surge_ft, tide)}.`
            : `In ${stormWords(st.baseline.scenario.return_period, st.baseline.scenario.surge_ft, tide)}, about ${b.mean.homes_flagged} homes here get more than a foot of water.`}</Txt>
          <Txt v="subhead" color="label2">{b.mean.homes_flagged > 0 ? `Likely between ${b.p10.homes_flagged} and ${b.p90.homes_flagged}, out of ${b.homes_total.toLocaleString()} buildings. ` : ""}{b.mean.area_over_1ft_acres} acres are under more than a foot of water at the peak.</Txt>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Button small kind="tinted" icon="cube" title="See in 3D" onPress={() => st.set({ view: "3d" })} />
            <Button small kind="tinted" icon="document-text" title="Report" onPress={() => st.set({ screen: "report" })} />
            <Button small kind="tinted" icon="construct" title="Plan a fix here" onPress={() => {
              newProject(); const p = useStore.getState().projects[0];
              setProjectSite(p, st.tileId!, tile?.place ?? "Pasco"); useStore.getState().set({ tab: "plan" });
            }} />
          </View>
        </Card>
      ) : st.running ? (
        <Card><Progress label={st.running.label} elapsed={st.running.elapsed} eta={st.running.eta}
          note={st.backend === "solver" ? "Running the full physics model, about two minutes. Results are saved." : undefined} /></Card>
      ) : null}

      <Group title="Storm" footer={storm.rain}>
        <View style={{ padding: 12 }}>
          <Segmented value={String(st.rp)} onChange={(v) => st.set({ rp: Number(v), baseline: null })}
            options={STORMS.map((s) => ({ value: String(s.rp), label: s.label }))} />
        </View>
      </Group>
      <Group title="Coastal surge" footer={surgeOn ? `Storm tide peaks at ${st.surgeFt.toFixed(1)} ft above sea level.` : "Normal high tide."}>
        <View style={{ padding: 12, gap: 6 }}>
          <Segmented value={surgeOn ? (Math.abs(st.surgeFt - HELENE) < 0.05 ? "helene" : "custom") : "none"}
            onChange={(v) => st.set({ surgeFt: v === "none" ? tide : HELENE, baseline: null })}
            options={[{ value: "none", label: "None" }, { value: "helene", label: "Like Helene" }, ...(surgeOn && Math.abs(st.surgeFt - HELENE) >= 0.05 ? [{ value: "custom", label: "Custom" }] : [])]} />
          <Disclosure title="Set a custom height">
            <Slider value={st.surgeFt} min={tide} max={10} step={0.1} marks={[HELENE]} label="Surge height" onChange={(v) => st.set({ surgeFt: v, baseline: null })} />
          </Disclosure>
          {surgeOn && tile && !tile.coastal && <Txt v="footnote" color="label3">This area doesn't touch open water, so surge won't reach it here.</Txt>}
        </View>
      </Group>

      {!st.running && <Button title={st.baseline ? "Run again" : "Check this area"} icon="play" onPress={runArea} />}
      {st.error && <Txt v="footnote" color="bad">{st.error}</Txt>}

      <Layers />
    </View>
  );
}
