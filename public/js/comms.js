/**
 * comms.js
 * Communication system: crew chat, hailing, broadcast log.
 */

const Comms = (() => {
  const POLL_INTERVAL_MS = 2000;
  let _crewPollTimer = null;
  let _hailPollTimer = null;
  let _channelPollTimer = null;

  // ── Crew Chat ─────────────────────────────────────────────────────────────

  async function loadCrewChat(shipId) {
    try {
      const data = await ApiClient.getCrewChat(shipId);
      return data.messages || [];
    } catch (err) {
      console.error('[Comms] loadCrewChat error:', err.message);
      return [];
    }
  }

  async function sendCrewMessage(shipId, text) {
    if (!text || !text.trim()) return null;
    try {
      const data = await ApiClient.sendCrewMessage(shipId, text.trim());
      return data.message;
    } catch (err) {
      UI.showToast('Failed to send message: ' + err.message, 'danger');
      return null;
    }
  }

  // ── Hailing ───────────────────────────────────────────────────────────────

  /** Send a hail REQUEST — no message needed, just opens a request */
  async function sendHailRequest(fromShipId, toShipId) {
    try {
      const data = await ApiClient.sendHailRequest(fromShipId, toShipId);
      UI.showToast(`📡 Hail request sent to ${data.hail.toShipName}`, 'warn');
      return data.hail;
    } catch (err) {
      UI.showToast('Hail failed: ' + err.message, 'danger');
      return null;
    }
  }

  async function getHails(shipId) {
    try {
      const data = await ApiClient.getHails(shipId);
      return data.hails || [];
    } catch {
      return [];
    }
  }

  /** Respond to a hail: action = 'accept' | 'decline' | 'close' */
  async function respondToHail(hailId, action) {
    try {
      return await ApiClient.respondToHail(hailId, action);
    } catch (err) {
      UI.showToast('Failed to respond to hail: ' + err.message, 'danger');
      return null;
    }
  }

  // ── Hail Channel ──────────────────────────────────────────────────────────

  async function getHailChatMessages(channelId) {
    try {
      const data = await ApiClient.getHailChat(channelId);
      return data.messages || [];
    } catch {
      return [];
    }
  }

  async function sendHailMessage(channelId, text, shipId) {
    if (!text || !text.trim()) return null;
    try {
      const data = await ApiClient.sendHailMessage(channelId, text.trim(), shipId);
      return data.message;
    } catch (err) {
      UI.showToast('Failed to send: ' + err.message, 'danger');
      return null;
    }
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  async function getBroadcast() {
    try {
      const data = await ApiClient.getBroadcast(50);
      return data.messages || [];
    } catch {
      return [];
    }
  }

  async function sendBroadcast(text, shipId) {
    try {
      const data = await ApiClient.sendBroadcast(text, shipId);
      return data.message;
    } catch (err) {
      UI.showToast('Broadcast failed: ' + err.message, 'danger');
      return null;
    }
  }

  // ── Chat UI Helpers ───────────────────────────────────────────────────────

  function renderMessages(containerEl, messages, autoScroll = true) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    for (const msg of messages) {
      containerEl.appendChild(createMessageEl(msg));
    }
    if (autoScroll) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
  }

  function appendMessage(containerEl, msg) {
    if (!containerEl) return;
    containerEl.appendChild(createMessageEl(msg));
    containerEl.scrollTop = containerEl.scrollHeight;
  }

  function createMessageEl(msg) {
    const el = document.createElement('div');
    el.className = 'comms-message ' + (msg.type || 'crew');
    el.dataset.msgId = msg.id;
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<span class="sender">${_escapeHtml(msg.displayName || msg.fromShipName || 'SYSTEM')}</span>${_escapeHtml(msg.text)}<span class="time">${time}</span>`;
    return el;
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Crew Chat Polling ─────────────────────────────────────────────────────

  function startPolling(shipId, onNewMessages) {
    stopPolling();
    let lastCount = 0;

    _crewPollTimer = setInterval(async () => {
      const ship = GameState.getCurrentShip();
      if (!ship) return;
      try {
        const messages = await loadCrewChat(ship.id);
        if (messages.length > lastCount) {
          const newMsgs = messages.slice(lastCount);
          lastCount = messages.length;
          onNewMessages && onNewMessages(newMsgs);
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (_crewPollTimer) { clearInterval(_crewPollTimer); _crewPollTimer = null; }
  }

  // ── Hail Polling ──────────────────────────────────────────────────────────

  /**
   * Poll hails for a ship and fire callbacks on state changes.
   * callbacks: { onRefreshIncoming, onNewIncoming, onAccepted, onDeclined, onChannelClosed }
   */
  function startHailPolling(shipId, callbacks) {
    stopHailPolling();
    const { onRefreshIncoming, onNewIncoming, onAccepted, onDeclined, onChannelClosed } = callbacks || {};
    const _seenIds = new Set();

    _hailPollTimer = setInterval(async () => {
      try {
        const data = await ApiClient.getHails(shipId);
        const hails = data.hails || [];

        // Incoming pending requests for this ship
        const incoming = hails.filter(h => h.toShipId === shipId && h.status === 'pending');
        onRefreshIncoming && onRefreshIncoming(incoming);

        for (const h of incoming) {
          if (!_seenIds.has('in_' + h.id)) {
            _seenIds.add('in_' + h.id);
            onNewIncoming && onNewIncoming(h);
          }
        }

        for (const h of hails) {
          // Our sent hail was accepted
          if (h.fromShipId === shipId && h.status === 'accepted' && !_seenIds.has('acc_' + h.id)) {
            _seenIds.add('acc_' + h.id);
            onAccepted && onAccepted(h);
          }
          // Our sent hail was declined
          if (h.fromShipId === shipId && h.status === 'declined' && !_seenIds.has('dec_' + h.id)) {
            _seenIds.add('dec_' + h.id);
            onDeclined && onDeclined(h);
          }
          // Active channel closed by other side
          if (h.status === 'closed' && !_seenIds.has('clo_' + h.id)) {
            _seenIds.add('clo_' + h.id);
            onChannelClosed && onChannelClosed(h);
          }
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  function stopHailPolling() {
    if (_hailPollTimer) { clearInterval(_hailPollTimer); _hailPollTimer = null; }
  }

  // ── Channel Polling ───────────────────────────────────────────────────────

  function startChannelPolling(channelId, startCount, onNewMessages) {
    stopChannelPolling();
    let lastCount = startCount || 0;

    _channelPollTimer = setInterval(async () => {
      try {
        const data = await ApiClient.getHailChat(channelId);
        const messages = data.messages || [];
        if (messages.length > lastCount) {
          const newMsgs = messages.slice(lastCount);
          lastCount = messages.length;
          onNewMessages && onNewMessages(newMsgs);
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  function stopChannelPolling() {
    if (_channelPollTimer) { clearInterval(_channelPollTimer); _channelPollTimer = null; }
  }

  return {
    loadCrewChat, sendCrewMessage,
    sendHailRequest, getHails, respondToHail,
    getHailChatMessages, sendHailMessage,
    getBroadcast, sendBroadcast,
    renderMessages, appendMessage,
    startPolling, stopPolling,
    startHailPolling, stopHailPolling,
    startChannelPolling, stopChannelPolling
  };
})();
