/* =====================================================================
   Fragments — the five collectibles of state 05 (AFTERGLOW)
   ---------------------------------------------------------------------
   Five luminous, flower-like crystal fragments of her recovery hang in
   the air along her flight route, rising toward the light:

     1 VOICE      blue     straight ahead of her roof, in view as soon as she can fly
     2 COURAGE    pink     at the mouth of the flight canyon
     3 JOY        gold     further along the canyon, a little higher
     4 FREEDOM    violet   high above the canyon
     5 SELF-LOVE  warm     just below the light threshold

   Collection: she collects a fragment by flying within COLLECT_RADIUS of
   it. The check uses p5.js vectors:
       p5.Vector.dist(fragment.pos, herPos) < COLLECT_RADIUS
   Each fragment is counted once (a `collected` flag). Collecting one
   gives an immediate burst (the sprite flares and expands for ~1 s,
   drawn by the network-node shader, kind 5). The fifth collection calls
   AG.Flight.enterLight(): the existing ending sequence.

   Deterministic: positions come only from the city's geometry (the
   flight avenue, the street in front of her, building boxes) plus small
   offsets from a stateless hash of that geometry. No random generator is
   used, so neither the city's random sequence nor any other gameplay
   randomness is consumed. Every position is checked against all
   buildings, and the path from one fragment to the next must be open,
   so none can be unreachable.
   ===================================================================== */
window.AG = window.AG || {};

