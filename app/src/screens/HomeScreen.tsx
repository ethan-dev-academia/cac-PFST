import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, GeocodeResult, Prediction } from "../api";
import { SearchBar } from "../components/SearchBar";
import { levelFor, SCENARIOS } from "../risk";
import { analyzePlace, getPrediction, placeDepth } from "../services";
import { Place, uid, useStore } from "../store";
import { C, R } from "../theme";
import { Button, Card, Empty, Icon, Pill, SectionTitle, T } from "../ui";

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
    const name = st.places.length === 0 ? "Home" : r.label.split(",")[0].replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
    st.upsertPlace({ id, name, geo: r, results: {}, addedAt: Date.now() });
    api.point(r.lon, r.lat).then((info) => {
      const cur = useStore.getState().places.find((p) => p.id === id);
      if (cur) useStore.getState().upsertPlace({ ...cur, info });
    }).catch(() => {});
    analyzePlace(id);
  }
  st.set({ openPlaceId: id, focus: { lonlat: [r.lon, r.lat], cell: r.cell, tileId: r.tile_id, t: Date.now() } });
}

function PlaceRow({ place, preds }: { place: Place; preds: Record<string, Prediction> }) {
  const st = useStore();
  const w = worst(place, preds);
  const done = SCENARIOS.filter((s) => place.results[s.key]).length;
  const lvl = w ? levelFor(w.ft) : null;
  return (
    <Card onPress={() => st.set({ openPlaceId: place.id, focus: { lonlat: [place.geo.lon, place.geo.lat], cell: place.geo.cell, tileId: place.geo.tile_id, t: Date.now() } })} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={[s.dot, { backgroundColor: (lvl?.color ?? C.faint) + "33", borderColor: lvl?.color ?? C.line }]}>
        <Icon name={place.name === "Home" ? "home" : "location"} size={18} color={lvl?.color ?? C.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.h3} numberOfLines={1}>{place.name}</Text>
        <Text style={T.small} numberOfLines={1}>{place.geo.label}</Text>
      </View>
      {done < SCENARIOS.length ? <Pill label={`${done}/${SCENARIOS.length} scenarios`} color={C.muted} icon="hourglass-outline" />
        : lvl ? <Pill label={lvl.label} color={lvl.color} /> : null}
      <Icon name="chevron-forward" size={18} color={C.faint} />
    </Card>
  );
}

export function HomeScreen() {
  const st = useStore();
  const preds = usePredictions(st.places.flatMap((p) => Object.values(p.results)));
  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <Text style={T.kicker}>PASCO FLOOD SCREENING</Text>
        <Text style={T.h1}>How high would the water get at your door?</Text>
        <Text style={T.body}>Search any Pasco address to see flood depth in a 10-year and 100-year storm and a Helene-scale surge, with an honest uncertainty band.</Text>
      </View>
      <View style={{ zIndex: 10 }}><SearchBar onPick={addPlace} /></View>

      <SectionTitle title="Your places" />
      {st.places.length === 0 ? (
        <Empty icon="home-outline" title="Add your home" body="Saved places stay on this device. We run all three scenarios for each and tell you what the depth means for you." />
      ) : st.places.map((p) => <PlaceRow key={p.id} place={p} preds={preds} />)}

      <SectionTitle title="For planners" />
      <Card onPress={() => st.set({ tab: "plan" })} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={[s.dot, { backgroundColor: "rgba(62,230,168,0.15)", borderColor: C.ok }]}><Icon name="construct" size={18} color={C.ok} /></View>
        <View style={{ flex: 1 }}>
          <Text style={T.h3}>Compare drainage projects</Text>
          <Text style={T.small}>Place a pond or raise a road, see homes removed from flooding and the cost per home.</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={C.faint} />
      </Card>
      <Card onPress={() => st.set({ tab: "explore" })} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={[s.dot, { backgroundColor: C.accentDim, borderColor: C.accent }]}><Icon name="map" size={18} color={C.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={T.h3}>Explore the county map</Text>
          <Text style={T.small}>Every 1.3 km tile is classified. Tap anywhere to run a storm there.</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={C.faint} />
      </Card>
      <Text style={[T.faint, { marginTop: 8 }]}>Screening-grade: a way to decide which neighborhoods get a full engineering study first — not a substitute for one.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { padding: 18, gap: 12, paddingBottom: 40 },
  dot: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
export const homeStyles = s;
export { R };
