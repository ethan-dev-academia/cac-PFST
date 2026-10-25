import { Pressable, StyleSheet, View } from "react-native";
import { useStore } from "../store";
import { R, useTheme } from "../theme";
import { haptic, Icon, IconName, Txt } from "../ui";

function Choice({ icon, color, title, body, onPress }: { icon: IconName; color: string; title: string; body: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { haptic.commit(); onPress(); }} accessibilityRole="button"
      style={({ hovered, pressed }: any) => [s.choice, { backgroundColor: t.surface2 }, (hovered || pressed) && { backgroundColor: t.fill }]}>
      <View style={[s.icon, { backgroundColor: color }]}><Icon name={icon} size={22} color="#fff" /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="headline">{title}</Txt>
        <Txt v="footnote" color="label2">{body}</Txt>
      </View>
      <Icon name="chevron-forward" size={18} color={t.label3} />
    </Pressable>
  );
}

/** First-run welcome: pick what you came to do. */
export function Welcome() {
  const st = useStore(); const t = useTheme();
  const go = (tab: "home" | "plan" | "explore") => st.set({ seenIntro: true, tab, sheet: "half" });
  return (
    <View style={[s.backdrop, { backgroundColor: t.dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.25)" }]}>
      <View style={[s.card, { backgroundColor: t.surface, shadowColor: t.shadow }]}>
        <View style={[s.logo, { backgroundColor: t.tint }]}><Icon name="water" size={30} color="#fff" /></View>
        <Txt v="title" center>Pasco Flood Check</Txt>
        <Txt v="subhead" color="label2" center>See how deep floodwater could get at your home or across a neighbourhood, and which fixes help most.</Txt>
        <View style={{ gap: 8, marginTop: 8 }}>
          <Choice icon="home" color={t.tint} title="Check my home" body="Your flood risk in plain language, and what to do about it." onPress={() => go("home")} />
          <Choice icon="construct" color="#5E5CE6" title="Plan drainage projects" body="Compare ponds and road raises by homes kept dry per dollar." onPress={() => go("plan")} />
        </View>
        <Pressable onPress={() => go("explore")} style={({ hovered }: any) => [{ alignSelf: "center", padding: 10 }, hovered && { opacity: 0.7 }]}>
          <Txt v="subhead" color="tint">Just look around the map</Txt>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 80, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 440, padding: 24, gap: 8, borderRadius: R.xl, shadowOpacity: 1, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 20 },
  logo: { width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 8 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: R.md, minHeight: 64 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
