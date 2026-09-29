import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-900.css';
import '@fontsource/bebas-neue/latin-400.css';

/** Register once per mounted application; never reload an ongoing battle. */
export function registerShipApp(): () => void {
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'App';
  button.setAttribute('aria-label', 'Kestrel installation and offline status');
  button.setAttribute('aria-haspopup', 'dialog');
  button.style.cssText = 'position:fixed;right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));z-index:120;min-width:44px;min-height:44px;padding:6px 12px;font:700 18px "Barlow Condensed",sans-serif;color:#f3e8c8;background:#101d27;border:2px solid #b96f45;box-shadow:3px 3px 0 #0008;';

  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'kestrel-app-title');
  dialog.style.cssText = 'box-sizing:border-box;width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow:auto;padding:24px;color:#f3e8c8;background:#101d27;border:3px solid #b96f45;box-shadow:8px 8px 0 #0008;font:500 20px/1.4 "Barlow Condensed",sans-serif;';
  const title = document.createElement('h2');
  title.id = 'kestrel-app-title';
  title.textContent = 'Kestrel aboard';
  title.style.cssText = 'margin:0 0 16px;font:400 34px "Bebas Neue",sans-serif;letter-spacing:1px;';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const guidance = document.createElement('p');
  guidance.textContent = 'On iPad: open this page in Safari, choose Share → Add to Home Screen, then enable Open as Web App if offered. On other devices, use your browser’s Install app menu. Landscape is recommended; portrait also works.';
  const safety = document.createElement('p');
  safety.textContent = 'Finish your battle before closing: battles are not saved. Updates never reload a battle. A downloaded update takes over after every Kestrel window is closed and you launch again. Your browser may remove offline files when device storage is low.';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Back to bridge';
  close.style.cssText = 'min-height:44px;padding:8px 16px;font:700 20px "Barlow Condensed",sans-serif;';
  dialog.append(title, status, guidance, safety, close);
  document.body.append(button, dialog);
  button.addEventListener('click', () => dialog.showModal(), options);
  close.addEventListener('click', () => dialog.close(), options);
  // Keep the game's E/I/Escape shortcuts out of this native modal. Native
  // Escape cancellation and focus restoration continue to work normally.
  dialog.addEventListener('keydown', event => event.stopPropagation(), options);
  dialog.addEventListener('keyup', event => event.stopPropagation(), options);

  const setStatus = (message: string, attention = false) => {
    if (lifetime.signal.aborted) return;
    status.textContent = message;
    button.textContent = attention ? 'App !' : 'App';
    button.setAttribute('aria-label', `Kestrel app: ${message}`);
    button.title = message;
  };
  const observe = (registration: ServiceWorkerRegistration) => {
    if (lifetime.signal.aborted) return;
    const report = (worker?: ServiceWorker) => {
      // Worker state events can precede the registration's slot update.
      if (registration.waiting || (worker?.state === 'installed' && registration.active)) {
        setStatus('Update downloaded. Finish your battle, close all Kestrel windows and launch again to use it. This version remains available offline.');
      } else if (registration.active || worker?.state === 'activated') {
        setStatus('Ready offline. You can launch Kestrel without a connection after this first successful download.');
      }
    };
    const watchInstalling = () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant') setStatus('Offline download failed. Stay online to play; after finishing your battle, check your connection and reopen Kestrel to try again.', true);
        else report(worker);
      }, options);
    };
    registration.addEventListener('updatefound', watchInstalling, options);
    watchInstalling();
    report();
  };

  if (!import.meta.env.PROD) {
    setStatus('Development preview: installation and offline caching are enabled only in the production build.');
  } else if (!window.isSecureContext) {
    setStatus('Open Kestrel over HTTPS to enable installation and offline play. The current connection is not secure.', true);
  } else if (!('serviceWorker' in navigator)) {
    setStatus('This browser cannot prepare offline play. Use an up-to-date Safari on iPad, with website storage allowed.', true);
  } else {
    setStatus('Preparing offline files. Stay online until this panel says Ready offline.');
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    }).then(observe, () => setStatus('Offline setup failed. Keep this page online to play. After finishing your battle, check your connection, allow website storage and reopen Kestrel to try again.', true));
  }

  return () => {
    lifetime.abort();
    dialog.close();
    dialog.remove();
    button.remove();
    // The installed service worker and its app-only cache intentionally outlive
    // the mounted UI. Never unregister workers or clear unrelated world data.
  };
}
