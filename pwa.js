(function () {
    const DISMISS_KEY = 'pwa-install-dismissed';

    function getBasePath() {
        let path = window.location.pathname;
        if (path.endsWith('/index.html')) path = path.slice(0, -10) + '/';
        else if (!path.endsWith('/')) {
            const slash = path.lastIndexOf('/');
            path = slash >= 0 ? path.slice(0, slash + 1) : '/';
        }
        return path;
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    function isIos() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const base = getBasePath();
        navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
    }

    function dismissBanner() {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
        document.getElementById('pwa-install')?.remove();
    }

    function showBanner({ title, text, actionLabel, onAction }) {
        if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;
        if (document.getElementById('pwa-install')) return;

        const el = document.createElement('aside');
        el.id = 'pwa-install';
        el.className = 'pwa-install';
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', 'Installa la guida come app');

        el.innerHTML = `
            <div class="pwa-install__body">
                <p class="pwa-install__title">${title}</p>
                <p class="pwa-install__text">${text}</p>
            </div>
            <div class="pwa-install__actions">
                ${actionLabel ? `<button type="button" class="pwa-install__btn pwa-install__btn--primary">${actionLabel}</button>` : ''}
                <button type="button" class="pwa-install__btn pwa-install__btn--ghost" data-pwa-dismiss>Chiudi</button>
            </div>
        `;

        el.querySelector('[data-pwa-dismiss]')?.addEventListener('click', dismissBanner);
        const primary = el.querySelector('.pwa-install__btn--primary');
        if (primary && onAction) primary.addEventListener('click', onAction);

        document.body.appendChild(el);
    }

    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showBanner({
            title: 'Aggiungi alla schermata Home',
            text: 'Installa la guida Malaga come app per aprirla a schermo intero, come un\'app nativa.',
            actionLabel: 'Installa',
            onAction: async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                dismissBanner();
            }
        });
    });

    if (isIos() && !isStandalone()) {
        window.addEventListener('DOMContentLoaded', () => {
            showBanner({
                title: 'Aggiungi alla schermata Home',
                text: 'Su iPhone o iPad: tocca Condividi, poi «Aggiungi a Home». L\'icona ☀️ aprirà la guida a schermo intero.',
                actionLabel: null,
                onAction: null
            });
        });
    }

    window.addEventListener('DOMContentLoaded', registerServiceWorker);
})();
