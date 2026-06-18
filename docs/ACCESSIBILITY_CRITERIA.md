# Accessibility-significant features are first-class

**Status:** requirement — needs sign-off on thresholds before baking into
`taxonomy.json` and adding UI filters (Phase 2b step 4 / Phase 4).
**Date raised:** 2026-06-18.

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
