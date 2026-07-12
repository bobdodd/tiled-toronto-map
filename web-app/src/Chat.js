/* Chat — the Knowledge Map's conversation, on the visual map.
 *
 * The user asks (typed OR spoken) about where they are or anywhere on the map;
 * we POST to /api/knowledge-chat (the LLM tool loop: map tools + place
 * knowledge + transit + personal memory) and read the answer back through the
 * map's Announcer (spoken when audio is on, the polite live region otherwise).
 * Voice input streams directly to Deepgram over a WebSocket using a 30-second
 * token minted server-side, with diarisation + voice-locking so a noisy street
 * doesn't hijack the conversation. Adapted from the Knowledge Map's client —
 * the behaviour is deliberately the same; only the housing differs (the chat
 * PANEL over the map — see ChatPanel.js — and the map app's own Announcer,
 * HeadingProvider and follow-me instead of private ones).
 *
 * The housing split: the SPEAK button lives in the menu, first stop — voice
 * needs no panel at all. The panel holds the typed input and the transcript,
 * and on desktop it can be CLOSED, so nothing aria-live lives inside it:
 * state notes ("Listening…", "Thinking…") go to the visible #chat-status line
 * AND out through the app's existing live region via announcer.status().
 *
 * DELIBERATELY NOT YET: answers do not move or highlight anything on the
 * visual map. This is the conversation only; driving the viewport comes later.
 *
 * Consent: covered by the PAGE gate — the whole map sits behind the notice
 * (accepted before the map is seen at all, like every map in this family),
 * and that notice discloses what the chat sends off-device. The chat's own
 * location/compass/speech initialisation happens lazily, on the first real
 * user gesture at the chat — a Speak tap or focusing the input — which is
 * what the permission prompts and the iOS speech engine need.
 */

const CHAT_API = '/api/knowledge-chat';
const TOKEN_API = '/api/context-stt-token';
const MAX_HISTORY = 12;   // text turns kept client-side and sent for context
// Backstop on a chat request: the server bounds itself (~60s worst case), so
// past this the CONNECTION is the problem — say so, don't spin forever.
const CHAT_TIMEOUT_MS = 75000;
const LISTEN_IDLE_MS = 10000; // silence after an answer before the conversation winds down

// Personal memory — "remember where I am", "remember that bus" — lives HERE on
// the user's device and rides along with each question so the model can answer
// from it; the server hands back the updated store and keeps nothing. Own key,
// separate from the Knowledge Map demo's store (same origin, different demo).
const MEM_KEY = 'tiled-map-memory-v1';

