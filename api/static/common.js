// Shared helpers for the embedded visual pages (map.html, explorer.html).
// Bridge: works inside a React Native WebView (window.ReactNativeWebView) and inside an
// <iframe> on web/desktop (window.parent.postMessage). Incoming messages arrive through
// window.__recv(msg) (native injectJavaScript) or the "message" event (iframe).
(function () {
  const PF = (window.PF = {});
  const params = new URLSearchParams(location.search);
  PF.api = params.get("api") || location.origin;
  PF.params = params;
  PF.N = 128;
  PF.FT = 0.3048;

  PF.send = function (msg) {
    const s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, "*");
  };
  const handlers = [];
  PF.onMessage = (fn) => handlers.push(fn);
  function dispatch(m) {
    try {
      if (typeof m === "string") m = JSON.parse(m);
    } catch (e) {
      return;
    }
    if (!m || !m.type) return;
    handlers.forEach((h) => h(m));
  }
  window.__recv = dispatch;
  window.addEventListener("message", (e) => dispatch(e.data));
  document.addEventListener("message", (e) => dispatch(e.data)); // Android WebView

  PF.getJSON = async function (path, opts) {
    const r = await fetch(PF.api + path, opts);
    if (!r.ok) throw new Error(path + " -> " + r.status);
    return r.json();
  };

  function b64bytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  PF.f32 = (b64) => new Float32Array(b64bytes(b64).buffer);
  PF.u8 = (b64) => b64bytes(b64);
  PF.mm = function (b64) {
    // uint16 millimetres -> Float32Array metres
    const u16 = new Uint16Array(b64bytes(b64).buffer);
    const out = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) out[i] = u16[i] / 1000;
    return out;
  };

  // Tile cell <-> lon/lat using the four corners (TL, TR, BR, BL); bilinear forward,
  // affine inverse (the tile is a 1.28 km UTM square, so this is sub-metre accurate).
  PF.cellToLonLat = function (corners, r, c) {
    const u = (c + 0.5) / PF.N, v = (r + 0.5) / PF.N;
    const [tl, tr, br, bl] = corners;
    const top = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u];
    const bot = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];
    return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
  };
  PF.lonLatToCell = function (corners, lon, lat) {
    const [tl, tr, , bl] = corners;
    const ax = tr[0] - tl[0], ay = tr[1] - tl[1], bx = bl[0] - tl[0], by = bl[1] - tl[1];
    const dx = lon - tl[0], dy = lat - tl[1];
    const det = ax * by - ay * bx;
    const u = (dx * by - dy * bx) / det, v = (ax * dy - ay * dx) / det;
    return [v * PF.N - 0.5, u * PF.N - 0.5];
  };

  // depth colour ramp (matches api/render.py)
  const STOPS = [0.05, 0.15, 0.305, 0.6, 1.0, 2.0];
  const COLS = [[165, 230, 255], [96, 196, 255], [38, 132, 255], [24, 80, 220], [52, 30, 170], [90, 10, 120]];
  PF.depthColor = function (h) {
    if (h <= STOPS[0]) return COLS[0];
    for (let i = 1; i < STOPS.length; i++) {
      if (h <= STOPS[i]) {
        const t = (h - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1]);
        return COLS[i - 1].map((a, k) => a + (COLS[i][k] - a) * t);
      }
    }
    return COLS[COLS.length - 1];
  };
  PF.fmtFt = (m) => (m / PF.FT).toFixed(m / PF.FT < 10 ? 1 : 0) + " ft";
})();
