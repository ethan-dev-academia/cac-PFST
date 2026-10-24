import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { ACTIONS, femaText, levelFor, SCENARIOS } from "../risk";
import { analyzePlace, placeDepth } from "../services";
import { Place, useStore } from "../store";
import { C, R } from "../theme";
import { Button, Card, Icon, Pill, SectionTitle, T } from "../ui";
import { usePredictions, worst } from "./HomeScreen";

function Band({ p10, mean, p90, max }: { p10: number; mean: number; p90: number; max: number }) {
  return (
    <View style={s.track}>
      <View style={[s.band, { left: `${(p10 / max) * 100}%`, width: `${Math.max(1.5, ((p90 - p10) / max) * 100)}%` }]} />
      <View style={[s.tick, { left: `${(Math.min(mean, max) / max) * 100}%` }]} />
      <View style={[s.ft, { left: `${(1 / max) * 100}%` }]} />
    </View>
  );
}

export function PlaceScreen({ place, onShowOnMap }: { place: Place; onShowOnMap: (key: string, view: "map" | "3d") => void }) {
  const st = useStore();
  const preds = usePredictions(Object.values(place.results));
  useEffect(() => {  // FEMA's service is flaky: retry when the saved info has no zone
    if (place.info?.fema?.zone) return;
    api.point(place.geo.lon, place.geo.lat).then((info) => {
      const cur = useStore.getState().places.find((p) => p.id === place.id);
      if (cur && info.fema?.zone) useStore.getState().upsertPlace({ ...cur, info });
    }).catch(() => {});
  }, [place.id]);
  const w = worst(place, preds);
  const lvl = w ? levelFor(w.ft) : null;
  const pending = SCENARIOS.filter((sc) => !place.results[sc.key]);
  const depths = SCENARIOS.map((sc) => ({ sc, d: place.results[sc.key] ? placeDepth(preds[place.results[sc.key]], place) : null }));
  const max = Math.max(2, ...depths.map((x) => x.d?.p90 ?? 0));
  const fema = femaText(place.info?.fema);
  const actions = [...(w && w.ft >= 0.1 ? ACTIONS.wet : []), ...(w && w.ft >= 2 ? ACTIONS.severe : []), ...ACTIONS.everyone];
  const showKey = place.results["100"] ?? Object.values(place.results)[0];

  return (
    <ScrollView contentContainerStyle={s.body}>
      <Pressable onPress={() => st.set({ openPlaceId: null })} style={s.back} hitSlop={10}>
        <Icon name="chevron-back" size={18} color={C.accent} /><Text style={s.backT}>Places</Text>
      </Pressable>
      <View style={{ gap: 4 }}>
        <TextInput value={place.name} onChangeText={(name) => st.upsertPlace({ ...place, name })} style={[T.h1, s.nameInput]} />
        <Text style={T.small}>{place.geo.label}</Text>
      </View>

      <Card style={lvl ? [s.hero, { borderColor: lvl.color + "88" }] : s.hero}>
        {lvl ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[s.lvlDot, { backgroundColor: lvl.color }]} />
              <Text style={[s.lvlT, { color: lvl.color }]}>{lvl.label} flood risk</Text>
            </View>
            <Text style={T.body}>
              Worst case across the scenarios: <Text style={{ color: C.ink, fontWeight: "800" }}>{w!.ft < 0.05 ? "dry" : `${w!.ft.toFixed(1)} ft`}</Text> of water at the building pad
              ({SCENARIOS.find((x) => x.key === w!.key)!.title.toLowerCase()}). {lvl.meaning}
            </Text>
          </>
        ) : (
          <>
            <Text style={T.h2}>Working out your risk…</Text>
            <Text style={T.body}>Each scenario runs the flood model for the 1.3 km around this address{st.backend === "solver" ? " — about two minutes each until the trained model is installed" : ""}.</Text>
          </>
        )}
        {pending.length > 0 && st.running && <Text style={T.faint}>Now: {st.running.label} · {Math.round(st.running.elapsed)} s</Text>}
      </Card>

      <SectionTitle title="Scenarios" />
      {depths.map(({ sc, d }) => {
        const l = d ? levelFor(d.mean) : null;
        return (
          <Card key={sc.key} onPress={place.results[sc.key] ? () => onShowOnMap(place.results[sc.key], "map") : undefined}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={T.h3}>{sc.title}</Text>
                <Text style={T.faint}>{sc.sub}</Text>
              </View>
              {d ? (
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.depth, { color: l!.color }]}>{d.mean < 0.05 ? "Dry" : `${d.mean.toFixed(1)} ft`}</Text>
                  <Pill label={l!.label} color={l!.color} />
                </View>
              ) : <Pill label="computing" color={C.muted} icon="hourglass-outline" />}
            </View>
            {d && <><Band {...d} max={max} /><Text style={T.faint}>Likely range {d.p10.toFixed(1)}–{d.p90.toFixed(1)} ft · red line = 1 ft</Text></>}
          </Card>
        );
      })}

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button title="Show on map" icon="map-outline" kind="ghost" disabled={!showKey} onPress={() => onShowOnMap(showKey!, "map")} style={{ flex: 1 }} />
        <Button title="See it in 3D" icon="cube-outline" kind="ghost" disabled={!showKey} onPress={() => onShowOnMap(showKey!, "3d")} style={{ flex: 1 }} />
      </View>

      <SectionTitle title="About this spot" />
      <Card>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <Icon name="shield-checkmark-outline" size={20} color={place.info?.fema?.sfha ? C.warn : C.ok} />
          <View style={{ flex: 1, gap: 3 }}><Text style={T.h3}>{fema.title}</Text><Text style={T.small}>{fema.body}</Text></View>
        </View>
        {place.info?.ground_ft != null && (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 }}>
            <Icon name="trending-up-outline" size={20} color={C.accent} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={T.h3}>Ground at {place.info.ground_ft} ft above sea level</Text>
              <Text style={T.small}>NAVD88, from 2018 county lidar.{place.info.fema?.bfe_ft ? ` FEMA's base flood elevation here is ${place.info.fema.bfe_ft} ft — ${(place.info.fema.bfe_ft - place.info.ground_ft).toFixed(1)} ft above the ground.` : ""}</Text>
            </View>
          </View>
        )}
      </Card>

      <SectionTitle title="What you can do" />
      <Card style={{ gap: 12 }}>
        {actions.map((a) => (
          <View key={a.t} style={{ flexDirection: "row", gap: 10 }}>
            <Icon name="checkmark-circle-outline" size={20} color={C.accent} />
            <View style={{ flex: 1 }}><Text style={T.h3}>{a.t}</Text><Text style={T.small}>{a.d}</Text></View>
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {pending.length > 0 && !st.running && <Button title="Retry scenarios" icon="refresh" kind="ghost" onPress={() => analyzePlace(place.id)} style={{ flex: 1 }} />}
        <Button title="Remove place" icon="trash-outline" kind="danger" onPress={() => st.removePlace(place.id)} style={{ flex: 1 }} />
      </View>
      <Text style={T.faint}>Depth is the model's maximum water depth at the building's 10 m cell. Storm drains are not modeled, so results lean conservative. Screening-grade.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { padding: 18, gap: 12, paddingBottom: 40 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backT: { color: C.accent, fontWeight: "700", fontSize: 14 },
  nameInput: { padding: 0, outlineStyle: "none" } as any,
  hero: { gap: 10, padding: 16 },
  lvlDot: { width: 12, height: 12, borderRadius: 6 },
  lvlT: { fontSize: 22, fontWeight: "900" },
  depth: { fontSize: 22, fontWeight: "900", marginBottom: 4 },
  track: { height: 10, marginTop: 6, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.06)" },
  band: { position: "absolute", top: 0, bottom: 0, borderRadius: 5, backgroundColor: "rgba(76,195,255,0.45)" },
  tick: { position: "absolute", top: -3, width: 3, height: 16, marginLeft: -1.5, borderRadius: 2, backgroundColor: "#fff" },
  ft: { position: "absolute", top: -2, bottom: -2, width: 1, backgroundColor: C.bad, opacity: 0.8 },
});
export { R };
