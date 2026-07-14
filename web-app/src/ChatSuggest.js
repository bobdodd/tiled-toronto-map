/* Place suggestions on the CHAT input — the typed half of search-in-chat.
 *
 * The chat input is an APG EDITABLE COMBOBOX with list autocomplete; the
 * popup is an APG LISTBOX. DOM focus never leaves the input: the visually
 * active option rides aria-activedescendant, ArrowDown/Up traverse (wrapping),
 * Enter commits the active option, Escape closes the popup (and is stopped
 * there, so the chat's document-level "shush" only sees Escape when no popup
 * is open). Options are real pointer targets; mousedown is prevented so a
 * click never blurs the input first.
 *
 * The combobox is an OFFER, never a gate: Enter with no active option submits
 * the text to the chat exactly as if this module didn't exist — the same
 * input still carries everything the knowledge map can answer. Arrowing into
 * the list is the only way an option becomes active, so a question can never
 * be hijacked into a search. Picking a suggestion IS the confirmation: it
 * recentres the map and lands focus on the feature (the accordion's old
 * behaviour, via the same onSelect).
 *
 * Dictation: the voice pipeline streams the interim transcript into this same
 * input (Chat.js dispatches real 'input' events for it), so suggestions
 * update live while speaking — VISUALLY ONLY. Nothing here announces: no
 * result-count live region, no spoken option churn. A screen-reader user
 * hears options via aria-activedescendant when THEY arrow down; the spoken
 * channel's version of disambiguation is the conversation itself.
 *
 * Suggestions appear from 4 characters (Bob: ">3"), debounced, against the
 * same same-origin /api/map-search the accordion used (`?api=<origin>`
 * repoints it for local testing, mirroring `?tiles=`).
 */

const DEFAULT_API = '/api/map-search';
const API_URL = (() => {
    if (typeof window === 'undefined') return DEFAULT_API;
    const override = new URLSearchParams(window.location.search).get('api');
    if (!override) return DEFAULT_API;
    const base = override.endsWith('/') ? override.slice(0, -1) : override;
    return base + DEFAULT_API;
})();

const MIN_CHARS = 4;
const MAX_CHARS = 80;   // place names aren't sentences — a long text is a
                        // question (or a stray echo transcript), never a query
const DEBOUNCE_MS = 250;
const MAX_SHOWN = 8;

// Human phrases for the access values surfaced on a suggestion. Only positive
// values become badges (wheelchair=no is not advertised as accessible).
const A11Y_BADGES = {
    wheelchair: 'Wheelchair accessible',
    'toilets:wheelchair': 'Accessible toilet',
    tactile_paving: 'Tactile paving',
    ramp: 'Ramp',
    handrail: 'Handrail',
    automatic_door: 'Automatic door',
    braille: 'Braille',
    hearing_loop: 'Hearing loop',
    induction_loop: 'Hearing loop',
    audio_loop: 'Hearing loop',
};
const NEGATIVE = new Set(['no', 'none', 'false', '0']);

// Short context line: category + address + containing place — the parent is
// what tells three "Running track" hits apart.
function detailLine(r) {
    const bits = [];
    const cat = r.subtype || r.category;
    if (cat) bits.push(cat.replace(/_/g, ' '));
    if (r.address) {
        const a = [r.address.housenumber, r.address.street].filter(Boolean).join(' ');
        if (a) bits.push(a);
    }
    if (r.parent && r.parent !== r.display) bits.push(`in ${r.parent}`);
    // Street positioning (present only when nothing else positions the
    // feature — arrives with the on_street rebuild).
    if (!r.address && !r.parent && r.on_street) bits.push(`on ${r.on_street}`);
    return bits.join(' · ');
}

function a11yBadges(access) {
    if (!access) return [];
    const seen = new Set();
    const out = [];
    for (const [tag, val] of Object.entries(access)) {
        const phrase = A11Y_BADGES[tag];
        if (!phrase || NEGATIVE.has(String(val).toLowerCase()) || seen.has(phrase)) continue;
        seen.add(phrase);
        out.push(phrase);
    }
    return out;
}

