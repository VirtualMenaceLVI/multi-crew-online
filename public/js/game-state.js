/**
 * game-state.js
 * Client-side game state manager.
 * Polls the server and keeps local state in sync.
 */

const GameState = (() => {
  const POLL_INTERVAL_MS = 1000; // Poll every 1 second in dev mode

  let _state = {
    player: null,
    currentShip: null,
    currentStation: null,
    ships: [],
    sectors: [],
    currentSector: null,
    shipsInSector: []
  };

  let _pollTimer = null;
  let _listeners = {};

  // ── Event System ─────────────────────────────────────────────────────────

  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
  }

  function off(event, callback) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(cb => cb !== callback);
  }

  function emit(event, data) {
    (_listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('[GameState] Listener error:', e); }
    });
  }

  // ── State Accessors ───────────────────────────────────────────────────────

  function getPlayer() { return _state.player; }
  function getCurrentShip() { return _state.currentShip; }
  function getCurrentStation() { return _state.currentStation; }
  function getShips() { return _state.ships; }
  function getSectors() { return _state.sectors; }
  function getCurrentSector() { return _state.currentSector; }
  function getShipsInSector() { return _state.shipsInSector; }

  function setPlayer(player) {
    _state.player = player;
    emit('playerUpdated', player);
  }

  function setCurrentShip(ship, stationRole) {
    _state.currentShip = ship;
    _state.currentStation = stationRole || null;
    emit('shipChanged', { ship, stationRole });
  }

  // ── Initial Load ──────────────────────────────────────────────────────────

  async function loadInitialData() {
    try {
      const [shipsData, sectorsData] = await Promise.all([
        ApiClient.getShips(),
        ApiClient.getSectors()
      ]);
      _state.ships = shipsData.ships || [];
      _state.sectors = sectorsData.sectors || [];
      emit('shipsUpdated', _state.ships);
      emit('sectorsLoaded', _state.sectors);
    } catch (err) {
      console.error('[GameState] Initial load failed:', err.message);
    }
  }

  async function loadSector(sectorId) {
    try {
      const [sectorData, shipsData] = await Promise.all([
        ApiClient.getSector(sectorId),
        ApiClient.getShipsInSector(sectorId)
      ]);
      _state.currentSector = sectorData.sector;
      _state.shipsInSector = shipsData.ships || [];
      emit('sectorLoaded', _state.currentSector);
      emit('shipsInSectorUpdated', _state.shipsInSector);
    } catch (err) {
      console.error('[GameState] Sector load failed:', err.message);
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  async function poll() {
    if (!_state.currentShip) return;
    try {
      const prevSector = _state.currentShip.sector;

      // Advance physics via server tick when the ship is moving
      let shipData;
      if (_state.currentShip.speed > 0 && _state.currentShip.status !== 'docked') {
        shipData = await ApiClient.tickShip(_state.currentShip.id, POLL_INTERVAL_MS / 1000);
      } else {
        shipData = await ApiClient.getShip(_state.currentShip.id);
      }

      _state.currentShip = shipData.ship;
      emit('shipUpdated', _state.currentShip);

      // Reload sector data when the ship crosses a sector boundary
      if (_state.currentShip.sector !== prevSector) {
        await loadSector(_state.currentShip.sector);
        emit('sectorChanged', _state.currentShip.sector);
      }

      // Refresh other ships visible in the sector
      if (_state.currentSector) {
        const shipsData = await ApiClient.getShipsInSector(_state.currentSector.id);
        _state.shipsInSector = shipsData.ships || [];
        emit('shipsInSectorUpdated', _state.shipsInSector);
      }
    } catch (err) {
      console.error('[GameState] Poll error:', err.message);
    }
  }

  // ── Helm Actions ──────────────────────────────────────────────────────────

  async function setHeading(heading) {
    if (!_state.currentShip) return;
    const rad = (heading * Math.PI) / 180;
    const spd = _state.currentShip.speed || 0;
    const velocity = {
      x: parseFloat((Math.sin(rad) * spd).toFixed(4)),
      y: parseFloat((-Math.cos(rad) * spd).toFixed(4))
    };
    try {
      const data = await ApiClient.updateShip(_state.currentShip.id, { heading, velocity });
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
    } catch (err) {
      UI.showToast('Failed to update heading: ' + err.message, 'danger');
    }
  }

  async function setSpeed(speed) {
    if (!_state.currentShip) return;
    const heading = _state.currentShip.heading || 0;
    const rad = (heading * Math.PI) / 180;
    const velocity = {
      x: parseFloat((Math.sin(rad) * speed).toFixed(4)),
      y: parseFloat((-Math.cos(rad) * speed).toFixed(4))
    };
    try {
      const data = await ApiClient.updateShip(_state.currentShip.id, { speed, velocity });
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
    } catch (err) {
      UI.showToast('Failed to update speed: ' + err.message, 'danger');
    }
  }

  async function warpToSector(sectorId) {
    if (!_state.currentShip) return;
    try {
      const data = await ApiClient.warpShip(_state.currentShip.id, sectorId);
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
      await loadSector(sectorId);
      emit('sectorChanged', sectorId);
    } catch (err) {
      UI.showToast('Warp failed: ' + err.message, 'danger');
      throw err;
    }
  }

  async function dockShip() {
    if (!_state.currentShip) return;
    try {
      const data = await ApiClient.dockShip(_state.currentShip.id);
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
      return data;
    } catch (err) {
      UI.showToast('Docking failed: ' + err.message, 'danger');
      throw err;
    }
  }

  async function undockShip() {
    if (!_state.currentShip) return;
    try {
      const data = await ApiClient.updateShip(_state.currentShip.id, { status: 'in-transit' });
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
    } catch (err) {
      UI.showToast('Undock failed: ' + err.message, 'danger');
    }
  }

  // ── Engineering Actions ───────────────────────────────────────────────────

  async function setPower(powerConfig) {
    if (!_state.currentShip) return;
    try {
      const data = await ApiClient.updateShip(_state.currentShip.id, { power: powerConfig });
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
    } catch (err) {
      UI.showToast('Power management failed: ' + err.message, 'danger');
    }
  }

  // ── Tactical Actions ──────────────────────────────────────────────────────

  async function toggleShields(active) {
    if (!_state.currentShip) return;
    const shields = { ..._state.currentShip.shields, active };
    try {
      const data = await ApiClient.updateShip(_state.currentShip.id, { shields });
      _state.currentShip = data.ship;
      emit('shipUpdated', _state.currentShip);
    } catch (err) {
      UI.showToast('Shield control failed: ' + err.message, 'danger');
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function reset() {
    stopPolling();
    _state = {
      player: null,
      currentShip: null,
      currentStation: null,
      ships: [],
      sectors: [],
      currentSector: null,
      shipsInSector: []
    };
    _listeners = {};
  }

  return {
    on, off,
    getPlayer, setPlayer,
    getCurrentShip, setCurrentShip, getCurrentStation,
    getShips, getSectors, getCurrentSector, getShipsInSector,
    loadInitialData, loadSector,
    startPolling, stopPolling, poll,
    setHeading, setSpeed, warpToSector, dockShip, undockShip,
    setPower, toggleShields,
    reset
  };
})();
