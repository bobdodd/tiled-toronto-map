// Map search — type-ahead over the OpenSearch `map-features` index built from
// the same OSM extract the tiles come from. Finds named places, POIs (washrooms,
// post boxes, benches, …) and street addresses, and lets you constrain to
// accessible ones (wheelchair, tactile paving, accessible toilets, …) from the
// very first query: this is an accessibility map, so "find the ACCESSIBLE thing"
// is the primary verb, not a refinement bolted on later.
//
// The viewer is otherwise passive (it only fetches finished tiles). Search adds
// one network dependency: a same-origin proxy (/api/map-search) in front of
// OpenSearch, so the browser never talks to the search cluster directly. A
// `?api=<origin>` query param repoints it for local testing against a deployed
// API, mirroring SVGTileManager's `?tiles=` override.
//
// Selecting a result recentres the map on it and moves keyboard/screen-reader
// focus onto the actual feature in the tile (which carries role="img" +
// aria-label), so the sticky tooltip and focus outline light up exactly as they
// do for ordinary keyboard navigation. Addresses with no drawn feature simply
// recentre.

const DEFAULT_API = '/api/map-search';
const API_URL = (() => {
    if (typeof window === 'undefined') return DEFAULT_API;
    const override = new URLSearchParams(window.location.search).get('api');
    if (!override) return DEFAULT_API;
    const base = override.endsWith('/') ? override.slice(0, -1) : override;
    return base + DEFAULT_API;
})();

// User-facing accessibility filters → the OSM tags the index stores. Kept short
// and concrete; the API maps each to "tag present and not an explicit 'no'".
const A11Y_FILTERS = [
    { tag: 'wheelchair', label: 'Wheelchair accessible' },
    { tag: 'toilets:wheelchair', label: 'Accessible toilet' },
    { tag: 'tactile_paving', label: 'Tactile paving' },
    { tag: 'ramp', label: 'Ramp' },
    { tag: 'handrail', label: 'Handrail' },
    { tag: 'automatic_door', label: 'Automatic door' },
];

// Human phrases for the access values we surface on a result. Only positive
// values become badges (a feature tagged wheelchair=no is not advertised as
// accessible).
const A11Y_BADGES = {
    wheelchair: 'Wheelchair accessible',
    'toilets:wheelchair': 'Accessible toilet',
    tactile_paving: 'Tactile paving',
    ramp: 'Ramp',
    handrail: 'Handrail',
    automatic_door: 'Automatic door',
    braille: 'Braille',
    hearing_loop: 'Hearing loop',
    induction_loop: 'Hearing loop',
    audio_loop: 'Hearing loop',
};
const NEGATIVE = new Set(['no', 'none', 'false', '0']);

// Tabindex bands stay consistent with the rest of the viewer (header < map
// controls < map). Search lives in the header band: input 4, button 5, then the
// a11y filters and result buttons follow here.
const TAB_FILTERS = 6;     // 6..(6+filters)
const TAB_RESULTS = 30;    // 30.. (one per shown result)
const RESULT_LIMIT = 20;   // matches the API's default page size

export class SearchManager {
    /**
     * @param {object} opts
     * @param {() => {lat:number,lng:number}} opts.getCenter  current map centre (for distance bias)
     * @param {(result:object) => void} opts.onSelect          navigate + focus a chosen result
     * @param {(msg:string) => void} [opts.announce]           optional extra status announcer
     */
    constructor({ getCenter, onSelect, announce }) {
        this.getCenter = getCenter;
        this.onSelect = onSelect;
        this.announceExtra = announce || (() => {});
        this.input = document.getElementById('destination-input');
        this.button = document.getElementById('search-button');
        this.controller = null;     // in-flight fetch, abortable
        this.debounceTimer = null;
        this.activeTags = new Set();

        if (!this.input || !this.button) return;
        this.build();
        this.wire();
    }

    // Inject the filter set, status region and results list around the existing
    // input/button. Built in JS so index.html stays declarative-minimal.
    build() {
        const host = document.getElementById('destination-search');

        const filters = document.createElement('fieldset');
        filters.className = 'search-a11y-filters';
        const legend = document.createElement('legend');
        legend.textContent = 'Only show accessible';
        filters.appendChild(legend);
        A11Y_FILTERS.forEach((f, i) => {
            const id = `a11y-filter-${f.tag.replace(/[^a-z]/g, '-')}`;
            const wrap = document.createElement('div');
            wrap.className = 'search-a11y-filter';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = id;
            cb.value = f.tag;
            cb.tabIndex = TAB_FILTERS + i;
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = f.label;
            wrap.append(cb, label);
            filters.appendChild(wrap);
        });
        host.appendChild(filters);

        // Polite count announcement, separate from the map's own live regions so
        // result counts don't collide with rotor / status messages.
        this.status = document.createElement('p');
        this.status.className = 'search-status screen-reader-only';
        this.status.setAttribute('aria-live', 'polite');
        this.status.setAttribute('aria-atomic', 'true');
        host.appendChild(this.status);

        this.results = document.createElement('ul');
        this.results.className = 'search-results';
        this.results.setAttribute('role', 'list');
        host.appendChild(this.results);
    }

