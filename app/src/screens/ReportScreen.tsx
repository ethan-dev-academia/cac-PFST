import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, Prediction } from "../api";
import { memoHtml } from "../report";
import { costPerHome, money } from "../services";
import { useStore } from "../store";
import { R, useTheme } from "../theme";
import { Button, Card, Header, Txt } from "../ui";
import { stormWords } from "./ExploreScreen";

async function toDataUri(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

function Panel({ title, p, imagery }: { title: string; p: Prediction; imagery: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 260, maxWidth: 460 }}>
      <Txt v="footnote" color="label2" style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</Txt>
      <View style={[s.map, { backgroundColor: t.surface2 }]}>
        <Image source={{ uri: imagery }} style={StyleSheet.absoluteFill} />
        <Image source={{ uri: `data:image/png;base64,${p.overlay_png}` }} style={StyleSheet.absoluteFill} />
      </View>
      <Txt v="title">{p.stats.mean.homes_flagged} homes</Txt>
      <Txt v="footnote" color="label2">with more than a foot of water · likely {p.stats.p10.homes_flagged}–{p.stats.p90.homes_flagged}</Txt>
    </Card>
  );
}

export function ReportScreen() {
  const st = useStore(); const t = useTheme(); const ins = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const b = st.baseline, p = st.project;
  const tile = st.tileMeta;
  const pr = st.tab === "plan" ? st.projects.find((x) => x.id === st.activeProjectId) : null;
  if (!b || !st.tileId) return null;
  const imagery = api.imageryUrl(st.tileId);
  const tide = st.presets?.tide_ft ?? 0.61;
  const r = p ? b.stats.mean.homes_flagged - p.stats.mean.homes_flagged : null;

  async function exportPdf() {
    setBusy(true); setMsg(null);
    try {
      const html = memoHtml({ tile: tile ?? undefined, tileId: st.tileId!, baseline: b!, project: p, imagery: await toDataUri(imagery),
                              meta: pr ? { name: pr.name, costUsd: pr.costUsd } : null });
      if (Platform.OS === "web") {
        const w = window.open("", "_blank");
        if (!w) throw new Error("Allow pop-ups to save the memo.");
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
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={[s.body, { paddingTop: ins.top + 16, paddingBottom: ins.bottom + 32 }]}>
        <Header title={pr ? pr.name : `${tile?.place ?? ""} area`} back="Done" onBack={() => st.set({ screen: "main" })}
          subtitle={`Tested against ${stormWords(b.scenario.return_period, b.scenario.surge_ft, tide)}`} />
        {r != null && (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: r > 0 ? t.ok : r < 0 ? t.bad : t.label3 }}>
            <Txt v="title3">{r > 0 ? `Keeps ${r} more homes out of deep water` : r < 0 ? `${-r} more homes flood` : "No change in homes with deep water"}</Txt>
            {pr && costPerHome(pr) != null && <Txt v="subhead" color="label2">{money(pr.costUsd)} total · {money(costPerHome(pr)!)} per home kept dry</Txt>}
          </Card>
        )}
        <View style={s.panels}>
          <Panel title="Today" p={b} imagery={imagery} />
          {p && <Panel title="With project" p={p} imagery={imagery} />}
        </View>
        <Button title={busy ? "Preparing…" : "Save as PDF memo"} icon="share-outline" busy={busy} onPress={exportPdf} />
        {msg && <Txt v="footnote" color="label2">{msg}</Txt>}
        <Txt v="footnote" color="label3">A screening result: use it to decide which areas get a full engineering study first. Storm drains are not included.</Txt>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 20, gap: 20, maxWidth: 980, width: "100%", alignSelf: "center" },
  panels: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  map: { width: "100%", aspectRatio: 1, borderRadius: R.sm, overflow: "hidden" },
});
