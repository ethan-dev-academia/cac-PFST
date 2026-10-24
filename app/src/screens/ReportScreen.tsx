import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, Prediction } from "../api";
import { memoHtml } from "../report";
import { useStore } from "../store";
import { C, R } from "../theme";

async function toDataUri(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

function Panel({ title, p, imagery, accent }: { title: string; p: Prediction; imagery: string; accent: string }) {
  return (
    <View style={s.panel}>
      <Text style={[s.ptitle, { color: accent }]}>{title}</Text>
      <View style={s.mapBox}>
        <Image source={{ uri: imagery }} style={StyleSheet.absoluteFill} />
        <Image source={{ uri: `data:image/png;base64,${p.overlay_png}` }} style={StyleSheet.absoluteFill} />
      </View>
      <Text style={s.big}>{p.stats.mean.homes_flagged}</Text>
      <Text style={s.small}>homes over 1 ft · band {p.stats.p10.homes_flagged}–{p.stats.p90.homes_flagged}</Text>
      <Text style={s.small}>{p.stats.mean.area_over_1ft_acres} acres over 1 ft · max {p.stats.mean.max_depth_ft} ft</Text>
    </View>
  );
}

export function ReportScreen() {
  const st = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const b = st.baseline, p = st.project;
  const tile = st.tileMeta ?? st.tiles.find((t) => t.id === st.tileId);
  const imagery = st.tileId ? api.imageryUrl(st.tileId) : "";
  useEffect(() => setMsg(null), [b, p]);
  if (!b || !st.tileId) return null;
  const removed = p ? b.stats.mean.homes_flagged - p.stats.mean.homes_flagged : null;
  const lo = p ? b.stats.p10.homes_flagged - p.stats.p10.homes_flagged : 0;
  const hi = p ? b.stats.p90.homes_flagged - p.stats.p90.homes_flagged : 0;

  async function exportPdf() {
    setBusy(true); setMsg(null);
    try {
      const pr = st.tab === "plan" ? st.projects.find((x) => x.id === st.activeProjectId) : null;
      const html = memoHtml({ tile, tileId: st.tileId!, baseline: b!, project: p, imagery: await toDataUri(imagery),
                              meta: pr ? { name: pr.name, costUsd: pr.costUsd } : null });
      if (Platform.OS === "web") {
        const w = window.open("", "_blank");
        if (!w) throw new Error("allow pop-ups to export the memo");
        w.document.write(html); w.document.close();
        w.onload = () => setTimeout(() => w.print(), 300);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
        else setMsg(`Saved to ${uri}`);
      }
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <View style={s.root}>
      <View style={s.top}>
        <Pressable onPress={() => st.set({ screen: "main" })} hitSlop={12}><Text style={s.back}>‹ Map</Text></Pressable>
        <Text style={s.title}>Scenario report</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.kicker}>{tile?.place?.toUpperCase()} · {st.tileId}</Text>
        <Text style={s.h1}>
          {b.scenario.return_period ? `${b.scenario.return_period}-yr storm` : `${b.scenario.rain_in} in rain`}
          {b.scenario.surge_ft > 0.7 ? ` + ${b.scenario.surge_ft.toFixed(1)} ft surge` : ""}
        </Text>
        {removed !== null ? (
          <View style={s.hero}>
            <Text style={[s.heroN, { color: removed > 0 ? C.ok : C.muted }]}>{removed > 0 ? `−${removed}` : removed}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.heroL}>homes removed from &gt; 1 ft inundation</Text>
              <Text style={s.small}>uncertainty band {Math.min(lo, hi)} to {Math.max(lo, hi)} · {b.stats.homes_total.toLocaleString()} structures in tile</Text>
            </View>
          </View>
        ) : (
          <Text style={s.small}>Add a pond or raised road and re-run to see homes removed.</Text>
        )}
        <View style={s.panels}>
          <Panel title="BEFORE" p={b} imagery={imagery} accent={C.muted} />
          {p && <Panel title="AFTER — WITH PROJECT" p={p} imagery={imagery} accent={C.ok} />}
        </View>
        <Pressable onPress={exportPdf} disabled={busy} style={({ pressed }) => [s.export, (pressed || busy) && { opacity: 0.8 }]}>
          <Text style={s.exportT}>{busy ? "Preparing memo…" : "Export one-page PDF memo"}</Text>
        </Pressable>
        {msg && <Text style={s.small}>{msg}</Text>}
        <Text style={s.fine}>Screening-grade: a way to decide which neighborhoods get the full engineering study first. Storm drains are not modeled.
          {b.backend === "fno" ? ` Neural-operator surrogate, ${b.members}-member ensemble.` : ` Physics solver, ${b.members}-member ensemble.`}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg0 },
  top: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  back: { color: C.accent, fontSize: 16, fontWeight: "600", width: 50 },
  title: { color: C.ink, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, gap: 14, maxWidth: 980, width: "100%", alignSelf: "center" },
  kicker: { color: C.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  h1: { color: C.ink, fontSize: 24, fontWeight: "800" },
  hero: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: R.lg, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  heroN: { fontSize: 48, fontWeight: "900", letterSpacing: -1 },
  heroL: { color: C.ink, fontSize: 16, fontWeight: "700" },
  panels: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  panel: { flex: 1, minWidth: 260, maxWidth: 480, padding: 12, borderRadius: R.lg, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, gap: 2 },
  ptitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 8 },
  mapBox: { width: "100%", aspectRatio: 1, borderRadius: R.md, overflow: "hidden", backgroundColor: C.bg1, marginBottom: 8 },
  big: { color: C.ink, fontSize: 28, fontWeight: "800" },
  small: { color: C.muted, fontSize: 12, marginTop: 2 },
  export: { height: 50, borderRadius: R.md, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  exportT: { color: "#03111f", fontWeight: "800", fontSize: 15 },
  fine: { color: C.faint, fontSize: 11, lineHeight: 16 },
});
