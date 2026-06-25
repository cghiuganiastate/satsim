/**
 * soundManager.js
 *
 * Plays thruster audio built from two layers:
 *   1. STARTUP  — a short one-shot ignition transient that fires the moment a
 *                 thruster begins firing (off -> on).
 *   2. LOOP     — a continuous roar that starts right after the startup and
 *                 keeps playing while at least one thruster remains active,
 *                 fading out when the last thruster shuts down.
 *
 * Sounds are synthesized procedurally with the Web Audio API so the manager
 * works with no external assets. To use real audio files instead, pass
 * `startupUrl` and/or `loopUrl` in the constructor options; those files will be
 * loaded and used in place of the synthesized versions.
 *
 * Browsers block audio until a user gesture occurs, so the AudioContext is
 * created lazily on the first thruster activation (which is driven by keyboard
 * input). The manager is otherwise inert.
 */

export class SoundManager {
  /**
   * @param {object} [options]
   * @param {number} [options.volume=0.35]  Master volume (0..1).
   * @param {string} [options.startupUrl]   Optional URL to a startup sound file.
   * @param {string} [options.loopUrl]      Optional URL to a looping fire sound file.
   */
  constructor(options = {}) {
    this.options = {
      volume: 0.35,
      startupUrl: null,
      loopUrl: null,
      ...options
    };

    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.masterGain = null;

    // Decoded audio buffers for file-based sounds (null = synthesize).
    this.startupBuffer = null;
    this.loopBuffer = null;

    // Shared procedural noise buffer reused for the continuous loop.
    this.noiseBuffer = null;

    // Live nodes for the continuous firing sound.
    this.loopSource = null;
    this.loopGain = null;
    this.loopLfo = null;

    // Global count of currently-active thrusters. The loop runs while > 0 and
    // the startup transient plays only on the 0 -> 1 transition, so any number
    // of thrusters share one cohesive engine sound instead of overlapping.
    this.activeCount = 0;

    this.enabled = true;
    this.initialized = false;
    this.loadingPromise = null;
  }

  /**
   * Creates the AudioContext, master gain, and procedural noise buffer, then
   * begins loading any configured audio files. Safe to call repeatedly.
   */
  async init() {
    if (this.initialized) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      console.warn('SoundManager: Web Audio API is not available.');
      return;
    }

    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.options.volume;
    this.masterGain.connect(this.ctx.destination);

    this.noiseBuffer = this._createPinkNoiseBuffer(2);

    // Load optional real audio files in the background.
    const loads = [];
    if (this.options.startupUrl) {
      loads.push(
        this._loadBuffer(this.options.startupUrl)
          .then(buf => { this.startupBuffer = buf; })
          .catch(err => console.warn('SoundManager: startup sound failed to load,', err))
      );
    }
    if (this.options.loopUrl) {
      loads.push(
        this._loadBuffer(this.options.loopUrl)
          .then(buf => { this.loopBuffer = buf; })
          .catch(err => console.warn('SoundManager: loop sound failed to load,', err))
      );
    }
    if (loads.length) this.loadingPromise = Promise.all(loads);

