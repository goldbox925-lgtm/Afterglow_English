/* =====================================================================
   Round 02 · Memory Garden — the way in (after Round 01's finale)
   ---------------------------------------------------------------------
   Round 01 is unchanged and ends as before (fifth fragment → glide →
   ascent → end card). The end card now also offers "Enter the Memory
   Garden". Choosing it:

   APPROACH  She is back in free flight over the restored city, about
             170 m in front of ONE building whose facade has opened into
             a doorway of light (an arch, ~14 × 18 m) with a column of
             light above its roof. The fragments are off. The edge arrow
             points to the doorway while it is off screen. Within ~220 m,
             hands off the controls, she lines up with it gently (turn
             and height); the look-ahead avoidance is off while she is
             heading for it, so it never steers her away. The portal uses
             the collision module's prepared ROUND 02 portals: the
             doorway's rectangle on that face is passable, the rest of
             the building stays solid.
   ENTER     Through the doorway: she glides on into the light while the
             screen fades to white (1.1 s).
   INSIDE    The Memory Garden: AG.GardenScene (the Interactive Bloom)
             replaces the city image, with the p5-drawn light layer
             (AG.R2Layer) on top. Input arrives through p5's own mouse
             callbacks in js/sketch.js (pointerDown / pointerMove /
             pointerUp / hover / wheel below). Click the heart, drag outward to
             unfold; drag elsewhere to look around; wheel to zoom.
             "Back to the city" fades out and puts her just outside the
             doorway, facing away; the flower keeps its state, so flying
             back in continues where she left it.
   Play again / R / a stage jump closes everything (U 'reset').

   Choice of the building (deterministic from the city, no randomness):
   undamaged towers with a known facade (js/city/cityGenerator.js
   b.shafts: corporate / hive / industrial), whose facade at the
   doorway's height is within 3 m of the collision box, and whose
   doorway looks down a corridor that is clear of every building for
   the whole approach (AG.Flight.segmentClear). Among those, the one
   nearest downtown.
   ===================================================================== */
window.AG = window.AG || {};