    wire() {
        this.button.addEventListener('click', () => this.run(true));
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.run(true); }
            // ArrowDown from the field jumps into the first result for fast
            // keyboard use.
            if (e.key === 'ArrowDown') {
                const first = this.results.querySelector('button');
                if (first) { e.preventDefault(); first.focus(); }
            }
        });
        // Debounced type-ahead.
        this.input.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.run(false), 300);
        });
        // Re-run when an accessibility filter is toggled.
        this.input.closest('#destination-search')
            .querySelectorAll('.search-a11y-filters input[type="checkbox"]')
            .forEach((cb) => cb.addEventListener('change', () => {
                if (cb.checked) this.activeTags.add(cb.value);
                else this.activeTags.delete(cb.value);
                this.run(false);
            }));
    }

    async run(fromUser) {
        const q = this.input.value.trim();
        const access = [...this.activeTags];

        if (q.length < 2 && access.length === 0) {
            this.clearResults();
            if (fromUser) this.setStatus('Type at least two characters to search.');
            return;
        }

        const params = new URLSearchParams();
        if (q.length >= 2) params.set('q', q);
        if (access.length) params.set('access', access.join(','));
        const c = this.getCenter && this.getCenter();
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
            params.set('lat', String(c.lat));
            params.set('lng', String(c.lng));
        }

        // Cancel any earlier in-flight request so fast typing can't deliver
        // stale results out of order.
        if (this.controller) this.controller.abort();
        this.controller = new AbortController();

        let data;
        try {
            const res = await fetch(`${API_URL}?${params.toString()}`, { signal: this.controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Map search failed:', err);
            this.clearResults();
            this.setStatus('Search is unavailable right now.');
            return;
        }

        this.renderResults(data.results || [], q);
    }

    renderResults(results, q) {
        this.clearResults();

        if (results.length === 0) {
            this.setStatus(q ? `No results for “${q}”.` : 'No matching places.');
            return;
        }

        const shown = results.slice(0, RESULT_LIMIT);
        shown.forEach((r, i) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result';
            btn.tabIndex = TAB_RESULTS + i;
            btn.dataset.osmId = r.id;

            const name = document.createElement('span');
            name.className = 'search-result-name';
            name.textContent = r.display || '(unnamed)';
            btn.appendChild(name);

            const detail = this.detailLine(r);
            if (detail) {
                const d = document.createElement('span');
                d.className = 'search-result-detail';
                d.textContent = detail;
                btn.appendChild(d);
            }

            const badges = this.a11yBadges(r.access);
            badges.forEach((text) => {
                const b = document.createElement('span');
                b.className = 'search-result-a11y';
                b.textContent = text;
                btn.appendChild(b);
            });

            btn.addEventListener('click', () => this.onSelect(r));
            li.appendChild(btn);
            this.results.appendChild(li);
        });

        const n = shown.length;
        const more = results.length > n ? ` (showing first ${n})` : '';
        this.setStatus(`${results.length} result${results.length === 1 ? '' : 's'}${more}.`);
    }

    // A short context line: human category + address when we have one.
    detailLine(r) {
        const bits = [];
        const cat = r.subtype || r.category;
        if (cat) bits.push(cat.replace(/_/g, ' '));
        if (r.address) {
            const a = [r.address.housenumber, r.address.street].filter(Boolean).join(' ');
            if (a) bits.push(a);
        }
        return bits.join(' · ');
    }

    a11yBadges(access) {
        if (!access) return [];
        const seen = new Set();
        const out = [];
        for (const [tag, val] of Object.entries(access)) {
            const phrase = A11Y_BADGES[tag];
            if (!phrase) continue;
            if (NEGATIVE.has(String(val).toLowerCase())) continue;
            if (seen.has(phrase)) continue;
            seen.add(phrase);
            out.push(phrase);
        }
        return out;
    }

    clearResults() {
        while (this.results.firstChild) this.results.removeChild(this.results.firstChild);
    }

    setStatus(msg) {
        this.status.textContent = '';
        this.status.textContent = msg;
    }
}
