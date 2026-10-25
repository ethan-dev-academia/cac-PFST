// Design tokens (see DESIGN.md). Light and dark follow the system unless overridden in Settings.
import { Platform, useColorScheme, useWindowDimensions } from "react-native";
import { useStore } from "./store";

export interface Theme {
  dark: boolean;
  bg: string;          // app background (grouped)
  surface: string;     // cards / grouped rows
  surface2: string;    // nested surfaces, inputs
  sidebar: string;
  sheet: string;
  label: string;       // primary text
  label2: string;      // secondary text
  label3: string;      // tertiary text
  separator: string;
  fill: string;        // subtle control fill
  tint: string;        // system blue: the one primary action
  tintText: string;
  tintSoft: string;
  ok: string; warn: string; bad: string;
  shadow: string;
}

const light: Theme = {
  dark: false,
  bg: "#F2F2F7", surface: "#FFFFFF", surface2: "#F2F2F7", sidebar: "#F5F5F7", sheet: "rgba(250,250,252,0.97)",
  label: "#1C1C1E", label2: "#5F6368", label3: "#8E8E93", separator: "rgba(60,60,67,0.16)", fill: "rgba(118,118,128,0.12)",
  tint: "#007AFF", tintText: "#FFFFFF", tintSoft: "rgba(0,122,255,0.10)",
  ok: "#248A3D", warn: "#C93400", bad: "#D70015", shadow: "rgba(0,0,0,0.12)",
};
const dark: Theme = {
  dark: true,
  bg: "#000000", surface: "#1C1C1E", surface2: "#2C2C2E", sidebar: "#161618", sheet: "rgba(28,28,30,0.97)",
  label: "#F5F5F7", label2: "#AEAEB2", label3: "#7C7C80", separator: "rgba(84,84,88,0.55)", fill: "rgba(118,118,128,0.24)",
  tint: "#0A84FF", tintText: "#FFFFFF", tintSoft: "rgba(10,132,255,0.18)",
  ok: "#30D158", warn: "#FF9F0A", bad: "#FF453A", shadow: "rgba(0,0,0,0.5)",
};

export function useTheme(): Theme {
  const sys = useColorScheme();
  const pref = useStore((s) => s.appearance);
  const isDark = pref === "dark" || (pref === "system" && sys === "dark");
  return isDark ? dark : light;
}

/** Touch devices (iPhone) get iOS sizes; pointer devices (Mac) get denser desktop sizes. */
export function useType() {
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 760;
  const s = compact ? 1 : 0.88;
  const f = (n: number) => Math.round(n * s);
  return {
    largeTitle: { fontSize: f(34), fontWeight: "700" as const, letterSpacing: 0.2 },
    title: { fontSize: f(22), fontWeight: "700" as const },
    title3: { fontSize: f(20), fontWeight: "600" as const },
    headline: { fontSize: f(17), fontWeight: "600" as const },
    body: { fontSize: f(17), lineHeight: f(23) },
    callout: { fontSize: f(16), lineHeight: f(21) },
    subhead: { fontSize: f(15), lineHeight: f(20) },
    footnote: { fontSize: f(13), lineHeight: f(18) },
    caption: { fontSize: f(12), lineHeight: f(16) },
  };
}

/** The risk scale: the only place colour carries meaning. Same five steps everywhere. */
export const RISK_COLORS = {
  light: { dry: "#248A3D", low: "#6B8E00", moderate: "#B25000", high: "#C93400", severe: "#D70015" },
  dark: { dry: "#30D158", low: "#B8E04A", moderate: "#FFB340", high: "#FF8A3D", severe: "#FF453A" },
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22 };

// Legacy dark palette for the few places that need a static value (WebView backgrounds).
export const C = { bg0: "#000000" };
