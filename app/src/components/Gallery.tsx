// "See it in action": featured floods that load instantly. Visual first (DESIGN.md: the map serves the task).
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { API, api, Showcase } from "../api";
import { watchFlood } from "../services";
import { useStore } from "../store";
import { R, useTheme } from "../theme";
import { haptic, Icon, Txt } from "../ui";

export function Gallery() {
  const t = useTheme();
  const [items, setItems] = useState<Showcase[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => api.showcases().then((r) => live && setItems(r.showcases)).catch(() => {});
    load();
    const id = setInterval(load, 15000);   // pick up showcases as they finish computing
    return () => { live = false; clearInterval(id); };
  }, []);
  if (!items) return null;

  async function open(sc: Showcase) {
    haptic.commit();
    setOpening(sc.id);
    try {
      if (!sc.ready) {
        await api.predict(sc.request, (el, eta) => useStore.getState().set({ running: { label: `Preparing “${sc.title}”…`, elapsed: el, eta } }));
        useStore.getState().set({ running: null });
      }
      await watchFlood(sc.key, sc.title, sc.place);
    } finally { setOpening(null); }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginHorizontal: 4 }}>
        <Txt v="title3">See it in action</Txt>
        <Txt v="footnote" color="label3">Watch real Pasco streets flood</Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
        {items.map((sc) => (
          <Pressable key={sc.id} onPress={() => open(sc)} accessibilityRole="button" accessibilityLabel={`${sc.title}, ${sc.place}`}
            style={({ hovered, pressed }: any) => [s.card, { backgroundColor: t.surface, shadowColor: t.shadow }, (hovered || pressed) && { transform: [{ scale: 0.98 }] }]}>
            <View style={s.thumb}>
              <Image source={{ uri: api.imageryUrl(sc.tile_id) }} style={StyleSheet.absoluteFill} />
              {sc.ready && <Image source={{ uri: `${API}/jobs/${sc.key}/overlay.png` }} style={StyleSheet.absoluteFill} />}
              <View style={s.playWrap}>
                {opening === sc.id ? <ActivityIndicator color="#fff" /> : <Icon name="play" size={22} color="#fff" />}
              </View>
            </View>
            <View style={{ padding: 12, gap: 2 }}>
              <Txt v="headline" lines={1}>{sc.title}</Txt>
              <Txt v="footnote" color="label2" lines={1}>{sc.place}</Txt>
              <Txt v="caption" color="label3" lines={2} style={{ marginTop: 4 }}>
                {sc.stats ? `${sc.stats.homes} homes with a foot or more of water` : sc.ready ? sc.blurb : "Preparing… tap to watch when ready"}
              </Txt>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: 230, borderRadius: R.lg, overflow: "hidden", shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  thumb: { width: "100%", aspectRatio: 1.35, backgroundColor: "#203040" },
  playWrap: { position: "absolute", right: 10, bottom: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.55)",
              alignItems: "center", justifyContent: "center" },
});
