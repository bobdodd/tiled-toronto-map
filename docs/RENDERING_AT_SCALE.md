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

## POIs are separate

Points of interest (washrooms, crossings, benches, accessible features) are
**information attached to a location, not shapes perceived by size** — the m-rule
doesn't apply. They're an information-**density** question (how many points of
interest is the right amount per viewport, and how do they cluster/aggregate),
and they get their own design pass. See `feedback_map_feature_parity`.
