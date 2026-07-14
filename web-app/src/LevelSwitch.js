// Multi-level model (facet 1): the vertical-plane toggles.
//
// Toronto genuinely occupies several vertical planes — the Gardiner (elevated road)
// above, the PATH (underground pedestrian) below, and the subway/LRT tunnels below
// that. These are OVERLAYS, not mutually-exclusive states (Bob, 2026-06-23): the
// street level is on by default and the others switch on/off in any combination.
//
// The planes are driven CONVERSATIONALLY now — "show the PATH", "hide rail
// transit", typed or spoken (Chat.js intercepts them locally and calls set()
// through the app's map-command plumbing). The old Map Level accordion and its
// checkboxes are retired; this class owns the state itself.
//
// Each tile feature carries `data-level` for off-surface planes (surface is the
// default and is left untagged). set() toggles a `show-<plane>` class on
// #map-tiles; the CSS shows each plane only when its toggle is on (and hides the
// street level only if its toggle is off). It then asks the rotor to re-scope
// keyboard navigation to whatever is now visible, and announces the change.
export class LevelSwitch {
    constructor({ announce, onChange } = {}) {
        this.announce = announce || (() => {});
        this.onChange = onChange || (() => {});
        this.tiles = document.getElementById('map-tiles');
        this.labels = {
            surface: 'Street level',
            above: 'Elevated road',
            path: 'Underground walkway, the PATH',
            transit: 'Rail transit — subway, streetcar and LRT',
        };
        // Street on, overlays off — the same defaults the checkboxes carried.
        this.state = { surface: true, above: false, path: false, transit: false };
        for (const [plane, on] of Object.entries(this.state)) this.apply(plane, on, false);
    }

    /** Turn a plane on or off. Returns { changed, label, on } — changed:false
     *  when it was already in that state (the chat says so instead of
     *  re-announcing) — or null for an unknown plane. */
    set(plane, on) {
        if (!(plane in this.state)) return null;
        const label = this.labels[plane];
        if (this.state[plane] === !!on) return { changed: false, label, on: !!on };
        this.state[plane] = !!on;
        this.apply(plane, !!on, true);
        return { changed: true, label, on: !!on };
    }

    apply(plane, on, notify) {
        if (this.tiles) this.tiles.classList.toggle('show-' + plane, on);
        if (notify) {
            const name = this.labels[plane] || plane;
            this.announce(`${name} ${on ? 'shown' : 'hidden'}.`);
        }
        // Re-scope the rotor's keyboard navigation to what's now visible.
        this.onChange(plane, on);
    }
}
