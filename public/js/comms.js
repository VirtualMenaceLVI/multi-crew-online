/**
 * comms.js
 * Communication system: crew chat, hailing, broadcast log.
 */

const Comms = (() => {
  const POLL_INTERVAL_MS = 2000;
  let _pollTimer = null;
  let _lastMessageId = null;

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

  async function sendHail(fromShipId, toShipId, text) {
    if (!text || !text.trim()) return null;
    try {
      const data = await ApiClient.sendHail(fromShipId, toShipId, text.trim());
      UI.showToast(`Hailing ${data.hail.toShipName}...`, 'info');
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

  /**
   * Render messages into a container element.
   */
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

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPolling(shipId, onNewMessages) {
    stopPolling();
    let lastCount = 0;

    _pollTimer = setInterval(async () => {
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
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  return {
    loadCrewChat, sendCrewMessage,
    sendHail, getHails,
    getBroadcast, sendBroadcast,
    renderMessages, appendMessage,
    startPolling, stopPolling
  };
})();