export function setupChatSuggest({ getCenter, onSelect }) {
    const input = document.getElementById('chat-input');
    const list = document.getElementById('chat-suggest');
    if (!input || !list) return;

    let items = [];
    let active = -1;        // index behind aria-activedescendant, -1 = none
    let debounceTimer = null;
    let controller = null;  // in-flight fetch, abortable

    const isOpen = () => !list.hidden;
    const optionId = (i) => `chat-suggest-opt-${i}`;

    function close() {
        clearTimeout(debounceTimer);
        if (controller) { controller.abort(); controller = null; }
        items = [];
        active = -1;
        list.hidden = true;
        list.textContent = '';
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }

    function setActive(i) {
        if (active >= 0) {
            const prev = document.getElementById(optionId(active));
            if (prev) { prev.setAttribute('aria-selected', 'false'); prev.classList.remove('is-active'); }
        }
        active = i;
        if (i < 0) { input.removeAttribute('aria-activedescendant'); return; }
        const el = document.getElementById(optionId(i));
        if (!el) return;
        el.setAttribute('aria-selected', 'true');
        el.classList.add('is-active');
        el.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', optionId(i));
    }

    function choose(i) {
        const r = items[i];
        if (!r) return;
        input.value = '';
        close();
        onSelect(r);
    }

    function render() {
        list.textContent = '';
        items.forEach((r, i) => {
            const li = document.createElement('li');
            li.id = optionId(i);
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');
            li.className = 'chat-suggest__opt';

            const name = document.createElement('span');
            name.className = 'chat-suggest__name';
            name.textContent = r.display || '(unnamed)';
            li.appendChild(name);

            const detail = detailLine(r);
            if (detail) {
                const d = document.createElement('span');
                d.className = 'chat-suggest__detail';
                d.textContent = detail;
                li.appendChild(d);
            }
            a11yBadges(r.access).forEach((text) => {
                const b = document.createElement('span');
                b.className = 'chat-suggest__a11y';
                b.textContent = text;
                li.appendChild(b);
            });

            // Keep DOM focus in the input across a pointer pick.
            li.addEventListener('mousedown', (e) => e.preventDefault());
            li.addEventListener('click', () => choose(i));
            list.appendChild(li);
        });
        active = -1;
        input.removeAttribute('aria-activedescendant');
        list.hidden = items.length === 0;
        input.setAttribute('aria-expanded', String(items.length > 0));
    }

    async function query(q) {
        const params = new URLSearchParams({ q });
        const c = getCenter && getCenter();
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
            params.set('lat', String(c.lat));
            params.set('lng', String(c.lng));
        }
        if (controller) controller.abort();
        controller = new AbortController();
        let data;
        try {
            const res = await fetch(`${API_URL}?${params.toString()}`, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
        } catch (err) {
            if (err.name !== 'AbortError') close();   // silent: the offer just withdraws
            return;
        }
        items = (data.results || []).slice(0, MAX_SHOWN);
        render();
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < MIN_CHARS || q.length > MAX_CHARS) { close(); return; }
        debounceTimer = setTimeout(() => query(q), DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && isOpen()) {
            e.preventDefault();
            setActive((active + 1) % items.length);
        } else if (e.key === 'ArrowUp' && isOpen()) {
            e.preventDefault();
            setActive((active - 1 + items.length) % items.length);
        } else if (e.key === 'Enter' && isOpen() && active >= 0) {
            // Commit the picked place; without an active option Enter falls
            // through to the form and the text goes to the chat, untouched.
            e.preventDefault();
            e.stopPropagation();
            choose(active);
        } else if (e.key === 'Escape' && isOpen()) {
            e.preventDefault();
            e.stopPropagation();   // shield the chat's document-level shush
            close();
        }
    });

    // The offer withdraws when focus leaves, when a message is sent (typed
    // form submit, or any spoken/typed send — Chat.js announces those with a
    // 'chat-send' event on the input), and when the text falls under 4 chars.
    input.addEventListener('blur', close);
    input.addEventListener('chat-send', close);
    const form = document.getElementById('chat-form');
    if (form) form.addEventListener('submit', close);
}
