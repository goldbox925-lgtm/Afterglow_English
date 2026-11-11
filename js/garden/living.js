/* =====================================================================
   Round 02 · the living architecture (AG.Living)
   ---------------------------------------------------------------------
   Each building's transformation, a CONSEQUENCE of its flower reaching
   100 %. Every value that moves is read from that site's record in
   AG.Gardens (transform, stage A–E, sinceBloom, windows; advanced by
   js/garden/round2.js).

   What it builds (once per site, deterministically from the building,
   when its transformation starts: p.randomSeed(seed from the building)):
     (inside the Memory Garden the transformation plays on the glass
     atrium itself: js/garden/atrium.js reads the same stages)
     FACADE   outside in the city: the same wall program on the
              building's four REAL faces (its lowest shaft, from the
              city's own geometry), light vines grown on those faces from
              the ground and from the doorway's sides
     ROOFTOP  a giant iridescent flower on the roof: another
              AG.BloomFlower in that site's palette, drawn by the existing
              flower renderer (GardenScene.drawFlowerBody, the same
              shaders and the same p.rotate / p.scale petal transforms),
              opening with stage D
   Stages (site.stage, each 0..1, overlapping so nothing is abrupt):
     A awakening   a wave of light spreads from the flower through the atrium
     B energy      lines travel up the structure; windows begin to light
     C growth      vines in the site's colours climb the facade
     D rooftop     the giant flower opens on the roof; light from above
     E living      everything breathes (p.sin), the vines' light flows

   Shaders and the flower meshes are shared by every site. Only each
   site's facade mesh is its own; it is built when needed and freed on
   a reset.
   ===================================================================== */
window.AG = window.AG || {};