AG.Garden = (function () {
  const U = AG.U, V = U.v3;
  const DOOR_W = 14, DOOR_H = 18;      // metres: the opening
  const START = 170;                   // metres in front of the doorway where she starts
  const ENTER_T = 1.1, FADE_IN = 1.4, LEAVE_T = 0.7;
  const G = { phase: 'off', portal: null, white: 0, open: 0, near: 0, scene: null, visits: 0, t: 0 };
  let p = null, info = null;
  const $ = (id) => document.getElementById(id);

  /* ---------- the doorway's building ---------- */
  function choose(info) {
    const FC = AG.CONFIG.flight, D = AG.CONFIG.city.downtown;
    const normals = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    let best = null;
    for (const b of info.boxes || []) {
      if (!b.building || b.damaged || b.hero || !b.shafts || !b.shafts.length) continue;
      for (const s of b.shafts) {
        const lo = s.y0 + DOOR_H / 2 + 3, hi = Math.min(s.y1 - DOOR_H / 2 - 3, 140);
        if (hi < lo || s.w < DOOR_W + 6 || s.d < DOOR_W + 6) continue;
        for (const n of normals) {
          // the real facade on this side vs the collision box face: the doorway must sit on both
          const half = n[0] ? s.w / 2 : s.d / 2, boxHalf = n[0] ? (b.x1 - b.x0) / 2 : (b.z1 - b.z0) / 2;
          if (boxHalf - half > 3 || boxHalf - half < -0.5) continue;
          for (let k = 0; k < 3; k++) {
            const y = U.lerp(hi, lo, k / 2);
            if (y < 22) continue;
            const c = [b.cx + n[0] * half, y, b.cz + n[2] * half];
            const from = V.add(c, V.scale(n, boxHalf - half + FC.radius + 2)), to = V.add(c, V.scale(n, START + 25));
            if (AG.Flight.segmentClear(from, to, DOOR_W / 2, b) < 0.999) continue;
            const score = -Math.hypot(c[0] - D.x, c[2] - D.z) + y * 0.5;
            if (!best || score > best.score) best = { box: b, c, n, w: DOOR_W, h: DOOR_H, inset: boxHalf - half, roof: b.top, score };
          }
        }
      }
    }
    return best;
  }

  function openPortal() {
    if (!G.portal && info) G.portal = choose(info);
    const P = G.portal;
    if (!P) return false;
    // the collision module's Round 02 portal on that face (its centre on the collision box face)
    const onBox = V.add(P.c, V.scale(P.n, P.inset));
    P.box.portals = [{ c: onBox, n: P.n, w: P.w, h: P.h + 2, open: true }];
    return true;
  }
  function closePortal() { if (G.portal && G.portal.box) delete G.portal.box.portals; }

  /* ---------- her place in front of the doorway ---------- */
  function placeOutside(dist, facingDoor) {
    const F = AG.Flight, P = G.portal, n = P.n;
    F.pos = V.add(P.c, V.scale(n, dist));
    F.pos[1] = P.c[1];
    // heading = [sin yaw, 0, −cos yaw]
    const dir = facingDoor ? V.scale(n, -1) : n;
    F.yaw = Math.atan2(dir[0], -dir[2]); F.yawRate = 0; F.bank = 0; F.vy = 0;
    F.speed = AG.CONFIG.flight.cruise;
    F.resetMotion();
  }
  function setFlightAssist(on) {
    const F = AG.Flight;
    F.noFragments = on; if (!on) { F.assistTurn = 0; F.assistVy = 0; F.avoidOff = false; F.assistHold = false; }
  }

  /* ---------- phases ---------- */
  function start() {
    if (G.phase !== 'off') return;
    if (!openPortal()) { AG.UI.toast('No doorway could open in this city — try a new city (N)'); return; }
    AG.Flight.reset();                       // (also resets the fragments; they stay off below)
    setFlightAssist(true);
    placeOutside(START, true);
    G.phase = 'approach'; G.t = 0; G.white = 0.9; G.open = 0;
    document.body.classList.remove('ended'); document.body.classList.add('garden');
    $('endCard').classList.remove('show');
    AG.Camera.snapNext();
    AG.U.emit('gardenPhase', { phase: G.phase });
  }

  function reset() {
    closePortal();
    setFlightAssist(false);
    if (AG.Flight.garden) AG.Flight.exitGarden();
    G.pendingAwaken = false; G.prox = 0;
    G.phase = 'off'; G.white = 0; G.open = 0; G.near = 0; G.t = 0; G.visits = 0;
    if (p && p.canvas) p.canvas.style.cursor = '';
    if (G.scene) { G.scene.flower.reset(); G.scene.resetView(); }
    document.body.classList.remove('garden', 'garden-inside');
    showInside(false);
  }

  function leave() { if (G.phase === 'inside') { G.phase = 'leave'; G.t = 0; if (G.scene) G.scene.up(); } }

  function showInside(on) {
    const el = $('gardenUI'); if (el) el.classList.toggle('show', on);
    document.body.classList.toggle('garden-inside', on);
  }

  /* the doorway in her frame: d = in front of the facade, along / up = in its plane */
  function local(pos) {
    const P = G.portal, r = V.sub(pos, P.c), t = [-P.n[2], 0, P.n[0]];
    return { d: V.dot(r, P.n), along: V.dot(r, t), up: r[1] };
  }

  /* called by sketch.js instead of the flight update while Round 02 runs (story playing) */
  function update(dt, input) {
    const F = AG.Flight, P = G.portal;
    G.t += dt;
    if (G.phase === 'approach') {
      G.open = Math.min(1, G.open + dt / 1.5);
      G.white = Math.max(0, G.white - dt / 1.2);
      // a gentle line-up, only when she is in front of the doorway and roughly heading for it
      const L = local(F.pos), rel = V.sub(P.c, F.pos);
      const want = Math.atan2(rel[0], -rel[2]), diff = Math.atan2(Math.sin(want - F.yaw), Math.cos(want - F.yaw));
      const inFront = L.d > 0 && L.d < 230;
      const k = inFront ? U.smooth(0.8, 0.25, Math.abs(diff)) * U.smooth(230, 120, L.d) : 0;
      F.assistTurn = U.clamp(diff * 1.4, -0.45, 0.45) * k;
      F.assistVy = U.clamp((P.c[1] - F.pos[1]) * 1.1, -12, 12) * (inFront ? U.smooth(0.9, 0.3, Math.abs(diff)) : 0);
      F.avoidOff = inFront && Math.abs(diff) < 0.6;
      // the last ~110 m, lined up: a rise still pending is dropped so she meets the opening (↓ still works)
      F.assistHold = inFront && L.d < 110 && Math.abs(diff) < 0.5;
      G.near = inFront ? U.smooth(160, 30, L.d) : 0;
      F.update(dt, input, true);
      // through the doorway?
      const L2 = local(F.pos), FC = AG.CONFIG.flight;
      if (L2.d < FC.radius + 0.6 && L2.d > -6 && Math.abs(L2.along) < P.w / 2 && L2.up > -P.h / 2 && L2.up < P.h / 2) {
        G.phase = 'enter'; G.t = 0; setFlightAssist(true); F.assistTurn = 0; F.assistVy = 0; F.assistHold = false;
        AG.U.emit('gardenPhase', { phase: G.phase });
      }
    } else if (G.phase === 'enter') {
      // she glides on into the light (no collision: the doorway is open), the screen turns white
      const sp = Math.max(12, F.flySpeed || F.speed || 12);
      F.pos = V.sub(F.pos, V.scale(P.n, sp * dt));
      G.white = U.smooth(0, ENTER_T * 0.9, G.t);
      if (G.t >= ENTER_T) {
        G.phase = 'inside'; G.t = 0; G.white = 1; G.visits++;
        if (!G.scene) G.scene = AG.GardenScene.create(p);
        showInside(true);
        enterGardenFlight();
        AG.U.emit('gardenPhase', { phase: G.phase });
      }
    } else if (G.phase === 'inside') {
      G.white = Math.max(0, 1 - G.t / FADE_IN);
      // her flight continues in the garden (AG.Flight's garden mode: p5.Vector arrive steering)
      F.update(dt, input, true);
      // PROXIMITY: p.dist to the flower's heart → p.map (9 m far … 3.6 m close) → p.constrain 0..1
      const f = G.scene.flower, H = f.heart().c;
      const d = p.dist(F.pos[0], F.pos[1], F.pos[2], H[0], H[1], H[2]);
      G.prox = p.constrain(p.map(d, 9, 3.6, 0, 1), 0, 1);
      f.setVisitor(F.pos, G.prox);
      // a click on the heart before she arrived waited for her: the flower wakes as she arrives
      if (G.pendingAwaken && F.gardenArrived) { G.pendingAwaken = false; f.awaken(); }
    } else if (G.phase === 'leave') {
      G.white = U.smooth(0, LEAVE_T, G.t);
      if (G.t >= LEAVE_T) {
        showInside(false);
        F.exitGarden();                       // back to her city flight
        placeOutside(P.inset + AG.CONFIG.flight.radius + 14, false);
        setFlightAssist(true);
        G.phase = 'approach'; G.t = 0; G.white = 1;
        AG.Camera.snapNext();
        AG.U.emit('gardenPhase', { phase: G.phase });
      }
    }
  }

  /* the garden scene replaces the city image while inside (or fading out of it) */
  function drawsScene() { return G.phase === 'inside' || G.phase === 'leave'; }
  function draw(dt, CH) {
    G.scene.draw(dt, { CH });                 // the garden, with her in it (the city renderer's character drawing)
    if (!G.layer) G.layer = AG.R2Layer.create(p);
    G.layer.draw(G.scene);                    // the p5-drawn light layer, on top (js/garden/r2Layer.js)
    const f = G.scene.flower;
    const pct = Math.round(f.bloom * 100);
    if ($('gardenPct').textContent !== pct + '%') $('gardenPct').textContent = pct + '%';
    $('gardenBar').style.width = (f.bloom * 100).toFixed(1) + '%';
    const st = f.stageName() + (f.dragging ? ' · unfolding' : '');
    if ($('gardenStage').textContent !== st) $('gardenStage').textContent = st;
  }

  /* her entrance into the garden: the same flight state, now in the garden mode. She glides in
     from the left of the view and settles front-left of the flower, where the camera sees both. */
  function enterGardenFlight() {
    const sc = G.scene, c = sc.flower.center;
    sc.camera();
    const camAz = Math.atan2(sc.view.eye[2] - c[2], sc.view.eye[0] - c[0]);
    const az0 = camAz + 1.8, r = 7.5;
    const start = [c[0] + Math.cos(az0) * r, c[1] + 3.3, c[2] + Math.sin(az0) * r];
    const inward = [-Math.cos(az0) * 2.4, -0.2, -Math.sin(az0) * 2.4];
    AG.Flight.enterGarden({ center: c.slice(), start, v0: inward, az: camAz + 0.8 });
    G.pendingAwaken = false;
  }

  /* the doorway and its beacon, for the city renderer */
  function portalDraw() {
    if (!G.portal || (G.phase !== 'approach' && G.phase !== 'enter') || G.open <= 0.001) return null;
    const P = G.portal;
    return { c: P.c, n: P.n, w: P.w, h: P.h, beacon: [P.box.cx, P.roof, P.box.cz], open: G.open, near: G.near };
  }
  /* for the UI's edge arrow */
  function target() { return G.phase === 'approach' && G.portal ? G.portal.c : null; }

  /* ---------- input inside: called from the ONE input path, p5's own mouse callbacks in
     js/sketch.js (p.mousePressed / mouseDragged / mouseReleased / mouseMoved / mouseWheel, which
     p5 also fires for touch). No listeners of its own. ---------- */
  function wantsPointer() { return G.phase === 'inside' && !!G.scene && AG.FSM.playing; }
  function pointerDown(x, y) {
    if (!wantsPointer()) return false;
    const onHeart = G.scene.hover(x, y);
    // she is still flying in: a click on the sleeping flower's heart waits for her (no drag yet)
    if (onHeart && !G.scene.flower.awake && !AG.Flight.gardenArrived) { G.pendingAwaken = true; return true; }
    return G.scene.down(x, y) || true;
  }
  function pointerMove(x, y) { if (wantsPointer()) G.scene.move(x, y); }
  function pointerUp() { if (G.scene) G.scene.up(); }
  function hover(x, y) {
    if (!wantsPointer()) return;
    const on = G.scene.hover(x, y);
    if (p && p.canvas) p.canvas.style.cursor = on ? 'pointer' : '';
  }
  function wheel(d) { if (wantsPointer()) G.scene.wheel(d); }

  function init(p5inst) {
    p = p5inst;
    $('endGarden').addEventListener('click', start);
    $('gardenBack').addEventListener('click', leave);
    $('gardenReset').addEventListener('click', () => { if (G.scene) G.scene.flower.reset(); });
    AG.U.on('reset', reset);
    AG.U.on('replay', reset);
  }
  /* a new city: forget the old doorway */
  function setWorld(i) { reset(); G.portal = null; info = i; }
  function resize() { if (G.scene) G.scene.resize(); }

  return Object.assign(G, {
    init, setWorld, resize, start, reset, leave, update, draw, drawsScene, portalDraw, target, choose,
    wantsPointer, pointerDown, pointerMove, pointerUp, hover, wheel,
    isActive: () => G.phase !== 'off'
  });
})();
