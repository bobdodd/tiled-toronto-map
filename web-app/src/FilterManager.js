// FilterManager — drives the map filters from the taxonomy manifest.
//
// Two behaviours, decided by each feature's layer (see TaxonomyClient):
//   • base features (buildings, roads, water, parks, vegetation…) HIDE/SHOW.
//   • overlay features (POIs + accessibility attributes) HIGHLIGHT — they ride
//     on a base feature that must stay, so they're marked, not hidden, and the
//     rotor navigates them.
//
// Selectors and labels come from taxonomy.json, so this stays in lockstep with
// the tile generator (no more hand-maintained classMap).

export class FilterManager {
    constructor(taxonomy) {
        this.taxonomy = taxonomy;
        // Base categories show by default; overlays start off (highlight on demand).
        this.filters = {};
        for (const feature of taxonomy.features) {
            this.filters[feature.id] = taxonomy.layerOf(feature) === 'base';
        }
        this.setupEventListeners();
    }

    setupEventListeners() {
        for (const id of Object.keys(this.filters)) {
            const checkbox = document.getElementById(`filter-${id}`);
            if (checkbox) {
                checkbox.checked = this.filters[id];
                checkbox.addEventListener('change', (e) => this.toggleFilter(id, e.target.checked));
            }
        }
    }

    applyInitialVisibility() {
        for (const [id, enabled] of Object.entries(this.filters)) {
            this.updateVisibility(id, enabled);
        }
    }

    toggleFilter(id, enabled) {
        this.filters[id] = enabled;
        this.updateVisibility(id, enabled);
        this.announceFilterChange(id, enabled);
    }

    updateVisibility(id, enabled) {
        const feature = this.taxonomy.getById(id);
        if (!feature) return;
        const elements = document.querySelectorAll('#map-tiles ' + this.taxonomy.selectorFor(feature));
        if (this.taxonomy.layerOf(feature) === 'base') {
            elements.forEach((el) => { el.style.display = enabled ? '' : 'none'; });
        } else {
            // Overlay: highlight matching features without hiding their base geometry.
            elements.forEach((el) => { el.classList.toggle('filter-highlight', enabled); });
        }
    }

    announceFilterChange(id, enabled) {
        const region = document.getElementById('map-announcements');
        if (!region) return;
        const feature = this.taxonomy.getById(id);
        const label = (feature && feature.label) || id;
        const isBase = feature && this.taxonomy.layerOf(feature) === 'base';
        const verb = isBase
            ? (enabled ? 'shown' : 'hidden')
            : (enabled ? 'highlighted' : 'highlight cleared');
        // Clear then set so identical consecutive toggles still announce.
        region.textContent = '';
        region.textContent = `${label} ${verb}`;
    }
}
