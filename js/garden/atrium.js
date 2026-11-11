/* =====================================================================
   Round 02 · the Memory Garden's glass atrium (AG.Atrium)
   ---------------------------------------------------------------------
   Real 3D geometry round the flower, in the garden scene's coordinates
   (metres; the flower's base at the origin, the floor at y = −1). The
   garden's axes are the city's axes, and its origin sits in the doorway
   building (its centre, at the doorway's floor), so the city seen through
   the glass is the REAL Round 01 city round that tower.

   Built ONCE (AG.GeometryBuilder, a few large meshes, p.randomSeed for
   repeatable variation); per frame only uniforms change.
     · a curved glass hall: 36 facets, 7 bands up to 28 m; a ribbed glass
       dome up to 44 m with an oculus
     · metal: mullions, ring beams, dome ribs, the oculus ring; light
       strips on every third mullion, at the floor cove and the walkways
     · a stepped pearl platform (3 steps) under the flower, gold strips
     · two curved walkways (9 m, 17 m) with glowing rails
     · 8 luminous planters with crystal leaves and blossom spikes
     · hanging vines with wisteria-like blossoms, from the walkways and
       the dome's rim (paths shaped with p.noise, lengths p.random)
     · the city: every building round the tower (from the city's own
       collision boxes), the city floor far below
   Per frame (update): wind from p.noise; the architecture's light
   colour p.lerpColor(violet → pink-gold) by her closeness (p.map); 48
   pollen motes moved with p5.Vector (a noise flow, rising near the
   flower, drawn toward her as she comes close); a few petals drifting
   down (p5.Vector, drawn by the p5 layer with bezier shapes).
   ===================================================================== */
window.AG = window.AG || {};

