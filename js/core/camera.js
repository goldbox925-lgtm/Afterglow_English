/* =====================================================================
   Camera director
   ---------------------------------------------------------------------
   The camera follows the emotional STATE, not a clock:

     CINEMATIC beats (short, scripted, input ignored)
       intro     01  low side angle on her lying → lifts as she pushes up
                     → behind her as she sits → pulls back to the vantage
       fracture  02  a cut to the reverse angle (she hugs her knees), back
       stand     04  a struggle: behind her seated → low side angle as she
                     pushes up, shaking → her face as she kneels and looks up →
                     behind her, standing at the broken edge
       liftoff   05  she rises off the roof → chase camera (flight hand-over)
     ASCENSION (05, hold ↑) the levitation camera of the original film: in
                     front of her, full body, slightly above while she
                     suffers; it sinks below her and slowly orbits as she
                     lets go, then pulls back as she rises, so the city
                     falls away beneath a figure that stays readable.
       finale    05  LIGHT: a glide (pull-back to a wide view of the city, her
                     still readable), then the slow pull-back of the ascent
     EXPLORE (01–04)  the viewer looks around from the vantage behind her:
                      drag = look, wheel = zoom, ← → ↑ ↓ = look. The mode never
                      changes on its own; a drag that starts on a light node
                      draws a thread instead of turning the view.
     FLIGHT (05)      third-person chase, depth-aware (never a wall between
                      her and the lens). ASCENSION tilts the camera up and
                      drops it below/behind her so the city falls away.

   Image-based character rules (the flat planes must never show edge-on):
   close to a rooftop pose the camera stays inside a cone around the
   plane's normal; in flight the planes face the lens.
   Alternative views (C key) are only ever chosen by the viewer.
   ===================================================================== */
window.AG = window.AG || {};

