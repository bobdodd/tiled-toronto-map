# Multi-level transit — representing the vertical dimension

**Status:** picking up 2026-06-21 (LOD optimization done). Decision REVISED to a
**single level model ("B") for ALL vertical depth** — below / **surface
(pedestrian-primary default)** / above — NOT the earlier A/B hybrid. "A"
(same-view depth styling) is DROPPED. See "Decision" below. Two facets:
**(1) vertical depth** (this doc's level model) and **(2) obscuring overlays**
(facet C — a feature drawn over its own contents, e.g. the TMU campus polygon;
different fix, see ROAD_RENDERING/this doc's facet-C section).

## Level model — IMPLEMENTED v1 (2026-06-21)

Shipped and live. The vertical stack (Bob, top → bottom): **Gardiner (elevated road)
+1 / surface 0 (default) / PATH −1 / subway-LRT −2**. PATH sits ABOVE the subway.

- **Classifier `_plane_for` (build-tiles.py)** maps each feature to one of four
  planes by PEDESTRIAN RELEVANCE + type, not raw OSM `layer`. Real Toronto signals
  (verified in the PBF): subway = `railway=subway/light_rail` + `tunnel` (`layer`
  −2/−3); Gardiner = `highway=motorway*` + `bridge`/`layer≥1`. A walkable footbridge
  at `layer=1` stays SURFACE (it's the pedestrian's path); only the car-only elevated
  deck goes above.
- **PATH = NETWORK IDENTITY, not depth (corrected 2026-06-21, Bob).** The Toronto
  PATH is a *branded* pedestrian network — an OSM `route=foot` relation
  (`r5441759`, `ref=PATH`, wikidata Q917121) bundled by a `superroute`. It is NOT
  "any underground footway": `name=PATH` ways span tunnels (152), at-grade (19),
  level 1–2 (29) and bridges (6) — one network across all depths. The FIRST cut
  keyed off "underground footway → path", which (a) wrongly grabbed station
  UNDERPASSES (underground footways that aren't the PATH) and (b) MISSED at-grade
  PATH segments. Fixed: the handler (`osm_tile_processor.OSMHandler`) collects the
  PATH relation's member way/node ids (`relation()` + `mark_path_members()`), and a
  feature is on the PATH plane iff it's a relation member OR `name=PATH`. The
  relation also lists the PATH's entrance + amenity nodes, so PATH POIs come from it
  too (not an "underground POI" heuristic). Audited on the core: 226 name=PATH → all
  path; 13 at-grade PATH → path; 112 non-PATH underpasses → surface; 95 PATH member
  POI nodes → path.
- **Generator** tags each off-surface feature group with `data-level`
  (path/subway/above). SURFACE (~97%) is left UNTAGGED — absence means surface — so
  the common case adds no bytes (city set stayed 34.5 MB).
- **Viewer = one tile set, filtered by level** (chosen over separate overlay tile
  sets — non-surface is sparse, so filtering reuses the whole pipeline). A radiogroup
  switcher (`LevelSwitch.js`, "Map level" accordion section, street level default)
  sets `data-active-plane` on `#map-tiles`. CSS shows the active plane, hides the
  other off-surface planes, and **ghosts the street level** (opacity .28,
  `pointer-events:none`) as non-interactive orientation context. The rotor scopes
  keyboard nav to the active plane (`data-level` === active), and the switch is
  announced. Pure-CSS show/hide so it governs async-loaded tiles too.
- **Active-plane PROMINENCE (2026-06-21, Bob on the PATH).** A thin underground
  footway is invisible against the dimmed base, so when its plane is selected an
  off-surface feature renders as a **bold cased route with a clear-space halo, drawn
  OVER the ghosted base** — an overlay that exposes it. The generator stacks, on each
  off-surface LINE, a wide light **halo** (clear-space moat) + a dark **casing** under
  a bold coloured **line** (`.level-halo` 18px / `.level-casing` 10px / `.level-line`
  6px, constant-screen; per-plane colour: PATH blue, subway purple, Gardiner orange);
  AREAS get a solid prominent fill + edge (`.level-area`). Off-surface features ride
  a new **top z-tier** (`_LAYER_TIER` 'levels' = 4) so the halo clears the base
  beneath. GOTCHA fixed: 133/171 PATH segments are `man_made` (PATH bridges/passages),
  and `g.man_made` (+`g.railway` for subway) is in the non-text-contrast grey-boundary
  `:is()` list — it was painting the `level-line` `#5f5f5f`, beating the colour. Fix:
  carve `:not(.level-*)` out of BOTH the normal and high-contrast boundary rules (and
  the dark catch-alls). Verified via headless computed-style (all 171 lines the right
  colour) before the full render.
- **Underpasses — surface annotation, NOT a plane (Bob, 2026-06-23).** Non-PATH
  underground pedestrian connections (station underpasses, ped tunnels; ~1029
  city-wide) stay on the SURFACE as a **dotted slate-blue annotation, shown by
  default, with their own filter** — Bob's call, lighter than a 5th plane. Built as
  an **"annotation"-layer overlay** (taxonomy `underpass` category + `underpasses`
  feature matching underground footway/steps/corridor/path): the footway keeps
  `base=road`, the generator STRIPS the overlay from PATH (`plane != surface`) so the
  PATH is never mis-tagged as an underpass, the line is `.underpass-line` (dotted,
  carved out of the grey-boundary + dark catch-alls), casing suppressed. FilterManager
  gained an `isHideShow()` so `base` AND `annotation` layers hide/show + default ON.
- **Underground parking — own OFF-by-default filter (Bob, 2026-06-23), DONE.** ~1045
  city-wide, **97% nodes**, `amenity=parking` + `parking=underground`. Its own base
  category `underground_parking` (so it can hide by default, unlike surface parking),
  off by default via a new `ui.default:"off"` + FilterManager `isDefaultOff()`,
  parking-blue `.ugparking` style. Load-bearing fix: a base-layer POINT zero-extents
  to `min_zoom` 99 (culled) — un-culled for the `underground_parking` category ONLY
  (un-culling all base points would flood trees/gates). Live: filter present, 170
  groups hidden by default.
- **Surface stays FULL BRIGHTNESS behind an overlay plane — RESOLVED (Bob,
  2026-06-23): do NOT dim it.** The earlier build dimmed the street level to ~28%
  while a sub/above plane was active; Bob rejected that (for the Gardiner AND the
  PATH). Removed (CSS-only). The active overlay still reads against the full map
  purely via its clear-space HALO + top z-tier, not by dimming everything else. The
  accessibility "one clean plane at a time" still holds because the ROTOR is scoped
  to the active plane (keyboard explore), which is independent of any visual dimming.
- **OPEN / refinements**: road tunnels (car, non-rail) currently fall to surface —
  revisit; multi-depth subway (layer −3) all collapses to one subway plane; a
  visible on-map level indicator / vertical switcher (vs the accordion control) is a
  possible UX upgrade; AT pass (NVDA/VO exploring the PATH + the announcements) is
  Bob's to judge.

## The problem

The map has rail transit, much of it **underground** (subway, LRT) — plus the
**PATH** pedestrian network below ground, and elevated structures (elevated rail,
the Gardiner, bridges). A 2D map flattens all of that onto one plane, which gives
two distinct problems:

1. **Visual clutter** — underground lines are drawn over surface streets and
   buildings, layers stacked on each other.
2. **Explore ambiguity (the accessibility half)** — where a subway runs *under* a
   street, focus / explore-by-touch / pointer at that spot lands on two features
   at the "same" place but different depths. For a screen-reader or touch user
   that's genuinely confusing: *which one am I on?*

## Why Toronto makes this worth doing properly

Bob (2026-06-20): Toronto has a subway **and** an LRT system **and** the PATH —
"outside of somewhere like London, it is one of the most impacted cities in terms
of complex transit systems." A single decluttered view would always be a
compromise here; the city genuinely has multiple occupied planes.

## Current state (what the code does today)

- `railway` is a plain `base` category, rendered as a **solid line**, identically
  whether it's a surface streetcar track or a subway 20 m underground.
- The generator **never reads** OSM `tunnel` / `layer` / `level` / `bridge` tags,
  so it has no notion of a feature's depth — it paints everything on one plane.
- Idiom already present to reuse: underground **parking** renders dashed + lighter
  (`build-tiles.py`, the parking `underground` style, dasharray `3,2`). Depth-
  distinct styling is therefore already in the vocabulary; it was just never
  applied to rail.

## Decision — a single level model; pedestrian surface is the default plane

REVISED 2026-06-21 (Bob). Earlier this was an A/B hybrid (level model for deep
transit, same-view distinct styling for elevated roads). **Dropped.** Elevated
ROADS go on a plane too — because for a *pedestrian/transit* map the elevated car
deck is the LESS important thing at that spot, and drawing it on the surface (even
styled) clutters/obscures what matters: the ground road beneath. Bob's case: the
**Gardiner** (elevated motorway) runs over **Lake Shore Boulevard**, and Lake
Shore is the important one here — it has the sidewalks and signalled crossings; the
Gardiner is a motor-vehicle thing, important only if you're driving. So:

**One level model for ALL vertical depth — below / surface / above — with the
PEDESTRIAN SURFACE as the primary default plane:**
- **Surface (default):** the at-grade pedestrian/transit world — ground roads,
  sidewalks, crossings, Lake Shore, etc. Kept clean and uncluttered (that's the
  map's job). This is what loads by default.
- **Below:** subway/LRT tunnels, the PATH (switch down).
- **Above:** the Gardiner and other elevated car infrastructure (switch up;
  matters for driving, not for walking/transit).

**The split is by PEDESTRIAN RELEVANCE, not raw OSM `layer`.** A separate car-only
deck (Gardiner, elevated motorway) → the *above* plane. A footbridge, or a street
overpass that carries sidewalks, *is* the pedestrian's path → it stays on
**surface**. So "elevated" → above-plane only when it's not part of the walkable
network.

Rotor/explore scope to the active plane and announce it ("underground, level −1" /
"elevated"). The prerequisite (read `layer`/`tunnel`/`level`/`bridge`) feeds the
plane assignment, combined with the pedestrian-relevance rule. (Option **C** —
underground as a filter toggle — was considered and set aside.)

## Facet 2 — obscuring overlays (e.g. the TMU campus) — DIFFERENT problem

A SECOND "layers" problem, not vertical depth (raised 2026-06-21). **Toronto
Metropolitan University** is one big `amenity=university` polygon with an opaque
fill painted OVER the streets, buildings and features inside it — hiding things
that are real and should stay explorable (parity). Fix is **z-order + fill +
semantics**, not height: a campus (or hospital grounds, a park, any large
"container" area) is a named *region*, not an opaque sheet. Render it as a
**labelled boundary with a transparent/very-light fill, drawn UNDER its contents**
so the streets/buildings within show through and stay navigable, and the campus
becomes a findable/announceable region ("Toronto Metropolitan University") without
eating the map. Generalisation idea again — a named area that aggregates, not
obscures. **This is facet "C" and the contained first win** (generator z-order/fill
change, maybe a rerender) — before the big level model.

### Facet C — IMPLEMENTED 2026-06-21 (pending full render + deploy)

Built in `build-tiles.py` + `web-app/styles/main.css`:

- **Explicit paint-order tiers.** Z-order used to be *accidental* — `create_tile_svg`
  appended each category layer in OSM encounter order, so a container area could
  land on top of its own streets. Layers now sort by an explicit tier
  (`_LAYER_TIER`: region 0 < base 1 < poi 2 < accessibility 3), derived from the
  taxonomy `layer` field, with a new **region** tier beneath everything. This alone
  fixes the whole "big polygon over its contents" class of bug (and makes POIs
  reliably sit over the base map).
- **Region detection (`_is_region`).** A region is a **base-less AREA** (no
  building/landuse geometry of its own) carrying an amenity
  university/college/school/hospital classification **anywhere — primary OR
  overlay**. The overlay check matters: TMU is `amenity=university` **+
  `wheelchair=yes`**, so its *primary* class is `mobility`, not `amenity` — checking
  only the primary missed it (it stayed an opaque green `#4CAF50` blob). Requiring
  `base is None` excludes university *buildings* that merely also carry the tag.
- **Treatment.** Region areas render in the region tier with a **faint fill
  (`#9aa0a6` @ 10% opacity) + a strong grey dashed boundary** (`.region-area`,
  non-scaling-stroke) so the streets/buildings inside show through, plus the
  **name drawn once** (`.region-label`, in the tile holding the geometry's
  representative point — no cross-tile dedup needed). Excluded from POI
  aggregation; gets a real extent-based `min_zoom` (a big campus shows to ~z13, a
  small school-grounds culls earlier), so it thins out by the same target-size rule
  as every other feature. The SVG clip-path means the dashed boundary only shows on
  the campus's TRUE perimeter, never on tile-cut edges.
- **Dark mode.** `.region-area` is excluded from the dark catch-alls (like
  `.road-hit`) and gets its own dark rule (faint light-grey fill + light boundary);
  `text.region-label` flips to light text + dark halo.
- **Verified** on a TMU-bbox smoke render (headless Chrome): the opaque green is
  gone, Gould/Church/Victoria streets + the university buildings + the quad
  greenspace + POIs all show through; TMU is a `region-area` with a centred label;
  z-order confirmed (region-area paints before roads/buildings).

### Design

- **Prerequisite (the unlock):** capture OSM `layer` / `tunnel` / `level` /
  `bridge` during the parse — currently ignored. Everything else depends on it.
- **Group features by level:** surface / −1 / −2 / … / elevated.
- **Viewer control to select the active plane** (exact surfacing — toggle vs
  dropdown vs level slider — is an open sub-question).
- **Rotor + explore scope to the active level**, and the level is **announced**
  ("underground, level −1"). One clean plane at a time → no depth ambiguity. This
  is the part that makes it an *accessibility* fix, not just a visual declutter.

### Don't lose the payload

For a disabled traveller the valuable thing is **not** the tunnel line — it's the
**stations and entrances** (which are *surface* features) and *is this entrance
step-free*. Whatever the level model does with the line, keep entrances prominent
and the **entrance → line** relationship intact. The line is context; the access
points are the payload.

> **TODO — entrances on BOTH levels (Bob, 2026-06-23, deferred).** Subway/rail
> entrances (`railway=subway_entrance`) and PATH entrances are the access points you
> reach FROM the street, so they must show on the **street level too**, not only on
> their overlay. The current model gives each feature ONE `data-level`, so an entrance
> classified onto `transit` (or `path`) vanishes from the default street view. The fix
> needs a **multi-plane** mechanism — a feature can declare more than one plane, or
> entrances are duplicated/tagged to render on `surface` *and* their overlay. Not yet
> built. (Related open tweaks: transit stops/stations cluster aggressively at hubs like
> Union — distinct only at lod22; and whether GO/VIA heavy rail sits on the transit
> overlay or the street.)

### Parity framing

Consistent with the project's core principle and the aggregation work: we are
**not dropping** underground transit, we are **re-representing it by depth** —
same information, clearer grain. See `feedback_map_feature_parity`,
`RENDERING_AT_SCALE.md`.

## Open sub-questions for design time

- How the level control surfaces (toggle / dropdown / slider), and whether
  surface stays visible with a sub-level distinctly overlaid, or planes are fully
  separate.
- The PATH fits the level model as a **below** plane (resolved). The Gardiner fits
  as an **above** plane (resolved 2026-06-21). Open: the exact pedestrian-relevance
  rule for which elevated roads go above vs stay surface.
- Interaction with the **LOD bands** — does each level carry its own LOD pyramid,
  or is level orthogonal to zoom?
- **Search** across levels — a result on a non-active level (settled search rule:
  selecting it should frame/zoom to show it, which would also switch to its
  level).
- How levels interact with the cross-type proximity **clusters** (cluster within a
  level, presumably).

## Sequencing

LOD optimization is done (Brotli + smoothness shipped 2026-06-20). Now:
1. **Facet C — obscuring overlays (TMU campus + grounds)** — DONE in code 2026-06-21
   (see "Facet C — IMPLEMENTED" above); full render + deploy in progress.
2. **The level model (facet 1)** — the big subproject: read `layer`/`level`/
   `tunnel`/`bridge`, assign each feature a plane by pedestrian relevance (below /
   surface-default / above), per-level tiles, a viewer plane-switch control, rotor
   scoping + announcement. Covers subway/LRT tunnels, the PATH (below), the
   Gardiner (above). Pedestrian surface is the default plane.
