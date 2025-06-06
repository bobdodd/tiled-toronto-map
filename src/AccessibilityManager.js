export class AccessibilityManager {
    constructor() {
        this.currentRotor = 'none';
        this.featureSelectors = {
            'none': null,
            'transit': '.transit-stop',
            'shops': '.shop',
            'schools': '.school',
            'worship': '.worship',
            'parks': '.park',
            'everything': '.building, .road, .transit-stop, .shop, .school, .worship, .park, .address'
        };
        
        this.SVG_NS = 'http://www.w3.org/2000/svg';
        this.focusOutline = null;
        this.currentFocusedElement = null;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Handle rotor changes - now inside accordion
        const rotorRadios = document.querySelectorAll('input[name="rotor"]');
        rotorRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.setRotor(e.target.value);
            });
        });
        
        // Initialize with default rotor value
        this.updateTabOrder();
        
        // Setup focus handling for map features
        this.setupFocusHandling();
    }
    
    setupFocusHandling() {
        // Create focus outline element
        this.focusOutline = document.createElementNS(this.SVG_NS, 'g');
        this.focusOutline.setAttribute('id', 'focus-outline');
        this.focusOutline.setAttribute('aria-hidden', 'true');
        this.focusOutline.style.pointerEvents = 'none';
        
        // Wait a bit to ensure features are loaded, then add focus outline
        setTimeout(() => {
            const mapFeatures = document.querySelector('#map-features');
            if (mapFeatures) {
                // Always append as last child to ensure it's on top
                mapFeatures.appendChild(this.focusOutline);
            }
        }, 500);
        
        // Listen for focus events on the map
        const mapSvg = document.querySelector('#map-svg');
        mapSvg.addEventListener('focusin', (e) => this.handleFocusIn(e), true); // Use capture
        mapSvg.addEventListener('focusout', (e) => this.handleFocusOut(e), true); // Use capture
        
        // Also listen on document level for better compatibility
        document.addEventListener('focus', (e) => {
            if (e.target.closest('#map-features') && this.isMapFeature(e.target)) {
                this.handleFocusIn(e);
            }
        }, true);
        
        // Listen for mouse events
        mapSvg.addEventListener('mouseover', (e) => this.handleMouseOver(e));
        mapSvg.addEventListener('mouseout', (e) => this.handleMouseOut(e));
    }
    
    handleFocusIn(event) {
        const target = event.target;
        console.log('Focus in:', target);
        if (this.isMapFeature(target)) {
            this.showFocusOutline(target);
        }
    }
    
    handleFocusOut(event) {
        // Remove focus outline
        this.hideFocusOutline();
    }
    
    handleMouseOver(event) {
        const target = event.target;
        if (this.isMapFeature(target)) {
            this.showFocusOutline(target);
        }
    }
    
    handleMouseOut(event) {
        const target = event.target;
        if (target === this.currentFocusedElement) {
            this.hideFocusOutline();
        }
    }
    
    isMapFeature(element) {
        if (!element) return false;
        
        // Check if it's a group element with tabindex
        if (element.tagName === 'g' && element.hasAttribute('tabindex')) {
            return true;
        }
        
        // Also check individual features for mouse hover
        if (element.classList) {
            // Don't show focus on road casings (they're just the outline)
            if (element.classList.contains('road-casing')) return false;
            const featureClasses = [
                'building', 'road', 'transit-stop', 'shop', 'school', 'worship', 'park', 'address',
                'accessible-toilet', 'accessible-parking', 'drinking-water', 'bench', 'shelter',
                'crossing', 'curb-cut', 'elevator', 'steps', 'tactile-paving', 'audio-signal',
                'tactile-map', 'digital-clock', 'info-point', 'emergency-phone', 'defibrillator',
                'accessible-medical', 'barrier'
            ];
            return featureClasses.some(cls => element.classList.contains(cls));
        }
        
        return false;
    }
    
    showFocusOutline(element) {
        this.currentFocusedElement = element;
        
        // Ensure focus outline exists and is in the DOM
        if (!this.focusOutline || !this.focusOutline.parentNode) {
            const mapFeatures = document.querySelector('#map-features');
            if (mapFeatures && this.focusOutline) {
                mapFeatures.appendChild(this.focusOutline);
            }
        }
        
        // Clear existing outline
        while (this.focusOutline.firstChild) {
            this.focusOutline.removeChild(this.focusOutline.firstChild);
        }
        
        // Handle group elements (keyboard focus)
        if (element.tagName === 'g') {
            // Get all visible children in the group
            const children = Array.from(element.children).filter(child => 
                child.style.visibility !== 'hidden' && 
                !child.classList.contains('road-casing')
            );
            
            // Create outlines for all children in the group
            children.forEach(child => {
                this.createOutlineForElement(child);
            });
        } else {
            // Handle individual elements (mouse hover)
            this.createOutlineForElement(element);
        }
        
        // Ensure focus outline is visible
        this.ensureFocusOutlineOnTop();
    }
    
    createOutlineForElement(element) {
        let outlineElement;
        
        if (element.tagName === 'polygon') {
            outlineElement = document.createElementNS(this.SVG_NS, 'polygon');
            outlineElement.setAttribute('points', element.getAttribute('points'));
        } else if (element.tagName === 'polyline') {
            outlineElement = document.createElementNS(this.SVG_NS, 'polyline');
            outlineElement.setAttribute('points', element.getAttribute('points'));
        } else if (element.tagName === 'circle') {
            outlineElement = document.createElementNS(this.SVG_NS, 'circle');
            outlineElement.setAttribute('cx', element.getAttribute('cx'));
            outlineElement.setAttribute('cy', element.getAttribute('cy'));
            const radius = parseFloat(element.getAttribute('r') || 5);
            outlineElement.setAttribute('r', radius + 3); // Add offset
        }
        
        if (outlineElement) {
            // Style the outline
            outlineElement.setAttribute('fill', 'none');
            outlineElement.setAttribute('stroke', '#0066ff');
            outlineElement.setAttribute('stroke-width', '4');
            outlineElement.setAttribute('stroke-linejoin', 'round');
            outlineElement.setAttribute('stroke-linecap', 'round');
            outlineElement.setAttribute('vector-effect', 'non-scaling-stroke');
            
            // For polygons and polylines, add a slight scale transform to offset from shape
            if (element.tagName !== 'circle') {
                try {
                    // Calculate center of element
                    const bbox = element.getBBox();
                    const centerX = bbox.x + bbox.width / 2;
                    const centerY = bbox.y + bbox.height / 2;
                    
                    // Apply slight scale from center
                    outlineElement.setAttribute('transform', `translate(${centerX}, ${centerY}) scale(1.1) translate(${-centerX}, ${-centerY})`);
                } catch (e) {
                    // If getBBox fails, skip transform
                    console.warn('Could not calculate bbox for element:', e);
                }
            }
            
            // Add a second, lighter outline for better visibility
            const outerOutline = outlineElement.cloneNode(true);
            outerOutline.setAttribute('stroke', '#4d94ff');
            outerOutline.setAttribute('stroke-width', '8');
            outerOutline.setAttribute('opacity', '0.4');
            
            this.focusOutline.appendChild(outerOutline);
            this.focusOutline.appendChild(outlineElement);
        }
    }
    
    hideFocusOutline() {
        this.currentFocusedElement = null;
        while (this.focusOutline.firstChild) {
            this.focusOutline.removeChild(this.focusOutline.firstChild);
        }
    }
    
    setRotor(value) {
        this.currentRotor = value;
        this.updateTabOrder();
        this.announceRotorChange(value);
    }
    
    updateTabOrder() {
        // First, remove all tabindex from ALL g elements in map-features
        const allGroups = document.querySelectorAll('#map-features g[tabindex]');
        allGroups.forEach(element => {
            element.removeAttribute('tabindex');
            element.removeAttribute('role');
        });
        
        // If rotor is set to 'none', don't add any tabindex
        if (this.currentRotor === 'none') {
            this.announceFeatureCount(0);
            return;
        }
        
        // Map rotor values to feature class selectors
        const featureSelectors = {
            // Category groups
            'buildings': '.building-feature',
            'transportation': '.road-feature, .transit-feature',
            'education': '.school-feature',
            'commerce': '.shop-feature',
            'recreation': '.park-feature',
            'worship': '.worship-feature',
            'addresses': '.address-feature',
            // Individual feature types
            'transit': '.transit-feature',
            'shops': '.shop-feature',
            'schools': '.school-feature',
            'parks': '.park-feature',
            // Accessibility feature groups
            'accessibility-all': '.accessible-toilet-feature, .accessible-parking-feature, .drinking-water-feature, .bench-feature, .shelter-feature, .crossing-feature, .curb-cut-feature, .elevator-feature, .steps-feature, .tactile-paving-feature, .audio-signal-feature, .tactile-map-feature, .digital-clock-feature, .info-point-feature, .emergency-phone-feature, .defibrillator-feature, .accessible-medical-feature, .barrier-feature',
            'essential-navigation': '.crossing-feature, .curb-cut-feature, .elevator-feature, .tactile-paving-feature',
            'public-facilities': '.accessible-toilet-feature, .accessible-parking-feature, .drinking-water-feature, .bench-feature, .shelter-feature',
            'emergency-features': '.emergency-phone-feature, .defibrillator-feature, .accessible-medical-feature',
            'everything': '.building-feature, .road-feature, .transit-feature, .shop-feature, .school-feature, .worship-feature, .park-feature, .address-feature, .accessible-toilet-feature, .accessible-parking-feature, .drinking-water-feature, .bench-feature, .shelter-feature, .crossing-feature, .curb-cut-feature, .elevator-feature, .steps-feature, .tactile-paving-feature, .audio-signal-feature, .tactile-map-feature, .digital-clock-feature, .info-point-feature, .emergency-phone-feature, .defibrillator-feature, .accessible-medical-feature, .barrier-feature'
        };
        
        const selector = featureSelectors[this.currentRotor];
        if (!selector) return;
        
        // Get all individual feature groups
        const featureGroups = document.querySelectorAll(selector);
        let tabIndex = 100; // Start tabindex at 100 to come after UI controls
        let visibleCount = 0;
        
        console.log(`Setting tabindex for rotor '${this.currentRotor}', found ${featureGroups.length} feature groups`);
        
        featureGroups.forEach(featureGroup => {
            // Check if the feature group is visible
            const children = Array.from(featureGroup.children);
            const hasVisibleChildren = children.some(child => 
                child.style.visibility !== 'hidden'
            );
            
            if (hasVisibleChildren) {
                featureGroup.setAttribute('tabindex', tabIndex.toString());
                featureGroup.setAttribute('role', 'group');
                tabIndex++;
                visibleCount++;
            }
        });
        
        console.log(`Set tabindex on ${visibleCount} visible feature groups`);
        this.announceFeatureCount(visibleCount);
        
        // Ensure focus outline is always on top
        this.ensureFocusOutlineOnTop();
    }
    
    ensureFocusOutlineOnTop() {
        const mapFeatures = document.querySelector('#map-features');
        if (mapFeatures && this.focusOutline && this.focusOutline.parentNode === mapFeatures) {
            mapFeatures.appendChild(this.focusOutline);
        }
    }
    
    announceRotorChange(value) {
        const announcements = document.getElementById('map-announcements');
        const rotorNames = {
            'none': 'No features selected for navigation',
            // Category groups
            'buildings': 'Now navigating buildings and infrastructure',
            'transportation': 'Now navigating transportation features',
            'education': 'Now navigating education and culture features',
            'commerce': 'Now navigating commerce and services',
            'recreation': 'Now navigating recreation and nature features',
            'worship': 'Now navigating places of worship',
            'addresses': 'Now navigating addresses and navigation points',
            // Individual feature types
            'transit': 'Now navigating transit stops only',
            'shops': 'Now navigating shops only',
            'schools': 'Now navigating schools only',
            'parks': 'Now navigating parks only',
            // Accessibility feature groups
            'accessibility-all': 'Now navigating all accessibility features',
            'essential-navigation': 'Now navigating essential navigation features: crossings, ramps, elevators, tactile paving',
            'public-facilities': 'Now navigating public accessibility facilities: toilets, parking, water, benches, shelters',
            'emergency-features': 'Now navigating emergency accessibility features: phones, defibrillators, medical facilities',
            'everything': 'Now navigating all map features'
        };
        
        announcements.textContent = rotorNames[value] || `Now navigating ${value}`;
    }
    
    announceFeatureCount(count) {
        const announcements = document.getElementById('map-announcements');
        
        setTimeout(() => {
            if (count === 0) {
                announcements.textContent += '. No features available to navigate.';
            } else if (count === 1) {
                announcements.textContent += '. 1 feature available.';
            } else {
                announcements.textContent += `. ${count} features available.`;
            }
        }, 100);
    }
    
    getCurrentRotor() {
        return this.currentRotor;
    }
}