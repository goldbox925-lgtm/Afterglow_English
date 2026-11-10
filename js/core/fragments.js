/* =====================================================================
   Fragments — the five collectibles of state 05 (AFTERGLOW)
   ---------------------------------------------------------------------
   Five luminous, flower-like crystal fragments of her recovery appear one
   at a time AHEAD of her: VOICE (blue), COURAGE (pink), JOY (gold),
   FREEDOM (violet), SELF-LOVE (warm; a little higher, toward the light).

   Pacing: the first appears after FIRST_DELAY (6 s) of active flight, each
   next one NEXT_DELAY (10 s) after the previous was collected. Active flight
   only: the timer runs in update(), which AG.Flight calls only while she is
   controllable (not during the lift-off, not while paused, not after the
   ending). Replay resets it (reset()).

   Placement (at the moment of the reveal): ~100–120 m ahead of her current
   position and heading, 18–40 m to one side (≤ ~22° off her path), at her
   height (SELF-LOVE +25 m). It must be free air with an open straight path
   from her; otherwise deterministic fallbacks are tried: the other side,
   nearer, straight ahead, then headings 17–46° to either side (at her height,
   then 15 / 30 m higher), finally just above the rooftops.

   Collection: she collects a fragment by flying within COLLECT_RADIUS of
   it. The check uses p5.js vectors:
       p5.Vector.dist(fragment.pos, herPos) < COLLECT_RADIUS
   Each fragment is counted once (a `collected` flag). Collecting one
   gives an immediate burst (the sprite flares and expands for ~1 s,
   drawn by the network-node shader, kind 5). The fifth collection calls
   AG.Flight.enterLight(): the existing ending sequence.

   Deterministic: distances and sides come from a stateless hash of the city
   (no random generator), so the same seed and the same flight give the same
   spots; the city's random sequence is never consumed.
   ===================================================================== */
window.AG = window.AG || {};

AG.Fragments = (function () {
  const U = AG.U;
  const COLLECT_RADIUS = 20;     // metres
  const BURST = 1.0;             // seconds of collection feedback
  const FIRST_DELAY = 6;         // seconds of ACTIVE flight before the first fragment appears
  const NEXT_DELAY = 10;         // ... and after each collection, before the next one appears
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
  /* Sequence: only the next uncollected fragment exists. It is revealed after FIRST_DELAY /
     NEXT_DELAY seconds of active flight (counted in update(), which AG.Flight calls only while
     she is controllable: not during the lift-off, not while paused, not after the ending);
     after each collection the wait starts again. A fragment that is not revealed cannot be
     collected. */
  const Fr = { list: [], collected: 0, ready: false, waitT: 0, shown: false };
  let p = null, her = null, boxes = [], heroBox = null, keyJ = null;

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
    boxes = info.boxes; heroBox = boxes.find((b) => b.hero);
    const key = cityKey(info);
    keyJ = (k, a) => (U.hash(key * 0.0137 + k * 7.31 + a) - 0.5);            // stateless jitter −0.5..0.5
    // positions are chosen when each fragment is revealed (placeAhead)
    Fr.list = DEFS.map((d) => ({ id: d.id, col: d.col, desc: d.desc, found: d.found, pos: p.createVector(0, 0, 0), collected: false, at: -1e9 }));
    Fr.ready = true;
    reset();
  }

  /* where the next fragment appears: ahead of her, moderately to one side, reachable */
  function placeAhead(k, herPos, yaw) {
    const FC = AG.CONFIG.flight, margin = FC.wallMargin * 0.5 + 2;
    const fwd = [Math.sin(yaw), 0, -Math.cos(yaw)], right = [Math.cos(yaw), 0, Math.sin(yaw)];
    const D = 110 + 20 * keyJ(k, 1), L = 18 + 44 * Math.abs(keyJ(k, 2)), side = keyJ(k, 3) > 0 ? 1 : -1;
    const lift = k === DEFS.length - 1 ? 25 : 0;
    const yMin = FC.minAlt + 8, yMax = FC.finaleAltitude + 15;
    const at = (d, l, dy) => [herPos[0] + fwd[0] * d + right[0] * l, U.clamp(herPos[1] + lift + dy, yMin, yMax), herPos[2] + fwd[2] * d + right[2] * l];
    const ok = (c) => clearAt(c, boxes, margin) && AG.Flight.segmentClear(herPos, c, 3, heroBox) >= 0.999;
    const tries = [[D, side * L, 0], [D, -side * L, 0], [D * 0.75, side * L * 0.7, 0], [D * 0.75, -side * L * 0.7, 0], [D * 1.3, side * L, 0],
      [D, 0, 0], [D * 0.6, 0, 0]];
    for (const [d, l, dy] of tries) { const c = at(d, l, dy); if (ok(c)) return c; }
    // her heading is blocked (a wall ahead): try headings a little to either side at her height,
    // then a little higher, before anything else
    const turned = (o, d, dy) => { const y = yaw + o; return [herPos[0] + Math.sin(y) * d, U.clamp(herPos[1] + lift + dy, yMin, yMax), herPos[2] - Math.cos(y) * d]; };
    for (const dy of [0, 15, 30]) for (const o of (dy ? [0, 0.3, 0.55, 0.8] : [0.3, 0.55, 0.8])) for (const s of [side, -side]) for (const d of [D, D * 0.65]) {
      const c = turned(s * o, d, dy); if (ok(c)) return c;
    }
    // last resort: just above the rooftops along the way ahead (a double-tap of ↑ gets her there)
    for (let dy = 45; dy <= 300; dy += 15) { const c = at(D, side * L, dy); if (ok(c)) return c; }
    return at(D * 0.6, 0, 0);
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
      if (Fr.waitT < (Fr.collected === 0 ? FIRST_DELAY : NEXT_DELAY)) return false;
      const c = placeAhead(Fr.collected, herPos, AG.Flight.yaw);
      f.pos.set(c[0], c[1], c[2]);
      Fr.shown = true; f.shownAt = at;
      U.emit('fragmentReveal', { id: f.id, n: Fr.collected + 1, pos: [f.pos.x, f.pos.y, f.pos.z] });
    }
    her.set(herPos[0], herPos[1], herPos[2]);
    if (p5.Vector.dist(f.pos, her) < COLLECT_RADIUS) {                 // the distance check
      f.collected = true; f.at = at; Fr.collected++;                   // counted exactly once
      Fr.shown = false; Fr.waitT = 0;                                  // the next one waits NEXT_DELAY s
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

  return Object.assign(Fr, { build, reset, update, sprites, active, COLLECT_RADIUS, FIRST_DELAY, NEXT_DELAY });
})();
