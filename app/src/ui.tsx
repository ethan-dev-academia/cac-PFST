// Component kit (DESIGN.md). Every screen is built from these; no ad-hoc colours or sizes.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Children, ComponentProps, Fragment, ReactNode, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Level, riskColor } from "./risk";
import { R, useTheme, useType } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export const haptic = {
  tap: () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); },
  commit: () => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  success: () => { if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
};

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.label2} />;
}

type Variant = keyof ReturnType<typeof useType>;
export function Txt({ v = "body", color, style, children, lines, center }: {
  v?: Variant; color?: "label" | "label2" | "label3" | "tint" | "bad" | string; style?: TextStyle | TextStyle[];
  children: ReactNode; lines?: number; center?: boolean;
}) {
  const t = useTheme(); const ty = useType();
  const c = color == null ? t.label : color in t ? (t as any)[color] : color;
  return <Text numberOfLines={lines} style={[ty[v], { color: c }, center && { textAlign: "center" }, style]}>{children}</Text>;
}

/** Large page header with optional back link (Esc on desktop handled by the app). */
export function Header({ title, subtitle, back, onBack, right }: { title: string; subtitle?: string; back?: string; onBack?: () => void; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: 4 }}>
      {back && (
        <Pressable onPress={() => { haptic.tap(); onBack?.(); }} hitSlop={12} style={({ hovered }: any) => [s.back, hovered && { opacity: 0.7 }]}
          accessibilityRole="button" accessibilityLabel={`Back to ${back}`}>
          <Icon name="chevron-back" size={20} color={t.tint} /><Txt v="callout" color="tint">{back}</Txt>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <Txt v="largeTitle" style={{ flex: 1 }}>{title}</Txt>
        {right}
      </View>
      {subtitle && <Txt v="subhead" color="label2">{subtitle}</Txt>}
    </View>
  );
}

/** iOS inset grouped list section (used on Mac too). */
export function Group({ title, footer, children, style }: { title?: string; footer?: string; children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ gap: 6 }, style]}>
      {title && <Txt v="footnote" color="label2" style={{ marginLeft: 16, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</Txt>}
      <View style={{ backgroundColor: t.surface, borderRadius: R.md, overflow: "hidden" }}>
        {items.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.separator, marginLeft: 16 }} />}
            {c}
          </Fragment>
        ))}
      </View>
      {footer && <Txt v="footnote" color="label3" style={{ marginHorizontal: 16 }}>{footer}</Txt>}
    </View>
  );
}

export function Row({ icon, iconColor, iconBg, title, subtitle, value, right, onPress, chevron, destructive, disabled }: {
  icon?: IconName; iconColor?: string; iconBg?: string; title: string; subtitle?: string; value?: string; right?: ReactNode;
  onPress?: () => void; chevron?: boolean; destructive?: boolean; disabled?: boolean;
}) {
  const t = useTheme();
  const body = (
    <>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: iconBg ?? "transparent" }]}>
          <Icon name={icon} size={iconBg ? 17 : 22} color={iconColor ?? (iconBg ? "#fff" : t.tint)} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2, paddingVertical: subtitle ? 10 : 12 }}>
        <Txt v="body" color={destructive ? "bad" : disabled ? "label3" : "label"} lines={1}>{title}</Txt>
        {subtitle && <Txt v="footnote" color="label2" lines={2}>{subtitle}</Txt>}
      </View>
      {value != null && <Txt v="body" color="label2">{value}</Txt>}
      {right}
      {(chevron ?? !!onPress) && !destructive && <Icon name="chevron-forward" size={16} color={t.label3} />}
    </>
  );
  if (!onPress) return <View style={s.row}>{body}</View>;
  return (
    <Pressable onPress={() => { haptic.tap(); onPress(); }} disabled={disabled} accessibilityRole="button"
      style={({ pressed, hovered }: any) => [s.row, (pressed || hovered) && { backgroundColor: t.fill }]}>
      {body}
    </Pressable>
  );
}

