/* =====================================================================
   Round 02 · Memory Garden — shared state and phase machine (AG.R2)
   ---------------------------------------------------------------------
   The single source of Round 02 state. Every Round 02 system READS it:
   the garden scene, the UI, and (next phases) the p5.js light layer, the
   heroine's movement in the garden and the facade transformation. Only
   the flow (js/garden/garden.js) and the flower (js/garden/flower.js) are
   the facts it is derived from. No drawing, no input listeners here.

   Phases (derived every frame from those facts):
     OFF        Round 01, or Round 02 not started
     ENTER      flying to the doorway of light and through it
     APPROACH   inside the garden, the flower still asleep
     AWAKEN     the flower clicked awake, not yet unfolding
     DRAG       the player is dragging it open
     BLOOM      partly open, between drags
     TRANSFORM  fully open (100 %): the transformation's moment
     EXIT       fading out of the garden
     EXPLORE    back in the city after a visit
   A change emits U 'r2phase' { phase, prev }.

   Plan for the later phases: docs/ROUND02_PLAN.md.
   ===================================================================== */
window.AG = window.AG || {};

AG.R2 = (function () {
  const PHASES = ['OFF', 'ENTER', 'APPROACH', 'AWAKEN', 'DRAG', 'BLOOM', 'TRANSFORM', 'EXIT', 'EXPLORE'];
  const R = {
    phase: 'OFF', prev: 'OFF', phaseTime: 0,
    bloom: 0, awake: false, dragging: false,
    visits: 0,
    bloomed: false,           // has the flower ever reached 100 % (the building's transformation stays)
    /* ---- Phase 4 DATA STREAMS (the single authority; AG.Living and the p5 layer only read) ---- */
    glow: 0,                  // the flower's core glow (flower.core)
    particles: 0,             // its particle activity (live motes)
    sinceBloom: 0,            // game seconds since it reached 100 %
    transform: 0,             // the building's transformation 0..1
    windows: 0,               // how far the windows have lit 0..1
    stage: { A: 0, B: 0, C: 0, D: 0, E: 0 },   // stage progress, each 0..1, overlapping
    flowerPos: [0, 0, 0], buildingPos: [0, 0, 0]
  };
  const DURATION = 42;        // seconds for the whole transformation at the flower's normal glow
  let p = null;
  function init(inst) { p = inst; }

  function derive() {
    const G = AG.Garden;
    if (!G || !G.isActive()) return 'OFF';
    if (G.phase === 'leave') return 'EXIT';
    if (G.phase === 'approach') return G.visits > 0 ? 'EXPLORE' : 'ENTER';
    if (G.phase === 'enter') return 'ENTER';
    const f = G.scene && G.scene.flower;                     // inside
    if (!f || !f.awake) return 'APPROACH';
    if (f.bloom >= 0.995) return 'TRANSFORM';
    if (f.dragging) return 'DRAG';
    if (f.target > 0.01) return 'BLOOM';
    return 'AWAKEN';
  }

  /* once per frame (js/sketch.js), whatever is drawn */
  function update(dt) {
    const G = AG.Garden, f = G && G.scene ? G.scene.flower : null;
    R.bloom = f ? f.bloom : 0; R.awake = !!(f && f.awake); R.dragging = !!(f && f.dragging);
    R.visits = G ? G.visits : 0;
    if (R.bloom >= 0.995) R.bloomed = true;
    if (f) { R.glow = f.core; R.particles = f.motes.length; R.flowerPos = f.center; }
    if (G && G.portal) R.buildingPos = [G.portal.box.cx, G.portal.box.top - 6, G.portal.box.cz];
    transformStep(dt);
    const ph = derive();
    R.phaseTime += dt;
    if (ph !== R.phase) {
      R.prev = R.phase; R.phase = ph; R.phaseTime = 0;
      AG.U.emit('r2phase', { phase: ph, prev: R.prev });
    }
  }

  /* THE TRANSFORMATION, continuously from the live flower: after 100 % it advances in game time
     (paused with the game), a little faster while the flower glows brighter and its particles are
     busier (p.map, p.constrain); the stages are windows on it (p.map → p.constrain), so each eases
     into the next; the windows follow the energy stage. */
  function transformStep(dt) {
    if (!R.bloomed || !p) return;
    if (AG.FSM.playing) {
      R.sinceBloom += dt;
      const drive = p.constrain(p.map(R.glow, 0.8, 2.4, 0.9, 1.2) * p.map(R.particles, 0, 40, 0.92, 1.12), 0.8, 1.35);
      R.transform = p.constrain(R.transform + dt / DURATION * drive, 0, 1);
    }
    const T = R.transform, win = (a, b) => p.constrain(p.map(T, a, b, 0, 1), 0, 1), S = R.stage;
    S.A = win(0.0, 0.18); S.B = win(0.12, 0.42); S.C = win(0.3, 0.72); S.D = win(0.6, 0.9); S.E = win(0.85, 1.0);
    R.windows = p.constrain(p.map(T, 0.2, 0.78, 0, 1), 0, 1);
  }

  function reset() {
    R.bloomed = false; R.sinceBloom = 0; R.transform = 0; R.windows = 0;
    for (const k in R.stage) R.stage[k] = 0;
  }

  AG.U.on('reset', reset); AG.U.on('replay', reset);   // Play again / R / a backward stage jump
  return Object.assign(R, { PHASES, init, update, reset, derive });
})();
