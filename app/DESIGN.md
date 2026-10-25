# Design habits

Rules every screen follows. If a change breaks one, change the change, not the rule.

## 1. Answer first, numbers second
Every result opens with one sentence a person could repeat to a neighbour: *"Your home stays dry in a 100-year storm."* Depths, ranges and methods come after, smaller.

## 2. Plain words in the main UI
- **Never in primary UI:** tile ids, datums (NAVD88), percentiles (p10/p90), model names, cell coordinates, backend names.
- **Use instead:** "above sea level", "likely range", "the area around this address", a neighbourhood name.
- Technical detail lives behind a **How we got this** disclosure.

## 3. Follow the platform
| | Mac / desktop | iPhone |
|---|---|---|
| Layout | Sidebar + map, like Maps/Mail | Full-screen map with a bottom sheet (peek / half / full), like Apple Maps |
| Input | Hover states, pointer cursor, ⌘K to search, Esc to go back | 44 pt targets, swipe the sheet, haptics on commits, safe areas |
| Type | System font (SF), 13–15 pt body | System font (SF), 17 pt body, large titles |

Both follow the system light/dark setting (overridable in Settings).

## 4. Calm surfaces, colour only for meaning
- **Neutrals everywhere else.** Colour is reserved for:
  - the **risk scale** (always the same five steps: *Dry, Low, Moderate, High, Severe*);
  - the **one primary action** per view (system blue).
- **Never colour alone.** Every risk colour comes with its word.

## 5. One primary action per view
- Each view has one filled button. Everything else is a plain row, a link, or a secondary (tinted) button.
- Destructive actions sit at the bottom, in red text, and ask to confirm.

## 6. Honest waiting
If something takes time:
- say what's happening, in human terms;
- show progress;
- let people leave. Work continues and results are saved.

Never block the whole UI with a spinner.

## 7. Uncertainty as a range
*"Likely 0.4–1.1 ft"*, drawn as a band on a ruler with the 1 ft "water inside most homes" line marked. Never "p10/p90".

## 8. The map serves the task
- **Layers:** extra layers are off by default; each view turns on only what it needs.
- **Basemap:** follows the appearance (light streets / dark streets); satellite is one tap away.

## 8b. Show the water, not just the numbers
Flooding is a visual story. Every result offers **Watch it flood**:
- a full-screen view with the panels hidden;
- the storm played hour by hour in 3D or on the map;
- buildings turning orange, then red, as the water reaches them;
- a live count of homes with 1 ft+ of water.

The "See it in action" gallery puts finished, real-street floods one tap away. Numbers support the picture; they don't replace it.

## 9. Spacing and type
- **Spacing:** a 4 pt grid (8, 12, 16, 24 between groups).
- **Grouped lists:** iOS-style inset groups (rounded, hairline separators) on both platforms.
- **Type scale:** Large title, Title, Headline, Body, Subhead, Footnote. No ad-hoc sizes.

## 10. Accessible by default
- AA contrast in both themes.
- Hit targets ≥ 44 pt on touch.
- Labels on icon-only buttons.
- No information only on hover.
