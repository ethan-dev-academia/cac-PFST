import { useRef, useState } from "react";
import { GestureResponderEvent, PanResponder, StyleSheet, View } from "react-native";
import { C } from "../theme";

interface Props { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; marks?: number[] }

export function Slider({ value, min, max, step = 0.1, onChange, marks = [] }: Props) {
  const [w, setW] = useState(1);
  const left = useRef(0);
  const box = useRef<any>(null); // RN 0.88 host element; has measure()
  const frac = (value - min) / (max - min);
  const fromX = (x: number) => {
    const f = Math.min(1, Math.max(0, x / w));
    const v = min + f * (max - min);
    onChange(Math.round(v / step) * step);
  };
  const pageX = (e: GestureResponderEvent) => e.nativeEvent.pageX - left.current;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { box.current?.measure((_x: number, _y: number, _w: number, _h: number, px: number) => { left.current = px; fromXRef.current(pageX(e)); }); },
    onPanResponderMove: (e) => fromXRef.current(pageX(e)),
  })).current;
  const fromXRef = useRef(fromX);
  fromXRef.current = fromX;
  return (
    <View ref={box} style={s.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={s.track} />
      <View style={[s.fill, { width: `${frac * 100}%` }]} />
      {marks.map((m) => (
        <View key={m} style={[s.mark, { left: `${((m - min) / (max - min)) * 100}%` }]} />
      ))}
      <View style={[s.thumb, { left: `${frac * 100}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { height: 34, justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)" },
  fill: { position: "absolute", height: 6, borderRadius: 3, backgroundColor: C.accent },
  mark: { position: "absolute", width: 2, height: 12, marginLeft: -1, backgroundColor: C.warn, borderRadius: 1 },
  thumb: { position: "absolute", width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundColor: "#fff",
           borderWidth: 4, borderColor: C.accent, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
});