AG.Camera = (function () {
  const U = AG.U, V = U.v3;
  const MODES = [
    { id: 'film', label: 'Cinematic' },
    { id: 'orbit', label: 'Close on her' },
    { id: 'rooftop', label: 'Rooftop' },
    { id: 'wide', label: 'Wide city' },
    { id: 'aerial', label: 'Aerial flyover' },
    { id: 'street', label: 'Street level' }
  ];
  let mode = 'film', info = null;
  const cur = { pos: [0, 200, 200], target: [0, 90, 0], fov: 45, close: 0 };
  let snap = true, dragYaw = 0, dragPitch = 0, zoom = 1, lastBeat = '';
  let finaleAt = -1, finaleAnchor = null, finaleFwd = null, arcOn = false, arcAt = 0, arcSide = 1, lastAnchor = null;
  const out = {};
  const ex = { yaw: 0, pitch: -0.1, fov: 54, init: false, still: 0 };

  function setInfo(i) { info = i; snap = true; reset(); }
  function reset() { ex.init = false; ex.yaw = 0; ex.pitch = -0.1; ex.fov = 54; finaleAt = -1; lastBeat = ''; snap = true; }
  function setMode(m) { mode = m; AG.U.emit('cameraMode', m); }
  function cycle() { const i = MODES.findIndex((m) => m.id === mode); setMode(MODES[(i + 1) % MODES.length].id); }
  function snapNext() { snap = true; }

  const city = () => [-40, info.hero.H0 - 30, -420];
  const L = (a, b, k) => V.lerp(a, b, U.easeInOut(U.clamp(k, 0, 1)));
  const bez = (a, m, b, k) => V.add(V.add(V.scale(a, (1 - k) * (1 - k)), V.scale(m, 2 * k * (1 - k))), V.scale(b, k * k));
  const vantage = () => AG.Interactions.vantage;
  function exploreDir() {
    return [Math.sin(ex.yaw) * Math.cos(ex.pitch), Math.sin(ex.pitch), -Math.cos(ex.yaw) * Math.cos(ex.pitch)];
  }

  /* ---------- chase rig (05) ---------- */
  function chase() {
    const fs = AG.Flight.state(), p = fs.pos, up = fs.upright;
    const back = U.lerp(5.2, 8.5, up), height = U.lerp(1.1, -3.2, up);
    const want = V.add(V.add(V.sub(p, V.scale(fs.fwd, back)), [0, height, 0]), V.scale(fs.right, 0.25 * fs.bank));
    // ascending: look up past her into the light
    const target = V.add(V.add(p, V.scale(fs.fwd, U.lerp(20, 4, up))), [0, U.lerp(0.4, 26, up), 0]);
    return { pos: want, target, fov: 52 + 12 * fs.speedN + 10 * up, flight: true, fs };
  }

  /* ---------- the scripted beats ---------- */
  function cinematicPose(cin) {
    const H = info.hero.H0, sp = AG.CharacterDirector.spots, lie = sp.lie, edge = sp.edge, add = V.add, t = cin.t;
    const Vt = vantage(), C = city();
    if (cin.name === 'intro') {
      if (t < 1.15) return { beat: 'i0', pos: L(add(lie, [0.32, 0.27, 2.75]), add(lie, [0.2, 0.28, 2.5]), t / 1.15), target: add(lie, [-0.06, 0.17, 0]), fov: 32, close: 1 };
      if (t < 2.5) return { beat: 'i1', pos: L(add(lie, [0.45, 0.42, 2.2]), add(lie, [0.75, 0.8, 2.5]), (t - 1.15) / 1.35), target: add(lie, [0, 0.3 + 0.15 * (t - 1.15), 0]), fov: 33, close: 1 };
      if (t < 3.6) return { beat: 'i2', cut: true, pos: L(add(lie, [0.55, 0.95, 2.1]), add(lie, [0.5, 1.05, 2.4]), (t - 2.5) / 1.1), target: L(add(lie, [-0.3, 0.7, -6]), C, (t - 2.5) / 1.1), fov: 40, close: 0.6 };
      const k = U.easeInOut(U.clamp((t - 3.6) / (cin.dur - 3.6), 0, 1));
      return { beat: 'i3', pos: bez(add(lie, [0.5, 1.05, 2.4]), add(lie, [-6, 7, 12]), Vt, k), target: V.lerp(C, add(Vt, V.scale(exploreDir(), 120)), k), fov: 40 + 14 * k, close: 0.6 * (1 - k) };
    }
    if (cin.name === 'fracture') {
      if (t < 2.4) return { beat: 'f0', cut: true, pos: L(add(lie, [0.35, 0.62, -2.5]), add(lie, [0.25, 0.7, -2.2]), t / 2.4), target: add(lie, [0, 0.45, 0]), fov: 34, close: 0.9 };
      return { beat: 'f1', cut: true, pos: Vt.slice(), target: add(Vt, V.scale(exploreDir(), 120)), fov: ex.fov };
    }
    if (cin.name === 'stand') {
      // the pose timings match CharacterDirector.wanted(): H 0–1.6 · I 1.6–3.8 · C 3.8–6.0 · J 6.0+
      if (t < 1.6) return { beat: 's0', cut: true, pos: L(add(lie, [0.6, 1.0, 2.5]), add(lie, [0.75, 1.15, 2.8]), t / 1.6), target: L(C, [-60, H - 10, -420], t / 1.6), fov: 44, close: 0.5 };
      if (t < 3.8) return { beat: 's1', cut: true, pos: L(add(lie, [0.45, 0.42, 2.2]), add(lie, [0.6, 0.62, 2.4]), (t - 1.6) / 2.2), target: add(lie, [0, 0.32, 0]), fov: 33, close: 1 };
      if (t < 6.0) return { beat: 's2', cut: true, pos: L(add(lie, [0.4, 0.6, 3.1]), add(lie, [0.3, 0.5, 2.65]), (t - 3.8) / 2.2), target: add(lie, [0, 0.66, 0]), fov: 36, close: 0.9 };
      if (t < cin.dur - 1.0) return { beat: 's3', cut: true, pos: L(add(edge, [1.25, 1.35, 4.2]), add(edge, [2.1, 2.2, 5.6]), (t - 6.0) / (cin.dur - 7.0)), target: L([-40, H - 25, -380], [-60, H - 10, -420], (t - 6.0) / (cin.dur - 7.0)), fov: 44, close: 0.5 };
      return { beat: 's4', glide: true, pos: Vt.slice(), target: add(Vt, V.scale(exploreDir(), 120)), fov: ex.fov };
    }
    if (cin.name === 'liftoff') {
      if (t < 1.2) return { beat: 'l0', cut: true, pos: add(edge, [1.6, 1.5, 4.6]), target: [-60, H - 10, -420], fov: 44, close: 0.5 };
      if (t < 3.4) { const k = (t - 1.2) / 2.2; return { beat: 'l1', cut: true, pos: add(edge, [0.3, 0.55, 3.8 - 0.6 * k]), target: add(edge, [0, 1.6 + 1.4 * k, -6]), fov: 44, close: 0.4 }; }
      const c = chase(); c.beat = 'l3'; c.cut = true; return c;
    }
    return null;
  }

  /* ASCENSION: in front of her, full body; the orbit and pull-back follow
     the emotional phase (held time), not the clock. */
  function ascensionPose(at) {
    const F = AG.Flight, a = F.ascT, p = F.pos;
    const lev = U.smooth(3.8, 12, a), rise = U.smooth(11, 24, a);
    if (!arcOn) { arcOn = true; arcAt = at; }
    const swing = U.smooth(0, 2.4, at - arcAt);                                   // from the chase (behind) round to her face
    const ang = F.yaw + Math.PI * (1 - swing) * (arcSide) + 0.42 * U.smooth(4, 16, a) + 0.05 * Math.sin(at * 0.15);
    const dist = U.lerp(4.4, 6.5, lev) + 5 * rise;                            // she stays full-body and readable
    // above her while she suffers · below her as she levitates (heroic) · above again as she
    // soars, so the city can be seen falling away beneath her
    const el = U.lerp(0.16, -0.26, U.smooth(2.5, 10, a)) + 0.5 * rise;
    const off = [Math.sin(ang) * Math.cos(el) * dist, Math.sin(el) * dist, -Math.cos(ang) * Math.cos(el) * dist];
    const target = V.add(p, [0, 0.1 - 0.5 * rise, 0]);
    return { pos: V.add(p, off), target, fov: U.lerp(36, 42, rise), flight: true, rate: swing < 1 ? 5 : 1.7, anchor: p.slice(), fs: F.state() };
  }

  /* LIGHT (after the fifth fragment), on the flight's game clock (Flight.finaleT):
     GLIDE  the camera eases back from the chase (≈ 5 m) to ≈ 16 m behind, 5 m above and a
            little to the side of her, widens the lens and looks past her, slightly down along
            her course: she stays readable (≈ 10 % of the frame height, just below the centre)
            while the city below and the skyline ahead fill most of the picture.
     ASCENT the original LIGHT pull-back, starting from wherever the glide left the camera: it
            eases round (shortest way) to the side away from the dawn and a little below her,
            so she rises in front of the sun with the city falling away beneath. She is kept
            near the centre (the look point stays within a few metres of her).            */
  const DAWN = V.norm([0.55, 0, -0.83]);              // the sky shader's dawn / sun direction, flat
  function finalePose() {
    const F = AG.Flight, FC = AG.CONFIG.flight, t = F.finaleT, p = F.pos, fs = F.state();
    if (t < FC.finaleGlide) {
      const k = U.easeInOut(U.clamp(t / (FC.finaleGlide * 0.6), 0, 1));      // the pull-back
      const back = U.lerp(5.5, 16, k), up = U.lerp(1.0, 5, k), side = 4 * k;
      const pos = V.add(V.add(V.sub(p, V.scale(fs.fwd, back)), [0, up, 0]), V.scale(fs.right, side));
      const target = V.add(V.add(p, V.scale(fs.fwd, U.lerp(8, 80, k))), [0, -U.lerp(0, 12, k), 0]);
      return { pos, target, fov: U.lerp(56, 62, k), flight: true, rate: 1.4, anchor: p.slice(), fs };
    }
    if (finaleAt < 0) { finaleAt = t; finaleAnchor = V.sub(cur.pos, p); finaleFwd = fs.fwd.slice(); }
    const k = U.easeInOut(U.clamp((t - finaleAt) / 12, 0, 1));
    const a0 = Math.atan2(finaleAnchor[0], finaleAnchor[2]), a1 = Math.atan2(-DAWN[0], -DAWN[2]);
    const ang = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) * k;
    const r = U.lerp(Math.hypot(finaleAnchor[0], finaleAnchor[2]), 19, k), h = U.lerp(finaleAnchor[1], -3, k);
    const cam = V.add(p, [Math.sin(ang) * r, h, Math.cos(ang) * r]);
    const target = V.add(V.add(p, [0, 0.2 + 1.5 * k, 0]), V.scale(DAWN, 4 * k));
    return { pos: cam, target, fov: U.lerp(60, 52, k), flight: true, rate: 1.2, anchor: p.slice() };
  }

  /* ---------- EXPLORE (01–04) ---------- */
  function explorePose(dt, input) {
    const IA = AG.Interactions, Vt = vantage();
    if (!ex.init) {
      const d = V.norm(V.sub(cur.target, cur.pos));
      ex.yaw = Math.atan2(d[0], -d[2]); ex.pitch = U.clamp(Math.asin(U.clamp(d[1], -1, 1)), -0.45, 0.25); ex.fov = U.clamp(cur.fov, 30, 58);
      ex.init = true; ex.still = 0;
    }
    const k = AG.Flight.keys || {};
    const kx = (k.right ? 1 : 0) - (k.left ? 1 : 0), ky = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    const looking = !IA.dragging;
    if (looking) { ex.yaw -= input.dragDX * 0.0035 * (ex.fov / 50); ex.pitch += input.dragDY * 0.0025 * (ex.fov / 50); }
    ex.yaw += kx * 1.1 * dt; ex.pitch += ky * 0.6 * dt;
    ex.fov = U.clamp(ex.fov * Math.exp(input.wheel * 0.0009), 24, 62);
    ex.still = (input.dragging && looking) || kx || ky ? 0 : ex.still + dt;
    // a patient hint: after a long search, a gentle drift toward the pulse
    if (AG.FSM.state === 'NUMBNESS' && IA.hintLevel >= 3 && ex.still > 2.5 && IA.beacon) {
      const b = V.sub(IA.beacon.pos, Vt);
      const by = Math.atan2(b[0], -b[2]), bp = Math.atan2(b[1], Math.hypot(b[0], b[2]));
      const dy = Math.atan2(Math.sin(by - ex.yaw), Math.cos(by - ex.yaw));
      ex.yaw += dy * (1 - Math.exp(-0.45 * dt)); ex.pitch = U.damp(ex.pitch, bp, 0.45, dt);
    }
    ex.pitch = U.clamp(ex.pitch, -0.5, 0.3);
    return { pos: Vt.slice(), target: V.add(Vt, V.scale(exploreDir(), 120)), fov: ex.fov, explore: true };
  }

  function freePose(rt) {
    const H = info.hero.H0, sp = AG.CharacterDirector.spots;
    const ch = AG.CharacterDirector.out;
    const flying = ch && ch.flying;
    switch (mode) {
      case 'orbit': {
        if (flying) { const c = chase(); return c; }
        const m = ch ? ch.main.anchorPos : sp.lie;
        const a = Math.sin(rt * 0.15) * 0.3;
        return { pos: V.add(m, [Math.sin(a) * 3.2, 1.1, Math.cos(a) * 3.2]), target: V.add(m, [0, 0.5, 0]), fov: 36, close: 0.8 };
      }
      case 'rooftop': return { pos: V.add(sp.edge, [1.6 + Math.sin(rt * 0.05) * 0.4, 2.2, 6.0]), target: [-25, H - 22, -320], fov: 46, close: 0.4 };
      case 'wide': return { pos: [95 + Math.sin(rt * 0.02) * 10, H + 62, 95], target: [-60, H - 45, -300], fov: 54 };
      case 'aerial': {
        const a = rt * 0.018, cx = -100, cz = -320, R = 520;
        return { pos: [cx + Math.cos(a) * R, 210 + Math.sin(a * 2.0) * 40, cz + Math.sin(a) * R], target: [cx + Math.cos(a + 0.25) * R * 0.55, 60, cz + Math.sin(a + 0.25) * R * 0.55], fov: 58 };
      }
      case 'street': {
        const x = info.flightX, z = ((rt * 5) % 900);
        return { pos: [x + 4, 2.2, info.frontStreetZ - 20 - z], target: [x - 6, 45, info.frontStreetZ - 80 - z], fov: 62, close: 0.3 };
      }
    }
    return null;
  }

  function directedPose(dt, input, at) {
    const F = AG.FSM, cin = F.cinematic;
    if (cin) { const c = cinematicPose(cin); if (c) return c; }
    if (!(F.state === 'AFTERGLOW' && (AG.Flight.arc || AG.Flight.finale)) && arcOn) { arcOn = false; arcSide = -arcSide; }
    if (F.state === 'AFTERGLOW') return AG.Flight.finale ? finalePose() : AG.Flight.arc ? ascensionPose(at) : chase();
    return explorePose(dt, input);
  }

  /* keep the camera inside the safe viewing cone of a flat pose */
  function constrainToPose(pos, ch) {
    if (!ch || ch.flying) return pos;
    const m = ch.main;
    if (m.mode !== 'fixed' && m.mode !== 'cyl') return pos;
    const c = V.add(m.anchorPos, [0, 0.45, 0]);
    const off = V.sub(pos, c), r = V.len(off);
    if (r > 14) return pos;
    let yaw = Math.atan2(off[0], off[2]);
    let el = Math.asin(U.clamp(off[1] / r, -1, 1));
    if (m.mode === 'fixed') {
      const meta = AG.CHARACTER_MANIFEST.poses[m.id], lim = (meta.maxTurn || 22) * Math.PI / 180, face = meta.face || 0;
      const rel = Math.atan2(Math.sin(yaw - face), Math.cos(yaw - face));
      yaw = face + U.clamp(rel, -lim, lim);
    }
    el = U.clamp(el, -0.12, m.id === 'A' || m.id === 'I' ? 0.3 : 0.52);
    return V.add(c, [Math.sin(yaw) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(yaw) * Math.cos(el) * r]);
  }

  function update(at, dt, rt, input) {
    if (!info || !vantage()) return out;
    const ch = AG.CharacterDirector.out;
    const directed = directedPose(dt, input, at);
    if (AG.FSM.cinematic && AG.FSM.cinematic.name === 'intro') ex.init = true;   // the intro ends on the explore view
    const desired = mode === 'film' ? directed : (freePose(rt) || directed);
    if (desired.beat !== undefined && desired.beat !== lastBeat) { if (desired.cut) snap = true; lastBeat = desired.beat; }
    if (desired.beat === undefined) lastBeat = '';
    // mouse orbit offsets (only in alternative views and flight), tight in narrow canyons
    let yawLim = 0.9, pitLim = 0.6;
    if (desired.flight) {
      const cl = AG.Flight.clearance(desired.fs ? desired.fs.pos : desired.target);
      yawLim = cl < 14 ? 0.08 : cl < 30 ? 0.18 : 0.32; pitLim = yawLim * 0.7;
    }
    const orbiting = mode !== 'film' || desired.flight;
    if (orbiting && !AG.Interactions.dragging) {
      dragYaw = U.clamp(dragYaw + input.dragDX * 0.005, -yawLim, yawLim);
      dragPitch = U.clamp(dragPitch + input.dragDY * 0.003, -pitLim, pitLim);
      if (mode !== 'film') zoom = U.clamp(zoom * Math.exp(input.wheel * 0.0012), 0.5, 2.0);
    }
    if (!orbiting || !input.dragging) { dragYaw = U.damp(dragYaw, 0, orbiting ? 0.35 : 3, dt); dragPitch = U.damp(dragPitch, 0, orbiting ? 0.35 : 3, dt); }
    if (mode === 'film') zoom = U.damp(zoom, 1, 0.25, dt);
    let off = V.sub(desired.pos, desired.target);
    const r = V.len(off);
    const yaw = Math.atan2(off[0], off[2]) + dragYaw;
    const el = U.clamp(Math.asin(U.clamp(off[1] / r, -1, 1)) + dragPitch, -1.35, 1.45);
    const rr = r * (mode === 'film' || desired.flight ? 1 : zoom);
    off = [Math.sin(yaw) * Math.cos(el) * rr, Math.sin(el) * rr, Math.cos(yaw) * Math.cos(el) * rr];
    let pos = V.add(desired.target, off);
    const target = desired.target.slice();
    pos = constrainToPose(pos, ch);
    // depth-aware chase: never put a building between her and the lens
    if (desired.flight && ch && ch.main.anchorPos) {
      const her = ch.main.anchorPos;
      const f = AG.Flight.segmentClear(her, pos, 1.5);
      if (f < 1) pos = V.lerp(her, pos, Math.max(0.25, f - 0.05));
    }
    const fov = desired.fov;
    const rate = snap ? 1e6 : desired.rate ? desired.rate : desired.flight ? 7 : desired.explore ? 6 : desired.glide ? 1.4 : 2.6;
    // follow a rising subject without lag: carry the camera along with her, then ease the framing
    if (desired.anchor && lastAnchor) { const dlt = V.sub(desired.anchor, lastAnchor); cur.pos = V.add(cur.pos, dlt); cur.target = V.add(cur.target, dlt); }
    lastAnchor = desired.anchor ? desired.anchor.slice() : null;
    cur.pos = cur.pos.map((v, i) => U.damp(v, pos[i], rate, dt));
    cur.target = cur.target.map((v, i) => U.damp(v, target[i], desired.rate ? desired.rate * 2.5 : desired.flight ? 12 : desired.explore ? 10 : rate, dt));
    cur.fov = U.damp(cur.fov, fov, snap ? 1e6 : 2.5, dt);
    cur.close = U.damp(cur.close, desired.close || 0, snap ? 1e6 : 1.5, dt);
    snap = false;
    // breathing handheld drift + impact shake + mouse parallax
    const S = AG.Story.state;
    const shake = (S.impact || 0) * 0.06;
    const hand = [Math.sin(rt * 0.37) * 0.02 + Math.sin(rt * 1.3) * 0.006 + Math.sin(rt * 47) * shake, Math.sin(rt * 0.29 + 1) * 0.015 + Math.cos(rt * 53) * shake, 0];
    const dirv = V.norm(V.sub(cur.target, cur.pos));
    const dist = V.len(V.sub(cur.target, cur.pos));
    const right = V.norm(V.cross(dirv, [0, 1, 0]));
    const up = V.cross(right, dirv);
    const pk = desired.flight ? 0.0 : desired.explore ? 0.006 : 0.05;
    const par = V.add(V.scale(right, input.mx * pk * dist), V.scale(up, -input.my * pk * 0.7 * dist));
    out.pos = V.add(cur.pos, V.scale(hand, Math.max(1, dist * 0.02)));
    out.target = V.add(cur.target, par);
    out.fov = cur.fov; out.close = cur.close; out.flight = !!desired.flight; out.explore = !!desired.explore;
    out.right = right; out.up = up; out.dir = dirv;
    const her = ch && ch.main.anchorPos ? ch.main.anchorPos : AG.CharacterDirector.spots.lie;
    const dH = V.len(V.sub(out.pos, her));
    out.distHero = dH;
    // near/far depth split while we are up on her roof
    out.split = !out.flight && dH < 70 && Math.abs(out.pos[0]) < 45 && Math.abs(out.pos[2]) < 45 && out.pos[1] > info.hero.H0 - 4;
    out.nearSplit = out.flight && dH < 40;
    return out;
  }

  function matrices(aspect, near, far) {
    const proj = U.mat4.perspective(out.fov * Math.PI / 180, aspect, near, far);
    const view = U.mat4.lookAt(out.pos, out.target, [0, 1, 0]);
    return { proj, view };
  }

  return { MODES, setInfo, setMode, cycle, update, matrices, snapNext, reset, get mode() { return mode; }, state: out, explore: ex };
})();
