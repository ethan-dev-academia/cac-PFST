import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, GeocodeResult } from "../api";
import { R, useTheme, useType } from "../theme";
import { haptic, Icon } from "../ui";

export interface SearchHandle { focus: () => void }

/** iOS-style search field with live Pasco address suggestions. */
export const SearchBar = forwardRef<SearchHandle, { onPick: (r: GeocodeResult) => void; placeholder?: string }>(function SearchBar({ onPick, placeholder }, ref) {
  const t = useTheme(); const ty = useType();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GeocodeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const input = useRef<any>(null);
  const seq = useRef(0);
  const picked = useRef<string | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  useEffect(() => {
    setNoMatch(false);
    if (q === picked.current) return;
    if (q.trim().length < 4) { setRes([]); return; }
    const id = ++seq.current;
    const tm = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.geocode(q);
        if (id === seq.current) { setRes(r.results); setNoMatch(r.results.length === 0); }
      } catch { if (id === seq.current) setRes([]); }
      finally { if (id === seq.current) setBusy(false); }
    }, 300);
    return () => clearTimeout(tm);
  }, [q]);

  function pick(r: GeocodeResult) {
    haptic.commit();
    picked.current = ""; seq.current++;
    setRes([]); setQ(""); input.current?.blur();
    onPick(r);
  }
  const open = focused && (res.length > 0 || noMatch);
  return (
    <View style={{ zIndex: 10 }}>
      <View style={[s.field, { backgroundColor: t.fill }, focused && { borderColor: t.tint }]}>
        <Icon name="search" size={17} color={t.label3} />
        <TextInput
          ref={input} value={q} onChangeText={(v) => { picked.current = null; setQ(v); }}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder={placeholder ?? "Search a Pasco address"} placeholderTextColor={t.label3}
          style={[ty.body, s.input, { color: t.label }]} autoCorrect={false} autoComplete="street-address" returnKeyType="search"
          onSubmitEditing={() => res[0] && pick(res[0])} accessibilityLabel="Search an address"
        />
        {busy ? <ActivityIndicator size="small" color={t.label3} /> : q ? (
          <Pressable onPress={() => { setQ(""); setRes([]); }} hitSlop={10} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={17} color={t.label3} />
          </Pressable>
        ) : Platform.OS === "web" ? <Text style={[ty.caption, { color: t.label3 }]}>⌘K</Text> : null}
      </View>
      {open && (
        <View style={[s.list, { backgroundColor: t.surface, shadowColor: t.shadow }]}>
          {noMatch && <View style={s.item}><Text style={[ty.subhead, { color: t.label2 }]}>No Pasco address matches “{q}”. Try the house number and street.</Text></View>}
          {res.map((r, i) => (
            <Pressable key={i} onPress={() => pick(r)}
              style={({ pressed, hovered }: any) => [s.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }, (pressed || hovered) && { backgroundColor: t.fill }]}>
              <Icon name="location" size={18} color={t.tint} />
              <View style={{ flex: 1 }}>
                <Text style={[ty.callout, { color: t.label }]} numberOfLines={1}>{titleCase(r.label.split(",")[0])}</Text>
                <Text style={[ty.footnote, { color: t.label2 }]} numberOfLines={1}>{r.label.split(",").slice(1).join(",").trim()}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

export const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const s = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  input: { flex: 1, paddingVertical: 8, outlineStyle: "none" } as any,
  list: { marginTop: 6, borderRadius: R.md, overflow: "hidden", shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
});
