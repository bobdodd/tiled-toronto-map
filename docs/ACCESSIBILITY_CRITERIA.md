# Accessibility-significant features are first-class

**Status:** SIGNED OFF + IMPLEMENTED 2026-06-19. Bob approved the recommended
thresholds (below); all of these are now first-class overlay filters in a
single "Mobility & terrain" group, live on the tiled map. Surface, smoothness,
path width, kerb type, incline (incl. an up/down "direction noted" catch),
steps, lit, and signal-controlled vs uncontrolled crossings.
**Date raised:** 2026-06-18.

## Implemented thresholds (2026-06-19)

- **Incline** — gentle ≤5% / moderate >5–8.33% / steep >8.33% (ADA-AODA ramp
  max), `steep` keyword → steep band, plus `marked-incline` for `up`/`down`
  (Toronto has ~50 numeric inclines but 1,398 directional).
- **Surface** — firm {asphalt, concrete, paving_stones, …} vs rough {gravel,
  dirt, grass, **sett, cobblestone**, …}. sett/cobblestone are "rough" despite
  OSM calling them paved.
- **Smoothness** — good {excellent, good, intermediate} vs poor {bad and below}.
- **Width** — <0.9 m / 0.9–1.5 m / ≥1.5 m.
- **Kerb** — dropped/flush (crossable) vs raised (barrier), from `kerb=*`
  (7.2k features; the old `low-kerbs`/`kerb:height` rule was near-empty).
- **Crossings** — signal-controlled {traffic_signals, pedestrian_signals} vs
  uncontrolled {uncontrolled, unmarked, marked, zebra, …}.
- **Lit** — `lit=yes/automatic/dusk-dawn/partial`.

**Key implementation note:** these way-attributes use a dedicated `terrain`
category (layer=accessibility, so still a map overlay) that is DELIBERATELY
absent from the search index's POI category set — otherwise every asphalt road
(135k) would flood search. Node POIs (kerbs/crossings/steps) stay searchable.

## Principle

The map's taxonomy and its filters/rotor are driven by **accessibility
significance**, not by whatever the legacy UI happened to expose. A feature that
materially affects whether a disabled person can use a route or place is a
**first-class** feature: it gets a `taxonomy.json` entry, a filter, and a rotor
entry — even if the current UI never offered it.

This came up because Phase 2b step 2 authored the manifest by mirroring the 164
existing UI filter ids. That dropped things the old generator actually rendered
but the UI never filtered — most importantly **degree of slope**. Mirroring the
UI is backwards: the UI should mirror what matters.

## Worked example: slope / incline gradient

Degree of slope is decisive for **wheelchair users and people with limited
walking capacity** — a path that exists is not a path that is usable if it is
too steep. It also matters for blind/low-vision wayfinding (a steep grade is a
landmark and a hazard cue). So incline must be a first-class, *graded* filter,
not a single yes/no.

Proposed gradient bands (for sign-off — these are an accessibility design
decision):

| Band | Gradient | Rationale |
|------|----------|-----------|
| Gentle | ≤ 5% (≈ 1:20) | Generally self-propelled-wheelchair friendly; no handrail needed |
| Moderate | > 5% and ≤ 8.33% (≈ 1:12) | Up to the ADA/AODA ramp maximum; needs handrails, effortful |
| Steep | > 8.33% (> 1:12) | Exceeds ramp maximums; difficult or impassable for many |

The DSL already supports this — a range is multiple ops on one key:

```json
{ "id": "moderate-inclines", "category": "facility",
  "match": { "incline": { ">": 5, "<=": 8.33 } }, "subtype": "moderate_incline",
  "geometry": ["way"], "label": "Moderate inclines (5–8%)", "status": "implemented" }
```

`incline` is already collected by the generator, so these are `implemented`, not
`planned`. The current manifest has only `gentle-inclines`; **moderate** and
**steep** need adding, plus UI filters for all three.

**Limitations to handle:** OSM `incline` can be a percentage (`8%`), a ratio, an
angle in degrees, or a keyword (`up`/`down`/`steep`). The engine parses a leading
number, so `8%` works but `steep`/`up` do not — a keyword `incline=steep` should
map to the Steep band explicitly, and degree values need converting (`tan`) or a
separate rule. Decide how to treat keyword/degree inclines.

## Other accessibility-significant features to make first-class (audit)

Same logic applies beyond slope. Candidates a wheelchair/limited-mobility (and
blind/low-vision) user needs, which are not first-class filters today:

- **Surface** (`surface=*`) — paved vs gravel/grass/cobblestone; decisive for wheels.
- **Smoothness** (`smoothness=*`) — OSM's own accessibility-oriented grade.
- **Path width** (`width=*`) — can a wheelchair/mobility scooter pass.
- **Kerb height** (`kerb=*`, `kerb:height=*`) — partly present (`low-kerbs`); should be graded.
- **Steps & step count** (`highway=steps`, `step_count=*`) — step-free vs stepped routing.
- **Handrails** (`handrail=*` and side) — present in data; surface as a filter.
- **Crossing type** (`crossing=*`, `crossing:island`, signals) — partly present.
- **Tactile paving / audio signals** — present; keep first-class.
- **Lighting** (`lit=*`) — significant for low-vision night navigation.
- **Rest areas / benches** (`amenity=bench`) — present; relevant to limited-walking range.

## Next

1. Sign off the incline bands + thresholds above (and the keyword/degree handling).
2. Add `moderate-inclines` / `steep-inclines` (and refine `gentle-inclines`) to
   `taxonomy.json`; do the same for the other criteria as they're agreed.
3. Add the matching filters + rotor entries when the web-app reads the manifest
   (Phase 2b step 4). These should sit in a clear "Mobility & terrain" filter group.
