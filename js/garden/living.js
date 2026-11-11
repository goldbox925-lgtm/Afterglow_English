/* =====================================================================
   Round 02 · Phase 4 — the living architecture (AG.Living)
   ---------------------------------------------------------------------
   The building's transformation, a CONSEQUENCE of the flower reaching
   100 %. It has no state of its own: every value that moves is read
   from AG.R2's data streams each frame (transform, stage A–E,
   sinceBloom, glow, particles; js/garden/round2.js).

   What it builds (once, deterministically per city, when the
   transformation starts: p.randomSeed(seed from the building)):
     (inside the Memory Garden the transformation plays on the glass
     atrium itself: js/garden/atrium.js reads the same stages)
     FACADE  outside in the city: the same wall program on the
              building's four REAL faces (its lowest shaft, from the
              city's own geometry), light vines grown on those faces from
              the ground and from the doorway's sides
     ROOFTOP  a giant iridescent flower on the roof: another
              AG.BloomFlower, drawn by the existing flower renderer
              (GardenScene.drawFlowerBody, the same shaders and the same
              p.rotate / p.scale petal transforms), opening with stage D
   Stages (AG.R2.stage, each 0..1, overlapping so nothing is abrupt):
     A awakening   golden light spreads from the flower through the atrium
     B energy      lines travel up the structure; windows begin to light
     C growth      pink / cyan / lavender vines climb the facade
     D rooftop     the giant flower opens on the roof; light from above
     E living      everything breathes (p.sin), the vines' light flows
   ===================================================================== */
window.AG = window.AG || {};

