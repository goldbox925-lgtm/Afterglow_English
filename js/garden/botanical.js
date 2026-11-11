/* =====================================================================
   Round 02 · procedural plants of the Memory Garden (AG.Botanical)
   ---------------------------------------------------------------------
   Wisteria hanging from the atrium's real beams, and crystal-leaved
   planter plants. Grown ONCE, when the atrium is built, into one cached
   opaque mesh (AG.GeometryBuilder); every frame only uniforms change.

   p5.js does the growing:
     p.randomSeed (by the caller), p.random   each plant's variation
     p.noise                                  where plants clump along a
                                              beam, how paths curl, the
                                              colour along a cluster
     p.createVector, p5.Vector                paths: pos.add(dir),
                                              dir.lerp(down, k).setMag,
                                              frames with cross, normalize
     p.map, p.lerp, p.constrain               lengths, the clusters'
                                              taper, flower size, sway
     p.bezierPoint                            the leaves' outline
     p.sin, p.cos                             whorls of flowers, tubes

   Every vertex's data channel: (kind, sway, phase, hue).
     kind   0 stem · 1 leaf · 2 flower · 3 crystal leaf
     sway   0 at the beam, growing with the distance along the plant, so
            a plant stays attached and its tips move most (a whole plant
            shares one curve: stems, shoots and flowers stay joined)
     phase  one per plant
     hue    0 pink · 0.5 lavender · 1 cyan · 1.2 a golden highlight
   ===================================================================== */
window.AG = window.AG || {};

