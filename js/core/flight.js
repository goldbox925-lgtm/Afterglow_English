/* =====================================================================
   Flight — state 05, under the viewer's control.
   ---------------------------------------------------------------------
   CONTROLS (Phase 5; keyboard and the touch pad set the same F.keys)
                ← →        steer (mouse x also steers, with a dead zone)
                ↑ tap      a small upward lift (≈ 13 m)
                ↑ ↑ double-tap (within 0.4 s): a noticeable rise (≈ 45 m in all),
                           eased in and out, never a snap
                ↑ hold     forward speed eases from cruise (21) to boost (30 m/s)
                ↓          descend (cancels any rise still pending)
                no input   a level glide: no sinking, no drifting
                holding ← or → tightens the turn gradually (U-turn in ≈ 2.3 s)
                Holding ↑ never ends the story; the fifth fragment does.
                (The ascension ARC below is no longer started by ↑.)
   FREE_FLIGHT  horizontal flight through the restored city.
                mouse x (with a dead zone) and ← → set the turn rate,
                ↓ descends. Speed eases toward a cruise speed.
   ASCENSION    ↑ ONLY. Holding ↑ starts an emotional ARC measured in
                seconds of held ascension (ascT), never in clock time:
                  SUFFERING   0–1.4 s  she stops, curls up, sinks (heaviness)
                  RESISTANCE  1.4–3.8  straining, kneeling, looking up
                  RELEASE     3.8–6.2  arms open, the weight lets go
                  LEVITATION  6.2–12   weightless, rising slowly, full body
                  ASCENSION   12 s +   rising fast, the city falls away
                Releasing ↑ pauses: the climb eases to a hover and the pose
                holds. After 4 s without ↑ she returns to free flight; once
                RELEASE has been passed, the next ↑ resumes from levitation
                (liberation is not undone).
   FRAGMENTS    five collectibles along her route (js/core/fragments.js).
                Collecting the fifth enters the light (LIGHT): the existing
                ending sequence, via enterLight(): first a steerable GLIDE
                above the rooftops (the camera pulls back to show the city),
                then the slow ASCENT into the sunrise (drift()).

   MOTION & COLLISIONS (move): her velocity is a p5.Vector that follows
   the controls (heading × speed + vertical speed) with a short response;
   near a facade or roof the speed toward it eases out (soft approach),
   and on contact she SLIDES: the into-surface part of the velocity is
   removed, the rest carries her along the building (js/core/collision.js:
   sub-stepped sphere vs building boxes, so she cannot tunnel through).
   Hands off the controls, a gentle look-ahead turn (steady side choice)
   and a facade alignment help her glide round buildings; any steering
   input overrides both. Everything uses dt (from p.deltaTime), so the
   behaviour is the same at 10, 30 or 120 fps.

   segmentClear / clearance are shared with the camera (depth-aware
   chase) and the interaction module (line-of-sight).
   ===================================================================== */
window.AG = window.AG || {};

