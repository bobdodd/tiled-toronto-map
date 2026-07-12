// Speech-first announcements — the pattern from the audio-only maps (Context /
// Conversational / Knowledge), brought to the visual map.
//
// WHY: a polite aria-live region QUEUES. Sweep a finger across a dense map and
// the announcements back up — the screen reader is still reading a feature you
// left three streets ago. The Web Speech API can be CANCELLED, so every new
// announcement replaces the stale one: latest wins, always fresh under the
// finger.
//
// The channel picks itself:
//   speech engine present AND audio ON  -> speechSynthesis, cancel-then-speak
//   audio OFF, or no engine (de-Googled phones) -> the polite live region
// The audio toggle is a real button (persisted); with audio off a screen-reader
// user keeps the familiar live-region behaviour and no double-voice.
//
// Every announcement is also mirrored to the visible captions panel (the
// caption callback) for Deaf/deafened and sighted users — whatever the channel.
export class Announcer {
    constructor({ regionId = 'map-announcements', caption = null } = {}) {
        this.regionId = regionId;
        this.caption = caption;
        this.synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
        this.speechOk = false;
        this._regionTimer = null;
        this._primed = false;

        // A speech engine with no voices can't speak (seen on de-Googled
        // phones): probe, and re-probe when voices arrive asynchronously.
        const decide = () => { if (this.synth) this.speechOk = this.synth.getVoices().length > 0; };
        if (this.synth) {
            decide();
            if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', decide);
        }

        // Audio preference survives reloads. Default ON — speech is the primary
        // channel; the button turns it off for screen-reader-only listening.
        this.audioOn = localStorage.getItem('map-speech-on') !== 'off';

        // iOS unlocks the speech engine only inside a user gesture — prime on
        // the first one, whatever it is.
        const prime = () => this.prime();
        document.addEventListener('pointerdown', prime, { once: true, capture: true });
        document.addEventListener('keydown', prime, { once: true, capture: true });
    }

    prime() {
        if (this._primed || !this.synth) return;
        this._primed = true;
        try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            this.synth.speak(u);
        } catch { /* engine refused — the live-region path still works */ }
    }

    get speaking() {
        return !!(this.synth && this.synth.speaking);
    }

    setAudio(on) {
        this.audioOn = !!on;
        localStorage.setItem('map-speech-on', on ? 'on' : 'off');
        // Never leave half a sentence playing after the switch.
        if (!on && this.synth) this.synth.cancel();
    }

    /** Announce text on the current channel. Latest wins on BOTH channels: a
     *  new announcement cancels queued speech, and replaces a pending
     *  live-region write that hasn't landed yet. */
    announce(text) {
        if (!text) return;
        if (this.caption) this.caption(text);

        if (this.audioOn && this.synth && this.speechOk) {
            this.synth.cancel();
            this.synth.speak(new SpeechSynthesisUtterance(text));
            return;
        }

        const region = document.getElementById(this.regionId);
        if (!region) return;
        // Clear-then-set (async) so an identical consecutive message still
        // re-announces. The pending write is cancelled if a newer one arrives
        // first — the region gets the LATEST text, never a stale backlog.
        if (this._regionTimer) window.clearTimeout(this._regionTimer);
        region.textContent = '';
        this._regionTimer = window.setTimeout(() => {
            this._regionTimer = null;
            region.textContent = text;
        }, 60);
    }
}
