# Tiled Toronto Map — Accessibility & Code Audit

**Date:** 2026-06-18
**Scope:** The shipped demo in `web-app/` (the canonical tree in the `tiled-toronto-map` repo).
`demo-clean/` is older, gitignored scratch from the separate `Accessible-Maps` repo and was **not** audited.
**Reviewed in full:** `web-app/index.html`, `web-app/styles/main.css`, and all eight JS modules in
`web-app/src/` (`app.js`, `AccessibilityManager.js`, `FilterManager.js`, `FeatureRenderer.js`,
`MapRenderer.js`, `SVGTileManager.js`, `LocationTracker.js`, `Avatar.js`).
All findings below were grounded in source and the headline ones spot-verified.

---

## What's already good (keep)

The accessibility *intent* here is real and worth preserving while fixing the wiring:

- `@media (prefers-reduced-motion: reduce)` blocks for the compass and zoom controls.
- `@media (prefers-contrast: high)` theme and a `@media (prefers-color-scheme: dark)` theme.
- Compass/zoom targets explicitly sized to 48px against WCAG 2.2 SC 2.5.8 (with comments).
- Declared `aria-live` regions and a deliberate `role="application"` + `role="document"`
  "drop back to browse mode" escape-hatch pattern.
- Visible focus indicators on the controls; the rotor's positive-`tabindex` approach is an
  **intentional design choice** (narrows + orders keyboard nav) — *not* a bug.

The recurring problem is that these are **half-wired**: the scaffolding is present, the
connections are broken.

---

## TIER 1 — Core accessible-map promise is broken

### 1. The Rotor is ~94% non-functional ✅ FIXED 2026-06-18
- **Where:** `web-app/src/AccessibilityManager.js:442` (the `featureSelectors` map in `updateTabOrder`).
- **Problem:** The rotor panel exposes ~165 **leaf** checkboxes (`rotor-restaurants`,
  `rotor-museums`, `rotor-banks`, `rotor-cinemas`, …). `getSelectedRotorValues()` strips the
  `rotor-` prefix to get a value (`restaurants`), but `featureSelectors` is keyed mostly by
  **category names** (`commerce`, `tourism`, `healthcare`, …) plus a few leaf names. The guard
  `if (featureSelectors[value])` silently skips any value with no key. Only ~10 leaf values
  coincide with a key: `buildings, transit, shops, schools, parks, hospitals, pharmacies,
  worship, addresses, barriers`. **Checking any of the other ~155 rotor categories does
  nothing** — no `tabindex`, no navigable items, no feedback.
- **Why it matters:** This is the map's headline screen-reader navigation feature. It is silent
  for all but a handful of categories. The target `-feature` classes *do* exist in the SVG
  (verified `restaurant-feature`, `museum-feature`, `bank-feature`, etc.), so this is a
  key-mismatch, not a missing-render problem.
- **Fix direction:** Either (a) re-key `featureSelectors` by the leaf names that the checkboxes
  actually produce, or (b) drive the rotor from the same data model as `FilterManager` (which is
  correctly keyed 1:1 — see note under Tier 4). Root cause worth recording: the rotor map is
  keyed by *category*, the checkboxes are *leaf-level*.
