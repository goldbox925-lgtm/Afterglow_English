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
    bloomed: false            // has the flower ever reached 100 % (the building's transformation stays)
  };

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
    const ph = derive();
    R.phaseTime += dt;
    if (ph !== R.phase) {
      R.prev = R.phase; R.phase = ph; R.phaseTime = 0;
      AG.U.emit('r2phase', { phase: ph, prev: R.prev });
    }
  }

  function reset() { R.bloomed = false; }

  AG.U.on('reset', reset); AG.U.on('replay', reset);   // Play again / R / a backward stage jump
  return Object.assign(R, { PHASES, update, reset, derive });
})();
