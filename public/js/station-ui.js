/**
 * station-ui.js
 * Multi-station UI framework.
 * Manages station selector and individual station views.
 */

const StationUI = (() => {
  const STATIONS = [
    {
      id: 'helm',
      name: 'Helm',
      icon: '🎮',
      desc: 'Navigation, speed, and course control.'
    },
    {
      id: 'tactical',
      name: 'Tactical',
      icon: '🎯',
      desc: 'Weapons, shields, and threat assessment.'
    },
    {
      id: 'captain',
      name: 'Captain',
      icon: '⭐',
      desc: 'Command overview, status, and orders.'
    },
    {
      id: 'engineering',
      name: 'Engineering',
      icon: '⚙️',
      desc: 'Power management, repairs, and systems.'
    },
    {
      id: 'first-officer',
      name: 'First Officer',
      icon: '📋',
      desc: 'Mission log, crew roster, and operations.'
    },
    {
      id: 'comms',
      name: 'Comms',
      icon: '📡',
      desc: 'Hailing, crew chat, and communications.'
    }
  ];

  let _activeStation = null;
  let _commsPolling = false;

  // ── Station Selector ──────────────────────────────────────────────────────

  async function initStationSelector() {
    await GameState.loadInitialData();
    _renderShipList();
    _renderStationCards();

    document.getElementById('btn-create-ship').addEventListener('click', _showCreateShipModal);
    document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());
  }

  function _renderShipList() {
    const ships = GameState.getShips();
    const listEl = document.getElementById('ship-list');
    listEl.innerHTML = '';

    if (ships.length === 0) {
      listEl.innerHTML = '<p class="text-dim text-sm">No ships available. Create one below.</p>';
      return;
    }

    for (const ship of ships) {
      const card = document.createElement('div');
      card.className = 'ship-card' + (GameState.getCurrentShip() && GameState.getCurrentShip().id === ship.id ? ' selected' : '');
      card.dataset.shipId = ship.id;
      card.innerHTML = `
        <div class="ship-card-name">${_esc(ship.name)}</div>
        <div class="ship-card-class">${_esc(ship.class)}</div>
        <div class="ship-card-sector">Sector: ${_esc(ship.sector)}</div>
        <div class="ship-card-crew">Crew: ${ship.crew.length}/${ship.crewCapacity}</div>
      `;
      card.addEventListener('click', () => _selectShip(ship));
      listEl.appendChild(card);
    }
  }

  function _selectShip(ship) {
    document.querySelectorAll('.ship-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.ship-card[data-ship-id="${ship.id}"]`)?.classList.add('selected');
    GameState.setCurrentShip(ship, null);

    const subtitle = document.getElementById('station-select-ship-name');
    if (subtitle) subtitle.textContent = `Ship: ${ship.name} • Class: ${ship.class} • Sector: ${ship.sector}`;
  }

  function _renderStationCards() {
    const grid = document.getElementById('stations-grid');
    grid.innerHTML = '';
    for (const station of STATIONS) {
      const card = document.createElement('div');
      card.className = 'station-card';
      card.dataset.stationId = station.id;
      card.innerHTML = `
        <div class="station-icon">${station.icon}</div>
        <div class="station-name">${station.name}</div>
        <div class="station-desc">${station.desc}</div>
      `;
      card.addEventListener('click', () => _onStationSelect(station));
      grid.appendChild(card);
    }
  }

  async function _onStationSelect(station) {
    const ship = GameState.getCurrentShip();
    if (!ship) {
      UI.showToast('Please select a ship first.', 'warn');
      return;
    }

    try {
      const data = await ApiClient.joinShip(ship.id, station.id);
      GameState.setCurrentShip(data.ship, station.id);
      _activeStation = station.id;
      Router.navigate('station');
      await _initStationView(station.id, data.ship);
    } catch (err) {
      UI.showToast('Could not join station: ' + err.message, 'danger');
    }
  }

  async function _showCreateShipModal() {
    const name = await UI.prompt('Enter ship name:', 'New Ship');
    if (!name) return;
    try {
      const data = await ApiClient.createShip(name, 'Explorer', 'A1');
      UI.showToast(`Ship "${data.ship.name}" created!`, 'success');
      await GameState.loadInitialData();
      _renderShipList();
      _selectShip(data.ship);
    } catch (err) {
      UI.showToast('Create ship failed: ' + err.message, 'danger');
    }
  }

  // ── Station View ──────────────────────────────────────────────────────────

  async function _initStationView(stationId, ship) {
    // Update nav bar
    document.getElementById('station-badge').textContent = stationId.toUpperCase().replace(/-/g, ' ');
    document.getElementById('station-ship-name').textContent = ship.name;
    document.getElementById('station-sector-label').textContent = `Sector ${ship.sector}`;

    // Render the appropriate station content
    const contentEl = document.getElementById('station-content');
    contentEl.innerHTML = '';

    switch (stationId) {
      case 'helm':          _buildHelm(contentEl, ship);        break;
      case 'tactical':      _buildTactical(contentEl, ship);    break;
      case 'captain':       _buildCaptain(contentEl, ship);     break;
      case 'engineering':   _buildEngineering(contentEl, ship); break;
      case 'first-officer': _buildFirstOfficer(contentEl, ship); break;
      case 'comms':         await _buildComms(contentEl, ship); break;
      default:
        contentEl.innerHTML = `<div class="center-area" style="align-items:center;justify-content:center"><p class="text-dim">Station "${stationId}" coming soon.</p></div>`;
    }

    // Start polling and map rendering
    GameState.startPolling();
    GameState.on('shipUpdated', _onShipUpdated);

    await GameState.loadSector(ship.sector);

    // Initialize viewscreen if present
    if (document.getElementById('viewscreen-canvas')) {
      _initViewscreen();
    }

    // Nav bar buttons
    document.getElementById('btn-change-station').addEventListener('click', _returnToStationSelect);
    document.getElementById('btn-sector-map').addEventListener('click', () => Router.navigate('sector-map'));
  }

  function _onShipUpdated(ship) {
    // Update nav bar sector
    const sectorLabel = document.getElementById('station-sector-label');
    if (sectorLabel) sectorLabel.textContent = `Sector ${ship.sector}`;

    // Update station-specific UI
    if (_activeStation === 'helm')        _updateHelmUI(ship);
    if (_activeStation === 'tactical')    _updateTacticalUI(ship);
    if (_activeStation === 'engineering') _updateEngineeringUI(ship);
    if (_activeStation === 'captain')     _updateCaptainUI(ship);
  }

  // ── HELM ──────────────────────────────────────────────────────────────────

  function _buildHelm(container, ship) {
    container.innerHTML = `
      <div class="side-panel">
        <div class="panel">
          <div class="panel-title">Speed</div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Current</span>
              <span class="system-row-value" id="helm-speed-val">${Math.round(ship.speed)} km/s</span>
            </div>
            <div class="progress-bar">
              <div class="progress-bar-fill" id="helm-speed-bar" style="width:${(ship.speed/ship.maxSpeed)*100}%"></div>
            </div>
          </div>
          <div class="helm-speed-bar" style="margin-top:8px">
            <input type="range" id="helm-speed-slider" min="0" max="${ship.maxSpeed}" value="${ship.speed}" style="flex:1;accent-color:var(--color-accent)">
            <span id="helm-speed-display" class="text-accent" style="min-width:32px;font-size:12px">${Math.round(ship.speed)}</span>
          </div>
          <button class="btn" id="helm-set-speed" style="margin-top:8px;width:100%">SET SPEED</button>
        </div>
        <div class="panel">
          <div class="panel-title">Heading</div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
            <div class="helm-compass">
              <div>
                <div class="helm-heading-value" id="helm-heading-val">${Math.round(ship.heading)}°</div>
                <div class="helm-heading-unit">HDG</div>
              </div>
            </div>
            <div class="helm-controls-grid">
              <button class="btn helm-dir-btn" data-delta="-45">↖</button>
              <button class="btn helm-dir-btn" data-delta="0" id="btn-turn-north">↑</button>
              <button class="btn helm-dir-btn" data-delta="45">↗</button>
              <button class="btn helm-dir-btn" data-delta="-90">←</button>
              <button class="btn helm-dir-btn" style="opacity:0.2">•</button>
              <button class="btn helm-dir-btn" data-delta="90">→</button>
              <button class="btn helm-dir-btn" data-delta="-135">↙</button>
              <button class="btn helm-dir-btn" data-delta="180">↓</button>
              <button class="btn helm-dir-btn" data-delta="135">↘</button>
            </div>
            <div style="display:flex;gap:8px;width:100%;align-items:center">
              <input type="number" id="helm-heading-input" min="0" max="359" value="${Math.round(ship.heading)}" style="width:80px;text-align:center">
              <button class="btn flex-1" id="helm-set-heading">SET</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Status</div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Status</span>
              <span class="system-row-value" id="helm-status-val">${ship.status}</span>
            </div>
          </div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Pos X</span>
              <span class="system-row-value" id="helm-pos-x">${Math.round(ship.position.x)}</span>
            </div>
          </div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Pos Y</span>
              <span class="system-row-value" id="helm-pos-y">${Math.round(ship.position.y)}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="center-area">
        <div class="local-map-area">
          <div class="viewscreen-outer">
            <div class="viewscreen-bezel" style="position:relative">
              <canvas id="viewscreen-canvas" width="500" height="500"></canvas>
              <div class="viewscreen-scanlines"></div>
              <div class="viewscreen-corner tl"></div>
              <div class="viewscreen-corner tr"></div>
              <div class="viewscreen-corner bl"></div>
              <div class="viewscreen-corner br"></div>
              <div class="viewscreen-coords" id="viewscreen-coords">X:0 Y:0</div>
              <div class="viewscreen-range">RANGE: 1000km</div>
              <div class="viewscreen-contact-info" id="viewscreen-contact-info">
                <div class="viewscreen-contact-name"></div>
                <div class="viewscreen-contact-detail"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Speed slider
    const slider = document.getElementById('helm-speed-slider');
    const display = document.getElementById('helm-speed-display');
    slider.addEventListener('input', () => { display.textContent = slider.value; });
    document.getElementById('helm-set-speed').addEventListener('click', async () => {
      await GameState.setSpeed(parseFloat(slider.value));
      // Update status to in-transit or docked
      const spd = parseFloat(slider.value);
      await ApiClient.updateShip(GameState.getCurrentShip().id, {
        status: spd > 0 ? 'in-transit' : 'docked'
      });
    });

    // Heading buttons
    container.querySelectorAll('.helm-dir-btn[data-delta]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = GameState.getCurrentShip();
        const current = ship.heading || 0;
        const delta = parseInt(btn.dataset.delta, 10);
        let newHeading = ((current + delta) % 360 + 360) % 360;
        document.getElementById('helm-heading-input').value = Math.round(newHeading);
        GameState.setHeading(newHeading);
      });
    });

    document.getElementById('helm-set-heading').addEventListener('click', () => {
      const val = parseInt(document.getElementById('helm-heading-input').value, 10);
      if (!isNaN(val)) {
        GameState.setHeading(((val % 360) + 360) % 360);
      }
    });
  }

  function _updateHelmUI(ship) {
    const headingVal = document.getElementById('helm-heading-val');
    if (headingVal) headingVal.textContent = Math.round(ship.heading) + '°';
    const speedVal = document.getElementById('helm-speed-val');
    if (speedVal) speedVal.textContent = Math.round(ship.speed) + ' km/s';
    const speedBar = document.getElementById('helm-speed-bar');
    if (speedBar) speedBar.style.width = `${(ship.speed / ship.maxSpeed) * 100}%`;
    const posX = document.getElementById('helm-pos-x');
    if (posX) posX.textContent = Math.round(ship.position.x);
    const posY = document.getElementById('helm-pos-y');
    if (posY) posY.textContent = Math.round(ship.position.y);
    const statusVal = document.getElementById('helm-status-val');
    if (statusVal) statusVal.textContent = ship.status;
  }

  // ── TACTICAL ──────────────────────────────────────────────────────────────

  function _buildTactical(container, ship) {
    const shields = ship.shields;
    const weapons = ship.weapons;

    container.innerHTML = `
      <div class="side-panel">
        <div class="panel">
          <div class="panel-title">Shields</div>
          ${['fore','aft','port','starboard'].map(dir => `
            <div class="system-row">
              <div class="system-row-label">
                <span>${dir.toUpperCase()}</span>
                <span class="system-row-value" id="shield-${dir}-val">${shields[dir]}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-bar-fill ${shields[dir] < 30 ? 'danger' : shields[dir] < 60 ? 'warn' : ''}" id="shield-${dir}-bar" style="width:${shields[dir]}%"></div>
              </div>
            </div>
          `).join('')}
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn btn-success flex-1" id="btn-shields-up">RAISE</button>
            <button class="btn btn-danger flex-1" id="btn-shields-down">LOWER</button>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--color-text-dim)">
            Status: <span id="shields-active-val" class="${shields.active ? 'text-success' : 'text-danger'}">${shields.active ? 'ACTIVE' : 'DOWN'}</span>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Weapons</div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Phasers</span>
              <span class="system-row-value" id="phasers-status">${weapons.phasers.online ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Torpedoes</span>
              <span class="system-row-value" id="torps-count">${weapons.torpedoes.count} remaining</span>
            </div>
          </div>
        </div>
      </div>
      <div class="center-area">
        <div class="panel flex-1">
          <div class="panel-title">Contacts</div>
          <div class="tactical-targets" id="tactical-targets">
            <p class="text-dim text-sm">Scanning...</p>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Fire Control</div>
          <div style="margin-bottom:8px;font-size:12px;color:var(--color-text-dim)">
            Target: <span id="selected-target" class="text-accent">None</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn weapon-fire-btn" id="btn-fire-phasers" style="flex:1">⚡ FIRE PHASERS</button>
            <button class="btn weapon-fire-btn" id="btn-fire-torpedo" style="flex:1">🚀 FIRE TORPEDO</button>
          </div>
        </div>
      </div>
      <div class="side-panel right">
        <div class="local-map-area" style="width:200px">
          <div class="viewscreen-outer" style="padding:0">
            <div class="viewscreen-bezel" style="position:relative">
              <canvas id="viewscreen-canvas" width="200" height="200"></canvas>
              <div class="viewscreen-scanlines"></div>
              <div class="viewscreen-corner tl"></div>
              <div class="viewscreen-corner tr"></div>
              <div class="viewscreen-corner bl"></div>
              <div class="viewscreen-corner br"></div>
              <div class="viewscreen-contact-info" id="viewscreen-contact-info" style="font-size:10px;padding:4px 8px">
                <div class="viewscreen-contact-name"></div>
                <div class="viewscreen-contact-detail"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-shields-up').addEventListener('click', () => GameState.toggleShields(true));
    document.getElementById('btn-shields-down').addEventListener('click', () => GameState.toggleShields(false));

    document.getElementById('btn-fire-phasers').addEventListener('click', () => {
      const target = document.getElementById('selected-target').textContent;
      if (target === 'None') { UI.showToast('No target selected.', 'warn'); return; }
      UI.showToast(`Firing phasers at ${target}!`, 'danger');
    });
    document.getElementById('btn-fire-torpedo').addEventListener('click', () => {
      const target = document.getElementById('selected-target').textContent;
      if (target === 'None') { UI.showToast('No target selected.', 'warn'); return; }
      UI.showToast(`Torpedo away! Target: ${target}`, 'danger');
    });

    // Populate targets from current sector ships
    GameState.on('shipsInSectorUpdated', _updateTacticalTargets);
    _updateTacticalTargets(GameState.getShipsInSector());
  }

  function _updateTacticalTargets(ships) {
    const container = document.getElementById('tactical-targets');
    if (!container) return;
    const ownShip = GameState.getCurrentShip();
    const others = ships.filter(s => !ownShip || s.id !== ownShip.id);
    if (others.length === 0) {
      container.innerHTML = '<p class="text-dim text-sm">No contacts in sector.</p>';
      return;
    }
    container.innerHTML = '';
    for (const ship of others) {
      const dx = ownShip ? (ship.position.x - ownShip.position.x) : 0;
      const dy = ownShip ? (ship.position.y - ownShip.position.y) : 0;
      const dist = Math.round(Math.hypot(dx, dy));
      const card = document.createElement('div');
      card.className = 'target-card';
      card.innerHTML = `<span class="target-name">${_esc(ship.name)}</span><span class="target-distance">${dist} km</span>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.target-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const el = document.getElementById('selected-target');
        if (el) el.textContent = ship.name;
      });
      container.appendChild(card);
    }
  }

  function _updateTacticalUI(ship) {
    const shields = ship.shields;
    ['fore','aft','port','starboard'].forEach(dir => {
      const val = document.getElementById(`shield-${dir}-val`);
      const bar = document.getElementById(`shield-${dir}-bar`);
      if (val) val.textContent = shields[dir] + '%';
      if (bar) {
        bar.style.width = shields[dir] + '%';
        bar.className = 'progress-bar-fill ' + (shields[dir] < 30 ? 'danger' : shields[dir] < 60 ? 'warn' : '');
      }
    });
    const activeEl = document.getElementById('shields-active-val');
    if (activeEl) {
      activeEl.textContent = shields.active ? 'ACTIVE' : 'DOWN';
      activeEl.className = shields.active ? 'text-success' : 'text-danger';
    }
  }

  // ── ENGINEERING ───────────────────────────────────────────────────────────

  function _buildEngineering(container, ship) {
    const p = ship.power;
    const systems = ['engines', 'shields', 'weapons', 'sensors', 'life_support'];
    const labels = { engines: 'Engines', shields: 'Shields', weapons: 'Weapons', sensors: 'Sensors', life_support: 'Life Support' };

    container.innerHTML = `
      <div class="side-panel">
        <div class="panel">
          <div class="panel-title">Hull Integrity</div>
          <div class="system-row">
            <div class="system-row-label">
              <span>Hull</span>
              <span class="system-row-value" id="eng-hull-val">${ship.hull}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-bar-fill ${ship.hull < 30 ? 'danger' : ship.hull < 60 ? 'warn' : ''}" id="eng-hull-bar" style="width:${ship.hull}%"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="center-area">
        <div class="panel flex-1">
          <div class="panel-title">Power Management</div>
          <div style="font-size:12px;color:var(--color-text-dim);margin-bottom:12px">
            Total Power: <span class="text-accent" id="eng-total-power">${p.total}</span> units
          </div>
          <div class="power-sliders" id="power-sliders">
            ${systems.map(sys => `
              <div class="power-slider-row">
                <div class="power-slider-label">${labels[sys]}</div>
                <input type="range" class="power-slider-input" data-system="${sys}" min="0" max="${p.total}" value="${p[sys]}">
                <div class="power-slider-val" id="eng-${sys}-val">${p[sys]}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="btn btn-success flex-1" id="btn-apply-power">APPLY POWER</button>
            <button class="btn flex-1" id="btn-reset-power">RESET</button>
          </div>
          <div id="power-warning" style="margin-top:8px;font-size:11px;color:var(--color-warn);display:none">
            ⚠ Power allocation exceeds total capacity!
          </div>
        </div>
      </div>
    `;

    // Slider interactions
    const sliders = container.querySelectorAll('.power-slider-input');
    sliders.forEach(slider => {
      slider.addEventListener('input', () => {
        const sys = slider.dataset.system;
        document.getElementById(`eng-${sys}-val`).textContent = slider.value;
        _checkPowerBalance();
      });
    });

    document.getElementById('btn-apply-power').addEventListener('click', async () => {
      const newPower = { ...p };
      sliders.forEach(slider => { newPower[slider.dataset.system] = parseInt(slider.value, 10); });
      await GameState.setPower(newPower);
      UI.showToast('Power settings applied.', 'success');
    });

    document.getElementById('btn-reset-power').addEventListener('click', () => {
      sliders.forEach(slider => {
        slider.value = p[slider.dataset.system];
        document.getElementById(`eng-${slider.dataset.system}-val`).textContent = slider.value;
      });
      _checkPowerBalance();
    });
  }

  function _checkPowerBalance() {
    const sliders = document.querySelectorAll('.power-slider-input');
    if (!sliders.length) return;
    let total = 0;
    sliders.forEach(s => { total += parseInt(s.value, 10); });
    const max = GameState.getCurrentShip()?.power.total || 1000;
    const warning = document.getElementById('power-warning');
    if (warning) warning.style.display = total > max ? 'block' : 'none';
  }

  function _updateEngineeringUI(ship) {
    const hullVal = document.getElementById('eng-hull-val');
    const hullBar = document.getElementById('eng-hull-bar');
    if (hullVal) hullVal.textContent = ship.hull + '%';
    if (hullBar) {
      hullBar.style.width = ship.hull + '%';
      hullBar.className = 'progress-bar-fill ' + (ship.hull < 30 ? 'danger' : ship.hull < 60 ? 'warn' : '');
    }
  }

  // ── CAPTAIN ───────────────────────────────────────────────────────────────

  function _buildCaptain(container, ship) {
    container.innerHTML = `
      <div class="center-area">
        <div class="panel-title" style="font-size:14px;margin-bottom:16px">COMMAND OVERVIEW — ${_esc(ship.name)}</div>
        <div class="captain-overview" id="captain-overview">
          ${_captainStatusPanel(ship)}
        </div>
      </div>
      <div class="side-panel right">
        <div class="panel flex-1">
          <div class="panel-title">Ship Log</div>
          <div class="comms-log scrollable" id="captain-log" style="height:200px">
            <div class="comms-message system">System initialized. All stations ready.</div>
            <div class="comms-message system">Sector ${_esc(ship.sector)} - Sensors nominal.</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Quick Orders</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn" id="btn-yellow-alert">🟡 YELLOW ALERT</button>
            <button class="btn btn-danger" id="btn-red-alert">🔴 RED ALERT</button>
            <button class="btn btn-success" id="btn-all-stop">⬛ ALL STOP</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-yellow-alert').addEventListener('click', () => {
      UI.showToast('Yellow Alert!', 'warn');
      _captainLog('captain-log', 'Captain ordered Yellow Alert.');
    });
    document.getElementById('btn-red-alert').addEventListener('click', () => {
      UI.showToast('RED ALERT! ALL HANDS TO BATTLE STATIONS!', 'danger');
      _captainLog('captain-log', 'RED ALERT declared!');
    });
    document.getElementById('btn-all-stop').addEventListener('click', async () => {
      await GameState.setSpeed(0);
      await ApiClient.updateShip(ship.id, { status: 'docked' });
      UI.showToast('All Stop.', 'info');
      _captainLog('captain-log', 'All stop ordered.');
    });
  }

  function _captainStatusPanel(ship) {
    const shields = ship.shields;
    const avgShield = Math.round((shields.fore + shields.aft + shields.port + shields.starboard) / 4);
    return `
      <div class="panel">
        <div class="panel-title">Navigation</div>
        <div class="system-row"><div class="system-row-label"><span>Sector</span><span class="system-row-value">${ship.sector}</span></div></div>
        <div class="system-row"><div class="system-row-label"><span>Status</span><span class="system-row-value" id="cap-status">${ship.status}</span></div></div>
        <div class="system-row"><div class="system-row-label"><span>Speed</span><span class="system-row-value" id="cap-speed">${Math.round(ship.speed)} km/s</span></div></div>
        <div class="system-row"><div class="system-row-label"><span>Heading</span><span class="system-row-value" id="cap-heading">${Math.round(ship.heading)}°</span></div></div>
      </div>
      <div class="panel">
        <div class="panel-title">Defenses</div>
        <div class="system-row"><div class="system-row-label"><span>Shields</span><span class="system-row-value ${avgShield < 30 ? 'text-danger' : avgShield < 60 ? 'text-warn' : ''}" id="cap-shields">${avgShield}%</span></div></div>
        <div class="system-row"><div class="system-row-label"><span>Hull</span><span class="system-row-value ${ship.hull < 30 ? 'text-danger' : ''}" id="cap-hull">${ship.hull}%</span></div></div>
      </div>
      <div class="panel">
        <div class="panel-title">Crew</div>
        <div class="system-row"><div class="system-row-label"><span>On Board</span><span class="system-row-value">${ship.crew.length}/${ship.crewCapacity}</span></div></div>
      </div>
      <div class="panel">
        <div class="panel-title">Weapons</div>
        <div class="system-row"><div class="system-row-label"><span>Phasers</span><span class="system-row-value text-success">${ship.weapons.phasers.online ? 'ONLINE' : 'OFFLINE'}</span></div></div>
        <div class="system-row"><div class="system-row-label"><span>Torpedoes</span><span class="system-row-value">${ship.weapons.torpedoes.count} left</span></div></div>
      </div>
    `;
  }

  function _captainLog(logId, msg) {
    const log = document.getElementById(logId);
    if (!log) return;
    const el = document.createElement('div');
    el.className = 'comms-message system';
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function _updateCaptainUI(ship) {
    const ids = {
      'cap-status': ship.status,
      'cap-speed': Math.round(ship.speed) + ' km/s',
      'cap-heading': Math.round(ship.heading) + '°',
      'cap-hull': ship.hull + '%'
    };
    for (const [id, val] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    const shields = ship.shields;
    const avgShield = Math.round((shields.fore + shields.aft + shields.port + shields.starboard) / 4);
    const shieldsEl = document.getElementById('cap-shields');
    if (shieldsEl) shieldsEl.textContent = avgShield + '%';
  }

  // ── FIRST OFFICER ─────────────────────────────────────────────────────────

  function _buildFirstOfficer(container, ship) {
    container.innerHTML = `
      <div class="center-area">
        <div class="panel flex-1">
          <div class="panel-title">Crew Roster</div>
          <div id="crew-roster" style="display:flex;flex-direction:column;gap:6px">
            ${ship.crew.length === 0
              ? '<p class="text-dim text-sm">No crew assigned yet.</p>'
              : ship.crew.map(c => `<div class="panel" style="padding:8px 12px;"><span class="text-accent">${_esc(c.playerId)}</span> — <span class="text-dim">${c.station || 'Unassigned'}</span></div>`).join('')
            }
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Mission Briefing</div>
          <p class="text-dim text-sm" style="line-height:1.6">
            Current sector: <span class="text-accent">${_esc(ship.sector)}</span><br>
            Ship class: <span class="text-accent">${_esc(ship.class)}</span><br>
            Mission status: <span class="text-success">NOMINAL</span><br>
            Standing orders: Explore and report.
          </p>
        </div>
      </div>
    `;
  }

  // ── COMMS ─────────────────────────────────────────────────────────────────

  async function _buildComms(container, ship) {
    const ships = GameState.getShips().filter(s => s.id !== ship.id);

    container.innerHTML = `
      <div class="side-panel">
        <div class="panel flex-1">
          <div class="panel-title">Hail a Ship</div>
          <div class="hail-panel">
            <select class="hail-ship-select" id="hail-target">
              <option value="">-- Select Target --</option>
              ${ships.map(s => `<option value="${s.id}">${_esc(s.name)}</option>`).join('')}
            </select>
            <textarea id="hail-text" rows="3" placeholder="Enter hail message..." style="resize:none;font-size:12px"></textarea>
            <button class="btn btn-warn" id="btn-send-hail" style="width:100%">📡 OPEN CHANNEL</button>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Incoming Hails</div>
          <div id="hail-log" class="comms-log scrollable" style="max-height:140px">
            <p class="text-dim text-sm">No incoming hails.</p>
          </div>
        </div>
      </div>
      <div class="center-area">
        <div class="panel flex-1" style="display:flex;flex-direction:column">
          <div class="panel-title">Crew Communications — ${_esc(ship.name)}</div>
          <div class="comms-log scrollable flex-1" id="crew-chat-log" style="height:200px"></div>
          <div class="comms-input-area">
            <input type="text" class="comms-input" id="crew-chat-input" placeholder="Send message to crew...">
            <button class="btn comms-send-btn" id="btn-send-crew">SEND</button>
          </div>
        </div>
      </div>
    `;

    // Load existing messages
    const messages = await Comms.loadCrewChat(ship.id);
    Comms.renderMessages(document.getElementById('crew-chat-log'), messages);

    // Load hails
    const hailsData = await Comms.getHails(ship.id);
    if (hailsData.length > 0) {
      Comms.renderMessages(document.getElementById('hail-log'), hailsData.map(h => ({
        ...h, displayName: h.fromShipName, type: 'hail'
      })));
    }

    // Send crew message
    const chatInput = document.getElementById('crew-chat-input');
    const sendCrew = async () => {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      const msg = await Comms.sendCrewMessage(ship.id, text);
      if (msg) Comms.appendMessage(document.getElementById('crew-chat-log'), msg);
    };
    document.getElementById('btn-send-crew').addEventListener('click', sendCrew);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCrew(); });

    // Send hail
    document.getElementById('btn-send-hail').addEventListener('click', async () => {
      const toShipId = document.getElementById('hail-target').value;
      const text = document.getElementById('hail-text').value.trim();
      if (!toShipId || !text) { UI.showToast('Select a target and enter a message.', 'warn'); return; }
      const hail = await Comms.sendHail(ship.id, toShipId, text);
      if (hail) {
        document.getElementById('hail-text').value = '';
        Comms.appendMessage(document.getElementById('hail-log'), { ...hail, displayName: hail.fromShipName, type: 'hail' });
      }
    });

    // Poll for new crew messages
    Comms.startPolling(ship.id, (newMsgs) => {
      const log = document.getElementById('crew-chat-log');
      if (!log) return;
      for (const msg of newMsgs) Comms.appendMessage(log, msg);
    });
  }

  // ── Viewscreen init ───────────────────────────────────────────────────────

  function _initViewscreen() {
    const canvas = document.getElementById('viewscreen-canvas');
    if (!canvas) return;
    const size = canvas.width || 500;
    MapRenderer.init('viewscreen-canvas', size);

    MapRenderer.onShipClick = (ship) => {
      UI.showToast(`Selected: ${ship.name}`, 'info');
    };

    GameState.on('sectorLoaded', () => MapRenderer.startRendering());
    GameState.on('shipsInSectorUpdated', () => {});

    if (GameState.getCurrentSector()) MapRenderer.startRendering();
  }

  function _returnToStationSelect() {
    GameState.stopPolling();
    MapRenderer.stopRendering();
    Comms.stopPolling();
    Router.navigate('station-select');
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    initStationSelector,
    STATIONS
  };
})();