AG.Living = (function () {
  const U = AG.U, V3 = U.v3;
  let p = null, SH = null, built = null, C = null;
  const L = {};

  function init(inst) {
    p = inst;
    C = { pink: p.color(255, 120, 205), lav: p.color(165, 140, 255), cyan: p.color(110, 220, 255), gold: p.color(255, 196, 110) };
  }
  function shaders() {
    if (SH) return SH;
    SH = { wall: p.createShader(AG.SHADERS.livingWall.vert, AG.SHADERS.livingWall.frag), vine: p.createShader(AG.SHADERS.livingVine.vert, AG.SHADERS.livingVine.frag) };
    return SH;
  }
  const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

  /* ---------------- build (once per transformation) ---------------- */
  function build() {
    const P = AG.Garden.portal, sh = P.shaft || P.box.shafts[0], b = P.box;
    const seed = Math.floor(Math.abs(b.cx * 73.13 + b.cz * 19.71)) % 99991 + 7;
    p.randomSeed(seed);
    const nz = (seed % 997) * 0.731;

    // ---- FACADE (city coordinates): the doorway shaft's four REAL faces ----
    const FW = new AG.GeometryBuilder('facadeWalls'), fsets = [], faces = [];
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
    const FV = new AG.GeometryBuilder('facadeVines');
    // ribbons wide enough to read from the street, and a small luminous leaf every 4 steps
    AG.Vines.ribbons(FV, fsets, AG.Vines.maxS(fsets), 0.7, { leafEvery: 4, leafSize: 1.6, rand: () => p.random() });

    // ---- ROOFTOP: a giant BloomFlower growing FROM the roof of this same building ----
    // its base sits on the top shaft's real roof slab (city geometry: shaft.y1); it is sized to the
    // roof (open radius ≈ 1.8 · scale ≈ the roof's mean half-width), so it reads as the tower's crown
    const topSh = b.shafts[b.shafts.length - 1];
    const roofY = topSh.y1 + 0.1;
    const scale = 1.05 * (topSh.w + topSh.d) / 4 / 1.8;
    const roof = AG.BloomFlower.create(p, { center: [b.cx, roofY, b.cz], scale });

    // ---- particles rising up the facade into the rooftop flower (p5.Vector) ----
    const rise = [];
    for (let i = 0; i < 64; i++) rise.push({ pos: p.createVector(0, -1e4, 0), vel: p.createVector(0, 0, 0), life: 0, seed: p.random(100), size: p.random(0.5, 1.3), hue: p.random() });

    built = {
      seed, faces, rise,
      facade: { walls: FW.build(p), vines: FV.build(p), H: FH, grid: [6.0, 4.4], origin: door.slice(), reach: Math.hypot(sx, sz) * 2 + FH },
      roof, roofY, roofScale: scale,
      spr: new Float32Array(64 * 4), sprC: new Float32Array(64 * 4)
    };
    L.built = built;
    AG.U.emit('livingBuilt', { seed });
  }

  /* ---------------- per frame ---------------- */
  const tmpV = { v: null };
  function update(dt) {
    const R = AG.R2;
    if (R.transform <= 0) { if (built) reset(); return; }
    if (!built && AG.Garden.portal) build();
    if (!built) return;
    const S = R.stage, D = S.D, t = R.sinceBloom;
    // THE ROOFTOP FLOWER: it EMERGES from the roof (grows from a seed of light: its scale, the same
    // p.scale origin as every flower) through the first part of stage D, then OPENS; the bloom value
    // eases through BloomFlower's own p.lerp
    const rf = built.roof;
    const emerge = p.constrain(p.map(D, 0, 0.45, 0, 1), 0, 1);
    rf.extScale = p.lerp(0.12, 1, 1 - Math.pow(1 - emerge, 3));
    rf.awake = D > 0.01; rf.target = p.constrain(p.map(D, 0.35, 1, 0, 1), 0, 1);
    const camPos = AG.Garden.drawsScene() ? [rf.center[0], rf.center[1] + 50, rf.center[2] + 80] : AG.Camera.state.pos;
    rf.update(dt, camPos);
    // RISING PARTICLES: born on the facade (a random face, along its width, low down), they climb
    // with a p.noise sway and, near the top, bend into the flower's heart (p5.Vector steering)
    const rate = p.map(S.C + S.D, 0, 2, 0, 1) * (1 - 0.5 * S.E) + 0.3 * S.E;
    built.spr.fill(0); built.sprC.fill(0);
    const top = built.roofY, heart = rf.center;
    if (!tmpV.v) { tmpV.v = p.createVector(0, 0, 0); tmpV.h = p.createVector(0, 0, 0); }
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
      tmpV.h.set(heart[0], heart[1] + rf.scale * 0.6, heart[2]).sub(m.pos).setMag(9);
      tmpV.v.set(sway, 7, 0).lerp(tmpV.h, nearTop);
      m.vel.lerp(tmpV.v, 1 - Math.exp(-1.6 * dt));
      m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;
      if (m.pos.y > top + rf.scale * 0.9 || p.dist(m.pos.x, m.pos.z, heart[0], heart[2]) < 1.5 && m.pos.y > top) m.life = 0;
      const a = (0.5 + 0.5 * p.sin(t * 3 + m.seed)) * (m.life > 0 ? 1 : 0);
      const c = p.lerpColor(p.lerpColor(C.lav, C.pink, m.hue), C.gold, nearTop * 0.7);
      built.spr.set([m.pos.x, m.pos.y, m.pos.z, m.size], i * 4);
      built.sprC.set([p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255, a * 0.8], i * 4);
    }
  }

  /* the shared colours and breathing (p.lerpColor, p.sin) */
  function look() {
    const R = AG.R2, S = R.stage, t = R.sinceBloom, T = R.transform;
    const rgb = (c) => [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255];
    return {
      A: rgb(p.lerpColor(C.pink, C.lav, 0.5 * S.E)), B: rgb(p.lerpColor(C.cyan, C.pink, 0.4 * S.D)), C: rgb(p.lerpColor(C.lav, C.gold, 0.45 * S.E)),
      // the windows change colour as the building wakes: cool cyan → pink → warm gold
      winA: rgb(p.lerpColor(p.lerpColor(C.cyan, C.pink, p.constrain(p.map(T, 0.25, 0.6, 0, 1), 0, 1)), C.gold, p.constrain(p.map(T, 0.6, 1, 0, 0.8), 0, 1))),
      winB: rgb(p.lerpColor(C.lav, C.pink, p.constrain(p.map(T, 0.3, 0.9, 0, 1), 0, 1))),
      breath: 1 + 0.12 * S.E * p.sin(t * 0.9)
    };
  }

  /* the vine program for one ribbon mesh, revealed up to `grow` */
  function drawVines(geos, vw, grow, cols, lk) {
    const R = AG.R2, sh = shaders();
    p.shader(sh.vine);
    sh.vine.setUniform('uView', vw.V); sh.vine.setUniform('uProj', vw.P); sh.vine.setUniform('uCamPos', vw.eye); sh.vine.setUniform('uTime', R.sinceBloom);
    sh.vine.setUniform('uGrow', grow); sh.vine.setUniform('uBreath', lk.breath); sh.vine.setUniform('uE', R.stage.E); sh.vine.setUniform('uFade', 1);
    sh.vine.setUniform('uColA', cols[0]); sh.vine.setUniform('uColB', cols[1]); sh.vine.setUniform('uColC', cols[2]);
    geos.forEach((g) => p.model(g));
  }

  function drawSet(set, vw) {
    const R = AG.R2, S = R.stage, sh = shaders(), lk = look();
    p.shader(sh.wall);
    sh.wall.setUniform('uView', vw.V); sh.wall.setUniform('uProj', vw.P); sh.wall.setUniform('uCamPos', vw.eye); sh.wall.setUniform('uTime', R.sinceBloom);
    sh.wall.setUniform('uStage', [S.A, S.B, S.C, S.D]); sh.wall.setUniform('uE', S.E); sh.wall.setUniform('uBreath', lk.breath);
    sh.wall.setUniform('uWin', R.windows); sh.wall.setUniform('uReach', set.reach); sh.wall.setUniform('uHeight', set.H);
    sh.wall.setUniform('uInterior', 0); sh.wall.setUniform('uOrigin', set.origin); sh.wall.setUniform('uGrid', set.grid); sh.wall.setUniform('uFade', 1);
    sh.wall.setUniform('uWinA', lk.winA); sh.wall.setUniform('uWinB', lk.winB);
    set.walls.forEach((g) => p.model(g));
    // STAGE C: the vines climbing the facade, with their leaves
    if (S.C > 0.001) drawVines(set.vines, vw, S.C * 1.02, [lk.A, lk.B, lk.C], lk);
  }

  /* outside in the city: the facade, the rising particles and the rooftop flower (city renderer) */
  function drawCity(F) {
    if (!built || AG.R2.transform <= 0) return;
    const gl = p.drawingContext, vw = { V: F.view, P: F.proj, eye: F.cam.pos };
    gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD);
    drawSet(built.facade, vw);
    const sc = AG.Garden.scene;
    if (sc && (AG.R2.stage.C > 0.001 || AG.R2.stage.D > 0.001)) sc.drawSprites(built.spr, built.sprC, vw, built.roof.t);
    p.blendMode(p.BLEND);
    if (AG.R2.stage.D > 0.001 && sc) sc.drawFlowerBody(built.roof, vw);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.BLEND);
  }

  function reset() { built = null; L.built = null; }

  return Object.assign(L, { init, update, drawCity, reset, look, built: null });
})();
