// Web / desktop: the same visual pages in an <iframe>, bridged with postMessage.
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

export interface VizHandle { post: (msg: object) => void }
interface Props { url: string; onMessage: (msg: any) => void; visible: boolean }

export const VizFrame = forwardRef<VizHandle, Props>(function VizFrame({ url, onMessage, visible }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const cb = useRef(onMessage);
  cb.current = onMessage;
  useImperativeHandle(ref, () => ({
    post: (msg) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), "*"),
  }));
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      try { cb.current(typeof e.data === "string" ? JSON.parse(e.data) : e.data); } catch {}
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, !visible && { opacity: 0 }]} pointerEvents={visible ? "auto" : "none"}>
      {createElement("iframe", {
        ref: frame, src: url, allow: "fullscreen; geolocation",
        style: { border: 0, width: "100%", height: "100%", background: "#050b16" },
      })}
    </View>
  );
});
