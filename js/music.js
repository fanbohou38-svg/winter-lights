/* ============================================================
   music.js — 背景音乐引擎（双模式）
   ① 文件模式：用户上传本地音频（MP3 / OGG / WAV 等），
      HTMLAudioElement 循环播放 —— 用于播放自己拥有的正版歌曲
   ② 合成模式：Web Audio API 程序化圣诞八音盒 + 暖 Pad 合成器
      （公版曲目《Silent Night》，零音频文件，作为未上传时的默认）
   - 程序化卷积混响、前瞻式调度、淡入淡出平滑启停
   ============================================================ */

const BPM_BEAT = 0.52;          // 每拍秒数（优雅的 3/4 拍圆舞曲速度）
const midi2freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* 《平安夜》主旋律：[起始拍, MIDI 音高, 时值(拍)]（C 调） */
const MELODY = [
  [0, 67, 1.5], [1.5, 69, 0.5], [2, 67, 1], [3, 64, 3],
  [6, 67, 1.5], [7.5, 69, 0.5], [8, 67, 1], [9, 64, 3],
  [12, 74, 2], [14, 74, 1], [15, 71, 3],
  [18, 72, 2], [20, 72, 1], [21, 67, 3],
  [24, 69, 2], [26, 69, 1], [27, 72, 1.5], [28.5, 71, 0.5], [29, 69, 1],
  [30, 67, 1.5], [31.5, 69, 0.5], [32, 67, 1], [33, 64, 3],
  [36, 69, 2], [38, 69, 1], [39, 72, 1.5], [40.5, 71, 0.5], [41, 69, 1],
  [42, 67, 1.5], [43.5, 69, 0.5], [44, 67, 1], [45, 64, 3],
  [48, 74, 2], [50, 74, 1], [51, 77, 1.5], [52.5, 74, 0.5], [53, 71, 1], [54, 72, 3],
  [57, 72, 1.5], [58.5, 76, 0.5], [59, 72, 1], [60, 67, 1.5], [61.5, 64, 0.5], [62, 67, 1],
  [63, 65, 2], [65, 62, 1], [66, 60, 3]
];

/* 每小节（3 拍）和弦铺垫：C / G / F 三和弦 + 低音 */
const CHORD_C = { bass: 36, notes: [48, 52, 55] };  // C  E  G
const CHORD_G = { bass: 31, notes: [43, 50, 59] };  // G  D  B
const CHORD_F = { bass: 29, notes: [41, 48, 57] };  // F  C  A
const CHORDS_PER_BAR = [
  CHORD_C, CHORD_C, CHORD_C, CHORD_C,
  CHORD_G, CHORD_C, CHORD_F, CHORD_C,
  CHORD_F, CHORD_C, CHORD_C, CHORD_C,
  CHORD_G, CHORD_G, CHORD_C, CHORD_C,
  CHORD_C, CHORD_C, CHORD_F, CHORD_G,
  CHORD_C, CHORD_C, CHORD_F, CHORD_C,
  CHORD_C, CHORD_C, CHORD_C, CHORD_C
];
const LOOP_BEATS = CHORDS_PER_BAR.length * 3 + 6;  // 曲末留 6 拍呼吸

