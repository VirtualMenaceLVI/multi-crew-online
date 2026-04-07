'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Default seed data ─────────────────────────────────────────────────────────

const DEFAULT_SHIPS = [
  {
    id: 'ship-horizon',
    name: 'Horizon',
    class: 'Explorer',
    sector: 'A1',
    position: { x: 500, y: 500 },
    heading: 0,
    velocity: { x: 0, y: 0 },
    speed: 0,
    maxSpeed: 100,
    shields: { fore: 100, aft: 100, port: 100, starboard: 100, active: true },
    weapons: {
      phasers: { banks: 4, power: 100, online: true },
      torpedoes: { count: 24, loaded: true }
    },
    hull: 100,
    power: { total: 1000, engines: 300, shields: 200, weapons: 200, sensors: 150, life_support: 150 },
    status: 'docked',
    crew: [],
    crewCapacity: 6,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'ship-destiny',
    name: 'Destiny',
    class: 'Warship',
    sector: 'A1',
    position: { x: 300, y: 400 },
    heading: 0,
    velocity: { x: 0, y: 0 },
    speed: 0,
    maxSpeed: 120,
    shields: { fore: 100, aft: 100, port: 100, starboard: 100, active: true },
    weapons: {
      phasers: { banks: 6, power: 100, online: true },
      torpedoes: { count: 36, loaded: true }
    },
    hull: 100,
    power: { total: 1200, engines: 400, shields: 300, weapons: 300, sensors: 100, life_support: 100 },
    status: 'docked',
    crew: [],
    crewCapacity: 6,
    lastUpdated: new Date().toISOString()
  }
];

/**
 * DevDataManager - handles all JSON file read/write operations.
 * This abstraction layer makes it easy to replace with a real database later.
 */
class DevDataManager {
  constructor() {
    try {
      this._ensureDataDir();
      this._ensureDefaultData();
    } catch (err) {
      console.error('[DevDataManager] FATAL ERROR during initialization:', err);
      throw err;
    }
  }

  _ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Seed default data if files are missing or empty.
   * Runs on every startup so Railway's ephemeral filesystem always has base data.
   */
  _ensureDefaultData() {
    // Ships: seed if empty
    const shipsData = this.getShips();
    if (!shipsData || shipsData.ships.length === 0) {
      this._write('ships.json', { ships: DEFAULT_SHIPS.map(s => ({ ...s, lastUpdated: new Date().toISOString() })) });
      console.log('[DevDataManager] Seeded default ships (Horizon, Destiny).');
    }

    // Players: ensure file exists with proper structure
    const playersData = this.getPlayers();
    if (!playersData) {
      this._write('players.json', { players: [], sessions: [] });
    }

    // Communications: ensure hailChats field exists
    const commsData = this.getCommunications();
    if (!commsData.hailChats) {
      commsData.hailChats = {};
      this._write('communications.json', commsData);
    }
  }

  _filePath(filename) {
    return path.join(DATA_DIR, filename);
  }

