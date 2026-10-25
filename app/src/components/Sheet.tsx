// Bottom sheet with three detents (peek / half / full), like Apple Maps. Drag the header to move it.
import { ReactNode, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { R, useTheme } from "../theme";
import { haptic } from "../ui";

export type Detent = "peek" | "half" | "full";

export function Sheet({ detent, onDetent, heights, header, children, scrollRef }: {
  detent: Detent; onDetent: (d: Detent) => void; heights: Record<Detent, number>;
  header: ReactNode; children: ReactNode; scrollRef?: React.RefObject<any>;
}) {
  const t = useTheme();
  const h = useRef(new Animated.Value(heights[detent])).current;
  const cur = useRef(heights[detent]);
  const start = useRef(0);
  const hs = useRef(heights); hs.current = heights;

  useEffect(() => {
    cur.current = heights[detent];
    Animated.spring(h, { toValue: heights[detent], useNativeDriver: false, damping: 26, stiffness: 260, mass: 0.9 }).start();
  }, [detent, heights.peek, heights.half, heights.full]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { h.stopAnimation((v) => { start.current = v; }); },
    onPanResponderMove: (_e, g) => {
      const { peek, full } = hs.current;
      h.setValue(Math.max(peek - 30, Math.min(full + 20, start.current - g.dy)));
    },
    onPanResponderRelease: (_e, g) => {
      const { peek, half, full } = hs.current;
      const pos = start.current - g.dy - g.vy * 160;           // project the fling
      const opts: [Detent, number][] = [["peek", peek], ["half", half], ["full", full]];
      const [d] = opts.reduce((a, b) => (Math.abs(b[1] - pos) < Math.abs(a[1] - pos) ? b : a));
      haptic.tap();
      cur.current = hs.current[d];
      Animated.spring(h, { toValue: hs.current[d], useNativeDriver: false, damping: 26, stiffness: 260, mass: 0.9, velocity: -g.vy }).start();
      onDetent(d);
    },
  }), []);

  return (
    <Animated.View style={[s.sheet, { height: h, backgroundColor: t.sheet, shadowColor: t.shadow, borderColor: t.separator }]}>
      <View {...pan.panHandlers}>
        <Pressable onPress={() => onDetent(detent === "full" ? "half" : detent === "half" ? "full" : "half")}
          style={s.grabArea} accessibilityRole="adjustable" accessibilityLabel="Resize panel">
          <View style={[s.grabber, { backgroundColor: t.label3 }]} />
        </Pressable>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>{header}</View>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, overflow: "hidden",
           shadowOpacity: 1, shadowRadius: 20, shadowOffset: { width: 0, height: -2 }, elevation: 16, borderTopWidth: StyleSheet.hairlineWidth },
  grabArea: { alignItems: "center", paddingTop: 7, paddingBottom: 9 },
  grabber: { width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
});
