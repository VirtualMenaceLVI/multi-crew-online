/**
 * main.js
 * Application entry point.
 * Initializes the router, UI utilities, and kicks off the app.
 */

// ── Router ────────────────────────────────────────────────────────────────────

const Router = (() => {
  const screens = {
    'home':            'screen-home',
    'station-select':  'screen-station-select',
    'station':         'screen-station',
    'sector-map':      'screen-sector-map'
  };

  let _current = null;

  function navigate(screenName) {
    // Hide all screens
    Object.values(screens).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    const targetId = screens[screenName];
    if (!targetId) {
      console.error('[Router] Unknown screen:', screenName);
      return;
    }

    const target = document.getElementById(targetId);
    if (target) {
      target.classList.add('active');
      _current = screenName;
      onNavigate(screenName);
    }
  }

  function getCurrent() { return _current; }

  function onNavigate(screenName) {
    switch (screenName) {
      case 'station-select':
        StationUI.initStationSelector();
        break;
      case 'sector-map':
        _initSectorMap();
        break;
    }
  }

  function _initSectorMap() {
    MapRenderer.renderSectorMap('sector-grid-container');

    MapRenderer.onSectorClick = (sector) => {
      UI.showToast(`Sector ${sector.id}: ${sector.name}`, 'info');
    };

    const backBtn = document.getElementById('btn-sector-map-back');
    if (backBtn) {
      // Remove previous listener by cloning
      const newBtn = backBtn.cloneNode(true);
      backBtn.parentNode.replaceChild(newBtn, backBtn);
      newBtn.addEventListener('click', () => {
        Router.navigate('station');
      });
    }
  }

  return { navigate, getCurrent };
})();

// ── UI Utilities ──────────────────────────────────────────────────────────────

const UI = (() => {
  const TOAST_DURATION = 4000;

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, TOAST_DURATION);
  }

  function prompt(message, defaultValue = '') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const title   = document.getElementById('modal-title');
      const input   = document.getElementById('modal-input');
      const confirm = document.getElementById('modal-confirm');
      const cancel  = document.getElementById('modal-cancel');

      if (!overlay) {
        // Fallback
        const val = window.prompt(message, defaultValue);
        resolve(val);
        return;
      }

      title.textContent = message;
      input.value = defaultValue;
      overlay.classList.remove('hidden');
      input.focus();

      const cleanup = () => { overlay.classList.add('hidden'); };

      confirm.onclick = () => { cleanup(); resolve(input.value.trim() || null); };
      cancel.onclick  = () => { cleanup(); resolve(null); };
      input.onkeydown = (e) => {
        if (e.key === 'Enter')  { cleanup(); resolve(input.value.trim() || null); }
        if (e.key === 'Escape') { cleanup(); resolve(null); }
      };
    });
  }

  return { showToast, prompt };
})();

// ── App Init ──────────────────────────────────────────────────────────────────

async function initApp() {
  Auth.init();

  // Try to restore session from storage
  const restored = await Auth.tryRestoreSession();

  if (restored) {
    GameState.setPlayer(Auth.getPlayer());
    Router.navigate('station-select');
  } else {
    Router.navigate('home');
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
