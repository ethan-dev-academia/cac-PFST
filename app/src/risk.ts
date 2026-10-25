// Plain-language risk (DESIGN.md §1, §2, §7): depth at the building -> level, sentence, actions.
import { RISK_COLORS, Theme } from "./theme";

export type LevelKey = "dry" | "low" | "moderate" | "high" | "severe";
export interface Level { key: LevelKey; label: string; range: string; meaning: string }

export const LEVELS: Level[] = [
  { key: "dry", label: "Dry", range: "No water at the building",
    meaning: "Water stays off the building. Streets and yards nearby can still flood." },
  { key: "low", label: "Low", range: "Up to 6 inches",
    meaning: "A shallow film at the building. Raised homes usually stay dry inside; garages and low doorways may not." },
  { key: "moderate", label: "Moderate", range: "6 inches to 1 foot",
    meaning: "Ankle to shin deep. Homes built on a slab at ground level are likely to take water inside." },
  { key: "high", label: "High", range: "1 to 2 feet",
    meaning: "Knee deep. Expect water inside: floors, drywall, appliances and HVAC are at risk." },
  { key: "severe", label: "Severe", range: "Over 2 feet",
    meaning: "Waist deep or more. Dangerous to stay. Water this deep can float cars and trap people." },
];

export function levelFor(ft: number | null | undefined): Level {
  if (ft == null || ft < 0.1) return LEVELS[0];
  if (ft < 0.5) return LEVELS[1];
  if (ft < 1) return LEVELS[2];
  if (ft < 2) return LEVELS[3];
  return LEVELS[4];
}

export const riskColor = (t: Theme, key: LevelKey) => (t.dark ? RISK_COLORS.dark : RISK_COLORS.light)[key];

export function depthWords(ft: number) {
  if (ft < 0.1) return "stays dry";
  if (ft < 1) return `gets about ${Math.max(1, Math.round(ft * 12))} inches of water`;
  return `gets about ${ft.toFixed(1)} feet of water`;
}

export const SCENARIOS = [
  { key: "10", title: "Heavy storm", detail: "7 inches of rain in a day — about a 1-in-10 chance each year", body: { return_period: 10 } },
  { key: "100", title: "Severe storm", detail: "13 inches of rain in a day — about a 1-in-100 chance each year", body: { return_period: 100 } },
  { key: "helene", title: "Hurricane surge", detail: "A 7.6 ft storm tide, like Helene at Clearwater in 2024", body: { return_period: 2, surge_ft: 7.62 } },
] as const;

export function femaText(f?: { zone: string | null; sfha: boolean; bfe_ft: number | null } | null) {
  if (!f || !f.zone) return null;
  if (f.zone.startsWith("V")) return { title: `Coastal high-hazard zone (FEMA ${f.zone})`, body: "Waves are expected in a major storm. Flood insurance is required for most mortgages." };
  if (f.zone.startsWith("A")) return { title: `High-risk flood zone (FEMA ${f.zone})`, body: "FEMA expects flooding here in a 1-in-100 year flood. Flood insurance is required for most mortgages." };
  return { title: `Moderate-to-low risk zone (FEMA ${f.zone})`, body: "Outside FEMA's high-risk area, but about a quarter of flood claims come from zones like this. Insurance here is usually inexpensive." };
}

export const ACTIONS = {
  everyone: [
    { icon: "notifications-outline", t: "Sign up for Alert Pasco", d: "County emergency alerts by text, call or email." },
    { icon: "navigate-outline", t: "Know your evacuation zone", d: "Pasco sets zones A–E by surge risk. Check yours before hurricane season." },
    { icon: "camera-outline", t: "Record your belongings", d: "A quick video of each room makes insurance claims much faster." },
  ],
  wet: [
    { icon: "umbrella-outline", t: "Get flood insurance now", d: "Home insurance doesn't cover floods, and a flood policy takes 30 days to start." },
    { icon: "arrow-up-circle-outline", t: "Raise what matters", d: "Lift the water heater, HVAC, outlets and valuables above the depth shown here." },
    { icon: "car-outline", t: "Pick a high spot for the car", d: "Six inches of moving water can stall a car." },
  ],
  severe: [
    { icon: "walk-outline", t: "Leave early when told", d: "At this depth it isn't safe to stay. Plan your route to higher ground now." },
    { icon: "cash-outline", t: "Ask about mitigation grants", d: "FEMA grants can help pay to elevate or flood-proof homes that flood repeatedly." },
  ],
} as const;
