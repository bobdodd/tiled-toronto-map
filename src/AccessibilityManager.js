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
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Toggle rotor panel
        const rotorButton = document.querySelector('.rotor-button');
        const rotorPanel = document.getElementById('rotor-panel');
        
        rotorButton.addEventListener('click', () => {
            const isExpanded = rotorButton.getAttribute('aria-expanded') === 'true';
            rotorButton.setAttribute('aria-expanded', !isExpanded);
            rotorPanel.hidden = isExpanded;
        });
        
        // Handle rotor changes
        const rotorRadios = document.querySelectorAll('input[name="rotor"]');
        rotorRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.setRotor(e.target.value);
            });
        });
        
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.rotor-container')) {
                rotorButton.setAttribute('aria-expanded', 'false');
                rotorPanel.hidden = true;
            }
        });
        
        // Initialize with default rotor value
        this.updateTabOrder();
    }
    
    setRotor(value) {
        this.currentRotor = value;
        this.updateTabOrder();
        this.announceRotorChange(value);
    }
    
    updateTabOrder() {
        // First, remove all tabindex and role attributes from map features
        const allFeatures = document.querySelectorAll(
            '.building, .road, .transit-stop, .shop, .school, .worship, .park, .address'
        );
        
        allFeatures.forEach(element => {
            element.removeAttribute('tabindex');
            element.removeAttribute('role');
        });
        
        // If rotor is set to 'none', don't add any tabindex
        if (this.currentRotor === 'none') {
            this.announceFeatureCount(0);
            return;
        }
        
        // Get the selector for the current rotor setting
        const selector = this.featureSelectors[this.currentRotor];
        if (!selector) return;
        
        // Add tabindex to selected features
        const selectedFeatures = document.querySelectorAll(selector);
        let tabIndex = 100;
        let visibleCount = 0;
        
        selectedFeatures.forEach(element => {
            // Only add tabindex if element is visible
            if (element.style.visibility !== 'hidden') {
                element.setAttribute('tabindex', tabIndex);
                if (this.currentRotor === 'everything') {
                    element.setAttribute('role', 'button');
                }
                tabIndex++;
                visibleCount++;
            }
        });
        
        this.announceFeatureCount(visibleCount);
    }
    
    announceRotorChange(value) {
        const announcements = document.getElementById('map-announcements');
        const rotorNames = {
            'none': 'No features selected for navigation',
            'transit': 'Now navigating transit stops',
            'shops': 'Now navigating shops',
            'schools': 'Now navigating schools',
            'worship': 'Now navigating places of worship',
            'parks': 'Now navigating parks',
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