- **Resolution (2026-06-18):** Took option (b). `FilterManager.classMap` is now the single
  source of truth (exposed as `this.classMap`); `updateTabOrder` derives each rotor target from
  it by suffixing `-feature` (`.restaurant` → `.restaurant-feature`), with a 3-entry override
  table for groups named differently (`transit` → `.transit-feature`, `airports` →
  `.airport-feature`, `enhanced-highways` → `.enhanced-highway-feature`). Adding a filter
  category now wires the rotor automatically — they can't drift again. Verified by simulation
  against the 97 real `-feature` groups: **98** categories now resolve (was ~10). Also removed a
  ~100-line dead `this.featureSelectors` map from the constructor (the stale duplicate, audit
  Tier 4 / old #10).
- **Remaining (separate task):** the other **66** leaf categories (airport interiors, indoor
  rooms, individual wheelchair/mobility tags, per-mode transport) render no navigable
  `-feature` group, so checking them in the rotor is a harmless no-op. Giving them feature groups
  belongs with Tier 1 #4 (feature roles) in `FeatureRenderer`.

### 2. The map itself is not keyboard-reachable ✅ FIXED 2026-07-12
- **Where:** `web-app/index.html:1163` — `<svg id="map-svg" role="document" focusable="true">`;
  `web-app/index.html:1162` — `#map-container role="application"` (no `tabindex`).
- **Problem:** `focusable="true"` is a legacy SVG/IE attribute that does **not** make an element
  tab-reachable in modern browsers, and no JS adds a `tabindex` to the SVG or the container.
  The keydown handler is bound to `#map-container` (`app.js:268`) so it only fires when a
  descendant already has focus (a compass button). The `role="document"`-inside-`role="application"`
  escape hatch is unreachable because its target can't be focused.
- **Fix direction:** Add `tabindex="0"` (or programmatic) to the focusable map element; ensure the
  keydown handler's host can actually receive focus.
- **Resolution (2026-07-12, commit 5a87ad4):** Landed as a set. `focusable="true"` replaced by a
  real tabindex — first `7999` (a Tab stop), then **`-1`** once the same commit made EVERY
  viewport-visible feature tabbable by default (rotor cleared = the 9000+ band goes to all
  `[role="img"]` groups; the rotor NARROWS, it no longer gates). With features always reachable
  and the compass inside the keydown host, a canvas Tab stop was pure friction — it remains the
  skip-link's programmatic target (and the fallback no longer clobbers its tabindex). Clicking a
  feature now also moves focus onto it (search-result treatment, band 8500).

### 3. Arrow keys are gated behind Ctrl/Cmd, and bare arrows are swallowed ✅ RESOLVED BY REDESIGN
- **Where:** `web-app/src/app.js:275-324`.
- **Problem:** Panning only runs `if (hasModifier)` (Ctrl/Cmd). A bare `ArrowUp` enters the
  `case`, skips the pan, but `handled` was initialised `true` (`app.js:270`) and is never reset,
  so `e.preventDefault()` (`:322`) and `announceMapChange()` (`:323`) still run. Inside a
  `role="application"` region a plain arrow press therefore cancels default/AT behaviour, moves
  nothing, and announces an *unchanged* view.
- **Why it matters:** Inside `role="application"` the SR hands raw arrows to the app — the whole
  reason to use that role — so bare arrows should pan. The modifier requirement is undiscoverable
  and the swallow is actively harmful.
- **Fix direction:** Make bare arrows pan; only set `handled = true` when a pan actually happens.
- **Resolution (verified 2026-07-12):** The design moved the other way, deliberately —
  `role="application"` was dropped, so bare arrows BELONG to the screen reader's virtual cursor.
  The handler now sets `handled = false` for a bare arrow and falls through with no
  `preventDefault` (no swallow, no false announcement); panning lives on Ctrl/Cmd+arrows. The
  audit's premise (inside `role="application"`, bare arrows should pan) no longer applies.

### 4. Map features have no reliable accessible name ✅ RESOLVED BY ARCHITECTURE
- **Where:** `web-app/src/FeatureRenderer.js:280` (and every `renderXxx` method).
- **Problem:** Each feature is a `<g>` with an `aria-label` but **no `role`** (0 `setAttribute('role'…)`
  in the file) and no `<title>`. `aria-label` on a roleless `<g>` is inconsistently exposed — many
  SR/browser pairings ignore it. A name only becomes reliable when the rotor stamps `role="group"`
  at runtime (`AccessibilityManager.js:506-507`), and per Tier 1 #1 that happens for ~10 categories.
  Most features announce as nothing / "graphic".
- **Fix direction:** At render time set `role="img"` (or `graphics-symbol`) on each feature `<g>`
  *paired* with the existing `aria-label`, ideally plus a child `<title>` as a fallback. This
  anchors the name independent of the rotor overlay.
- **Resolution (verified 2026-07-12):** The offending module was DELETED, not repaired —
  `FeatureRenderer.js` (client-side rendering) went in `02d99cc`; features now come exclusively
  pre-rendered in the tiles, and the generator stamps `role="img"` + a rich `aria-label` (name,
  category, address, accessibility detail) on every feature group at build time
  (`tile-generation/build-tiles.py:1429`). Verified against the live downtown tile
  `43.650_-79.380`: **2,312 of 2,339 `<g>`s carry both**; the 27 without are clip/casing/halo
  scaffolding, correctly `aria-hidden="true"`. Names are baked into the artefact — no runtime JS
  to drift.

### 5. Positive-tabindex collision: two code paths disagree ✅ RESOLVED (one residue, see below)
- **Where:** `web-app/src/app.js:1233` (`feature.setAttribute('tabindex', index + 1)`) vs
  `web-app/src/AccessibilityManager.js:495` (`let tabIndex = 100; // come after UI controls`).
- **Problem:** The tile path bases feature `tabindex` at 1, colliding with the static control
  tabindexes **1–17** in the HTML (sidebar-toggle=1 … nav-center=17). The sibling rotor path
  correctly starts at 100. With equal tabindex values, Tab order falls back to DOM order, so map
  features interleave with the toolbar.
- **Fix direction:** Base the tile path at 100 too (e.g. `index + 100`) so it matches the sibling
  path and clears the control range.
- **Resolution (verified 2026-07-12):** The `index + 1` tile path went with `FeatureRenderer.js`
  (deleted, `02d99cc`); the banding rework left three coordinated writers — rotor/default band
  9000+ (`AccessibilityManager.js`), search/click direct target 8500 (`app.js`), and static bands
  in the HTML (header 1–7, filter 101+, rotor controls 4002+, compass 8000–8005). No collision.
- **Residue found during verification:** `Avatar.js:162` stamps the you-are-here marker
  `tabindex="0"` — on an all-positive page, 0 sorts LAST, so the user's own location is the final
  Tab stop after every feature. It is also an activatable control (click/Enter centres the map)
  with an `aria-label` but **no `role`** — the #4 disease, on the one element #4's fix (the tile
  generator) can't reach because the avatar is built client-side. Proposed: `tabindex="7999"`
  (the slot the canvas vacated: location → compass → features) + `role="button"`. Awaiting
  sign-off on the ordering.

