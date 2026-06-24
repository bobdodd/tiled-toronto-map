// Device compass (magnetometer) heading — which way the user is facing — so the
// map can describe features by CLOCK-FACE direction (12 o'clock = the way you're
// pointing) instead of cardinal compass points. Falls back silently: if there's
// no magnetometer, or permission is refused, getHeading() returns null and callers
// use cardinal directions instead.
//
// Cross-device reality this hides:
//  - iOS exposes `event.webkitCompassHeading` (0 = North, clockwise, already a
//    true compass bearing) but requires DeviceOrientationEvent.requestPermission()
//    from a USER GESTURE (we call start() from the Track Location tap).
//  - Android/Chromium fire `deviceorientationabsolute` with `alpha` measured
//    counter-clockwise from East-ish; the compass heading is (360 - alpha).
//  - The reading is noisy, so we low-pass it in sin/cos space (handles the 360->0
//    wrap) before exposing a heading.
//
// Caveat left for later: this is the DEVICE's heading (where the phone's top
// points), taken as the user's facing direction. Held normally that's true; held
// flat it's whatever the top edge points at.
export class HeadingProvider {
    constructor() {
        this.heading = null;     // smoothed 0-360, 0 = North, clockwise; null = none
        this.available = false;
        this.started = false;
        this._accurate = true;   // gated down by iOS webkitCompassAccuracy when poor
        this._sin = null;
        this._cos = null;
        this._handler = (e) => this._onOrientation(e);
        this._eventName = null;
    }

    isSupported() {
        return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    }

    // Must be called from a user-gesture handler (for the iOS permission prompt).
    // Returns true if a heading source was attached. Idempotent.
    async start() {
        if (this.started) return this.available;
        if (!this.isSupported()) return false;
        const DOE = window.DeviceOrientationEvent;
        if (typeof DOE.requestPermission === 'function') {
            // iOS 13+: needs explicit permission. requestPermission() is invoked
            // synchronously here so it stays inside the triggering user gesture.
            try {
                const res = await DOE.requestPermission();
                if (res !== 'granted') return false;
            } catch (_) {
                return false;
            }
        }
        // Prefer the ABSOLUTE event (real compass) where it exists (Android/Chromium);
        // iOS has no absolute event but carries webkitCompassHeading on the plain one.
        this._eventName = ('ondeviceorientationabsolute' in window)
            ? 'deviceorientationabsolute' : 'deviceorientation';
        window.addEventListener(this._eventName, this._handler);
        this.started = true;
        return true;
    }

    stop() {
        if (this._eventName) window.removeEventListener(this._eventName, this._handler);
        this.started = false;
        this.available = false;
        this.heading = null;
        this._sin = this._cos = null;
    }

    // Screen-rotation angle so "ahead" tracks the SCREEN's up edge, not the device's
    // natural top: in landscape the magnetometer's top-of-device heading and the
    // forward the user perceives differ by exactly this. Modern path is
    // screen.orientation.angle; window.orientation is the legacy iOS fallback
    // (-90 -> 270 etc).
    _screenAngle() {
        const so = window.screen && window.screen.orientation;
        if (so && typeof so.angle === 'number') return so.angle;
        if (typeof window.orientation === 'number') return ((window.orientation % 360) + 360) % 360;
        return 0;
    }

    _onOrientation(e) {
        // Calibration gate: iOS reports heading accuracy in degrees; negative means
        // invalid/uncalibrated, large means coarse. When it's poor we stop trusting
        // the compass and let callers fall back to cardinal (which comes from GPS
        // bearing, not the magnetometer, so it stays correct). Android gives no
        // accuracy, so we assume it's usable.
        if (typeof e.webkitCompassAccuracy === 'number') {
            this._accurate = e.webkitCompassAccuracy >= 0 && e.webkitCompassAccuracy <= 30;
        }
        let h = null;
        if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
            h = e.webkitCompassHeading;             // iOS: true compass heading
        } else if (typeof e.alpha === 'number' && e.alpha !== null) {
            h = (360 - e.alpha) % 360;              // Android absolute: 360 - alpha
        }
        if (h === null || isNaN(h)) return;
        // Compensate for screen rotation (portrait vs landscape) BEFORE smoothing,
        // so the smoothed value lives in the screen-forward frame.
        h = (h + this._screenAngle()) % 360;
        // Low-pass in sin/cos space so the 360->0 wrap doesn't average to garbage.
        const a = h * Math.PI / 180;
        const s = Math.sin(a), c = Math.cos(a);
        if (this._sin === null) { this._sin = s; this._cos = c; }
        else { this._sin = this._sin * 0.8 + s * 0.2; this._cos = this._cos * 0.8 + c * 0.2; }
        this.heading = (Math.atan2(this._sin, this._cos) * 180 / Math.PI + 360) % 360;
        this.available = true;
    }

    // Smoothed compass heading in degrees (0 = North, clockwise), or null if the
    // device has no magnetometer / permission was refused / no reading yet / the
    // reading is currently too inaccurate to trust.
    getHeading() {
        return (this.available && this._accurate) ? this.heading : null;
    }
}
