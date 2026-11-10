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

   Everything is integrated with dt and smoothed (U.damp), so behaviour is
   the same at 30 or 120 fps. Collision avoidance: a probe ahead steers
   away from towers before she reaches them; if she still touches a wall
   she slides along it (no tunnelling, no sudden stops).

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

  function build(info) {
    boxes = info.boxes || [];
    H0 = info.hero.H0;
    F.ready = true;
    reset();
  }

  /* the moment she leaves the roof: just past the broken parapet, facing the city */
  function reset() {
    F.pos = [0.6, H0 + 4.2, -24]; F.yaw = 0; F.yawRate = 0; F.speed = 0; F.vy = 0; F.bank = 0; F.upright = 0; F.asc = 0; F.finale = false;
    F.ascT = 0; F.released = 99; F.arc = false; F.phase = 'FLIGHT'; F.holding = false;
    trail = []; for (let i = 0; i < 24; i++) trail.push(F.pos.slice());
    upHeld = 0; sinceUp = 99; cloudHit = false; pendingLift = 0; liftLeft = 0; lastTapAt = -1e9; steerHeld = 0; upDownAt = 0;
    F.boosting = false; F.lifts = 0; F.doubleTaps = 0; F.finaleT = 0; F.gliding = false; F.finales = 0;
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
  let upDownAt = 0, pendingLift = 0, lastTapAt = -1e9, liftLeft = 0, steerHeld = 0;
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

  /* collision avoidance: look ahead, steer toward the side with more room (returns extra turn) */
  function avoidTurn(FC) {
    const h = heading(F.yaw);
    const ahead = V.add(F.pos, V.scale(h, FC.probe + F.speed * 0.6));
    if (!F.arc && blockedAt(ahead, FC.wallMargin)) {
      const l = V.add(F.pos, V.scale(heading(F.yaw - 0.7), FC.probe)), r = V.add(F.pos, V.scale(heading(F.yaw + 0.7), FC.probe));
      const lb = blockedAt(l, FC.wallMargin), rb = blockedAt(r, FC.wallMargin);
      const side = !lb && rb ? -1 : lb && !rb ? 1 : (AG.Flight.clearance(l) > AG.Flight.clearance(r) ? -1 : 1);
      F.avoiding = true;
      return side * 1.2;
    }
    F.avoiding = false;
    return 0;
  }

  /* steering input: mouse x (dead zone) + ← → (a held arrow tightens gradually) */
  function steerTurn(FC, input, dt) {
    const k = F.keys;
    let mx = (input && input.mx) || 0;
    mx = Math.abs(mx) < FC.deadZone ? 0 : (mx - Math.sign(mx) * FC.deadZone) / (1 - FC.deadZone);
    const steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    steerHeld = steer ? steerHeld + dt : 0;
    const tighten = 1 + FC.turnTighten * U.smooth(0.4, 1.4, steerHeld);
    F.turnTight = tighten;
    return mx * FC.mouseTurn + steer * FC.turnRate * tighten;
  }

  /* integrate the velocity, slide along walls, keep between the ground and the ceiling */
  function move(dt, FC) {
    const h2 = heading(F.yaw);
    let next = V.add(F.pos, V.add(V.scale(h2, F.speed * dt), [0, F.vy * dt, 0]));
    const hit = blockedAt(next, FC.wallMargin * 0.5);
    if (hit) {
      const m = FC.wallMargin * 0.5;
      const pen = [[next[0] - (hit.x0 - m), -1, 0], [(hit.x1 + m) - next[0], 1, 0], [next[2] - (hit.z0 - m), 0, -1], [(hit.z1 + m) - next[2], 0, 1]];
      pen.sort((a, b) => a[0] - b[0]);
      const [d, nx, nz] = pen[0];
      next = [next[0] + nx * d, next[1], next[2] + nz * d];
      const into = h2[0] * nx + h2[2] * nz;
      if (into < 0 && !F.arc) F.yaw += Math.sign(h2[0] * nz - h2[2] * nx || 1) * 0.04;
      F.speed *= 0.97;
    }
    next[1] = Math.max(next[1], FC.minAlt);
    // ceiling just above the light threshold: the ending now comes from the fifth fragment,
    // so without it she could rise for ever and lose the fragments below; she hovers here instead
    if (next[1] > FC.finaleAltitude + 30) { next[1] = FC.finaleAltitude + 30; if (F.vy > 0) F.vy = 0; liftLeft = 0; }
    F.pos = next;
  }

  function update(dt, input, active) {
    if (!F.ready || !active) return;
    const FC = AG.CONFIG.flight, k = F.keys;
    // ---- ↑ (keyboard or touch): a SHORT press (released within FC.tapMax s) gives a small
    //      upward lift; HOLDING it smoothly boosts forward speed. It never starts the ending:
    //      only the fifth fragment does (below). ----
    const upNow = !F.finale && !!k.up;
    if (pendingLift > 0) { liftLeft += pendingLift; pendingLift = 0; F.lifts = (F.lifts || 0) + 1; }
    const boosting = upNow && performance.now() - upDownAt >= FC.tapMax * 1000;
    F.boosting = boosting; F.holding = boosting;
    // ---- steering: mouse x + ← → (only in free flight) ----
    // a held ← or → tightens gradually (up to turnRate × (1 + turnTighten)), so a sustained
    // turn becomes a controlled U-turn; short presses steer exactly as before
    let turn = steerTurn(FC, input, dt);
    // ---- collision avoidance: look ahead, steer toward the side with more room ----
    turn += avoidTurn(FC);
    F.yawRate = U.damp(F.yawRate, U.clamp(turn, -1.8, 1.8), 3.2, dt);
    F.yaw += F.yawRate * dt;
    // ---- speeds ----
    F.speed = U.damp(F.speed, boosting ? FC.boostMax : FC.cruise, FC.accel, dt);   // hold ↑ = faster, release = back to cruise
    // vertical: a level glide by default; taps/double-taps add metres to climb (liftLeft), followed
    // with an eased vertical speed (≤ riseSpeed) so the rise never snaps; ↓ descends and cancels it
    if (k.down) liftLeft = 0;
    const targetVy = k.down ? -FC.descend : liftLeft > 0.05 ? Math.min(FC.riseSpeed, 2 + liftLeft * 1.3) : 0;
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
    if (!F.finale && AG.Fragments && AG.Fragments.update(F.pos, AG.FSM.animTime, dt)) enterLight();
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
      turn += avoidTurn(FC);
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
    return { pos: F.pos, fwd, right, up, bank: F.bank, speed: F.speed, speedN: U.clamp(F.speed / 30, 0, 1), upright: F.upright, vy: F.vy, off: [0, 0, 0] };
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

  return Object.assign(F, { PHASES, phaseK, build, reset, update, drift, state, trailPoints, cloud, segmentClear, clearance, heading, enterLight, press });
})();