export function setupChat({ announcer, heading, onFollow, onUnfollow }) {
    const $ = (id) => document.getElementById(id);
    const panel = $('chat-panel');
    if (!panel) return;

    const form = $('chat-form');
    const input = $('chat-input');
    const send = $('chat-send');
    const speakBtn = $('chat-speak');
    const log = $('chat-log');
    const status = $('chat-status');

    let started = false;   // first chat gesture done (location/compass/speech primed)
    let memory = [];
    try { const m = JSON.parse(localStorage.getItem(MEM_KEY) || '[]'); if (Array.isArray(m)) memory = m; } catch { /* fresh */ }
    const saveMemory = (items) => {
        memory = items;
        try { localStorage.setItem(MEM_KEY, JSON.stringify(items)); } catch { /* session-only then */ }
    };

    const history = [];
    let lastUserInput = '';
    let pending = null;     // AbortController for the in-flight answer (shush cancels it)

    // ── First gesture at the chat — a Speak tap or focusing the input. Either
    //    is the real user gesture the location prompt, the iOS compass, and
    //    the speech engine all need. (Terms were already accepted at the page
    //    gate; no welcome speech — the Speak path is about to open the mic,
    //    and the typed path has its visible label and hint.) ──
    function startOnce() {
        if (started) return;
        started = true;
        requestLocation();
        if (heading && heading.start) heading.start().catch(() => {});
        announcer.prime();
    }
    if (input) input.addEventListener('focus', startOnce);

    // The status line is VISIBLE ONLY (the panel can be closed on desktop, so
    // no live region lives in it) — every note also goes out through the app's
    // existing live region. Same text, both places, latest wins.
    function setStatus(note) {
        status.textContent = note || '';
        announcer.status(note || '');
    }

    // Focus the input only when it is actually on screen — on desktop the
    // panel may be switched off while the voice conversation carries on.
    function focusInput() {
        if (!panel.hidden && input.getClientRects().length) input.focus();
    }

    // ── Location: chat keeps its own fix, independent of the map's Track
    //    Location toggle — a fresh read per question, so walking registers. ──
    let location_ = null;
    function requestLocation() {
        if (!('geolocation' in navigator)) return;
        navigator.geolocation.getCurrentPosition(onPos, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    function onPos(p) {
        location_ = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) };
    }
    function freshLocation() {
        return new Promise((resolve) => {
            if (!('geolocation' in navigator)) return resolve(location_);
            navigator.geolocation.getCurrentPosition(
                (p) => { onPos(p); resolve(location_); },
                () => resolve(location_),
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 },
            );
        });
    }

    // ── Transcript. NOT a live region: it never double-announces and stays
    //    navigable for re-reading; answers are announced via the Announcer. ──
    function addMessage(role, text) {
        const wrap = document.createElement('div');
        wrap.className = `chat-msg chat-msg--${role === 'user' ? 'user' : 'bot'}`;
        const who = document.createElement('span');
        who.className = 'screen-reader-only';
        who.textContent = role === 'user' ? 'You: ' : 'Map: ';
        const p = document.createElement('p');
        p.className = 'chat-msg__text';
        p.textContent = text;
        wrap.append(who, p);
        log.append(wrap);
        wrap.scrollIntoView({ block: 'nearest' });
    }

    // ── Busy cue: a soft periodic click while "thinking" — a screen-reader user
    //    otherwise hears one "Thinking…" then silence. Non-speech, so it never
    //    fights the screen reader or the answer. ──
    let busyCtx = null, busyTimer = null;
    function softClick() {
        try {
            if (!busyCtx) busyCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (busyCtx.state === 'suspended') busyCtx.resume();
            const t = busyCtx.currentTime;
            const o = busyCtx.createOscillator(), g = busyCtx.createGain();
            o.type = 'sine'; o.frequency.value = 1000;
            o.connect(g); g.connect(busyCtx.destination);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.05, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
            o.start(t); o.stop(t + 0.04);
        } catch { /* no audio — the status text still shows */ }
    }
    function startBusyTone() { stopBusyTone(); softClick(); busyTimer = window.setInterval(softClick, 2500); }
    function stopBusyTone() { if (busyTimer) { window.clearInterval(busyTimer); busyTimer = null; } }
    function setBusy(busy, note) {
        send.disabled = busy;
        input.disabled = busy;
        if (speakBtn) speakBtn.disabled = busy;
        setStatus(note);
        if (busy) startBusyTone(); else stopBusyTone();
    }

    // ── Ask ──
    async function ask(message) {
        addMessage('user', message);
        history.push({ role: 'user', content: message });
        setBusy(true, 'Thinking…');
        const ctrl = new AbortController();
        pending = ctrl;
        const chatTimer = window.setTimeout(() => { ctrl.timedOut = true; ctrl.abort(); }, CHAT_TIMEOUT_MS);
        const loc = await freshLocation();
        if (loc && heading && heading.getHeading) {
            const h = heading.getHeading();
            if (h != null) loc.heading = Math.round(h);   // facing → clock directions
        }

        try {
            const res = await fetch(CHAT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, location: loc || undefined, history: history.slice(-MAX_HISTORY - 1, -1), memory }),
                signal: ctrl.signal,
            });
            const data = await res.json().catch(() => ({}));
            if (ctrl.signal.aborted) return;   // shushed while finishing — quietCommand handled it
            if (Array.isArray(data.memory)) saveMemory(data.memory);
            if (!res.ok || data.error) {
                const msg = data.error || `Something went wrong (${res.status}).`;
                setBusy(false, msg);
                if (convo) { convo = false; clearIdle(); setConvoButton(false); }
                announcer.announce(msg); focusInput(); return;
            }
            const reply = (data.reply || '').trim() || "I'm not sure how to answer that.";
            addMessage('bot', reply);
            history.push({ role: 'assistant', content: reply });
            if (history.length > MAX_HISTORY * 2) history.splice(0, history.length - MAX_HISTORY * 2);
            setBusy(false, '');
            announcer.announce(reply, onAnswerSpoken);  // hands-free: re-open the mic when done
            focusInput();
        } catch (e) {
            if (e && e.name === 'AbortError' && !ctrl.timedOut) return;  // mid-flight shush
            const msg = ctrl.timedOut
                ? 'That took too long to answer. Please ask me again.'
                : "I couldn't reach the assistant. Check your connection and try again.";
            setBusy(false, msg);
            if (convo) { convo = false; clearIdle(); setConvoButton(false); }
            announcer.announce(msg); focusInput();
        } finally {
            window.clearTimeout(chatTimer);
            if (pending === ctrl) pending = null;
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message || send.disabled) return;
        input.value = '';
        handleInput(message);
    });

    // ── Commands intercepted before anything is sent ──
    const QUIET = new Set(['shush', 'hush', 'quiet', 'be quiet', 'silence', 'silent', 'pause', 'mute', 'stop', 'stop talking', 'shut up', 'enough', 'thats enough']);
    const normCmd = (s) => s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const isQuiet = (n) => QUIET.has(n.replace(/^please\s+/, '').replace(/\s+please$/, '').trim());
    const isRepeat = (n) => /^(what did i( just)? (say|ask)|what was my( last)? (question|message)|repeat (that|my (question|message|last))|say that again)$/.test(n);
    const isFollow = (n) => /^(follow me|start following|follow)$/.test(n);
    const isUnfollow = (n) => /^(stop following( me)?|unfollow|stop follow)$/.test(n);

    function handleInput(message) {
        const n = normCmd(message);
        if (isQuiet(n)) { quietCommand(); return; }
        if (isRepeat(n)) { repeatCommand(); return; }
        // "Follow me" is the MAP's follow mode (the settings toggle) — the
        // spoken command drives the same switch, one behaviour, one state.
        if (isFollow(n)) { if (onFollow) onFollow(); return; }
        if (isUnfollow(n)) { if (onUnfollow) onUnfollow(); return; }
        lastUserInput = message;
        ask(message);
    }

    // "Shush": stop what the map is saying and hand the turn back, staying in
    // the hands-free loop. An in-flight question is cancelled AND acknowledged
    // ("Aborted.") — cancelled silence would leave the user waiting.
    function quietCommand() {
        convo = true;
        if (pending) {
            pending.abort(); pending = null;
            setBusy(false, '');
            announcer.announce('Aborted.', onAnswerSpoken);
            return;
        }
        announcer.stop();
        stopBusyTone();
        if (recording) armIdle();
        else startListen();
    }

    function repeatCommand() {
        const line = lastUserInput ? `You said: ${lastUserInput}` : "You haven't asked me anything yet.";
        // Right after the mic closes the OS audio session is still ducked —
        // let it settle or the line comes out quiet.
        window.setTimeout(() => announcer.announce(line, convo ? onAnswerSpoken : undefined), 500);
    }

    // ── Voice input: streaming to Deepgram, hands-free conversation.
    //    Tap Speak once; it sends when you pause (utterance-end detection, which
    //    works in noise); the answer is read back; the mic re-opens — only after
    //    the answer FINISHES, so it never hears its own voice. Audio streams
    //    directly to Deepgram on a 30s server-minted token: the key never
    //    reaches the browser, no audio passes through our server. ──
    let recording = false, micStream = null, dgSocket = null, sttCtx = null, sttNode = null, sttSource = null;
    let lockedSpeaker = null, finalWords = [];
    const speakerCounts = new Map();
    let convo = false;
    let idleTimer = null;
    let opening = false;

    function beep(freq) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
            g.gain.setValueAtTime(0.12, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            o.start(); o.stop(ctx.currentTime + 0.18);
            setTimeout(() => ctx.close().catch(() => {}), 250);
        } catch { /* status text still cues */ }
    }

    const lockedTranscript = () =>
        finalWords.filter((x) => x.sp === lockedSpeaker).map((x) => x.w).join(' ')
            .replace(/\s+([.,!?;:])/g, '$1').trim();
    // Short utterances ("shush", "follow me") never reach the 3-word lock —
    // fall back to every recognised word.
    const rawTranscript = () =>
        finalWords.map((x) => x.w).join(' ').replace(/\s+([.,!?;:])/g, '$1').trim();

    // Voice-locking: the first speaker to reach 3 words is the phone-holder;
    // keep only their words, drop diarised background chatter.
    function ingestWords(words) {
        for (const w of words) {
            const text = w.punctuated_word || w.word || '';
            if (!text) continue;
            const sp = (typeof w.speaker === 'number') ? w.speaker : 0;
            finalWords.push({ w: text, sp });
            if (lockedSpeaker === null) {
                const c = (speakerCounts.get(sp) || 0) + 1;
                speakerCounts.set(sp, c);
                if (c >= 3) lockedSpeaker = sp;
            }
        }
    }

    function setConvoButton(on) {
        // The menu button is icon + label spans; only the label flips.
        const label = speakBtn.querySelector('.label');
        if (label) label.textContent = on ? 'Stop' : 'Speak';
        else speakBtn.textContent = on ? 'Stop' : 'Speak';
        speakBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    // The listen window is an IDLE timer: it re-arms on every scrap of
    // recognised speech, so it only fires after real silence.
    function armIdle() {
        clearIdle();
        idleTimer = window.setTimeout(() => { closeMic(); endConvo('Finished listening. Tap Speak to talk again.'); }, LISTEN_IDLE_MS);
    }
    function clearIdle() { if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; } }

    async function toggleRecord() {
        if (convo) { endConvo('Conversation ended. Tap Speak to start again.'); return; }
        startOnce();   // a Speak tap may be the chat's very first gesture
        convo = true;
        setConvoButton(true);
        await startListen();
    }

    function closeMic() { clearIdle(); recording = false; cleanupStream(); }

    function endConvo(message) {
        convo = false;
        clearIdle();
        recording = false;
        cleanupStream();
        announcer.stop();
        setConvoButton(false);
        beep(440);
        if (message) setStatus(message);
    }

    function handleUtterance(t) { input.value = t; handleInput(t); }

    function onAnswerSpoken() { if (convo && !recording) startListen(); }

    function bailListen(msg) {
        opening = false;
        // Visible line only — announcer.announce below carries the message on
        // whichever live channel is active; a status() write too would race it.
        status.textContent = msg;
        announcer.announce(msg);
        if (convo) { convo = false; setConvoButton(false); }
    }

    async function startListen() {
        if (recording || opening) return;
        opening = true;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioWorkletNode) {
            bailListen("Voice input isn't available on this device — please type your question."); return;
        }
        let token;
        try {
            const [tk, stream] = await Promise.all([
                fetch(TOKEN_API, { method: 'POST' }).then((r) => r.json().catch(() => ({}))),
                navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }),
            ]);
            micStream = stream;
            if (!tk || !tk.token) throw new Error((tk && tk.error) || 'no speech token');
            token = tk.token;
        } catch (e) {
            if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
            const name = (e && e.name) || '';
            const msg = name === 'NotAllowedError'
                ? 'Microphone blocked for this site. Allow the microphone for a11ybob.com (the prompt, or the site permissions behind the address-bar icon — not the phone’s app settings), then tap Speak again.'
                : name === 'NotFoundError'
                ? 'No microphone was found on this device — please type your question.'
                : `Couldn't start speech input (${(e && e.message) || name || 'error'}). You can type your question instead.`;
            bailListen(msg); return;
        }

        try {
            sttCtx = new (window.AudioContext || window.webkitAudioContext)();
            await sttCtx.audioWorklet.addModule('src/pcm-worklet.js');
            sttSource = sttCtx.createMediaStreamSource(micStream);
            sttNode = new AudioWorkletNode(sttCtx, 'pcm-worklet');
            sttSource.connect(sttNode);
            sttNode.port.onmessage = (e) => { if (dgSocket && dgSocket.readyState === WebSocket.OPEN) dgSocket.send(e.data); };
        } catch {
            cleanupStream();
            bailListen("Couldn't start audio capture — please type your question."); return;
        }

        const params = new URLSearchParams({
            model: 'nova-3', encoding: 'linear16', sample_rate: String(Math.round(sttCtx.sampleRate)), channels: '1',
            diarize: 'true', interim_results: 'true', utterance_end_ms: '1000', endpointing: '300',
            smart_format: 'true', punctuate: 'true', vad_events: 'true',
        });
        lockedSpeaker = null; finalWords = []; speakerCounts.clear();
        openDeepgram(`wss://api.deepgram.com/v1/listen?${params.toString()}`, token);

        recording = true;
        opening = false;
        setStatus('Listening… ask your question, or reply. It sends when you pause; tap Stop to end.');
        beep(880);
        armIdle();
    }

    // The token rides the Sec-WebSocket-Protocol header (browsers can't set
    // Authorization on a WS): a JWT under 'bearer', an API key under 'token' —
    // try bearer, fall back once if the socket is rejected before opening.
    function openDeepgram(url, token, scheme = 'bearer', tried = false) {
        let opened = false;
        const ws = new WebSocket(url, [scheme, token]);
        dgSocket = ws;
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => { opened = true; };
        ws.onmessage = (e) => {
            let msg; try { msg = JSON.parse(e.data); } catch { return; }
            if (msg.type === 'UtteranceEnd') {
                const t = lockedTranscript() || rawTranscript();
                if (recording && t) { closeMic(); handleUtterance(t); }
                return;
            }
            const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
            if (!alt) return;
            if (msg.is_final && alt.words && alt.words.length) ingestWords(alt.words);
            // Live transcript into the INPUT only — never the status live region,
            // which would announce every word.
            const interim = (!msg.is_final && alt.transcript) ? alt.transcript : '';
            const shown = [lockedTranscript(), interim].filter(Boolean).join(' ').trim();
            // Re-arm only while still recording: a message can arrive just after
            // closeMic() and would otherwise re-arm the idle timer into the answer.
            if (recording && shown) { input.value = shown; armIdle(); }
        };
        ws.onclose = () => {
            if (!opened && !tried) { openDeepgram(url, token, scheme === 'bearer' ? 'token' : 'bearer', true); return; }
            if (recording) {
                const t = lockedTranscript() || rawTranscript();
                closeMic();
                if (t) handleUtterance(t);
                else if (convo) endConvo('Speech connection dropped — tap Speak to try again, or type your question.');
            }
        };
        ws.onerror = () => { /* surfaced via onclose */ };
    }

    function cleanupStream() {
        try { if (sttNode) sttNode.port.onmessage = null; } catch { /* */ }
        try { if (sttSource) sttSource.disconnect(); } catch { /* */ }
        try { if (sttNode) sttNode.disconnect(); } catch { /* */ }
        try { if (sttCtx) sttCtx.close(); } catch { /* */ }
        try { if (micStream) micStream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
        try {
            if (dgSocket) {
                if (dgSocket.readyState === WebSocket.OPEN) { try { dgSocket.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* */ } }
                dgSocket.close();
            }
        } catch { /* */ }
        sttNode = sttSource = sttCtx = micStream = dgSocket = null;
    }

    speakBtn.addEventListener('click', toggleRecord);

    // "Shush" shortcuts: Escape, or a click on any non-control part of the page,
    // while the chat is talking, thinking, or listening. Gated on acceptance and
    // on activity, so it never swallows the map's own Escape uses (the tooltip's
    // Escape handler still runs — hiding a tooltip alongside a shush is fine).
    function shushActive() {
        return started && (announcer.speaking || (convo && recording) || pending != null);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && shushActive()) quietCommand();
    });
    document.addEventListener('click', (e) => {
        if (!shushActive()) return;
        if (e.target.closest("button, a, input, textarea, select, label, summary, [role='button']")) return;
        if (window.getSelection && String(window.getSelection())) return;
        quietCommand();
    });
}
