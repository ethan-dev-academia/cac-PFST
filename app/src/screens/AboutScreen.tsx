import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useStore } from "../store";
import { C } from "../theme";
import { Card, Icon, IconName, Pill, SectionTitle, T } from "../ui";

const STEPS: { icon: IconName; t: string; d: string }[] = [
  { icon: "layers-outline", t: "Real terrain", d: "2018 SWFWMD lidar for Pasco, resampled to 10 m cells in 1.3 km tiles. Building pads, ponds and canals are in the ground model." },
  { icon: "rainy-outline", t: "Design storms and surge", d: "NOAA Atlas 14 24-hour rainfall (2- to 100-year) and the Helene storm tide recorded at Clearwater Beach, rescaled to any height." },
  { icon: "water-outline", t: "Physics, then AI", d: "A 2D shallow-water solver floods each tile. A neural operator trained on thousands of those runs answers in a second, with a 30-member ensemble for the uncertainty band." },
];

export function AboutScreen() {
  const st = useStore();
  return (
    <ScrollView contentContainerStyle={s.body}>
      <View style={{ gap: 6 }}>
        <Text style={T.kicker}>ABOUT</Text>
        <Text style={T.h1}>Pasco Flood Screening Tool</Text>
        <Text style={T.body}>Pasco committed $235 million to flood mitigation with a five-year deadline. This tool shows where water collects in design storms and surge, and which projects remove the most of it per dollar.</Text>
      </View>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name={st.backend === "fno" ? "flash" : "hourglass-outline"} size={20} color={st.backend === "fno" ? C.ok : C.warn} />
        <View style={{ flex: 1 }}>
          <Text style={T.h3}>{st.backend === "fno" ? "Neural operator online" : "Running on the physics solver"}</Text>
          <Text style={T.small}>{st.backend === "fno" ? "Scenarios return in about a second." : "The trained model isn't installed yet, so each scenario takes about two minutes. Results are cached."}</Text>
        </View>
        <Pill label={st.apiOk === false ? "offline" : st.backend} color={st.apiOk === false ? C.bad : st.backend === "fno" ? C.ok : C.warn} />
      </Card>

      <SectionTitle title="How it works" />
      {STEPS.map((x) => (
        <Card key={x.t} style={{ flexDirection: "row", gap: 12 }}>
          <Icon name={x.icon} size={22} color={C.accent} />
          <View style={{ flex: 1, gap: 3 }}><Text style={T.h3}>{x.t}</Text><Text style={T.small}>{x.d}</Text></View>
        </Card>
      ))}

      <SectionTitle title="Reading the map" />
      <Card style={{ gap: 10 }}>
        {[["rgba(76,195,255,0.8)", "Coastal low-lying", "Ground mostly under 10 ft and open to the Gulf: surge and rain."],
          ["rgba(64,110,255,0.8)", "Low-lying inland", "Ground mostly under 10 ft: rain collects here first."],
          ["rgba(150,190,140,0.6)", "Higher ground", "Modeled on demand; flooding is local to ponds and low streets."]].map(([c, t, d]) => (
          <View key={t} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c, marginTop: 2 }} />
            <View style={{ flex: 1 }}><Text style={T.h3}>{t}</Text><Text style={T.small}>{d}</Text></View>
          </View>
        ))}
      </Card>

      <SectionTitle title="Limits — please read" />
      <Card style={{ gap: 6 }}>
        {["Screening-grade: it ranks neighborhoods for full engineering study; it does not replace one.",
          "Storm drains and pipes are not modeled, so depths lean high where drainage is good.",
          "Each run covers a 1.3 km square centred on your point; water arriving from far outside it is not included.",
          "A home is counted as flooded when its 10 m lidar cell has more than 1 ft of water at the peak."].map((t) => (
          <View key={t} style={{ flexDirection: "row", gap: 8 }}><Text style={{ color: C.warn }}>•</Text><Text style={[T.small, { flex: 1 }]}>{t}</Text></View>
        ))}
      </Card>

      <SectionTitle title="Data" />
      <Text style={T.small}>SWFWMD 2018 Pasco lidar DEM · NOAA Atlas 14 · NOAA tide gauge 8726724 · FEMA National Flood Hazard Layer · Pasco County building footprints, address points and observed-flooding records · SWFWMD watershed model flood areas · USGS high-water marks (validation).</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({ body: { padding: 18, gap: 12, paddingBottom: 40 } });
