'use strict';
/* ============================================================
 * 音效：WebAudio 程序化生成，无外部资源
 * ============================================================ */

const SFX = {
  ctx: null,
  master: null,
  noiseBuf: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise();
  },

  setVolume(v) {
    if (!this.master) return;
    this.master.gain.value = U.clamp(v, 0, 1) * 0.5;
  },

  makeNoise() {
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  /* 基础音色 */
  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },

  noise(dur, vol = 0.3, filterFreq = 2000, delay = 0) {
    if (!this.ctx || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  /* ---------- 游戏音效 ---------- */
  shoot(type) {
    switch (type) {
      case 'minigun': this.tone(880, 0.07, 'square', 0.12, 320); break;
      case 'laser':   this.tone(1400, 0.09, 'sawtooth', 0.15, 700); break;
      case 'shotgun': this.noise(0.18, 0.28, 1200); this.tone(180, 0.16, 'square', 0.2, 60); break;
      case 'missile': this.noise(0.3, 0.2, 2500); this.tone(400, 0.22, 'sawtooth', 0.15, 120); break;
      case 'plasma':  this.tone(240, 0.3, 'sine', 0.3, 60); this.noise(0.2, 0.1, 900); break;
      case 'grenade': this.tone(300, 0.2, 'square', 0.2, 90); break;
    }
  },

  explode(big = false) {
    this.noise(big ? 0.7 : 0.4, big ? 0.5 : 0.32, big ? 700 : 1200);
    this.tone(big ? 70 : 110, big ? 0.6 : 0.35, 'sine', big ? 0.5 : 0.35, 30);
  },

  robotHit() { this.tone(160, 0.12, 'sawtooth', 0.22, 80); this.noise(0.1, 0.12, 1600); },

  pickup() {
    this.tone(660, 0.09, 'sine', 0.25);
    this.tone(990, 0.12, 'sine', 0.25, null, 0.07);
  },

  skill(name) {
    switch (name) {
      case 'dash':  this.noise(0.22, 0.25, 3000); this.tone(500, 0.2, 'sawtooth', 0.15, 900); break;
      case 'shield': this.tone(300, 0.4, 'sine', 0.25, 500); this.tone(450, 0.4, 'sine', 0.15, 700, 0.08); break;
      case 'emp':   this.tone(120, 0.5, 'sawtooth', 0.3, 30); this.tone(1800, 0.3, 'sine', 0.12, 100, 0.1); break;
      case 'nuke':  this.tone(80, 1.0, 'sine', 0.45, 25); this.noise(0.9, 0.5, 500, 0.6); break;
    }
  },

  count() { this.tone(520, 0.12, 'square', 0.25); },
  go()    { this.tone(780, 0.25, 'square', 0.3); this.tone(1040, 0.3, 'square', 0.2, null, 0.1); },
  win() {
    this.tone(523, 0.15, 'square', 0.25); this.tone(659, 0.15, 'square', 0.25, null, 0.12);
    this.tone(784, 0.3, 'square', 0.28, null, 0.24); this.tone(1046, 0.5, 'square', 0.22, null, 0.36);
  },
  lose() {
    this.tone(392, 0.25, 'sawtooth', 0.22); this.tone(311, 0.25, 'sawtooth', 0.22, null, 0.22);
    this.tone(233, 0.5, 'sawtooth', 0.24, null, 0.44);
  }
};

/* 应用存档中的音量/特效设置（SFX 定义完成后调用） */
if (typeof Progress !== 'undefined') Progress.applySettings();
