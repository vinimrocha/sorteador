/* Progressive Web App (PWA) - Service Worker e Instalação */

export var deferredInstallPrompt = null;

export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').catch(function(err) {
            console.warn('SW não registrado:', err);
        });
    });
}

export function isIosDevice() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function initInstallPrompt() {
    if (isStandalone()) return;
    try {
        if (localStorage.getItem('installDismissed') === '1') return;
    } catch (e) {}

    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        showInstallBanner('Instale o aplicativo', 'Instalar');
    });

    window.addEventListener('appinstalled', function() {
        deferredInstallPrompt = null;
        hideInstallBanner();
    });

    // iOS não emite beforeinstallprompt: instrução manual após 2s
    if (isIosDevice()) {
        setTimeout(function() {
            if (isStandalone() || deferredInstallPrompt) return;
            showInstallBanner('Toque em Compartilhar e "Adicionar à Tela de Início"', 'OK');
        }, 2000);
    }
}

export function showInstallBanner(hint, btnLabel) {
    var banner = document.getElementById('installBanner');
    var hintEl = document.getElementById('installHint');
    var btn = document.getElementById('btnInstall');
    if (!banner) return;
    if (hintEl) hintEl.textContent = hint;
    if (btn) btn.textContent = btnLabel;
    banner.style.display = 'flex';
}

export function hideInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
}

export function doInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function() {
            deferredInstallPrompt = null;
            hideInstallBanner();
        }).catch(function() {
            hideInstallBanner();
        });
        return;
    }
    dismissInstall();
}

export function dismissInstall() {
    try {
        localStorage.setItem('installDismissed', '1');
    } catch (e) {}
    hideInstallBanner();
}