AG.Atrium = {
  create(p, opts) {
    const U = AG.U, V3 = U.v3;
    const FL = -1, R = 24, WALL = 28, DOME = 44, NF = 36, ROWS = 7;
    const A = { R, FL, WALL, DOME, built: false, pollen: [], petals: [], spr: new Float32Array(64 * 4), sprC: new Float32Array(64 * 4) };
    let SH = null, geo = null;

    /* ---------- geometry helpers ---------- */
    function beam(B, a, b, w, h, data) {
      const d = V3.sub(b, a), L = V3.len(d), ay = V3.scale(d, 1 / L);
      const ref = Math.abs(ay[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const ax = V3.norm(V3.cross(ay, ref)), az = V3.cross(ax, ay);
      B.data = data;
      B.obox(V3.scale(V3.add(a, b), 0.5), [w / 2, L / 2, h / 2], ax, ay, az, {});
    }
    const ring = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const domeAt = (t, a, inset) => {                                   // t 0 (rim) … 1 (apex)
      const r = (R - inset) * Math.cos(t * Math.PI / 2 * 0.94), y = WALL + (DOME - WALL) * Math.sin(t * Math.PI / 2);
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    };

    function build(info) {
      p.randomSeed(opts.seed || 7);
      const S = new AG.GeometryBuilder('atriumSolid'), G = new AG.GeometryBuilder('atriumGlass');
      const F = new AG.GeometryBuilder('atriumFloor'), P = new AG.GeometryBuilder('gardenPlants'), C = new AG.GeometryBuilder('gardenCity');
      const metal = (strip) => [0, strip ? 1 : 0, p.random(), 0];
      const da = (Math.PI * 2) / NF, bandH = (WALL - FL) / ROWS;

      // ---- glass walls and their frame ----
      for (let i = 0; i < NF; i++) {
        const a0 = i * da, a1 = (i + 1) * da;
        for (let j = 0; j < ROWS; j++) {
          const y0 = FL + j * bandH, y1 = y0 + bandH;
          const n = V3.norm([-Math.cos((a0 + a1) / 2), 0, -Math.sin((a0 + a1) / 2)]);
          G.data = [0, 0, (i * 7 + j) * 0.137 % 1, 0];
          G.quad(ring(R, y0, a0), ring(R, y0, a1), ring(R, y1, a1), ring(R, y1, a0), n);
        }
        // the mullion at this facet edge; a light strip on its inner face on every third one
        beam(S, ring(R - 0.2, FL, a0), ring(R - 0.2, WALL, a0), 0.34, 0.5, metal(false));
        beam(S, ring(R - 0.5, FL + 0.2, a0), ring(R - 0.5, WALL - 0.2, a0), 0.06, 0.06, metal(true));
        // ring beams at every band edge, and the cove light at the floor
        for (let j = 0; j <= ROWS; j++) { const y = FL + j * bandH; beam(S, ring(R - 0.2, y, a0), ring(R - 0.2, y, a1), 0.22, 0.32, metal(false)); }
        beam(S, ring(R - 0.6, FL + 0.08, a0), ring(R - 0.6, FL + 0.08, a1), 0.08, 0.08, metal(true));
      }
      // ---- the dome: glass panes, 12 ribs, rings, the oculus ----
      const DR = 7;
      for (let i = 0; i < NF; i++) for (let k = 0; k < DR; k++) {
        const a0 = i * da, a1 = (i + 1) * da, t0 = k / DR, t1 = (k + 1) / DR;
        if (t1 > 0.93) continue;                                        // the oculus stays open
        const c = domeAt((t0 + t1) / 2, (a0 + a1) / 2, 0), n = V3.norm(V3.scale([c[0], c[1] - WALL + 8, c[2]], -1));
        G.data = [1, 0, (i * 5 + k) * 0.211 % 1, 0];
        G.quad(domeAt(t0, a0, 0), domeAt(t0, a1, 0), domeAt(t1, a1, 0), domeAt(t1, a0, 0), n);
      }
      for (let i = 0; i < NF; i += 3) for (let k = 0; k < DR; k++) {
        const a = i * da; if ((k + 1) / DR > 0.93) continue;
        beam(S, domeAt(k / DR, a, 0.25), domeAt((k + 1) / DR, a, 0.25), 0.3, 0.42, metal(i % 9 === 0));
      }
      for (const t of [2 / DR, 4 / DR, 6 / DR]) for (let i = 0; i < NF; i++) beam(S, domeAt(t, i * da, 0.25), domeAt(t, (i + 1) * da, 0.25), 0.18, 0.26, metal(t > 0.8));
      // ---- the stepped platform under the flower, gold strips at its edges ----
      const steps = [[9.0, FL, FL + 0.34], [7.5, FL + 0.34, FL + 0.67], [6.1, FL + 0.67, 0.0]];
      const NS = 64;
      for (const [r, y0, y1] of steps) {
        for (let i = 0; i < NS; i++) {
          const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2, n = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
          S.data = [1, 0, 0, 0];
          S.quad(ring(r, y0, a1), ring(r, y0, a0), ring(r, y1, a0), ring(r, y1, a1), n);                 // its side
          S.quad(ring(r, y1, a1), ring(r, y1, a0), ring(0, y1, a0), ring(0, y1, a1), [0, 1, 0]);           // its top
          beam(S, ring(r + 0.03, y1 - 0.02, a0), ring(r + 0.03, y1 - 0.02, a1), 0.05, 0.05, [1, 1, 0.5, 0]);
        }
      }
      // ---- two curved walkways (on the far side from the camera's start) ----
      const camAz = opts.camAz || 1.0;
      const walks = [[9, camAz + Math.PI - 1.9, camAz + Math.PI + 1.9], [17, camAz + Math.PI - 1.2, camAz + Math.PI + 1.5]];
      for (const [y, aS, aE] of walks) {
        const n = 40;
        for (let i = 0; i < n; i++) {
          const a0 = aS + (aE - aS) * i / n, a1 = aS + (aE - aS) * (i + 1) / n;
          S.data = [2, 0, 0, 0];
          S.quad(ring(17.5, y, a0), ring(R - 0.4, y, a0), ring(R - 0.4, y, a1), ring(17.5, y, a1), [0, 1, 0]);
          S.quad(ring(17.5, y - 0.5, a1), ring(R - 0.4, y - 0.5, a1), ring(R - 0.4, y - 0.5, a0), ring(17.5, y - 0.5, a0), [0, -1, 0]);
          const nn = [-Math.cos((a0 + a1) / 2), 0, -Math.sin((a0 + a1) / 2)];
          S.quad(ring(17.5, y - 0.5, a0), ring(17.5, y - 0.5, a1), ring(17.5, y, a1), ring(17.5, y, a0), nn);
          beam(S, ring(17.6, y + 1.05, a0), ring(17.6, y + 1.05, a1), 0.07, 0.07, [0, 1, 0.3, 0]);         // the glowing rail
          beam(S, ring(17.45, y - 0.52, a0), ring(17.45, y - 0.52, a1), 0.05, 0.05, [0, 1, 0.7, 0]);     // the light under its edge
          if (i % 4 === 0) beam(S, ring(17.6, y, a0), ring(17.6, y + 1.05, a0), 0.06, 0.06, metal(false));
        }
      }
      // ---- the floor (one disc) ----
      const NFL = 72;
      for (let i = 0; i < NFL; i++) {
        const a0 = (i / NFL) * Math.PI * 2, a1 = ((i + 1) / NFL) * Math.PI * 2;
        F.data = [0, 0, 0, 0];
        F.quad(ring(R, FL, a1), ring(R, FL, a0), ring(0.01, FL, a0), ring(0.01, FL, a1), [0, 1, 0]);
      }
      // ---- planters with crystal leaves and blossom spikes ----
      const planters = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2, pc = ring(15.2, FL, a);
        planters.push(pc);
        for (let i = 0; i < 24; i++) {
          const b0 = (i / 24) * Math.PI * 2, b1 = ((i + 1) / 24) * Math.PI * 2, n = [Math.cos((b0 + b1) / 2), 0, Math.sin((b0 + b1) / 2)];
          const at = (r, y, b) => V3.add(pc, [Math.cos(b) * r, y, Math.sin(b) * r]);
          S.data = [3, 0, 0, 0];
          S.quad(at(1.3, 0, b1), at(1.3, 0, b0), at(1.4, 0.95, b0), at(1.4, 0.95, b1), n);
          beam(S, at(1.42, 0.97, b0), at(1.42, 0.97, b1), 0.06, 0.06, [3, 1, 0.9, 0]);
        }
        for (let i = 0; i < 9; i++) {                                     // leaves: curved ribbons, base → tip
          const b = p.random(Math.PI * 2), len = p.random(2.0, 3.6), lean = p.random(0.35, 0.9), hue = p.random(0.1, 0.5);
          const dir = [Math.cos(b), 0, Math.sin(b)], side = [-Math.sin(b), 0, Math.cos(b)], base = V3.add(pc, [0, 0.9, 0]);
          let prev = null;
          for (let s = 0; s <= 8; s++) {
            const t = s / 8, w = 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08));
            const c = V3.add(base, V3.add(V3.scale(dir, lean * len * t * t), [0, len * t, 0]));
            const l = V3.add(c, V3.scale(side, -w)), r = V3.add(c, V3.scale(side, w));
            if (prev) { P.data = [2, t, b, hue]; P.quad(prev[0], prev[1], r, l, dir, [0, 0, 1, 1]); }
            prev = [l, r];
          }
        }
        for (let i = 0; i < 4; i++) {                                     // blossom spikes
          const b = p.random(Math.PI * 2), h0 = p.random(1.4, 2.2), base = V3.add(pc, [Math.cos(b) * 0.5, 0.9, Math.sin(b) * 0.5]);
          for (let s = 0; s < 7; s++) blossom(P, V3.add(base, [0, h0 * (0.4 + s / 10), 0]), 0.22 - s * 0.018, 2, 0.4 + s / 14, b, p.random(0.4, 1));
        }
      }
      // ---- hanging vines with blossoms: from the walkways' edges and the dome's rim ----
      let strands = 0;
      const hang = (top, len) => {
        const ph = p.random(), hue = p.random();
        const nz = p.random(100);
        let prev = top, prevAlong = 0;
        const segs = Math.max(6, Math.round(len / 0.6));
        for (let s = 1; s <= segs; s++) {
          const t = s / segs;
          const off = [(p.noise(nz, t * 2) - 0.5) * 0.8 * t, 0, (p.noise(nz + 7, t * 2) - 0.5) * 0.8 * t];
          const q = V3.add(V3.add(top, [0, -len * t, 0]), off);
          ribbon(P, prev, q, 0.05, [0, prevAlong, ph, hue], [0, t, ph, hue]);
          // wisteria: blossoms crowd the lower part, fuller toward the middle of the cluster
          if (t > 0.22) for (let k = 0; k < 3; k++) blossom(P, V3.add(q, [p.random(-0.28, 0.28), p.random(-0.25, 0.25), p.random(-0.28, 0.28)]), 0.24 + 0.36 * Math.sin(Math.PI * Math.min(1, (t - 0.15) * 1.15)), 1, t, ph, (hue + k * 0.12) % 1);
          prev = q; prevAlong = t;
        }
        strands++;
      };
      for (const [y, aS, aE] of walks) for (let a = aS; a < aE; a += 0.11) if (p.random() < 0.7) hang(ring(17.7, y - 0.55, a + p.random(-0.03, 0.03)), p.random(2.5, 6.5));
      for (let a = 0; a < Math.PI * 2; a += 0.065) if (p.random() < 0.85) hang(ring(R - 1.0 - p.random(0, 1.5), WALL - 0.4, a), p.random(5, 12));
      // ---- the city round the tower, from the city's own data ----
      const O = opts.origin;
      let nb = 0;
      for (const b of info.boxes || []) {
        if (b === opts.skipBox || b.hero) continue;
        const cx = (b.x0 + b.x1) / 2 - O[0], cz = (b.z0 + b.z1) / 2 - O[2];
        const nx = Math.max(Math.abs(cx) - (b.x1 - b.x0) / 2, 0), nzd = Math.max(Math.abs(cz) - (b.z1 - b.z0) / 2, 0);
        const near = Math.hypot(nx, nzd), far = Math.hypot(cx, cz);
        if (near < 60 || far > 1600) continue;                        // (the nearest towers would wall the glass in)
        const top = b.top - 6;
        if (!(top > 0)) continue;
        C.data = [((b.x0 * 13.1 + b.z0 * 7.7) % 1 + 1) % 1, 0, 0, 0];
        C.box(cx, -O[1], cz, b.x1 - b.x0 - 1.6, top, b.z1 - b.z0 - 1.6);
        nb++;
      }
      C.data = [0, 2, 0, 0];
      C.quad([-3000, -O[1], 3000], [3000, -O[1], 3000], [3000, -O[1], -3000], [-3000, -O[1], -3000], [0, 1, 0]);
      geo = { solid: S.build(p), glass: G.build(p), floor: F.build(p), plants: P.build(p), city: C.build(p) };
      A.stats = { strands, planters: planters.length, cityBuildings: nb, vertices: Object.fromEntries(Object.entries(geo).map(([k, g]) => [k, g.reduce((s, x) => s + x.vertices.length, 0)])) };
      A.planters = planters;
      A.cityFloorY = -O[1];
      // pollen motes and drifting petals (p5.Vector trajectories)
      A.pollen = []; for (let i = 0; i < 48; i++) A.pollen.push({ pos: p.createVector(p.random(-18, 18), p.random(0, 20), p.random(-18, 18)), vel: p.createVector(0, 0, 0), seed: p.random(100), size: p.random(0.06, 0.16) });
      A.petals = []; for (let i = 0; i < 14; i++) A.petals.push({ pos: p.createVector(p.random(-14, 14), p.random(2, 26), p.random(-14, 14)), vel: p.createVector(0, -p.random(0.3, 0.6), 0), spin: p.random(-1, 1), seed: p.random(100), size: p.random(0.18, 0.32), hue: p.random() });
      A.built = true;
    }

    /* a soft blossom: two crossed quads */
    function blossom(B, c, s, kind, along, ph, hue) {
      B.data = [kind, along, ph, hue];
      B.quad(V3.add(c, [-s, -s, 0]), V3.add(c, [s, -s, 0]), V3.add(c, [s, s, 0]), V3.add(c, [-s, s, 0]), [0, 0, 1], [0, 0, 1, 1]);
      B.quad(V3.add(c, [0, -s, -s]), V3.add(c, [0, -s, s]), V3.add(c, [0, s, s]), V3.add(c, [0, s, -s]), [1, 0, 0], [0, 0, 1, 1]);
    }
    /* a thin vine segment: two crossed ribbons; data per end (the "along" value moves with it) */
    function ribbon(B, a, b, w, da, db) {
      B._ensure(8);
      for (const side of [[w, 0, 0], [0, 0, w]]) {
        const v0 = B.rawVertex(V3.sub(a, side), [0, 0, 1], 0, 0, da), v1 = B.rawVertex(V3.add(a, side), [0, 0, 1], 1, 0, da);
        const v2 = B.rawVertex(V3.add(b, side), [0, 0, 1], 1, 1, db), v3 = B.rawVertex(V3.sub(b, side), [0, 0, 1], 0, 1, db);
        B.rawTri(v0, v1, v2); B.rawTri(v0, v2, v3);
      }
    }

    /* ---------- per frame: the streams → uniforms and the moving bits ---------- */
    const COL = { violet: p.color(140, 110, 255), pink: p.color(255, 120, 210), gold: p.color(255, 190, 110), cyan: p.color(120, 225, 255), lav: p.color(190, 160, 255) };
    const rgb = (c) => [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255];
    const tmp = p.createVector(0, 0, 0), herV = p.createVector(0, 0, 0), pull = p.createVector(0, 0, 0);   // reused: no per-frame allocation
    function update(dt, s) {
      // s: { t, her (array|null), prox, core, bloom }
      if (!A.built) return;
      const t = s.t, prox = s.prox || 0;
      // wind for the hanging plants: slow Perlin noise, never a loop
      A.wind = [(p.noise(t * 0.08, 1.7) - 0.5) * 0.9, (p.noise(t * 0.08, 9.3) - 0.5) * 0.9];
      // the architecture's light shifts from violet toward pink and gold as she comes close
      const k = p.constrain(p.map(prox, 0.2, 1, 0, 1), 0, 1);
      A.strip = rgb(p.lerpColor(p.lerpColor(COL.lav, COL.gold, 0.35), p.lerpColor(COL.pink, COL.gold, 0.6), k));
      A.inlay = rgb(p.lerpColor(COL.lav, COL.gold, k * 0.7));
      A.pool = p.lerp(A.pool || 6, p.map(prox, 0, 1, 6, 12), 1 - Math.exp(-2 * dt));
      // pollen: a noise flow field, rising over the flower, drawn toward her as she comes close
      const her = s.her;
      A.spr.fill(0); A.sprC.fill(0);
      for (let i = 0; i < A.pollen.length; i++) {
        const m = A.pollen[i], q = m.pos;
        const ang = p.noise(q.x * 0.05, q.z * 0.05, t * 0.05 + m.seed) * Math.PI * 4;
        tmp.set(p.cos(ang) * 0.35, 0.08 + (q.mag() < 8 ? 0.3 : 0), p.sin(ang) * 0.35);
        if (her && prox > 0.01) { herV.set(her[0], her[1], her[2]); pull.set(herV).sub(q); if (pull.mag() > 0.5) tmp.add(pull.setMag(1.2 * prox)); }
        m.vel.lerp(tmp, 1 - Math.exp(-1.5 * dt));
        const kk = dt * (1 + 1.5 * prox); q.x += m.vel.x * kk; q.y += m.vel.y * kk; q.z += m.vel.z * kk;
        if (q.y > 26 || Math.hypot(q.x, q.z) > R - 2) { q.set(p.random(-16, 16), p.random(-0.5, 2), p.random(-16, 16)); m.vel.set(0, 0, 0); }
        const tw = 0.6 + 0.4 * p.sin(t * 2 + m.seed);
        A.spr.set([q.x, q.y, q.z, m.size * (1 + 0.6 * prox)], i * 4);
        const c = rgb(p.lerpColor(COL.lav, COL.gold, (i % 5) / 5 * 0.6 + 0.3 * prox));
        A.sprC.set([c[0], c[1], c[2], 0.5 * tw * (0.6 + 0.6 * prox)], i * 4);
      }
      // petals drifting down: a slow fall, a noise breeze, a turning spin
      for (const pt of A.petals) {
        const b = p.noise(pt.seed, t * 0.1) - 0.5;
        pt.vel.x = p.lerp(pt.vel.x, b * 0.8, 1 - Math.exp(-dt)); pt.vel.z = p.lerp(pt.vel.z, (p.noise(pt.seed + 5, t * 0.1) - 0.5) * 0.8, 1 - Math.exp(-dt));
        pt.pos.x += pt.vel.x * dt; pt.pos.y += pt.vel.y * dt; pt.pos.z += pt.vel.z * dt;
        if (pt.pos.y < FL + 0.1) pt.pos.set(p.random(-14, 14), p.random(22, 27), p.random(-14, 14));
      }
    }

    /* ---------- drawing (the scene binds its framebuffer; vw = { V, P, eye }) ---------- */
    function shaders() {
      if (SH) return SH;
      const mk = (d) => p.createShader(d.vert, d.frag);
      SH = { solid: mk(AG.SHADERS.atriumSolid), glass: mk(AG.SHADERS.atriumGlass), floor: mk(AG.SHADERS.atriumFloor), city: mk(AG.SHADERS.cityBox), plant: mk(AG.SHADERS.gardenPlant) };
      return SH;
    }
    const HAZE = [0.11, 0.065, 0.19];
    function common(sh, vw, t) { sh.setUniform('uView', vw.V); sh.setUniform('uProj', vw.P); sh.setUniform('uCamPos', vw.eye); sh.setUniform('uTime', t); sh.setUniform('uHazeCol', HAZE); sh.setUniform('uHazeK', 0.006); }
    function drawCity(vw, t) {
      const sh = shaders(); p.shader(sh.city); common(sh.city, vw, t);
      sh.city.setUniform('uFogCol', [0.2, 0.11, 0.3]); sh.city.setUniform('uSkyLow', [0.42, 0.16, 0.42]); sh.city.setUniform('uFloorY', 0);
      geo.city.forEach((g) => p.model(g));
    }
    function drawSolid(vw, t, s) {
      const sh = shaders(); p.shader(sh.solid); common(sh.solid, vw, t);
      sh.solid.setUniform('uWarmPos', [0, 1.2, 0]); sh.solid.setUniform('uWarm', 0.8 + 0.6 * (s.core || 0) + 0.5 * (s.prox || 0));
      sh.solid.setUniform('uStripCol', A.strip); sh.solid.setUniform('uKeyCol', [0.75, 0.72, 1.0]); sh.solid.setUniform('uProx', s.prox || 0);
      geo.solid.forEach((g) => p.model(g));
    }
    function drawPlants(vw, t, s) {
      const sh = shaders(); p.shader(sh.plant); common(sh.plant, vw, t);
      sh.plant.setUniform('uWind', A.wind); sh.plant.setUniform('uHer', s.her || [0, -100, 0]); sh.plant.setUniform('uProx', s.prox || 0);
      sh.plant.setUniform('uColA', [1.0, 0.5, 0.85]); sh.plant.setUniform('uColB', [0.72, 0.55, 1.0]); sh.plant.setUniform('uColC', [0.5, 0.85, 1.0]);
      sh.plant.setUniform('uGlow', 1.7);
      geo.plants.forEach((g) => p.model(g));
    }
    function drawFloor(vw, t, s) {
      const sh = shaders(); p.shader(sh.floor); common(sh.floor, vw, t);
      sh.floor.setUniform('uProx', s.prox || 0); sh.floor.setUniform('uPool', A.pool || 6); sh.floor.setUniform('uRings', 0.55 + 0.6 * (s.prox || 0));
      sh.floor.setUniform('uInlayCol', A.inlay); sh.floor.setUniform('uPoolCol', [1.0, 0.62, 0.3]);
      geo.floor.forEach((g) => p.model(g));
    }
    function drawGlass(vw, t, s) {
      const sh = shaders(); p.shader(sh.glass); common(sh.glass, vw, t);
      sh.glass.setUniform('uTintA', [0.45, 0.75, 1.0]); sh.glass.setUniform('uTintB', [0.75, 0.6, 1.0]); sh.glass.setUniform('uProx', s.prox || 0);
      geo.glass.forEach((g) => p.model(g));
    }

    return Object.assign(A, { build, update, drawCity, drawSolid, drawPlants, drawFloor, drawGlass });
  }
};
