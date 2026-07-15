/* PointerPace — is the pointer EXPLORING (slow, deliberate) or TRAVELLING?
 *
 * Hover and explore-by-touch announce what's under the pointer, but sliding
 * a finger or mouse smoothly across the page is travel, not a question —
 * it must not fire a tooltip per feature crossed. The pace tracker watches
 * pointer movement over the map and answers slow(); consumers gate their
 * announce-on-enter on it.
 *
 * Arriving fast and STOPPING is still exploring: after the pointer has been
 * still for a beat, onSettle callbacks fire with the resting point, and the
 * consumers reveal whatever is under it. Drags never count (a settling drag
 * would announce whatever the map happened to stop under), and a lifted
 * touch cancels the pending settle — a slide that ends in the air asked
 * nothing.
 */

const THRESHOLD_PX_PER_MS = 0.3;  // ≤300 px/s = exploring; above = travelling
const WINDOW_MS = 150;            // speed is measured over this rolling window
const SETTLE_MS = 120;            // still for this long = the pointer has arrived

export function createPointerPace(el) {
    const samples = [];
    const settleCbs = [];
    let settleTimer = null;
    let lastX = 0, lastY = 0;

    const reset = () => {
        samples.length = 0;
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    };

    el.addEventListener('pointermove', (e) => {
        // Dragging is travel by definition — and its end must not settle
        // into an announcement of whatever slid under the parked pointer.
        if (document.body.classList.contains('map-dragging')) { reset(); return; }
        lastX = e.clientX; lastY = e.clientY;
        const now = performance.now();
        samples.push({ t: now, x: lastX, y: lastY });
        while (samples.length && now - samples[0].t > WINDOW_MS) samples.shift();
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            settleTimer = null;
            for (const cb of settleCbs) cb(lastX, lastY);
        }, SETTLE_MS);
    }, { passive: true });

    // A lifted or cancelled touch has left the surface: nothing to settle on.
    const endTouch = (e) => { if (e.pointerType === 'touch') reset(); };
    el.addEventListener('pointerup', endTouch);
    el.addEventListener('pointercancel', endTouch);
    el.addEventListener('pointerleave', reset);

    return {
        // Slow or stopped = exploring. No recent movement counts as slow, so
        // the very first touch/hover of a session announces normally.
        slow() {
            if (samples.length < 2) return true;
            const now = performance.now();
            const b = samples[samples.length - 1];
            if (now - b.t > 100) return true;   // the pointer has stopped
            const a = samples[0];
            const dt = b.t - a.t;
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            // Coalesced events can share a timestamp: real distance covered
            // in unmeasurable time is FAST, not slow.
            if (dt <= 0) return dist <= 4;
            return dist / dt <= THRESHOLD_PX_PER_MS;
        },
        onSettle(cb) { settleCbs.push(cb); },
    };
}
