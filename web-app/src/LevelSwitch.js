// Multi-level model (facet 1): the vertical-plane toggles.
//
// Toronto genuinely occupies several vertical planes — the Gardiner (elevated road)
// above, the PATH (underground pedestrian) below, and the subway/LRT tunnels below
// that. These are OVERLAYS, not mutually-exclusive states, so each is an independent
// CHECKBOX (Bob, 2026-06-23): the street level is on by default and the others switch
// on/off in any combination.
//
// Each tile feature carries `data-level` for off-surface planes (surface is the
// default and is left untagged). This switcher just toggles a `show-<plane>` class on
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
        document.querySelectorAll('input[name="map-level"]').forEach((box) => {
            this.apply(box.value, box.checked, false);   // seed from the HTML checked state
            box.addEventListener('change', () => this.apply(box.value, box.checked, true));
        });
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
