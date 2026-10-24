// Plain-language risk: depth at the building pad -> level, colour, meaning, actions.
import { C } from "./theme";

export interface Level { key: string; label: string; color: string; short: string; meaning: string }

export const LEVELS: Level[] = [
  { key: "minimal", label: "Minimal", color: C.ok, short: "Stays dry",
    meaning: "The model keeps water off the building pad. Streets and yards nearby may still pond." },
  { key: "low", label: "Low", color: "#9be27a", short: "Under 6 in",
    meaning: "A shallow film of water at the pad — usually below the slab of a raised house, but garages and low entries can take water." },
  { key: "moderate", label: "Moderate", color: C.warn, short: "6 in – 1 ft",
    meaning: "Ankle- to shin-deep at the pad. Slab-on-grade homes are likely to take water inside." },
  { key: "high", label: "High", color: "#ff8a4c", short: "1 – 2 ft",
    meaning: "Knee-deep at the pad. Expect interior flooding, damaged floors, drywall and HVAC." },
  { key: "severe", label: "Severe", color: C.bad, short: "Over 2 ft",
    meaning: "Waist-deep or more. Dangerous to stay — water this deep moves cars and can trap people." },
];

export function levelFor(ft: number | null | undefined): Level {
  if (ft == null) return LEVELS[0];
  if (ft < 0.1) return LEVELS[0];
  if (ft < 0.5) return LEVELS[1];
  if (ft < 1) return LEVELS[2];
  if (ft < 2) return LEVELS[3];
  return LEVELS[4];
}

export const SCENARIOS = [
  { key: "10", title: "10-year storm", sub: "7.2 in of rain in 24 h · 10% chance each year", body: { return_period: 10 } },
  { key: "100", title: "100-year storm", sub: "13.3 in of rain in 24 h · 1% chance each year", body: { return_period: 100 } },
  { key: "helene", title: "Helene-scale surge", sub: "7.6 ft storm tide, as at Clearwater in Sept 2024", body: { return_period: 2, surge_ft: 7.62 } },
] as const;

export function femaText(f?: { zone: string | null; sfha: boolean; bfe_ft: number | null } | null) {
  if (!f || !f.zone) return { title: "FEMA zone unavailable", body: "The FEMA flood map service did not answer for this point." };
  if (f.zone.startsWith("V")) return { title: `FEMA zone ${f.zone} — coastal high hazard`, body: `Wave action is expected in a 1% storm${f.bfe_ft ? `; base flood elevation ${f.bfe_ft} ft` : ""}. Flood insurance is required with a federally backed mortgage.` };
  if (f.zone.startsWith("A")) return { title: `FEMA zone ${f.zone} — special flood hazard area`, body: `1% annual chance flood zone${f.bfe_ft ? `; base flood elevation ${f.bfe_ft} ft` : ""}. Flood insurance is required with a federally backed mortgage.` };
  return { title: `FEMA zone ${f.zone} — outside the 1% floodplain`, body: "Moderate-to-low risk on FEMA's map. About a quarter of NFIP claims come from zones like this, and insurance here is usually cheaper." };
}

export const ACTIONS = {
  everyone: [
    { t: "Sign up for Alert Pasco", d: "County emergency alerts by text, call or email." },
    { t: "Know your evacuation zone", d: "Pasco zones A–E are set by surge risk; check yours before hurricane season." },
    { t: "Photograph your belongings", d: "A quick video of every room makes insurance claims much faster." },
  ],
  wet: [
    { t: "Get flood insurance now", d: "Homeowners policies exclude flood, and NFIP policies take 30 days to start." },
    { t: "Raise what matters", d: "Lift the water heater, HVAC, outlets and valuables above the depth shown here." },
    { t: "Plan where the car goes", d: "Six inches of moving water can stall a car; know a nearby high spot to park." },
  ],
  severe: [
    { t: "Leave early when told", d: "At this depth sheltering in place is not safe. Plan a route to higher ground." },
    { t: "Ask about mitigation grants", d: "FEMA FMA/HMGP grants can fund elevating or flood-proofing homes in repetitive-loss areas." },
  ],
};
