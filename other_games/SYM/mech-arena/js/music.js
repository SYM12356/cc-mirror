'use strict';
/* ============================================================
 * 程序化背景音乐（WebAudio 合成，无音频文件）
 * 菜单曲：柔和电子氛围；战斗曲：激昂节拍
 * ============================================================ */

const Music = {
  ctx: null,
  master: null,
  enabled: true,
  mode: null,          // 'menu' | 'battle'
  timer: null,
  nextNote: 0,
  step: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);
  },

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      /* 立即静音（已排程音符会继续但无声）并停止调度 */
      if (this.master) this.master.gain.value = 0;
      this.stop();
    } else {
      /* 恢复音量并重启之前的模式 */
      if (this.master) this.master.gain.value = Progress.settings.volume * 0.24;
      if (this.lastMode && this.ctx) this.start(this.lastMode);
    }
  },

  setVolume(v) {
    if (this.master) this.master.gain.value = v * 0.24;
  },

  start(mode) {
    if (!this.ctx || !this.enabled) return;
    if (this.mode === mode && this.timer) return;
    this.stop();
    this.lastMode = mode;
    this.mode = mode;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.scheduler(), 50);
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.mode = null;
  },

  stepDur() {
    return this.mode === 'battle' ? 60 / 132 / 2 : 60 / 84 / 2;
  },

  scheduler() {
    if (!this.ctx) return;
    /* 后台切回：丢弃积压音符，防一次性补排大量 oscillator */
    if (this.nextNote < this.ctx.currentTime - 1) {
      this.nextNote = this.ctx.currentTime + 0.12;
    }
    const horizon = this.ctx.currentTime + 0.35;
    while (this.nextNote < horizon) {
      if (this.mode === 'menu') this.menuStep(this.step, this.nextNote);
      else this.battleStep(this.step, this.nextNote);
      this.step++;
      this.nextNote += this.stepDur();
    }
  },

  /* ---------- 音色 ---------- */
  note(freq, t, dur, type = 'sine', vol = 0.4, slideTo = null) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noiseHit(t, dur, vol, filterFreq = 3000) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  /* ---------- 菜单曲（Am F C G 琶音 + 低音 pad） ---------- */
  menuStep(step, t) {
    const chords = [
      [110, 130.8, 164.8],   // Am
      [87.3, 110, 130.8],    // F
      [98, 123.5, 146.8],    // C
      [98, 123.5, 196]       // G
    ];
    const bar = Math.floor(step / 8) % 4;
    const ch = chords[bar];
    const i = step % 8;

    /* 琶音 */
    if (i % 2 === 0) {
      const idx = Math.floor(i / 2);
      const f = ch[idx % 3] * (idx >= 3 ? 2 : 1);
      this.note(f, t, 0.55, 'sine', 0.32);
    }
    /* 每小节开始的 pad */
    if (i === 0) {
      for (const f of ch) this.note(f / 2, t, 3.8, 'triangle', 0.12);
      this.note(ch[0] * 2, t, 2.4, 'sine', 0.08, ch[0] * 4);   // 顶部泛音
    }
  },

  /* ---------- 战斗曲（鼓 + 贝斯 + 琶音） ---------- */
  battleStep(step, t) {
    const b = step % 8;
    const bar = Math.floor(step / 8) % 4;
    const bassRoot = [55, 43.65, 65.4, 49][bar];   // A1 F1 C2 G1

    /* 鼓：底鼓 0/4，军鼓 4，镲片偶数拍 */
    if (b === 0 || b === 4) this.note(90, t, 0.18, 'sine', 0.55, 38);
    if (b === 4) this.noiseHit(t, 0.12, 0.22, 2200);
    if (b % 2 === 0) this.noiseHit(t, 0.04, 0.06, 8000);

    /* 贝斯：八分音符 */
    this.note(bassRoot, t, 0.22, 'sawtooth', 0.2);
    if (b === 6) this.note(bassRoot * 2, t, 0.14, 'sawtooth', 0.14);

    /* 琶音旋律（小调五声音阶） */
    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    if (b % 2 === 0) {
      const n = scale[(bar * 3 + Math.floor(b / 2)) % scale.length];
      this.note(n, t, 0.18, 'square', 0.06);
      this.note(n * 2, t, 0.14, 'square', 0.03);
    }
  }
};

/* 加载完成后应用存档中的音乐设置 */
if (typeof Progress !== 'undefined') {
  Music.enabled = !!Progress.settings.music;
  Music.setVolume(Progress.settings.volume);
}
