/* =====================================================================
   Story — turns (emotional state + the viewer's restoration) into the
   city's atmosphere. NOTHING here advances the story; it only describes
   how the world looks and sounds for the current state and progress.
   ---------------------------------------------------------------------
   MOOD m (0..1) is the single continuous measure of how far the city has
   come back. Its target depends on the state and on persistent progress:
       NUMBNESS         0
       FRACTURE         0.03 + 0.025 × lights steadied
       AWAKENING        0.13 → 0.45   (restoration progress 0 → 30 %)
       RECLAIMING SELF  0.45 → 0.85   (restoration progress 30 → 62 %)
       AFTERGLOW        0.86 → 1      (altitude)
   m eases toward its target (a few seconds), so rain, haze, smoke, neon,
   sky and grade change continuously — never as a switch.

   Physical damage: uDamage (global severity) only relaxes late (m > .45);
   before that every repaired facade is the viewer's doing (the field).
   Events give the moments their punch: 'fracture' (the pulse is found) =
   impact + lightning; 'stabilise' = a small flash, a glitch, a neon flare.
   Voice / mouse ENHANCE only: bursts → instability, steady sound → calm.
   ===================================================================== */
window.AG = window.AG || {};

AG.Story = (function () {
  const U = AG.U;
  const S = {};
  let mood = 0, breathPhase = 0, calm = 0, userBurst = 0, lastGlitch = -1, pulseEnv = 0;
  let tint = [1.0, 0.7, 0.45];
  let strikes = [], flares = [], fractureAt = -1e9, finaleAt = -1, stillHereEmitted = false, startAt = 0, fastMood = 0;
  const CHAPTER = { NUMBNESS: 'numbness', FRACTURE: 'fracture', AWAKENING: 'awakening', RECLAIMING_SELF: 'reclaiming', AFTERGLOW: 'afterglow' };

  function reset() {
    mood = 0; userBurst = 0; lastGlitch = -1; strikes = []; flares = []; fractureAt = -1e9; finaleAt = -1; stillHereEmitted = false; fastMood = 0;
    startAt = AG.FSM.animTime;
  }
  function bindEvents() {
    U.on('fracture', () => { const at = AG.FSM.animTime; fractureAt = at; strikes.push({ t: at, x: 0.6, big: 1 }, { t: at + 0.55, x: -0.9, big: 0.8 }, { t: at + 1.6, x: 0.15, big: 0.6 }); });
    U.on('stabilise', () => { const at = AG.FSM.animTime; flares.push(at); strikes.push({ t: at + 0.1, x: U.hash(at) * 2 - 1, big: 0.35 }); });
    U.on('jump', () => { fastMood = 1; });
    U.on('reset', reset);
    U.on('finale', () => { finaleAt = AG.FSM.animTime; });
  }

  const lerp3 = (a, b, k) => [U.lerp(a[0], b[0], k), U.lerp(a[1], b[1], k), U.lerp(a[2], b[2], k)];
  const env = (x, a, d) => (x < 0 ? 0 : x < a ? x / a : Math.exp(-(x - a) / d));
  function lightningEnv(x) { if (x < 0 || x > 2.5) return 0; return Math.exp(-x * 10) + (x > 0.16 ? 0.7 * Math.exp(-(x - 0.16) * 6) : 0); }

  function moodTarget() {
    const st = AG.FSM.state, P = AG.Interactions.progress, NC = AG.CONFIG.interaction.network;
    if (st === 'NUMBNESS') return 0;
    if (st === 'FRACTURE') return 0.03 + 0.025 * AG.Interactions.stabilised;
    if (st === 'AWAKENING') return 0.13 + 0.32 * U.clamp(P / NC.toReclaiming, 0, 1);
    if (st === 'RECLAIMING_SELF') return 0.45 + 0.4 * U.clamp((P - NC.toReclaiming) / (NC.toAfterglow - NC.toReclaiming), 0, 1);
    return 0.86 + 0.14 * AG.Flight.asc;
  }
  function rainOf(m) {
    if (m < 0.15) return 0.95;
    if (m < 0.45) return U.lerp(0.92, 0.5, (m - 0.15) / 0.3);
    if (m < 0.86) return U.lerp(0.5, 0.2, (m - 0.45) / 0.41);       // drizzle by the end of RECLAIMING
    return U.lerp(0.2, 0.06, U.clamp((m - 0.86) / 0.14, 0, 1));
  }

  function compute(dt, playing, input, music) {
    const F = AG.FSM, st = F.state, at = F.animTime, fdt = playing ? dt : 0;
    const ch = CHAPTER[st];
    S.chapter = ch; S.state = st;
    fastMood = Math.max(0, fastMood - dt * 0.5);
    mood = U.damp(mood, moodTarget(), 0.55 + fastMood * 4, fdt || (fastMood ? dt : 0));
    const m = mood; S.mood = m;
    const asc = st === 'AFTERGLOW' ? AG.Flight.asc : 0;
    const finale = finaleAt >= 0 ? at - finaleAt : -1;
    // the finale has two parts (Flight.drift): a glide over the city, then the ascent. The light
    // itself (sun, title, veil) keeps its original timing, counted from the start of the ascent.
    const glideT = AG.CONFIG.flight.finaleGlide, ascentT = finale >= 0 ? finale - glideT : -1;

    /* ---------- impacts & lightning (event driven) ---------- */
    let impact = 0, flash = 0, fx = 0.3;
    strikes = strikes.filter((s) => at - s.t < 4);
    for (const s of strikes) {
      impact = Math.max(impact, env(at - s.t, 0.04, 0.55) * s.big);
      const e = lightningEnv(at - s.t) * s.big;
      if (e > flash) { flash = e; fx = s.x; }
      if (playing && !s.emitted && at >= s.t) { s.emitted = true; U.emit('lightning', { t: s.t, x: s.x }); if (s.big > 0.5) U.emit('impact', { n: 0 }); }
    }
    // distant, silent sheet lightning in the storm (01–02)
    if (st === 'NUMBNESS' || st === 'FRACTURE') { const slot = Math.floor(at / 7.3); const k = at - slot * 7.3 - 3; if (U.hash(slot * 5.1) < 0.45) flash = Math.max(flash, lightningEnv(k) * 0.22); }
    S.impact = impact; S.flash = flash; S.flashX = fx;
    let neonFlare = 0; flares = flares.filter((t) => at - t < 6); for (const t of flares) neonFlare = Math.max(neonFlare, env(at - t, 0.08, 1.6));
    S.neonFlare = neonFlare;
    S.pulseFlash = env(at - fractureAt, 0.06, 0.9);

    /* ---------- the city's physical state ---------- */
    S.restore = 0.92 * U.smooth(0.3, 1.0, m);                    // global window light, spreading from her
    S.damage = 1 - 0.78 * U.smooth(0.45, 1.0, m);                // global severity of the wounds
    S.ember = (1 - U.smooth(0.15, 0.6, m)) * (st === 'NUMBNESS' ? 0.8 : 1);
    S.smoke = 1 - U.smooth(0.1, 0.75, m);
    S.rebuild = U.smooth(0.42, 0.95, m);                        // floating fragments come home everywhere
    S.seam = U.smooth(0.42, 1.0, m);

    /* ---------- input interpretation (enhance only) ---------- */
    const lvl = input.level, burst = input.burst, quiet = input.silence;
    calm = U.damp(calm, quiet > 5 ? 1 : 0, 0.4, dt);
    userBurst = Math.max(burst, userBurst - dt * 1.5);
    S.echo = 0; S.calm = calm;
    S.tremor = (st === 'FRACTURE' ? 1.6 : 0.5) * lvl;

    /* ---------- environment ---------- */
    S.survivor = (st === 'NUMBNESS' ? 0.05 : st === 'FRACTURE' ? 0.03 : 0.012) + neonFlare * 0.12;
    S.traffic = 0.7 * U.smooth(0.3, 0.95, m);
    let rain = rainOf(m) + (st === 'NUMBNESS' ? 0.05 * lvl : 0);
    if (st === 'AFTERGLOW') rain *= 1 - U.smooth(0.05, 0.5, asc);
    // the ascension arc: the old weight returns for a moment (rain, colder, darker), then lets go
    const Fl = AG.Flight, arcK = st === 'AFTERGLOW' && Fl.arc ? 1 : 0;
    const heavy = arcK * (1 - U.smooth(2.0, 5.5, Fl.ascT)), freed = arcK * U.smooth(3.8, 9, Fl.ascT);
    S.heavy = U.damp(S.heavy || 0, heavy, 1.5, dt); S.freed = U.damp(S.freed || 0, Fl.finale ? 1 : freed, 1.0, dt);
    rain = Math.max(rain, 0.45 * S.heavy);
    S.rain = U.clamp(rain, 0, 1);
    S.wind = 0.3 + 0.3 * Math.sin(at * 0.13) + (st === 'FRACTURE' ? 0.45 + impact : st === 'NUMBNESS' ? 0.3 : 0) + lvl * 0.4;
    S.instability = (st === 'FRACTURE' ? 0.07 + impact * 0.9 : 0.02 + impact * 0.5) + userBurst * (st === 'FRACTURE' ? 0.6 : 0.3);

    /* glitch: impacts, sparse interference, loud input */
    const slot = Math.floor(at * 4);
    let g = 0;
    const pr = st === 'FRACTURE' ? 0.08 : st === 'NUMBNESS' ? 0.02 : st === 'AWAKENING' ? 0.012 : 0.004;
    if (U.hash(slot * 1.71) < pr) g = 0.22 + 0.35 * U.hash(slot * 3.3);
    g = Math.max(g, impact * 0.95, userBurst * 0.6, neonFlare * 0.45 * (at - flares.at(-1) < 0.5 ? 1 : 0));
    if (st === 'AFTERGLOW') g *= 0.3;
    if (playing && g > 0.2 && slot !== lastGlitch) { lastGlitch = slot; U.emit('glitch', { amount: g }); }
    S.glitch = g;

    /* the city's heartbeat (music low band) once it answers */
    pulseEnv = Math.max(music ? music.low : 0, pulseEnv - dt * 3.5);
    S.pulse = U.smooth(0.4, 0.62, m) * pulseEnv;
    S.bands = music ? [music.low, music.mid, music.high] : [0.2, 0.2, 0.2];

    /* ---------- the fallen sign beside her (dying) and the one that returns ---------- */
    let heroA = 0, letters = 2;
    if (st === 'NUMBNESS') {
      const k = Math.floor(at * 9);
      heroA = (U.hash(k * 0.37) > 0.45 ? 1 : 0.12) * (0.75 + 0.15 * Math.sin(at * 37)) * U.smooth(0.2, 1.0, at - startAt);
      letters = 2;
    } else if (st === 'FRACTURE' && at - fractureAt < 3) {
      heroA = U.hash(Math.floor(at * 14)) > 0.7 ? 0.5 : 0; letters = U.hash(Math.floor(at * 9)) > 0.85 ? 1 : 0;
    }
    S.heroA = heroA; S.heroALetters = letters;
    let heroB = 0;
    if (st === 'RECLAIMING_SELF' || st === 'AFTERGLOW') {
      const x = st === 'AFTERGLOW' ? 10 : F.stateTime - 2.6;
      heroB = x < 0 ? 0 : x > 2.5 ? 1 : (U.hash(Math.floor(at * 14)) > 0.5 - x * 0.2 ? Math.min(1, U.smooth(0, 2.5, x) + 0.3) : 0);
      heroB *= 0.92 + 0.08 * Math.sin(at * 3);
      if (heroB > 0.5 && !stillHereEmitted && playing && st === 'RECLAIMING_SELF') { stillHereEmitted = true; U.emit('stillHere'); }
      if (st === 'AFTERGLOW' && !F.cinematic) heroB *= 1 - U.smooth(0, 4, F.modeTime + (F.mode === 'ASCENSION' ? 4 : 0));
    }
    S.heroB = heroB;
    S.smallLight = m < 0.12 ? (U.hash(Math.floor(at * 6)) > 0.8 ? 0.4 : 0.05) : U.smooth(0.12, 0.3, m);
    S.holoPower = U.clamp(U.smooth(0.35, 0.8, m) + neonFlare * 0.7, 0, 1);
    S.beamPower = U.smooth(0.45, 0.9, m);

    /* ---------- colour of the returning light (voice pitch) ---------- */
    let target = [1.0, 0.68, 0.42];
    if (input.active && input.level > 0.08) {
      const p = input.pitch;
      target = p < 0.5 ? lerp3([1.0, 0.4, 0.55], [1.0, 0.68, 0.42], p * 2) : lerp3([1.0, 0.68, 0.42], [0.35, 0.9, 1.0], (p - 0.5) * 2);
    }
    tint = lerp3(tint, target, 1 - Math.exp(-dt * 1.2));
    S.tint = tint;

    /* ---------- the pulse (01) ---------- */
    S.beacon = st === 'NUMBNESS' ? U.smooth(3.5, 5.5, F.stateTime) : 0;
    S.beaconHint = st === 'NUMBNESS' ? AG.Interactions.hintLevel : 0;

    /* ---------- ascension, cloud, sunrise ---------- */
    // during the glide the warm dawn builds slowly over the city (a little more than before,
    // spread over the glide); the ascent then completes it as before
    S.dawn = st === 'AFTERGLOW' ? U.clamp(U.smooth(0.12, 0.85, asc) + (finale >= 0 ? U.smooth(0, glideT + 6, finale) * 0.25 : 0), 0, 1) : 0;
    // the sun belongs to the LIGHT (the ascent); during the glide only a promise of it on the horizon
    S.sun = st === 'AFTERGLOW' ? Math.max(0.25 * U.smooth(0.8, 1.0, asc), finale >= 0 ? 0.25 * U.smooth(1, glideT, finale) : 0, ascentT >= 0 ? U.smooth(0, 5, ascentT) : 0) : 0;
    // the luminous cloud stays thin so she is never lost in it
    S.cloudGlow = st === 'AFTERGLOW' ? 0.55 * U.smooth(0.15, 0.55, asc) * (1 - 0.85 * (finale >= 0 ? U.smooth(1, 5, ascentT) : U.smooth(0.94, 1, asc))) : 0;
    S.title = ascentT >= 0 ? U.smooth(8, 10, ascentT) : 0;
    S.finale = finale;

    /* ---------- atmosphere & grade ---------- */
    const R = m, dawn = S.dawn;
    const shock = impact * (st === 'FRACTURE' || st === 'NUMBNESS' ? 1 : 0.4);
    S.fogDensity = U.lerp(0.0052, 0.0027, U.smooth(0.05, 0.9, R)) * (1 - dawn * 0.6);
    // the finale glide clears the air so the restored city reads as a panorama, not a haze
    if (finale >= 0) S.fogDensity *= 1 - 0.55 * U.smooth(0, glideT * 0.7, finale);
    S.fogFalloff = 0.011;
    S.fogLow = lerp3(lerp3([0.06, 0.072, 0.105], [0.24, 0.1, 0.23], R * 0.9), [0.4, 0.22, 0.3], dawn * 0.6);
    S.fogHigh = lerp3(lerp3([0.08, 0.095, 0.14], [0.12, 0.1, 0.2], R), [0.26, 0.22, 0.36], dawn * 0.6);
    S.ambSky = lerp3(lerp3([0.16, 0.2, 0.3], [0.24, 0.21, 0.38], R), [0.55, 0.45, 0.55], dawn * 0.6);
    S.ambGround = lerp3(lerp3([0.04, 0.045, 0.07], [0.32, 0.1, 0.26], R), [0.45, 0.3, 0.32], dawn * 0.5);
    S.zenith = lerp3(lerp3([0.02, 0.026, 0.05], [0.035, 0.035, 0.09], R), [0.2, 0.28, 0.55], dawn * 0.85);
    S.horizon = lerp3(lerp3([0.1, 0.12, 0.17], [0.22, 0.11, 0.26], R), [0.85, 0.42, 0.42], dawn * 0.8);
    S.cityGlow = lerp3([0.035, 0.04, 0.065], [0.5, 0.12, 0.42], R);
    S.cloud = U.lerp(1.0, 0.6, R) * (1 - 0.7 * dawn);
    S.smokeCol = lerp3([0.05, 0.055, 0.07], [0.16, 0.08, 0.15], R);
    S.sat = U.lerp(0.42, 1.15, U.smooth(0, 0.8, R)) * (1 - 0.35 * shock) * (1 - 0.3 * (S.heavy || 0));
    S.lift = lerp3([0.0, 0.008, 0.028], [0.012, 0.004, 0.018], R);
    S.gain = lerp3(lerp3([0.92, 0.97, 1.08], [1.06, 1.0, 0.96], R), [1.1, 1.0, 0.94], dawn);
    S.gain = lerp3(S.gain, [1.25, 0.95, 1.05], shock * 0.5);
    S.exposure = 1.22 + 0.1 * R + shock * 0.25 - 0.3 * S.sun + S.pulseFlash * 0.45 - 0.12 * (S.heavy || 0) + 0.06 * (S.freed || 0);

    /* ---------- fades: in at the start; a soft veil only after the finale ---------- */
    let fade = 1 - U.smooth(0.05, 1.6, at - startAt);
    if (ascentT >= 0) fade = Math.max(fade, 0.35 * U.smooth(9, 11, ascentT));
    S.fade = fade;

    /* ---------- her body ---------- */
    const rate = st === 'NUMBNESS' ? U.lerp(0.22, 0.16, calm) : st === 'FRACTURE' ? 0.32 : 0.2;
    breathPhase += fdt * rate * Math.PI * 2;
    S.breath = 0.5 + 0.5 * Math.sin(breathPhase);
    S.wet = U.lerp(1, 0.3, R);

    S.hint = '';
    if (input.micOn && (st === 'AWAKENING' || st === 'RECLAIMING_SELF')) S.hint = 'a steady sound calms the rain';
    S.inSilence = st === 'NUMBNESS';
    S.inRecon = st === 'AWAKENING' || st === 'RECLAIMING_SELF';
    S.coda = st === 'AFTERGLOW';
    return S;
  }

  return { compute, reset, bindEvents, state: S, get mood() { return mood; } };
})();
