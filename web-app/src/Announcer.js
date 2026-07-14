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
// Every announcement is also mirrored to the visible CHAT TRANSCRIPT (the
// caption callback → announcement-styled entries) for Deaf/deafened and
// sighted users — whatever the channel. Chat replies opt out (caption:false):
// they are already their own transcript messages.
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
     *  live-region write that hasn't landed yet.
     *
     *  opts.caption=false skips the visible mirror — for text that is ALREADY
     *  its own entry in the visible transcript (the chat's replies), which
     *  would otherwise appear twice.
     *
     *  `onDone` (optional) fires when the announcement has FINISHED — the chat's
     *  hands-free loop re-opens the microphone on it, so it must never fire
     *  mid-sentence and must always fire eventually. The end-detection is the
     *  audio maps' hardened pattern: `onend` is unreliable and a length estimate
     *  is outrun by long answers, so gate on the engine's real speaking state —
     *  it must have been seen speaking, then stop. (An interruption by a newer
     *  announcement satisfies that too, which is right: the turn is over.)
     *  On the live-region channel there is no signal at all — estimate from the
     *  text length, best effort. */
    announce(text, onDone, { caption = true } = {}) {
        if (!text) { if (onDone) onDone(); return; }
        if (caption && this.caption) this.caption(text);

        let done = false;
        const finish = onDone ? () => { if (!done) { done = true; onDone(); } } : null;

        if (this.audioOn && this.synth && this.speechOk) {
            this._noteSpoken(text);
            this.synth.cancel();
            const u = new SpeechSynthesisUtterance(text);
            if (finish) {
                let sawSpeaking = false, waited = 0;
                const poll = window.setInterval(() => {
                    waited += 250;
                    if (done) { window.clearInterval(poll); return; }
                    if (this.synth.speaking) sawSpeaking = true;
                    const finished = sawSpeaking && !this.synth.speaking; // real end (or interrupted)
                    const engineDead = !sawSpeaking && waited >= 6000;    // never started — don't wedge the caller
                    const runaway = waited >= 180000;                     // stuck speaking=true (rare engine bug)
                    if (finished || engineDead || runaway) { window.clearInterval(poll); finish(); }
                }, 250);
                u.onend = () => { if (sawSpeaking) finish(); };
                u.onerror = finish;
            }
            this.synth.speak(u);
            return;
        }

        this._toRegion(text);
        // No end signal from a screen reader — estimate the read time.
        if (finish) window.setTimeout(finish, Math.min(12000, 900 + text.length * 55));
    }

    /** State notes for the screen reader ONLY — the chat's "Listening…" /
     *  "Thinking…" line. The chat panel can be closed (desktop) so no live
     *  region may live inside it: the note goes out through THIS region
     *  instead, whatever the audio setting. Never spoken aloud — the beeps
     *  and the busy tone are the audible channel, and speech here would leak
     *  into the open microphone. Not captioned — the panel's visible status
     *  line is the sighted twin. */
    status(text) {
        this._toRegion(text || '');
    }

    _toRegion(text) {
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

    /** Stop any current speech immediately (the chat's "shush"). */
    stop() {
        if (this.synth) { try { this.synth.cancel(); } catch { /* engine quirk */ } }
    }

    // ── Self-echo detection. The chat's mic runs WITHOUT echo cancellation
    //    (AEC is what ducked the answers — see Chat.js), so the map can hear
    //    its own voice through the speakers. We know every word it spoke:
    //    keep the recent utterances and let the chat test a transcript
    //    against them before treating it as the human. ──
    _normSpeech(s) {
        return String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    }

    _noteSpoken(text) {
        if (!this._recentSpoken) this._recentSpoken = [];
        this._recentSpoken.push({ norm: this._normSpeech(text), at: Date.now() });
        if (this._recentSpoken.length > 6) this._recentSpoken.shift();
    }

    /** Is this transcript (very likely) the map's own recent speech?
     *  Matches a verbatim fragment of a recent utterance, or ≥80% of the
     *  transcript's words appearing in one — but NEVER a 1–2 word transcript:
     *  "yes" / "stop" must always reach the conversation, even if the map
     *  happened to say those words. The window is generous (45 s) because a
     *  long answer's TAIL is heard long after the announce() call. */
    echoOf(text, windowMs = 45000) {
        if (!this._recentSpoken || !this._recentSpoken.length) return false;
        const norm = this._normSpeech(text);
        if (!norm) return false;
        const words = norm.split(' ');
        if (words.length < 3) return false;
        const now = Date.now();
        return this._recentSpoken.some((u) => {
            if (now - u.at > windowMs) return false;
            if (u.norm.includes(norm)) return true;   // verbatim fragment of the announcement
            const hay = new Set(u.norm.split(' '));
            const hit = words.filter((w) => hay.has(w)).length;
            return hit / words.length >= 0.8;
        });
    }
}
