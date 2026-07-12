/* ChatPanel — the housing for the chat (Chat.js is the conversation; this is
 * the furniture). One markup, two modes:
 *
 * - DESKTOP (default): a floating panel over the map. Moveable — drag the bar,
 *   or focus the Move button and use the arrow keys. Resizable — drag the
 *   top-right grip, or focus the Resize button and use the arrow keys (the
 *   bottom edge stays put; the top corner pulls up and out, which is the
 *   natural geometry for a bottom-docked panel). Closeable from Settings;
 *   speaking still works with it closed (the Speak button is in the menu).
 *   Geometry and the on/off preference persist.
 *
 * - MOBILE (narrow screens): the common split-screen pattern — map on top,
 *   panel across the bottom, a divider the user drags (or arrow-keys, as a
 *   focusable role=separator) to control the ratio. Always open: the Settings
 *   toggle and the float chrome retire (CSS hides them off body.chat-split).
 *   The ratio persists.
 *
 * All geometry rides on CSS custom properties set inline — the sanctioned
 * inline-style use (custom properties driving primitives) — so user
 * stylesheets keep full override power over everything else.
 *
 * Every deliberate keyboard adjustment is announced through the app's
 * announce callback (latest wins, so holding an arrow key never queues a
 * backlog). Pointer drags are self-evident and stay silent.
 */

const MOBILE_MQ = '(max-width: 768px)';
const GEOM_KEY = 'map-chat-panel-geom';   // desktop {left,bottom,width,height} px
const ON_KEY = 'map-chat-panel-on';       // desktop panel on/off
const SPLIT_KEY = 'map-chat-split';       // mobile panel height, fraction of viewport

const EDGE = 8;            // px the panel always keeps clear of the viewport edge
const SPLIT_MIN = 0.20;    // the divider's range (matches aria-valuemin/max)
const SPLIT_MAX = 0.75;

