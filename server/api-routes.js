'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./dev-data-manager');

const router = express.Router();

// ── Auth Middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'No session token provided' });
  const session = db.getSessionByToken(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
  req.session = session;
  req.player = db.getPlayerById(session.playerId);
  next();
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  let player = db.getPlayerByUsername(username);

  // Dev mode: auto-create admin user on first login
  if (!player && username === 'admin' && password === 'admin') {
    player = db.createPlayer({
      id: 'player-admin',
      username: 'admin',
      password: 'admin',
      displayName: 'Administrator',
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      currentShip: null,
      currentStation: null,
      isOnline: false
    });
  }

  if (!player || player.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = uuidv4();
  const session = db.createSession({
    token,
    playerId: player.id,
    createdAt: new Date().toISOString()
  });

  db.updatePlayer(player.id, { isOnline: true, lastSeen: new Date().toISOString() });

  const { password: _pw, ...safePlayer } = player;
  res.json({ token, player: safePlayer });
});

/**
 * POST /api/auth/register
 * Body: { username, password, displayName }
 */
router.post('/auth/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const existing = db.getPlayerByUsername(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const player = db.createPlayer({
    id: `player-${uuidv4()}`,
    username,
    password,
    displayName: displayName || username,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    currentShip: null,
    currentStation: null,
    isOnline: false
  });

  const token = uuidv4();
  db.createSession({ token, playerId: player.id, createdAt: new Date().toISOString() });
  db.updatePlayer(player.id, { isOnline: true });

  const { password: _pw, ...safePlayer } = player;
  res.json({ token, player: safePlayer });
});

/**
 * POST /api/auth/logout
 */
router.post('/auth/logout', requireAuth, (req, res) => {
  db.deleteSession(req.session.token);
  db.updatePlayer(req.player.id, { isOnline: false, currentShip: null, currentStation: null });
  res.json({ success: true });
});

/**
 * GET /api/auth/me
 */
router.get('/auth/me', requireAuth, (req, res) => {
  const { password: _pw, ...safe } = req.player;
  res.json({ player: safe });
});

// ── Ship Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/ships
 */
router.get('/ships', requireAuth, (req, res) => {
  const data = db.getShips();
  res.json({ ships: data.ships });
});

/**
 * GET /api/ships/:id
 */
router.get('/ships/:id', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });
  res.json({ ship });
});

/**
 * GET /api/ships/sector/:sectorId
 */
router.get('/ships/sector/:sectorId', requireAuth, (req, res) => {
  const ships = db.getShipsInSector(req.params.sectorId);
  res.json({ ships });
});

/**
 * POST /api/ships
 * Create a new ship
 */
router.post('/ships', requireAuth, (req, res) => {
  const { name, shipClass, sector } = req.body;
  if (!name) return res.status(400).json({ error: 'Ship name required' });

  const ship = db.createShip({
    id: `ship-${uuidv4()}`,
    name,
    class: shipClass || 'Scout',
    sector: sector || 'A1',
    position: { x: 500, y: 500 },
    heading: 0,
    velocity: { x: 0, y: 0 },
    speed: 0,
    maxSpeed: 100,
    shields: {
      fore: 100, aft: 100, port: 100, starboard: 100, active: true
    },
    weapons: {
      phasers: { banks: 2, power: 100, online: true },
      torpedoes: { count: 12, loaded: true }
    },
    hull: 100,
    power: {
      total: 800, engines: 200, shields: 150, weapons: 150, sensors: 150, life_support: 150
    },
    status: 'docked',
    crew: [{ playerId: req.player.id, station: null }],
    crewCapacity: 6,
    lastUpdated: new Date().toISOString()
  });

  res.status(201).json({ ship });
});

/**
 * PATCH /api/ships/:id
 * Update ship state (helm, tactical, engineering use this)
 */
router.patch('/ships/:id', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const allowed = ['heading', 'velocity', 'speed', 'position', 'sector',
    'shields', 'weapons', 'hull', 'power', 'status'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const updated = db.updateShip(req.params.id, updates);
  res.json({ ship: updated });
});

/**
 * POST /api/ships/:id/join
 * Join a ship crew
 */
