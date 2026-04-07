/**
 * sound-manager.js
 * Trek sound system.
 *
 * Primary sources: trekcore.com/audio (royalty-free archive)
 * Fallback:        Web Audio API synthesised tones (always available)
 *
 * Usage: SoundManager.play('beep'), SoundManager.play('warp'), etc.
 */

const SoundManager = (() => {
  let _muted   = false;
  let _volume  = 0.45;
  let _audioCtx = null;

  // ── Trekcore audio URLs ───────────────────────────────────────────────────
  // These are loaded lazily with HTML5 Audio (no CORS required for playback).
  // If a file is unavailable the Web Audio fallback kicks in automatically.
  const TREK_URLS = {
    beep:        'https://trekcore.com/audio/computers/computerbeep1.mp3',
    beep2:       'https://trekcore.com/audio/computers/computerbeep5.mp3',
    warp:        'https://trekcore.com/audio/tng/tng_warp_engage.mp3',
    redAlert:    'https://trekcore.com/audio/tng/tng_red_alert.mp3',
    yellowAlert: 'https://trekcore.com/audio/tng/tng_yellow_alert.mp3',
    shields:     'https://trekcore.com/audio/tng/tng_shields_up.mp3',
    docking:     'https://trekcore.com/audio/ds9/ds9_docking_clamps.mp3',
    hail:        'https://trekcore.com/audio/tng/tng_hailing.mp3',
    phasers:     'https://trekcore.com/audio/tng/tng_phasers.mp3',
  };

  const _elements = {};   // HTMLAudioElement cache
  const _failed   = {};   // mark URLs that errored so we skip to synth

  // ── Lazy Audio element loader ─────────────────────────────────────────────

  function _getAudio(name) {
    if (_failed[name]) return null;
    if (!_elements[name]) {
      const url = TREK_URLS[name];
      if (!url) return null;
      const el = new Audio(url);
      el.volume = _volume;
      el.addEventListener('error', () => { _failed[name] = true; });
      _elements[name] = el;
    }
    return _elements[name];
  }

  // ── Web Audio context (created on first user interaction) ─────────────────

  function _ctx() {
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { /* audio not supported */ }
    }
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  }

  // Resume on first gesture (browser policy)
  document.addEventListener('click', () => _ctx(), { once: true });

  // ── Public: play ──────────────────────────────────────────────────────────

  function play(name) {
    if (_muted) return;
    const el = _getAudio(name);
    if (el && !_failed[name]) {
      el.volume = _volume;
      el.currentTime = 0;
      el.play().catch(() => {
        _failed[name] = true;
        _synth(name);
      });
    } else {
      _synth(name);
    }
  }

  // ── Web Audio synthesised fallback sounds ─────────────────────────────────

  function _synth(name) {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    try {
      switch (name) {
        case 'beep':        _tone(ctx, 880,  0.08, 'sine',     _volume * 0.4); break;
        case 'beep2':       _tone(ctx, 660,  0.06, 'sine',     _volume * 0.3); break;
        case 'warp':        _warpSynth(ctx);   break;
        case 'redAlert':    _alertSynth(ctx, 820, 3);   break;
        case 'yellowAlert': _alertSynth(ctx, 640, 2);   break;
        case 'shields':     _shieldSynth(ctx); break;
        case 'docking':     _dockSynth(ctx);   break;
        case 'hail':        _hailSynth(ctx);   break;
        case 'phasers':     _phaserSynth(ctx); break;
        default:            _tone(ctx, 880,  0.08, 'sine', _volume * 0.4);
      }
    } catch (e) { /* ignore */ }
  }

  function _tone(ctx, freq, dur, type, vol) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.01);
  }

  function _warpSynth(ctx) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.55);
    gain.gain.setValueAtTime(_volume * 0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
  }

  function _alertSynth(ctx, freq, pulses) {
    for (let i = 0; i < pulses; i++) {
      const t = ctx.currentTime + i * 0.38;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(_volume * 0.25, t + 0.02);
      gain.gain.setValueAtTime(_volume * 0.25, t + 0.18);
      gain.gain.linearRampToValueAtTime(0, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  function _shieldSynth(ctx) {
    [500, 630, 780].forEach((f, i) => {
      setTimeout(() => _tone(ctx, f, 0.25, 'triangle', _volume * 0.3), i * 90);
    });
  }

  function _dockSynth(ctx) {
    [350, 450, 560, 450].forEach((f, i) => {
      setTimeout(() => _tone(ctx, f, 0.12, 'sine', _volume * 0.25), i * 120);
    });
  }

  function _hailSynth(ctx) {
    [660, 880, 660].forEach((f, i) => {
      setTimeout(() => _tone(ctx, f, 0.1, 'sine', _volume * 0.3), i * 130);
    });
  }

  function _phaserSynth(ctx) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(_volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  }

  // ── Volume / mute ─────────────────────────────────────────────────────────

  function setVolume(vol) {
    _volume = Math.max(0, Math.min(1, vol));
    for (const el of Object.values(_elements)) el.volume = _volume;
  }

  function setMuted(muted) { _muted = !!muted; }
  function isMuted()        { return _muted; }
  function getVolume()      { return _volume; }

  return { play, setVolume, setMuted, isMuted, getVolume };
})();
