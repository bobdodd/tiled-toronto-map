# Rendering information at scale

**Status:** the **m-rule** (capability culling, below) is adopted as the near-term
approach. **Generalization / aggregation** (the second half of this doc) is the
documented *opportunity* — the richer long-term direction, not yet built.
**Raised:** 2026-06-19.

## The problem

As you zoom out, the same screen covers more ground, so the number of features
that fall inside the viewport grows fast. Measured around downtown Toronto
(tangible base features in view):

| zoom | area in view | features in view |
|------|--------------|------------------|
| 18 (street) | ~1 tile | ~2,600 |
| 16 | ~16 tiles | ~30,000 |
| 15 (city) | ~64 tiles | **~86,000** |

That is both an **information-overload** problem (no user, sighted or otherwise,
can process 86,000 things) and a **performance** problem (parse + paint of
hundreds of thousands of DOM nodes).

## Two traps to avoid

1. **Show everything.** Honest but unusable — overload, and slow.
2. **Delete features by "significance."** Pick the important ones, drop the rest.
   This loses information, it's editorial (who decides a house doesn't matter?),
   and it breaks the project's core promise: a blind or low-vision user gets the
   **same rich map a sighted user gets**. See `feedback_map_feature_parity`.

The trap underneath both is assuming **there is only one way to render a given
piece of information** — that the only knobs are "draw this feature" or "don't."
There aren't. The *representation* can change with scale.

## Near-term: the m-rule (capability culling) — ADOPTED

Show no tangible shape that renders **smaller than a readable character** — the
size of a letter "m" in a tooltip (16 px / weight 600 today, so ~13 px). *If you
can read a character, you can read a shape*; below that, the shape is
imperceptible, so drawing it adds load and weight for zero information.

- Grounded in **user capability**, not editorial judgement. A feature's
  appear-at-zoom is simply the zoom at which its rendered extent crosses the "m"
  floor (area features by their bounding extent, line features by length).
- Tracks **magnification for free**: as a low-vision user magnifies, shapes cross
  the floor and appear exactly as they become perceivable.
- It's parity-true: it shows what's perceptible, the same as a sighted reader.

**What it buys (measured, 13 px floor):** city-zoom load drops ~86,000 → ~8,700
(≈10×); street zoom roughly halves. It cuts 39 % at z18 rising to 89 % at z15 —
more of it the further out you go.

**Its honest limitation:** it *hides* the imperceptible; it does not
*re-represent* it. So the count still grows with zoom-out (~6× across z18→15,
though decelerating) because a dense city view genuinely contains more
perceptible things than one street — real density, which a sighted reader sees
too. The m-rule manages overload and performance; it does not, by itself, give
constant cognitive load.

## The opportunity: generalization / aggregation

The cartographer's answer to scale is **generalization**: as you zoom out, fine
features don't vanish, they **merge into coarser features that carry the same
information at a grain the user can process**. Examples:

