# Road rendering — hit-corridor, perceptibility, in-road street names

**Status:** IMPLEMENTED 2026-06-20; building + deploying. One generation pass (a
rerender), three parts. Raised when finishing target size — Bob: bake the road
hit, and "rendering of roads should never be a thin single line (hard to perceive
with low vision) PLUS it is time to add street names to the roads written inside
the roads like Google and Apple maps do. A larger piece of work than just the hit
size."

**Decisions (Bob, signed off on the downtown prototype):** centring **as-is**
(`dy="0.35em"` on the textPath — `dominant-baseline` is NOT honoured for
text-on-path, incl. Quick Look; see [[reference_tile_render_preview]]); labels
**per-segment** (no thinning); density **class-based** (the `_ROAD_LABEL_MIN_ZOOM`
map — motorway/trunk z13 … residential z17 … service z18). Implementation:
`render_feature` bakes a transparent `.road-hit` polyline + the `<text class=
"road-label"><textPath dy=0.35em>` per qualifying road; viewer `main.css` gives
`.road-hit` a non-scaling 24px transparent stroke (pointer-events:stroke; the
visible stroke is pointer-events:none), pins road+casing strokes to
`vector-effect:non-scaling-stroke` (never hairline), and styles `.road-label`
(constant-screen via `--label-size`, white non-scaling halo). `MapRenderer.updateViewBox`
sets `--label-size = 13*2^(18-zoom)`. Deploy needs the viewer too (main.css +
MapRenderer.js), like the marker work. Verified the production look via a
viewer-CSS wrapper rendered in headless Chrome before the city build.

## Part 1 — hit-corridor (the target-size finish, 2.5.8)

A road's hit area = its visible stroke on a single SVG element, so a thin road is
a thin target. Bake a **transparent ~24 px hit-stroke per road** (`pointer-events:
stroke`, under/over the visible one) and keep it a constant 24 px on SCREEN via the
viewer (the same `--target-r`/scale trick, applied to a `--road-hit-w` stroke
width). It carries the road's focus + tooltip. Chosen over the viewer-clone option
(cleaner structurally; accepted the rerender since parts 2 + 3 force one anyway).

## Part 2 — roads never hairline (low-vision perceptibility)

The visible stroke scales with zoom, so roads thin to a hair when zoomed out. Pin
the visible stroke to a **minimum constant screen width** (a perceptibility floor —
the line equivalent of the m-rule). Likely `vector-effect: non-scaling-stroke` plus
a min width, or a viewer-driven width var. Keeps roads legible at every zoom.

## Part 3 — in-road street names (the subproject)

Apple/Google render the name ALONG the road centreline. Decisions:

- **Density by zoom = the LOD principle.** Can't label every road at every zoom
  (overlap + overload). A road shows its name only at the bands where it's
  prominent enough — arterials labelled when zoomed out, residential only when
  zoomed in — so labels self-thin per viewport like every other layer. **Lean:**
  key it on road class (motorway/trunk/primary low, secondary/tertiary mid,
  residential/service high). DECISION OPEN (Bob): the density rule + whether ALL
  named roads eventually get a label or only certain classes.
- **Placement & readability.** SVG `<text><textPath href="#roadpath">` along the
  road's path (the path needs an id); repeat along long roads (Apple/Google style);
  **flip so text is never upside-down** (reverse the path or use side="…" when the
  segment runs right-to-left); **constant screen size** (non-scaling); **white halo**
  (paint-order stroke) for AAA contrast against the soft map fills, invert-safe
  (grey/white halo, not coloured).
- **Accessibility.** The road `<g role="img" aria-label="King Street">` already
  announces the name → the visible `<text>` is `aria-hidden` (no double-read). But
  it's a real **parity win**: residual-vision / magnification users get the same
  visible street names sighted users get — which the map lacks today.
- **Generation.** Baked per tile: road path id + textPath; long-road repetition;
  **dedup across tile boundaries** (a road clipped into N tiles shouldn't shout its
  name N× at a seam); label only at the bands per the density rule.

## Plan

All three are generation changes → ONE rerender. Sequence: agree the label
density rule + scope → **prototype labels on the downtown tile and show Bob** (like
the cluster-tooltip sign-off) → build parts 1–3 → full rerender + deploy (tiles;
the viewer already has the scale-var machinery, may need a `--road-hit-w` setter +
halo/width CSS). Pick up after the target-size work just shipped.

Related: `RENDERING_AT_SCALE.md` (the LOD pyramid + target size this builds on),
`MULTI_LEVEL_TRANSIT.md` (the other deferred road/transit workstream — elevated
roads will interact with both road width and labels).

## Part 4 — label placement is a viewport property, not a tile property (2026-08-06)

**Status:** design agreed (Bob, 2026-08-06); not built. **Supersedes** the
*Generation* bullet and the "repeat along long roads" clause in Part 3 — placement
moves out of the generator entirely.

### What shipped, and what it gets wrong

`_road_label` is called once per road **feature**, and a street is many OSM ways
split at every intersection. So the number of times a name appears tracks how
finely a mapper happened to split the way, and nothing about the map.

