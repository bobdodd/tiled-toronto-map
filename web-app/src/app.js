import { MapRenderer } from './MapRenderer.js';
import { LocationTracker } from './LocationTracker.js';
import { FilterManager } from './FilterManager.js';
import { AccessibilityManager } from './AccessibilityManager.js';
import { SVGTileManager } from './SVGTileManager.js';
import { Avatar } from './Avatar.js';
import { TaxonomyClient } from './TaxonomyClient.js';
import { buildFilterUI } from './FilterUI.js';
import { setupTooltip } from './Tooltip.js';
import { Announcer } from './Announcer.js';
import { setupChat } from './Chat.js';
import { setupChatPanel } from './ChatPanel.js';
import { setupChatSuggest } from './ChatSuggest.js';
import { LevelSwitch } from './LevelSwitch.js';
import { HeadingProvider } from './HeadingProvider.js';
import { streetContextAt, GENERIC_NAME } from './StreetContext.js';
import { createPointerPace } from './PointerPace.js';

class MapApplication {
    constructor() {
        this.mapRenderer = null;
        this.locationTracker = null;
        this.filterManager = null;
        this.accessibilityManager = null;
        this.svgTileManager = null;
        this.avatar = null;
        this.isTracking = false;
        this.isNavigating = false;
        this.hasInitialLocation = false;

        // Live-tracking SPEECH state. Raw coordinates never auto-announce (the panel
        // is not a live region); instead we throttle "near <place>" announcements so
        // a ~1/sec GPS watch can't spam the screen reader — speak only when the user
        // has moved a real distance AND a quiet interval has passed AND the nearest
        // NAMED feature has actually changed.
        this.lastProximityPos = null;   // {lat,lng} we last announced from
        this.lastProximityTime = 0;     // ms timestamp of last proximity announce
        this.lastProximityId = null;    // osm id of last-announced nearby feature

        // Device compass (which way the user faces) for clock-face directions; falls
        // back to cardinal points when there's no magnetometer / permission.
        this.heading = new HeadingProvider();

        // Heading-up map rotation (opt-in; default north-up). When on, the map turns
        // with the compass and follows the avatar so it stays centred.
        this.headingUp = false;
        this._rotRAF = null;

        // "Describe as I move" — a running spoken commentary. Driven by BOTH position
        // (handleLocationUpdate) and HEADING: a turn is movement too, so being spun
        // round in a crowd re-orients you. Off by default — opt-in, never unsolicited.
        this.autoDescribe = false;
        this._inCoverage = null;  // last known in/out of the mapped area (null = no fix yet)
        this._autoTO = null;            // settle-poll timer handle
        this._lastFacing = null;        // last ANNOUNCED facing (deg) — turn detection
        this._settleH = null;           // heading the settle window is centred on
        this._settleStart = 0;          // when the heading last settled
        this._lastRoadId = null;        // road we last said you were on (transitions)
        this._lastSpokenId = null;      // last feature announced (avoid repeats)
        // Cache of the last ranked nearby set + where it was taken, so a TURN can
        // re-orient the same POIs to your new facing without another query.
        this._lastNearby = [];
        this._lastNearbyPos = null;
        this._modalReturnFocus = null;  // element to restore focus to on modal close

        this.init().catch((e) => console.error('Map init failed:', e));

    }