- hundreds of individual **buildings → a built-up / block area** ("dense
  residential block, ~200 homes");
- scattered **trees → woodland / parkland**;
- **parking spaces → a parking lot**;
- a **street grid → a neighbourhood with its arterial skeleton**;
- many **small water bodies → one generalized water feature**.

A sighted reader at city zoom already perceives the grey building-mass as "a
residential district," not 500 houses. Aggregation gives the blind/low-vision
user the **same** thing: one labelled, navigable feature — *"Residential
neighbourhood"* — instead of 500 imperceptible ones. Nothing is deleted; the
information is **re-grained**, not removed. This is what reconciles the two
principles at once:

- **Parity** — the user gets the same information a sighted reader gets at that
  scale (a district, not 500 houses).
- **Constant cognitive load** — a handful of aggregated features per viewport
  instead of tens of thousands.

The accessibility twist on classic generalization: **the aggregated
representations must themselves be first-class accessible features** — each with
its own aria-label, its own place in the rotor and in search, its own tangible
shape. "Built-up area" is not a styling layer; it is a feature the user can find,
focus, and be told about. Generalization here is an *accessibility* act, not a
visual one.

This is bigger than a performance tweak — it's a different way of authoring the
map per zoom band. It needs: a generalization model per category (how buildings
aggregate into blocks, trees into woodland, etc.), accessible naming for the
aggregates ("~200 homes" / "mostly low-rise"), and a tile pyramid that carries
the right representation per zoom. Out of scope for now; captured here so we
build toward it rather than hard-coding the "delete or keep" binary.

## Measured + shipped (A, 2026-06-19)

The tangible m-rule LOD is **live**: four bands (full + lod17/lod16/lod15), the
viewer switching band by zoom. On the dense downtown tile it culls tangible
shapes 2,491 → 287 and drops the tile 133 KB → 54 KB (~2.5×), ~3,371 → 1,458
nodes — a real win on heavy areas.

**But the build proved points are now the cap, and it's mostly addresses.** Of
the ~1,458 features left in that lod15 tile, only ~287 are shapes; the other
~1,170 are always-shown points — **503 of them address points**, plus benches,
food, and accessibility points. 500 house-numbers in one tile at whole-city zoom
is exactly the overload that shouldn't be *browsable* at that scale. So the
~2.5× is capped here until points get thinned — which is "B" below, and the
prime first target is **addresses** (searchable, so a high min-zoom — don't
render them at city scale).

## Measured + shipped (B — POI aggregation, 2026-06-20)

The **POI m-rule** is now live too: same-type points closer together than a
readable "m" can't be told apart, so they declutter per band at the m-**height**
as a ground distance for that zoom (~9 m at z18 → ~72 m at z15). Two treatments,
because points answer to different truths:

- **General POIs** (benches, shops, food, crossings, elevators, …) **aggregate**
  into one marker at the count-weighted centroid, named **"N {plural}"**
  (`"22 Shops"`, `"12 Signal-controlled crossings"`). Clustered by FULL
  classification (primary type + the overlay set), so accessible variants never
  fold into the plain type — `"3 Accessible toilets"` stays distinct from
  `"8 Toilets"`. The name MIRRORS `render_feature` (type first, then attribute
  labels), so an aggregate reads exactly like one of its members would, only
  counted + pluralised. Aggregates keep their type + overlay classes, so they
  stay filterable; they are display-only and NOT in the search index (you search
  an individual, which frames the zoom to show it — the settled search rule).
- **Addresses can't be summarised that way.** OSM carries them sparsely and
  non-consecutively (odd/even sides, representative points only), so a numeric
  **range or a count would be a false claim** (Bob, 2026-06-20: "merging those
  addresses produces false messaging"). Instead one **real** address — the
  **median by house number**, which by definition exists in the cluster (never an
  average that could invent a number nobody lives at) — is kept at its own
  location and the rest drop.

Clustering is an O(n) grid declutter (cell ≈ one "m"); for "collapse points
within an m of each other" it gives the same spaced-out set as pairwise
iterate-to-convergence, far cheaper. Implementation: `aggregate_pois` +
`_aggregate_type_phrase` + `_median_address` in `build-tiles.py`, run per band in
the tile loop alongside the tangible m-rule cull.

**Measured (densest downtown tile, full→z15):** bytes 148 KB → 57 KB (2.6×),
points 2,099 → 885, of which addresses 712 → 387; 166 aggregate markers stand in
for 612 source points. General POIs thin ~2.8×; **addresses only ~1.8×** because
median-keep at the literal m-height honestly keeps ~one real address per ~60 m of
street, and downtown has a lot of street-frontage. **Decision (Bob, 2026-06-20):
leave addresses at the m-height** — it is m-rule-honest (addresses 60 m apart ARE
distinguishable) and consistent with how tangible shapes are culled, rather than
giving addresses a coarser threshold or a search-only cutoff. So city zoom stays
address-dense by design; that is the real-density = parity principle, not a bug.
The bigger win is concentrated where the slowness was: the city-wide densest tile
drops 257 KB → 27 KB (9.5×) from z18 to z15. **Shipped + live 2026-06-20** (all 4
bands re-uploaded — the full band changed too, since POIs aggregate at z18 as
well; viewer + search unchanged).

**Felt result (Bob, 2026-06-20):** zoom-out is noticeably faster, *especially at
the lowest zoom with the most tiles* — what used to take "a count of 10" to
finish loading is now 3–4. Not instant, but much better.

## Stage 2 — cross-type proximity clustering (shipped 2026-06-20)

Stage 1 collapses same-type points; it does NOT touch points of DIFFERENT types
that sit within an "m" of each other. Measured on the deployed z15 downtown tile:
**98% of point markers were still in mixed-type clusters within one "m"** — the
worst a 57-marker stack carrying 55 distinct tooltips in a ~few-mm span. For
explore-by-touch / pointer, and for anyone with limited mobility or tremor, that
is an unhittable target field (Bob, 2026-06-20).

So a **second pass** clusters the surviving stage-1 markers by **proximity alone**
(the same m-distance, blind to type) into ONE marker per spatial group, carrying
an **accessibility-first summary tooltip** (Bob's choice from three rendered
options): the real access features a disabled traveller needs lead — by
**presence**, since counts are fuzzy once carried as overlays — then a coarse
roll-up of the rest WITH counts, then addresses by street, then "Zoom in to
separate them." The access set = everything in an `accessibility`-layer category
(facility / sensory / mobility / transport / **terrain**), MINUS the generic
`wheelchair=yes/no/limited` flags (attributes, not features, on nearly
everything). **Terrain attributes (lit, surface, smoothness, incline, width) ARE
kept** in the summary (Bob's call) even though they also render on the ways.

Key behaviours:
- **Coarse bands only (z17/16/15), never z18.** The full band keeps every
  individual, so "zoom in to separate them" has a real endpoint. As you zoom out
  the m-distance grows and clusters coarsen — the generalisation the doc
  anticipated, now serving target acquisition.
- One marker at the cluster centroid, class `cluster`, `data-aggregate` = total
  underlying features; display-only (NOT searched — you search the individual and
  the zoom-to-show dissolves the cluster). Filtering a cluster by its contents is
  left to the deferred filters-at-low-zoom question.

Real generated tooltip: *"Accessible features here: accessible toilets, tactile
paving, signal-controlled crossing, audio crossing signals, pedestrian crossings,
lit at night. Also 8 food, 4 transit, 3 shops, pharmacies, banks, attractions,
dentists, addresses on 4 streets. Zoom in to separate them."*

**Measured (densest downtown tile):** city-zoom markers **885 → 217** (z15), tile
57 KB → 32 KB, on top of stage 1; z18 unchanged (2,099 markers, 0 clusters).
Markers fall monotonically with zoom-out (2,099 → 926 → 526 → 217) — the
constant-load shape. Code: `cluster_proximity` / `_proximity_marker` /
`_proximity_tooltip` / `_coarse_theme` / `_compose_cluster_tooltip`, run per
coarse band after stage 1. **Open follow-ups:** a distinct VISUAL for cluster
markers (viewer-side — they're plain dots today; maybe a count badge); whether
clusters should be filterable by content; and this **deepens the search
open-question** (a cross-type cluster is even less a single searchable thing — it
only reinforces the settled rule: search the individual, the zoom-to-show
dissolves the cluster).

## Next lever — fewer tiles at low zoom (coarser grid per band)

Aggregation made each tile *lighter*; it did not make them *fewer*. The residual
latency at the lowest zoom is now dominated by tile **count**, not tile weight: a
city-wide z15 viewport still fetches ~64 of the 1 km (0.01°) tiles, each with its
own HTTP request, its own gunzip, and its own SVG boilerplate + DOM-parse pass.

The targeted, **parity-safe** fix is a **coarser tile grid on the coarse bands** —
e.g. lod15 uses 4 km tiles (a 4×4 merge of the 1 km grid) instead of 1 km. Same
features, same POI aggregation, just packaged into ~4 tiles for a city viewport
instead of ~64: ~16× fewer requests / gunzips / parse passes at exactly the zoom
that's slow, each tile only modestly bigger (aggregation already keeps coarse
tiles in the 27–57 KB range). Nothing is dropped — it's a packaging change.

- **For:** hits the actual low-zoom bottleneck (count); no feature loss; the
  band-switch reload already exists, so no new UX seam.
- **Against:** the generator must emit a different tile size per band, and the
  viewer's grid math (`coordsToTileId`, `getTilesForBounds`, `tileSize`) becomes
  per-band; a 4 km tile spans more, so a small pan near a boundary pulls a bigger
  tile.
- **Lighter complement (or alternative):** **prefetch a ring** of tiles just
  outside the viewport so they're cached before a pan/zoom reaches them — smooths
  the *feel* without changing the tile architecture.

Status: identified, **not built** — banked here at Bob's request (2026-06-20).
Reach for the coarser low-zoom grid first; it's aimed straight at the count.

**Related — extend the zoom-OUT range (Bob, 2026-06-20).** Bands stop at lod15
today; next rerender, add coarser bands BELOW it (lod14/13/…) so the user can zoom
further out to a regional view — sensible now that it's whole-city, and more so as
tile counts grow. Generator emits the extra bands (each more aggressively
m-rule-culled + aggregated); the viewer extends `LOD_BANDS` and lowers its
min-zoom. This pairs with the coarser-grid lever above (at very low zoom you want
fewer, bigger tiles AND heavier generalisation) and leans hardest on the
generalisation direction — at a regional scale "buildings" must already have
become neighbourhoods and "streets" arterials, or there's nothing legible to
show. Open: how far out to go, and what the coarsest band should render.

## POI aggregation — further work (Bob: "more to do yet", 2026-06-20)

Bob has flagged that POI aggregation is not finished; the next scope is his to
set. Loose ends that surfaced building the first cut (candidates, NOT yet a
committed plan):

- **Aggregates as first-class accessible features.** They carry aria-label +
  type/overlay classes + `data-aggregate`/count, and are display-only (excluded
  from search by design — you search an individual). UNVERIFIED: that they appear
  and read well in the **rotor**, and that focus/announcement of "22 Shops" works
  in VoiceOver/NVDA. The doc's own bar is that aggregates be navigable, not just
  labelled.
- **Clustering method.** Current is an O(n) **grid declutter** (cell ≈ one "m"),
  which approximates the pairwise iterate-to-convergence Bob first described.
  Swap to exact pairwise if the precise centroid/spacing turns out to matter.
- **The "m-height" value.** 8 px is a first guess for the readable-"m" height;
  tune against real perception / AT once seen in use.
- **Aggregate naming polish.** Aggregation surfaced verbose type labels
  ("Benches and rest areas") and long shared-attribute chains on crossings
  ("Signal-controlled crossings. Tactile paving, Audio crossing signals,
  Pedestrian crossings"). They MIRROR the individual labels (consistent), but may
  read heavily when counted; whether to shorten for aggregates is open.
- **Individual address-overlay noise.** Only *aggregate* names drop the redundant
  "Addresses" overlay; individual features (via `render_feature`) still append it
  ("…at 220 Yonge Street. … Addresses, Shops"). Possibly clean up individuals too
  — deliberately left untouched here to keep the change scoped.

## Target size (WCAG) — the interaction floor (next optimization, raised 2026-06-20)

Bob: the next optimization is the **WCAG target-size** requirement — and it needs
a *further* aggregation that takes in **both POIs and tangible items**.

**Reframe.** The m-rule is a *perception* floor (≥ a readable "m", ~13 px — can you
see it). Target size is an *interaction* floor (can you hit it). Since on this map
**everything is an interactive target** (each feature is a focusable `role="img"`
with a tooltip), the interaction floor is the binding one and it's larger than the
perception floor. So target size doesn't sit beside the m-rule — for interactive
elements it **raises the aggregation threshold and unifies POIs + tangibles** under
one rule: aggregate until every surviving target is big enough / far enough to hit.

**Threshold — OPEN, Bob's call:**
- **2.5.8 (AA, 24 px)** has the *spacing* exception — a small target passes if a
  24 px circle on it clears its neighbours. Maps directly onto aggregation (merge
  anything whose 24 px circles collide). Achievable on a map.
- **2.5.5 (AAA, 44 px)** has *no* spacing exception — literal 44 px targets; brutal
  on a dense map (a handful per city-zoom screen).
- **"Essential" exception** plausibly exempts a map (exact position *is* the
  information) — but the point is to do better than claim it.
- Lean: AA / 24 px-with-spacing as the real bar; enlarge markers to 24 px; document
  why literal AAA-44 isn't applied to the interactive map.

**Two levers, on the COMBINED target set:**
1. **Enlarge to the floor** — POI/cluster dots 10 px → the floor; thin roads get a
   padded hit *corridor* (a line is a generous target along its length; the issue
   is its width).
2. **Aggregate-to-space** — merge anything whose target circles collide, ACROSS
   types (a POI dot beside a tiny building both count → the pass runs on the
   combined set, not POIs and tangibles separately).

**Tangibles:** a shape bigger than the floor is already a fine target — leave it.
The biters are *small* shapes (< floor → merge into the block, the generalisation
move) and *thin* ones (roads → hit-corridor padding).

**To settle:** if the target-size floor (24 px) becomes the binding interactive
threshold, it likely REPLACES the 13 px m-rule for these elements (24 > 13, so
perception is auto-satisfied) — one threshold, not two overlapping passes.

Note keyboard/rotor has no target-size requirement (you tab, not aim) — this is
the pointer/touch concern, same user the stage-2 clusters started serving.

**SHIPPED + LIVE 2026-06-20.** Decisions (Bob): **24 px (AA)** floor; the target
floor REPLACES the perception m-rule for these (all-interactive) features — one
env-tunable `target_px` (default 24) now drives BOTH the tangible size floor
(min_zoom, was 13 px) and the POI spacing distance (stage 1 + stage 2, was 8 px).
**Stage 2 runs at EVERY band**, so aggregation became purely a function of zoom —
which forced (Bob's insight) extending the pyramid BOTH ways so individuals are
still inspectable: zoom IN past z18 and the 24 px floor covers less ground until
nothing merges (z22 ≈ individuals), zoom OUT and it merges to a regional skeleton
(z12). **The pyramid is now 11 bands, z22 → z12** (root stays z18); the viewer's
`LOD_BANDS` + the zoom clamp opened to 12–23. Measured live (densest downtown
tile): lod22 3414 targets / **2 clusters**, z18 1865 / 272, lod15 174 / 36, lod12
**6** / 2 — a clean zoom-driven gradient. 16,015 tiles / 29.7 MB. Deploy needed a
VIEWER push too (3 JS files to the a11ybob demo `src/`, served `max-age=0`).
**The visual half — markers DONE 2026-06-20 (viewer-side, no rerender).** Markers
now render at a constant 24 px SCREEN target at every zoom: `MapRenderer.updateViewBox`
sets `--target-r = 12 * 2^(18-zoom)` user-units (countering the viewBox scale) and
CSS `#map-tiles circle { r: var(--target-r) }` overrides the baked r=5; clusters
use `--cluster-r` (1.4×) to read as a group. One property set per zoom (no
per-element loop), and since the aggregation already spaced markers ≥24 px apart,
constant 24 px dots stay tangent. Deployed as 2 viewer files (MapRenderer.js,
main.css) — no tile rerender. **Still open:** road **hit-corridors** — a thin road
needs a wider HIT area than its visible stroke, which SVG can't do on one element,
so it's either a transparent fat-stroke clone added by the viewer at tile-load
(no rerender, small per-road cost) or baked into the tiles (a rerender). Markers
are the primary tap target; roads are secondary, so they're parked on that choice.

## Vertical dimension — multi-level transit (decided "B", deferred)

Underground / elevated transit (subway, LRT, the PATH, the Gardiner) currently
flattens onto one plane — clutter, plus explore ambiguity where a tunnel runs
under a street. Decision (Bob, 2026-06-20): the **level model** — group features
by level and switch between clean planes, with the rotor / explore scoped and
**announced** per level ("underground, level −1"). Chosen over cheaper depth-
styling / toggle options because Toronto (subway + LRT + PATH) is genuinely
multi-plane. Deferred until after the LOD optimization above. Full write-up:
**`docs/MULTI_LEVEL_TRANSIT.md`**.

## Open questions — LOD vs search / filters / rotor (raised 2026-06-19, for design)

The m-rule opens a new state: a feature can **exist** (in the data + the search
index) yet not be **rendered** at the current zoom (culled below the "m" floor).
Search, filters and the rotor each need a consistent answer for "exists but not
shown here." (Bob's questions, with an initial lean each — to settle tomorrow.)

1. **Search → a result not rendered at the current zoom.** *Settled (Bob):* the
   zoom level **adjusts to show the selected result** — the ordinary map
   behaviour of taking you to the thing you searched for, framed so you can see
   it. The LOD then takes care of itself: at a zoom that *shows* the feature it
   is, by definition, rendered and focusable. Search needs NO awareness of
   `min_zoom` or culling — it just does what selecting a result should always do,
   and the rendering follows. ("Show" ideally = frame the feature's extent: a
   large park frames wide, a shop frames at street level — not a fixed zoom.)
   (Today's `goToSearchResult` already crudely does this by zooming to 18 on
   select; the refinement is fit-to-feature rather than a fixed level.)

2. **Filters with no rendered content at the current zoom** (e.g. a buildings
   filter at city zoom where buildings are culled). *Lean:* prefer "tell the
   user it's empty here" over hiding the control — grey out (or annotate
   "appears when you zoom in"), re-evaluated per zoom. There's precedent: the
   rotor already announces "0 features navigable" for an empty selection.

3. **Rotor categories with no rendered features.** Same shape as filters; the
   viewport-only-focus model already produces "0 navigable," so greying would
   just pre-empt that.

**Bridge:** the per-feature `min_zoom` is the connective tissue — every system
can ask "at what zoom does this render?" And note that **aggregation (the B
direction) partly dissolves all three**: when culled detail is re-represented as
an aggregate ("residential block"), that aggregate IS rendered, searchable,
filterable, and in the rotor — the information isn't absent, it's re-grained. The
m-rule (hide) makes these questions sharp; generalization (re-represent) softens
them. So we may want to settle the interim answers now and revisit once
aggregation exists.

## POIs are separate

Points of interest (washrooms, crossings, benches, accessible features) are
**information attached to a location, not shapes perceived by size** — the m-rule
doesn't apply. They're an information-**density** question (how many points of
interest is the right amount per viewport, and how do they cluster/aggregate),
and they get their own design pass. See `feedback_map_feature_parity`.
