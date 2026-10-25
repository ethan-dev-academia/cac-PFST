import { useRef, useState } from "react";
import { GestureResponderEvent, PanResponder, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";

interface Props { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; marks?: number[]; label?: string }

/** iOS-style slider (works with mouse and touch). */
export function Slider({ value, min, max, step = 0.1, onChange, marks = [], label }: Props) {
  const t = useTheme();
  const [w, setW] = useState(1);
  const left = useRef(0);
  const box = useRef<any>(null);
  const frac = (value - min) / (max - min);
  const fromX = (x: number) => onChange(Math.round((min + Math.min(1, Math.max(0, x / w)) * (max - min)) / step) * step);
  const fromXRef = useRef(fromX);
  fromXRef.current = fromX;
  const pageX = (e: GestureResponderEvent) => e.nativeEvent.pageX - left.current;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { box.current?.measure((_x: number, _y: number, _w: number, _h: number, px: number) => { left.current = px; fromXRef.current(pageX(e)); }); },
    onPanResponderMove: (e) => fromXRef.current(pageX(e)),
  })).current;
  return (
    <View ref={box} style={s.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}
      accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}>
      <View style={[s.track, { backgroundColor: t.fill }]} />
      <View style={[s.fill, { width: `${frac * 100}%`, backgroundColor: t.tint }]} />
      {marks.map((m) => <View key={m} style={[s.mark, { left: `${((m - min) / (max - min)) * 100}%`, backgroundColor: t.label3 }]} />)}
      <View style={[s.thumb, { left: `${frac * 100}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { height: 36, justifyContent: "center" },
  track: { height: 4, borderRadius: 2 },
  fill: { position: "absolute", height: 4, borderRadius: 2 },
  mark: { position: "absolute", width: 2, height: 10, marginLeft: -1, borderRadius: 1 },
  thumb: { position: "absolute", width: 26, height: 26, marginLeft: -13, borderRadius: 13, backgroundColor: "#fff",
           shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
});