AG.Living = (function () {
  const U = AG.U, V3 = U.v3;
  let p = null, SH = null;
  const L = {};
  const CFAR = 1100;              // metres: beyond this a site's rising particles rest

  function init(inst) { p = inst; }
  function shaders() {
    if (SH) return SH;
    SH = { wall: p.createShader(AG.SHADERS.livingWall.vert, AG.SHADERS.livingWall.frag), vine: p.createShader(AG.SHADERS.livingVine.vert, AG.SHADERS.livingVine.frag) };
    return SH;
  }
  const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const colours = (cfg) => { const c = cfg.city, k = (v) => p.color(v[0], v[1], v[2]); return { pink: k(c.a), lav: k(c.b), cyan: k(c.cool), gold: k(c.gold) }; };

  /* ---------------- build (once per site's transformation) ---------------- */
  function build(site) {
    const P = site.portal, sh = P.shaft || P.box.shafts[0], b = P.box;
    const seed = Math.floor(Math.abs(b.cx * 73.13 + b.cz * 19.71)) % 99991 + 7;
    p.randomSeed(seed);
    const nz = (seed % 997) * 0.731;

    // ---- FACADE (city coordinates): the doorway shaft's four REAL faces ----
    const FW = new AG.GeometryBuilder('facadeWalls' + site.index), fsets = [], faces = [];
    const sx = sh.w / 2, sz = sh.d / 2, fy0 = sh.y0, FH = sh.y1 - sh.y0;
    const door = P.c;
    for (const n of NORMALS) {
      const hn = n[0] ? sx : sz, ht = n[0] ? sz : sx, t = [-n[2], 0, n[0]];
      const O = V3.add([b.cx, fy0, b.cz], V3.sub(V3.scale(n, hn + 0.45), V3.scale(t, ht)));
      FW.data = [0, 0, 0, 0];
      FW.quad(O, V3.add(O, V3.scale(t, 2 * ht)), V3.add(V3.add(O, V3.scale(t, 2 * ht)), [0, FH, 0]), V3.add(O, [0, FH, 0]), n, [0, 0, 2 * ht, FH]);
      const surf = AG.Vines.plane(O, t, [0, 1, 0], n, 0.05);
      const roots = [], nr = Math.max(2, Math.round(2 * ht / 6));
      for (let i = 0; i < nr; i++) roots.push([p.map(i + p.random(0.2, 0.8), 0, nr, 1, 2 * ht - 1), 0.3, p.random(-0.3, 0.3), 1, p.random(0, 10)]);
      // on the doorway's face, vines also spring from both sides of the doorway and above it
      if (n[0] === P.n[0] && n[2] === P.n[2]) {
        const ud = V3.dot(V3.sub(door, O), t), vd = door[1] - fy0;
        roots.push([ud - P.w / 2 - 0.5, vd - P.h / 2 + 1, -0.5, 1, 0], [ud + P.w / 2 + 0.5, vd - P.h / 2 + 1, 0.5, 1, 0], [ud, vd + P.h / 2 + 1, 0, 1, 0]);
      }
      const branches = AG.Vines.grow(p, { roots, step: 1.1, steps: Math.round(FH / 1.1 * 1.2), turn: 0.3, freq: 0.05, nz: nz + 300 + fsets.length * 13, bias: [0, 1], biasK: 0.07, branchP: 0.05, maxDepth: 2, maxBranches: 45, u0: 0.2, u1: 2 * ht - 0.2, v0: 0, v1: FH - 0.5 });
      fsets.push({ surf, branches, bounds: [0, 2 * ht, 0, FH] });      // (leaves stay on this face)
      faces.push({ O, t, n, w: 2 * ht, h: FH });
    }
    const FV = new AG.GeometryBuilder('facadeVines' + site.index);
    // ribbons wide enough to read from the street, and a small luminous leaf every 4 steps
    AG.Vines.ribbons(FV, fsets, AG.Vines.maxS(fsets), 0.7, { leafEvery: 4, leafSize: 1.6, rand: () => p.random() });

    // ---- ROOFTOP: a giant BloomFlower in this site's palette, growing FROM its own roof ----
    const roof = AG.BloomFlower.create(p, { center: site.rooftop.center, scale: site.rooftop.scale, palette: site.cfg.flower });

    // ---- particles rising up the facade into the rooftop flower (p5.Vector) ----
    const rise = [];
    for (let i = 0; i < 64; i++) rise.push({ pos: p.createVector(0, -1e4, 0), vel: p.createVector(0, 0, 0), life: 0, seed: p.random(100), size: p.random(0.5, 1.3), hue: p.random() });

    // sparse sparkles on musical accents after completion (16 slots of the same sprite program)
    const spark = []; for (let i = 0; i < 16; i++) spark.push({ pos: [0, -1e4, 0], life: 0, size: 1, col: [1, 1, 1] });
    site.living = {
      seed, faces, rise, spark, sparkSpr: new Float32Array(64 * 4), sparkSprC: new Float32Array(64 * 4), lastAcc: 0, sparkCd: 0, C: colours(site.cfg),
      facade: { walls: FW.build(p), vines: FV.build(p), H: FH, grid: [6.0, 4.4], origin: door.slice(), reach: Math.hypot(sx, sz) * 2 + FH },
      roof, roofY: site.rooftop.center[1], roofScale: site.rooftop.scale,
      spr: new Float32Array(64 * 4), sprC: new Float32Array(64 * 4), pv: p.createVector(0, 0, 0), ph: p.createVector(0, 0, 0),
      halo: new Float32Array(64 * 4), haloC: new Float32Array(64 * 4)     // the landmark's glow crown (slots 0–1)
    };
    AG.U.emit('livingBuilt', { seed, site: site.id });
  }

  /* free one site's own meshes (its flower geometry and shaders are shared) */
  function release(site) {
    const B = site.living;
    if (B && p.freeGeometry) { B.facade.walls.forEach((g) => p.freeGeometry(g)); B.facade.vines.forEach((g) => p.freeGeometry(g)); }
    site.living = null;
  }

  /* ---------------- per frame ---------------- */
  function updateSite(site, dt) {
    if (site.transform <= 0) { if (site.living) release(site); return; }
    if (!site.living) build(site);
    const built = site.living, S = site.stage, D = S.D, t = site.sinceBloom;
    // THE ROOFTOP FLOWER: it EMERGES from the roof (grows from a seed of light: its scale, the same
    // p.scale origin as every flower) through the first part of stage D, then OPENS; the bloom value
    // eases through BloomFlower's own p.lerp
    const rf = built.roof;
    const emerge = p.constrain(p.map(D, 0, 0.45, 0, 1), 0, 1);
    rf.extScale = p.lerp(0.12, 1, 1 - Math.pow(1 - emerge, 3));
    rf.awake = D > 0.01; rf.target = p.constrain(p.map(D, 0.35, 1, 0, 1), 0, 1);
    const inside = AG.Garden.drawsScene();
    const camPos = inside ? [rf.center[0], rf.center[1] + 50, rf.center[2] + 80] : AG.Camera.state.pos;
    rf.update(dt, camPos);
    awakening(site, built, inside ? 0 : AG.FSM.playing ? dt : 0, inside);
    // RISING PARTICLES: only where they can be seen
    built.spr.fill(0); built.sprC.fill(0);
    if (inside || p.dist(camPos[0], camPos[2], rf.center[0], rf.center[2]) > CFAR) return;
    // born on the facade (a random face, along its width, low down), they climb with a p.noise
    // sway (and each building's own p.cos / p.sin spiral) and, near the top, bend into the flower
    const rate = p.map(S.C + S.D, 0, 2, 0, 1) * (1 - 0.5 * S.E) + 0.3 * S.E;
    const top = built.roofY, heart = rf.center, C = built.C, M = site.cfg.motion;
    for (let i = 0; i < built.rise.length; i++) {
      const m = built.rise[i];
      if (m.life <= 0) {
        if (p.random() > rate * dt * 2.5) continue;
        const f = built.faces[Math.floor(p.random(built.faces.length))], u = p.random(0.5, f.w - 0.5), v = p.random(0, f.h * 0.6);
        const q = V3.add(V3.add(V3.add(f.O, V3.scale(f.t, u)), [0, v, 0]), V3.scale(f.n, 1.2));
        m.pos.set(q[0], q[1], q[2]); m.vel.set(0, p.random(5, 9), 0); m.life = 1;
      }
      const sway = (p.noise(m.seed, t * 0.3) - 0.5) * 2;
      const nearTop = p.constrain(p.map(m.pos.y, top - 40, top + 4, 0, 1), 0, 1);
      built.ph.set(heart[0], heart[1] + rf.scale * 0.6, heart[2]).sub(m.pos).setMag(9);
      built.pv.set(sway + p.cos(t * M.f + m.seed) * M.h, 7, p.sin(t * M.f + m.seed) * M.h).lerp(built.ph, nearTop);
      m.vel.lerp(built.pv, 1 - Math.exp(-1.6 * dt));
      m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;
      if (m.pos.y > top + rf.scale * 0.9 || p.dist(m.pos.x, m.pos.z, heart[0], heart[2]) < 1.5 && m.pos.y > top) m.life = 0;
      const a = (0.5 + 0.5 * p.sin(t * 3 + m.seed)) * (m.life > 0 ? 1 : 0);
      const c = p.lerpColor(p.lerpColor(C.lav, C.pink, m.hue), C.gold, nearTop * 0.7);
      built.spr.set([m.pos.x, m.pos.y, m.pos.z, m.size], i * 4);
      built.sprC.set([p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255, a * 0.8], i * 4);
    }
  }
  /* AFTER COMPLETION, the first time she is out in the city to see it (site.surge, 0 … 9 game
     seconds, js/garden/gardens.js): the completion wave climbs the facade (≈ 3.5 s), and sparse
     sparkles answer the music's accents round the building. Both read AG.Reactivity, whose values
     already include the AUDIO REACTIVITY ON/OFF fade: with it OFF the wave still climbs (at its
     plain strength) and no sparkle is born. Nothing here adds a sound source. */
  const SEQ_T = 9, WAVE_P = 14;
  function awakening(site, B, dt, inside) {
    const R = AG.Reactivity, T = site.surge, on = site.completed && T > 0 && T < SEQ_T && !inside;
    B.wave = on ? [(B.facade.H + 8) * U.smooth(0.1, 3.6, T) - 4, U.smooth(0, 0.35, T) * (1 - U.smooth(3.3, 4.6, T)) * (0.8 + 0.6 * R.drive.mid)] : [0, 0];
    // AFTERWARDS, while it stands complete: a restrained wave climbs the facade every ~14 s, its strength
    // from the music's mids and × R.amount, so it fades away with AUDIO REACTIVITY OFF
    const after = site.completed && !inside && T >= SEQ_T;
    if (after) {
      const u = (site.sinceBloom % WAVE_P) / 4.2;
      if (u < 1) B.wave = [(B.facade.H + 8) * U.smooth(0, 1, u) - 4, Math.sin(Math.PI * u) * 0.35 * (0.45 + 0.9 * R.drive.mid) * R.amount];
    }
    // sparkles: born on a RISING accent (an onset), a few at a time, short-lived, never near her
    const acc = R.accent || 0;
    B.sparkCd = Math.max(0, B.sparkCd - dt);
    // (afterwards: occasional, one or two at a time, only round the rooftop flower)
    const roofOnly = !on && after;
    if ((on || roofOnly) && dt > 0 && acc > 0.42 && acc - B.lastAcc > 0.02 && B.sparkCd <= 0) {
      B.sparkCd = roofOnly ? 1.4 : 0.24;
      const her = AG.Flight.pos, C = B.C, n = roofOnly ? 1 + Math.floor(acc * 1.6) : 2 + Math.floor(acc * 3);
      for (let j = 0, made = 0; j < 16 && made < n; j++) {
        const m = B.spark[j];
        if (m.life > 0) continue;
        const f = B.faces[Math.floor(p.random(B.faces.length))];
        const q = roofOnly || p.random() < 0.3
          ? V3.add(B.roof.center, [p.random(-1, 1) * B.roofScale, p.random(0.2, 1.1) * B.roofScale, p.random(-1, 1) * B.roofScale])
          : V3.add(V3.add(V3.add(f.O, V3.scale(f.t, p.random(1, f.w - 1))), [0, p.random(2, f.h), 0]), V3.scale(f.n, p.random(1.5, 4)));
        if (V3.len(V3.sub(q, her)) < 14) continue;
        const c = p.lerpColor(p.lerpColor(C.pink, C.gold, p.random()), C.cyan, p.random(0, 0.3));
        m.pos = q; m.life = 1; m.size = p.random(0.9, 1.6); m.col = [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255]; made++;
      }
    }
    B.lastAcc = acc;
    B.sparkSpr.fill(0); B.sparkSprC.fill(0);
    B.sparks = 0;
    for (let j = 0; j < 16; j++) {
      const m = B.spark[j];
      if (m.life <= 0) continue;
      m.life = Math.max(0, m.life - dt / 0.7);
      const a = Math.sin(Math.PI * m.life);                          // a quick glint: in and out
      B.sparkSpr.set([m.pos[0], m.pos[1], m.pos[2], m.size * (0.6 + 0.6 * a)], j * 4);
      B.sparkSprC.set([m.col[0], m.col[1], m.col[2], a * 0.9], j * 4);
      if (m.life > 0) B.sparks++;
    }
  }

  /* THE TRAIL (the flight out, js/garden/garden.js): a short line of light from where she came out
     toward the next building's beacon, in the completed building's colours. It draws itself out
     (≈ 2 s), shimmers (more with the treble when AUDIO REACTIVITY is ON), and fades by ≈ 7.5 s.
     Only the first part of the way (≤ 160 m), and never over her. Game time: pause holds it. */
  const TRAIL_N = 48;
  let trail = null;
  function startTrail(site, from, to) {
    const d = V3.sub(to, from), L = Math.min(160, Math.hypot(d[0], d[2]) * 0.6);
    if (!(L > 10)) { trail = null; return; }
    const C = site.living ? site.living.C : colours(site.cfg), k = (c) => [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255];
    trail = { from: from.slice(), dir: V3.norm([d[0], 0, d[2]]), rise: U.clamp(d[1], -30, 40) * (L / Math.max(1, Math.hypot(d[0], d[2]))), L, t: 0,
      colA: k(C.pink), colB: k(C.gold), spr: new Float32Array(64 * 4), sprC: new Float32Array(64 * 4) };
  }
  function stopTrail() { trail = null; }
  function trailUpdate(dt) {
    if (!trail) return;
    trail.t += dt;
    const T = trail, t = T.t, head = U.smooth(0.2, 2.2, t), fade = 1 - U.smooth(5.5, 7.5, t), her = AG.Flight.pos, tre = AG.Reactivity.drive.treble;
    if (fade <= 0) { trail = null; return; }
    T.spr.fill(0); T.sprC.fill(0);
    for (let i = 0; i < TRAIL_N; i++) {
      const u = i / (TRAIL_N - 1);
      if (u > head) break;
      const q = V3.add(V3.add(T.from, V3.scale(T.dir, 6 + u * T.L)), [0, Math.sin(Math.PI * u) * 6 + u * T.rise, 0]);
      const near = U.smooth(4, 12, V3.len(V3.sub(q, her)));
      const tip = Math.exp(-Math.pow((head - u) * 9, 2)), shimmer = 0.55 + 0.45 * Math.sin(u * 26 - t * 6);
      const a = (0.45 + 0.5 * shimmer * (1 + 0.6 * tre) + 0.8 * tip) * fade * near * (1 - 0.4 * u);
      const c = V3.lerp(T.colA, T.colB, u);
      T.spr.set([q[0], q[1], q[2], (2.0 + 1.4 * tip) * (1 + 0.6 * u)], i * 4);   // (larger further on: it stays a line at a distance)
      T.sprC.set([c[0], c[1], c[2], a], i * 4);
    }
  }

  function update(dt) {
    for (const s of AG.Gardens.sites) updateSite(s, dt);
    trailUpdate(AG.FSM.playing && !AG.Garden.drawsScene() ? dt : 0);
    const a = AG.Garden.site;
    L.built = a ? a.living : null;
  }

  /* one site's shared colours and breathing (p.lerpColor, p.sin); the active site by default */
  function look(site) {
    const s = site || AG.Garden.site;
    const S = s.stage, t = s.sinceBloom, T = s.transform, C = s.living ? s.living.C : colours(s.cfg);
    const rgb = (c) => [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255];
    return {
      A: rgb(p.lerpColor(C.pink, C.lav, 0.5 * S.E)), B: rgb(p.lerpColor(C.cyan, C.pink, 0.4 * S.D)), C: rgb(p.lerpColor(C.lav, C.gold, 0.45 * S.E)),
      // the windows change colour as the building wakes: cool → the site's main colour → its warm accent
      winA: rgb(p.lerpColor(p.lerpColor(C.cyan, C.pink, p.constrain(p.map(T, 0.25, 0.6, 0, 1), 0, 1)), C.gold, p.constrain(p.map(T, 0.6, 1, 0, 0.8), 0, 1))),
      winB: rgb(p.lerpColor(C.lav, C.pink, p.constrain(p.map(T, 0.3, 0.9, 0, 1), 0, 1))),
      breath: 1 + 0.12 * S.E * p.sin(t * 0.9)
    };
  }

  /* the vine program for one ribbon mesh, revealed up to `grow` */
  function drawVines(site, geos, vw, grow, cols, lk) {
    const sh = shaders();
    p.shader(sh.vine);
    sh.vine.setUniform('uView', vw.V); sh.vine.setUniform('uProj', vw.P); sh.vine.setUniform('uCamPos', vw.eye); sh.vine.setUniform('uTime', site.sinceBloom);
    sh.vine.setUniform('uGrow', grow); sh.vine.setUniform('uBreath', lk.breath); sh.vine.setUniform('uE', site.stage.E); sh.vine.setUniform('uFade', 1);
    sh.vine.setUniform('uColA', cols[0]); sh.vine.setUniform('uColB', cols[1]); sh.vine.setUniform('uColC', cols[2]);
    geos.forEach((g) => p.model(g));
  }

  function drawSet(site, vw) {
    const set = site.living.facade, S = site.stage, sh = shaders(), lk = look(site);
    p.shader(sh.wall);
    sh.wall.setUniform('uView', vw.V); sh.wall.setUniform('uProj', vw.P); sh.wall.setUniform('uCamPos', vw.eye); sh.wall.setUniform('uTime', site.sinceBloom);
    sh.wall.setUniform('uStage', [S.A, S.B, S.C, S.D]); sh.wall.setUniform('uE', S.E); sh.wall.setUniform('uBreath', lk.breath);
    sh.wall.setUniform('uWin', site.windows); sh.wall.setUniform('uReach', set.reach); sh.wall.setUniform('uHeight', set.H);
    sh.wall.setUniform('uInterior', 0); sh.wall.setUniform('uOrigin', set.origin); sh.wall.setUniform('uGrid', set.grid); sh.wall.setUniform('uFade', 1);
    sh.wall.setUniform('uWinA', lk.winA); sh.wall.setUniform('uWinB', lk.winB); sh.wall.setUniform('uWave', site.living.wave || [0, 0]);
    const pc = site.cfg.portal; sh.wall.setUniform('uPalA', pc.a); sh.wall.setUniform('uPalB', pc.b); sh.wall.setUniform('uPalGold', pc.gold); sh.wall.setUniform('uPalCool', pc.cool);
    set.walls.forEach((g) => p.model(g));
    // STAGE C: the vines climbing the facade, with their leaves
    if (S.C > 0.001) drawVines(site, set.vines, vw, S.C * 1.02, [lk.A, lk.B, lk.C], lk);
  }

  /* outside in the city: every transformed site's facade, particles and rooftop flower */
  function drawCity(F) {
    const gl = p.drawingContext, vw = { V: F.view, P: F.proj, eye: F.cam.pos }, sc = AG.Garden.scene;
    for (const s of AG.Gardens.sites) {
      if (!s.living || s.transform <= 0) continue;
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD);
      drawSet(s, vw);
      if (sc && (s.stage.C > 0.001 || s.stage.D > 0.001)) sc.drawSprites(s.living.spr, s.living.sprC, vw, s.living.roof.t);
      p.blendMode(p.BLEND);
      if (s.stage.D > 0.001 && sc) {
        sc.drawFlowerBody(s.living.roof, vw);
        // THE LANDMARK'S GLOW CROWN: a soft halo of the flower's colours round it, depth-tested (a
        // building in front hides it, the beacon above still shows), never smaller on screen than about
        // 3 % of the distance, so the flower reads from across the city; quieter close up
        const B = s.living, rf = B.roof, c = V3.add(rf.center, [0, rf.scale * 0.55, 0]), d = V3.len(V3.sub(c, vw.eye));
        const far = U.smooth(80, 420, d), br = 0.85 + 0.15 * Math.sin(s.sinceBloom * 0.9);
        const a = s.stage.D * (0.18 + 0.42 * far) * br, C = B.C, k = (q) => [p.red(q) / 255, p.green(q) / 255, p.blue(q) / 255];
        const cA = k(p.lerpColor(C.pink, C.gold, 0.3)), cB = k(p.lerpColor(C.pink, C.lav, 0.5));
        B.halo.set([c[0], c[1], c[2], Math.max(rf.scale * 2.0, d * 0.03)], 0); B.haloC.set([cA[0], cA[1], cA[2], a], 0);
        B.halo.set([c[0], c[1], c[2], Math.max(rf.scale * 3.4, d * 0.06)], 4); B.haloC.set([cB[0], cB[1], cB[2], a * 0.45], 4);
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD);
        sc.drawSprites(B.halo, B.haloC, vw, rf.t);
        p.blendMode(p.BLEND);
      }
      if (sc && s.living.sparks) { gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD); sc.drawSprites(s.living.sparkSpr, s.living.sparkSprC, vw, s.living.roof.t); }
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.BLEND);
    }
    if (trail && sc && trail.t > 0) { gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD); sc.drawSprites(trail.spr, trail.sprC, vw, trail.t); p.blendMode(p.BLEND); }
  }

  function reset() { for (const s of AG.Gardens.sites) if (s.living) release(s); L.built = null; trail = null; }

  return Object.assign(L, { init, update, drawCity, reset, release, look, startTrail, stopTrail, trailState: () => trail, built: null });
})();
