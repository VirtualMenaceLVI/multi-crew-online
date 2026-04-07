/**
 * api-client.js
 * Abstracted API layer - all server communication goes through here.
 * Swap the BASE_URL or methods to switch to a real backend.
 */

const ApiClient = (() => {
  const BASE_URL = '/api';

  let _sessionToken = null;

  function setToken(token) {
    _sessionToken = token;
    if (token) {
      sessionStorage.setItem('mco_token', token);
    } else {
      sessionStorage.removeItem('mco_token');
    }
  }

  function getToken() {
    if (_sessionToken) return _sessionToken;
    _sessionToken = sessionStorage.getItem('mco_token');
    return _sessionToken;
  }

  async function request(method, path, body = null) {
    const url = `${BASE_URL}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['X-Session-Token'] = token;

    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`[ApiClient] ${method} ${path} failed:`, err.message);
      throw err;
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function login(username, password) {
    const data = await request('POST', '/auth/login', { username, password });
    setToken(data.token);
    return data;
  }

  async function register(username, password, displayName) {
    const data = await request('POST', '/auth/register', { username, password, displayName });
    setToken(data.token);
    return data;
  }

  async function logout() {
    try {
      await request('POST', '/auth/logout');
    } finally {
      setToken(null);
    }
  }

  async function getMe() {
    return request('GET', '/auth/me');
  }

  // ── Ships ─────────────────────────────────────────────────────────────────

  async function getShips() {
    return request('GET', '/ships');
  }

  async function getShip(id) {
    return request('GET', `/ships/${id}`);
  }

  async function getShipsInSector(sectorId) {
    return request('GET', `/ships/sector/${sectorId}`);
  }

  async function createShip(name, shipClass, sector) {
    return request('POST', '/ships', { name, shipClass, sector });
  }

  async function updateShip(id, updates) {
    return request('PATCH', `/ships/${id}`, updates);
  }

  async function joinShip(shipId, station) {
    return request('POST', `/ships/${shipId}/join`, { station });
  }

  async function leaveShip(shipId) {
    return request('POST', `/ships/${shipId}/leave`);
  }

  async function tickShip(shipId, deltaSeconds) {
    return request('POST', `/ships/${shipId}/tick`, { deltaSeconds });
  }

  // ── Sectors ───────────────────────────────────────────────────────────────

  async function getSectors() {
    return request('GET', '/sectors');
  }

  async function getSector(id) {
    return request('GET', `/sectors/${id}`);
  }

  // ── Communications ────────────────────────────────────────────────────────

  async function getCrewChat(shipId) {
    return request('GET', `/comms/crew/${shipId}`);
  }

  async function sendCrewMessage(shipId, text) {
    return request('POST', `/comms/crew/${shipId}`, { text });
  }

  /** Send a hail REQUEST (no message body needed) */
  async function sendHailRequest(fromShipId, toShipId) {
    return request('POST', '/comms/hail', { fromShipId, toShipId });
  }

  async function getHails(shipId) {
    return request('GET', `/comms/hails/${shipId}`);
  }

  /** Respond to a hail: action = 'accept' | 'decline' | 'close' */
  async function respondToHail(hailId, action) {
    return request('POST', `/comms/hail/${hailId}/${action}`);
  }

  async function getHailChat(channelId) {
    return request('GET', `/comms/hail-chat/${channelId}`);
  }

  async function sendHailMessage(channelId, text, shipId) {
    return request('POST', `/comms/hail-chat/${channelId}`, { text, shipId });
  }

  async function getBroadcast(limit = 50) {
    return request('GET', `/comms/broadcast?limit=${limit}`);
  }

  async function sendBroadcast(text, shipId) {
    return request('POST', '/comms/broadcast', { text, shipId });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    setToken, getToken,
    login, register, logout, getMe,
    getShips, getShip, getShipsInSector, createShip, updateShip, joinShip, leaveShip, tickShip,
    getSectors, getSector,
    getCrewChat, sendCrewMessage,
    sendHailRequest, getHails, respondToHail,
    getHailChat, sendHailMessage,
    getBroadcast, sendBroadcast
  };
})();
