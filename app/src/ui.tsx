// Small design-system pieces shared by every screen.
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { C, R } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 18, color = C.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed, hovered }: any) => [u.card, style, (pressed || hovered) && u.cardHover]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[u.card, style]}>{children}</View>;
}

export function Button({ title, onPress, icon, kind = "primary", disabled, busy, style }: {
  title: string; onPress: () => void; icon?: IconName; kind?: "primary" | "ghost" | "danger" | "ok";
  disabled?: boolean; busy?: boolean; style?: ViewStyle;
}) {
  const bg = kind === "primary" ? C.accent : kind === "ok" ? C.ok : "transparent";
  const fg = kind === "primary" || kind === "ok" ? "#03111f" : kind === "danger" ? C.bad : C.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed, hovered }: any) => [u.btn, { backgroundColor: bg },
        kind === "ghost" && u.btnGhost, kind === "danger" && u.btnDanger,
        (pressed || hovered) && { opacity: 0.86 }, (disabled || busy) && { opacity: 0.5 }, style]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={17} color={fg} /> : null}
      <Text style={[u.btnT, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Pill({ label, color = C.accent, icon }: { label: string; color?: string; icon?: IconName }) {
  return (
    <View style={[u.pill, { backgroundColor: color + "22", borderColor: color + "66" }]}>
      {icon && <Icon name={icon} size={12} color={color} />}
      <Text style={[u.pillT, { color }]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={u.secRow}>
      <Text style={u.sec}>{title}</Text>
      {action && <Pressable onPress={onAction} hitSlop={8}><Text style={u.secA}>{action}</Text></Pressable>}
    </View>
  );
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: ReactNode }) {
  return (
    <View style={u.empty}>
      <View style={u.emptyIcon}><Icon name={icon} size={26} color={C.accent} /></View>
      <Text style={u.emptyT}>{title}</Text>
      <Text style={u.emptyB}>{body}</Text>
      {children}
    </View>
  );
}

export function Stat({ value, label, color = C.ink, sub }: { value: string; label: string; color?: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 110 }}>
      <Text style={[u.statV, { color }]}>{value}</Text>
      <Text style={u.statL}>{label}</Text>
      {sub && <Text style={u.statS}>{sub}</Text>}
    </View>
  );
}

export const T = StyleSheet.create({
  h1: { color: C.ink, fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  h2: { color: C.ink, fontSize: 18, fontWeight: "700" },
  h3: { color: C.ink, fontSize: 15, fontWeight: "700" },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  small: { color: C.muted, fontSize: 12, lineHeight: 17 },
  faint: { color: C.faint, fontSize: 11, lineHeight: 15 },
  kicker: { color: C.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
});

const u = StyleSheet.create({
  card: { padding: 14, borderRadius: R.lg, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, gap: 8 },
  cardHover: { borderColor: "rgba(76,195,255,0.45)", backgroundColor: "rgba(16,32,56,0.95)" },
  btn: { height: 46, paddingHorizontal: 16, borderRadius: R.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnGhost: { borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(255,255,255,0.03)" },
  btnDanger: { borderWidth: 1, borderColor: "rgba(255,84,104,0.4)" },
  btnT: { fontWeight: "800", fontSize: 14, letterSpacing: 0.2 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  pillT: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  secRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  sec: { color: C.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  secA: { color: C.accent, fontSize: 13, fontWeight: "700" },
  empty: { alignItems: "center", padding: 24, gap: 8, borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.line },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentDim, alignItems: "center", justifyContent: "center" },
  emptyT: { color: C.ink, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyB: { color: C.muted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 360 },
  statV: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  statL: { color: C.muted, fontSize: 12, marginTop: 2 },
  statS: { color: C.faint, fontSize: 11, marginTop: 1 },
});