    async init() {
        // Speech-first announcements (aria-live only as fallback / audio-off).
        // Constructed first: everything that talks routes through it.
        this.announcer = new Announcer({ caption: (m) => this._caption(m) });
        this.setupGate();
        this.setupAudioToggle();
        this.setupSettingsDialog();
        this.setupCompassToggle();
        this.setupRelativeToggle();
        this.setupTooltipSpeechToggle();

        // Initialize map renderer
        const mapSvg = document.getElementById('map-svg');
        this.mapRenderer = new MapRenderer(mapSvg);

        // Check for position parameter in URL
        this.handleInitialPosition();

        // Initialize location tracker
        this.locationTracker = new LocationTracker();

        // Load the taxonomy — single source of truth for filters/classes.
        // Non-fatal: if it fails the map still loads, filters just stay inert.
        try {
            this.taxonomy = await TaxonomyClient.load('taxonomy.json');
        } catch (e) {
            console.error('Taxonomy load failed; filters disabled:', e);
            this.taxonomy = new TaxonomyClient({});
        }

        // Build the filter + rotor controls from the taxonomy (replaces the old hand-coded HTML)
        // Tabindex bands keep header < chat < rose < map (positive throughout):
        // filter controls start at 101, rotor controls at 4002, the chat panel
        // sits at 6000-6004 (between the header and the rose, with its own
        // skip link), the rose at 8000s, map features at 9000+ (assigned by
        // the rotor in AccessibilityManager.updateTabOrder).
        buildFilterUI(this.taxonomy, document.getElementById('filter-groups'), 'filter', 101);
        buildFilterUI(this.taxonomy, document.getElementById('rotor-groups'), 'rotor', 4002);

        // Initialize filter and accessibility managers
        this.filterManager = new FilterManager(this.taxonomy);
        this.accessibilityManager = new AccessibilityManager(this.taxonomy, this.announcer);

        // Announcements gain live street positioning ("80 metres from County
        // Road 507") computed at the explored point — the tile-time pass only
        // covers block-scale features; bigger ones are positioned per-point,
        // at explore time (see StreetContext.js).
        this.accessibilityManager.positionContext = (g, x, y) => this.streetContextFor(g, x, y);
        // The "Speak tooltips" setting: off = feature announcements go to the
        // live region only, so a sighted user reading the pill isn't spoken
        // over while chat and status speech stay audible.
        this.accessibilityManager.speakFeatures = () => this.tooltipSpeechOn;
        // Hover/explore announce only at EXPLORING pace: sliding the mouse or
        // finger smoothly across the map is travel and stays silent; slowing
        // down (or stopping — see onSettle below) is the question.
        this.pointerPace = createPointerPace(mapSvg);
        this.accessibilityManager.pace = this.pointerPace;

        // After a USER filter toggle, refresh the rotor's tab order too.
        // Wrapped at toggleFilter, NOT updateVisibility: the programmatic
        // re-application that runs when tiles load calls updateVisibility for
        // EVERY filter, and a full tab-order pass per filter (N × 13k
        // getBoundingClientRect) froze the map for seconds after each pan.
        const originalToggleFilter = this.filterManager.toggleFilter.bind(this.filterManager);
        this.filterManager.toggleFilter = (id, enabled) => {
            originalToggleFilter(id, enabled);
            this.accessibilityManager.updateTabOrder();
        };

        // Vertical plane switcher (street / underground / elevated / transit),
        // driven conversationally ("show the PATH" — Chat.js intercepts, the
        // onMapCommand plumbing calls levelSwitch.set). Owns its own state;
        // the old Map Level accordion is retired.
        this.levelSwitch = new LevelSwitch({
            announce: (msg) => this.announceStatus(msg),
            onChange: () => {
                if (this.accessibilityManager) this.accessibilityManager.updateTabOrder();
            },
        });
        
        // Initialize SVG tile manager
        this.svgTileManager = new SVGTileManager();

        // Initialize avatar
        this.avatar = new Avatar(this.mapRenderer);
        
        // Set up event listeners
        this.setupEventListeners();

        // Sticky name tooltip on focus/hover (reads each feature's aria-label).
        // Delegates on #map-svg, so it covers tiles loaded later too. The
        // returned handle lets go-to arrivals clear a stale pill and label a
        // destination that has no drawn feature (a bare address).
        this.tooltip = setupTooltip({
            contextFor: (g, x, y) => this.streetContextFor(g, x, y),
            paceOk: () => this.pointerPace.slow(),
        });

        // The settled pointer reveals: arriving somewhere fast and STOPPING
        // is exploring, so announce + pill for whatever it rests on (both
        // entry events were gated as travel).
        this.pointerPace.onSettle((x, y) => {
            this.accessibilityManager.revealAt(x, y);
            if (this.tooltip && this.tooltip.revealAt) this.tooltip.revealAt(x, y);
        });

        // The chat panel's housing: floating (moveable/resizable/closeable)
        // on desktop, split-screen with a draggable divider on mobile. The
        // divider changes the map's height without a window resize, so it
        // drives handleResize itself.
        this.chatPanel = setupChatPanel({
            announce: (msg) => this.announceStatus(msg),
            onLayoutChange: () => { if (this.mapRenderer) this.mapRenderer.handleResize(); },
        });

        // The Chat — the Knowledge Map's conversation on the visual map. It
        // shares the app's Announcer (one speech channel, latest wins) and
        // HeadingProvider (facing → clock directions), and its spoken
        // "follow me" / "stop following" drive the SAME follow switch as the
        // Settings toggle — one behaviour, one state. Deliberately does not
        // move or highlight anything on the map yet.
        setupChat({
            announcer: this.announcer,
            heading: this.heading,
            // The Track Location toggle decides what "where am I" means to
            // the chat: tracking ON = the device's GPS; OFF = the AVATAR (the
            // virtual you on the map, falling back to the map centre).
            isTracking: () => this.isTracking,
            getVirtualLocation: () => {
                const p = (this.avatar && this.avatar.position) || (this.mapRenderer && this.mapRenderer.center);
                return p ? { lat: +p.lat.toFixed(6), lon: +p.lng.toFixed(6) } : null;
            },
            onFollow: () => {
                const b = document.getElementById('describe-auto');
                if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
            },
            onUnfollow: () => {
                const b = document.getElementById('describe-auto');
                if (b && b.getAttribute('aria-pressed') === 'true') b.click();
            },
            // Voice pan/zoom/centre CLICK the rose's own buttons — one
            // behaviour, one state, one set of limits (and it works with the
            // rose switched off in Settings: the buttons exist, just hidden —
            // voice IS the alternative to the rose). The button's own
            // announcement is CAPTURED and handed back rather than spoken
            // here: the chat re-speaks it with its hands-free continuation,
            // so a spoken command never strands the conversation loop.
            onMapCommand: (action) => {
                let captured = null;
                this.announceStatus = (m) => { captured = m; };
                try {
                    // Vertical planes ("show the PATH") — the retired Map
                    // Level accordion's job, now LevelSwitch.set directly.
                    const lvl = action.match(/^level-(\w+)-(on|off)$/);
                    if (lvl) {
                        const r = this.levelSwitch ? this.levelSwitch.set(lvl[1], lvl[2] === 'on') : null;
                        if (!r) return null;
                        if (!r.changed) return { ok: true, say: `${r.label} is already ${r.on ? 'shown' : 'hidden'}.` };
                        return { ok: true, say: captured };
                    }
                    // Multi-step and extreme zooms ("zoom way out", "zoom
                    // max"): the same setZoom the rose buttons drive, one
                    // jump, one announcement — equivalent to N clicks without
                    // N coordinate read-outs. The EXTREMES go to the tile
                    // pyramid's PRESET ends — z12 (lod12, ~whole metro) to
                    // z22 (lod22, individual features) — not the raw clamp:
                    // z23 is only an over-zoom of the finest band's tiles,
                    // still reachable by a stepped "zoom in" from 22. An
                    // unchanged zoom means we were already at the limit.
                    const zm = action.match(/^zoom-(in|out)-(\d+)$/);
                    if (zm || action === 'zoom-min' || action === 'zoom-max') {
                        const r = this.mapRenderer;
                        const target = action === 'zoom-min' ? 12
                            : action === 'zoom-max' ? 22
                            : r.zoom + (zm[1] === 'in' ? +zm[2] : -zm[2]);
                        const before = r.zoom;
                        r.setZoom(target);
                        if (r.zoom === before) return { disabled: true };
                        this.updateZoomButtonStates();
                        this.announceMapChange();
                        return { ok: true, say: captured };
                    }
                    const ids = {
                        'pan-north': 'nav-n', 'pan-northeast': 'nav-ne',
                        'pan-east': 'nav-e', 'pan-southeast': 'nav-se',
                        'pan-south': 'nav-s', 'pan-southwest': 'nav-sw',
                        'pan-west': 'nav-w', 'pan-northwest': 'nav-nw',
                        'zoom-in': 'nav-zoom-in', 'zoom-out': 'nav-zoom-out',
                        'centre': 'nav-center',
                    };
                    const btn = document.getElementById(ids[action] || '');
                    if (!btn) return null;
                    if (btn.disabled) return { disabled: true };
                    btn.click();
                    return { ok: true, say: captured };
                } finally { delete this.announceStatus; }
            },
            // The LLM chose to move the map (its show_on_map tool → the
            // response's mapAction). Recentre immediately — SILENT, the
            // reply's own words carry the announcement — and hand back a
            // lander the chat calls after the reply finishes speaking, so
            // focus arrives on the feature without talking over the answer.
            onMapTarget: (t) => {
                if (!t || !Number.isFinite(t.lat) || !Number.isFinite(t.lon)) return null;
                if (this.mapRenderer.zoom < 18) this.mapRenderer.setZoom(18);
                this.mapRenderer.setCenter(t.lat, t.lon);
                // The departed feature's sticky pill/outline must not hang
                // over the new view while the reply speaks (focus and the
                // destination's own pill arrive after it, via the lander).
                if (this.tooltip) this.tooltip.hide();
                if (this.accessibilityManager) this.accessibilityManager.hideFocusOutline();
                // The virtual you arrives too (tracking off) — the reply
                // narrates the move; the next "near me" anchors here.
                this._arriveAt(t.lat, t.lon);
                return () => { this._focusArrival(t.osm_id, t.name); };
            },
        });

        // Clicking a feature moves focus onto it — one focus model for mouse,
        // search and Tab. A feature already in the tab circuit keeps its rotor
        // position; anything else gets the same "direct target" treatment as a
        // search result. Delegated, so it covers tiles loaded later too.
        document.getElementById('map-svg').addEventListener('click', (e) => {
            const feature = e.target.closest('#map-tiles [role="img"]');
            if (!feature) return;
            if (feature.hasAttribute('tabindex')) feature.focus({ preventScroll: true });
            else this.focusFeatureElement(feature);
        });

        // Map search lives in the CHAT: the chat input is an APG combobox
        // offering place suggestions from the OpenSearch map-features index
        // (same-origin proxy); picking one recentres and moves focus onto the
        // actual tile feature — the retired Search accordion's behaviour.
        // Free-text queries ("find the accessible washrooms nearby") go to
        // the knowledge chat instead, which searches the same index by tool.
        setupChatSuggest({
            getCenter: () => this.mapRenderer.center,
            onSelect: (result) => this.goToSearchResult(result),
        });

        // Set up keyboard navigation
        this.setupKeyboardNavigation();
        
        // Set up touch gestures for pinch-to-zoom
        this.setupTouchGestures();
        
        // Set up trackpad/wheel zoom (for laptops)
        this.setupWheelZoom();
        
        // Set up drag-to-pan for mouse and touch
        this.setupDragToPan();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.mapRenderer.handleResize();
        });
        
        // Initial render after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.mapRenderer.handleResize();
            this.mapRenderer.render();
            
            // Apply initial filter states
            this.filterManager.applyInitialVisibility();
            
            // Update zoom button states
            this.updateZoomButtonStates();
            
            // Set initial avatar position at map center
            const center = this.mapRenderer.center;
            this.avatar.setPosition(center.lat, center.lng, false);
            
            // Warm the tile CACHE for the real viewport (handleResize above
            // falls back to the window size while <main> is hidden) — network
            // only, NO rendering. The disclaimer gate is still up: parsing and
            // inserting several MB of SVG here is main-thread work that made
            // the gate's checkbox and Start button feel stuck. The Start
            // handler runs the real loadMapTiles, which renders from this
            // cache — whole map at once, no partial paint.
            this.warmMapTiles();
        }, 100);
        
        // Listen for map view changes
        this.setupMapChangeListeners();
        
        // Listen for viewBox changes from MapRenderer
        this.mapRenderer.svg.addEventListener('viewBoxChanged', () => {
            // Check if we need to load new tiles when viewBox changes
            const needsNewTiles = this.checkIfNeedNewTiles();
            if (needsNewTiles) {
                this.loadMapTiles();
            }
            // Refresh which features can take focus — only those now on-screen.
            // Debounced because a pan/zoom fires viewBoxChanged rapidly; silent so
            // it doesn't spam the live region while panning.
            clearTimeout(this._tabOrderRefresh);
            this._tabOrderRefresh = setTimeout(() => {
                this.accessibilityManager.updateTabOrder();
            }, 150);
        });
        
        // Check for debug mode in URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            document.getElementById('debug-panel').style.display = 'block';
        }
    }

    setupEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const controlSidebar = document.getElementById('control-sidebar');
        
        sidebarToggle.addEventListener('click', () => {
            const isExpanded = sidebarToggle.getAttribute('aria-expanded') === 'true';
            controlSidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed');
            sidebarToggle.setAttribute('aria-expanded', !isExpanded);
            
            // Toggle icons
            const hamburgerIcon = sidebarToggle.querySelector('.hamburger-icon');
            const closeIcon = sidebarToggle.querySelector('.close-icon');
            
            if (isExpanded) {
                // Closing - show hamburger
                hamburgerIcon.style.display = 'inline';
                closeIcon.style.display = 'none';
            } else {
                // Opening - show close
                hamburgerIcon.style.display = 'none';
                closeIcon.style.display = 'inline';
            }
        });
        
        // Accordion functionality
        const accordionHeaders = document.querySelectorAll('.accordion-header');
        accordionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                const content = document.getElementById(header.getAttribute('aria-controls'));
                
                header.setAttribute('aria-expanded', !isExpanded);
                content.hidden = isExpanded;
            });
        });
        
        // Filter accordion functionality
        const filterAccordionHeaders = document.querySelectorAll('.filter-accordion-header');
        filterAccordionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                const content = document.getElementById(header.getAttribute('aria-controls'));
                
                header.setAttribute('aria-expanded', !isExpanded);
                content.hidden = isExpanded;
            });
        });
        
        // Filter sub-accordion functionality (nested)
        const filterSubAccordionHeaders = document.querySelectorAll(".filter-sub-accordion-header");
        filterSubAccordionHeaders.forEach(header => {
            header.addEventListener("click", () => {
                const isExpanded = header.getAttribute("aria-expanded") === "true";
                const content = document.getElementById(header.getAttribute("aria-controls"));
                
                header.setAttribute("aria-expanded", !isExpanded);
                content.hidden = isExpanded;
            });
        });
        
        // Escape clears the go-to highlight, like it clears the sticky
        // tooltip (they arrive together) — and SILENCES the speech channel:
        // the tooltip hides, so its announcement must stop with it. A live
        // region can't be recalled, but speech can. Unconditional: cancelling
        // idle speech is a no-op, and the chat's richer shush (which only
        // arms once a conversation is active) still runs alongside.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (this._gotoHighlightId) this._setGotoHighlight(null);
            if (this.announcer) this.announcer.stop();
        });

        // Toggle buttons
        document.getElementById('toggle-tracking').addEventListener('click', (e) => {
            this.toggleLocationTracking(e.currentTarget);
        });

        // Follow me (settings) — the running commentary. The one-shot Quick/
        // Detailed describe buttons were REPLACED by the Chat: "where am I?"
        // and "describe my surroundings" are questions now. (quickDescribe /
        // detailedDescribe remain callable — the chat may drive them later.)
        const autoBtn = document.getElementById('describe-auto');
        if (autoBtn) autoBtn.addEventListener('click', (e) => this.toggleAutoDescribe(e.currentTarget));

        // Detailed-surroundings modal: close button + click-outside.
        const detailClose = document.getElementById('detail-modal-close');
        if (detailClose) detailClose.addEventListener('click', () => this.closeDetailModal());
        const detailModal = document.getElementById('detail-modal');
        if (detailModal) detailModal.addEventListener('click', (e) => {
            if (e.target === detailModal) this.closeDetailModal();
        });

        // Heading-up rotation toggle.
        const headingUpBtn = document.getElementById('toggle-heading-up');
        if (headingUpBtn) headingUpBtn.addEventListener('click', (e) => this.toggleHeadingUp(e.currentTarget));

        // Debug controls
        document.getElementById('set-location').addEventListener('click', () => {
            this.setMockLocation();
        });
        
        // Compass navigator controls
        this.setupCompassNavigator();

        // Skip links (first two tab stops)
        const skipCompass = document.getElementById('skip-to-compass');
        if (skipCompass) skipCompass.addEventListener('click', (e) => {
            e.preventDefault();
            const first = document.getElementById('nav-n'); // first compass control
            if (first) first.focus();
        });
        const skipMap = document.getElementById('skip-to-map');
        if (skipMap) skipMap.addEventListener('click', (e) => {
            e.preventDefault();
            this.focusFirstMapFeature();
        });
        
        // Location tracker callbacks
        this.locationTracker.onUpdate((position) => {
            this.handleLocationUpdate(position);
        });
        
        this.locationTracker.onError((error) => {
            this.handleLocationError(error);
        });
    }

    setupCompassNavigator() {
        // Direction buttons
        document.getElementById('nav-n').addEventListener('click', () => {
            this.panMap(0, -1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-ne').addEventListener('click', () => {
            this.panMap(1, -1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-e').addEventListener('click', () => {
            this.panMap(1, 0);
            this.announceMapChange();
        });
        
        document.getElementById('nav-se').addEventListener('click', () => {
            this.panMap(1, 1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-s').addEventListener('click', () => {
            this.panMap(0, 1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-sw').addEventListener('click', () => {
            this.panMap(-1, 1);
            this.announceMapChange();
        });
        
        document.getElementById('nav-w').addEventListener('click', () => {
            this.panMap(-1, 0);
            this.announceMapChange();
        });
        
        document.getElementById('nav-nw').addEventListener('click', () => {
            this.panMap(-1, -1);
            this.announceMapChange();
        });
        
        // Zoom buttons
        document.getElementById('nav-zoom-in').addEventListener('click', () => {
            this.mapRenderer.zoomIn();
            this.updateZoomButtonStates();
            this.announceMapChange();
        });
        
        document.getElementById('nav-zoom-out').addEventListener('click', () => {
            this.mapRenderer.zoomOut();
            this.updateZoomButtonStates();
            this.announceMapChange();
        });
        
        // Center location button
        document.getElementById('nav-center').addEventListener('click', () => {
            this.centerOnCurrentLocation();
        });
    }
    
    setupKeyboardNavigation() {
        const mapContainer = document.getElementById('map-container');
        
        mapContainer.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 5 : 1;
            let handled = true;

            // Panning is gated behind Ctrl/Cmd ON PURPOSE: bare arrow keys belong
            // to the screen reader (virtual cursor / reading), so we must never
            // hijack them. A bare arrow sets handled=false and falls through
            // untouched — no preventDefault — so the SR still receives it.
            const hasModifier = e.ctrlKey || e.metaKey;

            switch(e.key) {
                case 'ArrowUp':
                    if (hasModifier) this.panMap(0, -step);
                    else handled = false;
                    break;
                case 'ArrowDown':
                    if (hasModifier) this.panMap(0, step);
                    else handled = false;
                    break;
                case 'ArrowLeft':
                    if (hasModifier) this.panMap(-step, 0);
                    else handled = false;
                    break;
                case 'ArrowRight':
                    if (hasModifier) this.panMap(step, 0);
                    else handled = false;
                    break;
                case '+':
                case '=':
                    this.mapRenderer.zoomIn();
                    this.updateZoomButtonStates();
                    handled = true;
                    break;
                case '-':
                case '_':
                    this.mapRenderer.zoomOut();
                    this.updateZoomButtonStates();
                    handled = true;
                    break;
                case 'h':
                case 'H':
                    this.centerOnCurrentLocation();
                    handled = true;
                    break;
                default:
                    handled = false;
            }
            
            if (handled) {
                e.preventDefault();
                this.announceMapChange();
            }
        });
    }
    
    setupTouchGestures() {
        const mapContainer = document.getElementById('map-container');
        let touches = [];
        let lastDistance = 0;
        let isPinching = false;
        
        mapContainer.addEventListener('touchstart', (e) => {
            // Store all touch points
            touches = Array.from(e.touches);
            
            if (touches.length === 2) {
                isPinching = true;
                // Calculate initial distance between two touches
                const dx = touches[0].clientX - touches[1].clientX;
                const dy = touches[0].clientY - touches[1].clientY;
                lastDistance = Math.sqrt(dx * dx + dy * dy);
                e.preventDefault();
            }
        }, { passive: false });
        
        mapContainer.addEventListener('touchmove', (e) => {
            if (isPinching && e.touches.length === 2) {
                // Calculate new distance
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (lastDistance > 0) {
                    // Calculate zoom change
                    const scale = distance / lastDistance;
                    
                    // Calculate the pinch center point (for future use)
                    // const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    // const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    
                    // Continuous zoom - accumulate smaller changes
                    const zoomDelta = Math.log2(scale);
                    const newZoom = this.mapRenderer.zoom + zoomDelta;
                    
                    // Apply zoom if within bounds
                    if (newZoom >= 12 && newZoom <= 23) {
                        this.mapRenderer.setZoom(newZoom);
                        this.updateZoomButtonStates();
                        lastDistance = distance;
                    }
                }
                
                e.preventDefault();
            }
        }, { passive: false });
        
        mapContainer.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                isPinching = false;
                lastDistance = 0;
            }
            touches = Array.from(e.touches);
        });
        
        mapContainer.addEventListener('touchcancel', () => {
            isPinching = false;
            lastDistance = 0;
            touches = [];
        });
    }
    
    setupWheelZoom() {
        const mapContainer = document.getElementById('map-container');
        
        mapContainer.addEventListener('wheel', (e) => {
            // Check if it's a pinch gesture (ctrl key on Mac trackpad)
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                
                // deltaY is negative when pinching out (zoom in), positive when pinching in (zoom out)
                // Adjust sensitivity based on platform
                // Mac trackpad gives smaller deltaY values than mouse wheel
                const sensitivity = Math.abs(e.deltaY) < 50 ? 0.01 : 0.002;
                const zoomDelta = -e.deltaY * sensitivity;
                const currentZoom = this.mapRenderer.zoom;
                const newZoom = currentZoom + zoomDelta;
                
                
                // Apply zoom if within bounds
                if (newZoom >= 12 && newZoom <= 23) {
                    this.mapRenderer.setZoom(newZoom);
                    this.updateZoomButtonStates();
                    // Don't announce every tiny change during continuous zoom
                    clearTimeout(this.zoomAnnounceTimeout);
                    this.zoomAnnounceTimeout = setTimeout(() => {
                        this.announceMapChange();
                    }, 500);
                }
            }
        }, { passive: false });
    }
    
    setupDragToPan() {
        const mapContainer = document.getElementById('map-container');
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLat = 0;
        let startLng = 0;
        
        // A mouse drag ends in a browser 'click' at the release point — not
        // an ask. Swallow exactly that click in the CAPTURE phase, before the
        // tooltip and announce handlers on #map-svg see it, so panning never
        // announces whatever the map happened to stop under. Taps are
        // unaffected (a click only counts as a drag after real movement), and
        // touch drags never synthesize clicks.
        let dragMoved = false;
        mapContainer.addEventListener('click', (e) => {
            if (dragMoved) { dragMoved = false; e.stopPropagation(); }
        }, true);

        // Mouse drag events
        mapContainer.addEventListener('mousedown', (e) => {
            // Only respond to left mouse button (button 0)
            if (e.button !== 0) return;

            isDragging = true;
            dragMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            startLat = this.mapRenderer.center.lat;
            startLng = this.mapRenderer.center.lng;

            // While a MOUSE drag is live, the map slides under the pointer and
            // every feature crossing it fires mouseover — without this signal
            // each one would announce (speech cancel/speak churn) and drag the
            // tooltip around, per feature, all drag long. Touch is untouched:
            // explore-by-touch announcing under a sweeping finger is a feature.
            document.body.classList.add('map-dragging');

            // Prevent text selection during drag
            e.preventDefault();

            // Change cursor to grabbing
            mapContainer.style.cursor = 'grabbing';
        });
        
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) + Math.abs(dy) > 5) dragMoved = true;

            // Convert pixel movement to degrees
            // Use the MapRenderer's coordinate system
            const pixelsPerDegree = 100000; // 0.01 degrees = 1000 pixels
            const scale = Math.pow(2, this.mapRenderer.zoom - 18);
            
            const deltaLng = -dx / (pixelsPerDegree * scale);
            const deltaLat = dy / (pixelsPerDegree * scale);
            
            this.mapRenderer.setCenter(startLat + deltaLat, startLng + deltaLng);
        });
        
        window.addEventListener('mouseup', (e) => {
            if (isDragging && e.button === 0) {
                isDragging = false;
                document.body.classList.remove('map-dragging');
                mapContainer.style.cursor = 'default';
            }
        });
        
        // Touch drag events
        let touchStartX = 0;
        let touchStartY = 0;
        let isTouchDragging = false;
        let currentTouchId = null;
        
        mapContainer.addEventListener('touchstart', (e) => {
            // If already pinching (2 touches), don't start drag
            if (e.touches.length > 1) {
                isTouchDragging = false;
                return;
            }
            
            // Single touch - start drag
            const touch = e.touches[0];
            currentTouchId = touch.identifier;
            isTouchDragging = true;
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            startLat = this.mapRenderer.center.lat;
            startLng = this.mapRenderer.center.lng;
        }, { passive: true });
        
        mapContainer.addEventListener('touchmove', (e) => {
            // If pinching, don't drag
            if (e.touches.length > 1) {
                isTouchDragging = false;
                return;
            }
            
            if (!isTouchDragging) return;
            
            // Find the touch we're tracking
            let touch = null;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === currentTouchId) {
                    touch = e.touches[i];
                    break;
                }
            }
            
            if (!touch) return;
            
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            
            // Convert pixel movement to degrees
            const pixelsPerDegree = 100000;
            const scale = Math.pow(2, this.mapRenderer.zoom - 18);
            
            const deltaLng = -dx / (pixelsPerDegree * scale);
            const deltaLat = dy / (pixelsPerDegree * scale);
            
            this.mapRenderer.setCenter(startLat + deltaLat, startLng + deltaLng);
            
            // Prevent default to avoid scrolling the page
            e.preventDefault();
        }, { passive: false });
        
        mapContainer.addEventListener('touchend', (e) => {
            // Check if our tracked touch ended
            let touchEnded = true;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === currentTouchId) {
                    touchEnded = false;
                    break;
                }
            }
            
            if (touchEnded) {
                isTouchDragging = false;
                currentTouchId = null;
            }
        });
        
        mapContainer.addEventListener('touchcancel', () => {
            isTouchDragging = false;
            currentTouchId = null;
        });
        
        // Don't set any special cursor by default - only show grabbing cursor when dragging
    }

    panMap(dx, dy) {
        const currentCenter = this.mapRenderer.center;
        
        // In the new coordinate system:
        // - 0.01 degrees = 1 tile = 1000 pixels at base zoom
        // - We want to pan by about 10% of the viewport
        const viewportWidthDegrees = this.mapRenderer.viewBox.width / 100000; // pixels to degrees
        const viewportHeightDegrees = this.mapRenderer.viewBox.height / 100000;
        
        // Use the smaller dimension to ensure diagonal moves are at 45 degrees
        const panAmount = Math.min(viewportWidthDegrees, viewportHeightDegrees) * 0.1;
        
        // For diagonal moves, normalize the vector to maintain consistent speed
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        const normalizedDx = magnitude > 0 ? dx / magnitude : 0;
        const normalizedDy = magnitude > 0 ? dy / magnitude : 0;
        
        // Note: In our coordinate system, Y is inverted (negative Y is up/north)
        // For longitude: positive dx should move east (increase lng)
        const newLat = currentCenter.lat - normalizedDy * panAmount;  // Negative because Y increases downward
        const newLng = currentCenter.lng + normalizedDx * panAmount;  // Positive dx = east
        
        this.mapRenderer.setCenter(newLat, newLng);
    }

    toggleLocationTracking(button) {
        this.isTracking = !this.isTracking;
        button.setAttribute('aria-pressed', this.isTracking);

        // Swap the icon so the on/off state is glanceable, not just the aria-pressed
        // tint (which is subtle in the default theme). Decorative — the icon is
        // aria-hidden; aria-pressed carries the state to screen readers.
        const icon = button.querySelector('.icon');
        if (icon) icon.textContent = this.isTracking ? '🛰️' : '📍';

        if (this.isTracking) {
            this.locationTracker.startTracking();
            // Start the compass here too — this click is the user gesture iOS needs
            // to grant DeviceOrientation permission. Fire-and-forget: if it isn't
            // available, directions just stay cardinal.
            this.heading.start();
            this.announceStatus('Location tracking enabled');
        } else {
            this.locationTracker.stopTracking();
            this.heading.stop();
            this.announceStatus('Location tracking disabled');

            // When tracking is disabled, revert avatar to center position
            // and take the GPS overlay (accuracy disc + dot) with it — a
            // stale disc would claim a fix we no longer have.
            this.mapRenderer.clearUserLocation();
            const center = this.mapRenderer.center;
            this.avatar.setPosition(center.lat, center.lng, false);
        }
    }

    // Navigation is now handled by accordion, remove old toggle method

    toggleHeadingUp(button) {
        this.headingUp = !this.headingUp;
        button.setAttribute('aria-pressed', this.headingUp);
        // Swap the icon for a glanceable state, like Track Location does.
        const icon = button.querySelector('.icon');
        if (this.headingUp) {
            if (icon) icon.textContent = '🔼';   // up = the way you face is up
            this.announceStatus('Heading up. The map turns to face the way you are going.');
            this.heading.start();              // ensure the compass is running
            this._startRotationLoop();
        } else {
            if (icon) icon.textContent = '🔄';   // back to north-up
            this._stopRotationLoop();
            this.mapRenderer.setRotation(0);
            this.announceStatus('North up.');
        }
        // The loaded area differs (heading-up loads the rotated corners), so reload.
        this.loadMapTiles(true);
    }

    // Drive the map rotation from the smoothed compass heading. rAF-paced, but only
    // writes a new transform when the heading actually moved (>0.5 deg) so a steady
    // hold doesn't thrash the DOM. If there's no usable heading, fall to north-up.
    _startRotationLoop() {
        let last = null;
        const tick = () => {
            if (!this.headingUp) return;
            const h = this.heading.getHeading();
            const target = (h === null) ? 0 : h;
            const moved = last === null
                || Math.abs(((target - last + 540) % 360) - 180) > 0.5;
            if (moved) { this.mapRenderer.setRotation(target); last = target; }
            this._rotRAF = requestAnimationFrame(tick);
        };
        this._rotRAF = requestAnimationFrame(tick);
    }

    _stopRotationLoop() {
        if (this._rotRAF) cancelAnimationFrame(this._rotRAF);
        this._rotRAF = null;
    }

    handleLocationUpdate(position) {
        // Feed GPS course-over-ground to the compass: while moving it's a reliable
        // heading immune to magnetometer error (the Pixel read ~180° off in Buckhorn).
        this.heading.setGpsCourse(position.heading, position.speed);

        // Update location display
        const locationElement = document.getElementById('current-location');
        const accuracyElement = document.getElementById('location-accuracy');

        locationElement.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
        accuracyElement.textContent = `${Math.round(position.accuracy)}m`;
        
        // Update avatar with real location
        this.avatar.setPosition(position.lat, position.lng, true);
        
        // Update map
        this.mapRenderer.drawUserLocation(position.lat, position.lng, position.accuracy);
        
        // Center map on location on the first fix; and keep FOLLOWING it in
        // heading-up mode, so the avatar stays at the centre the map rotates around.
        if (!this.hasInitialLocation) {
            this.mapRenderer.setCenter(position.lat, position.lng);
            this.hasInitialLocation = true;
        } else if (this.headingUp) {
            this.mapRenderer.setCenter(position.lat, position.lng);
        }

        // Crossing the edge of the mapped area (once per transition), then the
        // throttled, semantic spoken feedback (NOT the raw coordinates above).
        this.maybeAnnounceCoverage(position);
        this.maybeAnnounceProximity(position);
    }

    // Announce crossing INTO or OUT OF the mapped area, once per transition. Like the
    // rest of the running commentary it only SPEAKS while Auto-describe is on — but it
    // tracks the in/out state on every fix so the next crossing is detected correctly
    // regardless. Tested against the regions list in the combined index, so it follows
    // coverage exactly (and says nothing when we have no coverage info — never cry wolf).
    maybeAnnounceCoverage(position) {
        const inside = this.svgTileManager
            ? this.svgTileManager.isInCoverage(position.lat, position.lng)
            : true;
        if (this._inCoverage === null) { this._inCoverage = inside; return; } // first fix: just record
        if (inside === this._inCoverage) return;                              // no change
        this._inCoverage = inside;
        if (!this.autoDescribe) return;                                       // only the running commentary speaks
        this.announceStatus(inside ? 'Back in the mapped area.' : 'You have left the mapped area.');
    }

    // On-demand "nothing here" message: distinguish "no map data for this location"
    // from "there's data, but nothing worth mentioning" — an ambiguity a blind user
    // can't otherwise resolve. Used by Quick / Detailed describe.
    _nothingNearbyMsg(pos) {
        return (this.svgTileManager && !this.svgTileManager.isInCoverage(pos.lat, pos.lng))
            ? 'You are outside the mapped area.'
            : 'Nothing notable nearby.';
    }

    // ── QUICK describe ───────────────────────────────────────────────────────
    // One short line on demand: which way you face, the road you're on, and the
    // single most worth-mentioning thing near you. The fast "where am I".
    async quickDescribe() {
        const pos = this.locationTracker.getCurrentPosition();
        if (!pos) {
            this.announceStatus('Location not available yet. Turn on Track Location first.');
            return;
        }
        const { results: near, intersections } = await this.fetchNearbyFull(pos.lat, pos.lng, 4);
        this._lastNearby = near;
        this._lastNearbyPos = { lat: pos.lat, lng: pos.lng };
        if (!near.length) { this.announceStatus(this._nothingNearbyMsg(pos)); return; }
        const onRoad = near.find((f) => f.category === 'road' && f.distance_m <= 30);
        const heading = this.heading ? this.heading.getHeading() : null;
        const parts = [];
        if (heading !== null) parts.push(`Facing ${this.cardinal(heading)}`);
        // The road you're on + the intersection: "on Church Street at Wellesley Street East".
        const roadLead = this._roadLeadPhrase(onRoad, intersections);
        if (roadLead) parts.push(roadLead);
        // Then one nearby landmark — skipping any road already named as a cross street above.
        const named = new Set((intersections || []).map((x) => x.display));
        if (onRoad) named.add(onRoad.display);
        const f = near.find((x) => x !== onRoad && !(x.category === 'road' && named.has(x.display)));
        if (f) parts.push(`${f.display} ${this._where(pos, f)}, ${this.phraseDistance(f.distance_m)}`);
        this.announceStatus((parts.join(', ') || 'Location found') + '.');
    }

    // ── DETAILED surroundings ────────────────────────────────────────────────
    // The full surround, on demand: facing, the road you're on, then everything
    // notable grouped by direction (ahead / right / behind / left when there's a
    // compass, else by compass point). Spoken AND opened in a modal to read.
    async detailedDescribe() {
        const pos = this.locationTracker.getCurrentPosition();
        if (!pos) {
            this.announceStatus('Location not available yet. Turn on Track Location first.');
            return;
        }
        const { results, intersections } = await this.fetchNearbyFull(pos.lat, pos.lng, 10);
        const near = results.filter((f) => f.distance_m <= 3000);
        this._lastNearby = near;
        this._lastNearbyPos = { lat: pos.lat, lng: pos.lng };
        if (!near.length) {
            const msg = this._nothingNearbyMsg(pos);
            this.announceStatus(msg);
            this.openDetailModal(`<p>${msg}</p>`);
            return;
        }
        const { speech, html } = this._describeSurround(pos, near, intersections);
        this.announceStatus(speech);
        this.openDetailModal(html);
    }

    // ── AUTO describe (running commentary) ────────────────────────────────────
    // Position path: called from each GPS fix (gated here on the toggle). Announce a
    // CHANGE in the road you're on, else the most significant fresh feature in earshot.
    async maybeAnnounceProximity(position) {
        if (!this.autoDescribe) return;
        const now = Date.now();
        if (now - this.lastProximityTime < 8000) return;            // quiet interval
        if (this.lastProximityPos) {
            const moved = this.locationTracker.calculateDistance(
                this.lastProximityPos.lat, this.lastProximityPos.lng,
                position.lat, position.lng);
            if (moved < 12) return;
        }
        const near = await this.fetchNearby(position.lat, position.lng, 5);
        if (!near.length) return;
        this._lastNearby = near;
        this._lastNearbyPos = { lat: position.lat, lng: position.lng };
        const onRoad = near.find((f) => f.category === 'road' && f.distance_m <= 30);
        let msg = null, id = null;
        if (onRoad && ('road:' + onRoad.id) !== this._lastRoadId) {
            msg = `On ${onRoad.display}.`; id = 'road:' + onRoad.id; this._lastRoadId = id;
        } else {
            const f = near.find((x) => x.significance >= 2 && x.id !== this._lastSpokenId
                && !(onRoad && x.id === onRoad.id) && x.distance_m <= 120);
            if (f) { msg = `${f.display} ${this._where(position, f)}, ${this.phraseDistance(f.distance_m)}.`; id = f.id; }
        }
        if (!msg) return;
        this._lastSpokenId = id;
        this.lastProximityPos = { lat: position.lat, lng: position.lng };
        this.lastProximityTime = now;
        this.announceStatus(msg);
    }

    toggleAutoDescribe(button) {
        this.autoDescribe = !this.autoDescribe;
        button.setAttribute('aria-pressed', this.autoDescribe);
        // No icon flip: state is aria-pressed. (The old 🔊/🔇 flip would sit
        // beside the Audio toggle's identical glyphs in the settings dialog.)
        if (this.autoDescribe) {
            this.heading.start();                 // turns are announced even before a fix
            this._lastFacing = null; this._settleH = null;
            this._lastRoadId = null; this._lastSpokenId = null;
            this.lastProximityTime = 0; this.lastProximityPos = null;
            this._startAutoHeadingWatch();
            this.announceStatus(this.isTracking
                ? 'Following you. I will call out where you are and tell you when you turn.'
                : 'Following your turns. Turn on Track Location too, to hear places as you move.');
        } else {
            this._stopAutoHeadingWatch();
            this.announceStatus('Stopped following.');
        }
    }

    _startAutoHeadingWatch() { this._stopAutoHeadingWatch(); this._autoTick(); }
    _stopAutoHeadingWatch() { if (this._autoTO) { clearTimeout(this._autoTO); this._autoTO = null; } }

    // Rotation IS movement: poll the compass and, when it SETTLES (held ~1s, so we
    // don't babble while you're being pushed around), announce the new facing if you
    // turned far enough since the last call-out. A turn re-orients the cached POIs to
    // your new heading without another query — that's the whole point in a crowd.
    _autoTick() {
        if (!this.autoDescribe) return;
        const h = this.heading ? this.heading.getHeading() : null;
        if (h !== null && h !== undefined) {
            if (this._settleH === null || Math.abs(this._angDiff(h, this._settleH)) > 12) {
                this._settleH = h; this._settleStart = Date.now();          // still turning
            } else if (Date.now() - this._settleStart > 900) {              // settled
                if (this._lastFacing === null) {
                    this._lastFacing = h;                                   // first lock, silent
                } else if (Math.abs(this._angDiff(h, this._lastFacing)) >= 30) {
                    this._announceTurn(h, this._angDiff(h, this._lastFacing));
                    this._lastFacing = h;
                }
            }
        }
        this._autoTO = setTimeout(() => this._autoTick(), 400);
    }

    _announceTurn(facing, signed) {
        const dir = signed > 0 ? 'right' : 'left';
        const a = Math.abs(signed);
        let mag;
        if (a >= 150) mag = 'turned right around';
        else if (a >= 110) mag = `a big turn to your ${dir}`;
        else if (a >= 65) mag = `a quarter-turn to your ${dir}`;
        else mag = `a small turn to your ${dir}`;
        let msg = `Now facing ${this.cardinal(facing)} — ${mag}.`;
        const pos = (this.locationTracker.getCurrentPosition && this.locationTracker.getCurrentPosition())
            || this._lastNearbyPos;
        if (pos && this._lastNearby.length) {
            const re = this._lastNearby.slice(0, 2).map((f) => `${f.display} ${this._where(pos, f)}`);
            if (re.length) msg += ' ' + re.join('; ') + '.';
        }
        this.announceStatus(msg);
    }

    // Signed smallest angle a-b in -180..180. Positive = a is clockwise of b (= a
    // RIGHT turn, since bearings increase clockwise from north).
    _angDiff(a, b) { return ((((a - b) % 360) + 540) % 360) - 180; }

    // Direction of f from pos as a short phrase: clock-face when we have a compass
    // ("at 2 o'clock"), else the cardinal word ("to the east").
    _where(pos, f) {
        const d = this._relClock(pos, f);
        return d.hour ? `at ${d.hour} o'clock` : `to the ${d.cardinal}`;
    }

    // {hour, cardinal, bucket} for f relative to pos. With a heading, hour is the
    // clock-face position and bucket groups it ahead/right/behind/left; without one,
    // both fall back to the 8-point compass.
    _relClock(pos, f) {
        const bearing = this.locationTracker.calculateBearing(pos.lat, pos.lng, f.lat, f.lng);
        const heading = this.heading ? this.heading.getHeading() : null;
        if (heading !== null) {
            const rel = (((bearing - heading) % 360) + 360) % 360;       // 0 = dead ahead
            const hour = Math.round(rel / 30) || 12;
            let bucket;
            if (rel < 60 || rel >= 300) bucket = 'ahead';
            else if (rel < 120) bucket = 'right';
            else if (rel < 240) bucket = 'behind';
            else bucket = 'left';
            return { hour, cardinal: null, bucket };
        }
        const card = this.cardinal(bearing);
        return { hour: null, cardinal: card, bucket: card };
    }

    // The road you're on, NAMING the intersection from the API's `intersections` list
    // (the cross streets at each end of your block): "on Church Street at Wellesley
    // Street East" when you're AT the corner (nearest cross street within CORNER_M),
    // "on Church Street between Wellesley Street East and Maitland Street" mid-block,
    // "on Church Street near <street>" with only one known, else just "on Church
    // Street". Null when you're not on a road. The standard O&M crossing call.
    _roadLeadPhrase(onRoad, intersections) {
        if (!onRoad) return null;
        const xs = (intersections || []).slice().sort((a, b) => a.distance_m - b.distance_m);
        const CORNER_M = 25;  // within this of the crossing point => "at" that corner
        if (!xs.length) return `on ${onRoad.display}`;
        if (xs[0].distance_m <= CORNER_M) return `on ${onRoad.display} at ${xs[0].display}`;
        if (xs.length >= 2) return `on ${onRoad.display} between ${xs[0].display} and ${xs[1].display}`;
        return `on ${onRoad.display} near ${xs[0].display}`;
    }

    // Build the Detailed read-out: a lead line (facing + road/intersection) then every
    // notable feature grouped by direction. Returns plain {speech} and escaped {html}.
    _describeSurround(pos, near, intersections) {
        const onRoad = near.find((f) => f.category === 'road' && f.distance_m <= 30);
        const heading = this.heading ? this.heading.getHeading() : null;
        const lead = [];
        if (heading !== null) lead.push(`Facing ${this.cardinal(heading)}`);
        const roadLead = this._roadLeadPhrase(onRoad, intersections);
        if (roadLead) lead.push(roadLead);
        const leadLine = lead.length ? lead.join(', ') + '.' : 'Location found.';

        const order = heading !== null
            ? ['ahead', 'right', 'behind', 'left']
            : ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
        const labels = { ahead: 'Ahead', right: 'To your right', behind: 'Behind you', left: 'To your left' };

        // Roads already named in the lead (the one you're on + its cross streets)
        // shouldn't repeat among the grouped features.
        const namedRoads = new Set((intersections || []).map((x) => x.display));
        if (onRoad) namedRoads.add(onRoad.display);
        const groups = {};
        for (const f of near) {
            if (f === onRoad) continue;
            if (f.category === 'road' && namedRoads.has(f.display)) continue;
            const d = this._relClock(pos, f);
            (groups[d.bucket] ||= []).push({ f, d });
        }

        const speechParts = [leadLine];
        const htmlParts = [`<p>${this._esc(leadLine)}</p>`];
        for (const key of order) {
            const items = groups[key];
            if (!items || !items.length) continue;
            const label = labels[key] || ('To the ' + key);
            const phrases = items.map(({ f, d }) => {
                const dist = this.phraseDistance(f.distance_m);
                const clock = d.hour ? `, ${d.hour} o'clock` : '';
                // ONE string for both ear and eye — what you hear is what you see.
                const text = `${f.display}, ${dist}${clock}`;
                return { speech: text, html: `<li>${this._esc(text)}</li>` };
            });
            speechParts.push(`${label}: ${phrases.map((p) => p.speech).join('; ')}`);
            htmlParts.push(`<h3>${this._esc(label)}</h3><ul>${phrases.map((p) => p.html).join('')}</ul>`);
        }
        return { speech: speechParts.join('. ') + '.', html: htmlParts.join('') };
    }

    openDetailModal(html) {
        const modal = document.getElementById('detail-modal');
        const body = document.getElementById('detail-modal-body');
        if (!modal || !body) return;
        body.innerHTML = html;
        this._modalReturnFocus = document.activeElement;
        modal.hidden = false;
        const close = document.getElementById('detail-modal-close');
        if (close) close.focus();
        // Trap focus on the close button (the only control inside) and close on Escape.
        this._modalKeydown = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); this.closeDetailModal(); }
            else if (e.key === 'Tab') { e.preventDefault(); if (close) close.focus(); }
        };
        modal.addEventListener('keydown', this._modalKeydown);
    }

    closeDetailModal() {
        const modal = document.getElementById('detail-modal');
        if (!modal) return;
        modal.hidden = true;
        if (this._modalKeydown) { modal.removeEventListener('keydown', this._modalKeydown); this._modalKeydown = null; }
        if (this._modalReturnFocus && this._modalReturnFocus.focus) this._modalReturnFocus.focus();
    }

    _esc(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Translate the active map filters into significance hints for the API: base
    // layers the user has HIDDEN -> `off` (demote, mention only as background);
    // accessibility/POI overlays they've turned ON -> `on` (boost — opting in says
    // "this matters to me"). Token = "category" or "category:subtype".
    filterTokens() {
        const off = new Set(), on = new Set();
        const fm = this.filterManager;
        if (fm && this.taxonomy) {
            for (const [id, enabled] of Object.entries(fm.filters)) {
                const feat = this.taxonomy.getById(id);
                if (!feat || !feat.category) continue;
                const tok = (feat.subtype != null) ? `${feat.category}:${feat.subtype}` : `${feat.category}`;
                if (fm.isHideShow(feat)) { if (!enabled) off.add(tok); }
                else if (enabled) on.add(tok);
            }
        }
        return { off: [...off].join(','), on: [...on].join(',') };
    }

    // Same-origin proxy in front of the map-features geo index. Carries the active
    // filter state so results are significance-ranked in line with what the user has
    // asked to see. Returns [] on any failure so tracking never throws.
    async fetchNearby(lat, lng, limit) {
        try {
            const { off, on } = this.filterTokens();
            const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) });
            if (off) qs.set('off', off);
            if (on) qs.set('on', on);
            // Only while travelling does a cross-street's intersection matter more than
            // its nearest point — tell the API so it doesn't report a road that runs
            // beside you as "at the corner ahead" when you're standing still.
            if (this.heading && this.heading.isMoving()) qs.set('moving', '1');
            const res = await fetch(`/api/map-nearby?${qs.toString()}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.results || [];
        } catch (_) {
            return [];
        }
    }

    // Like fetchNearby, but ALSO asks the API for INTERSECTIONS (xings=1) and returns
    // the whole payload {results, intersections}. Used by the on-demand describes so
    // they can name the cross street / corner; the throttled running commentary keeps
    // using the lighter fetchNearby (no xings).
    async fetchNearbyFull(lat, lng, limit) {
        try {
            const { off, on } = this.filterTokens();
            const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit), xings: '1' });
            if (off) qs.set('off', off);
            if (on) qs.set('on', on);
            if (this.heading && this.heading.isMoving()) qs.set('moving', '1');
            const res = await fetch(`/api/map-nearby?${qs.toString()}`);
            if (!res.ok) return { results: [], intersections: [] };
            const data = await res.json();
            return { results: data.results || [], intersections: data.intersections || [] };
        } catch (_) {
            return { results: [], intersections: [] };
        }
    }

    // 8-point compass word from a bearing in degrees.
    cardinal(bearing) {
        const dirs = ['north', 'northeast', 'east', 'southeast',
                      'south', 'southwest', 'west', 'northwest'];
        return dirs[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
    }

    // Direction phrase from one point to another. With a live compass heading we
    // describe it as a CLOCK-FACE bearing relative to where the user is facing
    // (12 o'clock = straight ahead, 3 = to the right, 6 = behind, 9 = to the left);
    // with no magnetometer / permission we fall back to the cardinal compass word.
    directionTo(fromLat, fromLng, toLat, toLng) {
        const bearing = this.locationTracker.calculateBearing(fromLat, fromLng, toLat, toLng);
        const heading = this.heading ? this.heading.getHeading() : null;
        if (heading !== null) {
            const rel = (((bearing - heading) % 360) + 360) % 360; // 0 = dead ahead
            const hour = Math.round(rel / 30) || 12;               // 0 -> 12 o'clock
            return `at ${hour} o'clock`;
        }
        return `to the ${this.cardinal(bearing)}`;
    }

    // Spoken distance: "right here" when on top of it, else rounded metres up to a
    // kilometre, then kilometres — readable, not GPS-precise.
    phraseDistance(metres) {
        if (metres < 8) return 'right here';
        if (metres < 1000) return `${Math.round(metres / 5) * 5} metres`;
        return `${(metres / 1000).toFixed(1)} kilometres`;
    }

    handleLocationError(error) {
        const locationElement = document.getElementById('current-location');
        locationElement.textContent = 'Error: ' + error.message;
        
        this.announceStatus('Location error: ' + error.message);
    }

    centerOnCurrentLocation() {
        // First try to get the current GPS position if tracking is active
        if (this.isTracking) {
            const position = this.locationTracker.getCurrentPosition();
            if (position) {
                this.mapRenderer.setCenter(position.lat, position.lng);
                this.announceStatus('Map centered on current location');
                return;
            }
        }
        
        // Otherwise, center on avatar's position (which should always exist)
        if (this.avatar && this.avatar.position) {
            this.mapRenderer.setCenter(this.avatar.position.lat, this.avatar.position.lng);
            this.announceStatus('Map centered on avatar location');
        } else {
            // This shouldn't happen, but just in case
            this.announceStatus('No location available');
        }
    }

    // "Skip to map" target. The rotor assigns a positive tabindex ONLY to
    // features that are both in a selected category AND currently in the
    // viewport, so `#map-tiles [tabindex]` is exactly the set you can see and
    // operate — the same set you'd tab into from the header. Jump to the first
    // of those (lowest tabindex). If nothing is navigable yet (no rotor
    // category chosen), place focus in the map document itself and say how to
    // make features keyboard-navigable.
    focusFirstMapFeature() {
        const focusables = Array.from(document.querySelectorAll('#map-tiles [tabindex]'))
            .map((el) => ({ el, ti: parseInt(el.getAttribute('tabindex'), 10) }))
            .filter((x) => x.ti > 0)
            .sort((a, b) => a.ti - b.ti);
        if (focusables.length) {
            focusables[0].el.focus();
            return;
        }
        const svg = document.getElementById('map-svg');
        if (svg) {
            // The svg carries a static tabindex="-1" (programmatic focus only) —
            // set in the HTML, nothing to stamp here.
            svg.focus({ preventScroll: true });
        }
        this.announceStatus('Map. Choose a category in the Rotor to navigate features by keyboard.');
    }

    // Search result chosen → recentre on it and move keyboard/screen-reader
    // focus onto the actual feature in the tile, so the sticky tooltip and focus
    // outline behave exactly as for ordinary keyboard navigation. Features carry
    // role="img" + aria-label from the generator, so focusing one announces its
    // name. Addresses with no drawn feature simply recentre.
    // How far (and which way) a go-to moved the user, as a spoken phrase.
    // Empty under 30 m — "you moved 4 metres" is noise, not orientation.
    _movedPhrase(fromLat, fromLng, toLat, toLng) {
        const R = 6371000, rad = Math.PI / 180;
        const dLat = (toLat - fromLat) * rad, dLng = (toLng - fromLng) * rad;
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(fromLat * rad) * Math.cos(toLat * rad) * Math.sin(dLng / 2) ** 2;
        const m = Math.round(2 * R * Math.asin(Math.sqrt(a)));
        if (m < 30) return '';
        const y = Math.sin(dLng) * Math.cos(toLat * rad);
        const x = Math.cos(fromLat * rad) * Math.sin(toLat * rad)
            - Math.sin(fromLat * rad) * Math.cos(toLat * rad) * Math.cos(dLng);
        const brg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(brg / 45) % 8];
        const dist = m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} kilometres` : `${m} metres`;
        return ` — ${dist} ${dir} of where you were`;
    }

    // A go-to relocates the VIRTUAL you (tracking off): the avatar moves to
    // the destination, so "where am I" and every "near me" now anchor there.
    // Tracking ON = the avatar is the physical you — the view moves, you don't.
    _arriveAt(lat, lng) {
        if (!this.isTracking && this.avatar) this.avatar.setPosition(lat, lng, false);
    }

    _cssEscape(id) {
        return (window.CSS && CSS.escape) ? CSS.escape(String(id)) : String(id).replace(/"/g, '\\"');
    }

    _featureEls(osmId) {
        return [...document.querySelectorAll(`#map-tiles [data-osm-id="${this._cssEscape(osmId)}"]`)];
    }

    // Go-to HIGHLIGHT: every segment/shape of the arrived-at feature (a road
    // spans many tiles; each carries the same data-osm-id). Sticky like the
    // tooltip — cleared by the next go-to or Escape — and re-applied to
    // matching geometry in freshly inserted tiles (see renderSVGTiles).
    _setGotoHighlight(osmId) {
        document.querySelectorAll('#map-tiles .goto-highlight')
            .forEach((el) => el.classList.remove('goto-highlight'));
        this._gotoHighlightId = osmId ? String(osmId) : null;
        if (!this._gotoHighlightId) return [];
        const els = this._featureEls(this._gotoHighlightId);
        els.forEach((el) => el.classList.add('goto-highlight'));
        return els;
    }

    // Convert a CLIENT-space point to lat/lng via the current viewBox (the
    // projection is linear: 1000 px per 0.01° at zoom 18, Y southward).
    _clientToLatLng(cx, cy) {
        const svg = this.mapRenderer.svg;
        const r = svg.getBoundingClientRect();
        const vb = this.mapRenderer.viewBox;
        const ux = vb.x + ((cx - r.left) / r.width) * vb.width;
        const uy = vb.y + ((cy - r.top) / r.height) * vb.height;
        return { lat: -uy / 100000, lng: ux / 100000 };
    }

    // Keyboard/screen-reader context must ARRIVE too: the actual feature when
    // its tile has it, otherwise the map itself (the skip-link's programmatic
    // target) so focus is at the destination, never stranded where you were.
    // The sticky tooltip arrives with it (the pill from the place just LEFT is
    // cleared up front; a destination with NO drawn feature gets the pill +
    // marker at the recentred point). For features WITH geometry, the view is
    // FIT to the feature's whole extent — a road or an area gets a zoom that
    // frames it, not a z18 keyhole onto one segment — and every piece of it
    // is highlighted.
    async _focusArrival(osmId, name) {
        if (this.tooltip) this.tooltip.hide();
        if (this.accessibilityManager) this.accessibilityManager.hideFocusOutline();
        this._setGotoHighlight(null);
        const first = osmId ? await this.waitForFeature(String(osmId), 8000) : null;
        if (!first) {
            const svg = document.getElementById('map-svg');
            if (svg) svg.focus({ preventScroll: true });
            // The destination IS the map centre (we just recentred on it).
            if (this.tooltip && name) {
                const r = document.getElementById('map-container').getBoundingClientRect();
                this.tooltip.showLabel(name, r.left + r.width / 2, r.top + r.height / 2);
            }
            return;
        }

        await this._fitToFeature(String(osmId));
        this._setGotoHighlight(osmId);
        const el = this.bestFeatureMatch(document.querySelectorAll(`#map-tiles [data-osm-id="${this._cssEscape(osmId)}"]`));
        if (el) this.focusFeatureElement(el);
    }

    // Fit the view to a feature's loaded extent. Iterative by necessity: at
    // z18 only a keyhole of a long road is in the DOM — fit to what's loaded,
    // zoom out, MORE of it loads, re-fit — converging in a few rounds. Only
    // zooms OUT (a small feature keeps the arrival zoom), floored at z13 so a
    // city-length road never fits the whole metro, and if the coarser LOD
    // band culled the feature entirely, steps back in until it exists again.
    async _fitToFeature(osmId) {
        const container = document.getElementById('map-container');
        for (let round = 0; round < 3; round++) {
            const els = this._featureEls(osmId);
            if (!els.length) break;
            let l = Infinity, t = Infinity, rgt = -Infinity, b = -Infinity;
            for (const el of els) {
                const r = el.getBoundingClientRect();
                if (!r.width && !r.height) continue;
                l = Math.min(l, r.left); t = Math.min(t, r.top);
                rgt = Math.max(rgt, r.right); b = Math.max(b, r.bottom);
            }
            if (!Number.isFinite(l)) break;
            const vp = container.getBoundingClientRect();
            const w = Math.max(rgt - l, 1), h = Math.max(b - t, 1);
            // How many zoom levels OUT to fit the extent into ~80% of the view.
            const fit = Math.floor(Math.log2(Math.min((vp.width * 0.8) / w, (vp.height * 0.8) / h)));
            const targetZoom = Math.max(13, Math.min(18, this.mapRenderer.zoom + Math.min(fit, 0)));
            const centre = this._clientToLatLng(l + (rgt - l) / 2, t + (b - t) / 2);
            const done = targetZoom === this.mapRenderer.zoom && round > 0;
            if (targetZoom !== this.mapRenderer.zoom) this.mapRenderer.setZoom(targetZoom);
            this.mapRenderer.setCenter(centre.lat, centre.lng);
            await this.loadMapTiles();
            // The coarser band may have CULLED the feature — step back in.
            let guard = 0;
            while (!this._featureEls(osmId).length && this.mapRenderer.zoom < 18 && guard++ < 3) {
                this.mapRenderer.setZoom(this.mapRenderer.zoom + 1);
                await this.loadMapTiles();
            }
            if (done) break;
        }
    }

    async goToSearchResult(result) {
        if (!result || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return;

        const from = (this.avatar && this.avatar.position) || this.mapRenderer.center;
        // Pull in to a readable street-level zoom if we're currently zoomed out.
        if (this.mapRenderer.zoom < 18) this.mapRenderer.setZoom(18);
        this.mapRenderer.setCenter(result.lat, result.lng);
        this._arriveAt(result.lat, result.lng);
        this.announceStatus(`Showing ${result.display}${this._movedPhrase(from.lat, from.lng, result.lat, result.lng)}.`);
        await this._focusArrival(result.id, result.display);
    }

    // Resolve the tile feature element for an OSM id, waiting for its tile to
    // render if needed (setCenter triggers an async tile load). Returns null if
    // it never appears within the timeout.
    waitForFeature(osmId, timeoutMs) {
        const escId = (window.CSS && CSS.escape) ? CSS.escape(osmId) : osmId.replace(/"/g, '\\"');
        const selector = `#map-tiles [data-osm-id="${escId}"]`;
        const pick = () => this.bestFeatureMatch(document.querySelectorAll(selector));

        return new Promise((resolve) => {
            const existing = pick();
            if (existing) { resolve(existing); return; }

            const tiles = document.getElementById('map-tiles');
            if (!tiles) { resolve(null); return; }

            const observer = new MutationObserver(() => {
                const found = pick();
                if (found) { observer.disconnect(); clearTimeout(timer); resolve(found); }
            });
            observer.observe(tiles, { childList: true, subtree: true });

            const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
        });
    }

    // A feature clipped across tiles can appear in several loaded tiles. Prefer
    // an instance currently within the viewport so focus lands on something the
    // user can see.
    bestFeatureMatch(nodeList) {
        const nodes = Array.from(nodeList);
        if (nodes.length === 0) return null;
        const vp = this.mapRenderer.svg.getBoundingClientRect();
        const onScreen = nodes.find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 &&
                   r.right > vp.left && r.left < vp.right &&
                   r.bottom > vp.top && r.top < vp.bottom;
        });
        return onScreen || nodes[0];
    }

    // Move focus onto a feature element. It gets a positive tabindex in a
    // dedicated "search target" band (above the compass, below the map-feature
    // band) so its place in the Tab circuit is well-defined; any previous search
    // target is cleared first. Focusing fires the map's focusin handler, which
    // draws the outline, and the sticky tooltip, which reads the aria-label.
    focusFeatureElement(el) {
        document.querySelectorAll('#map-tiles [data-search-focus]').forEach((prev) => {
            prev.removeAttribute('tabindex');
            prev.removeAttribute('data-search-focus');
        });
        el.setAttribute('tabindex', '8500');
        el.setAttribute('data-search-focus', '');
        // The search announcement (name, distance, direction) is already
        // speaking; pre-mark the feature as announced so the focus event's
        // bare label doesn't cancel that richer message mid-sentence.
        if (this.accessibilityManager) this.accessibilityManager._lastAnnounced = el;
        el.focus({ preventScroll: true });
    }

    setMockLocation() {
        const lat = parseFloat(document.getElementById('lat-input').value);
        const lng = parseFloat(document.getElementById('lng-input').value);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            this.locationTracker.enableMockLocation(true);
            this.locationTracker.setMockLocation(lat, lng);
            this.announceStatus(`Mock location set to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
    }

    announceStatus(message) {
        // ONE announcer for all transient status — pan/zoom, search, tracking,
        // tile-load, the skip-link hint. Spoken (Web Speech, latest-wins) when
        // audio is on; the polite #map-announcements region when audio is off or
        // there is no speech engine. The announcer mirrors every message to the
        // visible captions panel. (Location DATA has its own surface: the
        // visible #location-info panel.)
        this.announcer.announce(message);
    }

    // The disclaimer gate, same as every map in this family: the notice comes
    // before the map — viewing the map is itself gaining information — and the
    // app stays hidden (and out of the accessibility tree) until accepted.
    // Re-shown every visit. The Start click is also the user gesture that
    // primes the speech engine.
    setupGate() {
        const gate = document.getElementById('map-gate');
        const accept = document.getElementById('gate-accept');
        const start = document.getElementById('gate-start');
        if (!gate || !accept || !start) return;
        accept.addEventListener('change', () => { start.disabled = !accept.checked; });
        start.addEventListener('click', () => {
            gate.hidden = true;
            ['skip-to-compass', 'skip-to-map', 'skip-to-chat', 'control-sidebar'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.hidden = false;
            });
            const main = document.querySelector('main:not(#map-gate)');
            if (main) main.hidden = false;
            // The compass toggle may have hidden the skip link + rose again —
            // re-apply the persisted preference over the blanket reveal.
            const compassOn = localStorage.getItem('map-compass-on') !== 'off';
            const skipCompass = document.getElementById('skip-to-compass');
            if (skipCompass) skipCompass.hidden = !compassOn;
            // Same for the chat skip link: it tracks the panel (hidden when
            // the desktop panel is switched off in Settings).
            const chatPanel = document.getElementById('chat-panel');
            const skipChat = document.getElementById('skip-to-chat');
            if (skipChat && chatPanel) skipChat.hidden = chatPanel.hidden;

            // The dialog GOES on the click, unconditionally; a busy state
            // holds its place until the first full render.
            const busy = document.getElementById('map-busy');
            if (busy) busy.hidden = false;
            this.announcer.prime();
            const title = document.getElementById('app-title');
            if (title) title.focus();
            this.announceStatus('Loading the map…');

            // Let that state PAINT before the heavy work: the warmed tiles
            // resolve from cache in a microtask, so without a real frame here
            // the multi-hundred-millisecond SVG insert runs before any
            // repaint — the dead dialog stays frozen on screen and Start
            // appears to ignore clicks.
            requestAnimationFrame(() => setTimeout(() => {
                if (!this.mapRenderer) { if (busy) busy.hidden = true; return; }
                // Size against the now-visible container and load for real.
                this.mapRenderer.handleResize();
                this.mapRenderer.render();
                Promise.resolve(this.loadMapTiles(true)).finally(() => {
                    if (busy) busy.hidden = true;
                    // Only claim readiness if tiles actually landed — on a
                    // failure loadMapTiles has already announced the error,
                    // and "Map ready" must not talk over it.
                    if (document.querySelector('#map-tiles [data-tile-id]')) {
                        this.announceStatus('Map ready.');
                    }
                });
            }, 0));
        });
    }

    // The settings dialog: same idiom as the detail modal (Escape closes,
    // focus returns to the opener), but with a real Tab CYCLE — it holds
    // several controls. The toggles inside keep their own id-based wiring;
    // the dialog is only their home.
    setupSettingsDialog() {
        const modal = document.getElementById('settings-modal');
        const opener = document.getElementById('open-settings');
        const close = document.getElementById('settings-modal-close');
        if (!modal || !opener || !close) return;

        const open = () => {
            this._settingsReturnFocus = document.activeElement;
            modal.hidden = false;
            const first = modal.querySelector('button');
            if (first) first.focus();
        };
        const shut = () => {
            modal.hidden = true;
            const back = this._settingsReturnFocus;
            if (back && back.focus) back.focus();
        };

        opener.addEventListener('click', open);
        close.addEventListener('click', shut);
        // Click on the backdrop (the modal element itself) closes, like the
        // detail modal.
        modal.addEventListener('click', (e) => { if (e.target === modal) shut(); });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); shut(); return; }
            if (e.key !== 'Tab') return;
            // Cycle focus through the dialog's VISIBLE buttons — the page's
            // positive tabindex bands must not pull focus out of an open modal,
            // and a display:none button (the Chat panel toggle hides in mobile
            // split mode) must not wedge the cycle.
            const items = Array.from(modal.querySelectorAll('button'))
                .filter((b) => b.getClientRects().length);
            if (!items.length) return;
            const i = items.indexOf(document.activeElement);
            e.preventDefault();
            const next = e.shiftKey
                ? items[(i - 1 + items.length) % items.length]
                : items[(i + 1) % items.length];
            next.focus();
        });
    }

    // The navigation rose (compass) toggle: hides/shows the on-map compass
    // controls. Off also hides the "Skip to compass" link — a skip link must
    // never lead to a hidden target. Preference persists.
    setupCompassToggle() {
        const btn = document.getElementById('toggle-compass');
        if (!btn) return;
        const compass = document.getElementById('compass-navigator');
        const skip = document.getElementById('skip-to-compass');
        const apply = (on) => {
            btn.setAttribute('aria-pressed', String(on));
            if (compass) compass.hidden = !on;
            if (skip) skip.hidden = !on;
        };
        apply(localStorage.getItem('map-compass-on') !== 'off');
        btn.addEventListener('click', () => {
            const on = btn.getAttribute('aria-pressed') !== 'true';
            localStorage.setItem('map-compass-on', on ? 'on' : 'off');
            apply(on);
            this.announceStatus(on
                ? 'Navigation rose on.'
                : 'Navigation rose off. Pan with Control and the arrow keys.');
        });
    }

    // Relative location: ON (default) appends where the explored point sits
    // relative to YOU — "35 metres at 7 o'clock" — to every click/hover/
    // touch/focus announcement and tooltip. OFF for quieter announcements;
    // the street anchor ("15 metres from County Road 507") stays either way.
    // Preference persists.
    setupRelativeToggle() {
        this.relativeOn = localStorage.getItem('map-relative-on') !== 'off';
        const btn = document.getElementById('toggle-relative');
        if (!btn) return;
        btn.setAttribute('aria-pressed', String(this.relativeOn));
        btn.addEventListener('click', () => {
            this.relativeOn = !this.relativeOn;
            localStorage.setItem('map-relative-on', this.relativeOn ? 'on' : 'off');
            btn.setAttribute('aria-pressed', String(this.relativeOn));
            this.announceStatus(this.relativeOn
                ? 'Relative location on. Features tell you their distance and direction from you.'
                : 'Relative location off.');
        });
    }

    // Speak tooltips: ON (default) = feature announcements (hover/click/
    // touch/focus) are spoken like everything else. OFF = they route to the
    // screen-reader live region only — a sighted user reading the visual pill
    // silences just that voice, keeping chat answers and status speech, where
    // the Audio toggle would silence everything. Preference persists.
    setupTooltipSpeechToggle() {
        this.tooltipSpeechOn = localStorage.getItem('map-tooltip-speech') !== 'off';
        const btn = document.getElementById('toggle-tooltip-speech');
        if (!btn) return;
        btn.setAttribute('aria-pressed', String(this.tooltipSpeechOn));
        btn.addEventListener('click', () => {
            this.tooltipSpeechOn = !this.tooltipSpeechOn;
            localStorage.setItem('map-tooltip-speech', this.tooltipSpeechOn ? 'on' : 'off');
            btn.setAttribute('aria-pressed', String(this.tooltipSpeechOn));
            this.announceStatus(this.tooltipSpeechOn
                ? 'Tooltips spoken aloud.'
                : 'Tooltips muted. They still go to the screen reader.');
        });
    }

    // The audio toggle: ON = announcements spoken aloud (cancellable, so a
    // finger sweep never hears a stale backlog); OFF = the polite live region,
    // for screen-reader users who want one voice, theirs. State persists.
    setupAudioToggle() {
        const btn = document.getElementById('toggle-audio');
        if (!btn) return;
        const reflect = () => {
            const on = this.announcer.audioOn;
            btn.setAttribute('aria-pressed', String(on));
            const icon = btn.querySelector('.icon');
            if (icon) icon.textContent = on ? '🔊' : '🔇';
        };
        reflect(); // honour the persisted preference on load
        btn.addEventListener('click', () => {
            this.announcer.setAudio(!this.announcer.audioOn);
            reflect();
            // Announced on the channel just SWITCHED TO, so the confirmation
            // itself demonstrates where announcements now go.
            this.announceStatus(this.announcer.audioOn
                ? 'Audio on. Announcements are spoken aloud.'
                : 'Audio off. Announcements go to the screen reader.');
        });
    }

    // The visible twin of everything spoken lands in the CHAT transcript (the
    // old bottom-of-page captions panel is retired — one output surface). An
    // announcement entry, styled apart from conversation turns. NOT a live
    // region: the speech itself comes from the Announcer; this is the
    // re-readable record. Chat replies skip this mirror (caption:false) —
    // they are already their own transcript messages.
    _caption(message) {
        const log = document.getElementById('chat-log');
        if (!log) return;
        // Collapse an immediate repeat (hover sweeps re-announce the same
        // feature) rather than stacking identical lines.
        const last = log.lastElementChild;
        if (last && last.classList.contains('chat-msg--announce')
            && last.querySelector('.chat-msg__text')?.textContent === message) return;
        const wrap = document.createElement('div');
        wrap.className = 'chat-msg chat-msg--announce';
        const who = document.createElement('span');
        who.className = 'screen-reader-only';
        who.textContent = 'Map: ';
        const p = document.createElement('p');
        p.className = 'chat-msg__text';
        p.textContent = message;
        wrap.append(who, p);
        log.append(wrap);
        wrap.scrollIntoView({ block: 'nearest' });
    }

    // What the map is centred on, in the MAP'S vocabulary — never raw
    // lat/lon (meaningless read aloud). Best-first: the named feature the
    // centre point is INSIDE (a park, a campus, a named building — the paint
    // stack's topmost is the most specific); a street corner (two distinct
    // named roads under the point — their 24px hit corridors make this an
    // ~12px tolerance); the road the centre is on; else the nearest named
    // feature in view. Generic labels ("Building", "Footpath") never anchor.
    // Live positional suffix for a feature being announced/tooltipped, from
    // the explored point: street anchor + where that point sits relative to
    // YOU — "15 metres from County Road 507, 35 metres at 7 o'clock". The
    // street pins the point to the world, the relative phrase pins it to you.
    streetContextFor(g, x, y) {
        if (!this.mapRenderer) return '';
        const street = streetContextAt(g, x, y, {
            svg: this.mapRenderer.svg,
            viewBox: this.mapRenderer.viewBox,
        });
        return [street, this._relativeToYou(x, y)].filter(Boolean).join(', ');
    }

    // "35 metres at 7 o'clock" — the explored point relative to the avatar
    // (the physical you when tracking, the virtual you otherwise). Clock face
    // when the compass knows which way you face, cardinal words otherwise.
    // Silent within 10 m: that's where you're standing, not a direction.
    // The Settings "Relative location" toggle turns this phrase off entirely.
    _relativeToYou(x, y) {
        if (!this.relativeOn) return '';
        if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
        const you = (this.avatar && this.avatar.position) || (this.mapRenderer && this.mapRenderer.center);
        if (!you || !this.locationTracker) return '';
        const p = this._clientToLatLng(x, y);
        const m = this.locationTracker.calculateDistance(you.lat, you.lng, p.lat, p.lng);
        if (!Number.isFinite(m) || m < 10) return '';
        return `${this.phraseDistance(m)} ${this._where(you, p)}`;
    }

    describeMapCentre() {
        const cont = document.getElementById('map-container');
        if (!cont) return '';
        const r = cont.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const GENERIC = GENERIC_NAME;   // shared with StreetContext.js
        const nameOf = (g) => {
            const label = g.getAttribute('aria-label') || '';
            // Never anchor on the a11y overlay markers or on aggregate
            // clusters ("2 Uncontrolled crossings") — those describe, they
            // don't name. (Addresses also start with a digit but don't end
            // in a plural s: "8 Adelaide Street West" passes.)
            if (/^accessible features here/i.test(label)) return '';
            const first = label.split(/[,.]/)[0].trim();
            if (/^\d+\s/.test(first) && /s$/.test(first)) return '';
            return first && !GENERIC.test(first) ? first : '';
        };

        // 1 + 2 + 3: what's UNDER the centre point, topmost (most specific)
        // first. Point markers carry constant-size 24px touch rings that
        // "contain" the centre at any zoom — a dot is never a container, so
        // only meaningfully sized geometry counts.
        const stack = [];
        for (const el of document.elementsFromPoint(cx, cy)) {
            const g = el.closest ? el.closest('#map-tiles [aria-label]') : null;
            if (!g || stack.includes(g)) continue;
            const b = g.getBoundingClientRect();
            if (Math.max(b.width, b.height) < 30) continue;
            stack.push(g);
        }
        const roadNames = [];
        for (const g of stack) {
            const name = nameOf(g);
            if (!name) continue;
            if (g.classList.contains('road')) {
                if (!roadNames.includes(name)) roadNames.push(name);
            } else {
                return `centred on ${name}`;
            }
        }
        // Road anchors come from constant-width (24px screen) hit corridors,
        // so their GROUND tolerance grows as you zoom out — at z12 that's
        // half a kilometre, and "at the corner of" would claim false
        // precision. Stay honest: corners and "on" only at street-level
        // zooms; "near" below that.
        const tight = this.mapRenderer.zoom >= 15;
        if (tight && roadNames.length >= 2) return `at the corner of ${roadNames[0]} and ${roadNames[1]}`;
        if (roadNames.length >= 1) return `${tight ? 'on' : 'near'} ${roadNames[0]}`;

        // 4: the nearest NAMED feature in view (within ~a third of the viewport).
        const maxDist = Math.min(r.width, r.height) / 3;
        let best = null, bestDist = Infinity;
        for (const g of document.querySelectorAll('#map-tiles [aria-label]')) {
            const name = nameOf(g);
            if (!name) continue;
            const b = g.getBoundingClientRect();
            if (!b.width && !b.height) continue;   // hidden plane / filtered out
            const d = Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy);
            if (d < bestDist) { bestDist = d; best = name; }
        }
        if (best && bestDist <= maxDist) return `near ${best}`;
        return '';
    }

    announceMapChange() {
        const zoom = this.mapRenderer.zoom;
        const where = this.describeMapCentre();
        this.announceStatus(`Map view: zoom level ${zoom}${where ? ', ' + where : ''}`);
    }
    
    updateZoomButtonStates() {
        const zoomInButton = document.getElementById('nav-zoom-in');
        const zoomOutButton = document.getElementById('nav-zoom-out');
        const currentZoom = this.mapRenderer.zoom;
        
        // Update zoom in button - disable when at max zoom (23)
        if (currentZoom >= 23) {
            zoomInButton.setAttribute('disabled', 'true');
            zoomInButton.setAttribute('aria-disabled', 'true');
            zoomInButton.classList.add('disabled');
        } else {
            zoomInButton.removeAttribute('disabled');
            zoomInButton.setAttribute('aria-disabled', 'false');
            zoomInButton.classList.remove('disabled');
        }
        
        // Update zoom out button - disable when at min zoom (15)
        if (currentZoom <= 15) {
            zoomOutButton.setAttribute('disabled', 'true');
            zoomOutButton.setAttribute('aria-disabled', 'true');
            zoomOutButton.classList.add('disabled');
        } else {
            zoomOutButton.removeAttribute('disabled');
            zoomOutButton.setAttribute('aria-disabled', 'false');
            zoomOutButton.classList.remove('disabled');
        }
    }
    
    // Pre-gate warm-up: pull the viewport's tiles (and the index) into the
    // SVGTileManager cache and stop there. Failures stay silent — this is
    // opportunistic; the real load at gate-start surfaces any error.
    async warmMapTiles() {
        try {
            const bounds = this.getBoundsFromView();
            await this.svgTileManager.loadTilesForArea(bounds, this.mapRenderer.zoom);
        } catch { /* warm-up only */ }
    }

    async loadMapTiles(clearExisting = false) {
        // While the disclaimer gate is up, nothing may RENDER — parsing and
        // inserting megabytes of SVG janks the gate's checkbox and Start
        // button. Every entry point (init, resize, the debounced map-change
        // listener) funnels through here, so divert them ALL to the
        // network-only warm-up; the Start handler re-enters once the map is
        // visible and renders from the warmed cache.
        const gate = document.getElementById('map-gate');
        if (gate && !gate.hidden) return this.warmMapTiles();
        // Load generation: if a newer load starts while this one awaits (fast
        // panning), the stale one bows out instead of rendering/announcing.
        const gen = (this._loadGen = (this._loadGen || 0) + 1);
        try {
            // Get current map bounds
            const bounds = this.getBoundsFromView();

            // If the zoom has crossed an LOD band boundary, the old band's tiles
            // (same ids, different content) must be cleared and replaced.
            const band = this.svgTileManager.bandForZoom(this.mapRenderer.zoom);
            if (band !== this._loadedBand) {
                clearExisting = true;
                this._loadedBand = band;
            }

            // No "loading map tiles…" announcement — tile loading happens on every
            // pan and zoom, and the user doesn't need to hear it.

            // Load SVG tiles for the area (band chosen from the zoom)
            const { tiles, stats } = await this.svgTileManager.loadTilesForArea(bounds, this.mapRenderer.zoom);

            if (gen !== this._loadGen) return; // superseded by a newer load

            if (!tiles || tiles.length === 0) {
                this.announceStatus(stats && stats.failed > 0
                    ? `Map data could not be loaded — ${stats.failed} tile${stats.failed === 1 ? '' : 's'} failed.`
                    : 'No map data available for this area');
                return;
            }

            // Only clear old tiles if explicitly requested (e.g., on initial load)
            if (clearExisting) {
                this.clearMapTiles();
            }
            
            // Get currently loaded tile IDs
            const tilesGroup = document.querySelector('#map-tiles');
            const loadedTileIds = new Set();
            if (tilesGroup) {
                tilesGroup.querySelectorAll('[data-tile-id]').forEach(tile => {
                    loadedTileIds.add(tile.getAttribute('data-tile-id'));
                });
            }
            
            // Only render tiles that aren't already loaded
            const newTiles = tiles.filter(tile => !loadedTileIds.has(tile.id));
            
            if (newTiles.length > 0) {
                // Mid-pan loads insert ONE TILE PER FRAME: a vertical drag
                // exposes a whole tile row (2–3 tiles), and parsing+inserting
                // them in a single task froze the map at every settle. Each
                // tile still appears WHOLE. Initial and band-switch loads
                // (clearExisting) stay atomic — the view arrives all at once,
                // never a partially assembled page.
                await this.renderSVGTiles(newTiles, {
                    chunked: !clearExisting,
                    isCurrent: () => gen === this._loadGen,
                });
                if (gen !== this._loadGen) return; // superseded mid-insert
                // (Filter states are applied per tile INSIDE the insert, so
                // hidden-by-filter features never flash before hiding.)
            }

            // ONE viewport-focus pass per settled load, whether or not new
            // tiles landed — a pan within already-loaded tiles still changes
            // which features are on screen. (Previously this ran here AND in
            // the map-change settle: two full 13k-feature passes back to back.)
            if (this.accessibilityManager) {
                this.accessibilityManager.updateTabOrder();
            }

            // Clean up tiles that are far outside the current view
            this.cleanupDistantTiles();

            // Warm neighbours once the view settles: the adjacent LOD bands (so a
            // zoom across is instant) and a one-tile pan ring. The persistent
            // band-cache keeps them; Brotli's bandwidth saving funds the prefetch.
            this._schedulePrefetch(bounds);

            // Stay silent on a normal load — the user doesn't need a tile count on
            // every pan/zoom. Only speak up if some tiles actually FAILED to load.
            if (stats && stats.failed > 0) {
                this.announceStatus(`Map data: ${stats.failed} tile${stats.failed === 1 ? '' : 's'} failed to load.`);
            }
        } catch (error) {
            if (gen === this._loadGen) {
                this.announceStatus('Error loading map. Please try again.');
            }
        }
    }

    getBoundsFromView() {
        const center = this.mapRenderer.center;
        const zoom = this.mapRenderer.zoom;
        const width = this.mapRenderer.viewBox.width;
        const height = this.mapRenderer.viewBox.height;
        
        // The viewBox lives in project() space, whose scale is FIXED at 1000px per
        // 0.01° regardless of zoom — the viewBox itself already encodes the zoom
        // (it grows as you zoom out). So this conversion must use that same fixed
        // scale, NOT a zoom-dependent one; otherwise the tiles we load stop lining
        // up with where project() actually draws them (the off-zoom breakage).
        const degreesPerTile = 0.01;
        const pixelsPerDegree = 1000 / degreesPerTile; // 100000 — must match MapRenderer.project()

        // Calculate how many degrees the viewport covers
        const viewportWidthDegrees = width / pixelsPerDegree;
        const viewportHeightDegrees = height / pixelsPerDegree;
        
        // A11Y-TREE FIX (downtown TalkBack freeze, confirmed 2026-06-24): load ONLY
        // the tiles overlapping the visible viewport — NO load-ahead padding. Each
        // downtown tile carries ~1840 labelled role=img nodes; the old 1-tile padding
        // ring (+ the 2-tile keep buffer below) put a 5–7-tile square in the DOM,
        // ballooning the accessibility tree to 60–90k nodes — Chrome serialises that
        // whole tree to TalkBack and Android's a11y framework ANRs, hanging the PHONE.
        // Trade-off accepted for now: tiles pop in at the leading edge while panning.
        // Do NOT restore preloading until explore-by-touch is moved OFF the
        // screen-reader's a11y tree (planned: custom Web Speech API) — any real
        // padding/keep ring re-freezes TalkBack downtown.
        //
        // EXCEPTION — heading-up mode: a rotated viewport pulls its diagonal CORNERS
        // into view, so we load a square big enough to cover the rotated view (half-
        // side = the viewport's half-DIAGONAL) for ANY heading. This is opt-in, so the
        // default north-up view stays viewport-only and TalkBack-safe.
        let padLat = 0, padLng = 0;
        if (this.headingUp) {
            const halfDiag = 0.5 * Math.sqrt(
                viewportWidthDegrees * viewportWidthDegrees +
                viewportHeightDegrees * viewportHeightDegrees);
            padLat = Math.max(0, halfDiag - viewportHeightDegrees / 2);
            padLng = Math.max(0, halfDiag - viewportWidthDegrees / 2);
        }

        const bounds = {
            north: center.lat + viewportHeightDegrees / 2 + padLat,
            south: center.lat - viewportHeightDegrees / 2 - padLat,
            east: center.lng + viewportWidthDegrees / 2 + padLng,
            west: center.lng - viewportWidthDegrees / 2 - padLng
        };
        
        // Ensure bounds cover at least one tile
        const minTileSpan = degreesPerTile;
        if (bounds.north - bounds.south < minTileSpan) {
            const midLat = (bounds.north + bounds.south) / 2;
            bounds.north = midLat + minTileSpan / 2;
            bounds.south = midLat - minTileSpan / 2;
        }
        if (bounds.east - bounds.west < minTileSpan) {
            const midLng = (bounds.east + bounds.west) / 2;
            bounds.east = midLng + minTileSpan / 2;
            bounds.west = midLng - minTileSpan / 2;
        }
        
        
        return bounds;
    }

    // Prefetch neighbours after the user pauses (debounced), so it never fires
    // mid-gesture. Adjacent bands make a zoom across instant; the ring smooths pan.
    _schedulePrefetch(bounds) {
        // A11Y-TREE FIX (downtown TalkBack freeze): prefetch DISABLED. It only warms
        // the in-memory cache (not the DOM), so it isn't the a11y-tree culprit — kept
        // off so ALL preloading stays off the table. Safe to re-enable once
        // explore-by-touch is decoupled from the screen-reader a11y tree; harmless to
        // leave off (it only affected pan/zoom smoothness, not correctness).
        return;
        clearTimeout(this._prefetchTimer);
        this._prefetchTimer = setTimeout(() => {
            const mgr = this.svgTileManager;
            const z = this.mapRenderer.zoom;
            const cur = mgr.bandForZoom(z);
            const zin = mgr.bandForZoom(z + 1);
            const zout = mgr.bandForZoom(z - 1);
            if (zin !== cur) mgr.prefetchArea(bounds, zin);
            if (zout !== cur) mgr.prefetchArea(bounds, zout);
            const ts = mgr.tileSize;
            mgr.prefetchArea({
                north: bounds.north + ts, south: bounds.south - ts,
                east: bounds.east + ts, west: bounds.west - ts,
            }, cur);
        }, 450);
    }

    async renderSVGTiles(tiles, { chunked = false, isCurrent = () => true } = {}) {
        const tilesGroup = document.querySelector('#map-tiles') ||
                         this.mapRenderer.svg.querySelector('#map-tiles');

        if (!tilesGroup) {
            console.error('No tiles group found in SVG');
            return;
        }

        const insertTile = (tile) => {
            if (!tile.content) return;

            const existingTile = tilesGroup.querySelector(`[data-tile-id="${tile.id}"]`);
            if (existingTile) existingTile.remove();

            try {
                const svgDoc = new DOMParser().parseFromString(tile.content, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;

                const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                tileGroup.setAttribute('class', 'tile');
                tileGroup.setAttribute('data-tile-id', tile.id);
                // North-up: anchor each tile by its NORTH edge (south edge + one
                // tile); the generator flips Y internally. ViewBox handles zoom.
                const pos = this.latLngToPixel(tile.lat + 0.01, tile.lng);
                tileGroup.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

                // Hot path: MOVE the parsed nodes straight in (adoptNode, not a
                // deep importNode clone) in a single insert. The generator now
                // emits tile-unique clip ids + correct classes, so none of the old
                // per-feature fixups (id rename, clip relink, class-/tabindex
                // patches) are needed — this runs for every tile on every pan/zoom.
                const frag = document.createDocumentFragment();
                while (svgElement.firstChild) {
                    frag.appendChild(document.adoptNode(svgElement.firstChild));
                }
                tileGroup.appendChild(frag);

                // Filter states land BEFORE the tile joins the document (and
                // before its first paint): scoped to this one tile, skipping
                // default-state filters — see FilterManager.applyVisibilityWithin.
                if (this.filterManager) this.filterManager.applyVisibilityWithin(tileGroup);

                // A live go-to highlight carries over to fresh geometry: a
                // highlighted road's newly loaded segments light up too.
                if (this._gotoHighlightId) {
                    tileGroup.querySelectorAll(`[data-osm-id="${this._cssEscape(this._gotoHighlightId)}"]`)
                        .forEach((el) => el.classList.add('goto-highlight'));
                }

                tilesGroup.appendChild(tileGroup);
            } catch (error) {
                console.error(`Failed to render tile ${tile.id}:`, error);
            }
        };

        if (chunked) {
            // One tile per FRAME: each tile appears whole, and the main thread
            // breathes between inserts so a live drag never wades through a
            // multi-tile parse (a vertical pan settles with a whole tile row).
            for (const tile of tiles) {
                if (!isCurrent()) return;   // superseded mid-insert
                insertTile(tile);
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
        } else {
            // Atomic: initial load and band switches present the whole view
            // at once — never a partially assembled map.
            tiles.forEach(insertTile);
        }

        // In heading-up mode, labels in the tiles just inserted haven't had
        // the flip pass (applyRotation only re-runs it when the ANGLE changes
        // — see MapRenderer) — bring them the right way up now.
        if (this.mapRenderer && this.mapRenderer.rotation) {
            this.mapRenderer.applyLabelFlips();
        }
    }

    latLngToPixel(lat, lng) {
        // Use the MapRenderer's project method for consistent coordinates
        // This gives us absolute pixel coordinates in the SVG space
        return this.mapRenderer.project(lat, lng);
    }
    
    clearMapTiles() {
        const tilesGroup = document.querySelector('#map-tiles');
        if (tilesGroup) {
            while (tilesGroup.firstChild) {
                tilesGroup.removeChild(tilesGroup.firstChild);
            }
        }
    }
    
    cleanupDistantTiles() {
        const bounds = this.getBoundsFromView();
        const tilesGroup = document.querySelector('#map-tiles');
        
        if (!tilesGroup) return;
        
        // A11Y-TREE FIX (downtown TalkBack freeze): keep ONLY viewport tiles in the
        // DOM (was 0.02 = a 2-tile ring). Smaller DOM = smaller accessibility tree.
        // Don't restore the ring until explore-by-touch is off the a11y tree.
        const buffer = 0;
        const expandedBounds = {
            north: bounds.north + buffer,
            south: bounds.south - buffer,
            east: bounds.east + buffer,
            west: bounds.west - buffer
        };
        
        // Remove tiles that are outside the expanded bounds
        tilesGroup.querySelectorAll('[data-tile-id]').forEach(tile => {
            const tileId = tile.getAttribute('data-tile-id');
            const [lat, lng] = tileId.split('_').map(parseFloat);
            
            // Check if tile is outside expanded bounds
            if (lat + 0.01 < expandedBounds.south || lat > expandedBounds.north ||
                lng + 0.01 < expandedBounds.west || lng > expandedBounds.east) {
                tile.remove();
            }
        });
    }
    
    hideTiles() {
        const tilesGroup = document.querySelector('#map-tiles');
        if (tilesGroup) {
            tilesGroup.style.opacity = '0';
            tilesGroup.style.pointerEvents = 'none';
        }
    }
    
    showTiles() {
        const tilesGroup = document.querySelector('#map-tiles');
        if (tilesGroup) {
            tilesGroup.style.opacity = '1';
            tilesGroup.style.pointerEvents = 'auto';
        }
    }
    
    setupMapChangeListeners() {
        let loadTimeout;
        let lastRequestBounds = null;
        
        // Create a debounced version of loadMapTiles
        const debouncedLoad = () => {
            clearTimeout(loadTimeout);

            // Deliberately NO cancelAllRequests here: this fires on EVERY
            // pointermove of a drag, so cancelling meant no tile fetch could
            // ever complete while the user was still moving — mid-drag the
            // map went grey and stayed grey until the hand paused. In-flight
            // requests only ever start on a settle (below), so letting them
            // finish wastes at most one viewport's worth of tiles, which the
            // cache keeps anyway.

            loadTimeout = setTimeout(() => {
                // Keep the renderer's VIEWPORT (container pixel size) current — it
                // can change on resize — then DERIVE the viewBox from the current
                // zoom. The viewBox is zoom-scaled (viewport / 2^(zoom-18)); the old
                // code wrote the raw container size straight into viewBox.width/
                // height, which is only correct at zoom 18. At any other zoom it
                // snapped the viewBox back to zoom-18 scale ~300ms after a pan — a
                // phantom zoom-in (this.zoom stayed put, but the view jumped a
                // level). Recompute around the existing centre so the view holds.
                const r = this.mapRenderer;
                const rect = r.svg.parentElement.getBoundingClientRect();
                r.viewport.width = rect.width;
                r.viewport.height = rect.height;
                const cx = r.viewBox.x + r.viewBox.width / 2;
                const cy = r.viewBox.y + r.viewBox.height / 2;
                const scale = Math.pow(2, r.zoom - 18);
                r.viewBox.width = rect.width / scale;
                r.viewBox.height = rect.height / scale;
                r.viewBox.x = cx - r.viewBox.width / 2;
                r.viewBox.y = cy - r.viewBox.height / 2;
                r.updateViewBox();

                // Get current bounds
                const bounds = this.getBoundsFromView();
                
                // Check if bounds have changed significantly
                if (this.boundsHaveChanged(bounds, lastRequestBounds)) {
                    lastRequestBounds = bounds;
                    // loadMapTiles ends with its own viewport-focus pass.
                    this.loadMapTiles();
                } else if (this.accessibilityManager) {
                    // Sub-threshold pan: nothing to load, but the on-screen
                    // set still shifted — refresh the rotor's focus set ONCE.
                    // (Per-pointermove refreshes — 13k forced layouts per
                    // twitch of the hand — are what made dragging wade; a
                    // keyboard user interacts with a SETTLED view, so 300ms
                    // staleness is imperceptible.)
                    this.accessibilityManager.updateTabOrder();
                }
            }, 300); // Wait 300ms after movement stops
        };

        // Override MapRenderer methods to add tile loading
        const originalSetCenter = this.mapRenderer.setCenter.bind(this.mapRenderer);
        this.mapRenderer.setCenter = (lat, lng) => {
            originalSetCenter(lat, lng);
            // Only load tiles when panning, not zooming. Per-move work is kept
            // to the minimum a drag needs (viewBox + avatar); the tab-order
            // refresh rides the debounced settle above.
            debouncedLoad();
            // Update avatar position
            if (this.avatar) {
                this.avatar.refresh();
            }
        };
        
        const originalSetZoom = this.mapRenderer.setZoom.bind(this.mapRenderer);
        this.mapRenderer.setZoom = (zoom) => {
            const newZoom = originalSetZoom(zoom);
            this.updateZoomButtonStates();
            // The viewBox alone handles zoom WITHIN a band; only when the zoom
            // crosses an LOD band boundary do we load the new band's tiles
            // (loadMapTiles detects the change and clears the old band first).
            if (this.svgTileManager.bandForZoom(newZoom) !== this._loadedBand) {
                this.loadMapTiles();
            }
            // Update accessibility when zoom changes
            if (this.accessibilityManager) {
                this.accessibilityManager.updateTabOrder();
            }
            // Update avatar position
            if (this.avatar) {
                this.avatar.refresh();
            }
            return newZoom;
        };
    }
    
    boundsHaveChanged(bounds1, bounds2) {
        if (!bounds1 || !bounds2) return true;
        
        const threshold = 0.0001; // Small threshold for floating point comparison
        return Math.abs(bounds1.north - bounds2.north) > threshold ||
               Math.abs(bounds1.south - bounds2.south) > threshold ||
               Math.abs(bounds1.east - bounds2.east) > threshold ||
               Math.abs(bounds1.west - bounds2.west) > threshold;
    }
    
    checkIfNeedNewTiles() {
        // Check if the current bounds extend beyond what we've loaded
        const bounds = this.getBoundsFromView();
        const tilesGroup = document.querySelector('#map-tiles');
        
        if (!tilesGroup || tilesGroup.children.length === 0) {
            return true; // No tiles loaded yet
        }
        
        // Get the bounds of currently loaded tiles
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        
        tilesGroup.querySelectorAll('[data-tile-id]').forEach(tile => {
            const tileId = tile.getAttribute('data-tile-id');
            const [lat, lng] = tileId.split('_').map(parseFloat);
            
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat + 0.01); // 0.01 degree per tile
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng + 0.01);
        });
        
        // Check if current view bounds extend beyond loaded tiles
        return bounds.north > maxLat || bounds.south < minLat ||
               bounds.east > maxLng || bounds.west < minLng;
    }
    
    isFeatureInViewport(feature, containerRect) {
        const featureRect = feature.getBoundingClientRect();
        
        // Calculate the intersection rectangle
        const intersectionLeft = Math.max(featureRect.left, containerRect.left);
        const intersectionRight = Math.min(featureRect.right, containerRect.right);
        const intersectionTop = Math.max(featureRect.top, containerRect.top);
        const intersectionBottom = Math.min(featureRect.bottom, containerRect.bottom);
        
        // Check if there's an intersection
        if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) {
            return false;
        }
        
        // Calculate visible dimensions
        const visibleWidth = intersectionRight - intersectionLeft;
        const visibleHeight = intersectionBottom - intersectionTop;
        
        // WCAG 2.2 AAA requires minimum 44x44 CSS pixels for interactive targets
        // We'll require at least 44x44 pixels visible OR 50% of the feature visible
        // (for features smaller than 44x44)
        const minTargetSize = 44;
        
        // For small features, check if at least 50% is visible
        if (featureRect.width < minTargetSize || featureRect.height < minTargetSize) {
            const featureArea = featureRect.width * featureRect.height;
            const visibleArea = visibleWidth * visibleHeight;
            return visibleArea >= featureArea * 0.5;
        }
        
        // For larger features, ensure at least 44x44 pixels are visible
        return visibleWidth >= minTargetSize && visibleHeight >= minTargetSize;
    }
    
    generateFeatureLabel(feature) {
        // Try to get label from existing attributes
        const existingLabel = feature.getAttribute('aria-label');
        if (existingLabel) return existingLabel;
        
        // Generate based on parent layer
        const parentId = feature.parentElement?.id || '';
        const featureType = feature.tagName.toLowerCase();
        
        if (parentId.includes('buildings')) {
            return 'Building';
        } else if (parentId.includes('roads')) {
            return 'Road segment';
        } else if (parentId.includes('transit')) {
            return featureType === 'circle' ? 'Transit stop' : 'Transit route';
        } else if (parentId.includes('accessibility')) {
            return 'Accessible facility';
        }
        
        return 'Map feature';
    }
    
    handleInitialPosition() {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const pos = urlParams.get('pos');
        
        // Define preset positions
        const positions = {
            'toronto': { lat: 43.655, lng: -79.375, zoom: 17 },
            'downtown-toronto': { lat: 43.651, lng: -79.382, zoom: 17 },
            'cn-tower': { lat: 43.6426, lng: -79.3871, zoom: 18 },
            'uoft': { lat: 43.6629, lng: -79.3957, zoom: 17 }, // University of Toronto
            'yorkdale': { lat: 43.7254, lng: -79.4521, zoom: 17 }, // Yorkdale Mall
            'pearson': { lat: 43.6777, lng: -79.6248, zoom: 16 } // Toronto Pearson Airport
        };
        
        // Check if position is specified and valid
        if (pos && positions[pos.toLowerCase()]) {
            const location = positions[pos.toLowerCase()];
            
            // Set the map center and zoom
            this.mapRenderer.center = { lat: location.lat, lng: location.lng };
            if (location.zoom) {
                this.mapRenderer.zoom = location.zoom;
            }
            
            console.log(`Starting at ${pos}: ${location.lat}, ${location.lng}`);
        } else if (pos) {
            // Try to parse as lat,lng coordinates
            const coords = pos.split(',');
            if (coords.length === 2) {
                const lat = parseFloat(coords[0]);
                const lng = parseFloat(coords[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    this.mapRenderer.center = { lat, lng };
                    console.log(`Starting at custom coordinates: ${lat}, ${lng}`);
                }
            } else {
                console.warn(`Unknown position: ${pos}`);
            }
        }
        
        // Also check for individual lat/lng/zoom parameters
        const lat = urlParams.get('lat');
        const lng = urlParams.get('lng');
        const zoom = urlParams.get('zoom');
        
        if (lat && lng) {
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            if (!isNaN(latNum) && !isNaN(lngNum)) {
                this.mapRenderer.center = { lat: latNum, lng: lngNum };
                console.log(`Starting at coordinates: ${latNum}, ${lngNum}`);
            }
        }
        
        if (zoom) {
            const zoomNum = parseInt(zoom);
            if (!isNaN(zoomNum) && zoomNum >= 10 && zoomNum <= 20) {
                this.mapRenderer.zoom = zoomNum;
            }
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mapApp = new MapApplication();
});