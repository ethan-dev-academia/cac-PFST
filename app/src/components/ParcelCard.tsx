import { Pressable, StyleSheet, Text, View } from "react-native";
import { depthAt, M_TO_FT, Prediction } from "../api";
import type { Parcel } from "../store";
import { C, R } from "../theme";

export const PARCEL_RUNS = [
  { key: "10", label: "10-yr storm", body: { return_period: 10 } },
  { key: "100", label: "100-yr storm", body: { return_period: 100 } },
  { key: "helene", label: "Helene surge", body: { return_period: 2, surge_ft: 7.62 } },
] as const;

function band(p: Prediction | undefined, cell: [number, number] | null) {
  if (!p || !cell) return null;
  return { mean: depthAt(p.grids.mean, cell) * M_TO_FT, p10: depthAt(p.grids.p10, cell) * M_TO_FT, p90: depthAt(p.grids.p90, cell) * M_TO_FT };
}

export function ParcelCard({ parcel, onClose, onShow }: { parcel: Parcel; onClose: () => void; onShow: (p: Prediction) => void }) {
  const cell = parcel.place.cell;
  const scaleMax = Math.max(2, ...PARCEL_RUNS.map((r) => band(parcel.results[r.key], cell)?.p90 ?? 0));
  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text style={s.kicker}>YOUR PARCEL</Text>
        <Pressable onPress={onClose} hitSlop={10}><Text style={s.x}>✕</Text></Pressable>
      </View>
      <Text style={s.addr} numberOfLines={2}>{parcel.place.label}</Text>
      {!cell && <Text style={s.small}>This address is outside the prepared tiles.</Text>}
      {PARCEL_RUNS.map((r) => {
        const p = parcel.results[r.key], b = band(p, cell);
        return (
          <Pressable key={r.key} onPress={() => p && onShow(p)} style={s.run}>
            <View style={s.rowBetween}>
              <Text style={s.runL}>{r.label}</Text>
              {b ? (
                <Text style={[s.runV, { color: b.mean > 1 ? C.bad : b.mean > 0.1 ? C.warn : C.ok }]}>
                  {b.mean < 0.05 ? "Dry" : `${b.mean.toFixed(1)} ft`}
                </Text>
              ) : <Text style={s.small}>computing…</Text>}
            </View>
            {b && (
              <>
                <View style={s.track}>
                  <View style={[s.bandBar, { left: `${(b.p10 / scaleMax) * 100}%`, width: `${Math.max(1.5, ((b.p90 - b.p10) / scaleMax) * 100)}%` }]} />
                  <View style={[s.meanTick, { left: `${(b.mean / scaleMax) * 100}%` }]} />
                  <View style={[s.ftLine, { left: `${(1 / scaleMax) * 100}%` }]} />
                </View>
                <Text style={s.small}>p10 {b.p10.toFixed(1)} · p90 {b.p90.toFixed(1)} ft</Text>
              </>
            )}
          </Pressable>
        );
      })}
      <Text style={s.foot}>Max water depth at the building pad. Bands reflect rainfall, surge and terrain uncertainty. Screening-grade.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { position: "absolute", right: 12, top: 74, width: 300, maxWidth: "94%", padding: 14, gap: 8, borderRadius: R.lg,
          backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: C.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  x: { color: C.muted, fontSize: 14 },
  addr: { color: C.ink, fontSize: 15, fontWeight: "700" },
  run: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  runL: { color: C.ink, fontSize: 13, fontWeight: "600" },
  runV: { fontSize: 18, fontWeight: "800" },
  track: { height: 10, marginTop: 8, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.06)" },
  bandBar: { position: "absolute", top: 0, bottom: 0, borderRadius: 5, backgroundColor: "rgba(76,195,255,0.45)" },
  meanTick: { position: "absolute", top: -3, width: 3, height: 16, marginLeft: -1.5, borderRadius: 2, backgroundColor: "#fff" },
  ftLine: { position: "absolute", top: -2, bottom: -2, width: 1, backgroundColor: C.bad, opacity: 0.8 },
  small: { color: C.muted, fontSize: 11, marginTop: 4 },
  foot: { color: C.faint, fontSize: 10, lineHeight: 14 },
});
