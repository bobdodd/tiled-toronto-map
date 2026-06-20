# Multi-level transit — representing the vertical dimension

**Status:** decision made — a **hybrid**: the level model ("B") for deep transit
(subway/LRT/PATH), plus depth-distinct styling ("A") for elevated roads (the
Gardiner over Lake Shore Blvd) and bridges. DEFERRED: pick up AFTER the LOD
optimization work (coarser low-zoom grid + extra zoom-out bands). Raised + decided
2026-06-20.

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

## Decision — "B" for deep transit, plus "A" for elevated roads

A **hybrid**, because roads and deep transit are different cases:

**B (level model) for the deep, separate networks — subway / LRT / PATH.** Group
features by level and let the user **switch between clean planes**, exploring one
at a time. A deep subway is its own network you'd explore on its own; a switchable
plane fits it.

**A (depth-distinct styling, one view) for ELEVATED ROADS — Bob, 2026-06-20.**
Roads are different: the elevated **Gardiner Expressway** runs directly over **Lake
Shore Boulevard and local roads at ground level**, and you navigate that area with
BOTH in mind. So elevated roads stay on the SAME view as the ground roads beneath
them, but **styled distinctly** (cased / clearly-above, labelled "elevated") — NOT
hidden behind a plane-switch, which would drop one whenever you looked at the
other. The same applies to ordinary road **bridges / overpasses** (elevated road
over road or water).

**Rule of thumb:** deep separate networks (subway/LRT/PATH) → **B** (switch
planes); elevated roads & bridges over surface roads → **A** (one view, distinct
style). The prerequisite (read `layer`/`tunnel`/`level`/`bridge`) serves both.

(Option **C** — underground as a filterable on/off toggle — was considered and set
aside; the level model gives cleaner separation for the deep networks.)

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

### Parity framing

Consistent with the project's core principle and the aggregation work: we are
**not dropping** underground transit, we are **re-representing it by depth** —
same information, clearer grain. See `feedback_map_feature_parity`,
`RENDERING_AT_SCALE.md`.

## Open sub-questions for design time

- How the level control surfaces (toggle / dropdown / slider), and whether
  surface stays visible with a sub-level distinctly overlaid, or planes are fully
  separate.
- How the **PATH** (pedestrian, not rail) fits the same level model.
- Interaction with the **LOD bands** — does each level carry its own LOD pyramid,
  or is level orthogonal to zoom?
- **Search** across levels — a result on a non-active level (settled search rule:
  selecting it should frame/zoom to show it, which would also switch to its
  level).
- How levels interact with the cross-type proximity **clusters** (cluster within a
  level, presumably).

## Sequencing

After the LOD optimization: the coarser low-zoom grid and the extra zoom-out bands
(see `RENDERING_AT_SCALE.md` "Next lever" + "extend the zoom-OUT range"). Then
this.
