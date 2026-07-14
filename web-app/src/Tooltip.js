// Sticky tooltip on focus / hover — ported from the east-end Toronto and
// terminal maps. Shows the focused or hovered feature's name (its aria-label)
// in a pill anchored to the pointer, with a constant-size marker pinning the
// exact point. Sticky: it stays until Esc or another feature replaces it, so
// screen-magnifier users can pan/zoom to read it.
//
// The pill is purely visual (aria-hidden) — the accessible name is announced
// from the feature itself, which carries role="img" + aria-label. We deliberately
// do NOT use native <title> tooltips: those appear on mouse hover only, are not
// keyboard/AT accessible, and cannot be styled.
//
// Adapted for the tiled web-app: the map is #map-svg, and a feature's label sits
// on its wrapping <g role="img" aria-label> (the pointer actually hits the inner
// geometry), so featureFrom resolves the nearest labelled ancestor inside
// #map-tiles rather than reading the hit element directly.
export function setupTooltip() {
    const tooltip = document.getElementById('poiTooltip');
    const map = document.querySelector('#map-svg');
    if (!tooltip || !map) return;
    const tooltipTitle = tooltip.querySelector('.poi-tooltip-title');
    const marker = document.getElementById('poiMarker');
    let current = null;  // the feature whose name is currently shown

    // Place the pill at a viewport point (the pointer, or a tap), in its own
    // fixed layer. Anchoring to client coords — not the feature's geometry —
    // keeps it with the cursor whatever the map's zoom.
    function positionAt(x, y) {
        if (marker) { marker.style.left = x + 'px'; marker.style.top = y + 'px'; }
        const margin = 8;
        const placeBelow = (y - 4) - (tooltip.offsetHeight + 14) < margin;
        document.body.classList.toggle('tooltip-below', placeBelow);
        const tipW = tooltip.offsetWidth;
        let left = x;
        if (left - tipW / 2 < margin) left = tipW / 2 + margin;
        if (left + tipW / 2 > window.innerWidth - margin) left = window.innerWidth - margin - tipW / 2;
        tooltip.style.left = left + 'px';
        tooltip.style.top = y + 'px';
    }

    function showAt(feature, x, y) {
        if (!feature) { hideTooltip(); return; }
        if (feature !== current) {
            current = feature;
            tooltipTitle.textContent = feature.getAttribute('aria-label');
        }
        tooltip.hidden = false;
        if (marker) marker.hidden = false;
        positionAt(x, y);
    }

    function hideTooltip() {
        tooltip.hidden = true;
        if (marker) marker.hidden = true;
        current = null;
    }

    // Pill + marker for a POINT WITHOUT a drawn feature (an address a go-to
    // arrives at): same visual as a feature's tooltip, arbitrary text.
    function showLabel(text, x, y) {
        if (!text) return;
        current = null;
        tooltipTitle.textContent = text;
        tooltip.hidden = false;
        if (marker) marker.hidden = false;
        positionAt(x, y);
    }

    // The feature is the nearest labelled element inside the tile layer, resolved
    // up from whatever geometry the pointer/focus landed on.
    function featureFrom(e) {
        const t = e.target && e.target.closest ? e.target.closest('#map-tiles [aria-label]') : null;
        return (t && t !== map) ? t : null;
    }

    // Every platform: a click / tap shows the pill at the tap point. Coexists
    // with explore-by-touch so it doesn't disturb screen readers on touch.
    map.addEventListener('click', function (e) {
        const f = featureFrom(e); if (f) showAt(f, e.clientX, e.clientY);
    });

    // Desktop pointer + keyboard. Gated to hover-capable devices so no
    // pointer/focus wiring attaches on touch.
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        // Mouse: show on entering a feature, at the pointer. Sticky. Not
        // during a drag — the map slides under the pointer and the pill would
        // chase every feature that passes beneath it.
        map.addEventListener('pointerover', function (e) {
            if (e.pointerType !== 'mouse') return;
            if (document.body.classList.contains('map-dragging')) return;
            const f = featureFrom(e);
            if (f) showAt(f, e.clientX, e.clientY);
        });
        // Keyboard focus has no pointer — anchor to the feature's box.
        map.addEventListener('focusin', function (e) {
            const f = featureFrom(e);
            if (!f) return;
            const r = f.getBoundingClientRect();
            showAt(f, r.left + r.width / 2, r.top);
        });
    }

    // Sticky: only Esc (or a different feature) clears it.
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !tooltip.hidden) hideTooltip();
    });

    // Avoid a stale position if the map re-lays-out.
    window.addEventListener('resize', function () { if (!tooltip.hidden) hideTooltip(); });

    // For the app's go-to arrival handling: clear a stale pill from the place
    // just LEFT, and label a destination that has no drawn feature.
    return { hide: hideTooltip, showLabel };
}
