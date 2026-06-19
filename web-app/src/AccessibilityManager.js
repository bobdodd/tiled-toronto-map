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
                this.updateTabOrder();
            });
        });
        
        // Handle Clear All button
        const clearAllButton = document.querySelector('.clear-all-rotor');
        if (clearAllButton) {
            clearAllButton.addEventListener('click', () => {
                rotorCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                this.updateTabOrder();
            });
        }
        
        // Handle "Everything" checkbox
        const everythingCheckbox = document.querySelector('input[name="rotor-quick"][value="everything"]');
        if (everythingCheckbox) {
            everythingCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    // Check all category checkboxes
                    document.querySelectorAll('input[name="rotor-category"]').forEach(cb => {
                        cb.checked = true;
                    });
                }
                this.updateTabOrder();
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
        }
        
        if (outlineElement) {
            // Get the element's transform and parent transforms to position outline correctly
            let transformList = [];
            let currentElement = element;
            
            // Collect all transforms up to the SVG root
            while (currentElement && currentElement.tagName !== 'svg') {
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
            
            // For polygons and polylines, add a slight scale transform to offset from shape
            if (element.tagName !== 'circle') {
                try {
                    // Calculate center of element in its local coordinate system
                    const bbox = element.getBBox();
                    const centerX = bbox.x + bbox.width / 2;
                    const centerY = bbox.y + bbox.height / 2;
                    
                    // Apply slight scale from center, preserving existing transforms
                    const existingTransform = outlineElement.getAttribute('transform') || '';
                    outlineElement.setAttribute('transform', 
                        `${existingTransform} translate(${centerX}, ${centerY}) scale(1.1) translate(${-centerX}, ${-centerY})`);
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
    
    updateTabOrder() {
        // Clear any previous rotor tab order from the tile features.
        document.querySelectorAll('#map-tiles [tabindex]').forEach((el) => el.removeAttribute('tabindex'));

        const region = document.getElementById('map-announcements');
        const announce = (msg) => { if (region) { region.textContent = ''; region.textContent = msg; } };

        const selectedIds = this.getSelectedRotorValues();
        if (selectedIds.length === 0 || !this.taxonomy) {
            announce('Rotor cleared.');
            return;
        }

        const labelOf = (id) => {
            const f = this.taxonomy.getById(id);
            return f ? (f.label || id) : id;
        };
        const selectors = selectedIds
            .map((id) => {
                const f = this.taxonomy.getById(id);
                return f ? this.taxonomy.selectorFor(f) : null;
            })
            .filter(Boolean);

        const names = selectedIds.map(labelOf).slice(0, 4).join(', ');
        if (selectors.length === 0) {
            announce(`Nothing to navigate for: ${names}`);
            return;
        }

        // Make ONLY the selected categories keyboard-navigable, in document order.
        // Positive tabindex is intentional (it narrows + orders map navigation — see
        // the project's rotor design); start at 100 to come after the UI controls.
        // The tile feature groups already carry role="img" + aria-label from the
        // generator, so focusing one announces its name.
        const elements = document.querySelectorAll('#map-tiles ' + selectors.join(', '));
        let tabIndex = 100;
        let count = 0;
        elements.forEach((el) => {
            // Skip features hidden by a base filter.
            if (el.closest('[style*="display: none"], [style*="display:none"]')) return;
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
    
    announceRotorChange(value) {
        const announcements = document.getElementById('map-announcements');
        const rotorNames = {
            'none': 'No features selected for navigation',
            // Category groups
            'buildings': 'Now navigating buildings and infrastructure',
            'transportation': 'Now navigating transportation features',
            'education': 'Now navigating education features',
            'entertainment': 'Now navigating entertainment and culture features',
            'emergency-services': 'Now navigating emergency services',
            'commerce': 'Now navigating commerce and services',
            'tourism': 'Now navigating accommodation and tourism features',
            'recreation': 'Now navigating recreation and nature features',
            'worship': 'Now navigating places of worship',
            'addresses': 'Now navigating addresses and navigation points',
            'historic-features': 'Now navigating historic features',
            'manmade-structures': 'Now navigating man-made structures',
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
    
    announceSelectedCategories(selectedValues) {
        const announcements = document.getElementById('map-announcements');
        
        const categoryNames = {
            // Categories
            'addresses': 'Addresses',
            'barriers': 'Barriers',
            'buildings': 'Buildings',
            'commerce': 'Commerce',
            'education': 'Education',
            'emergency-services': 'Emergency Services',
            'entertainment': 'Entertainment',
            'healthcare': 'Healthcare',
            'historic-features': 'Historic Features',
            'manmade-structures': 'Man-made Structures',
            'natural-features': 'Natural Features',
            'worship': 'Places of Worship',
            'recreation': 'Recreation',
            'tourism': 'Tourism',
            'transportation': 'Transportation',
            'waterways': 'Waterways',
            // Individual types
            'hospitals': 'Hospitals',
            'parks': 'Parks',
            'pharmacies': 'Pharmacies',
            'schools': 'Schools',
            'shops': 'Shops',
            'transit': 'Transit Stops',
            // Accessibility
            'accessibility-all': 'All Accessibility',
            'emergency-features': 'Emergency Features',
            'essential-navigation': 'Essential Navigation',
            'public-facilities': 'Public Facilities',
            'everything': 'Everything'
        };
        
        const names = selectedValues.map(v => categoryNames[v] || v).join(', ');
        if (names) {
            announcements.textContent = `Navigating: ${names}`;
        } else {
            announcements.textContent = 'No categories selected for navigation';
        }
    }
    
    getCurrentRotor() {
        return this.getSelectedRotorValues();
    }
}