router.post('/ships/:id/join', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const { station } = req.body;
  const validStations = ['helm', 'tactical', 'captain', 'engineering', 'first-officer', 'comms'];
  if (station && !validStations.includes(station)) {
    return res.status(400).json({ error: 'Invalid station' });
  }

  const crew = ship.crew || [];
  const existing = crew.find(c => c.playerId === req.player.id);
  if (existing) {
    existing.station = station || existing.station;
  } else {
    if (crew.length >= ship.crewCapacity) {
      return res.status(409).json({ error: 'Ship crew is full' });
    }
    crew.push({ playerId: req.player.id, station: station || null });
  }

  const stationId = station ? `station-${station}-${ship.name.toLowerCase().replace(/\s+/g, '-')}` : null;
  db.updateShip(ship.id, { crew });
  db.updatePlayer(req.player.id, { currentShip: ship.id, currentStation: stationId });

  res.json({ ship: db.getShipById(ship.id), stationId });
});

/**
 * POST /api/ships/:id/leave
 */
router.post('/ships/:id/leave', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const crew = (ship.crew || []).filter(c => c.playerId !== req.player.id);
  db.updateShip(ship.id, { crew });
  db.updatePlayer(req.player.id, { currentShip: null, currentStation: null });
  res.json({ success: true });
});

/**
 * POST /api/ships/:id/tick
 * Advance ship physics (called by client polling).
 * Handles sector-boundary crossing automatically.
 */
router.post('/ships/:id/tick', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  // Nothing to do if stopped or docked
  if (!ship.velocity || (ship.velocity.x === 0 && ship.velocity.y === 0)) {
    return res.json({ ship, sectorCrossed: false });
  }

  const { deltaSeconds } = req.body;
  const dt = Math.min(parseFloat(deltaSeconds) || 0.5, 5); // cap at 5s

  const pos = { x: ship.position.x + ship.velocity.x * dt,
                y: ship.position.y + ship.velocity.y * dt };

  // ── Sector grid: rows A-E (index 0-4), cols 1-5 (index 0-4) ─────────────
  const ROWS = 5; // A-E
  const COLS = 5; // 1-5
  let sRow = ship.sector.charCodeAt(0) - 65;      // 'A'→0 … 'E'→4
  let sCol = parseInt(ship.sector.slice(1), 10) - 1; // '1'→0 … '5'→4
  let crossed = false;

  if (pos.x < 0) {
    if (sCol > 0) { sCol--; pos.x += 1000; crossed = true; }
    else pos.x = 0;
  } else if (pos.x > 1000) {
    if (sCol < COLS - 1) { sCol++; pos.x -= 1000; crossed = true; }
    else pos.x = 1000;
  }

  if (pos.y < 0) {
    if (sRow > 0) { sRow--; pos.y += 1000; crossed = true; }
    else pos.y = 0;
  } else if (pos.y > 1000) {
    if (sRow < ROWS - 1) { sRow++; pos.y -= 1000; crossed = true; }
    else pos.y = 1000;
  }

  const updates = { position: pos };
  if (crossed) {
    updates.sector = String.fromCharCode(65 + sRow) + (sCol + 1);
  }

  const updated = db.updateShip(ship.id, updates);
  res.json({ ship: updated, sectorCrossed: crossed });
});

/**
 * POST /api/ships/:id/warp
 * Warp drive: instantly relocate ship to a target sector.
 * Body: { targetSector }
 */
router.post('/ships/:id/warp', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const { targetSector } = req.body;
  if (!targetSector) return res.status(400).json({ error: 'Target sector required' });
  if (targetSector === ship.sector) return res.status(400).json({ error: 'Already in that sector' });

  const sector = db.getSectorById(targetSector);
  if (!sector) return res.status(404).json({ error: 'Target sector not found' });

  const updated = db.updateShip(ship.id, {
    sector: targetSector,
    position: { x: 500, y: 500 },
    speed: 0,
    velocity: { x: 0, y: 0 },
    status: 'in-transit'
  });
  res.json({ ship: updated });
});

/**
 * POST /api/ships/:id/dock
 * Dock at the nearest starbase or planet (must be within 80 km).
 */
