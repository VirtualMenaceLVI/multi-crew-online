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
  const player = db.getPlayerById(session.playerId);
  if (!player) {
    db.deleteSession(token);
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.session = session;
  req.player = player;
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

  const player = db.getPlayerByUsername(username.trim());

  if (!player || player.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = uuidv4();
  db.createSession({
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
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, - and _' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const existing = db.getPlayerByUsername(trimmed);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const player = db.createPlayer({
    id: `player-${uuidv4()}`,
    username: trimmed,
    password,
    displayName: (displayName || '').trim() || trimmed,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    currentShip: null,
    currentStation: null,
    isOnline: false
  });

  const token = uuidv4();
  db.createSession({ token, playerId: player.id, createdAt: new Date().toISOString() });
  db.updatePlayer(player.id, { isOnline: true, lastSeen: new Date().toISOString() });

  const { password: _pw, ...safePlayer } = player;
  res.status(201).json({ token, player: safePlayer });
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
 * GET /api/ships/sector/:sectorId
 */
router.get('/ships/sector/:sectorId', requireAuth, (req, res) => {
  const ships = db.getShipsInSector(req.params.sectorId);
  res.json({ ships });
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
 * POST /api/ships
 * Create a new ship
 */
router.post('/ships', requireAuth, (req, res) => {
  const { name, shipClass, sector } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Ship name required' });

  const ship = db.createShip({
    id: `ship-${uuidv4()}`,
    name: name.trim(),
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
 * Advance ship physics (called by client polling)
 */
router.post('/ships/:id/tick', requireAuth, (req, res) => {
  const ship = db.getShipById(req.params.id);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const { deltaSeconds } = req.body;
  const dt = Math.min(parseFloat(deltaSeconds) || 0.5, 5); // cap at 5s

  const pos = { ...ship.position };
  const vel = { ...ship.velocity };

  pos.x = Math.max(0, Math.min(1000, pos.x + vel.x * dt));
  pos.y = Math.max(0, Math.min(1000, pos.y + vel.y * dt));

  const updated = db.updateShip(ship.id, { position: pos });
  res.json({ ship: updated });
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
 * Send a hail REQUEST to another ship (no message required)
 * Body: { fromShipId, toShipId }
 */
router.post('/comms/hail', requireAuth, (req, res) => {
  const { fromShipId, toShipId } = req.body;
  if (!fromShipId || !toShipId) {
    return res.status(400).json({ error: 'fromShipId and toShipId required' });
  }
  if (fromShipId === toShipId) {
    return res.status(400).json({ error: 'Cannot hail your own ship' });
  }

  const fromShip = db.getShipById(fromShipId);
  const toShip = db.getShipById(toShipId);
  if (!fromShip || !toShip) return res.status(404).json({ error: 'Ship not found' });

  // Check if there's already a pending or active hail between these ships
  const existing = db.getHailsForShip(fromShipId).find(h =>
    ((h.fromShipId === fromShipId && h.toShipId === toShipId) ||
     (h.fromShipId === toShipId && h.toShipId === fromShipId)) &&
    (h.status === 'pending' || h.status === 'accepted')
  );
  if (existing) {
    return res.status(409).json({ error: 'A hail is already pending or active with this ship' });
  }

  const hail = db.addHail({
    id: uuidv4(),
    fromShipId,
    fromShipName: fromShip.name,
    toShipId,
    toShipName: toShip.name,
    playerId: req.player.id,
    status: 'pending',
    channelId: null,
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
 * POST /api/comms/hail/:id/accept
 * Accept an incoming hail request — opens a private channel
 */
router.post('/comms/hail/:id/accept', requireAuth, (req, res) => {
  const hail = db.getHailById(req.params.id);
  if (!hail) return res.status(404).json({ error: 'Hail not found' });
  if (hail.status !== 'pending') return res.status(400).json({ error: 'Hail is not pending' });
  if (req.player.currentShip !== hail.toShipId) {
    return res.status(403).json({ error: 'You are not on the target ship' });
  }

  const channelId = uuidv4();
  const updated = db.updateHail(hail.id, {
    status: 'accepted',
    channelId,
    acceptedAt: new Date().toISOString()
  });
  res.json({ hail: updated, channelId });
});

/**
 * POST /api/comms/hail/:id/decline
 * Decline an incoming hail request
 */
router.post('/comms/hail/:id/decline', requireAuth, (req, res) => {
  const hail = db.getHailById(req.params.id);
  if (!hail) return res.status(404).json({ error: 'Hail not found' });
  if (hail.status !== 'pending') return res.status(400).json({ error: 'Hail is not pending' });

  const updated = db.updateHail(hail.id, { status: 'declined', declinedAt: new Date().toISOString() });
  res.json({ hail: updated });
});

/**
 * POST /api/comms/hail/:id/close
 * Close/end an active hail channel
 */
router.post('/comms/hail/:id/close', requireAuth, (req, res) => {
  const hail = db.getHailById(req.params.id);
  if (!hail) return res.status(404).json({ error: 'Hail not found' });
  if (hail.status !== 'accepted') return res.status(400).json({ error: 'Hail channel is not active' });

  const currentShip = req.player.currentShip;
  if (currentShip !== hail.fromShipId && currentShip !== hail.toShipId) {
    return res.status(403).json({ error: 'You are not on one of the ships in this channel' });
  }

  const updated = db.updateHail(hail.id, { status: 'closed', closedAt: new Date().toISOString() });
  res.json({ hail: updated });
});

/**
 * GET /api/comms/hail-chat/:channelId
 * Retrieve messages in a private hail channel
 */
router.get('/comms/hail-chat/:channelId', requireAuth, (req, res) => {
  const messages = db.getHailChat(req.params.channelId);
  res.json({ messages });
});

/**
 * POST /api/comms/hail-chat/:channelId
 * Send a message in a private hail channel
 * Body: { text, shipId }
 */
router.post('/comms/hail-chat/:channelId', requireAuth, (req, res) => {
  const { text, shipId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

  const player = req.player;
  const message = db.addHailChatMessage(req.params.channelId, {
    id: uuidv4(),
    channelId: req.params.channelId,
    playerId: player.id,
    displayName: player.displayName || player.username,
    shipId: shipId || player.currentShip,
    text: text.trim(),
    timestamp: new Date().toISOString()
  });
  res.status(201).json({ message });
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