export class MusicEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.wet = null;
    this.playing = false;
    this.volume = 0.7;
    this._loopTimer = null;
    this._sparkTimer = null;
    this._wasPlaying = false;   // 页面切后台前是否在播放
    /* 文件模式状态 */
    this.audioEl = null;        // HTMLAudioElement（上传的本地音乐）
    this._objUrl = null;
    this._fadeTimer = null;
    this.onError = null;        // 由 main.js 注入 toast 回调
  }

  /* 当前模式：'file'（本地/内置音乐）| 'synth'（内置合成八音盒） */
  get mode() { return this.audioEl ? 'file' : 'synth'; }

  /** 上传本地音乐文件（纯本地播放，绝不上传服务器）
   *  返回 true 成功；格式不支持返回 false */
  async loadFile(file) {
    if (!file) return false;
    if (!/^audio\//.test(file.type) && !/\.(mp3|ogg|wav|flac|m4a|aac)$/i.test(file.name)) {
      if (this.onError) this.onError('仅支持音频文件（MP3 / OGG / WAV 等）');
      return false;
    }
    if (this._objUrl) URL.revokeObjectURL(this._objUrl);
    this._objUrl = URL.createObjectURL(file);
    return this._openSource(this._objUrl);
  }

  /** 加载内置默认曲目（项目内相对路径，如 './assets/audio/last-christmas.mp3'） */
  async loadUrl(url) {
    return this._openSource(encodeURI(url));
  }

  /** 打开音源：替换 Audio 元素，等待元数据就绪；失败时清理并回退合成模式 */
  _openSource(src) {
    // 先停掉当前播放，再替换音源
    this.stop();
    this._disposeFile(false);
    return new Promise((resolve) => {
      const el = new Audio();
      el.src = src;
      el.loop = true;                       // 循环播放
      el.preload = 'metadata';
      el.volume = this.volume;
      let settled = false;
      el.addEventListener('loadedmetadata', () => {
        settled = true;
        this.audioEl = el;
        resolve(true);
      }, { once: true });
      el.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        if (this.onError) this.onError('音频加载失败，将使用内置八音盒旋律');
        el.src = '';
        resolve(false);
      }, { once: true });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          if (this.onError) this.onError('音频加载超时，将使用内置八音盒旋律');
          el.src = '';
          resolve(false);
        }
      }, 10000);
      el.load();
    });
  }

  _disposeFile(clearUrl = true) {
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ''; this.audioEl = null; }
    if (clearUrl && this._objUrl) { URL.revokeObjectURL(this._objUrl); this._objUrl = null; }
    this.playing = false;
  }

  /** 元素音量平滑淡入 / 淡出（文件模式专用） */
  _fadeElement(el, target, step = 0.06, ms = 60) {
    clearInterval(this._fadeTimer);
    this._fadeTimer = setInterval(() => {
      const d = target - el.volume;
      if (Math.abs(d) <= step) {
        el.volume = Math.max(0, Math.min(1, target));
        clearInterval(this._fadeTimer);
        this._fadeTimer = null;
        if (target === 0) el.pause();
        return;
      }
      el.volume = Math.max(0, Math.min(1, el.volume + Math.sign(d) * step));
    }, ms);
  }

  /** 惰性创建 AudioContext（必须由用户手势触发） */
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // 程序化卷积混响：2.6s 指数衰减立体声脉冲响应
    const len = Math.floor(this.ctx.sampleRate * 2.6);
    const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = ir;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.35;
    this.wet.connect(conv);
    conv.connect(this.master);
  }

  /** 每次循环整体前瞻调度，结束时自动续排下一轮 */
  _scheduleLoopAt(t0) {
    const beat = BPM_BEAT;
    // 八音盒旋律
    for (const [b, m, d] of MELODY) {
      this._musicBox(t0 + b * beat, midi2freq(m), d * beat);
    }
    // Pad 和弦（每小节一次）
    CHORDS_PER_BAR.forEach((ch, bar) => {
      this._pad(t0 + bar * 3 * beat, ch, 3 * beat * 1.15);
    });
    // 末尾留白后续排下一轮
    const loopDur = LOOP_BEATS * beat;
    this._loopTimer = setTimeout(() => {
      if (this.playing) this._scheduleLoopAt(t0 + loopDur);
    }, Math.max(100, (t0 + loopDur - this.ctx.currentTime - 0.8) * 1000));
    // 星光铃音：随机高位五声音阶点缀
    const spark = () => {
      if (!this.playing) return;
      const notes = [79, 81, 84, 86];
      this._bell(this.ctx.currentTime + 0.05, midi2freq(notes[(Math.random() * notes.length) | 0]), 0.06);
      this._sparkTimer = setTimeout(spark, 2800 + Math.random() * 3800);
    };
    if (!this._sparkTimer) this._sparkTimer = setTimeout(spark, 1600);
  }

  /** 八音盒音色：正弦基频 + 4 倍频泛音，快起音长衰减 */
  _musicBox(t, freq, dur) {
    const g = this.ctx.createGain();
    g.connect(this.master);
    g.connect(this.wet);
    const peak = 0.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur * 1.3, 1.4));

    const o1 = this.ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = freq;
    o1.connect(g);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine'; o2.frequency.value = freq * 4;   // 八音盒金属泛音
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.18;
    o2.connect(g2); g2.connect(g);
    o1.start(t); o2.start(t);
    const end = t + Math.max(dur * 1.4, 1.6);
    o1.stop(end); o2.stop(end);
  }

  /** 暖 Pad：双振荡器轻微失谐 + 慢起音慢释放 */
  _pad(t, chord, dur) {
    for (const m of [...chord.notes, chord.bass]) {
      const f = midi2freq(m);
      const g = this.ctx.createGain();
      g.connect(this.master);
      g.connect(this.wet);
      const peak = m === chord.bass ? 0.075 : 0.05;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
      g.gain.setValueAtTime(peak, t + dur * 0.75);
      g.gain.linearRampToValueAtTime(0, t + dur * 1.25);

      for (const detune of [-4, 4]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = detune;
        o.connect(g);
        o.start(t); o.stop(t + dur * 1.3);
      }
    }
  }

  /** 高位星光铃音 */
  _bell(t, freq, vol) {
    const g = this.ctx.createGain();
    g.connect(this.master);
    g.connect(this.wet);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = freq;
    o.connect(g);
    o.start(t); o.stop(t + 2.3);
  }

  /** 播放（淡入）：文件模式播上传音乐，合成模式播内置八音盒 */
  start() {
    if (this.mode === 'file') {
      const el = this.audioEl;
      el.volume = 0;
      el.play().then(() => {
        this.playing = true;
        this._fadeElement(el, this.volume);
      }).catch(() => {
        if (this.onError) this.onError('浏览器拒绝了播放，请再点一次音乐按钮');
      });
      return;
    }
    this._ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.6);
    this._scheduleLoopAt(this.ctx.currentTime + 0.15);
  }

  /** 停止（淡出） */
  stop() {
    if (!this.playing) {
      // 文件模式可能因加载失败等未置 playing，仍需暂停元素
      if (this.audioEl && !this.audioEl.paused) this._fadeElement(this.audioEl, 0);
      return;
    }
    this.playing = false;
    if (this.mode === 'file') {
      this._fadeElement(this.audioEl, 0);   // 淡出后由 _fadeElement 自动 pause
      return;
    }
    clearTimeout(this._loopTimer);
    clearTimeout(this._sparkTimer);
    this._sparkTimer = null;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.35);
  }

  setVolume(v) {
    this.volume = v;
    if (this.audioEl && !this.audioEl.paused) this.audioEl.volume = v;
    if (this.ctx && this.playing) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  }

  /** 页面隐藏时暂停 / 恢复时续播（由 main.js 的 visibilitychange 调用） */
  autoPause() {
    this._wasPlaying = this.playing;
    if (this.playing) this.stop();
  }

  autoResume() {
    if (this._wasPlaying) this.start();
  }
}
