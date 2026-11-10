/* =====================================================================
   Audio engine (Web Audio API)
   ---------------------------------------------------------------------
     master ─ compressor ─ destination
       ├─ musicBus  ← MP3 soundtrack  OR  generative score (fallback)
       │     └─ AnalyserNode (Web Audio API): a passive tap on the ONE
       │        soundtrack signal. It outputs no sound, so nothing plays
       │        twice. bands() → story; rawBands() → reactivity.js → shaders.
       ├─ ambBus    ← rain, city hum, traffic wash, wind (state-driven)
       └─ sfxBus    ← thunder, electrical glitches, bells (event-driven)
   The AudioContext is created only after the viewer clicks
   "Enter Experience" (browser autoplay policy).
   There is deliberately no mute or volume control: the soundtrack
   always plays at its designed level while the story is playing.
   ===================================================================== */
window.AG = window.AG || {};

AG.Audio = (function () {
  const U = AG.U, C = AG.CONFIG;
  const A = { ctx: null, mode: 'none', volume: 0.85, ready: false, el: null, mp3Status: 'checking' };
  let master, comp, musicBus, ambBus, sfxBus, analyser, freq, reverb, reverbIn;
  const amb = {};
  let playing = false;

  /* ---------- MP3 probe: starts on page load, before the click ---------- */
  function probe() {
    return new Promise((resolve) => {
      if (!C.soundtrack.src) { A.mp3Status = 'none'; return resolve(false); }
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      let done = false;
      const fin = (ok, why) => { if (done) return; done = true; A.mp3Status = ok ? 'ok' : why; if (ok) A.el = el; resolve(ok); };
      el.addEventListener('canplaythrough', () => fin(true));
      el.addEventListener('loadeddata', () => fin(true));
      el.addEventListener('error', () => fin(false, 'missing'));
      setTimeout(() => fin(false, 'timeout'), C.soundtrack.loadTimeoutMs);
      el.src = C.soundtrack.src;
      el.load();
    });
  }
  const probePromise = probe();

  function noiseBuffer(ctx, seconds, type) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (type === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
        else if (type === 'drops') { d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0; }
        else d[i] = w;
      }
    }
    return b;
  }

  function impulse(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function loop(buf, dest) { const s = A.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest); s.start(); return s; }
  function gain(v, dest) { const g = A.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function filt(type, f, q, dest) { const n = A.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q || 0.7; if (dest) n.connect(dest); return n; }

  async function init() {
    if (A.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    A.ctx = new Ctx({ latencyHint: 'playback' });
    const ctx = A.ctx;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    comp.connect(ctx.destination);
    master = gain(0, comp);
    musicBus = gain(0.9, master);
    ambBus = gain(0.9, master);
    sfxBus = gain(0.8, master);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;
    musicBus.connect(analyser);
    freq = new Uint8Array(analyser.frequencyBinCount);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(ctx, 4.2, 2.6);
    reverbIn = gain(1, reverb); reverb.connect(gain(0.55, master));
    A.reverbIn = reverbIn; A.musicBus = musicBus; A.sfxBus = sfxBus;

    // ---- ambience ----
    const white = noiseBuffer(ctx, 4, 'white'), pink = noiseBuffer(ctx, 5, 'pink'), brown = noiseBuffer(ctx, 6, 'brown'), drops = noiseBuffer(ctx, 3.3, 'drops');
    amb.rain = gain(0, ambBus);
    loop(pink, filt('highpass', 500, 0.5, filt('lowpass', 6500, 0.5, amb.rain)));
    amb.drops = gain(0, ambBus);
    loop(drops, filt('bandpass', 3200, 0.8, amb.drops));
    amb.hum = gain(0, ambBus);
    loop(brown, filt('lowpass', 140, 0.8, amb.hum));
    amb.mains = gain(0, ambBus);
    [50, 100, 150].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; const g = gain([0.5, 0.3, 0.12][i], amb.mains); o.connect(g); o.start(); });
    amb.traffic = gain(0, ambBus);
    amb.trafficF = filt('bandpass', 420, 0.6, amb.traffic);
    loop(brown, amb.trafficF);
    amb.wind = gain(0, ambBus);
    amb.windF = filt('bandpass', 500, 1.2, amb.wind);
    loop(white, amb.windF);
    A.noise = { white, pink, brown };

    // ---- music source ----
    const hasMp3 = await probePromise;
    if (hasMp3 && A.el) {
      try {
        const src = ctx.createMediaElementSource(A.el);
        // the soundtrack loops; a low-pass opens and a gain swells as the city returns
        A.el.loop = true;
        A.mp3F = filt('lowpass', 900, 0.6, musicBus);
        A.mp3G = gain(0.8, A.mp3F);
        src.connect(A.mp3G);
        A.mode = 'mp3';
      } catch (e) { A.mode = 'generative'; }
    } else A.mode = 'generative';
    if (A.mode === 'generative') AG.Score.init(ctx, musicBus, reverbIn);
    A.ready = true;
    bindEvents();
    U.emit('audioMode', A.mode);
  }

  /* ---------- transport ---------- */
  function mediaTime() {
    if (A.mode !== 'mp3' || !A.el || !playing) return null;
    if (A.el.ended || (A.el.duration && A.el.currentTime >= A.el.duration - 0.05)) return null;
    return A.el.currentTime;
  }
  function play(t) {
    playing = true;
    if (!A.ctx) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    fadeMaster(A.volume, 0.4);
    if (A.mode === 'mp3') A.el.play().catch(() => {});      // resumes where it was: never restarts
    if (A.mode === 'generative') AG.Score.resync(AG.Score.clock.t);
  }
  function pause() {
    playing = false;
    if (!A.ctx) return;
    fadeMaster(0, 0.25);
    if (A.mode === 'mp3') A.el.pause();
  }
  function seek() { /* the music follows the state; nothing to seek */ }
  function restart() {
    if (A.mode === 'mp3' && A.el) A.el.currentTime = C.soundtrack.offset || 0;
    if (A.mode === 'generative') { AG.Score.resetClock(); AG.Score.accent('reset'); }
  }
  function fadeMaster(v, time) {
    const g = master.gain, now = A.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(v, now + time);
  }

  /* ---------- per-frame: ambience follows the city's state ---------- */
  function set(param, v, tc) { param.setTargetAtTime(v, A.ctx.currentTime, tc || 0.3); }
  function update(S, t, dt, isPlaying) {
    if (!A.ready) return;
    set(amb.rain.gain, 0.17 * S.rain + 0.02, 0.5);
    set(amb.drops.gain, 0.5 * S.rain * (0.6 + 0.4 * (AG.Camera.state.close || 0)), 0.5);
    set(amb.hum.gain, 0.05 + 0.13 * S.mood, 1.0);
    set(amb.mains.gain, (S.inSilence ? 0.006 : 0.003) * (1 - S.mood * 0.5), 1.0);
    set(amb.traffic.gain, 0.1 * S.traffic + 0.004, 1.0);
    set(amb.trafficF.frequency, 300 + 260 * Math.sin(t * 0.21) * Math.sin(t * 0.07), 0.8);
    set(amb.wind.gain, 0.025 * S.wind, 0.6);
    set(amb.windF.frequency, 300 + 500 * S.wind, 0.6);
    if (A.mode === 'generative' && isPlaying) AG.Score.update(AG.Score.musicTime(dt), dt, S);
    if (A.mode === 'mp3' && A.mp3F) {
      const asc = AG.FSM.state === 'AFTERGLOW' ? AG.Flight.asc : 0;
      set(A.mp3F.frequency, 700 + 9000 * Math.pow(S.mood, 1.6) + 6000 * asc, 1.2);
      set(A.mp3G.gain, 0.55 + 0.35 * S.mood + 0.25 * asc, 1.2);
    }
  }

  /* Web Audio API: read the analyser's FFT magnitudes and average three bands
     (bass 35–160 Hz, mid 250–2000 Hz, treble 3–9 kHz), each 0..1. Plain JS maths. */
  function bands() {
    if (!analyser) return { low: 0, mid: 0, high: 0 };
    analyser.getByteFrequencyData(freq);
    const binHz = A.ctx.sampleRate / analyser.fftSize;
    const avg = (f0, f1) => { let s = 0, n = 0; for (let i = Math.floor(f0 / binHz); i <= Math.floor(f1 / binHz); i++) { s += freq[i]; n++; } return n ? s / n / 255 : 0; };
    return { low: U.clamp(avg(35, 160) * 1.5, 0, 1), mid: U.clamp(avg(250, 2000) * 1.6, 0, 1), high: U.clamp(avg(3000, 9000) * 2.2, 0, 1) };
  }
  /* Web Audio API: the same three bands WITHOUT the gain and clamp above, so
     the full dynamics survive (bands() saturates on dense passages). Used by
     js/audio/reactivity.js; bands() keeps feeding the story unchanged. */
  function rawBands() {
    if (!analyser) return null;
    analyser.getByteFrequencyData(freq);
    const binHz = A.ctx.sampleRate / analyser.fftSize;
    const avg = (f0, f1) => { let s = 0, n = 0; for (let i = Math.floor(f0 / binHz); i <= Math.floor(f1 / binHz); i++) { s += freq[i]; n++; } return n ? s / n / 255 : 0; };
    return { bass: avg(35, 160), mid: avg(250, 2000), treble: avg(3000, 9000) };
  }

  /* ---------- event-driven sound: thunder, glitches, bells ---------- */
  function bindEvents() {
    U.on('lightning', (e) => { if (playing) thunder(e.x); });
    U.on('glitch', (e) => { if (playing) glitch(e.amount); });
    U.on('firstLight', () => { if (playing) bell([880, 1320.5, 2217], 0.11, 6); });
    U.on('stillHere', () => { if (playing) bell([587.3, 739.99, 880, 1174.7], 0.07, 7); });
    U.on('impact', (e) => { if (playing) impact(e.n); });
    // the viewer's actions answer in sound
    const scale = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.5, 1479.98];
    U.on('fracture', () => { if (!playing) return; boom(0.9); bell([440, 554.37, 659.25, 880, 1108.73], 0.08, 9); swell(4.5); });
    U.on('stabilise', (e) => { if (!playing) return; zap(); const f = scale.at(Math.min(e.n, scale.length) - 1); bell([f, f * 1.5], 0.07, 4); });
    U.on('connect', (e) => { if (!playing) return; const f = scale.at(e.n % scale.length); bell(e.reclaiming ? [f, f * 1.25, f * 1.5] : [f, f * 1.5], 0.06, e.reclaiming ? 6 : 4.5); swell(e.reclaiming ? 2.6 : 1.6); });
    U.on('state', (e) => { if (!playing || e.why === 'jump') return;
      if (e.state === 'AWAKENING') bell([587.33, 739.99, 880, 1174.66], 0.08, 8);
      if (e.state === 'RECLAIMING_SELF') { bell([587.33, 739.99, 880, 1174.66, 1479.98], 0.08, 9); swell(5); }
      if (e.state === 'AFTERGLOW') swell(6); });
    // the ascension arc: weight → release → weightlessness (the score's sections carry the rest)
    U.on('ascPhase', (e) => {
      if (!playing) return;
      if (e.phase === 'SUFFERING') { boom(0.55); glitch(0.4); }
      else if (e.phase === 'RESISTANCE') boom(0.35);
      else if (e.phase === 'RELEASE') { bell([293.66, 440, 587.33, 739.99], 0.07, 8); swell(4); }
      else if (e.phase === 'LEVITATION') { bell([880, 1174.66, 1479.98], 0.05, 9); swell(6); }
      else if (e.phase === 'ASCENSION' && A.mode !== 'generative') swell(5);
    });
    U.on('cloud', () => { if (!playing) return; if (A.mode === 'generative') AG.Score.accent('cloud'); else swell(4); });
    U.on('finale', () => { if (playing) bell([587.33, 739.99, 880, 1174.66, 1479.98, 1760], 0.07, 10); });
    U.on('tap', (e) => { if (playing) tick(e.near ? 990 : e.far ? 520 : 660); });
  }
  /* an electric snap: a fragile light caught and held */
  function zap() {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.005;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const g = gain(0, filt('bandpass', 2400, 2.5, sfxBus));
    o.connect(g);
    o.frequency.setValueAtTime(1800, t0); o.frequency.exponentialRampToValueAtTime(120, t0 + 0.25);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    o.start(t0); o.stop(t0 + 0.32);
    glitch(0.6);
  }
  /* a deep, soft body blow (the pulse) */
  function boom(level) {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = gain(0, sfxBus); o.connect(g); g.connect(reverbIn);
    o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(32, t0 + 1.6);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(level, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 3);
    o.start(t0); o.stop(t0 + 3.1);
  }
  /* a rising filtered-noise swell (light spreading) */
  function swell(dur) {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.02;
    const n = ctx.createBufferSource(); n.buffer = A.noise.pink;
    const f = filt('bandpass', 400, 1.2, null); const g = gain(0, sfxBus); g.connect(reverbIn);
    n.connect(f); f.connect(g);
    f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(4200, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.09, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 1.3);
    n.start(t0, Math.random() * 2); n.stop(t0 + dur * 1.35);
  }
  /* a tiny glassy tick for clicks that miss */
  function tick(f) {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.005;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = gain(0, sfxBus); o.connect(g);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.35);
    o.start(t0); o.stop(t0 + 0.4);
  }
  function pan(v, dest) { const p = A.ctx.createStereoPanner(); p.pan.value = v; p.connect(dest); return p; }
  function thunder(x) {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.35 + Math.random() * 1.1;
    const src = ctx.createBufferSource(); src.buffer = A.noise.brown;
    const g = gain(0, pan(U.clamp(x * 0.6, -0.8, 0.8), sfxBus));
    const f = filt('lowpass', 260, 0.7, g);
    src.connect(f);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.9, t0 + 0.12); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 5.5);
    f.frequency.setValueAtTime(320, t0); f.frequency.exponentialRampToValueAtTime(70, t0 + 5);
    src.start(t0, Math.random() * 2); src.stop(t0 + 6);
    // crack
    const c = ctx.createBufferSource(); c.buffer = A.noise.white;
    const cg = gain(0, filt('highpass', 1800, 0.7, sfxBus)); c.connect(cg);
    cg.gain.setValueAtTime(0.25, t0 - 0.2); cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    c.start(t0 - 0.2); c.stop(t0 + 0.3);
  }
  function glitch(amount) {
    const ctx = A.ctx, t0 = ctx.currentTime, dur = 0.06 + Math.random() * 0.22;
    const p = pan(Math.random() * 1.6 - 0.8, sfxBus);
    const g = gain(0, p);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = [55, 60, 110, 220][Math.floor(Math.random() * 4)];
    const ws = ctx.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.round(((i / 128) - 1) * 3) / 3;
    ws.curve = curve;
    o.connect(ws); ws.connect(filt('bandpass', 900 + Math.random() * 2000, 1.5, g));
    const n = ctx.createBufferSource(); n.buffer = A.noise.white; n.connect(filt('highpass', 3000, 0.7, g));
    const lvl = 0.05 + 0.08 * amount;
    g.gain.setValueAtTime(0, t0);
    for (let k = 0; k < 4; k++) g.gain.setValueAtTime(Math.random() < 0.6 ? lvl : 0, t0 + (k / 4) * dur);
    g.gain.setValueAtTime(0, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.02); n.start(t0, Math.random()); n.stop(t0 + dur + 0.02);
  }
  /* Fracture: a deep body hit + crunch + electrical distortion */
  function impact(n) {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = gain(0, sfxBus); o.connect(g);
    o.frequency.setValueAtTime(70 - n * 4, t0); o.frequency.exponentialRampToValueAtTime(24, t0 + 1.2);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.95, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.4);
    o.start(t0); o.stop(t0 + 2.5);
    const ws = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    ws.curve = curve;
    const nz = ctx.createBufferSource(); nz.buffer = A.noise.brown;
    const ng = gain(0, sfxBus); const lp = filt('lowpass', 900, 0.8, ng);
    nz.connect(ws); ws.connect(lp);
    ng.gain.setValueAtTime(0.5, t0); ng.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
    lp.frequency.setValueAtTime(1800, t0); lp.frequency.exponentialRampToValueAtTime(120, t0 + 1.2);
    nz.start(t0, Math.random() * 3); nz.stop(t0 + 1.5);
    const cr = ctx.createBufferSource(); cr.buffer = A.noise.white;
    const cg = gain(0, filt('bandpass', 2500, 0.7, sfxBus)); cr.connect(cg);
    cg.gain.setValueAtTime(0.18, t0); cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    cr.start(t0, Math.random()); cr.stop(t0 + 0.7);
    glitch(1);
  }

  function bell(freqs, level, decay) {
    const ctx = A.ctx, t0 = ctx.currentTime + 0.02;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.76;
      const g = gain(0, sfxBus); const g2 = gain(0, sfxBus);
      g.connect(reverbIn); g2.connect(reverbIn);
      o.connect(g); o2.connect(g2);
      const st = t0 + i * 0.09;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(level, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, st + decay);
      g2.gain.setValueAtTime(0, st); g2.gain.linearRampToValueAtTime(level * 0.25, st + 0.005); g2.gain.exponentialRampToValueAtTime(0.0005, st + decay * 0.4);
      o.start(st); o2.start(st); o.stop(st + decay + 0.1); o2.stop(st + decay + 0.1);
    });
  }

  return Object.assign(A, { init, play, pause, seek, restart, update, bands, rawBands, mediaTime, probePromise });
})();
