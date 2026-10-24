import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, GeocodeResult } from "../api";
import { C, R } from "../theme";

export function SearchBar({ onPick }: { onPick: (r: GeocodeResult) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GeocodeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (q.trim().length < 4) { setRes([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.geocode(q);
        if (id === seq.current) { setRes(r.results); setOpen(true); }
      } catch { if (id === seq.current) setRes([]); }
      finally { if (id === seq.current) setBusy(false); }
    }, 320);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        <Text style={s.icon}>⌕</Text>
        <TextInput
          style={s.input} value={q} onChangeText={setQ} onFocus={() => setOpen(true)}
          placeholder="Search a Pasco address — e.g. 5919 Main St" placeholderTextColor={C.faint}
          autoCorrect={false} returnKeyType="search" onSubmitEditing={() => res[0] && pick(res[0])}
        />
        {busy ? <ActivityIndicator color={C.accent} size="small" /> : q ? (
          <Pressable onPress={() => { setQ(""); setRes([]); }} hitSlop={10}><Text style={s.clear}>✕</Text></Pressable>
        ) : null}
      </View>
      {open && res.length > 0 && (
        <View style={s.list}>
          {res.map((r, i) => (
            <Pressable key={i} onPress={() => pick(r)} style={({ pressed }) => [s.item, pressed && { backgroundColor: C.accentDim }]}>
              <Text style={s.itemT} numberOfLines={1}>{r.label}</Text>
              <Text style={s.itemS}>{r.tile_id}{r.source === "census" ? " · Census" : ""}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
  function pick(r: GeocodeResult) { setOpen(false); setQ(r.label); onPick(r); }
}

const s = StyleSheet.create({
  wrap: { flex: 1, zIndex: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: R.md,
         backgroundColor: C.glass, borderWidth: 1, borderColor: C.line },
  icon: { color: C.accent, fontSize: 20, marginTop: -2 },
  input: { flex: 1, color: C.ink, fontSize: 15, outlineStyle: "none" } as any,
  clear: { color: C.muted, fontSize: 14 },
  list: { marginTop: 6, borderRadius: R.md, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  item: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  itemT: { color: C.ink, fontSize: 14, fontWeight: "500" },
  itemS: { color: C.faint, fontSize: 11, marginTop: 2 },
});
