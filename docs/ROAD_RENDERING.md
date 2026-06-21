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