    this.initialized = true;
  }

  /** Resumes a suspended AudioContext (e.g. after the tab regained focus). */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) { /* ignore */ }
    }
  }

  /** Globally enable/disable the manager. Disabling stops all active sound. */
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.stopAll();
  }

  /** Sets the master volume with a short smoothing ramp. */
  setVolume(v) {
    this.options.volume = Math.min(1, Math.max(0, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.options.volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Per-thruster state-change hook, mirroring the simulation's
   * `setThrusterActive(thruster, active)`. Maintains the global active count
   * and triggers the startup transient + continuous loop as needed.
   *
   * @param {object} _thruster - The thruster object (unused; sound is global).
   * @param {boolean} wasActive - Whether the thruster was active before.
   * @param {boolean} active - Whether the thruster is active now.
   */
  async setThrusterActive(_thruster, wasActive, active) {
    if (!this.enabled) return;

    await this.init();
    await this.resume();
    if (!this.ctx) return;
    if (this.loadingPromise) await this.loadingPromise;

    if (active && !wasActive) {
      // Always (re)play the startup transient so the pilot hears each new
      // thruster ignite, even while others are already firing. The continuous
      // loop only starts/stops on the first/last thruster.
      const wasFirst = this.activeCount === 0;
      this.activeCount++;
      if (wasFirst) {
        this._startFiring(); // startup transient + continuous loop
      } else {
        this._playStartup(); // retrigger ignition transient only
      }
    } else if (!active && wasActive) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      if (this.activeCount === 0) this._stopFiring();
    }
  }

  /** Begins the two-layer thruster sound: startup transient + continuous loop. */
  _startFiring() {
    if (!this.ctx) return;
    this._playStartup();
    this._startLoop();
  }

  /** Stops the continuous loop (called when the last thruster deactivates). */
  _stopFiring() {
    this._stopLoop();
  }

  /**
   * Plays the one-shot startup transient. Uses a decoded file if available,
   * otherwise synthesizes a filtered noise burst layered with a sub-bass thump.
   */
  _playStartup() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = this.startupBuffer ? this.startupBuffer.duration : 0.5;

    const source = ctx.createBufferSource();
    source.buffer = this.startupBuffer || this._createWhiteNoiseBuffer(duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    if (this.startupBuffer) {
      gain.gain.value = 1;
    } else {
      // Procedural envelope: fast attack, exponential decay.
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.9, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    }

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + duration + 0.05);

    // Layer a sub-bass "thump" for a weightier ignition (procedural mode only).
    if (!this.startupBuffer) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.25);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.0001, now);
      oscGain.gain.linearRampToValueAtTime(0.7, now + 0.012);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  }

  /**
   * Starts the continuous firing hiss. Uses a decoded, looping file if
   * available, otherwise loops a pink-noise buffer through a highpass + gentle
   * lowpass for a steady, constant "gas jet" hiss (no pulsing/LFO).
   */
  _startLoop() {
    if (this.loopSource || !this.ctx) return; // already playing
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.loopBuffer || this.noiseBuffer;
    source.loop = true;

    // Steady "low hiss": pink noise through a highpass (cuts the rumbly
    // locomotive low end) and a gentle lowpass (keeps it airy, not harsh).
    // No LFO modulation — the sound stays constant while firing.
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 500;
    highpass.Q.value = 0.5;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2000;
    lowpass.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.08);

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.loopSource = source;
    this.loopGain = gain;
    this.loopLfo = null;
  }

  /** Fades out and tears down the continuous loop. */
  _stopLoop() {
    if (!this.loopSource || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const fade = 0.12;

    this.loopGain.gain.cancelScheduledValues(now);
    this.loopGain.gain.setValueAtTime(this.loopGain.gain.value, now);
    this.loopGain.gain.linearRampToValueAtTime(0, now + fade);

    const stopAt = now + fade + 0.05;
    try { this.loopSource.stop(stopAt); } catch (_) { /* already stopped */ }

    this.loopSource = null;
    this.loopGain = null;
  }

  /** Immediately silences everything and resets the active count. */
  stopAll() {
    this.activeCount = 0;
    this._stopLoop();
    this._lastCollisionTime = 0;
  }

  /**
   * Plays a one-shot collision/impact sound scaled by the strength of the hit.
   * Synthesizes a metallic "clank": a short filtered-noise crack layered with a
   * couple of detuned oscillators (the metallic ring) and a sub-bass thump for
   * weight. Louder impacts raise both the volume and the brightness/ring time.
   *
   * A short cooldown prevents spamming from resting/sliding contacts that emit
   * many low-velocity collide events per second.
   *
   * @param {number} [intensity=1]  Relative strength 0..1 (typically derived
   *                                from the impact velocity along the normal).
   */
  async playCollision(intensity = 1) {
    if (!this.enabled) return;

    await this.init();
    await this.resume();
    if (!this.ctx) return;
    if (this.loadingPromise) await this.loadingPromise;

    // Cooldown so continuous scraping/sliding doesn't machine-gun the sound.
    const now = this.ctx.currentTime;
    const COLLISION_COOLDOWN = 0.08; // seconds
    if (this._lastCollisionTime && now - this._lastCollisionTime < COLLISION_COOLDOWN) {
      return;
    }
    this._lastCollisionTime = now;

    // Clamp + shape the intensity into a usable 0..1 range.
    const i = Math.min(1, Math.max(0.08, intensity));
    const level = 0.15 + i * 0.85; // map to a reasonable audible range

    // --- Layer 1: filtered noise crack (the initial "snap" of the impact) ---
    const noiseDur = 0.12;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createWhiteNoiseBuffer(noiseDur);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    // Brighter, louder cracks for harder hits.
    noiseFilter.frequency.value = 1200 + i * 2600;
    noiseFilter.Q.value = 0.7;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.9 * level, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + noiseDur + 0.02);

    // --- Layer 2: metallic ring (two detuned square/triangle oscillators) ---
    // Slightly detuned partials give the characteristic "metal" timbre.
    const ringDur = 0.18 + i * 0.35; // harder hits ring longer
    const baseFreq = 180 + i * 120;

    [1.0, 1.51].forEach((mult, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'square';
      osc.frequency.value = baseFreq * mult;

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.0001, now);
      oscGain.gain.linearRampToValueAtTime(0.5 * level, now + 0.006);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + ringDur);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + ringDur + 0.02);
    });

    // --- Layer 3: sub-bass thump (weight, only on harder hits) ---
    if (i > 0.25) {
      const thumpDur = 0.22;
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, now);
      sub.frequency.exponentialRampToValueAtTime(45, now + 0.18);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.7 * level, now + 0.01);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + thumpDur);

      sub.connect(subGain);
      subGain.connect(this.masterGain);
      sub.start(now);
      sub.stop(now + thumpDur + 0.02);
    }
  }

  /**
   * Loads and decodes an audio file into an AudioBuffer.
   * @param {string} url
   * @returns {Promise<AudioBuffer>}
   */
  async _loadBuffer(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const arrayBuffer = await resp.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  /** Generates a buffer of white noise (uniformly distributed). */
  _createWhiteNoiseBuffer(seconds) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * Generates a buffer of pink noise (1/f power spectrum). Pink noise sounds
   * smoother and more like a steady gas hiss than white (harsh) or brown
   * (rumbly) noise. Uses Paul Kellet's well-known filter approximation.
   */
  _createPinkNoiseBuffer(seconds) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.11; // normalize to roughly [-1, 1]
    }
    return buffer;
  }
}