  _read(filename) {
    const fp = this._filePath(filename);
    if (!fs.existsSync(fp)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[DevDataManager] Error reading ${filename}:`, err.message);
      return null;
    }
  }

  _write(filename, data) {
    const fp = this._filePath(filename);
    try {
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`[DevDataManager] Error writing ${filename}:`, err.message);
      return false;
    }
  }

  // ── Players ──────────────────────────────────────────────────────────────

  getPlayers() {
    return this._read('players.json') || { players: [], sessions: [] };
  }

  getPlayerByUsername(username) {
    const data = this.getPlayers();
    return data.players.find(p => p.username.toLowerCase() === username.toLowerCase()) || null;
  }

  getPlayerById(id) {
    const data = this.getPlayers();
    return data.players.find(p => p.id === id) || null;
  }

  createPlayer(player) {
    const data = this.getPlayers();
    data.players.push(player);
    this._write('players.json', data);
    return player;
  }

  updatePlayer(id, updates) {
    const data = this.getPlayers();
    const idx = data.players.findIndex(p => p.id === id);
    if (idx === -1) return null;
    data.players[idx] = { ...data.players[idx], ...updates };
    this._write('players.json', data);
    return data.players[idx];
  }

  createSession(session) {
    const data = this.getPlayers();
    data.sessions = data.sessions || [];
    // Remove old sessions for this player
    data.sessions = data.sessions.filter(s => s.playerId !== session.playerId);
    data.sessions.push(session);
    this._write('players.json', data);
    return session;
  }

  getSessionByToken(token) {
    const data = this.getPlayers();
    return (data.sessions || []).find(s => s.token === token) || null;
  }

  deleteSession(token) {
    const data = this.getPlayers();
    data.sessions = (data.sessions || []).filter(s => s.token !== token);
    this._write('players.json', data);
  }

  // ── Ships ─────────────────────────────────────────────────────────────────

  getShips() {
    return this._read('ships.json') || { ships: [] };
  }

  getShipById(id) {
    const data = this.getShips();
    return data.ships.find(s => s.id === id) || null;
  }

  getShipsByIds(ids) {
    const data = this.getShips();
    return data.ships.filter(s => ids.includes(s.id));
  }

  getShipsInSector(sectorId) {
    const data = this.getShips();
    return data.ships.filter(s => s.sector === sectorId);
  }

  createShip(ship) {
    const data = this.getShips();
    data.ships.push(ship);
    this._write('ships.json', data);
    return ship;
  }

  updateShip(id, updates) {
    const data = this.getShips();
    const idx = data.ships.findIndex(s => s.id === id);
    if (idx === -1) return null;
    data.ships[idx] = { ...data.ships[idx], ...updates, lastUpdated: new Date().toISOString() };
    this._write('ships.json', data);
    return data.ships[idx];
  }

  deleteShip(id) {
    const data = this.getShips();
    data.ships = data.ships.filter(s => s.id !== id);
    this._write('ships.json', data);
  }

  // ── Sectors ───────────────────────────────────────────────────────────────

  getSectors() {
    return this._read('sectors.json') || { sectors: [] };
  }

  getSectorById(id) {
    const data = this.getSectors();
    return data.sectors.find(s => s.id === id) || null;
  }

  // ── Communications ────────────────────────────────────────────────────────

  getCommunications() {
    return this._read('communications.json') || { crewChats: {}, hailLog: [], hailChats: {}, broadcastLog: [] };
  }

  getCrewChat(shipId) {
    const data = this.getCommunications();
    return data.crewChats[shipId] || [];
  }

  addCrewMessage(shipId, message) {
    const data = this.getCommunications();
    if (!data.crewChats[shipId]) data.crewChats[shipId] = [];
    data.crewChats[shipId].push(message);
    // Keep only last 200 messages per ship
    if (data.crewChats[shipId].length > 200) {
      data.crewChats[shipId] = data.crewChats[shipId].slice(-200);
    }
    this._write('communications.json', data);
    return message;
  }

  // ── Hails ─────────────────────────────────────────────────────────────────

  addHail(hail) {
    const data = this.getCommunications();
    data.hailLog.push(hail);
    if (data.hailLog.length > 500) {
      data.hailLog = data.hailLog.slice(-500);
    }
    this._write('communications.json', data);
    return hail;
  }

  getHailById(id) {
    const data = this.getCommunications();
    return data.hailLog.find(h => h.id === id) || null;
  }

  getHailsForShip(shipId) {
    const data = this.getCommunications();
    return data.hailLog.filter(h => h.fromShipId === shipId || h.toShipId === shipId);
  }

  updateHail(id, updates) {
    const data = this.getCommunications();
    const idx = data.hailLog.findIndex(h => h.id === id);
    if (idx === -1) return null;
    data.hailLog[idx] = { ...data.hailLog[idx], ...updates };
    this._write('communications.json', data);
    return data.hailLog[idx];
  }

  // ── Hail Chat Channels ────────────────────────────────────────────────────

  getHailChat(channelId) {
    const data = this.getCommunications();
    return (data.hailChats || {})[channelId] || [];
  }

  addHailChatMessage(channelId, message) {
    const data = this.getCommunications();
    if (!data.hailChats) data.hailChats = {};
    if (!data.hailChats[channelId]) data.hailChats[channelId] = [];
    data.hailChats[channelId].push(message);
    if (data.hailChats[channelId].length > 200) {
      data.hailChats[channelId] = data.hailChats[channelId].slice(-200);
    }
    this._write('communications.json', data);
    return message;
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  addBroadcast(msg) {
    const data = this.getCommunications();
    data.broadcastLog.push(msg);
    if (data.broadcastLog.length > 500) {
      data.broadcastLog = data.broadcastLog.slice(-500);
    }
    this._write('communications.json', data);
    return msg;
  }

  getBroadcastLog(limit = 50) {
    const data = this.getCommunications();
    return data.broadcastLog.slice(-limit);
  }
}

module.exports = new DevDataManager();
