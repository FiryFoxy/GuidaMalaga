/**
 * Vocabolario: filtri lingua e pronuncia (solo audio registrato).
 */
(function () {
    let audioManifest = null;
    let basePath = '';
    let currentAudio = null;

    function slugify(text) {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'phrase';
    }

    function phraseParts(raw) {
        if (!raw) return [];
        let t = raw.replace(/\s+/g, ' ').trim();
        if (t === '—' || t === '-') return [];
        return t.split('/').map(part => {
            let p = part.trim();
            const paren = p.indexOf('(');
            if (paren > 0) p = p.slice(0, paren).trim();
            return p.replace(/…/g, '').replace(/[!?.]+$/g, '').trim();
        }).filter(Boolean);
    }

    function speakOverride(el) {
        return el?.getAttribute?.('data-speak-text')?.trim() || '';
    }

    function phraseKey(lang, text) {
        return `${lang}/${slugify(text)}`;
    }

    function hasClip(lang, text) {
        if (!audioManifest?.clips || !text) return false;
        return !!audioManifest.clips[phraseKey(lang, text)];
    }

    /** Sceglie la variante con audio registrato (es. "Thanks / Thank you" → "Thank you"). */
    function resolveSpeakPhrase(raw, lang, override) {
        const overrideText = (override || '').trim();
        if (overrideText && hasClip(lang, overrideText)) return overrideText;
        for (const part of phraseParts(raw)) {
            if (hasClip(lang, part)) return part;
        }
        return overrideText || phraseParts(raw)[0] || '';
    }

    async function loadAudioManifest(path) {
        try {
            const res = await fetch(`${path}data/vocabulary-audio.json`, { cache: 'no-store' });
            if (res.ok) audioManifest = await res.json();
        } catch (_) {
            audioManifest = null;
        }
    }

    function clipUrl(lang, text) {
        if (!audioManifest?.clips || !text) return null;
        const rel = audioManifest.clips[phraseKey(lang, text)];
        return rel ? `${basePath}${rel}` : null;
    }

    function clearActiveBtn(activeBtn) {
        document.querySelectorAll('.vocab-speak-btn--active').forEach(b => b.classList.remove('vocab-speak-btn--active'));
        activeBtn?.classList.add('vocab-speak-btn--active');
    }

    function stopPlayback() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
    }

    function playClip(url, activeBtn) {
        stopPlayback();
        clearActiveBtn(activeBtn);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => {
            activeBtn?.classList.remove('vocab-speak-btn--active');
            currentAudio = null;
        };
        audio.onerror = () => {
            currentAudio = null;
            activeBtn?.classList.remove('vocab-speak-btn--active');
            window.App?.showToast?.('Audio non caricato');
        };
        audio.play().catch(() => {
            window.App?.showToast?.('Avvia l\'audio con un tap (volume attivo)');
        });
    }

    function speakPhrase(text, lang, activeBtn, explicitText, rawForResolve) {
        const phrase = resolveSpeakPhrase(rawForResolve || text, lang, explicitText || '');
        if (!phrase) return;

        stopPlayback();
        const url = clipUrl(lang, phrase);
        if (url) {
            playClip(url, activeBtn);
            return;
        }
        activeBtn?.classList.remove('vocab-speak-btn--active');
        window.App?.showToast?.('Audio registrato non disponibile per questa frase');
    }

    function createSpeakButton(displayText, lang, label, speakPhraseText, rawText) {
        const phrase = resolveSpeakPhrase(rawText || displayText, lang, speakPhraseText);
        if (!phrase) return null;
        const hasHd = hasClip(lang, phrase);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vocab-speak-btn' + (hasHd ? ' vocab-speak-btn--hd' : '');
        btn.dataset.speak = phrase;
        btn.dataset.lang = lang;
        if (rawText) btn.dataset.speakRaw = rawText;
        if (speakPhraseText) btn.dataset.speakText = speakPhraseText;
        btn.setAttribute('aria-label', label + (hasHd ? ' (audio registrato)' : ''));
        btn.title = hasHd ? 'Ascolta pronuncia registrata' : 'Audio non disponibile';
        btn.disabled = !hasHd;
        if (!hasHd) btn.classList.add('vocab-speak-btn--missing');
        btn.innerHTML = '<span class="vocab-speak-icon" aria-hidden="true"></span>';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!hasClip(lang, phrase)) {
                window.App?.showToast?.('Audio registrato non disponibile');
                return;
            }
            speakPhrase(displayText, lang, btn, speakPhraseText, rawText || displayText);
        });
        return btn;
    }

    function wrapCellWithSpeak(td, lang) {
        if (td.querySelector('.vocab-term-row')) return;
        const raw = td.textContent.trim();
        const speakOverrideText = speakOverride(td);
        const phrase = resolveSpeakPhrase(raw, lang, speakOverrideText);
        if (!phrase) return;
        const wrap = document.createElement('span');
        wrap.className = 'vocab-term-row';
        const term = document.createElement('span');
        term.className = 'vocab-term-text';
        term.textContent = raw;
        wrap.appendChild(term);
        const btn = createSpeakButton(
            raw,
            lang,
            lang === 'es' ? `Ascolta in spagnolo: ${phrase}` : `Ascolta in inglese: ${phrase}`,
            speakOverrideText || phrase,
            raw
        );
        if (btn) wrap.appendChild(btn);
        td.textContent = '';
        td.appendChild(wrap);
    }

    function injectTableSpeakButtons(root) {
        root.querySelectorAll('.vocab-table tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;
            wrapCellWithSpeak(cells[1], 'en');
            wrapCellWithSpeak(cells[2], 'es');
        });
    }

    function injectCardSpeakButtons(root) {
        root.querySelectorAll('.vocab-card').forEach(card => {
            const termEl = card.querySelector('.vocab-card-term');
            if (!termEl || card.querySelector('.vocab-card-head')) return;
            const langs = (card.dataset.lang || 'en').split(/\s+/);
            const lang = langs.includes('es') && !langs.includes('en') ? 'es' : 'en';
            const text = termEl.textContent.trim();
            const speakOverrideText = speakOverride(card);
            const head = document.createElement('div');
            head.className = 'vocab-card-head';
            termEl.remove();
            const term = document.createElement('p');
            term.className = 'vocab-card-term';
            term.textContent = text;
            head.appendChild(term);
            const phrase = resolveSpeakPhrase(text, lang, speakOverrideText);
            const btn = createSpeakButton(
                text,
                lang,
                `Ascolta: ${phrase}`,
                speakOverrideText || phrase,
                text
            );
            if (btn) head.appendChild(btn);
            card.insertBefore(head, card.firstChild);
        });
    }

    function initFilter(root) {
        const tabs = root.querySelectorAll('.vocab-lang-tab[data-vocab-filter]');
        if (!tabs.length) return;

        const apply = (filter) => {
            tabs.forEach(t => {
                const active = t.dataset.vocabFilter === filter;
                t.classList.toggle('active', active);
                t.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            root.querySelectorAll('.vocab-block').forEach(block => {
                const cats = (block.dataset.vocabCats || '').split(/\s+/);
                block.classList.toggle('vocab-block--hidden', filter !== 'all' && !cats.includes(filter));
            });
            root.querySelectorAll('[data-lang]').forEach(row => {
                const langs = (row.dataset.lang || '').split(/\s+/);
                row.classList.toggle('vocab-row--hidden', filter !== 'all' && !langs.includes(filter));
            });
        };

        tabs.forEach(tab => { tab.onclick = () => apply(tab.dataset.vocabFilter); });
        apply('all');
    }

    async function init(sectionEl, options = {}) {
        if (!sectionEl) return;
        basePath = options.basePath || '';
        await loadAudioManifest(basePath);
        initFilter(sectionEl);
        injectTableSpeakButtons(sectionEl);
        injectCardSpeakButtons(sectionEl);

        const badge = sectionEl.querySelector('[data-vocab-audio-badge]');
        if (badge) {
            badge.textContent = audioManifest
                ? 'Audio registrato con accento madrelingua (inglese e spagnolo)'
                : 'Manifest audio non caricato';
        }
    }

    window.VocabUI = { init, speakPhrase, resolveSpeakPhrase, phraseKey };
})();
