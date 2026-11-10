/* =====================================================================
   Audio reactivity — the existing soundtrack drives three visuals
   ---------------------------------------------------------------------
   Who does what (kept strictly apart):

   1. Web Audio API — js/audio/audio.js
      The soundtrack (MP3 via a MediaElementSource, or the generative
      score when no MP3 is present) plays through `musicBus`. An
      AnalyserNode is connected to that same bus as a passive tap: it
      reads the signal and outputs nothing, so the music plays once.
      AG.Audio.rawBands() calls analyser.getByteFrequencyData() and
      averages three bands (bass / mid / treble), each 0..1, unscaled.
      (AG.Audio.bands(), gained and clamped, still feeds the story.)

   2. p5.js — this file, update(p, bands, raw)
      p.deltaTime   frame time, so the smoothing is frame-rate independent
      p.lerp()      fast attack/release smoothing of each band, a slow
                    running baseline per band, and the ON/OFF cross-fade
      p.map()       (smoothed − baseline) → 0..1 visual drive, i.e. how
                    far the music rises above its own recent level
      p.constrain() clamp the drive (and the frame time) to safe ranges
      Plain JavaScript does the rest (Math.exp for the smoothing factor,
      DOM updates for the debug view).

   3. GLSL — js/render/renderer.js passes the results as uniforms
      bass   → sky shader uCityGlow + composite bloom strength (city glow)
      mid    → city shader uAudioMid     (lit windows pulse)
      treble → city shader uAudioTreble  (window sparkles) and the
               existing spark particles' uAmount (only when they're shown)

   AUDIO REACTIVITY ON/OFF affects only the visuals, never playback.
   OFF: the drives fade to 0, and the story gets `null` instead of the
   bands, which is the story's own "no music" path. The heartbeat
   (uPulse) and the equaliser signs (uBands) then stop following the
   music too, giving the original, non-reactive look.

   TEMPORARY debug view: press B, or open the page with ?audiodebug=1.
   ===================================================================== */
window.AG = window.AG || {};

AG.Reactivity = (function () {
  const U = AG.U, C = AG.CONFIG;
  const BANDS = ['bass', 'mid', 'treble'];
  const R = {
    enabled: true,
    raw: { bass: 0, mid: 0, treble: 0 },        // analyser bands this frame (0..1, unscaled)
    smooth: { bass: 0, mid: 0, treble: 0 },     // after p5 attack/release smoothing
    base: { bass: 0, mid: 0, treble: 0 },       // slow running baseline (recent average level)
    drive: { bass: 0, mid: 0, treble: 0 },      // final visual drive sent to the shaders (0..1)
    amount: 1                                   // ON/OFF cross-fade (0..1)
  };
  let debugEl = null, debugOn = false;

  /* called once per frame from sketch.js draw() */
  function update(p, bands, raw) {
    const RC = C.reactivity;
    // p5.js: frame time in ms → seconds, clamped so a stalled tab doesn't jump
    const dt = p.constrain(p.deltaTime / 1000, 0, 0.1);
    BANDS.forEach((b) => { R.raw[b] = raw ? raw[b] : 0; });
    const kBase = 1 - Math.exp(-dt * RC.baseline);
    // p5.js: ease the ON/OFF switch so the image never snaps
    R.amount = p.lerp(R.amount, R.enabled ? 1 : 0, 1 - Math.exp(-dt / RC.fadeTime));
    BANDS.forEach((b) => {
      const cfg = RC[b];
      // p5.js: fast attack when the level rises, slower release when it falls
      const rising = R.raw[b] > R.smooth[b];
      const k = 1 - Math.exp(-dt * (rising ? cfg.attack : cfg.release));
      R.smooth[b] = p.lerp(R.smooth[b], R.raw[b], k);
      // p5.js: a slow baseline = the band's recent average level
      // (catches up 6× faster when far below, e.g. when the music first starts)
      R.base[b] = p.lerp(R.base[b], R.smooth[b], R.base[b] < R.smooth[b] * 0.5 ? 1 - Math.exp(-dt * RC.baseline * 6) : kBase);
      // p5.js: the rise above that baseline → 0..1 visual drive, clamped
      const d = p.constrain(p.map(R.smooth[b] - R.base[b], 0, cfg.span, 0, 1), 0, 1);
      R.drive[b] = d * R.amount;
    });
    if (debugOn) drawDebug();
    window.__AG_AUDIO = { enabled: R.enabled, amount: +R.amount.toFixed(3), raw: Object.assign({}, R.raw), smooth: Object.assign({}, R.smooth), base: Object.assign({}, R.base), drive: Object.assign({}, R.drive) };
    // OFF → the story receives no music, its original non-reactive path
    return R.enabled ? bands : null;
  }

  function setEnabled(on) {
    R.enabled = !!on;
    U.emit('reactivity', R.enabled);
  }

  /* ---------------- TEMPORARY debug view (B key or ?audiodebug=1) ---------------- */
  function toggleDebug(force) {
    debugOn = force === undefined ? !debugOn : !!force;
    if (debugOn && !debugEl) {
      debugEl = document.createElement('div');
      debugEl.id = 'audioDebug';
      debugEl.setAttribute('aria-hidden', 'true');
      debugEl.innerHTML = '<div class="ad-head"></div>' + BANDS.map((b) =>
        `<div class="ad-row" data-b="${b}"><span class="ad-name">${b}</span>` +
        '<span class="ad-bar"><i class="raw"></i><i class="sm"></i></span><span class="ad-num"></span></div>').join('') +
        '<div class="ad-foot">raw = analyser · smooth = p5 lerp · base = slow average · drive = to shaders · B to hide</div>';
      document.body.appendChild(debugEl);
    }
    if (debugEl) debugEl.style.display = debugOn ? 'block' : 'none';
  }
  function drawDebug() {
    const A = AG.Audio;
    debugEl.querySelector('.ad-head').textContent =
      `AUDIO DEBUG · reactivity ${R.enabled ? 'ON' : 'OFF'} · source ${A.mode} · ${AG.FSM.playing ? 'playing' : 'paused'}`;
    BANDS.forEach((b) => {
      const row = debugEl.querySelector(`[data-b="${b}"]`);
      row.querySelector('.raw').style.width = (R.raw[b] * 100).toFixed(1) + '%';
      row.querySelector('.sm').style.width = (R.smooth[b] * 100).toFixed(1) + '%';
      row.querySelector('.ad-num').textContent = `raw ${R.raw[b].toFixed(2)}  smooth ${R.smooth[b].toFixed(2)}  base ${R.base[b].toFixed(2)}  drive ${R.drive[b].toFixed(2)}`;
    });
  }
  if (/[?&]audiodebug=1/.test(location.search)) document.addEventListener('DOMContentLoaded', () => toggleDebug(true));

  return Object.assign(R, { update, setEnabled, toggleDebug });
})();