Measured on the live Toronto tiles, `43.660_-79.380` carries **three** "Mutual
Street" labels. Two are contiguous — `rl319577` ends at `166,689`, `rl319586`
begins at `166,689`. One unbroken run, named twice, for no cartographic reason.

Part 3 anticipated the seam case ("a road clipped into N tiles shouldn't shout its
name N× at a seam"). The repetition is also *within* a tile, and the fix is not a
dedup pass — see below.

### Why the generator cannot fix it

The first proposal was to merge contiguous same-name ways in `build-tiles.py`
(`linemerge`, one label per run). Rejected, and the reason generalises:

**How far apart names should sit is a function of the screen, not the map.** A
road crossing a 1920px desktop wants its name near the thirds, because that is
where a reader's eye lands. The same road on a phone wants **one** name. That rule
is *scale-independent* — it says nothing about metres, zoom, or tile extent — and
a tile knows none of the three things it needs: viewport size, viewport position,
or where the reader is looking.

Baking placement at build time is therefore category-wrong, not merely
sub-optimal. Merging in the generator would have made the *worst* case of the very
thing the rule exists for: a road spanning the viewport would get exactly one name,
at its midpoint, however large the screen.

### The rule

One tunable constant: a **minimum on-screen gap between repeats of the same name,
in CSS px.** Names sit at `i/(n+1)` along the road's visible run, so the gaps and
the margins to each end match. `n` is not chosen — it falls out of the constant and
the run length.

At a provisional 640px, for a road crossing the full viewport width:

| viewport | names | positions |
|----------|-------|-----------|
| 390 (phone portrait) | 1 | 50% |
| 768 (tablet portrait) | 1 | 50% |
| 1440 (laptop) | 1 | 50% |
| 1920 (desktop) | 2 | 33%, 67% |
| 2560 (wide) | 3 | 25%, 50%, 75% |

1920 lands on the thirds as an **outcome** of the constant, not as a rule anyone
wrote down. The phone gets one name because there is no room for a second. No
breakpoints, no device special-casing.

CSS px already absorb device pixel ratio, so this tracks *apparent* size: a dense
phone screen does not earn more names for having more hardware pixels.

### Junctions nudge placement; they never add a label

Crossing a road of comparable or greater importance is where the question "what am
I on now?" arises, so a name belongs near it. But *adding* a label per junction
would let junction density override the spacing constant, and clutter would return
by the other door — a residential street in a dense grid would pick up a name at
every corner.

So a nearby comparable-or-greater crossing **attracts** an already-budgeted label
toward it. The spacing constant stays the hard cap on how many names appear.

### Class is not tiered — each mechanism does one job

`_ROAD_LABEL_MIN_ZOOM` (Part 3) already expresses class: motorways name from zoom
13, residentials not until 17. Class has therefore *already* decided whether a road
is prominent enough to be named at the current zoom.

Tiering the gap by class as well would weight class twice. And at zoom 17 in a
residential grid every road on screen is residential — they are all equally the
thing being looked at, so thinning them relative to each other has no referent.

**Class controls whether a name appears. The constant controls how often.**

### Why sparse is safe here

The sticky tooltip (`Tooltip.js`) fires on `focusin`, `pointerover` *and* `click`,
and stays until Esc — its comment records that this is deliberate, "so
screen-magnifier users can pan/zoom to read it". The name is therefore available on
demand to mouse, keyboard and touch alike.

That makes the printed labels a **scanning aid**, not the only route to a name, and
it is what licenses restraint: a sparse map makes someone ask, it does not strand
them.

**The caveat that keeps this honest:** asking costs a targeting action, and
targeting is precisely what magnification makes expensive. Labels remain a parity
win for residual-vision users (Part 3). If the map reads too sparse in use, the fix
is the constant — not the junction rule, and not a return to per-way labelling.

### Where it runs

Client, at render time. The machinery already exists:

- `MapRenderer.applyLabelFlips()` already walks the visible label set after every
  tile insert and rotation, caches a per-label angle, and toggles a class. Its own
  comment notes the cost is fine because "the visible label set is
  viewport-bounded". A placement pass is the same shape.
- `data-name` (added for the road highlight, `abc6f30`) already lets the client
  assemble a road's segments **across tiles** — which is what building its visible
  run requires.
- `getTotalLength()` / `getPointAtLength()` give screen-space positions directly,
  in the coordinate space the rule is actually written in.

### Consequence: no tile rebuild

The baked labels are suppressed with one CSS rule and replaced by client-placed
ones. This can be built and shipped against existing tiles. The generator keeps
emitting `data-name` (which the highlight needs) but stops being the authority on
placement; removing the baked `<text>`/`<path>` emission can wait for whatever
rebuild comes next, as dead weight rather than a blocker.

### Open

**The constant needs calibration on real devices, not arithmetic.** 640 is derived,
not measured. The suspicious case is ~1440: a laptop is a large screen and gets a
single name under this value. Tune against a real 1440 laptop and a real phone
before fixing it.