router.post('/ships/:id/dock', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const sector = db.getSectorById(ship.sector);
  if (!sector) return res.status(404).json({ error: 'Sector not found' });

  const DOCK_RANGE = 80;
  let dockTarget = null;
  let minDist = Infinity;

  if (sector.starbase) {
    const dx = ship.position.x - sector.starbase.x;
    const dy = ship.position.y - sector.starbase.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= DOCK_RANGE && dist < minDist) { minDist = dist; dockTarget = sector.starbase.name; }
  }

  for (const planet of (sector.planets || [])) {
    const dx = ship.position.x - planet.x;
    const dy = ship.position.y - planet.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= DOCK_RANGE && dist < minDist) { minDist = dist; dockTarget = planet.name; }
  }

  if (!dockTarget && ship.status !== 'docked') {
    return res.status(400).json({ error: 'No docking target in range (must be within 80 km of a starbase or planet)' });
  }

  const updated = db.updateShip(ship.id, {
    status: 'docked',
    speed: 0,
    velocity: { x: 0, y: 0 }
  });
  res.json({ ship: updated, dockedAt: dockTarget || 'Unknown' });
});

// ── Sector Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/sectors
 */
router.get('/sectors', requireAuth, (req, res) => {
  const data = db.getSectors();
  res.json({ sectors: data.sectors });
});

/**
 * GET /api/sectors/:id
 */
router.get('/sectors/:id', requireAuth, (req, res) => {
  const sector = db.getSectorById(req.params.id);
  if (!sector) return res.status(404).json({ error: 'Sector not found' });
  res.json({ sector });
});

// ── Communication Routes ──────────────────────────────────────────────────────

/**
 * GET /api/comms/crew/:shipId
 */
router.get('/comms/crew/:shipId', requireAuth, (req, res) => {
  const messages = db.getCrewChat(req.params.shipId);
  res.json({ messages });
});

/**
 * POST /api/comms/crew/:shipId
 * Body: { text }
 */
router.post('/comms/crew/:shipId', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

  const player = req.player;
  const message = db.addCrewMessage(req.params.shipId, {
    id: uuidv4(),
    shipId: req.params.shipId,
    playerId: player.id,
    displayName: player.displayName || player.username,
    station: player.currentStation,
    text: text.trim(),
    timestamp: new Date().toISOString()
  });
  res.status(201).json({ message });
});

/**
 * POST /api/comms/hail
 * Send a hail to another ship
 * Body: { fromShipId, toShipId, text }
 */
router.post('/comms/hail', requireAuth, (req, res) => {
  const { fromShipId, toShipId, text } = req.body;
  if (!fromShipId || !toShipId || !text) {
    return res.status(400).json({ error: 'fromShipId, toShipId, and text required' });
  }

  const fromShip = db.getShipById(fromShipId);
  const toShip = db.getShipById(toShipId);
  if (!fromShip || !toShip) return res.status(404).json({ error: 'Ship not found' });

  const hail = db.addHail({
    id: uuidv4(),
    fromShipId,
    fromShipName: fromShip.name,
    toShipId,
    toShipName: toShip.name,
    playerId: req.player.id,
    text: text.trim(),
    status: 'pending',
    timestamp: new Date().toISOString()
  });
  res.status(201).json({ hail });
});

/**
 * GET /api/comms/hails/:shipId
 */
router.get('/comms/hails/:shipId', requireAuth, (req, res) => {
  const hails = db.getHailsForShip(req.params.shipId);
  res.json({ hails });
});

/**
 * GET /api/comms/broadcast
 */
router.get('/comms/broadcast', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const messages = db.getBroadcastLog(limit);
  res.json({ messages });
});

/**
 * POST /api/comms/broadcast
 */
router.post('/comms/broadcast', requireAuth, (req, res) => {
  const { text, shipId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

  const msg = db.addBroadcast({
    id: uuidv4(),
    playerId: req.player.id,
    displayName: req.player.displayName || req.player.username,
    shipId: shipId || null,
    text: text.trim(),
    timestamp: new Date().toISOString()
  });
  res.status(201).json({ message: msg });
});

module.exports = router;
