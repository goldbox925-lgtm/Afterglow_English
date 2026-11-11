/* =====================================================================
   Round 02 · Phase 4 — the living architecture (AG.Living)
   ---------------------------------------------------------------------
   The building's transformation, a CONSEQUENCE of the flower reaching
   100 %. It has no state of its own: every value that moves is read
   from AG.R2's data streams each frame (transform, stage A–E,
   sinceBloom, glow, particles; js/garden/round2.js).

   What it builds (once, deterministically per city, when the
   transformation starts: p.randomSeed(seed from the building)):
     ATRIUM   inside the Memory Garden: the doorway building's own
              footprint (enlarged so the garden fits), four inner walls
              and a floor (AG.SHADERS.livingWall), light vines grown on
              those walls (AG.Vines → AG.SHADERS.livingVine), golden light
              paths grown across the floor (the same vine program), and
              leaf nodes along the wall vines (drawn by the p5 light
              layer, js/garden/r2Layer.js)
     FACADE   outside in the city: the same wall program on the
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
     C growth      pink / cyan / lavender vines climb the walls
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
    // ---- ATRIUM (garden coordinates: the flower at the origin) ----
    const k = Math.max(1, 24 / (Math.min(sh.w, sh.d) / 2));               // enlarged so the garden fits (≥ 24 m to each wall)
    const hx = sh.w / 2 * k, hz = sh.d / 2 * k;
    const H = U.clamp((sh.y1 - sh.y0) * k, 42, 90);
    const grid = [6.0, 4.4];
    const GW = new AG.GeometryBuilder('atriumWalls'), walls = [], sets = [];
    for (const n of NORMALS) {
      const hn = n[0] ? hx : hz, ht = n[0] ? hz : hx, t = [-n[2], 0, n[0]];
      const O = V3.sub(V3.scale(n, hn), V3.scale(t, ht)), inward = V3.scale(n, -1);
      GW.data = [0, 0, 0, 0];
      GW.quad(O, V3.add(O, V3.scale(t, 2 * ht)), V3.add(V3.add(O, V3.scale(t, 2 * ht)), [0, H, 0]), V3.add(O, [0, H, 0]), inward, [0, 0, 2 * ht, H]);
      const surf = AG.Vines.plane(O, t, [0, 1, 0], inward, 0.15);
      const roots = [];
      const nr = Math.round(2 * ht / 7);
      for (let i = 0; i < nr; i++) roots.push([p.map(i + p.random(0.2, 0.8), 0, nr, 2, 2 * ht - 2), 0.3, p.random(-0.35, 0.35), 1, p.random(0, 8)]);
      const branches = AG.Vines.grow(p, { roots, step: 0.9, steps: Math.round(H / 0.9 * 1.25), turn: 0.32, freq: 0.07, nz: nz + walls.length * 11, bias: [0, 1], biasK: 0.07, branchP: 0.05, maxDepth: 2, maxBranches: 40, u0: 0.3, u1: 2 * ht - 0.3, v0: 0, v1: H - 0.5 });
      sets.push({ surf, branches });
      walls.push({ O, t, n: inward, w: 2 * ht });
    }
    GW.data = [1, 0, 0, 0];
    GW.quad([-hx, 0.01, hz], [hx, 0.01, hz], [hx, 0.01, -hz], [-hx, 0.01, -hz], [0, 1, 0], [0, 0, 2 * hx, 2 * hz]);
    const sMaxA = AG.Vines.maxS(sets);
    const GV = new AG.GeometryBuilder('atriumVines');
    AG.Vines.ribbons(GV, sets, sMaxA, 0.16);
    // leaves along the vines: 40 of them. Each is p5 immediate-mode drawing every frame, and in
    // WEBGL mode every beginShape / endShape rebuilds its stroke geometry on the CPU, so the p5 layer
    // keeps few, meaningful shapes; the dense growth itself is the WebGL vine mesh.
    const allLeaves = AG.Vines.nodes(p, sets, sMaxA, 7), leaves = [];
    for (let i = 0; i < allLeaves.length; i += Math.max(1, allLeaves.length / 40)) leaves.push(allLeaves[Math.floor(i)]);
    // golden light paths across the floor, from the flower outward (stage A; drawn by the p5 layer)
    const floorSurf = AG.Vines.plane([0, 0.03, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], 0);
    const froots = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * p.TWO_PI + p.random(-0.15, 0.15); froots.push([p.cos(a) * 1.4, p.sin(a) * 1.4, p.cos(a), p.sin(a), p.random(0, 1.5)]); }
    const floorBr = AG.Vines.grow(p, { roots: froots, step: 0.8, steps: 30, turn: 0.45, freq: 0.12, nz: nz + 77, bias: null, branchP: 0.05, maxDepth: 1, maxBranches: 30, u0: -hx + 1, u1: hx - 1, v0: -hz + 1, v1: hz - 1 });
    // (rendered as a WebGL ribbon mesh, like the vines: drawn as p5 bezier strokes they cost ~11 ms
    // of CPU per frame, because p5's WEBGL mode rebuilds stroke geometry for every shape)
    const floorSets = [{ surf: floorSurf, branches: floorBr }];
    const GF = new AG.GeometryBuilder('atriumFloorLight');
    AG.Vines.ribbons(GF, floorSets, AG.Vines.maxS(floorSets), 0.06);

    // ---- FACADE (city coordinates): the shaft's four real faces ----
    const FW = new AG.GeometryBuilder('facadeWalls'), fsets = [];
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
      // on the doorway's face, vines also spring from both sides of the doorway
      if (n[0] === P.n[0] && n[2] === P.n[2]) {
        const ud = V3.dot(V3.sub(door, O), t), vd = door[1] - fy0;
        roots.push([ud - P.w / 2 - 0.5, vd - P.h / 2 + 1, -0.5, 1, 0], [ud + P.w / 2 + 0.5, vd - P.h / 2 + 1, 0.5, 1, 0], [ud, vd + P.h / 2 + 1, 0, 1, 0]);
      }
      const branches = AG.Vines.grow(p, { roots, step: 1.1, steps: Math.round(FH / 1.1 * 1.2), turn: 0.3, freq: 0.05, nz: nz + 300 + fsets.length * 13, bias: [0, 1], biasK: 0.07, branchP: 0.05, maxDepth: 2, maxBranches: 45, u0: 0.2, u1: 2 * ht - 0.2, v0: 0, v1: FH - 0.5 });
      fsets.push({ surf, branches });
    }
    const FV = new AG.GeometryBuilder('facadeVines');
    AG.Vines.ribbons(FV, fsets, AG.Vines.maxS(fsets), 0.7);             // (wide enough to read from the street)

    // ---- ROOFTOP: a giant BloomFlower, sized to the roof ----
    const topSh = b.shafts[b.shafts.length - 1];
    // it floats a few metres ABOVE the roof (from the street a flower lying on the roof would be
    // hidden by its edge), as wide as the roof is narrow (open radius ≈ 1.8 · scale)
    const scale = 0.9 * Math.min(topSh.w, topSh.d) / 1.8;
    const roofY = b.top - 6 + 6;
    const roof = AG.BloomFlower.create(p, { center: [b.cx, roofY, b.cz], scale });

    built = {
      seed, atrium: { walls: GW.build(p), vines: GV.build(p), floorLight: GF.build(p), hx, hz, H, grid, leaves, reach: Math.hypot(hx, hz, H) * 1.05 },
      facade: { walls: FW.build(p), vines: FV.build(p), H: FH, grid: [6.0, 4.4], origin: door.slice(), reach: Math.hypot(sx, sz) * 2 + FH },
      roof
    };
    L.built = built;
    AG.U.emit('livingBuilt', { seed });
  }

  /* ---------------- per frame ---------------- */
  function update(dt) {
    const R = AG.R2;
    if (R.transform <= 0) { if (built) reset(); return; }
    if (!built && AG.Garden.portal) build();
    if (!built) return;
    // the rooftop flower opens with stage D (its own easing: p.lerp in BloomFlower.update)
    const rf = built.roof, D = R.stage.D;
    rf.awake = D > 0.01; rf.target = D;
    const camPos = AG.Garden.drawsScene() ? [rf.center[0], rf.center[1] + 50, rf.center[2] + 80] : AG.Camera.state.pos;
    rf.update(dt, camPos);
  }

  /* the shared colours and breathing (p.lerpColor, p.sin) */
  function look() {
    const R = AG.R2, S = R.stage, t = R.sinceBloom;
    const rgb = (c) => [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255];
    return {
      A: rgb(p.lerpColor(C.pink, C.lav, 0.5 * S.E)), B: rgb(p.lerpColor(C.cyan, C.pink, 0.4 * S.D)), C: rgb(p.lerpColor(C.lav, C.gold, 0.45 * S.E)),
      gold: rgb(p.lerpColor(C.gold, C.pink, 0.25 * S.E)),
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

  function drawSet(set, vw, interior, fade) {
    const R = AG.R2, S = R.stage, sh = shaders(), lk = look();
    p.shader(sh.wall);
    sh.wall.setUniform('uView', vw.V); sh.wall.setUniform('uProj', vw.P); sh.wall.setUniform('uCamPos', vw.eye); sh.wall.setUniform('uTime', R.sinceBloom);
    sh.wall.setUniform('uStage', [S.A, S.B, S.C, S.D]); sh.wall.setUniform('uE', S.E); sh.wall.setUniform('uBreath', lk.breath);
    sh.wall.setUniform('uWin', R.windows); sh.wall.setUniform('uReach', set.reach); sh.wall.setUniform('uHeight', set.H);
    sh.wall.setUniform('uInterior', interior); sh.wall.setUniform('uOrigin', set.originNow); sh.wall.setUniform('uGrid', set.grid); sh.wall.setUniform('uFade', fade);
    set.walls.forEach((g) => p.model(g));
    // STAGE A inside: golden light paths across the atrium floor, from the flower outward
    if (set.floorLight && S.A > 0.001) drawVines(set.floorLight, vw, S.A * 1.05, [lk.gold, lk.A, lk.gold], lk);
    // STAGE C: the vines climbing the walls
    if (S.C > 0.001) drawVines(set.vines, vw, S.C * 1.02, [lk.A, lk.B, lk.C], lk);
  }

  /* inside the Memory Garden: the atrium, behind the flower (called by GardenScene after its backdrop) */
  function drawGarden(vw, flowerCenter) {
    if (!built || AG.R2.transform <= 0) return;
    const gl = p.drawingContext;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD);
    built.atrium.originNow = flowerCenter;
    drawSet(built.atrium, vw, 1, 1);
    p.blendMode(p.BLEND); gl.enable(gl.DEPTH_TEST);
  }

  /* outside in the city: the facade and the rooftop flower (called by the city renderer) */
  function drawCity(F) {
    if (!built || AG.R2.transform <= 0) return;
    const gl = p.drawingContext;
    gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.ADD);
    built.facade.originNow = built.facade.origin;
    drawSet(built.facade, { V: F.view, P: F.proj, eye: F.cam.pos }, 0, 1);
    p.blendMode(p.BLEND);
    if (AG.R2.stage.D > 0.001 && AG.Garden.scene) AG.Garden.scene.drawFlowerBody(built.roof, { V: F.view, P: F.proj, eye: F.cam.pos });
    gl.enable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.BLEND);
  }

  function reset() { built = null; L.built = null; }

  return Object.assign(L, { init, update, drawGarden, drawCity, reset, built: null });
})();