### 6. Three competing live regions; the declared ones go unused ✅ CONSOLIDATED, then SUPERSEDED
- **Where:** declared `#map-announcements` (`index.html:1263`) and `#location-info`
  (`index.html:1243`); pan/zoom announcements routed to a dynamically-created
  `#status-live-region` (`app.js:665`); `LocationTracker` builds its own `#location-live-region`
  (`LocationTracker.js:156`).
- **Problem:** Pan/zoom text goes to `#status-live-region`; rotor/filter text goes to
  `#map-announcements`; location goes to a third region, leaving the page's purpose-built
  `#location-info` dead. Multiple polite regions race each other, and several writers use
  append-instead-of-clear (e.g. `AccessibilityManager.js:575` `textContent +=`), producing run-on
  or dropped announcements.
- **Fix direction:** Consolidate to the two declared regions; use a clear-then-set idiom so
  identical consecutive messages re-announce and writers don't clobber each other.
- **Resolution (2026-07-12, commit d90b963):** Two stages. The consolidation had already
  happened by the time of the verification pass (one region, `#map-announcements`,
  clear-then-set via `announceStatus`, plus the visible captions mirror). Then the model was
  REPLACED: a polite region QUEUES, and explore-by-touch on a dense map backs it up with stale
  audio. `Announcer.js` (the audio-only maps' pattern) makes cancel-then-speak Web Speech the
  primary channel for hover / touch / focus / status — latest always wins — with the region kept
  ONLY as the fallback (audio toggled off, or no speech engine), itself now latest-wins too.
  New: audio on/off button (persisted) and single-finger touch-explore. Live 2026-07-12; AT pass
  (double-speak interplay with VO/TalkBack native reading under audio-on) awaiting Bob's testing.

---

## TIER 2 — Correctness bugs

### 7. Latitude/longitude swapped on 6 point-marker render paths ✅ RESOLVED BY ARCHITECTURE
- **Where:** `web-app/src/FeatureRenderer.js:3301` (and `:3360, :3408, :3446, :3519, :3584`).
- **Problem:** These call `toSVGCoordinates(coordinates[0], coordinates[1])` = `(lon, lat)`, but
  the signature is `toSVGCoordinates(lat, lon)` (`:523`) and the correct helper passes
  `(coordinates[1], coordinates[0])` (`:484`). GeoJSON is `[lon, lat]`. The **point-geometry**
  variants of bridges, tunnels, towers, masts, piers and breakwaters render at the wrong location.
- **Fix direction:** Swap the argument order on all six; a copy-paste divergence among the ~80
  near-identical render methods.
- **Resolution (verified 2026-07-12):** Died with `FeatureRenderer.js` (`02d99cc`). The tile
  generator has exactly ONE point-geometry path (`build-tiles.py:1248`, `(geom.y, geom.x)` —
  correct), one line path and one polygon path, all through the single `coord_to_svg(lat, lng)`
  helper; the shapely (lon, lat) convention is documented at the conversion site. All 7 call
  sites audited correct. Empirically confirmed on live tile `43.650_-79.380`: OSM node 955598849
  at (43.657789, −79.376763) projects to SVG (324, 221); the tile renders (323, 221) — integer
  truncation only. A per-kind swap cannot recur: there are no per-kind conversions to diverge.
  NB the tile's `data-osm-id` does not carry the element TYPE (node/way ids can collide across
  types) — worth remembering when tracing a feature back to OSM.

