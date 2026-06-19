export class Avatar {
    constructor(mapRenderer) {
        this.mapRenderer = mapRenderer;
        this.SVG_NS = 'http://www.w3.org/2000/svg';
        
        // Avatar state
        this.position = null; // { lat, lng }
        this.isRealLocation = false;
        this.element = null;
        this.containerGroup = null;
        
        // Avatar appearance settings
        this.baseSize = 40; // Base size in pixels at zoom 18
        this.color = '#4285F4'; // Google blue
        this.outlineColor = '#ffffff';
        
        this.init();
    }
    
    init() {
        // Create avatar container in the user-location group
        const userLocationGroup = document.querySelector('#user-location');
        if (!userLocationGroup) {
            console.error('User location group not found');
            return;
        }
        
        // Create container group for avatar
        this.containerGroup = document.createElementNS(this.SVG_NS, 'g');
        this.containerGroup.setAttribute('id', 'user-avatar');
        this.containerGroup.setAttribute('aria-label', 'Your location on the map');
        this.containerGroup.setAttribute('role', 'img');
        userLocationGroup.appendChild(this.containerGroup);
        
        // Create the avatar
        this.createAvatar();
        
        // Initially hide until we have a position
        this.hide();
    }
    
    createAvatar() {
        // Create a group for the avatar
        this.element = document.createElementNS(this.SVG_NS, 'g');
        this.element.setAttribute('class', 'map-avatar');
        
        // Create drop shadow filter
        const defs = document.createElementNS(this.SVG_NS, 'defs');
        const filter = document.createElementNS(this.SVG_NS, 'filter');
        filter.setAttribute('id', 'avatar-shadow');
        filter.setAttribute('x', '-50%');
        filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%');
        filter.setAttribute('height', '200%');
        
        const feGaussianBlur = document.createElementNS(this.SVG_NS, 'feGaussianBlur');
        feGaussianBlur.setAttribute('in', 'SourceAlpha');
        feGaussianBlur.setAttribute('stdDeviation', '3');
        
        const feOffset = document.createElementNS(this.SVG_NS, 'feOffset');
        feOffset.setAttribute('dx', '0');
        feOffset.setAttribute('dy', '2');
        feOffset.setAttribute('result', 'offsetblur');
        
        const feFlood = document.createElementNS(this.SVG_NS, 'feFlood');
        feFlood.setAttribute('flood-color', '#000000');
        feFlood.setAttribute('flood-opacity', '0.3');
        
        const feComposite = document.createElementNS(this.SVG_NS, 'feComposite');
        feComposite.setAttribute('in2', 'offsetblur');
        feComposite.setAttribute('operator', 'in');
        
        const feMerge = document.createElementNS(this.SVG_NS, 'feMerge');
        const feMergeNode1 = document.createElementNS(this.SVG_NS, 'feMergeNode');
        const feMergeNode2 = document.createElementNS(this.SVG_NS, 'feMergeNode');
        feMergeNode2.setAttribute('in', 'SourceGraphic');
        
        feMerge.appendChild(feMergeNode1);
        feMerge.appendChild(feMergeNode2);
        
        filter.appendChild(feGaussianBlur);
        filter.appendChild(feOffset);
        filter.appendChild(feFlood);
        filter.appendChild(feComposite);
        filter.appendChild(feMerge);
        defs.appendChild(filter);
        
        this.element.appendChild(defs);
        
        // Create the avatar shape - a teardrop/pin shape
        const avatarPath = document.createElementNS(this.SVG_NS, 'path');
        const pathData = this.createPinPath();
        avatarPath.setAttribute('d', pathData);
        avatarPath.setAttribute('fill', this.color);
        avatarPath.setAttribute('stroke', this.outlineColor);
        avatarPath.setAttribute('stroke-width', '3');
        avatarPath.setAttribute('filter', 'url(#avatar-shadow)');
        
        // Calculate current size
        const zoomScale = Math.pow(2, 18 - this.mapRenderer.zoom);
        const size = this.baseSize * zoomScale;
        
        // Create inner circle for the "head"
        const innerCircle = document.createElementNS(this.SVG_NS, 'circle');
        innerCircle.setAttribute('cx', '0');
        innerCircle.setAttribute('cy', -size/5);
        innerCircle.setAttribute('r', size/5);
        innerCircle.setAttribute('fill', this.outlineColor);
        
        // Create a smaller circle for the "face"
        const faceCircle = document.createElementNS(this.SVG_NS, 'circle');
        faceCircle.setAttribute('cx', '0');
        faceCircle.setAttribute('cy', -size/5);
        faceCircle.setAttribute('r', size/6.67);
        faceCircle.setAttribute('fill', this.color);
        
        // Add direction indicator (small triangle pointing forward)
        const directionIndicator = document.createElementNS(this.SVG_NS, 'path');
        directionIndicator.setAttribute('d', `M 0,-${size*0.35} L -${size*0.075},-${size*0.25} L ${size*0.075},-${size*0.25} Z`);
        directionIndicator.setAttribute('fill', this.outlineColor);
        
        // Assemble the avatar
        this.element.appendChild(avatarPath);
        this.element.appendChild(innerCircle);
        this.element.appendChild(faceCircle);
        this.element.appendChild(directionIndicator);
        
        // Add to container
        this.containerGroup.appendChild(this.element);
        
        // Add hover effect
        this.setupInteraction();
    }
    
    createPinPath() {
        // Create a teardrop/pin shape path
        // Calculate current size based on zoom to maintain visual consistency
        const zoomScale = Math.pow(2, 18 - this.mapRenderer.zoom);
        const size = this.baseSize * zoomScale;
        const w = size / 2;
        const h = size;
        
        return `M 0,0 
                C -${w * 0.8},-${h * 0.3} -${w * 0.8},-${h * 0.7} 0,-${h}
                C ${w * 0.8},-${h * 0.7} ${w * 0.8},-${h * 0.3} 0,0 Z`;
    }
    
    setupInteraction() {
        // Add hover effect
        this.element.style.cursor = 'pointer';
        this.element.style.transition = 'transform 0.2s ease';
        
        this.element.addEventListener('mouseenter', () => {
            this.element.style.transform = 'scale(1.1)';
        });
        
        this.element.addEventListener('mouseleave', () => {
            this.element.style.transform = '';
        });
        
        // Make it focusable
        this.element.setAttribute('tabindex', '0');
        this.element.setAttribute('aria-label', 
            this.isRealLocation ? 'Your current location' : 'Map center location');
        
        // Click to center map on avatar
        this.element.addEventListener('click', () => {
            if (this.position) {
                this.mapRenderer.setCenter(this.position.lat, this.position.lng);
                this.announceLocation();
            }
        });
        
        this.element.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (this.position) {
                    this.mapRenderer.setCenter(this.position.lat, this.position.lng);
                    this.announceLocation();
                }
            }
        });
    }
    
    setPosition(lat, lng, isRealLocation = false) {
        this.position = { lat, lng };
        this.isRealLocation = isRealLocation;
        
        // Update position
        this.updatePosition();
        
        // Update size for current zoom
        this.updateSize();
        
        // Update appearance based on location type
        this.updateAppearance();
        
        // Show the avatar
        this.show();
    }
    
    updatePosition() {
        if (!this.position || !this.containerGroup) return;
        
        // Get pixel coordinates for the position
        const pixelPos = this.mapRenderer.project(this.position.lat, this.position.lng);
        
        // Apply transform to position the avatar
        // No scaling needed - the SVG viewBox handles zoom
        this.containerGroup.setAttribute('transform', 
            `translate(${pixelPos.x}, ${pixelPos.y})`);
    }
    
    updateAppearance() {
        const avatarPath = this.element.querySelector('path');
        const faceCircle = this.element.querySelectorAll('circle')[1];
        
        if (this.isRealLocation) {
            // Real location - use blue
            this.color = '#4285F4';
            avatarPath.setAttribute('fill', this.color);
            faceCircle.setAttribute('fill', this.color);
            this.element.setAttribute('aria-label', 'Your current location');
            
            // Add pulsing animation for real location
            this.addPulseAnimation();
        } else {
            // Mock/center location - use gray
            this.color = '#757575';
            avatarPath.setAttribute('fill', this.color);
            faceCircle.setAttribute('fill', this.color);
            this.element.setAttribute('aria-label', 'Map center location');
            
            // Remove pulsing animation
            this.removePulseAnimation();
        }
    }
    
    addPulseAnimation() {
        // Remove existing animation if any
        this.removePulseAnimation();
        
        // Calculate current size
        const zoomScale = Math.pow(2, 18 - this.mapRenderer.zoom);
        const size = this.baseSize * zoomScale;
        
        // Create pulse animation
        const pulseCircle = document.createElementNS(this.SVG_NS, 'circle');
        pulseCircle.setAttribute('cx', '0');
        pulseCircle.setAttribute('cy', '0');
        pulseCircle.setAttribute('r', size/2);
        pulseCircle.setAttribute('fill', 'none');
        pulseCircle.setAttribute('stroke', this.color);
        pulseCircle.setAttribute('stroke-width', '2');
        pulseCircle.setAttribute('opacity', '0.6');
        pulseCircle.setAttribute('class', 'avatar-pulse');

        // Reduced motion: a CSS rule can't stop a SMIL <animate>, so simply don't
        // create the indefinite pulse — leave a static marker ring instead.
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.element.insertBefore(pulseCircle, this.element.firstChild);
            return;
        }

        // Add animation
        const animate = document.createElementNS(this.SVG_NS, 'animate');
        animate.setAttribute('attributeName', 'r');
        animate.setAttribute('from', size/2);
        animate.setAttribute('to', size);
        animate.setAttribute('dur', '2s');
        animate.setAttribute('repeatCount', 'indefinite');
        
        const animateOpacity = document.createElementNS(this.SVG_NS, 'animate');
        animateOpacity.setAttribute('attributeName', 'opacity');
        animateOpacity.setAttribute('from', '0.6');
        animateOpacity.setAttribute('to', '0');
        animateOpacity.setAttribute('dur', '2s');
        animateOpacity.setAttribute('repeatCount', 'indefinite');
        
        pulseCircle.appendChild(animate);
        pulseCircle.appendChild(animateOpacity);
        
        // Insert before the main avatar shape
        this.element.insertBefore(pulseCircle, this.element.firstChild);
    }
    
    removePulseAnimation() {
        const pulseCircle = this.element.querySelector('.avatar-pulse');
        if (pulseCircle) {
            pulseCircle.remove();
        }
    }
    
    show() {
        if (this.containerGroup) {
            this.containerGroup.style.display = '';
        }
    }
    
    hide() {
        if (this.containerGroup) {
            this.containerGroup.style.display = 'none';
        }
    }
    
    announceLocation() {
        const announcement = this.isRealLocation ? 
            'Centered on your current location' : 
            'Centered on map location';
        
        // The one shared status region, clear-then-set so re-centring re-announces.
        const announcements = document.getElementById('map-announcements');
        if (announcements) {
            announcements.textContent = '';
            announcements.textContent = announcement;
        }
    }
    
    // Update avatar position when map view changes
    refresh() {
        this.updatePosition();
        this.updateSize();
    }
    
    updateSize() {
        // Update avatar size based on zoom level
        const zoomScale = Math.pow(2, 18 - this.mapRenderer.zoom);
        const size = this.baseSize * zoomScale;
        
        // Update the pin path
        const avatarPath = this.element.querySelector('path');
        if (avatarPath) {
            avatarPath.setAttribute('d', this.createPinPath());
        }
        
        // Update circle positions and sizes
        const circles = this.element.querySelectorAll('circle');
        if (circles.length >= 2) {
            // Inner circle (head)
            circles[0].setAttribute('cy', -size/5);
            circles[0].setAttribute('r', size/5);
            
            // Face circle
            circles[1].setAttribute('cy', -size/5);
            circles[1].setAttribute('r', size/6.67);
        }
        
        // Update direction indicator
        const directionIndicator = this.element.querySelector('path:last-child');
        if (directionIndicator) {
            directionIndicator.setAttribute('d', `M 0,-${size*0.35} L -${size*0.075},-${size*0.25} L ${size*0.075},-${size*0.25} Z`);
        }
        
        // Update pulse animation if present
        const pulseCircle = this.element.querySelector('.avatar-pulse');
        if (pulseCircle) {
            const animate = pulseCircle.querySelector('animate[attributeName="r"]');
            if (animate) {
                animate.setAttribute('from', size/2);
                animate.setAttribute('to', size);
            }
        }
    }
}