/* =====================================================================
   Round 02 · Phase 4 — procedural light vines (AG.Vines)
   ---------------------------------------------------------------------
   Vines are GROWN, not drawn by hand. A vine is a walker on a flat
   surface (a wall or a facade, in its own (u, v) metres):
     pos, dir           p.createVector — where it is, where it heads
     each step          dir.rotate(p.map(p.noise(u, v, seed), 0, 1, −turn, turn))
                        → irregular, natural wandering (Perlin noise,
                        smooth in space, so neighbouring vines share a
                        "grain"); then dir.lerp(bias, k).setMag(step):
                        a gentle pull upward (they climb)
                        pos.add(dir)
     branching          p.random() < branchP: a side shoot, dir rotated
                        by ±p.random(0.5, 0.9) rad, a shorter life
     limits             the walker stops at the surface's edge
                        (p.constrain is used for the growth order below)
   Every point records s = metres grown from its root (+ the root's own
   delay). s / sMax is the GROWTH ORDER: the shader reveals a vine up to
   the growth front, so it grows tip-first, branch after branch.
   p.randomSeed(seed) first, with a seed from the building, so the same
   city always grows the same vines. (p.noise is already seeded per city.)

   The surfaces are the building's real planes, so the vines follow its
   geometry: plane(O, U, V, N) maps (u, v) → world = O + U·u + V·v + N·off.
   ribbons() turns the paths into one mesh (AG.GeometryBuilder) that the
   WebGL renderer draws with AG.SHADERS.livingVine. With a leaf option,
   ribbons() also adds small leaves to that mesh: world-space quads on
   the same surface, based on a vine point and alternating sides of it,
   so they follow the facade and appear only once the vine reaches them.
   nodes() returns points along the paths.
   ===================================================================== */
window.AG = window.AG || {};

