import { View } from "react-native";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { Group, Header, Row, Segmented, Txt } from "../ui";

export function AboutScreen() {
  const st = useStore(); const t = useTheme();
  const ready = st.backend === "fno";
  const mi = st.modelInfo;
  const maeIn = mi?.test?.mae_m != null ? Math.round(mi.test.mae_m * 39.37) : null;
  const iouPct = mi?.test?.iou_1ft != null ? Math.round(mi.test.iou_1ft * 100) : null;
  const accuracy = maeIn != null
    ? `Trained on the full simulations, then checked against ones it never saw: typically within ${maeIn} inch${maeIn === 1 ? "" : "es"} of depth${iouPct != null ? `, agreeing on about ${iouPct}% of the flooded area` : ""}.`
    : "A model trained on the full simulations reproduces them in about a second.";
  return (
    <View style={{ gap: 22 }}>
      <Header title="Settings" back="Back" onBack={() => st.set({ tab: st.openPlaceId ? "home" : "home" })} />

      <Group title="Appearance">
        <View style={{ padding: 12 }}>
          <Segmented value={st.appearance} onChange={(v) => st.set({ appearance: v })}
            options={[{ value: "system", label: "Automatic" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </View>
      </Group>
      <Group title="Map">
        <View style={{ padding: 12 }}>
          <Segmented value={st.mapStyle} onChange={(v) => st.set({ mapStyle: v })}
            options={[{ value: "streets", label: "Streets", icon: "map-outline" }, { value: "satellite", label: "Satellite", icon: "earth-outline" }]} />
        </View>
      </Group>

      <Group title="Status">
        <Row icon={ready ? "flash" : "time"} iconBg={st.apiOk === false ? "#FF3B30" : ready ? "#34C759" : "#FF9500"}
          title={st.apiOk === false ? "Can't reach the flood service" : ready ? "Fast results" : "Detailed results"}
          subtitle={st.apiOk === false ? "Check your connection, or that the server is running." : ready ? "Answers in about a second." : "Each storm takes about two minutes to simulate. Results are saved, so you only wait once."} />
      </Group>

      <Group title="How it works">
        {ready && <Row icon="flash" iconBg="#34C759" title="Instant answers" subtitle={accuracy} />}
        <Row icon="layers" iconBg="#5E5CE6" title="Real ground" subtitle="The county's 2018 laser survey, at 10 m detail, with building pads, ponds and canals." />
        <Row icon="rainy" iconBg="#007AFF" title="Real storms" subtitle="NOAA rainfall statistics for Pasco, and the storm tide Helene brought to Clearwater in 2024." />
        <Row icon="water" iconBg="#32ADE6" title="Water physics" subtitle="We simulate water flowing across the ground minute by minute, then take the deepest it gets." />
        <Row icon="analytics" iconBg="#AF52DE" title="Ranges, not guesses" subtitle="Each answer is re-run with different rain, surge and ground heights to show a likely range." />
      </Group>

      <Group title="Limits" footer="This is a screening tool: it shows where to look first. It's not a substitute for an engineering study or official FEMA maps.">
        <Row icon="warning" iconBg="#FF9500" title="Storm drains aren't included" subtitle="Where drainage is good, real flooding is usually less than shown." />
        <Row icon="scan" iconBg="#8E8E93" title="One area at a time" subtitle="Each check covers 1.3 km around a point. Water from much farther away isn't included." />
        <Row icon="home" iconBg="#8E8E93" title="Depth at the building" subtitle="A home counts as flooded when more than a foot of water reaches its spot on the map." />
      </Group>

      <Group title="Data">
        <Row title="Ground" value="SWFWMD lidar, 2018" />
        <Row title="Rainfall" value="NOAA Atlas 14" />
        <Row title="Surge" value="NOAA gauge 8726724" />
        <Row title="Flood zones" value="FEMA NFHL" />
        <Row title="Buildings & addresses" value="Pasco County" />
      </Group>
      <Txt v="footnote" color="label3" center>Pasco Flood Check</Txt>
    </View>
  );
}
