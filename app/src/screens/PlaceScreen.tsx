import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, TextInput, View } from "react-native";
import { api } from "../api";
import { titleCase } from "../components/SearchBar";
import { ACTIONS, depthWords, femaText, levelFor, riskColor, SCENARIOS } from "../risk";
import { analyzePlace, placeDepth, watchFlood } from "../services";
import { Place, useStore } from "../store";
import { useTheme, useType } from "../theme";
import { Button, Card, Disclosure, Group, Header, Icon, IconName, Progress, RiskTag, Row, Ruler, Txt } from "../ui";
import { usePredictions, worst } from "./HomeScreen";

export function confirm(msg: string, onYes: () => void, yes = "Remove") {
  if (Platform.OS === "web") { if (window.confirm(msg)) onYes(); return; }
  Alert.alert(msg, undefined, [{ text: "Cancel", style: "cancel" }, { text: yes, style: "destructive", onPress: onYes }]);
}

export function PlaceScreen({ place, onShowOnMap }: { place: Place; onShowOnMap: (key: string, view: "map" | "3d") => void }) {
  const st = useStore(); const t = useTheme(); const ty = useType();
  const preds = usePredictions(Object.values(place.results));
  const [renaming, setRenaming] = useState(false);
  useEffect(() => {   // FEMA's service is flaky: retry when the saved info has no zone
    if (place.info?.fema?.zone) return;
    api.point(place.geo.lon, place.geo.lat).then((info) => {
      const cur = useStore.getState().places.find((p) => p.id === place.id);
      if (cur && info.fema?.zone) useStore.getState().upsertPlace({ ...cur, info });
    }).catch(() => {});
  }, [place.id]);

  const rows = SCENARIOS.map((sc) => ({ sc, d: place.results[sc.key] ? placeDepth(preds[place.results[sc.key]], place) : null }));
  const pending = rows.filter((r) => !r.d).length;
  const w = pending === 0 ? worst(place, preds) : null;
  const lvl = w ? levelFor(w.ft) : null;
  const worstSc = w ? SCENARIOS.find((x) => x.key === w.key)! : null;
  const fema = femaText(place.info?.fema);
  const actions = [...(w && w.ft >= 0.1 ? ACTIONS.wet : []), ...(w && w.ft >= 2 ? ACTIONS.severe : []), ...ACTIONS.everyone];
  const mapKey = place.results["100"] ?? Object.values(place.results)[0];
  const street = titleCase(place.geo.label.split(",")[0]);
  const town = titleCase(place.geo.label.split(",").slice(1).join(",").trim());
  const rulerMax = Math.max(3, Math.ceil(Math.max(...rows.map((r) => r.d?.p90 ?? 0))));
  const working = st.running && pending > 0;

  return (
    <View style={{ gap: 22 }}>
      {renaming ? (
        <View style={{ gap: 6 }}>
          <Header title="" back="Places" onBack={() => st.set({ openPlaceId: null })} />
          <TextInput autoFocus value={place.name} onChangeText={(name) => st.upsertPlace({ ...place, name })} onBlur={() => setRenaming(false)}
            onSubmitEditing={() => setRenaming(false)} style={[ty.largeTitle, { color: t.label, padding: 0, outlineStyle: "none" } as any]} />
        </View>
      ) : (
        <Header title={place.name} subtitle={town ? `${street}, ${town}` : street} back="Places" onBack={() => st.set({ openPlaceId: null })}
          right={<Pressable onPress={() => setRenaming(true)} hitSlop={10} accessibilityLabel="Rename this place"><Icon name="create-outline" size={22} color={t.tint} /></Pressable>} />
      )}

      {/* the answer (DESIGN.md §1) */}
      <Card style={lvl ? { borderLeftWidth: 4, borderLeftColor: riskColor(t, lvl.key) } : undefined}>
        {lvl && worstSc ? (
          <>
            <RiskTag level={lvl} size="lg" />
            <Txt v="title3">{w!.ft < 0.1 ? `This home stays dry, even in a ${worstSc.title.toLowerCase()}.` : `In a ${worstSc.title.toLowerCase()}, this home ${depthWords(w!.ft)}.`}</Txt>
            <Txt v="subhead" color="label2">{lvl.meaning}</Txt>
          </>
        ) : working ? (
          <>
            <Txt v="title3">Checking this address…</Txt>
            <Progress label={st.running!.label.replace(/^.*?: /, "")} elapsed={st.running!.elapsed} eta={st.running!.eta}
              note={`${3 - pending} of 3 storms done. You can leave this screen; we'll keep going.`} />
          </>
        ) : (
          <>
            <Txt v="title3">{pending === 3 ? "Not checked yet" : "Some storms are missing"}</Txt>
            <Button title="Check this address" icon="play" onPress={() => analyzePlace(place.id)} />
          </>
        )}
      </Card>

      <Group title="Storms">
        {rows.map(({ sc, d }) => {
          const l = d ? levelFor(d.mean) : null;
          return (
            <Pressable key={sc.key} disabled={!d} onPress={() => onShowOnMap(place.results[sc.key], "map")} accessibilityRole="button"
              style={({ hovered, pressed }: any) => [{ padding: 16, gap: 10 }, d && (hovered || pressed) && { backgroundColor: t.fill }]}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="headline">{sc.title}</Txt>
                  <Txt v="footnote" color="label2">{sc.detail}</Txt>
                </View>
                {l ? <RiskTag level={l} /> : <Txt v="footnote" color="label3">{st.running?.label.includes(sc.title) ? "checking…" : "waiting"}</Txt>}
              </View>
              {d && l && (
                <>
                  <Ruler lo={d.p10} mid={d.mean} hi={d.p90} max={rulerMax} color={riskColor(t, l.key)} />
                  <Txt v="footnote" color="label2">
                    {d.mean < 0.1 ? "Best estimate: dry" : `Best estimate ${d.mean.toFixed(1)} ft`}{d.p90 - d.p10 > 0.05 ? ` · likely ${d.p10.toFixed(1)}–${d.p90.toFixed(1)} ft` : ""}
                  </Txt>
                </>
              )}
            </Pressable>
          );
        })}
      </Group>

      {mapKey && (
        <View style={{ gap: 10 }}>
          <Button title="Watch it flood" icon="play" onPress={() => {
            const k = (w && place.results[w.key]) || mapKey;
            const sc = SCENARIOS.find((x) => place.results[x.key] === k);
            watchFlood(k, place.name, sc ? `${sc.title} · ${street}` : street);
          }} />
          <Button title="View on map" icon="map" kind="tinted" onPress={() => onShowOnMap(mapKey, "map")} />
        </View>
      )}

      <Group title="This address">
        {fema ? <Row icon="shield-checkmark" iconBg={place.info?.fema?.sfha ? "#FF9500" : "#34C759"} title={fema.title} subtitle={fema.body} />
              : <Row icon="shield-outline" iconBg="#8E8E93" title="FEMA flood zone" subtitle="Looking it up…" />}
        {place.info?.ground_ft != null && (
          <Row icon="trending-up" iconBg="#007AFF" title={`Ground is ${Math.round(place.info.ground_ft)} ft above sea level`}
            subtitle={place.info.fema?.bfe_ft ? `FEMA's 1-in-100 flood height here is ${place.info.fema.bfe_ft} ft, ${(place.info.fema.bfe_ft - place.info.ground_ft).toFixed(1)} ft above the ground.` : "From the county's 2018 laser survey."} />
        )}
      </Group>

      <Group title="What you can do">
        {actions.map((a) => <Row key={a.t} icon={a.icon as IconName} title={a.t} subtitle={a.d} />)}
      </Group>

      <Disclosure title="How we got this">
        <Txt v="footnote" color="label2">
          We simulate rain and storm surge flowing over the county's 2018 laser-measured ground in the 1.3 km area centred on this address. Depth is the deepest the water gets at this building during the storm. The likely range comes from varying rain, surge and ground height within their real uncertainty. Storm drains aren't included, so results lean toward more water, not less.
        </Txt>
      </Disclosure>

      <Group>
        <Row title="Remove this place" destructive onPress={() => confirm(`Remove ${place.name}?`, () => st.removePlace(place.id))} />
      </Group>
    </View>
  );
}
