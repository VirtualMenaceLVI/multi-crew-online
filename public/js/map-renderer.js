/**
 * map-renderer.js
 * Renders the local viewscreen (canvas-based 2D local map).
 * Also handles the sector map grid rendering.
 */

const MapRenderer = (() => {
  let _canvas = null;
  let _ctx = null;
  let _animFrame = null;
  let _lastRender = 0;

  // Viewport scale: 1 map unit = N canvas pixels
  let _scale = 1;
  let _canvasSize = 500;

  // Hover/selected contact
  let _hoveredShip = null;
  let _selectedShip = null;

  // Mouse position on canvas
  let _mouseX = 0;
  let _mouseY = 0;

  // ── Colours (space palette) ───────────────────────────────────────────────
  const COLORS = {
    bg:         '#000008',
    star:       'rgba(255,255,255,',  // + alpha + ')'
    grid:       'rgba(0,80,160,0.2)',
    ownShip:    '#00ffaa',
    otherShip:  '#00aaff',
    enemy:      '#ff4444',
    planet:     '#4a9e6b',
    asteroid:   '#888888',
    starbase:   '#5555ff',
    rangeRing:  'rgba(0,170,255,0.12)',
    rangeText:  'rgba(0,170,255,0.5)',
    heading:    'rgba(0,255,170,0.7)',
    selected:   '#ffaa00'
  };

  // Static starfield (generated once)
  let _stars = [];

  function _generateStars(count) {
    _stars = [];
    for (let i = 0; i < count; i++) {
      _stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.6 + 0.2,
        twinkle: Math.random() * Math.PI * 2
      });
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init(canvasId, size) {
    _canvas = document.getElementById(canvasId);
    if (!_canvas) return;
    _canvasSize = size || 500;
    _canvas.width  = _canvasSize;
    _canvas.height = _canvasSize;
    _ctx = _canvas.getContext('2d');
    _scale = _canvasSize / 1000; // 1000 km sector mapped to canvas

    _generateStars(120);

    _canvas.addEventListener('mousemove', _onMouseMove);
    _canvas.addEventListener('click', _onClick);
    _canvas.addEventListener('mouseleave', () => {
      _hoveredShip = null;
      _hideContactInfo();
    });
  }

  function _onMouseMove(e) {
    const rect = _canvas.getBoundingClientRect();
    _mouseX = e.clientX - rect.left;
    _mouseY = e.clientY - rect.top;
    _checkHover();
  }

  function _onClick() {
    if (_hoveredShip) {
      _selectedShip = _hoveredShip;
      MapRenderer.onShipClick && MapRenderer.onShipClick(_selectedShip);
    }
  }

  function _checkHover() {
    const ships = GameState.getShipsInSector();
    const ownShip = GameState.getCurrentShip();
    _hoveredShip = null;

    for (const ship of ships) {
      const cx = ship.position.x * _scale;
      const cy = ship.position.y * _scale;
      const dist = Math.hypot(_mouseX - cx, _mouseY - cy);
      if (dist < 12) {
        _hoveredShip = ship;
        _showContactInfo(ship, cx, cy);
        return;
      }
    }

    // Check own ship
    if (ownShip) {
      const cx = ownShip.position.x * _scale;
      const cy = ownShip.position.y * _scale;
      if (Math.hypot(_mouseX - cx, _mouseY - cy) < 12) {
        _hoveredShip = ownShip;
        _showContactInfo(ownShip, cx, cy);
        return;
      }
    }

    _hideContactInfo();
  }

  function _showContactInfo(ship, cx, cy) {
    const info = document.getElementById('viewscreen-contact-info');
    if (!info) return;
    const ownShip = GameState.getCurrentShip();
    let dist = '---';
    if (ownShip && ship.id !== ownShip.id) {
      const dx = ship.position.x - ownShip.position.x;
      const dy = ship.position.y - ownShip.position.y;
      dist = Math.round(Math.hypot(dx, dy)) + ' km';
    } else {
      dist = '(your ship)';
    }
    info.querySelector('.viewscreen-contact-name').textContent = ship.name;
    info.querySelector('.viewscreen-contact-detail').innerHTML =
      `Class: ${ship.class}<br>Status: ${ship.status}<br>Distance: ${dist}`;

    // Position the popup near the ship but keep it inside canvas
    let px = cx + 14;
    let py = cy - 10;
    if (px + 160 > _canvasSize) px = cx - 164;
    if (py + 70 > _canvasSize) py = cy - 74;
    info.style.left = px + 'px';
    info.style.top  = py + 'px';
    info.classList.add('visible');

    // Update coords display
    const coordsEl = document.getElementById('viewscreen-coords');
    if (coordsEl) coordsEl.textContent = `X:${Math.round(ship.position.x)} Y:${Math.round(ship.position.y)}`;
  }

  function _hideContactInfo() {
    const info = document.getElementById('viewscreen-contact-info');
    if (info) info.classList.remove('visible');
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function startRendering() {
    if (_animFrame) return;
    function loop(ts) {
      render(ts);
      _animFrame = requestAnimationFrame(loop);
    }
    _animFrame = requestAnimationFrame(loop);
  }

  function stopRendering() {
    if (_animFrame) {
      cancelAnimationFrame(_animFrame);
      _animFrame = null;
    }
  }

  function render(timestamp) {
    if (!_ctx) return;
    const dt = (timestamp - _lastRender) / 1000;
    _lastRender = timestamp;

    const ctx = _ctx;
    const S = _canvasSize;
    const sc = _scale;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, S, S);

    // Stars
    _drawStars(ctx, timestamp);

    // Grid lines
    _drawGrid(ctx, S, sc);

    // Range rings (around own ship)
    const ownShip = GameState.getCurrentShip();
    if (ownShip) _drawRangeRings(ctx, ownShip, sc);

    // Sector objects
    const sector = GameState.getCurrentSector();
    if (sector) {
      _drawAsteroids(ctx, sector, sc);
      _drawPlanets(ctx, sector, sc);
      if (sector.starbase) _drawStarbase(ctx, sector.starbase, sc);
    }

    // Other ships in sector
    const ships = GameState.getShipsInSector();
    for (const ship of ships) {
      if (ownShip && ship.id === ownShip.id) continue;
      _drawShip(ctx, ship, sc, false);
    }

    // Own ship (always on top)
    if (ownShip) _drawShip(ctx, ownShip, sc, true);
  }

  function _drawStars(ctx, ts) {
    for (const star of _stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(ts * 0.001 + star.twinkle);
      const alpha = star.a * (0.6 + 0.4 * twinkle);
      ctx.beginPath();
      ctx.arc(
        star.x * _canvasSize,
        star.y * _canvasSize,
        star.r, 0, Math.PI * 2
      );
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  function _drawGrid(ctx, S, sc) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    const step = 100 * sc; // Every 100 km
    for (let x = 0; x <= S; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    }
    for (let y = 0; y <= S; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
  }

  function _drawRangeRings(ctx, ship, sc) {
    const cx = ship.position.x * sc;
    const cy = ship.position.y * sc;
    const rings = [100, 250, 500];
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * sc, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.rangeRing;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Label
      ctx.fillStyle = COLORS.rangeText;
      ctx.font = '9px Share Tech Mono, monospace';
      ctx.fillText(`${r}km`, cx + r * sc + 3, cy - 3);
    }
  }

  function _drawAsteroids(ctx, sector, sc) {
    ctx.fillStyle = COLORS.asteroid;
    for (const ast of sector.asteroids) {
      ctx.beginPath();
      ctx.arc(ast.x * sc, ast.y * sc, ast.radius * sc, 0, Math.PI * 2);
      ctx.fillStyle = '#777';
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  function _drawPlanets(ctx, sector, sc) {
    for (const planet of sector.planets) {
      const cx = planet.x * sc;
      const cy = planet.y * sc;
      const r  = planet.radius * sc;

      // Glow
      const grd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.5);
      grd.addColorStop(0, (planet.color || '#4a9e6b') + '44');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Planet body
      const bodyGrd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      bodyGrd.addColorStop(0, planet.color || '#4a9e6b');
      bodyGrd.addColorStop(1, shadeColor(planet.color || '#4a9e6b', -40));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrd;
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(200,220,255,0.8)';
      ctx.font = `${Math.max(9, r * 0.5)}px Share Tech Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(planet.name, cx, cy + r + 10);
      ctx.textAlign = 'left';
    }
  }

  function _drawStarbase(ctx, sb, sc) {
    const cx = sb.x * sc;
    const cy = sb.y * sc;
    const r  = sb.radius * sc;

    // Glow
    ctx.shadowColor = COLORS.starbase;
    ctx.shadowBlur  = 16;

    // Draw a hexagon/station shape
    ctx.strokeStyle = COLORS.starbase;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(50,50,200,0.3)';
    ctx.fill();

    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#8888ff';
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sb.name, cx, cy + r + 12);
    ctx.textAlign = 'left';
  }

  function _drawShip(ctx, ship, sc, isOwn) {
    const cx = ship.position.x * sc;
    const cy = ship.position.y * sc;
    const heading = ship.heading || 0;
    const size = isOwn ? 8 : 7;
    const color = isOwn ? COLORS.ownShip : COLORS.otherShip;
    const isSelected = _selectedShip && ship.id === _selectedShip.id;

    // Heading line
    const rad = (heading - 90) * Math.PI / 180;
    ctx.strokeStyle = isOwn ? COLORS.heading : 'rgba(0,170,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * 20, cy + Math.sin(rad) * 20);
    ctx.stroke();

    // Selection ring
    if (isSelected) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, size + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ship triangle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.strokeStyle = isOwn ? '#ffffff' : '#88ccff';
    ctx.lineWidth = 0.8;

    ctx.shadowColor = color;
    ctx.shadowBlur  = isOwn ? 12 : 8;

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(-size * 0.7, size * 0.7);
    ctx.lineTo(0, size * 0.3);
    ctx.lineTo(size * 0.7, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();

    // Ship name label
    ctx.fillStyle = isOwn ? COLORS.ownShip : COLORS.otherShip;
    ctx.font = '9px Share Tech Mono, monospace';
    ctx.fillText(ship.name, cx + 10, cy - 4);

    // Speed indicator
    if (ship.speed > 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      ctx.font = '8px Share Tech Mono, monospace';
      ctx.fillText(`${Math.round(ship.speed)}`, cx + 10, cy + 5);
    }
  }

  // ── Sector Map ────────────────────────────────────────────────────────────

  function renderSectorMap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const sectors = GameState.getSectors();
    const currentShip = GameState.getCurrentShip();
    const currentSectorId = currentShip ? currentShip.sector : null;

    // Group sectors by row letter
    const rows = {};
    for (const sector of sectors) {
      const letter = sector.id[0];
      if (!rows[letter]) rows[letter] = [];
      rows[letter].push(sector);
    }

    const rowLetters = Object.keys(rows).sort();

    // Determine column numbers
    const allCols = new Set();
    for (const sector of sectors) {
      allCols.add(parseInt(sector.id.slice(1), 10));
    }
    const colNums = Array.from(allCols).sort((a, b) => a - b);

    container.innerHTML = '';

    // Column labels
    const colLabelRow = document.createElement('div');
    colLabelRow.className = 'sector-col-labels';
    colLabelRow.appendChild(Object.assign(document.createElement('div'), { style: 'width:24px' }));
    for (const n of colNums) {
      const lbl = document.createElement('div');
      lbl.className = 'sector-col-label';
      lbl.textContent = n;
      colLabelRow.appendChild(lbl);
    }
    container.appendChild(colLabelRow);

    for (const letter of rowLetters) {
      const rowEl = document.createElement('div');
      rowEl.className = 'sector-grid-row';

      // Row label
      const rowLbl = document.createElement('div');
      rowLbl.className = 'sector-row-label';
      rowLbl.textContent = letter;
      rowEl.appendChild(rowLbl);

      for (const n of colNums) {
        const sectorId = `${letter}${n}`;
        const sector = sectors.find(s => s.id === sectorId);
        const cell = document.createElement('div');
        cell.className = 'sector-cell' + (sectorId === currentSectorId ? ' current' : '');
        cell.dataset.sectorId = sectorId;

        if (sector) {
          cell.innerHTML = `
            <div class="sector-cell-id">${sector.id}</div>
            <div class="sector-cell-name">${sector.name.replace(/^[A-Z][a-z]+ Sector /, '')}</div>
            <div class="sector-cell-indicators">
              ${sector.planets.length > 0 ? '<div class="sector-dot planet" title="Planets"></div>' : ''}
              ${sector.starbase ? '<div class="sector-dot base" title="Starbase"></div>' : ''}
              ${sector.asteroids.length > 0 ? '<div class="sector-dot asteroids" title="Asteroids"></div>' : ''}
            </div>
          `;
          cell.addEventListener('click', () => {
            MapRenderer.onSectorClick && MapRenderer.onSectorClick(sector);
          });
        } else {
          cell.innerHTML = `<div class="sector-cell-id" style="opacity:0.2">${sectorId}</div>`;
          cell.style.opacity = '0.3';
        }

        rowEl.appendChild(cell);
      }
      container.appendChild(rowEl);
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function shadeColor(color, amount) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  function resize(size) {
    _canvasSize = size;
    if (_canvas) {
      _canvas.width  = size;
      _canvas.height = size;
      _scale = size / 1000;
    }
  }

  // Callback hooks
  let onShipClick   = null;
  let onSectorClick = null;

  return {
    init, startRendering, stopRendering, render,
    renderSectorMap,
    resize,
    get onShipClick()   { return onShipClick; },
    set onShipClick(fn) { onShipClick = fn; },
    get onSectorClick()   { return onSectorClick; },
    set onSectorClick(fn) { onSectorClick = fn; }
  };
})();