### 8. Dead "Everything" / category-cascade code ✅ RESOLVED BY REMOVAL
- **Where:** `web-app/src/AccessibilityManager.js:135-140`.
- **Problem:** Queries `input[name="rotor-quick"]` and `input[name="rotor-category"]`, but **no
  `<input>` in the page has a `name` attribute** (the only `name=` is the viewport meta). The
  "Everything" shortcut and the cascade never run.
- **Fix direction:** Either add the `name` attributes the code expects, or drive these from the
  checkbox `id`s like the rest.
- **Resolution (verified 2026-07-12):** The `rotor-quick`/`rotor-category` queries and the
  "Everything" shortcut were removed wholesale in the taxonomy/FilterUI rebuild — no dead
  selector code remains. The one surviving `[name=]` query (`LevelSwitch`, `map-level`) is
  correctly paired: all four level checkboxes carry `name="map-level"` in the HTML.

### 9. Tile failures are swallowed and reported as success ⬜
- **Where:** `web-app/src/SVGTileManager.js:94` (`loadTile` catches → returns `null`),
  `:222` (`cancelAllRequests` just `.clear()`s).
- **Problem:** Failed tiles (404 / decompress error) are filtered out, then app.js announces
  "Map loaded. N tiles available" counting only the survivors — failures are invisible.
  `cancelAllRequests()` has no `AbortController`, so fast panning duplicates in-flight fetches
  instead of cancelling them.
- **Fix direction:** Surface partial-load failures to the user; add an `AbortController` for real
  cancellation.