AG.Flight = (function () {
  const U = AG.U, V = U.v3;
  const F = { ready: false, pos: [0, 0, 0], yaw: 0, yawRate: 0, speed: 0, vy: 0, bank: 0, upright: 0, asc: 0, finale: false, keys: {},
    ascT: 0, released: 99, arc: false, phase: 'FLIGHT', holding: false };
  const PHASES = [['SUFFERING', 0], ['RESISTANCE', 1.4], ['RELEASE', 3.8], ['LEVITATION', 6.2], ['ASCENSION', 12]];
  const phaseOf = (a) => { let n = PHASES[0][0]; for (const [id, t] of PHASES) if (a >= t) n = id; return n; };
  const FINALE_HOLD = 3;
  let boxes = [], H0 = 92, trail = [], trailClock = 0, upHeld = 0, sinceUp = 99, cloudHit = false;
  // motion (p5.js vectors): vel = her actual velocity (m/s), cmd = what the controls ask for this
  // frame, pos = scratch position for the collision sweep
  let p = null, vel = null, cmd = null, pos = null;

  function build(info, p5inst) {
    boxes = info.boxes || [];
    H0 = info.hero.H0;
    if (p5inst) p = p5inst;
    if (p) { vel = p.createVector(0, 0, 0); cmd = p.createVector(0, 0, 0); pos = p.createVector(0, 0, 0); }
    if (AG.Collision) AG.Collision.setBoxes(boxes);
    F.ready = true;
    reset();
  }
  /* forget the current motion (used by reset and by tests that place her somewhere) */
  function resetMotion() { if (vel) vel.set(0, 0, 0); F.flySpeed = 0; F.contact = false; F.avoidSide = 0; F.avoidHold = 0; }

  /* the moment she leaves the roof: just past the broken parapet, facing the city */
  function reset() {
    F.pos = [0.6, H0 + 4.2, -24]; F.yaw = 0; F.yawRate = 0; F.speed = 0; F.vy = 0; F.bank = 0; F.upright = 0; F.asc = 0; F.finale = false;
    F.ascT = 0; F.released = 99; F.arc = false; F.phase = 'FLIGHT'; F.holding = false;
    trail = []; for (let i = 0; i < 24; i++) trail.push(F.pos.slice());
    upHeld = 0; sinceUp = 99; cloudHit = false; pendingLift = 0; liftLeft = 0; lastTapAt = -1e9; steerHeld = 0; upDownAt = 0; upHeldT = 0;
    F.boosting = false; F.lifts = 0; F.doubleTaps = 0; F.finaleT = 0; F.gliding = false; F.finales = 0;
    F.noFragments = false; F.assistTurn = 0; F.assistVy = 0; F.avoidOff = false; F.assistHold = false;   // Round 02 (js/garden/garden.js)
    F.garden = null; F.gardenArrived = false;                                                              // Round 02: inside the Memory Garden
    F.keysFirst = false; F.mouseParked = null; sinceVert = 99; sinceSteer = 99;                            // Round 02: the player's input before any assist
    resetMotion();
    if (AG.Fragments) AG.Fragments.reset();          // every flight starts with all five fragments in place
  }

  /* the existing ending: enter the light (LIGHT phase, then the 'finale' sequence) */
  function enterLight() {
    if (F.finale) return;
    const prev = F.phase;
    F.finale = true; F.phase = 'LIGHT'; F.finaleT = 0; F.gliding = true; F.finales = (F.finales || 0) + 1;
    AG.U.emit('ascPhase', { phase: 'LIGHT', prev });
    AG.U.emit('finale');
  }

  /* key / touch input → F.keys. Taps of ↑ are detected HERE, at the press/release events
     (wall time), so even a tap shorter than one frame is never lost; update() applies them. */
  let upDownAt = 0, pendingLift = 0, lastTapAt = -1e9, liftLeft = 0, steerHeld = 0, upHeldT = 0, sinceVert = 99, sinceSteer = 99;
  function press(k, on) {
    const was = !!F.keys[k];
    F.keys[k] = !!on;
    if (k !== 'up') return;
    const now = performance.now();
    if (on && !was) upDownAt = now;
    else if (!on && was) {
      const active = AG.FSM.playing && AG.FSM.state === 'AFTERGLOW' && !AG.FSM.cinematic && !F.finale;
      const FC = AG.CONFIG.flight;
      if (active && now - upDownAt < FC.tapMax * 1000) {
        // a second tap soon after the first = a double-tap: the bigger, deliberate rise
        const dbl = now - lastTapAt < FC.doubleTapWindow * 1000;
        pendingLift += dbl ? FC.doubleLift : FC.tapLift;
        lastTapAt = dbl ? -1e9 : now;
        if (dbl) F.doubleTaps = (F.doubleTaps || 0) + 1;
      }
    }
  }

  const heading = (yaw) => [Math.sin(yaw), 0, -Math.cos(yaw)];
  function insideBox(p, b, m) { return p[0] > b.x0 - m && p[0] < b.x1 + m && p[2] > b.z0 - m && p[2] < b.z1 + m && p[1] < b.top + m * 0.5 && !b.hero; }
  function blockedAt(p, m) { for (const b of boxes) if (insideBox(p, b, m)) return b; return null; }

  /* vertical speed while ↑ is held, by phase: heavy → straining → weightless → soaring */
  function arcVy(a, FC) {
    // ArrowUp must lift her immediately. No negative velocity / sinking phase.
    // Ease into a strong vertical ascent while the key is held.
    return U.lerp(38, Math.max(75, FC.ascend * 4), U.smooth(0, 1.6, a));
  }

  /* gentle look-ahead steering for HANDS-OFF flight: if a building is ahead, turn softly toward
     the side with more room. The side is chosen once and kept while the way is blocked (plus a
     short hold), so she never wobbles left-right in front of a wall. Returns extra turn (rad/s). */
  function avoidTurn(FC, strength, dt) {
    // test her actual path: a ray along her heading, with a margin just under her collision
    // radius. (The old test inflated a single point 40 m ahead by 7 m, so a passable street, or
    // flying parallel to a facade at her normal distance, counted as blocked and she turned
    // into the walls or back on herself.) She now turns only while she is heading into a building.
    // Round 02: heading for the open doorway, nothing must turn her away from it
    if (F.avoidOff) { F.avoidSide = 0; F.avoiding = false; return 0; }
    const m = FC.radius - 0.2, len = FC.probe + F.speed * 0.6, hero = boxes.find((b) => b.hero);
    const clearAlong = (yaw, L) => segmentClear(F.pos, V.add(F.pos, V.scale(heading(yaw), L)), m, hero);
    if (!F.arc && clearAlong(F.yaw, len) < 1) {
      if (!F.avoidSide) {
        const cl = clearAlong(F.yaw - 0.7, FC.probe), cr = clearAlong(F.yaw + 0.7, FC.probe);
        F.avoidSide = cl > cr ? -1 : cr > cl ? 1 : (AG.Flight.clearance(V.add(F.pos, V.scale(heading(F.yaw - 0.7), FC.probe))) > AG.Flight.clearance(V.add(F.pos, V.scale(heading(F.yaw + 0.7), FC.probe))) ? -1 : 1);
      }
      F.avoidHold = 0.5;
    } else if ((F.avoidHold = Math.max(0, (F.avoidHold || 0) - dt)) === 0) F.avoidSide = 0;
    F.avoiding = !!F.avoidSide;
    return (F.avoidSide || 0) * strength;
  }

  /* steering input: mouse x (dead zone) + ← → (a held arrow tightens gradually) */
  function steerTurn(FC, input, dt) {
    const k = F.keys;
    let mx = (input && input.mx) || 0;
    mx = Math.abs(mx) < FC.deadZone ? 0 : (mx - Math.sign(mx) * FC.deadZone) / (1 - FC.deadZone);
    const steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    // Round 02: a pointer left resting on a button (Back to the city, R02) does not steer her until
    // it moves, and a held arrow key wins over the mouse. (Both off in Round 01: unchanged there.)
    if (F.mouseParked) {
      const I = AG.Input;
      if (Math.hypot((I.px || 0) - F.mouseParked[0], (I.py || 0) - F.mouseParked[1]) > 24) F.mouseParked = null; else mx = 0;
    }
    if (F.keysFirst && steer) mx = 0;
    steerHeld = steer ? steerHeld + dt : 0;
    const tighten = 1 + FC.turnTighten * U.smooth(0.4, 1.4, steerHeld);
    F.turnTight = tighten;
    F.steering = steer !== 0 || mx !== 0;                     // the player is steering right now
    return mx * FC.mouseTurn + steer * FC.turnRate * tighten;
  }

  /* MOTION — the commanded velocity (heading × speed, plus the vertical speed) is followed by her
     actual velocity with a short, frame-rate-independent response (p5.Vector.lerp with
     1 − e^(−response·dt)), its length limited with p.constrain. Then:
       1. gentle proximity (AG.Collision.soften): toward a facade or roof her speed may not exceed
          approach × the gap left, so she comes to rest at the boundary;
       2. collide & slide (AG.Collision.sweep): sub-stepped movement; the part of the velocity
          going into a surface is removed, the part along it is kept;
       3. ground and ceiling.
     dt comes from p.deltaTime (sketch.js), clamped to 0.1 s; the sweep sub-steps it. */
  function move(dt, FC) {
    if (!vel) {                                               // no p5 instance (should not happen): old straight move
      F.pos = V.add(F.pos, V.add(V.scale(heading(F.yaw), F.speed * dt), [0, F.vy * dt, 0])); return;
    }
    const h = heading(F.yaw);
    cmd.set(h[0] * F.speed, F.vy, h[2] * F.speed);
    vel.lerp(cmd, 1 - Math.exp(-FC.response * dt));
    const sp = vel.mag(), lim = p.constrain(sp, 0, FC.boostMax + FC.riseSpeed);
    if (sp > lim) vel.setMag(lim);
    pos.set(F.pos[0], F.pos[1], F.pos[2]);
    // the soft approach starts early enough to ease out her current speed (≥ speed / approach)
    const reach = Math.max(FC.softReach, vel.mag() / FC.approach + 1);
    F.near = AG.Collision.soften(pos, vel, FC.radius, dt, FC.approach, reach);
    const contacts = AG.Collision.sweep(pos, vel, FC.radius, dt);
    F.contact = contacts.length > 0 || F.near < 0.6;          // touching, or resting against a surface
    if (pos.y < FC.minAlt) { pos.y = FC.minAlt; if (vel.y < 0) vel.y = 0; }
    // ceiling just above the light threshold: the ending now comes from the fifth fragment,
    // so without it she could rise for ever and lose the fragments below; she hovers here instead
    if (pos.y > FC.finaleAltitude + 30) { pos.y = FC.finaleAltitude + 30; if (vel.y > 0) vel.y = 0; if (F.vy > 0) F.vy = 0; liftLeft = 0; }
    F.pos = [pos.x, pos.y, pos.z];
    F.vel = [vel.x, vel.y, vel.z];
    // her actual ground speed (for the camera and effects), eased so contact never flickers it
    F.flySpeed = U.damp(F.flySpeed || 0, Math.hypot(vel.x, vel.z), 8, dt);
  }

  /* sliding along a facade with no steering input: turn her softly to face the way she is
     actually gliding (≤ alignRate rad/s), so she flies along the wall and round its corners */
  function alignTurn(FC) {
    if (!F.contact || F.steering || !vel) return 0;
    const vt = Math.hypot(vel.x, vel.z);
    if (vt < 1.5) return 0;
    const want = Math.atan2(vel.x, -vel.z), diff = Math.atan2(Math.sin(want - F.yaw), Math.cos(want - F.yaw));
    return U.clamp(diff * 2, -FC.alignRate, FC.alignRate);
  }

  /* ---------------------------------------------------------------------------------------------
     ROUND 02 · INSIDE THE MEMORY GARDEN (js/garden/garden.js). The SAME flight state (F.pos, F.yaw,
     her velocity `vel` as a p5.Vector) and the same pose / camera consumers, with garden rules
     instead of the city's: no buildings, no fragments, and she is drawn to the flower.

     STEERING — the "arrive" behaviour, in p5.Vector maths:
       target   = a point on a ring round the flower (radius g.ring), at her side (azimuth g.az)
                  and the hover height g.h
       desired  = p5.Vector.sub(target, pos), its length set (setMag) to the cruise speed, or less
                  inside the slowing radius: p.map(distance, 0, slowR, 0, cruise)   → DECELERATION
       steer    = p5.Vector.sub(desired, vel).mult(respond).limit(maxForce)          → ACCELERATION
                  (respond 5/s against a slowing gain of cruise/slowR = 0.8/s: an over-damped
                  approach, so she settles without overshooting)
       vel     += steer · h ;  vel.limit(cruise) ;  pos += vel · h
     integrated in fixed sub-steps of ≤ 1/120 s, so the path is the same at 10, 30 or 60 fps.
     The flower's keep-out sphere: inside it, pos is pushed back out to its surface and the
     velocity's inward part removed (p5.Vector dot / sub), so she never passes through the petals.
     KEYS (the same ← → ↑ ↓ handlers and tap detection as the city, at the room's scale):
       ← →        she flies round the flower, fast (g.orbitSpeed m/s), facing where she goes; ← always
                  carries her to the LEFT of the view, → to the right (the ring direction is chosen
                  from the camera's right vector, g.camRight); a held arrow tightens as in the city
       ↑ tap      a lift of tapLift × ROOM metres, eased; ↑ ↑ double-tap: + doubleLift × ROOM
       ↑ hold     a steady rise; ↓ hold: a steady descent (and cancels a lift still pending)
     The MOUSE does not steer her here: in the garden it belongs to the flower (click / drag) and
     the camera (drag elsewhere, wheel).
     ARRIVED (the interaction mode): close to the target and slow (hysteresis), she levitates
     facing the flower (CharacterDirector: flying pose → levitating pose, cross-faded).
     --------------------------------------------------------------------------------------------- */
  let gTarget = null, gTmp = null, gC = null, gLift = 0;
  const ROOM = 0.1;                 // the city's lifts (13 m tap, +32 m double) at the garden's scale
  function enterGarden(g) {
    // g: { center, start, ring, h, keepOut, cruise, slowR, maxForce, orbitSpeed, hMax }
    F.garden = Object.assign({ ring: 3.8, h: 2.4, keepOut: 2.7, cruise: 3.2, slowR: 4.0, respond: 5, maxForce: 9, orbitSpeed: 8.5, fastMaxForce: 26, hMax: 8.5, climb: 2.6, camRight: null }, g);
    F.garden.speedNow = F.garden.cruise; F.garden.vh = 0; gLift = 0; steerHeld = 0; upHeldT = 0;
    if (!gTarget) { gTarget = p.createVector(0, 0, 0); gTmp = p.createVector(0, 0, 0); gC = p.createVector(0, 0, 0); }
    const G = F.garden, c = G.center;
    F.pos = G.start.slice();
    G.az = G.az !== undefined ? G.az : Math.atan2(F.pos[2] - c[2], F.pos[0] - c[0]);   // where on the ring she settles (default: her side)
    vel.set(G.v0 || [0, 0, 0]);
    F.yaw = Math.atan2(c[0] - F.pos[0], -(c[2] - F.pos[2])); F.yawRate = 0; F.bank = 0; F.upright = 0; F.vy = 0;
    F.speed = vel.mag(); F.flySpeed = F.speed; F.gardenArrived = false; F.finale = false; F.arc = false;
    pendingLift = 0; liftLeft = 0;
    trail = []; for (let i = 0; i < 24; i++) trail.push(F.pos.slice());
  }
  function exitGarden() { F.garden = null; F.gardenArrived = false; }
  /* her velocity as it is (metres / s): the hand-over from the garden to the city keeps it */
  function setVel(v) { if (vel) vel.set(v[0], v[1], v[2]); F.vel = v.slice(); F.flySpeed = Math.hypot(v[0], v[2]); }
  /* metres of rise still to come (a city tap given at the end of the flight out is kept) */
  function carryLift(m) { if (m > 0) liftLeft += m; }

  /* ROUND 02 · THE FLIGHT OUT (after a building's transformation, js/garden/garden.js). Still the
     garden mode (same state, same p5.Vector velocity, same sub-steps and keep-out sphere), with a
     different target: a line through the open glass panel L.n, then on out along it.
       ASSIST   the target point pulls her through the opening (seek, force-limited); round the
                flower first when it is in the way (a tangent waypoint)
       SPEED    from her garden speed up to the city's cruise with the city's acceleration:
                p.lerp(speed, cruise, 1 − e^(−accel·dt)), so she reaches the city at its speed
       ← →      shift her line across the opening, true to the view (g.camRight), held = tighter
       ↑        the city's taps / double-taps raise her line (× L.liftScale, inside the opening);
                past the glass a tap is kept for the city flight (carryLift); hold ↑ / ↓ climbs /
                descends
     She faces where she flies (yaw eased toward her velocity). */
  function launchUpdate(dt) {
    const G = F.garden, L = G.launch, k = F.keys, FC = AG.CONFIG.flight, c = G.center;
    F.gardenArrived = false;
    const steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    steerHeld = steer ? steerHeld + dt : 0;
    const tighten = 1 + FC.turnTighten * U.smooth(0.4, 1.4, steerHeld);
    const t = [-L.n[2], 0, L.n[0]], cr = G.camRight, side = cr ? Math.sign(t[0] * cr[0] + t[2] * cr[2]) || 1 : 1;
    L.off = U.clamp(L.off + steer * side * L.lateral * tighten * dt, -L.halfW, L.halfW);
    const rNow = Math.hypot(F.pos[0] - c[0], F.pos[2] - c[2]), pastGlass = rNow > L.R;
    if (pendingLift > 0 && !pastGlass) { L.lift += pendingLift * L.liftScale; pendingLift = 0; F.lifts = (F.lifts || 0) + 1; }
    liftLeft = 0;
    upHeldT = k.up ? upHeldT + dt : 0;
    if (k.up && upHeldT >= FC.tapMax) L.lift += L.climb * dt;
    if (k.down) L.lift -= L.climb * dt;
    L.lift = U.clamp(L.lift, L.yLo - L.y, L.yHi - L.y);
    F.steering = steer !== 0; F.boosting = false;
    G.speedNow = p.lerp(G.speedNow, FC.cruise, 1 - Math.exp(-FC.accel * dt));
    const aimY = c[1] + L.y + L.lift;
    const at = (r) => [c[0] + L.n[0] * r + t[0] * L.off, aimY, c[2] + L.n[2] * r + t[2] * L.off];
    gC.set(c[0], c[1] + 1.0, c[2]);
    pos.set(F.pos[0], F.pos[1], F.pos[2]);
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let s = 0; s < n; s++) {
      const r = Math.hypot(pos.x - c[0], pos.z - c[2]);
      const a = at(r < L.R - 0.5 ? L.R : L.Rout + 30);
      // the flower in the way (she is behind it, or the line passes close): a tangent point first
      const qx = pos.x - c[0], qz = pos.z - c[2], along = qx * L.n[0] + qz * L.n[2], across = qx * t[0] + qz * t[2];
      if (along < G.keepOut + 0.5 && Math.abs(across) < G.keepOut + 1.6) {
        const sd = across >= 0 ? 1 : -1, R0 = G.keepOut + 2.2;
        a[0] = c[0] + t[0] * sd * R0 + L.n[0] * Math.max(along + 2, 0); a[2] = c[2] + t[2] * sd * R0 + L.n[2] * Math.max(along + 2, 0);
      }
      gTarget.set(a[0], a[1], a[2]);
      const desired = p5.Vector.sub(gTarget, pos).setMag(G.speedNow);
      const force = p5.Vector.sub(desired, vel).mult(6).limit(70);
      vel.add(force.mult(h)).limit(G.speedNow);
      pos.add(p5.Vector.mult(vel, h));
      gTmp.set(pos).sub(gC);
      if (gTmp.mag() < G.keepOut) {
        gTmp.setMag(G.keepOut); pos.set(gC).add(gTmp);
        const nrm = gTmp.copy().normalize(), vn = vel.dot(nrm);
        if (vn < 0) vel.sub(nrm.mult(vn));
      }
      if (pos.y < c[1] + 0.5) { pos.y = c[1] + 0.5; if (vel.y < 0) vel.y = 0; }
    }
    F.pos = [pos.x, pos.y, pos.z]; F.vel = [vel.x, vel.y, vel.z];
    L.r = Math.hypot(pos.x - c[0], pos.z - c[2]); L.aimY = aimY;
    const hs = Math.hypot(vel.x, vel.z);
    const prevYaw = F.yaw;
    if (hs > 0.35) { const wantYaw = Math.atan2(vel.x, -vel.z), dy = Math.atan2(Math.sin(wantYaw - F.yaw), Math.cos(wantYaw - F.yaw)); F.yaw += dy * (1 - Math.exp(-14 * dt)); }
    F.yawRate = dt > 0 ? (F.yaw - prevYaw) / dt : 0;
    F.speed = hs; F.flySpeed = hs; F.vy = vel.y;
    F.bank = U.damp(F.bank, U.clamp(-F.yawRate * 0.35, -0.4, 0.4), 4, dt);
    F.upright = U.damp(F.upright, 0, 2, dt);
    trailClock -= dt;
    if (trailClock <= 0) { trail.unshift(F.pos.slice()); trail.length = 24; trailClock = 0.05; }
  }

  function gardenUpdate(dt, input) {
    if (F.garden.launch) { launchUpdate(dt); return; }   // the flight out (below)
    const G = F.garden, k = F.keys, FC = AG.CONFIG.flight;
    // ← →: round the flower, true to the screen. The ring's direction of increasing azimuth is
    // (−sin az, 0, cos az); its sign against the camera's right vector says which way is "right".
    const steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    steerHeld = steer ? steerHeld + dt : 0;
    const tighten = 1 + FC.turnTighten * U.smooth(0.4, 1.4, steerHeld);
    const cr = G.camRight, side = cr ? Math.sign(-Math.sin(G.az) * cr[0] + Math.cos(G.az) * cr[2]) || 1 : 1;
    G.az += steer * side * (G.orbitSpeed / G.ring) * tighten * dt;
    // ↑ / ↓: the city's taps and double-taps (detected in press()) as eased lifts, a hold as a climb
    if (pendingLift > 0) { gLift += pendingLift * ROOM; pendingLift = 0; F.lifts = (F.lifts || 0) + 1; }
    liftLeft = 0;
    upHeldT = k.up ? upHeldT + dt : 0;
    if (k.down) gLift = 0;
    const climbing = k.up && upHeldT >= FC.tapMax;
    const wantVh = k.down ? -G.climb : climbing ? G.climb : gLift > 0.02 ? Math.min(G.climb * 1.3, 0.6 + gLift * 1.6) : 0;
    G.vh = U.damp(G.vh, wantVh, 4, dt);
    G.h = p.constrain(G.h + G.vh * dt, 0.9, G.hMax);
    if (G.vh > 0) gLift = Math.max(0, gLift - G.vh * dt);
    if (G.h >= G.hMax) gLift = 0;
    F.steering = steer !== 0; F.boosting = false;
    // speed: fast while she is being flown, back to the slow settling cruise when released, eased
    // with the city's acceleration constant (1 − e^(−accel·dt))
    const flown = steer !== 0 || Math.abs(G.vh) > 0.3;
    G.speedNow = p.lerp(G.speedNow, flown ? G.orbitSpeed * tighten * 1.15 : G.cruise, 1 - Math.exp(-FC.accel * 2 * dt));
    const maxForce = p.map(G.speedNow, G.cruise, G.orbitSpeed, G.maxForce, G.fastMaxForce, true);
    gC.set(G.center[0], G.center[1] + 1.0, G.center[2]);
    gTarget.set(G.center[0] + Math.cos(G.az) * G.ring, G.center[1] + G.h, G.center[2] + Math.sin(G.az) * G.ring);
    pos.set(F.pos[0], F.pos[1], F.pos[2]);
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let s = 0; s < n; s++) {
      // ARRIVE: desired velocity toward the target, slowing inside slowR (p.map), steering force limited
      const desired = p5.Vector.sub(gTarget, pos);
      const d = desired.mag();
      desired.setMag(d < G.slowR ? p.map(d, 0, G.slowR, 0, G.speedNow) : G.speedNow);
      const force = p5.Vector.sub(desired, vel).mult(G.respond).limit(maxForce);
      vel.add(force.mult(h)).limit(G.speedNow);
      pos.add(p5.Vector.mult(vel, h));
      // the flower's keep-out sphere: back to its surface, inward velocity removed
      gTmp.set(pos).sub(gC);
      const dd = gTmp.mag();
      if (dd < G.keepOut) {
        gTmp.setMag(G.keepOut); pos.set(gC).add(gTmp);
        const nrm = gTmp.copy().normalize(), vn = vel.dot(nrm);
        if (vn < 0) vel.sub(nrm.mult(vn));
      }
      if (pos.y < G.center[1] + 0.5) { pos.y = G.center[1] + 0.5; if (vel.y < 0) vel.y = 0; }
    }
    F.pos = [pos.x, pos.y, pos.z]; F.vel = [vel.x, vel.y, vel.z];
    // body: face where she glides; once slow, turn to face the flower (angles eased with p.lerp)
    const hs = Math.hypot(vel.x, vel.z);
    const wantYaw = hs > 0.35 ? Math.atan2(vel.x, -vel.z) : Math.atan2(G.center[0] - pos.x, -(G.center[2] - pos.z));
    const dy = Math.atan2(Math.sin(wantYaw - F.yaw), Math.cos(wantYaw - F.yaw));
    const prevYaw = F.yaw;
    F.yaw += p.lerp(0, dy, 1 - Math.exp(-(hs > 2 ? 14 : 4) * dt));   // flown fast she faces her way at once
    F.yawRate = dt > 0 ? (F.yaw - prevYaw) / dt : 0;
    F.speed = hs; F.flySpeed = hs; F.vy = vel.y;
    F.bank = U.damp(F.bank, U.clamp(-F.yawRate * 0.35, -0.4, 0.4), 4, dt);
    F.upright = U.damp(F.upright, 0, 2, dt);
    // arrived: close to the target and slow (with hysteresis, so it never flickers)
    const dT = p5.Vector.dist(pos, gTarget), sp = vel.mag();
    if (!F.gardenArrived && dT < 0.35 && sp < 0.3) F.gardenArrived = true;
    else if (F.gardenArrived && (dT > 0.9 || sp > 1.2)) F.gardenArrived = false;
    trailClock -= dt;
    if (trailClock <= 0) { trail.unshift(F.pos.slice()); trail.length = 24; trailClock = 0.05; }
  }

  function update(dt, input, active) {
    if (!F.ready || !active) return;
    if (F.garden) { gardenUpdate(dt, input); return; }   // Round 02: inside the Memory Garden
    const FC = AG.CONFIG.flight, k = F.keys;
    // ---- ↑ (keyboard or touch): a SHORT press (released within FC.tapMax s) gives a small
    //      upward lift; HOLDING it smoothly boosts forward speed. It never starts the ending:
    //      only the fifth fragment does (below). ----
    const upNow = !F.finale && !!k.up;
    if (pendingLift > 0) { liftLeft += pendingLift; pendingLift = 0; F.lifts = (F.lifts || 0) + 1; }
    // how long ↑ has been held, in game seconds (dt comes from p.deltaTime): past tapMax it is a
    // hold, i.e. a speed boost. (Taps themselves are classified at the key events in press(), so a
    // tap shorter than one frame still counts.)
    upHeldT = upNow ? upHeldT + dt : 0;
    const boosting = upNow && upHeldT >= FC.tapMax;
    F.boosting = boosting; F.holding = boosting;
    // ---- steering: mouse x + ← → (only in free flight) ----
    // a held ← or → tightens gradually (up to turnRate × (1 + turnTighten)), so a sustained
    // turn becomes a controlled U-turn; short presses steer exactly as before
    let turn = steerTurn(FC, input, dt);
    // the player's own input pauses Round 02's doorway assists for a moment (0 in Round 01)
    sinceSteer = F.steering ? 0 : sinceSteer + dt;
    sinceVert = k.up || k.down || liftLeft > 0.05 || pendingLift > 0 ? 0 : sinceVert + dt;
    const turnAssist = (F.assistTurn || 0) * U.smooth(0.8, 2.0, sinceSteer), vyAssist = (F.assistVy || 0) * U.smooth(1.5, 3.0, sinceVert);
    // ---- near buildings: a gentle look-ahead turn and facade alignment, only when she is not
    //      being steered (the player's input always wins); collisions themselves slide (move) ----
    // (+ Round 02's gentle line-up with the doorway, assistTurn: 0 in Round 01)
    if (!F.steering) turn += avoidTurn(FC, FC.avoidTurn, dt) + alignTurn(FC) + turnAssist;
    else { F.avoidSide = 0; F.avoiding = false; }
    F.yawRate = U.damp(F.yawRate, U.clamp(turn, -1.8, 1.8), 3.2, dt);
    F.yaw += F.yawRate * dt;
    // ---- speeds ----
    // hold ↑ = faster (cruise → boostMax), release = back to cruise. p.lerp with a frame-rate-
    // independent factor 1 − e^(−accel·dt): the same ease at 30, 60 or 120 fps
    F.speed = p ? p.lerp(F.speed, boosting ? FC.boostMax : FC.cruise, 1 - Math.exp(-FC.accel * dt))
                : U.damp(F.speed, boosting ? FC.boostMax : FC.cruise, FC.accel, dt);
    // vertical: a level glide by default; taps/double-taps add metres to climb (liftLeft), followed
    // with an eased vertical speed (≤ riseSpeed) so the rise never snaps; ↓ descends and cancels it
    // (Round 02's doorway height assist, vyAssist, only steers her when the player has not asked
    //  for height: a tap or double-tap of ↑ always climbs, as in the city)
    if (k.down) liftLeft = 0;
    const targetVy = k.down ? -FC.descend : liftLeft > 0.05 ? Math.min(FC.riseSpeed, 2 + liftLeft * 1.3) : vyAssist;
    F.vy = U.damp(F.vy, targetVy, 2.4, dt);
    if (F.vy > 0) liftLeft = Math.max(0, liftLeft - F.vy * dt);
    move(dt, FC);
    // ---- body ----
    F.bank = U.damp(F.bank, F.arc ? 0 : U.clamp(-F.yawRate * 0.42, -0.55, 0.55), 4, dt);
    F.upright = U.damp(F.upright, F.arc ? 1 : 0, 1.6, dt);
    F.asc = U.clamp((F.pos[1] - H0) / (FC.finaleAltitude - H0), 0, 1);
    // ---- modes ----
    AG.FSM.setMode(F.arc ? 'ASCENSION' : 'FREE_FLIGHT');
    if (!cloudHit && F.pos[1] > FC.finaleAltitude - 110) { cloudHit = true; AG.U.emit('cloud'); }
    // the light is entered by collecting the fifth fragment (distance check in AG.Fragments)
    // (this update runs only while she is controllable, so the 6 s / 10 s reveal timers count active flight only)
    // (Round 02's flight to the doorway has no fragments: noFragments)
    if (!F.finale && !F.noFragments && AG.Fragments && AG.Fragments.update(F.pos, AG.FSM.animTime, dt)) enterLight();
    // ---- trail history ----
    trailClock -= dt;
    if (trailClock <= 0) { trail.unshift(F.pos.slice()); trail.length = 24; trailClock = 0.05; }
  }

  /* 0..1 progress inside the current phase (for animation) */
  function phaseK() {
    const a = F.ascT, i = PHASES.findIndex((p) => p[0] === F.phase);
    if (i < 0) return 1;
    const t0 = PHASES[i][1], t1 = i + 1 < PHASES.length ? PHASES[i + 1][1] : t0 + 8;
    return U.clamp((a - t0) / (t1 - t0), 0, 1);
  }

  /* the highest roof right on her path (0–120 m ahead, ±12 m to the sides); anything to the side
     is left to the collision avoidance, so the glide does not climb over every tower around her */
  function roofAhead() {
    const h = heading(F.yaw), R = 12;
    let top = 0;
    for (const b of boxes) {
      if (b.hero || b.top <= top) continue;
      for (let d = 0; d <= 120; d += 20) {
        const px = F.pos[0] + h[0] * d, pz = F.pos[2] + h[2] * d;
        if (Math.max(b.x0 - px, 0, px - b.x1) < R && Math.max(b.z0 - pz, 0, pz - b.z1) < R) { top = b.top; break; }
      }
    }
    return top;
  }

  /* the finale (after the fifth fragment), counted in game time (F.finaleT += dt; this runs
     only while the story is playing, so pause freezes it):
       GLIDE   0 … finaleGlide s: she glides forward above the rooftops (easing up to clear the
               roofs ahead, never down), steerable with the mouse / ← →, so the restored city
               opens out below her while the camera pulls back (camera.js finalePose)
       ASCENT  then the existing slow, directed drift upward into the sunrise (vy → 7 m/s,
               forward speed → 2 m/s), still gently steerable                                 */
  function drift(dt, input) {
    const FC = AG.CONFIG.flight;
    F.finaleT += dt;
    F.gliding = F.finaleT < FC.finaleGlide;
    // steering, as in free flight but gentler (the ending is not a chase)
    const steer = steerTurn(FC, input, dt);
    let turn = steer * (F.gliding ? 0.6 : 0.5);
    if (F.gliding) {
      // hands off: the glide bends gently back over the city (toward downtown) so the panorama
      // is the restored city, not the empty land past its edge; any steering overrides it
      const D = AG.CONFIG.city.downtown, dx = D.x - F.pos[0], dz = D.z - F.pos[2];
      // (only until downtown is within ~50° of her heading, ~20° when she is far out past the
      // edge of the city: the city stays in view ahead, and she is not steered into the towers)
      const dist = Math.hypot(dx, dz);
      if (Math.abs(steer) < 0.01 && dist > FC.glideGuideNear) {
        const diff = Math.atan2(Math.sin(Math.atan2(dx, -dz) - F.yaw), Math.cos(Math.atan2(dx, -dz) - F.yaw));
        const tol = dist > 650 ? 0.3 : 0.8;
        turn += Math.sign(diff) * FC.glideGuide * U.smooth(tol, tol + 0.5, Math.abs(diff));
      }
      turn += avoidTurn(FC, FC.glideAvoid, dt) + alignTurn(FC);   // hands-off glide: the original look-ahead strength
    }
    F.yawRate = U.damp(F.yawRate, U.clamp(turn, -1.2, 1.2), 3.2, dt);
    F.yaw += F.yawRate * dt;
    if (F.gliding) {
      F.speed = U.damp(F.speed, FC.glideSpeed, 0.9, dt);
      const want = Math.min(Math.max(roofAhead() + FC.glideClear, FC.glideMinAlt, F.pos[1]), FC.glideMaxAlt);
      F.vy = U.damp(F.vy, U.clamp((want - F.pos[1]) * 0.5, 0, FC.glideClimb), 1.2, dt);
      F.upright = U.damp(F.upright, 0, 1.5, dt);
      F.bank = U.damp(F.bank, U.clamp(-F.yawRate * 0.42, -0.45, 0.45), 4, dt);
    } else {
      F.vy = U.damp(F.vy, 7, 0.8, dt); F.speed = U.damp(F.speed, 2, 0.8, dt);
      F.upright = U.damp(F.upright, 1, 1.5, dt); F.bank = U.damp(F.bank, 0, 2, dt);
    }
    move(dt, FC);
    F.asc = U.clamp((F.pos[1] - H0) / (FC.finaleAltitude - H0), 0, 1);       // the dawn follows her up
    trailClock -= dt; if (trailClock <= 0) { trail.unshift(F.pos.slice()); trail.length = 24; trailClock = 0.05; }
  }

  /* compatible state object (used by the camera and the character director) */
  function state() {
    const fwd = heading(F.yaw), right = V.norm(V.cross(fwd, [0, 1, 0])), up = [0, 1, 0];
    // speed = her ACTUAL ground speed (eased), so the camera and effects calm down when a wall stops her
    const sp = F.flySpeed !== undefined && vel ? F.flySpeed : F.speed;
    return { pos: F.pos, fwd, right, up, bank: F.bank, speed: sp, speedN: U.clamp(sp / 30, 0, 1), upright: F.upright, vy: F.vy, off: [0, 0, 0] };
  }
  function trailPoints() { const out = []; for (const p of trail) out.push(p[0], p[1], p[2]); return out; }

  /* the luminous cloud layer: always above her, below the light threshold */
  function cloud() {
    const FC = AG.CONFIG.flight;
    return { center: [F.pos[0] + Math.sin(F.yaw) * 80, FC.finaleAltitude - 70, F.pos[2] - Math.cos(F.yaw) * 80], radii: [300, 75, 300] };
  }

  /* Fraction (0..1) along segment a→b before it enters a building (1 = clear). */
  function segmentClear(a, b, margin, skip) {
    let best = 1;
    const dir = V.sub(b, a);
    for (const bx of boxes) {
      if (bx === skip) continue;
      const mn = [bx.x0 - margin, -10, bx.z0 - margin], mx = [bx.x1 + margin, bx.top + margin, bx.z1 + margin];
      let t0 = 0, t1 = 1, ok = true;
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(dir[i]) < 1e-9) { if (a[i] < mn[i] || a[i] > mx[i]) ok = false; }
        else {
          let ta = (mn[i] - a[i]) / dir[i], tb = (mx[i] - a[i]) / dir[i];
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) ok = false;
        }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }

  /* Horizontal distance from p to the nearest building side (for camera limits). */
  function clearance(p) {
    let best = 1e9;
    for (const b of boxes) {
      if (p[1] > b.top) continue;
      const dx = Math.max(b.x0 - p[0], 0, p[0] - b.x1), dz = Math.max(b.z0 - p[2], 0, p[2] - b.z1);
      const dd = Math.hypot(dx, dz);
      if (dd < best) best = dd;
    }
    return best;
  }

  return Object.assign(F, { PHASES, phaseK, build, reset, resetMotion, update, drift, state, trailPoints, cloud, segmentClear, clearance, heading, enterLight, press, enterGarden, exitGarden, setVel, carryLift });
})();
