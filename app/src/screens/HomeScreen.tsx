import { useEffect, useState } from "react";
import { View } from "react-native";
import { api, GeocodeResult, Prediction } from "../api";
import { SearchBar, titleCase } from "../components/SearchBar";
import { levelFor, riskColor, SCENARIOS } from "../risk";
import { analyzePlace, getPrediction, placeDepth } from "../services";
import { Place, uid, useStore } from "../store";
import { useTheme } from "../theme";
import { Empty, Group, Header, RiskTag, Row, Txt } from "../ui";

export function usePredictions(keys: (string | undefined)[]) {
  const [preds, setPreds] = useState<Record<string, Prediction>>({});
  const sig = keys.filter(Boolean).join(",");
  useEffect(() => {
    let live = true;
    keys.forEach((k) => k && !preds[k] && getPrediction(k).then((p) => live && p && setPreds((s) => ({ ...s, [k]: p }))));
    return () => { live = false; };
  }, [sig]);
  return preds;
}

/** Worst scenario for a place (by best-estimate depth). */
export function worst(place: Place, preds: Record<string, Prediction>) {
  let best: { ft: number; key: string } | null = null;
  for (const sc of SCENARIOS) {
    const k = place.results[sc.key];
    const d = k ? placeDepth(preds[k], place) : null;
    if (d && (!best || d.mean > best.ft)) best = { ft: d.mean, key: sc.key };
  }
  return best;
}

export async function addPlace(r: GeocodeResult) {
  const st = useStore.getState();
  const existing = st.places.find((p) => Math.abs(p.geo.lon - r.lon) < 1e-6 && Math.abs(p.geo.lat - r.lat) < 1e-6);
  const id = existing?.id ?? uid();
  if (!existing) {
    const name = st.places.length === 0 ? "Home" : titleCase(r.label.split(",")[0]);
    st.upsertPlace({ id, name, geo: r, results: {}, addedAt: Date.now() });
    api.point(r.lon, r.lat).then((info) => {
      const cur = useStore.getState().places.find((p) => p.id === id);
      if (cur) useStore.getState().upsertPlace({ ...cur, info });
    }).catch(() => {});
    analyzePlace(id);
  }
  st.set({ tab: "home", openPlaceId: id, sheet: "half", focus: { lonlat: [r.lon, r.lat], cell: r.cell, tileId: r.tile_id, t: Date.now() } });
}

function PlaceRow({ place, preds }: { place: Place; preds: Record<string, Prediction> }) {
  const st = useStore(); const t = useTheme();
  const w = worst(place, preds);
  const done = SCENARIOS.filter((s) => place.results[s.key]).length === SCENARIOS.length;
  const lvl = done && w ? levelFor(w.ft) : null;
  return (
    <Row icon={place.name === "Home" ? "home" : "location"} iconBg={lvl ? riskColor(t, lvl.key) : t.label3}
      title={place.name} subtitle={titleCase(place.geo.label.split(",")[0]) + (lvl ? "" : " · checking…")}
      right={lvl ? <RiskTag level={lvl} /> : undefined}
      onPress={() => st.set({ openPlaceId: place.id, sheet: "half", focus: { lonlat: [place.geo.lon, place.geo.lat], cell: place.geo.cell, tileId: place.geo.tile_id, t: Date.now() } })} />
  );
}

export function HomeScreen() {
  const st = useStore();
  const preds = usePredictions(st.places.flatMap((p) => Object.values(p.results)));
  return (
    <View style={{ gap: 22 }}>
      <Header title="Places" subtitle="How deep would floodwater get at the places you care about?" />
      <SearchBar onPick={addPlace} />
      {st.places.length === 0 ? (
        <Empty icon="home-outline" title="Add your home"
          body="Search your address above. We'll check it against a heavy storm, a severe storm and a hurricane surge, and explain what the depth means for you." />
      ) : (
        <Group title="Saved" footer="Saved on this device only.">
          {st.places.map((p) => <PlaceRow key={p.id} place={p} preds={preds} />)}
        </Group>
      )}
      <Group title="Planning a project?">
        <Row icon="construct" iconBg="#5E5CE6" title="Compare drainage projects" subtitle="See how many homes a pond or a raised road keeps dry, and the cost per home."
          onPress={() => st.set({ tab: "plan", activeProjectId: null })} />
      </Group>
      <Txt v="footnote" color="label3">A screening tool: it shows where to look first, not a substitute for an engineering study.</Txt>
    </View>
  );
}