### 10. Dead CSS from a shell-escaping artifact ✅ RESOLVED BY REMOVAL
- **Where:** `web-app/styles/main.css:1727-1737`.
- **Problem:** The WCAG-debug rules contain `opacity: 0.3 \!important;` (six `\!important`). The
  literal backslash makes each declaration invalid, so all six rules are dropped by the parser.
  Looks like the file was written through a shell that escaped `!`.
- **Fix direction:** Remove the backslashes (or the whole debug block if unused).
- **Resolution (verified 2026-07-12):** Zero `\!important` left in `main.css`; the whole
  WCAG-debug block is gone. The "whole debug block if unused" branch is what happened.

---

## TIER 3 — Accessibility quality

### 11. Tiny filter text and sub-24px targets ⏸ PARKED — filters/rotor redesign
- **Where:** `web-app/styles/main.css:1588` (`.filter-sub-accordion-header` 0.5625rem = 9px),
  `:257` (category titles 10px); labels use `white-space: nowrap; text-overflow: ellipsis`.
- **Problem:** Filter labels at 9–10px, clipped with ellipsis; checkbox rows are well under the
  WCAG 2.2 SC 2.5.8 24×24px minimum. The filtering UI — the primary interaction — is hard to read
  and hit, ironic next to the carefully-sized 48px compass.
- **Fix direction:** Raise label sizes to a readable floor; enlarge the clickable row to ≥24px;
  allow wrapping or full labels.
- **Mostly fixed 2026-06-19, remainder PARKED (2026-07-12, Bob):** the WCAG polish batch already
  fixed the checkbox label ROWS (`display:flex; min-height:1.75rem` ≥24px, 13px text, wrapping
  instead of nowrap+ellipsis). Still at 9px: `.filter-subcategory-title` and
  `.filter-sub-accordion-header` — parked with the coming filters/rotor panel REDESIGN rather
  than patched twice. Scope check: every remaining small target is in that panel — the MAP side
  was already made compliant on 2026-06-20: POI dots carry a transparent 24px-screen hit-ring
  (`paint-order: stroke`), roads a baked transparent `.road-hit` corridor; both cited to
  WCAG 2.5.8 in `main.css`.

### 12. Dark-mode / high-contrast cover ~10 of ~80 feature classes ✅ FIXED 2026-06-19
- **Where:** `web-app/styles/main.css:650-666` (dark) and `:804-833` (high-contrast).
- **Problem:** Features get hardcoded `fill`/`stroke` attributes (CSS-overridable), but the
  adaptive blocks only style `building, road, road-casing, park` (dark) plus a few more in
  high-contrast. Every other class (water, forest, rivers, bridges `#8e9aaf`, all POIs…) keeps its
  mid-tone colour, so most of the map doesn't adapt and fails the contrast floor in those modes.
- **Fix direction:** Extend the dark/high-contrast overrides to every rendered feature class, or
  drive feature colours from CSS custom properties that the media queries re-theme.
- **Resolution (2026-06-19; doc not updated at the time — annotated 2026-07-12):** The audited
  rules were doubly dead: they targeted the `<g>` while tiles bake fill/stroke as ATTRIBUTES on
  the shapes (attribute beats inherited), and `.road-casing` didn't match the real class. Fixed
  by recolouring SHAPES (`[fill]:not([fill="none"])` / `[stroke]:not([stroke="none"])`) inside
  the media queries only, with `--c-*` palette custom properties per block and a CATCH-ALL so
  every category adapts; since refined (transparent-stroke `:not()` guards, parking carve-outs).
  Palette itself remains a first pass awaiting Bob's OS-toggle review.

### 13. Avatar pulse ignores reduced-motion (and a dead CSS keyframe) ✅ FIXED 2026-06-19
- **Where:** `web-app/src/Avatar.js:260` (SMIL `<animate repeatCount="indefinite">` on `r`);
  `web-app/styles/main.css:1752` (`@keyframes avatarPulse`, never applied — no `animation:` ref).
