// Native: the visual pages (served by the API at /viz) inside a WebView.
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView as RNWebView } from "react-native-webview";
import { C } from "../theme";

// react-native-webview 14 ships class-component typings that React 19.3 types reject
const WebView = RNWebView as any;

export interface VizHandle { post: (msg: object) => void }
interface Props { url: string; onMessage: (msg: any) => void; visible: boolean }

export const VizFrame = forwardRef<VizHandle, Props>(function VizFrame({ url, onMessage, visible }, ref) {
  const wv = useRef<any>(null);
  useImperativeHandle(ref, () => ({
    post: (msg) => wv.current?.injectJavaScript(`window.__recv && window.__recv(${JSON.stringify(JSON.stringify(msg))}); true;`),
  }));
  return (
    <View style={[StyleSheet.absoluteFill, !visible && styles.hidden]} pointerEvents={visible ? "auto" : "none"}>
      <WebView
        ref={wv}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: C.bg0 }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onMessage={(e: { nativeEvent: { data: string } }) => { try { onMessage(JSON.parse(e.nativeEvent.data)); } catch {} }}
      />
    </View>
  );
});

const styles = StyleSheet.create({ hidden: { opacity: 0 } });
