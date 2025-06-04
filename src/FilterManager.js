export class FilterManager {
    constructor() {
        this.filters = {
            buildings: true,
            roads: true,
            transit: true,
            shops: true,
            schools: true,
            worship: true,
            parks: true,
            addresses: true
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Toggle filter panel
        const filterButton = document.querySelector('.filter-button');
        const filterPanel = document.getElementById('filter-panel');
        
        filterButton.addEventListener('click', () => {
            const isExpanded = filterButton.getAttribute('aria-expanded') === 'true';
            filterButton.setAttribute('aria-expanded', !isExpanded);
            filterPanel.hidden = isExpanded;
        });
        
        // Handle filter changes
        Object.keys(this.filters).forEach(filterType => {
            const checkbox = document.getElementById(`filter-${filterType}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.toggleFilter(filterType, e.target.checked);
                });
            }
        });
        
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-container')) {
                filterButton.setAttribute('aria-expanded', 'false');
                filterPanel.hidden = true;
            }
        });
    }
    
    toggleFilter(featureType, enabled) {
        this.filters[featureType] = enabled;
        this.updateVisibility(featureType, enabled);
        this.announceFilterChange(featureType, enabled);
    }
    
    updateVisibility(featureType, visible) {
        // Map feature types to CSS classes
        const classMap = {
            buildings: '.building',
            roads: '.road, .road-casing',  // Include both road and casing
            transit: '.transit-stop',
            shops: '.shop',
            schools: '.school',
            worship: '.worship',
            parks: '.park',
            addresses: '.address'
        };
        
        const selector = classMap[featureType];
        if (!selector) return;
        
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.style.visibility = visible ? 'visible' : 'hidden';
        });
    }
    
    announceFilterChange(featureType, enabled) {
        const announcements = document.getElementById('map-announcements');
        const featureNames = {
            buildings: 'Buildings',
            roads: 'Roads',
            transit: 'Transit stops',
            shops: 'Shops',
            schools: 'Schools',
            worship: 'Places of worship',
            parks: 'Parks and recreation',
            addresses: 'Addresses'
        };
        
        const featureName = featureNames[featureType] || featureType;
        const action = enabled ? 'added to' : 'removed from';
        announcements.textContent = `${featureName} ${action} map`;
    }
    
    getActiveFilters() {
        return Object.entries(this.filters)
            .filter(([_, enabled]) => enabled)
            .map(([type, _]) => type);
    }
}