AG.Fragments = (function () {
  const U = AG.U;
  const COLLECT_RADIUS = 20;     // metres
  const BURST = 1.0;             // seconds of collection feedback
  const REVEAL_DELAY = 15;       // seconds of ACTIVE flight before the next fragment appears
  // names, colours and descriptions from the project's Collectibles reference sheet;
  // `found` = the collection message (pattern from the HUD reference recording)
  const DEFS = [
    { id: 'VOICE',     col: [0.42, 0.66, 1.00], desc: 'Find her voice again',               found: 'You found your voice.' },
    { id: 'COURAGE',   col: [1.00, 0.42, 0.80], desc: 'Move forward despite fear',          found: 'You found your courage.' },
    { id: 'JOY',       col: [1.00, 0.70, 0.30], desc: 'Feel happiness again',               found: 'You found your joy.' },
    { id: 'FREEDOM',   col: [0.74, 0.52, 1.00], desc: 'Let go of what no longer holds her', found: 'You found your freedom.' },
    { id: 'SELF-LOVE', col: [1.00, 0.86, 0.72], desc: 'Return to herself',                  found: 'You found your self-love.' }
  ];
  // fixed spark directions for the collection burst (deterministic, no randomness)
  const SPARK_DIRS = Array.from({ length: 14 }, (_, i) => {
    const y = 1 - (i + 0.5) / 14 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    return [Math.cos(a) * r, y * 0.8, Math.sin(a) * r];
  });
  /* Sequence: only the next uncollected fragment exists. It is revealed after REVEAL_DELAY
     seconds of active flight (counted in update(), which AG.Flight calls only while she is
     controllable: not during the lift-off, not while paused, not after the ending); after
     each collection the wait starts again. A fragment that is not revealed cannot be collected. */
  const Fr = { list: [], collected: 0, ready: false, waitT: 0, shown: false };
  let p = null, her = null;

  /* a stateless 0..1 value per city: hash of the city's own building boxes */
  function cityKey(info) {
    let s = 0;
    for (const b of info.boxes) s = (s + b.top * 0.731 + b.x0 * 0.173 + b.z0 * 0.317) % 9973;
    return s;
  }

  /* free air: not inside (or too close to) any building at that height */
  function clearAt(pos, boxes, m) {
    for (const b of boxes) {
      if (b.hero) continue;
      if (pos[0] > b.x0 - m && pos[0] < b.x1 + m && pos[2] > b.z0 - m && pos[2] < b.z1 + m && pos[1] < b.top + m) return false;
    }
    return true;
  }

  function build(info, p5inst) {
    p = p5inst;
    her = p.createVector(0, 0, 0);
    const FC = AG.CONFIG.flight, H0 = info.hero.H0, X = info.flightX, Z = info.frontStreetZ, key = cityKey(info);
    const j = (k, a) => (U.hash(key * 0.0137 + k * 7.31 + a) - 0.5);          // stateless jitter −0.5..0.5
    // the planned route: straight ahead of her roof → the flight canyon → up toward the light.
    // VOICE sits ~85 m ahead over the low 'open vista' blocks, so it is in view the moment the
    // lift-off ends (about 4 s of flight away), not on top of her or the camera.
    const plan = [
      [0.6 + 16 * j(0, 1), H0 + 3 + 4 * j(0, 2), -24 - 85 + 14 * j(0, 3)],
      [X, H0 - 6 + 8 * j(1, 2), Z - 90 + 30 * j(1, 1)],
      [X, H0 + 30 + 14 * j(2, 2), Z - 260 + 50 * j(2, 1)],
      [X, H0 + 140 + 30 * j(3, 2), Z - 420 + 50 * j(3, 1)],
      [X, FC.finaleAltitude - 18, Z - 560 + 50 * j(4, 1)]
    ];
    const boxes = info.boxes, margin = FC.wallMargin * 0.5 + 2;   // the same clearance her own flight keeps from walls
    const heroBox = boxes.find((b) => b.hero);                       // her own roof: she takes off from it, never collides with it
    Fr.list = [];
    let prev = [0.6, H0 + 4.2, -24];                                          // where the flight starts
    plan.forEach((pt, k) => {
      // nudge (deterministically) until the spot is free air AND the way there from the previous one is open
      const tries = [[0, 0], [0, 12], [0, -12], [0, 24], [-30, 0], [30, 0], [-30, 12], [30, 12], [0, 36], [-60, 0], [60, 0], [0, 48]];
      let pos = null, turnPoints = [];
      for (const [dz, dy] of tries) {
        const c = [pt[0], Math.max(FC.minAlt + 8, Math.min(FC.finaleAltitude - 10, pt[1] + dy)), pt[2] + dz];
        if (!clearAt(c, boxes, margin)) continue;
        // the way from the previous fragment must be open. Into the canyon (k = 1): the direct way;
        // else straight on from VOICE and left along the first open cross street into the canyon;
        // else back along the street in front of her to the canyon corner
        const ym = (prev[1] + c[1]) / 2;
        const open = (legs) => legs.every(([u, v]) => AG.Flight.segmentClear(u, v, 3, heroBox) >= 0.999);
        let route = null;
        if (open([[prev, c]])) route = [];
        else if (k === 1) {
          const zs = [];
          for (let z = Math.max(prev[2], c[2]) + 10; z >= Math.min(prev[2], c[2]) - 120; z -= 2) zs.push(z);
          zs.sort((u, v) => Math.abs(u - c[2]) - Math.abs(v - c[2]));
          for (const zc of zs) {
            const a1 = [prev[0], ym, zc], a2 = [X, ym, zc];
            if (open([[prev, a1], [a1, a2], [a2, c]])) { route = [a1, a2]; break; }
          }
          if (!route && open([[prev, [prev[0], ym, Z]], [[prev[0], ym, Z], [X, ym, Z]], [[X, ym, Z], c]])) route = [[prev[0], ym, Z], [X, ym, Z]];
        }
        if (!route) continue;
        pos = c; turnPoints = route; break;
      }
      if (!pos) pos = [pt[0], FC.finaleAltitude - 10, pt[2]];               // last resort: open sky above the canyon
      Fr.list.push({ id: DEFS[k].id, col: DEFS[k].col, desc: DEFS[k].desc, found: DEFS[k].found, pos: p.createVector(pos[0], pos[1], pos[2]), route: turnPoints, collected: false, at: -1e9 });
      prev = pos;
    });
    Fr.ready = true;
    reset();
  }

  function reset() { Fr.collected = 0; Fr.waitT = 0; Fr.shown = false; Fr.list.forEach((f) => { f.collected = false; f.at = -1e9; }); }
  const nextOne = () => Fr.list.find((f) => !f.collected) || null;

  /* called every frame of ACTIVE flight (dt = seconds of that frame); returns true when the
     fifth one is collected */
  function update(herPos, at, dt) {
    if (!Fr.ready) return false;
    const f = nextOne();
    if (!f) return false;
    if (!Fr.shown) {                                                   // waiting: count active flight only
      Fr.waitT += dt || 0;
      if (Fr.waitT < REVEAL_DELAY) return false;
      Fr.shown = true; f.shownAt = at;
      U.emit('fragmentReveal', { id: f.id, n: Fr.collected + 1, pos: [f.pos.x, f.pos.y, f.pos.z] });
    }
    her.set(herPos[0], herPos[1], herPos[2]);
    if (p5.Vector.dist(f.pos, her) < COLLECT_RADIUS) {                 // the distance check
      f.collected = true; f.at = at; Fr.collected++;                   // counted exactly once
      Fr.shown = false; Fr.waitT = 0;                                  // the next one waits 15 s again
      U.emit('fragment', { id: f.id, n: Fr.collected, pos: [f.pos.x, f.pos.y, f.pos.z] });
      return Fr.collected === Fr.list.length;
    }
    return false;
  }

  /* the revealed fragment, if any (for the hint arrow) */
  function active() { const f = nextOne(); return f && Fr.shown ? f : null; }

  /* sprites for the network-node shader: kind 5 = fragment (5 + burst 0..0.9 while collecting),
     kind 6 = one spark of the collection burst (6 + age 0..0.9) */
  function sprites(at) {
    const out = [];
    for (const f of Fr.list) {
      const b = f.collected ? (at - f.at) / BURST : 0;
      if (f.collected && b >= 1) continue;
      if (!f.collected && (f !== nextOne() || !Fr.shown)) continue;    // only the revealed next one is shown
      out.push({ pos: [f.pos.x, f.pos.y, f.pos.z], kind: 5 + 0.9 * U.clamp(b, 0, 1), col: f.col, lit: 1 });
      // collection sparkle burst AT the fragment's position in the city: sparks fly outward and fade
      if (f.collected) {
        const e = 1 - Math.pow(1 - b, 3), d = 3 + 30 * e;
        for (const v of SPARK_DIRS) out.push({ pos: [f.pos.x + v[0] * d, f.pos.y + v[1] * d - 6 * b * b, f.pos.z + v[2] * d], kind: 6 + 0.9 * b, col: [f.col[0] * 0.6 + 0.4, f.col[1] * 0.6 + 0.4, f.col[2] * 0.6 + 0.4], lit: 1 });
      }
    }
    return out;
  }

  return Object.assign(Fr, { build, reset, update, sprites, active, COLLECT_RADIUS, REVEAL_DELAY });
})();