AG.Botanical = {
  /* params (per building): { floret, length, curl } scale the flowers' size, the clusters' length and how much the paths curl */
  create(p, B, params) {
    const PR = Object.assign({ floret: 1, length: 1, curl: 1 }, params || {});
    const TAU = Math.PI * 2, GOLDEN = 2.399963;
    let lod = 0;                                                       // 1: flowers seen only from afar have no wing petals
    const DOWN = p.createVector(0, -1, 0), UP = p.createVector(0, 1, 0), XAXIS = p.createVector(1, 0, 0);
    const stats = { plants: 0, racemes: 0, florets: 0, leaves: 0, crystalLeaves: 0 };
    const swayOf = (arc) => Math.pow(p.constrain(arc / 12, 0, 1.3), 1.4);

    /* a path grown from `start`: curled by p.noise, pulled toward `pull` */
    function path(start, dir0, len, o) {
      const n = Math.max(2, Math.round(len / o.step)), step = len / n, target = o.up ? UP : DOWN;
      const pos = start.copy(), dir = dir0.copy().setMag(step), pts = [pos.copy()];
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const curl = o.curl * PR.curl, cx = (p.noise(o.seed, t * 2.4) - 0.5) * curl * step * 2, cz = (p.noise(o.seed + 9, t * 2.4) - 0.5) * curl * step * 2;
        dir.add(cx, 0, cz);
        dir.lerp(target.x * step, target.y * step, target.z * step, o.pull).setMag(step);
        pos.add(dir);
        pts.push(pos.copy());
      }
      return pts;
    }

    /* a stem: a tapered three-sided tube along pts */
    function tube(pts, r0, r1, ph, swayAt) {
      const n = pts.length; let prev = null;
      B._ensure(n * 3);
      for (let i = 0; i < n; i++) {
        const T = pts[Math.min(i + 1, n - 1)].copy().sub(pts[Math.max(i - 1, 0)]).normalize();
        const S = T.cross(Math.abs(T.y) < 0.9 ? UP : XAXIS).normalize(), Q = T.cross(S);
        const f = i / (n - 1), r = p.lerp(r0, r1, f), d = [0, swayAt(f), ph, 0], ring = [];
        for (let k = 0; k < 3; k++) {
          const a = k * TAU / 3, c = p.cos(a), s = p.sin(a), N = [S.x * c + Q.x * s, S.y * c + Q.y * s, S.z * c + Q.z * s];
          ring.push(B.rawVertex([pts[i].x + N[0] * r, pts[i].y + N[1] * r, pts[i].z + N[2] * r], N, k / 2, f, d));
        }
        if (prev) for (let k = 0; k < 3; k++) {
          const k1 = (k + 1) % 3;
          B.rawTri(prev[k], prev[k1], ring[k1]); B.rawTri(prev[k], ring[k1], ring[k]);
        }
        prev = ring;
      }
    }

    /* a leaf folded along its midrib, its outline from a bezier curve; uv = (across, along) */
    function leaf(base, dir, lateral, len, width, droop, rows, kind, ph, hue, swayAt) {
      const D = dir.copy().normalize(), S = lateral.copy().normalize();
      let N = S.cross(D).normalize(); if (N.y < 0) N.mult(-1);
      let prev = null;
      B._ensure((rows + 1) * 3);
      for (let k = 0; k <= rows; k++) {
        const t = k / rows, w = width * p.bezierPoint(0, 1.25, 0.85, 0, t), d = [kind, swayAt(t), ph, hue];
        const cx = base.x + D.x * len * t, cy = base.y + D.y * len * t - droop * len * t * t, cz = base.z + D.z * len * t;
        const lift = w * 0.32, nl = [N.x + S.x * 0.45, N.y + S.y * 0.45, N.z + S.z * 0.45], nr = [N.x - S.x * 0.45, N.y - S.y * 0.45, N.z - S.z * 0.45];
        const row = [
          B.rawVertex([cx - S.x * w + N.x * lift, cy - S.y * w + N.y * lift, cz - S.z * w + N.z * lift], nl, 0, t, d),
          B.rawVertex([cx, cy, cz], [N.x, N.y, N.z], 0.5, t, d),
          B.rawVertex([cx + S.x * w + N.x * lift, cy + S.y * w + N.y * lift, cz + S.z * w + N.z * lift], nr, 1, t, d)
        ];
        if (prev) for (let j = 0; j < 2; j++) { B.rawTri(prev[j], prev[j + 1], row[j + 1]); B.rawTri(prev[j], row[j + 1], row[j]); }
        prev = row;
      }
    }

    /* one wisteria flower: a banner petal and two wings, facing `o`; uv.y runs from its throat out */
    function floret(c, o, s, ph, hue, sway) {
      const d = o.copy().add(0, -0.25, 0).normalize(), side = d.cross(UP).normalize(), up = side.cross(d).normalize();
      if (up.y < 0) up.mult(-1);
      const at = (ks, ku, kd) => [c.x + (side.x * ks + up.x * ku + d.x * kd) * s, c.y + (side.y * ks + up.y * ku + d.y * kd) * s, c.z + (side.z * ks + up.z * ku + d.z * kd) * s];
      const n = [d.x, d.y, d.z], data = [2, sway, ph, hue];
      B._ensure(10);
      const a = B.rawVertex(at(0, 0, 0), n, 0.5, 0, data), b = B.rawVertex(at(-0.62, 0.55, 0.12), n, 0, 0.6, data);
      const e = B.rawVertex(at(0, 1.15, 0.22), n, 0.5, 1, data), f = B.rawVertex(at(0.62, 0.55, 0.12), n, 1, 0.6, data);
      B.rawTri(a, b, e); B.rawTri(a, e, f);
      if (!lod) for (const sd of [-1, 1]) {
        const w0 = B.rawVertex(at(0, -0.05, 0.05), n, 0.5, 0, data), w1 = B.rawVertex(at(sd * 0.8, -0.05, 0.3), n, 0, 0.8, data), w2 = B.rawVertex(at(sd * 0.3, -0.8, 0.4), n, 1, 0.8, data);
        B.rawTri(w0, w1, w2);
      }
    }

    /* a flower cluster: dense and wide at its base, narrowing to buds at its tip */
    function raceme(start, len0, ph, hue0, arc0, up) {
      const len = len0 * PR.length, seed = p.random(1000), axis = path(start, up ? UP : DOWN, len, { step: 0.17, curl: 0.35, pull: 0.25, seed, up });
      const n = axis.length, sw = (f) => (up ? 0.02 : swayOf(arc0 + f * len));
      tube(axis, 0.014, 0.004, ph, sw);
      for (let s = 1; s < n; s++) {
        const t = s / (n - 1), taper = p.map(t, 0, 1, 1, 0.12) * (t < 0.14 ? p.map(t, 0, 0.14, 0.65, 1) : 1), whorl = t < 0.72 ? 3 : 1;
        for (let w = 0; w < whorl; w++) {
          const a = s * GOLDEN + w * TAU / whorl + p.random(-0.25, 0.25), o = p.createVector(p.cos(a), 0, p.sin(a));
          const c = axis[s].copy().add(o.x * 0.42 * taper, p.random(-0.03, 0.03), o.z * 0.42 * taper);
          const size = p.lerp(0.3, 0.09, Math.pow(t, 1.3)) * p.random(0.85, 1.15) * PR.floret;
          let hue = p.constrain(hue0 + (p.noise(seed, t * 2) - 0.5) * 0.6 + p.random(-0.06, 0.06), 0, 1);
          if (p.random() < 0.04) hue = 1.2;
          floret(c, o, size, ph, hue, sw(t));
          stats.florets++;
        }
      }
      stats.racemes++;
    }

    /* one hanging plant from a point on a beam: a thin curving stem, leaves along it, short side
       shoots each ending in a flower cluster, and a last cluster at its tip */
    function plant(anchor, len) {
      const seed = p.random(1000), ph = p.random(), hue0 = p.constrain(p.map(p.noise(seed * 0.1, 3.3), 0.32, 0.72, 0, 0.85), 0, 1);
      const step = 0.32, pts = path(anchor, DOWN, len, { step, curl: 0.9, pull: 0.16, seed });
      tube(pts, 0.04, 0.012, ph, (f) => swayOf(f * len));
      let side = 1, nextShoot = p.random(0.7, 1.3);
      for (let i = 1; i < pts.length - 1; i++) {
        const arc = i * step, T = pts[i + 1].copy().sub(pts[i]).normalize();
        if (i % 2 === 0) {
          const az = p.random(TAU), lat = p.createVector(-p.sin(az), 0, p.cos(az)), out = p.createVector(p.cos(az), 0, p.sin(az));
          leaf(pts[i], out.copy().mult(0.85).add(T.x * 0.3, T.y * 0.3 - 0.15, T.z * 0.3), lat, p.random(0.7, 1.25), p.random(0.14, 0.23), 0.3, 4, 1, ph, p.random(), () => swayOf(arc));
          stats.leaves++;
        }
        if (arc >= nextShoot) {
          nextShoot = arc + p.random(0.8, 1.5); side = -side;
          const az = p.random(TAU), out = p.createVector(p.cos(az), -0.3, p.sin(az)), sl = p.random(0.35, 0.8);
          const sh = path(pts[i], out, sl, { step: 0.14, curl: 0.5, pull: 0.3, seed: seed + i });
          tube(sh, 0.02, 0.009, ph, (f) => swayOf(arc + f * sl));
          for (let q = 1; q < sh.length - 1; q += 2) {
            const a2 = p.random(TAU);
            leaf(sh[q], p.createVector(p.cos(a2), -0.25, p.sin(a2)), p.createVector(-p.sin(a2), 0, p.cos(a2)), p.random(0.55, 0.95), p.random(0.11, 0.18), 0.3, 4, 1, ph, p.random(), () => swayOf(arc + sl * q / sh.length));
            stats.leaves++;
          }
          const k = p.map(arc / len, 0, 1, 0.75, 1);
          raceme(sh[sh.length - 1], p.random(1.4, 3.2) * k, ph, hue0, arc + sl, false);
        }
      }
      raceme(pts[pts.length - 1], p.random(1.8, 3.4), ph, hue0, len, false);
      stats.plants++;
    }

    /* a planter's plant: broad crystal leaves opening from the soil, two short upright clusters */
    function planter(soil) {
      const ph = p.random(), count = 8;
      for (let i = 0; i < count; i++) {
        const az = i * TAU / count + p.random(-0.25, 0.25), lean = p.random(0.5, 1.0), big = i % 2 === 0;
        const dir = p.createVector(p.cos(az) * lean, 1, p.sin(az) * lean), lat = p.createVector(-p.sin(az), 0, p.cos(az));
        const len = big ? p.random(2.1, 3.0) : p.random(1.2, 1.8), droop = p.random(0.15, 0.4);
        leaf(soil, dir, lat, len, big ? p.random(0.42, 0.56) : p.random(0.26, 0.36), droop, 8, 3, ph, p.random(), (t) => 0.06 * t * t);
        stats.crystalLeaves++;
      }
      for (let i = 0; i < 2; i++) {
        const az = p.random(TAU), start = soil.copy().add(p.cos(az) * 0.3, 0, p.sin(az) * 0.3);
        raceme(start, p.random(1.1, 1.7), ph, p.random(), 0, true);
      }
    }

    /* which mesh the next plants go into (the reflected ones or the rest), and at what detail */
    function use(b, far) { B = b; lod = far ? 1 : 0; }

    return { plant, planter, use, stats };
  }
};
