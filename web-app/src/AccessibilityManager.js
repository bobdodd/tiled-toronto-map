export class AccessibilityManager {
    constructor(taxonomy) {
        this.taxonomy = taxonomy;
        this.currentRotor = 'none';
        // The rotor derives its keyboard-navigation targets from the taxonomy
        // (taxonomy.json) in updateTabOrder() — the single source of truth.

        this.SVG_NS = 'http://www.w3.org/2000/svg';
        this.focusOutline = null;
        this.currentFocusedElement = null;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Handle rotor changes - now checkboxes in accordion
        const rotorCheckboxes = document.querySelectorAll('input[type="checkbox"][id^="rotor-"]');
        rotorCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateTabOrder(true);
            });
        });
        
        // Handle Clear All button
        const clearAllButton = document.querySelector('.clear-all-rotor');
        if (clearAllButton) {
            clearAllButton.addEventListener('click', () => {
                rotorCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                this.updateTabOrder(true);
            });
        }

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
            // Try to add to map-labels (highest layer) first, then map-features
            const mapLabels = document.querySelector('#map-labels');
            const mapFeatures = document.querySelector('#map-features');
            if (mapLabels) {
                mapLabels.appendChild(this.focusOutline);
            } else if (mapFeatures) {
                mapFeatures.appendChild(this.focusOutline);
            }
        }, 500);
        
        // Listen for focus events on the map
        const mapSvg = document.querySelector('#map-svg');
        mapSvg.addEventListener('focusin', (e) => this.handleFocusIn(e), true); // Use capture
        mapSvg.addEventListener('focusout', (e) => this.handleFocusOut(e), true); // Use capture
        
        // Also listen on document level for better compatibility
        document.addEventListener('focus', (e) => {
            if ((e.target.closest('#map-features') || e.target.closest('#map-tiles')) && this.isMapFeature(e.target)) {
                this.handleFocusIn(e);
            }
        }, true);
        
        // Listen for mouse events on tile features
        mapSvg.addEventListener('mouseover', (e) => this.handleMouseOver(e));
        mapSvg.addEventListener('mouseout', (e) => this.handleMouseOut(e));
    }
    
    handleFocusIn(event) {
        const target = event.target;
        if (this.isMapFeature(target)) {
            this.showFocusOutline(target);
        }
    }
    
    handleFocusOut() {
        // Remove focus outline
        this.hideFocusOutline();
    }
    
    handleMouseOver(event) {
        const target = event.target;
        // Show outline on hover for ANY map feature, not just those with tabindex
        if (this.isMapFeatureForHover(target)) {
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
        
        // For keyboard focus - only features with tabindex
        if (element.hasAttribute('tabindex')) {
            return true;
        }
        
        return false;
    }
    
    isMapFeatureForHover(element) {
        if (!element) return false;
        
        // Don't show hover on the focus outline itself
        if (element.closest('#focus-outline')) return false;
        
        // Check if it's any SVG shape element that could be a map feature
        const shapeElements = ['polygon', 'polyline', 'circle', 'path', 'rect'];
        if (!shapeElements.includes(element.tagName)) return false;
        
        // Skip if it's in a defs section or is a pattern/gradient
        if (element.closest('defs')) return false;
        
        // Skip UI elements
        if (element.closest('.compass-navigator') || element.closest('.control-sidebar')) return false;
        
        // Also check individual features by class
        if (element.classList) {
            // Don't show focus on road casings (they're just the outline)
            if (element.classList.contains('road-casing')) return false;
            const featureClasses = [
                'building', 'road', 'transit-stop', 'shop', 'school', 'worship', 'park', 'address',
                'hospital', 'clinic', 'doctor', 'dentist', 'pharmacy', 'veterinary',
                'accessible-toilet', 'accessible-parking', 'drinking-water', 'bench', 'shelter',
                'crossing', 'curb-cut', 'elevator', 'steps', 'tactile-paving', 'audio-signal',
                'tactile-map', 'digital-clock', 'info-point', 'emergency-phone', 'defibrillator',
                'accessible-medical', 'barrier',
                'restaurant', 'cafe', 'fast-food', 'bar', 'pub', 'food-court',
                'hotel', 'hostel', 'guest-house', 'campsite', 'attraction', 'museum', 'gallery', 'viewpoint', 'tourist-info',
                'cinema', 'theatre', 'library', 'community-centre', 'arts-centre', 'sports-centre', 'swimming-pool', 'golf-course', 'stadium',
                'police-station', 'fire-station', 'emergency-phone', 'emergency-defibrillator',
                'monument', 'memorial', 'archaeological-site', 'castle', 'ruins',
                'bridge', 'tunnel', 'tower', 'mast', 'pier', 'breakwater',
                'river', 'stream', 'canal', 'ditch', 'coastline'
            ];
            // If it has a known feature class, it's definitely a feature
            if (featureClasses.some(cls => element.classList.contains(cls))) {
                return true;
            }
        }
        
        // For tile features, check if they're in a map layer
        const parent = element.parentElement;
        if (parent && parent.id) {
            // Check if it's in a feature layer
            const layerTypes = ['buildings', 'roads', 'transit', 'accessibility', 'water', 'parks', 
                               'accessible_facilities', 'sensory_accessibility', 'mobility_access', 
                               'accessible_transport'];
            if (layerTypes.some(type => parent.id.includes(type))) {
                return true;
            }
        }
        
        // Check if it's inside map-tiles or map-features
        if (element.closest('#map-tiles') || element.closest('#map-features')) {
            // It's likely a map feature if it's a shape in these containers
            return true;
        }
        
        return false;
    }
    
    showFocusOutline(element) {
        this.currentFocusedElement = element;
        
        // Ensure focus outline exists and is in the DOM
        if (!this.focusOutline || !this.focusOutline.parentNode) {
            // Try to add to map-labels (highest layer) first
            const mapLabels = document.querySelector('#map-labels');
            const mapFeatures = document.querySelector('#map-features');
            if (mapLabels && this.focusOutline) {
                mapLabels.appendChild(this.focusOutline);
            } else if (mapFeatures && this.focusOutline) {
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
            // Handle individual elements (mouse hover or direct focus)
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
        } else if (element.tagName === 'path') {
            // Area features (buildings, land, water multipolygons) render as <path>
            outlineElement = document.createElementNS(this.SVG_NS, 'path');
            outlineElement.setAttribute('d', element.getAttribute('d'));
        } else if (element.tagName === 'rect') {
            outlineElement = document.createElementNS(this.SVG_NS, 'rect');
            outlineElement.setAttribute('x', element.getAttribute('x'));
            outlineElement.setAttribute('y', element.getAttribute('y'));
            outlineElement.setAttribute('width', element.getAttribute('width'));
            outlineElement.setAttribute('height', element.getAttribute('height'));
        }
        
        if (outlineElement) {
            // Get the element's transform and parent transforms to position outline correctly
            let transformList = [];
            let currentElement = element;
            
            // Collect transforms from the feature up to the SHARED ancestor of the
            // feature and the outline (#map-rotate, or the svg root if there's no
            // rotation wrapper). The outline lives in #map-labels, a sibling subtree
            // under #map-rotate, so it already INHERITS #map-rotate's transform — if
            // we collected past it we'd apply the heading-up rotation twice.
            while (currentElement && currentElement.id !== 'map-rotate'
                   && currentElement.tagName !== 'svg') {
                if (currentElement.getAttribute('transform')) {
                    transformList.unshift(currentElement.getAttribute('transform'));
                }
                currentElement = currentElement.parentElement;
            }
            
            // Apply all collected transforms
            if (transformList.length > 0) {
                outlineElement.setAttribute('transform', transformList.join(' '));
            }
            
            // Style the outline
            outlineElement.setAttribute('fill', 'none');
            outlineElement.setAttribute('stroke', '#0066ff');
            outlineElement.setAttribute('stroke-width', '4');
            outlineElement.setAttribute('stroke-linejoin', 'round');
            outlineElement.setAttribute('stroke-linecap', 'round');
            outlineElement.setAttribute('vector-effect', 'non-scaling-stroke');
            
            // NOTE: previously the outline was scaled 1.1x from element.getBBox()'s
            // centre to sit just OUTSIDE the shape. But getBBox returns the FULL
            // geometry's box (ignoring the tile clip), so for a large / tile-clipped
            // feature the centre is far from the visible part and the scale visibly
            // OFFSET the outline from the boundary (Bob's screenshot). Dropped: the
            // outline now traces the exact geometry, and the non-scaling 4px + 8px
            // strokes straddle the boundary so it still reads as a ring.

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
    
    getSelectedRotorValues() {
        const selected = [];
        
        // Get all checked rotor checkboxes
        document.querySelectorAll('input[type="checkbox"][id^="rotor-"]:checked').forEach(checkbox => {
            // Use the checkbox ID without the "rotor-" prefix as the value
            const value = checkbox.id.replace('rotor-', '');
            selected.push(value);
        });
        
        return selected;
    }
    
    updateTabOrder(notify = false) {
        // Clear any previous rotor tab order from the tile features.
        document.querySelectorAll('#map-tiles [tabindex]').forEach((el) => el.removeAttribute('tabindex'));

        const region = document.getElementById('map-announcements');
        // Announce only on an explicit rotor change (notify=true) — NOT on the
        // silent refreshes that run as the viewport pans/zooms.
        const announce = (msg) => { if (notify && region) { region.textContent = ''; region.textContent = msg; } };

        const selectedIds = this.getSelectedRotorValues();

        // No rotor selection = no narrowing: EVERY on-screen feature is keyboard-
        // reachable by default (each feature group carries role="img" + aria-label
        // from the tile generator). Selecting rotor categories NARROWS Tab to just
        // those — the rotor is a lens, not a gate.
        let selectors;
        let names;
        if (selectedIds.length === 0 || !this.taxonomy) {
            selectors = ['[role="img"]'];
            names = 'all features';
        } else {
            const labelOf = (id) => {
                const f = this.taxonomy.getById(id);
                return f ? (f.label || id) : id;
            };
            selectors = selectedIds
                .map((id) => {
                    const f = this.taxonomy.getById(id);
                    return f ? this.taxonomy.selectorFor(f) : null;
                })
                .filter(Boolean);

            names = selectedIds.map(labelOf).slice(0, 4).join(', ');
            if (selectors.length === 0) {
                announce(`Nothing to navigate for: ${names}`);
                return;
            }
        }

        // Make ONLY the selected categories keyboard-navigable. Positive tabindex
        // is intentional: it authors the navigation path/circuit through the map
        // graph (which need not match DOM order) and narrows nav to the rotor's
        // selection. Start at 9000 — the "map" band, after the header (banner) and
        // map-controls (complementary) bands — so Tab flows controls -> features.
        // The tile feature groups already carry role="img" + aria-label from the
        // generator, so focusing one announces its name.
        // Only features visible in the current viewport may take focus — Tab must
        // never stop on off-screen content. This is re-run (debounced) as the
        // viewport pans/zooms, so the focusable set tracks what's on screen.
        const viewportEl = document.getElementById('map-svg');
        const vp = viewportEl ? viewportEl.getBoundingClientRect() : null;
        const onScreen = (el) => {
            if (!vp) return true;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 &&
                   r.right > vp.left && r.left < vp.right &&
                   r.bottom > vp.top && r.top < vp.bottom;
        };

        // Multi-level model: keyboard navigation follows whatever is VISIBLE. The
        // level checkboxes hide off-toggle planes with display:none, so those features
        // are zero-size and dropped by the onScreen check below — no separate
        // plane test needed. So Tab visits exactly the planes currently switched on
        // (e.g. street + Gardiner together), in any combination.
        const elements = document.querySelectorAll('#map-tiles ' + selectors.join(', '));
        let tabIndex = 9000;
        let count = 0;
        elements.forEach((el) => {
            // Skip features hidden by a base filter.
            if (el.closest('[style*="display: none"], [style*="display:none"]')) return;
            // Skip features outside the visible viewport (also skips display:none
            // off-toggle planes, which have zero size).
            if (!onScreen(el)) return;
            el.setAttribute('tabindex', String(tabIndex++));
            count++;
        });

        announce(`${count} feature${count === 1 ? '' : 's'} navigable — ${names}`);
        this.ensureFocusOutlineOnTop();
    }
    
    ensureFocusOutlineOnTop() {
        // Try to keep focus outline in the highest layer
        const mapLabels = document.querySelector('#map-labels');
        const mapFeatures = document.querySelector('#map-features');
        
        if (this.focusOutline && this.focusOutline.parentNode) {
            if (mapLabels) {
                mapLabels.appendChild(this.focusOutline);
            } else if (mapFeatures) {
                mapFeatures.appendChild(this.focusOutline);
            }
        }
    }
    
    getCurrentRotor() {
        return this.getSelectedRotorValues();
    }
}