export function setupChatPanel({ announce, onLayoutChange } = {}) {
    const panel = document.getElementById('chat-panel');
    const divider = document.getElementById('chat-divider');
    if (!panel || !divider) return { isOpen: () => false };

    const bar = panel.querySelector('.chat-panel__bar');
    const grip = panel.querySelector('.chat-panel__grip');
    const moveBtn = document.getElementById('chat-panel-move');
    const resizeBtn = document.getElementById('chat-panel-resize');
    const toggleBtn = document.getElementById('toggle-chat-panel');
    const skip = document.getElementById('skip-to-chat');
    const main = panel.closest('main');

    const say = (m) => { if (announce) announce(m); };
    const relayout = () => { if (onLayoutChange) onLayoutChange(); };
    const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const mq = window.matchMedia(MOBILE_MQ);

    // ── Desktop on/off (Settings) ──
    let on = localStorage.getItem(ON_KEY) !== 'off';

    // ── Desktop geometry. null = the CSS defaults (docked bottom, between the
    //    sidebar and the rose) until the user moves or resizes it. ──
    let geom = null;
    try {
        const g = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null');
        if (g && g.width > 0 && g.height > 0) geom = g;
    } catch { /* defaults */ }

    function currentGeom() {
        if (geom) return { ...geom };
        const r = panel.getBoundingClientRect();
        return { left: r.left, bottom: window.innerHeight - r.bottom, width: r.width, height: r.height };
    }

    // Fully on-screen, never below the CSS minimums (unless the window itself is smaller).
    function clampGeom(g) {
        const vw = window.innerWidth, vh = window.innerHeight;
        g.width = Math.min(Math.max(g.width, 18 * rem()), vw - 2 * EDGE);
        g.height = Math.min(Math.max(g.height, 13 * rem()), vh - 2 * EDGE);
        g.left = Math.min(Math.max(g.left, EDGE), vw - g.width - EDGE);
        g.bottom = Math.min(Math.max(g.bottom, EDGE), vh - g.height - EDGE);
        return g;
    }

    function applyGeom() {
        if (!geom) return;
        panel.style.setProperty('--chat-left', `${Math.round(geom.left)}px`);
        panel.style.setProperty('--chat-bottom', `${Math.round(geom.bottom)}px`);
        panel.style.setProperty('--chat-width', `${Math.round(geom.width)}px`);
        panel.style.setProperty('--chat-height', `${Math.round(geom.height)}px`);
    }

    function saveGeom() {
        if (geom) localStorage.setItem(GEOM_KEY, JSON.stringify(geom));
    }

    const pctX = (px) => Math.round((px / window.innerWidth) * 100);
    const pctY = (px) => Math.round((px / window.innerHeight) * 100);

    // ── Desktop MOVE: drag the bar… ──
    let dragStart = null;
    if (bar) bar.addEventListener('pointerdown', (e) => {
        if (mq.matches || e.target.closest('button')) return;
        dragStart = { x: e.clientX, y: e.clientY, g: currentGeom() };
        bar.classList.add('dragging');
        bar.setPointerCapture(e.pointerId);
    });
    if (bar) bar.addEventListener('pointermove', (e) => {
        if (!dragStart) return;
        geom = clampGeom({
            ...dragStart.g,
            left: dragStart.g.left + (e.clientX - dragStart.x),
            bottom: dragStart.g.bottom - (e.clientY - dragStart.y),
        });
        applyGeom();
    });
    const endBarDrag = () => {
        if (!dragStart) return;
        dragStart = null;
        bar.classList.remove('dragging');
        saveGeom();
    };
    if (bar) { bar.addEventListener('pointerup', endBarDrag); bar.addEventListener('pointercancel', endBarDrag); }

    // …or arrow keys on the Move button. Shift = coarse steps. Alt+Shift+Arrow
    // does the same at the fine step: it is the SCREEN-READER path — browse
    // mode swallows plain (and Shift-/Ctrl-modified) arrows, but Alt+Shift is
    // unbound in NVDA and JAWS, is not a VoiceOver command, and collides with
    // no browser or OS shortcut, so it passes through to the page. Bare
    // Alt+Arrow is also accepted-and-consumed so a slip can never trigger the
    // browser's Alt+Left/Right history navigation while the button is focused.
    const arrowStep = (e) => (e.shiftKey && !e.altKey ? 4 : 1) * rem();
    if (moveBtn) moveBtn.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) return;
        const step = arrowStep(e);
        const g = currentGeom();
        if (e.key === 'ArrowLeft') g.left -= step;
        else if (e.key === 'ArrowRight') g.left += step;
        else if (e.key === 'ArrowUp') g.bottom += step;
        else if (e.key === 'ArrowDown') g.bottom -= step;
        else return;
        e.preventDefault();
        geom = clampGeom(g);
        applyGeom();
        saveGeom();
        say(`${pctX(geom.left)} percent from the left, ${pctY(geom.bottom)} percent from the bottom.`);
    });

    // ── Desktop RESIZE: drag the top-right grip (bottom-left corner anchored)… ──
    let sizeStart = null;
    if (grip) grip.addEventListener('pointerdown', (e) => {
        if (mq.matches) return;
        sizeStart = { x: e.clientX, y: e.clientY, g: currentGeom() };
        grip.setPointerCapture(e.pointerId);
    });
    if (grip) grip.addEventListener('pointermove', (e) => {
        if (!sizeStart) return;
        geom = clampGeom({
            ...sizeStart.g,
            width: sizeStart.g.width + (e.clientX - sizeStart.x),
            height: sizeStart.g.height - (e.clientY - sizeStart.y),
        });
        applyGeom();
    });
    const endGripDrag = () => { if (sizeStart) { sizeStart = null; saveGeom(); } };
    if (grip) { grip.addEventListener('pointerup', endGripDrag); grip.addEventListener('pointercancel', endGripDrag); }

    // …or arrow keys on the Resize button (up = taller, right = wider). Same
    // modifier contract as Move: Alt+Shift is the screen-reader path.
    if (resizeBtn) resizeBtn.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) return;
        const step = arrowStep(e);
        const g = currentGeom();
        if (e.key === 'ArrowLeft') g.width -= step;
        else if (e.key === 'ArrowRight') g.width += step;
        else if (e.key === 'ArrowUp') g.height += step;
        else if (e.key === 'ArrowDown') g.height -= step;
        else return;
        e.preventDefault();
        geom = clampGeom(g);
        applyGeom();
        saveGeom();
        say(`Width ${pctX(geom.width)} percent, height ${pctY(geom.height)} percent.`);
    });

    // Enter/click on Move or Resize has nothing to press — teach the keys
    // instead (this is also what a voice-control user lands on).
    const teach = (what) => () => say(`Use the arrow keys to ${what} the chat panel. With a screen reader, hold Alt and Shift with the arrow.`);
    if (moveBtn) moveBtn.addEventListener('click', teach('move'));
    if (resizeBtn) resizeBtn.addEventListener('click', teach('resize'));

    // ── Mobile split: the divider ──
    let split = 0.4;
    const storedSplit = parseFloat(localStorage.getItem(SPLIT_KEY) || '');
    if (!Number.isNaN(storedSplit)) split = storedSplit;

    let relayoutQueued = false;
    function applySplit(frac) {
        split = Math.min(Math.max(frac, SPLIT_MIN), SPLIT_MAX);
        if (main) main.style.setProperty('--chat-split-h', `${(split * 100).toFixed(1)}vh`);
        // The divider is a slider: the AT announces the value change itself
        // (that's the point of the role) — no say() here, or SR users would
        // hear everything twice.
        const pct = Math.round(split * 100);
        divider.setAttribute('aria-valuenow', String(pct));
        divider.setAttribute('aria-valuetext', `Chat ${pct}% of the screen`);
        // The map's height just changed without a window resize — retile, but
        // no more than once a frame while a drag streams pointermoves.
        if (!relayoutQueued) {
            relayoutQueued = true;
            requestAnimationFrame(() => { relayoutQueued = false; relayout(); });
        }
    }

    let splitDrag = null;
    divider.addEventListener('pointerdown', (e) => {
        splitDrag = true;
        divider.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    divider.addEventListener('pointermove', (e) => {
        if (!splitDrag) return;
        applySplit((window.innerHeight - e.clientY) / window.innerHeight);
    });
    const endSplitDrag = () => {
        if (!splitDrag) return;
        splitDrag = null;
        localStorage.setItem(SPLIT_KEY, split.toFixed(3));
    };
    divider.addEventListener('pointerup', endSplitDrag);
    divider.addEventListener('pointercancel', endSplitDrag);

    // Slider keys: arrows (also what a touch screen reader's adjust gesture
    // sends), PageUp/Down for coarse steps, Home/End for the extremes.
    divider.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.05;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') applySplit(split + step);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') applySplit(split - step);
        else if (e.key === 'PageUp') applySplit(split + 0.1);
        else if (e.key === 'PageDown') applySplit(split - 0.1);
        else if (e.key === 'Home') applySplit(SPLIT_MIN);
        else if (e.key === 'End') applySplit(SPLIT_MAX);
        else return;
        e.preventDefault();
        localStorage.setItem(SPLIT_KEY, split.toFixed(3));
    });

    // ── Settings toggle (desktop only — CSS hides it in split mode) ──
    function reflectToggle() {
        if (toggleBtn) toggleBtn.setAttribute('aria-pressed', String(on));
    }
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
        on = !on;
        localStorage.setItem(ON_KEY, on ? 'on' : 'off');
        reflectToggle();
        if (!mq.matches) {
            panel.hidden = !on;
            // A skip link must never lead to a hidden target (compass rule).
            if (skip) skip.hidden = !on;
        }
        say(on
            ? 'Chat panel on.'
            : 'Chat panel off. You can still talk to the map with the Speak button.');
    });

    // ── Mode: one source of truth, applied now and on every crossing ──
    function applyMode() {
        const isSplit = mq.matches;
        document.body.classList.toggle('chat-split', isSplit);
        if (isSplit) {
            divider.hidden = false;
            panel.hidden = false;      // always open on mobile
            applySplit(split);
        } else {
            divider.hidden = true;
            panel.hidden = !on;
            if (geom) { geom = clampGeom(geom); applyGeom(); }
        }
        // The skip link tracks the panel — but never appears before the gate
        // has revealed the app (the gate re-applies it on Start).
        if (skip) {
            const gate = document.getElementById('map-gate');
            skip.hidden = (gate && !gate.hidden) || panel.hidden;
        }
        reflectToggle();
        relayout();
    }
    mq.addEventListener('change', applyMode);

    // A resized window must never strand the floating panel off-screen.
    window.addEventListener('resize', () => {
        if (mq.matches || !geom) return;
        geom = clampGeom(geom);
        applyGeom();
    });

    applyMode();

    return {
        isOpen: () => !panel.hidden,
    };
}