AG.Vines = (function () {
  const V3 = AG.U.v3;

  /* roots: [[u, v, du, dv, delay]] → branches [{ pts: [[u, v, s]], depth }] */
  function grow(p, o) {
    const out = [], queue = [];
    for (const r of o.roots) queue.push({ pos: p.createVector(r[0], r[1]), dir: p.createVector(r[2], r[3]).setMag(o.step), depth: 0, s: r[4] || 0, steps: o.steps });
    let guard = 0;
    while (queue.length && out.length < o.maxBranches && guard++ < 4000) {
      const w = queue.shift(), pts = [[w.pos.x, w.pos.y, w.s]];
      for (let i = 0; i < w.steps; i++) {
        const n = p.noise(w.pos.x * o.freq + o.nz, w.pos.y * o.freq, o.nz * 0.37);
        w.dir.rotate(p.map(n, 0, 1, -o.turn, o.turn));
        if (o.bias) { w.dir.lerp(o.bias[0] * o.step, o.bias[1] * o.step, 0, o.biasK); w.dir.setMag(o.step); }
        w.pos.add(w.dir); w.s += o.step;
        if (w.pos.x < o.u0 || w.pos.x > o.u1 || w.pos.y < o.v0 || w.pos.y > o.v1) break;
        pts.push([w.pos.x, w.pos.y, w.s]);
        if (w.depth < o.maxDepth && i > 2 && p.random() < o.branchP) {
          const side = p.random() < 0.5 ? -1 : 1;
          queue.push({ pos: w.pos.copy(), dir: w.dir.copy().rotate(side * p.random(0.5, 0.9)), depth: w.depth + 1, s: w.s, steps: Math.floor(w.steps * p.random(0.3, 0.55)) });
        }
      }
      if (pts.length > 2) out.push({ pts, depth: w.depth });
    }
    return out;
  }

  /* a flat surface: world point for (u, v) metres, offset `off` along its normal */
  function plane(O, U, V, N, off) {
    return { O, U, V, N, at: (u, v) => V3.add(V3.add(V3.add(O, V3.scale(U, u)), V3.scale(V, v)), V3.scale(N, off)) };
  }

  /* one leaf on the surface: its base on the vine point `a`, turned off the vine's direction to
     `side`; uv = (across, along), data = (the point's growth order, 2 = leaf, depth, hash).
     A leaf that would hang over the surface's edge (bounds [u0, u1, v0, v1]) is not added. */
  function leaf(B, surf, bounds, a, b, side, size, angle, s, dep, h) {
    let tu = b[0] - a[0], tv = b[1] - a[1];
    const l = Math.hypot(tu, tv) || 1; tu /= l; tv /= l;
    const c = Math.cos(side * angle), sn = Math.sin(side * angle);
    const du = tu * c - tv * sn, dv = tu * sn + tv * c, pu = -dv, pv = du, w = size * 0.36;
    const corners = [[a[0] - pu * w, a[1] - pv * w], [a[0] + pu * w, a[1] + pv * w],
      [a[0] + pu * w + du * size, a[1] + pv * w + dv * size], [a[0] - pu * w + du * size, a[1] - pv * w + dv * size]];
    if (bounds && corners.some((q) => q[0] < bounds[0] || q[0] > bounds[1] || q[1] < bounds[2] || q[1] > bounds[3])) return false;
    B._ensure(4);
    const d = [s, 2, dep, h], uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const v = corners.map((q, i) => B.rawVertex(surf.at(q[0], q[1]), surf.N, uvs[i][0], uvs[i][1], d));
    B.rawTri(v[0], v[1], v[2]); B.rawTri(v[0], v[2], v[3]);
    return true;
  }

  /* the paths as ribbons in one mesh; data = (s / sMax, across ±1, depth, hash).
     leaves (optional): { leafEvery: path steps between leaves, leafSize: metres, rand: () => 0..1,
     seeded by the caller so the same seed gives the same leaves } */
  function ribbons(B, sets, sMax, width, leaves) {
    for (const { surf, branches, bounds } of sets) {
      for (const br of branches) {
        const P = br.pts, w0 = width * (br.depth ? 0.55 : 1), h = (br.pts.length * 0.618 + br.depth * 0.31) % 1;
        for (let i = 0; i < P.length - 1; i++) {
          const a = P[i], b = P[i + 1];
          let su = -(b[1] - a[1]), sv = b[0] - a[0];
          const l = Math.hypot(su, sv) || 1; su /= l; sv /= l;
          const taper = (k) => w0 * (1 - 0.75 * k / P.length);
          const wa = taper(i), wb = taper(i + 1);
          const A0 = surf.at(a[0] - su * wa, a[1] - sv * wa), A1 = surf.at(a[0] + su * wa, a[1] + sv * wa);
          const B0 = surf.at(b[0] - su * wb, b[1] - sv * wb), B1 = surf.at(b[0] + su * wb, b[1] + sv * wb);
          const sa = Math.min(1, a[2] / sMax), sb = Math.min(1, b[2] / sMax), dep = Math.min(1, br.depth / 2);
          B._ensure(4);
          const v0 = B.rawVertex(A0, surf.N, 0, 0, [sa, -1, dep, h]), v1 = B.rawVertex(A1, surf.N, 1, 0, [sa, 1, dep, h]);
          const v2 = B.rawVertex(B1, surf.N, 1, 1, [sb, 1, dep, h]), v3 = B.rawVertex(B0, surf.N, 0, 1, [sb, -1, dep, h]);
          B.rawTri(v0, v1, v2); B.rawTri(v0, v2, v3);
        }
        if (leaves && leaves.leafEvery > 0) {
          const dep = Math.min(1, br.depth / 2);
          let side = 1;
          for (let i = leaves.leafEvery; i < P.length - 1; i += leaves.leafEvery) {
            const size = leaves.leafSize * (br.depth ? 0.8 : 1) * (0.8 + 0.4 * leaves.rand()), angle = 0.7 + 0.4 * leaves.rand(), hash = leaves.rand();
            leaf(B, surf, bounds, P[i], P[i + 1], side, size, angle, Math.min(1, P[i][2] / sMax), dep, hash);
            side = -side;                                                // alternate sides along the vine
          }
        }
      }
    }
  }

  /* points along the paths (every `every` steps) for the p5-drawn leaves: world pos, world
     tangent, growth order, side */
  function nodes(p, sets, sMax, every) {
    const out = [];
    for (const { surf, branches } of sets) for (const br of branches) {
      for (let i = 2; i < br.pts.length - 1; i += every) {
        const a = br.pts[i], b = br.pts[i + 1];
        out.push({ pos: surf.at(a[0], a[1]), dir: V3.sub(surf.at(b[0], b[1]), surf.at(a[0], a[1])), s: p.constrain(a[2] / sMax, 0, 1), side: (i / every) % 2 ? 1 : -1, size: p.random(0.7, 1.2) });
      }
    }
    return out;
  }

  function maxS(sets) { let m = 1; for (const s of sets) for (const br of s.branches) m = Math.max(m, br.pts[br.pts.length - 1][2]); return m; }

  return { grow, plane, ribbons, nodes, maxS };
})();