- **Problem:** The indefinite pulse runs for reduced-motion users; no `matchMedia` gate in JS, and
  the CSS keyframe that *was* written is orphaned.
- **Fix direction:** Gate the SMIL animation on `prefers-reduced-motion`; delete or wire up the
  orphaned keyframe.
- **Resolution (2026-06-19; annotated 2026-07-12):** SMIL gated in `Avatar.js` (`matchMedia`
  check — CSS can't stop SMIL, so the animation is simply not created; a static ring remains),
  plus a blanket reduced-motion block at the end of `main.css` covering the compass/zoom
  animations the per-button blocks missed.

### 14. `role="toolbar"` misused; no skip link ✅ FIXED 2026-06-18/19
- **Where:** `web-app/index.html:11`.
- **Problem:** A text input, fieldsets, accordions and 300+ checkboxes inside `role="toolbar"`,
  which implies a flat set of buttons with arrow-key roving — mis-setting AT expectations. There's
  also no skip link past the huge sidebar to the map.
- **Fix direction:** Use a `<nav>`/region landmark instead of `toolbar`; add a "skip to map" link.
- **Resolution (2026-06-18/19; annotated 2026-07-12):** Part of Bob's keyboard-model rebuild —
  the sidebar is `role="banner"` (no `role="toolbar"` remains anywhere), the map svg is the named
  `role="document"`, the compass `role="complementary"`. "Skip to compass" and "Skip to map" are
  the first two tab stops; the skip-to-map target logic lives in `app.js focusFirstMapFeature`.

---

## TIER 4 — Hygiene / maintainability

- **Debug panel shipped** in the demo HTML (`index.html:1249`) with `style="display:none"` and
  **New York default coords** (40.7128, −74.0060) on a Toronto map; `debug-tiles.html` is also
  committed. ⬜
- **~550 lines of duplicated markup** — the Filters and Rotor panels are near-identical trees
  differing only by `filter-`/`rotor-` id prefix; most of the 100KB `index.html` is this
  duplication, and it's where the two trees drift out of sync. ⬜
- **Inline styles for show/hide** throughout (`element.style.display/.opacity/.cursor`); the filter
  system toggles `display` inline — against the no-inline-styles principle. ⬜
- **`order.indexOf(...) || 999`** sorts motorways as unknown (`FeatureRenderer.js:296` — `indexOf`
  returns 0 for the first element, `0 || 999` → 999). ⬜
- **Zoom range mismatch:** URL `?zoom` validated to 10–20 (`app.js:1430`) but renderer clamps
  15–23 (`MapRenderer.js:67`). ⬜
- **`handleResize` re-renders and wipes all tiles** (`MapRenderer.js:337`). ⬜
- **Not `aria-hidden`:** the accordion `▼` arrow glyphs (every header) and two emoji `<text>`
  markers (`FeatureRenderer.js:3320` bridge 🌉, `:3381` tunnel ⚫). ⬜
- **`console.log`/`console.warn` on the normal load path** (`SVGTileManager.js:34, 123, 170`;
  `app.js:1398-1424`). ⬜

> **Useful contrast:** `FilterManager` is the *correct* model to emulate — its 164 filter keys map
> 1:1 to the `filter-*` checkbox ids and all have a class mapping; show/hide logic is non-inverted
> (`FilterManager.js:422`). The rotor's brokenness (Tier 1 #1) is precisely that it did *not* reuse
> this model.

---

## Suggested fix order

1. **#1 Rotor selector map** — restores the headline feature.
2. **#2 + #3 Make the map focusable and ungate bare arrows** — restores keyboard navigation.
3. **#4 Feature roles** — makes features reliably named.
4. **#5 tabindex base** + **#6 live-region consolidation** — fixes order + announcements.
5. **#7 lat/lon swap** + **#8 dead code** + **#10 dead CSS** — quick correctness wins.
6. Tier 3 (contrast/targets/motion) then Tier 4 (hygiene).
