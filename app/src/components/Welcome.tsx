import { Pressable, StyleSheet, Text, View } from "react-native";
import { useStore } from "../store";
import { C, R } from "../theme";
import { Icon, IconName, T } from "../ui";

function Choice({ icon, title, body, color, onPress }: { icon: IconName; title: string; body: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ hovered, pressed }: any) => [s.choice, (hovered || pressed) && { borderColor: color }]}>
      <View style={[s.icon, { backgroundColor: color + "22" }]}><Icon name={icon} size={24} color={color} /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={T.h2}>{title}</Text>
        <Text style={T.small}>{body}</Text>
      </View>
      <Icon name="arrow-forward" size={20} color={C.muted} />
    </Pressable>
  );
}

/** First-run welcome: pick the job you came to do. */
export function Welcome() {
  const st = useStore();
  const go = (tab: "home" | "plan" | "explore") => st.set({ seenIntro: true, tab });
  return (
    <View style={s.backdrop}>
      <View style={s.card}>
        <View style={s.logo}><Icon name="water" size={28} color="#03111f" /></View>
        <Text style={[T.kicker, { textAlign: "center" }]}>PASCO FLOOD SCREENING</Text>
        <Text style={[T.h1, { textAlign: "center" }]}>See where the water goes before the storm does.</Text>
        <Text style={[T.body, { textAlign: "center" }]}>Flood depths for design storms and Helene-scale surge on real county terrain, with honest uncertainty bands.</Text>
        <View style={{ gap: 10, marginTop: 6 }}>
          <Choice icon="home" color={C.accent} title="I live in Pasco" body="Check your home: depth at your door, what it means, what to do." onPress={() => go("home")} />
          <Choice icon="construct" color={C.ok} title="I plan drainage projects" body="Sketch ponds and road raises; rank them by cost per home protected." onPress={() => go("plan")} />
        </View>
        <Pressable onPress={() => go("explore")} style={{ alignSelf: "center", padding: 8 }}>
          <Text style={{ color: C.muted, fontWeight: "700" }}>Just explore the map</Text>
        </Pressable>
        <Text style={[T.faint, { textAlign: "center" }]}>Screening-grade · not a substitute for an engineering study</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 80, backgroundColor: "rgba(3,8,16,0.82)",
              alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 520, padding: 24, gap: 10, borderRadius: R.lg + 4, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  logo: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 6 },
  choice: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(255,255,255,0.03)" },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