export function Button({ title, onPress, icon, kind = "filled", disabled, busy, style, small }: {
  title: string; onPress: () => void; icon?: IconName; kind?: "filled" | "tinted" | "plain" | "destructive";
  disabled?: boolean; busy?: boolean; style?: ViewStyle; small?: boolean;
}) {
  const t = useTheme(); const ty = useType();
  const bg = kind === "filled" ? t.tint : kind === "tinted" ? t.tintSoft : kind === "destructive" ? (t.dark ? "rgba(255,69,58,0.15)" : "rgba(215,0,21,0.08)") : "transparent";
  const fg = kind === "filled" ? t.tintText : kind === "destructive" ? t.bad : t.tint;
  return (
    <Pressable onPress={() => { haptic.commit(); onPress(); }} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed, hovered }: any) => [s.btn, small && s.btnSmall, { backgroundColor: bg },
        hovered && !disabled && { opacity: 0.88 }, pressed && { opacity: 0.7 }, (disabled || busy) && { opacity: 0.4 }, style]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={[ty.headline, small && ty.subhead, { color: fg, fontWeight: "600" }]}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange, style }: {
  value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; style?: ViewStyle;
}) {
  const t = useTheme(); const ty = useType();
  return (
    <View style={[s.seg, { backgroundColor: t.fill }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { if (!on) { haptic.tap(); onChange(o.value); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ hovered }: any) => [s.segB, on && { backgroundColor: t.dark ? "#636366" : "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
              hovered && !on && { opacity: 0.7 }]}>
            {o.icon && <Icon name={o.icon} size={15} color={t.label} />}
            <Text style={[ty.subhead, { color: t.label, fontWeight: on ? "600" : "500" }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RiskTag({ level, size = "md" }: { level: Level; size?: "md" | "lg" }) {
  const t = useTheme(); const ty = useType();
  const c = riskColor(t, level.key);
  return (
    <View style={[s.tag, size === "lg" && { paddingHorizontal: 10, paddingVertical: 4 }, { backgroundColor: c + (t.dark ? "2E" : "1A") }]}>
      <View style={[s.tagDot, { backgroundColor: c }]} />
      <Text style={[size === "lg" ? ty.subhead : ty.footnote, { color: c, fontWeight: "700" }]}>{level.label}</Text>
    </View>
  );
}

/** Depth ruler: likely range as a band, best estimate as a tick, 1 ft line marked. */
export function Ruler({ lo, mid, hi, max = 3, color }: { lo: number; mid: number; hi: number; max?: number; color: string }) {
  const t = useTheme();
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%` as const;
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.ruler, { backgroundColor: t.fill }]}>
        <View style={[s.rulerBand, { left: pct(lo), width: `${Math.max(2, ((Math.min(hi, max) - lo) / max) * 100)}%`, backgroundColor: color + "55" }]} />
        <View style={[s.rulerTick, { left: pct(mid), backgroundColor: color }]} />
        <View style={[s.rulerFt, { left: pct(1), backgroundColor: t.label3 }]} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt v="caption" color="label3">0</Txt>
        <Txt v="caption" color="label3" style={{ position: "absolute", left: pct(1), marginLeft: -16 }}>1 ft</Txt>
        <Txt v="caption" color="label3">{max} ft</Txt>
      </View>
    </View>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => { haptic.tap(); setOpen(!open); }} style={({ hovered }: any) => [{ flexDirection: "row", alignItems: "center", gap: 6 }, hovered && { opacity: 0.7 }]}
        accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Txt v="subhead" color="tint">{title}</Txt>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} color={t.tint} />
      </Pressable>
      {open && children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | (ViewStyle | false | undefined)[] }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: R.md, padding: 16, gap: 10 }, style as any]}>{children}</View>;
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, gap: 8 }}>
      <View style={[s.emptyIcon, { backgroundColor: t.tintSoft }]}><Icon name={icon} size={28} color={t.tint} /></View>
      <Txt v="headline" center>{title}</Txt>
      <Txt v="subhead" color="label2" center style={{ maxWidth: 340 }}>{body}</Txt>
      {children}
    </View>
  );
}

/** Honest waiting (DESIGN.md §6): what's happening, progress, and a reassurance you can leave. */
export function Progress({ label, elapsed, eta, note }: { label: string; elapsed: number; eta: number; note?: string }) {
  const t = useTheme();
  const frac = Math.min(0.95, elapsed / Math.max(eta, 1));
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ActivityIndicator size="small" color={t.tint} />
        <Txt v="subhead" style={{ flex: 1 }} lines={1}>{label}</Txt>
        <Txt v="footnote" color="label3">{elapsed < eta ? `~${Math.max(5, Math.round(eta - elapsed))} s left` : "almost done"}</Txt>
      </View>
      <View style={[s.prog, { backgroundColor: t.fill }]}><View style={[s.progFill, { width: `${frac * 100}%`, backgroundColor: t.tint }]} /></View>
      {note && <Txt v="footnote" color="label3">{note}</Txt>}
    </View>
  );
}

const s = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginLeft: -6, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 48 },
  rowIcon: { width: 30, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  btn: { minHeight: 50, paddingHorizontal: 18, borderRadius: R.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnSmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: R.sm },
  seg: { flexDirection: "row", padding: 2, borderRadius: 9 },
  segB: { flex: 1, flexDirection: "row", gap: 6, minHeight: 32, borderRadius: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  ruler: { height: 10, borderRadius: 5 },
  rulerBand: { position: "absolute", top: 0, bottom: 0, borderRadius: 5 },
  rulerTick: { position: "absolute", top: -4, width: 4, height: 18, marginLeft: -2, borderRadius: 2 },
  rulerFt: { position: "absolute", top: -3, bottom: -3, width: 1.5, marginLeft: -0.75 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  prog: { height: 4, borderRadius: 2, overflow: "hidden" },
  progFill: { height: 4, borderRadius: 2 },
});
