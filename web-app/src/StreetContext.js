/* Live street positioning for an EXPLORED feature — "80 metres from County
 * Road 507".
 *
 * The tile generator bakes street context ("on William Street") only into
 * block-scale features: anything bigger — a municipality, a large landuse —
 * deliberately carries none, because a static phrase would be wrong from
 * wherever on it the user actually is (Bob, metres from County Road 507,
 * being told the municipality sits "between County Road 36 and County Road
 * 507"). For those, position is a property of the EXPLORED POINT, not the
 * feature, so it has to be computed at explore time: measure from the
 * touch/hover/focus point to the nearest NAMED road actually rendered
 * around it, in ground metres.
 *
 * Returns '' when the feature already positions itself (a road, a baked
 * street phrase, containment, an address as its name) or when no named road
 * is within RANGE_M — silence over a far-fetched anchor.
 */

// Labels that name a TYPE, not a place — never position against these.
// Shared with app.js's describeMapCentre (same test, same vocabulary).
export const GENERIC_NAME = /^(buildings?|apartment building|house|detached house|residential building|commercial building|office building|industrial building|garage|shed|roof|footpath|path|service road|minor road|parking|tree|grass|water|construction site|crossing|sidewalk|steps|fence|wall|gate|driveway|laneway|alley)$/i;

const RANGE_M = 200;        // beyond this a road doesn't position you
const BESIDE_M = 15;        // closer than this, a number is false precision
const UNIT_M = 1.11;        // 1 projection unit = 0.00001 degrees ≈ 1.11 m

// Nearest screen-px distance from (cx, cy) to a rendered line: coarse
// samples ~12px apart along the geometry, then a fine pass around the best
// coarse hit. Road geometry is tile-clipped, so a segment is at most a tile
// diagonal — the coarse cap keeps even that cheap.
function nearestPx(line, cx, cy) {
    let len, ctm;
    try { len = line.getTotalLength(); ctm = line.getScreenCTM(); } catch { return Infinity; }
    if (!len || !ctm) return Infinity;
    const at = (t) => {
        const p = line.getPointAtLength(t);
        return Math.hypot(
            ctm.a * p.x + ctm.c * p.y + ctm.e - cx,
            ctm.b * p.x + ctm.d * p.y + ctm.f - cy,
        );
    };
    const scale = Math.hypot(ctm.a, ctm.b) || 1;
    const steps = Math.max(1, Math.min(64, Math.ceil((len * scale) / 12)));
    let bestI = 0, best = Infinity;
    for (let i = 0; i <= steps; i++) {
        const d = at((len * i) / steps);
        if (d < best) { best = d; bestI = i; }
    }
    const t0 = (len * Math.max(0, bestI - 1)) / steps;
    const t1 = (len * Math.min(steps, bestI + 1)) / steps;
    for (let i = 1; i < 16; i++) {
        const d = at(t0 + ((t1 - t0) * i) / 16);
        if (d < best) best = d;
    }
    return best;
}

/**
 * @param g    the labelled feature group being announced
 * @param cx   client-space x of the explored point (finger / pointer / focus)
 * @param cy   client-space y
 * @param view { svg, viewBox } — the map SVG element and its current viewBox
 * @returns    "" | "beside X" | "N metres from X"
 */
export function streetContextAt(g, cx, cy, view) {
    if (!g || !view || !Number.isFinite(cx) || !Number.isFinite(cy)) return '';
    if (g.classList.contains('road')) return '';        // roads position themselves
    if (g.hasAttribute('data-street')) return '';       // baked street context
    const label = g.getAttribute('aria-label') || '';
    if (/^\d+\s/.test(label)) return '';                // an address IS a position
    if (/,\s(on|near|at|in|between|along|beside)\s/i.test(label)) return '';

    const rect = view.svg.getBoundingClientRect();
    if (!rect.width || !view.viewBox || !view.viewBox.width) return '';
    const mPerPx = (view.viewBox.width / rect.width) * UNIT_M;
    const rangePx = RANGE_M / mPerPx;

    let bestName = '', bestPx = Infinity;
    for (const road of document.querySelectorAll('#map-tiles .road[aria-label]')) {
        const name = (road.getAttribute('aria-label') || '').split(/[,.]/)[0].trim();
        if (!name || GENERIC_NAME.test(name)) continue;
        const rb = road.getBoundingClientRect();
        if (!rb.width && !rb.height) continue;          // hidden plane / filtered off
        // Cheap reject on the box before sampling geometry.
        const dx = Math.max(rb.left - cx, 0, cx - rb.right);
        const dy = Math.max(rb.top - cy, 0, cy - rb.bottom);
        if (Math.hypot(dx, dy) > Math.min(bestPx, rangePx)) continue;
        // Casing / centreline / hit corridor share one geometry — sample once.
        const line = road.querySelector('polyline, path, line');
        if (!line) continue;
        const d = nearestPx(line, cx, cy);
        if (d < bestPx) { bestPx = d; bestName = name; }
    }
    if (!bestName) return '';
    const m = bestPx * mPerPx;
    if (m > RANGE_M) return '';
    if (m < BESIDE_M) return `beside ${bestName}`;
    const rounded = m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
    return `${rounded} metres from ${bestName}`;
}
