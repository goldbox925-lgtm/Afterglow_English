/* =====================================================================
   CityGenerator — procedural megacity
   ---------------------------------------------------------------------
   One seed -> one city. The same artistic rules (palette, density,
   downtown cluster, damage) apply to every seed, so each regeneration
   is a different city with the same soul.

   Generative design with p5.js:
     p.randomSeed(seed) + p.random()   every controlled variation (heights,
                                       styles, signs, damage, details)
     p.noiseSeed(seed)  + p.noise()    coherent districts and height patches
                                       (see js/city/building.js)
     an ARRAY of Building objects      built with loops; each one decides its
                                       own height/style in its constructor and
                                       writes its geometry with render()
   Same seed → same sequence of random numbers → the same city, every time.

   Output meshes
     city      opaque architecture (city shader)            far pass
     hero      her building + rooftop (city shader)         near pass
     neon      signs, strips, holograms, beams (additive)   far pass
     heroNeon  the fallen sign + rooftop lights (additive)  near pass
     traffic   flying-car light streams (additive, animated in shader)

   Packed vertex data, CITY meshes  (vertexColor = r,g,b,a):
     r  building hash 0..1           (window patterns, power threshold)
     g  material id * 0.1            (see MAT)
     b  fragment id (0 = static)     (floating / reassembling pieces)
     a  distance from her / 1400     (light propagates outward from her)
   NEON meshes:
     r  hash   g  hue 0..1   b  type (see NEON)   a  distance / 1400
   ===================================================================== */
window.AG = window.AG || {};

AG.MAT = { GLASS: 0, RESID: 1, CONCRETE: 2, METAL: 3, ROOF_HERO: 4, GROUND: 5, PANEL: 6, GIRDER: 7, SIDEWALK: 8 };
AG.NEON = { SIGN: 0.0, HERO_A: 0.1, HERO_B: 0.15, STRIP: 0.3, HOLO: 0.5, BEAM: 0.7, SMALL: 0.85, BLINK: 0.95 };

AG.CityGenerator = (function () {
  const MAT = AG.MAT, NEON = AG.NEON;

  function generate(seed, p) {
    const cfg = AG.CONFIG.city;
    // p5.js: seed both generators once, so this seed always gives this city
    p.randomSeed(seed);
    p.noiseSeed(seed);
    p.noiseDetail(4, 0.5);
    // the generator's random helpers, all backed by p5's seeded p.random()
    const R = {
      next: () => p.random(),                                   // 0..1
      range: (lo, hi) => p.random(lo, hi),                      // lo..hi
      int: (lo, hi) => Math.floor(p.random(lo, hi + 1)),        // whole number lo..hi
      pick: (arr) => p.random(arr),                             // one element of an array
      chance: (q) => p.random() < q                             // true with probability q
    };
    const t0 = performance.now();

    const G = new AG.GeometryBuilder('city');
    const H = new AG.GeometryBuilder('hero');
    const N = new AG.GeometryBuilder('neon');
    const HN = new AG.GeometryBuilder('heroNeon');
    const T = new AG.GeometryBuilder('traffic');

    const atlas = AG.SignAtlas;
    const info = { towers: [], holos: [], beams: [], avenuesX: [], avenuesZ: [], highway: null, hero: null, stats: {}, boxes: [], buildings: [] };

    const DN = 1400;
    const distN = (x, z) => Math.min(1, Math.hypot(x, z) / DN);

    /* ---------------- grid layout (non-uniform: wider avenues) --------- */
    const n = cfg.blocks, BS = cfg.blockSize;
    const streetW = (k) => ((((k % cfg.avenueEvery) + cfg.avenueEvery) % cfg.avenueEvery) === 1 ? cfg.avenueWidth : cfg.street);
    const centers = { 0: 0 };
    for (let i = 1; i <= n; i++) centers[i] = centers[i - 1] + BS + streetW(i - 1);
    for (let i = -1; i >= -n; i--) centers[i] = centers[i + 1] - BS - streetW(i);
    const lines = []; // street centre-lines + widths (shared by x and z axes)
    for (let k = -n - 1; k <= n; k++) {
      const a = centers[k] !== undefined ? centers[k] + BS / 2 : centers[-n] - BS / 2 - streetW(k);
      const w = streetW(k);
      lines.push({ k, c: a + w / 2, w });
    }
    const extent = centers[n] + BS / 2 + 40;
    info.extent = extent;
    lines.forEach((L) => { if (L.w > cfg.street) { info.avenuesX.push(L.c); info.avenuesZ.push(L.c); } });

    /* ---------------- helpers ---------------- */
    let curHash = 0, curDist = 0;
    const setData = (B, mat, frag) => { B.data = [curHash, mat * 0.1 + 0.001, frag || 0, curDist]; };
    const neonData = (B, hash, hue, type, d) => { B.data = [hash, hue, type, d]; };

    // Face helper: returns frame for face f (0:+x,1:-x,2:+z,3:-z) of a box centred (x,z) size (w,d)
    function faceFrame(x, z, w, d, f) {
      switch (f) {
        case 0: return { o: [x + w / 2, 0, z], n: [1, 0, 0], t: [0, 0, -1], len: d };
        case 1: return { o: [x - w / 2, 0, z], n: [-1, 0, 0], t: [0, 0, 1], len: d };
        case 2: return { o: [x, 0, z + d / 2], n: [0, 0, 1], t: [1, 0, 0], len: w };
        default: return { o: [x, 0, z - d / 2], n: [0, 0, -1], t: [-1, 0, 0], len: w };
      }
    }
    // box attached to a face: along = offset along tangent, out = protrusion
    function faceBox(B, F, along, y0, wAlong, h, out, extra) {
      const cx = F.o[0] + F.t[0] * along + F.n[0] * (out / 2 - (extra || 0));
      const cz = F.o[2] + F.t[2] * along + F.n[2] * (out / 2 - (extra || 0));
      const wx = Math.abs(F.t[0]) * wAlong + Math.abs(F.n[0]) * out;
      const wz = Math.abs(F.t[2]) * wAlong + Math.abs(F.n[2]) * out;
      B.box(cx, y0, cz, wx, h, wz);
    }

    /* Neon sign = dark panel (opaque) + glowing atlas quad (additive). */
    function addSign(GB, NB, F, along, y0, opts) {
      const vert = opts.vertical;
      const words = vert ? atlas.vertical : atlas.horizontal;
      const text = opts.text || words[Math.floor(R.next() * words.length)];
      const e = atlas.get(text, vert);
      if (!e) return;
      const hue = opts.hue !== undefined ? opts.hue : R.next();
      const type = opts.type !== undefined ? opts.type : NEON.SIGN;
      const hsh = opts.hash !== undefined ? opts.hash : R.next();
      if (vert && opts.perpendicular) {
        // Blade sign sticking out from the facade (Tokyo-style), lit both sides
        const w = opts.w, h = opts.h;
        const out = 0.6 + w / 2;
        const cx = F.o[0] + F.t[0] * along + F.n[0] * out, cz = F.o[2] + F.t[2] * along + F.n[2] * out;
        setData(GB, MAT.PANEL);
        GB.box(cx, y0, cz, Math.abs(F.n[0]) * w + Math.abs(F.t[0]) * 0.35, h, Math.abs(F.n[2]) * w + Math.abs(F.t[2]) * 0.35);
        neonData(NB, hsh, hue, type, curDist);
        for (const s of [1, -1]) {
          const off = 0.2 * s;
          const px = cx + F.t[0] * off, pz = cz + F.t[2] * off;
          const nx = F.n[0] * w / 2, nz = F.n[2] * w / 2;
          const nn = [F.t[0] * s, 0, F.t[2] * s];
          const uv = s > 0 ? [e.u1, e.v1, e.u0, e.v0] : [e.u0, e.v1, e.u1, e.v0];
          NB.quad([px - nx, y0 + 0.3, pz - nz], [px + nx, y0 + 0.3, pz + nz], [px + nx, y0 + h - 0.3, pz + nz], [px - nx, y0 + h - 0.3, pz - nz], nn,
            [uv[0], uv[1], uv[2], uv[3]]);
        }
      } else {
        const w = opts.w, h = opts.h;
        const cx = F.o[0] + F.t[0] * along, cz = F.o[2] + F.t[2] * along;
        setData(GB, MAT.PANEL);
        faceBox(GB, F, along, y0, w + 0.6, h + 0.6, 0.35);
        neonData(NB, hsh, hue, type, curDist);
        const ox = cx + F.n[0] * 0.4, oz = cz + F.n[2] * 0.4;
        const tx = F.t[0] * w / 2, tz = F.t[2] * w / 2;
        NB.quad([ox - tx, y0 + 0.3, oz - tz], [ox + tx, y0 + 0.3, oz + tz], [ox + tx, y0 + 0.3 + h, oz + tz], [ox - tx, y0 + 0.3 + h, oz - tz], F.n,
          [e.u0, e.v1, e.u1, e.v0]);
      }
    }

    /* Thin glowing line between two points (outlines, edges). */
    function strip(NB, a, b, thick, hue, hsh) {
      neonData(NB, hsh, hue, NEON.STRIP, curDist);
      const V = AG.U.v3;
      const d = V.sub(b, a), L = V.len(d);
      if (L < 0.01) return;
      const ax = V.norm(d);
      let up = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const s1 = V.norm(V.cross(ax, up)), s2 = V.cross(s1, ax);
      const c = V.lerp(a, b, 0.5);
      NB.obox(c, [L / 2, thick, thick], ax, s2, s1);
    }
    function outlineRect(NB, x, y, z, w, d, hue, hsh) {
      const pts = [[x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]];
      for (let i = 0; i < 4; i++) strip(NB, pts[i], pts[(i + 1) % 4], 0.12, hue, hsh);
    }

    /* ---------------- building styles ---------------- */

    function facadeMat(style) { return style === 'hive' || style === 'industrial' ? MAT.RESID : MAT.GLASS; }

    // returns top info {top, w, d}
    function shaftBox(GB, x, y0, z, w, h, d, mat, lod) {
      setData(GB, mat);
      GB.box(x, y0, z, w, h, d);
      // floor bands
      if (lod >= 1) {
        const every = mat === MAT.GLASS ? R.pick([14.4, 18, 21.6]) : R.pick([9, 12]);
        const nb = Math.min(lod >= 2 ? 10 : 4, Math.floor(h / every));
        setData(GB, MAT.CONCRETE);
        for (let i = 1; i <= nb; i++) {
          const yy = y0 + i * every;
          if (yy > y0 + h - 2) break;
          GB.box(x, yy - 0.3, z, w + 0.5, 0.6, d + 0.5);
        }
      }
      // corner pilasters
      if (lod >= 1 && R.chance(0.6)) {
        setData(GB, R.chance(0.5) ? MAT.CONCRETE : MAT.METAL);
        const pw = Math.min(1.4, w * 0.06);
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
          GB.box(x + sx * (w / 2 - pw / 2 + 0.25), y0, z + sz * (d / 2 - pw / 2 + 0.25), pw, h + 0.4, pw);
      }
      return { top: y0 + h, w, d };
    }

    function fins(GB, x, y0, z, w, h, d, lod) {
      if (lod < 2) return;
      setData(GB, MAT.METAL);
      const sp = R.pick([4.8, 6, 7.2]);
      for (let f = 0; f < 4; f++) {
        const F = faceFrame(x, z, w, d, f);
        const cnt = Math.min(10, Math.floor(F.len / sp));
        for (let i = 1; i < cnt; i++) {
          const al = -F.len / 2 + i * (F.len / cnt);
          faceBox(GB, F, al, y0, 0.3, h, 0.9);
        }
      }
    }

    function crown(GB, NB, b, x, top, z, w, d, lod, damaged) {
      const kind = R.next();
      if (kind < 0.35) {
        // mechanical penthouse + antenna
        setData(GB, MAT.CONCRETE);
        const pw = w * R.range(0.45, 0.7), pd = d * R.range(0.45, 0.7), ph = R.range(4, 9);
        GB.box(x, top, z, pw, ph, pd);
        setData(GB, MAT.METAL);
        const ah = R.range(12, 45) * (b.h > 150 ? 1.4 : 1);
        GB.box(x + R.range(-pw / 4, pw / 4), top + ph, z + R.range(-pd / 4, pd / 4), 0.7, ah, 0.7);
        if (lod >= 1) {
          for (let i = 1; i < 4; i++) GB.box(x, top + ph + ah * i / 4.5, z, 3.5 - i * 0.7, 0.2, 0.2);
          neonData(NB, R.next(), 0.0, NEON.BLINK, curDist);
          NB.box(x, top + ph + ah, z, 1.0, 1.0, 1.0);
        }
      } else if (kind < 0.55 && b.h > 90) {
        // stepped spire
        let r = Math.min(w, d) * 0.32, y = top;
        setData(GB, MAT.GLASS);
        for (let i = 0; i < 4; i++) {
          const hh = R.range(6, 14);
          GB.prism(x, y, z, r, hh, 8, Math.PI / 8);
          y += hh; r *= 0.7;
        }
        setData(GB, MAT.METAL);
        GB.box(x, y, z, 0.6, R.range(20, 60), 0.6);
        if (lod >= 1) { neonData(NB, R.next(), R.next(), NEON.STRIP, curDist); outlineRect(NB, x, top + 0.4, z, w * 0.92, d * 0.92, R.next(), R.next()); }
      } else if (kind < 0.72) {
        // helipad ring
        setData(GB, MAT.CONCRETE);
        const r = Math.min(w, d) * 0.42;
        GB.prism(x, top, z, r, 1.2, 8, Math.PI / 8);
        if (lod >= 1) {
          const hue = R.pick([0, 0.5, 0.75]), hs = R.next();
          for (let i = 0; i < 8; i++) {
            const a0 = i / 8 * Math.PI * 2 + Math.PI / 8, a1 = (i + 1) / 8 * Math.PI * 2 + Math.PI / 8;
            strip(NB, [x + Math.cos(a0) * r * 0.97, top + 1.25, z + Math.sin(a0) * r * 0.97], [x + Math.cos(a1) * r * 0.97, top + 1.25, z + Math.sin(a1) * r * 0.97], 0.14, hue, hs);
          }
        }
      } else {
        // lattice crown frame + tanks
        setData(GB, MAT.METAL);
        const ch = R.range(6, 16);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) GB.box(x + sx * w * 0.42, top, z + sz * d * 0.42, 0.6, ch, 0.6);
        for (let k = 1; k <= 2; k++) {
          GB.box(x, top + ch * k / 2 - 0.3, z - d * 0.42, w * 0.84, 0.4, 0.4);
          GB.box(x, top + ch * k / 2 - 0.3, z + d * 0.42, w * 0.84, 0.4, 0.4);
          GB.box(x - w * 0.42, top + ch * k / 2 - 0.3, z, 0.4, 0.4, d * 0.84);
          GB.box(x + w * 0.42, top + ch * k / 2 - 0.3, z, 0.4, 0.4, d * 0.84);
        }
        if (lod >= 2) {
          for (let i = 0; i < 2; i++) {
            const tx = x + R.range(-w * 0.25, w * 0.25), tz = z + R.range(-d * 0.25, d * 0.25);
            GB.prism(tx, top + 1.2, tz, R.range(1.4, 2.4), R.range(2.5, 4), 8, 0);
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) GB.box(tx + sx, top, tz + sz, 0.2, 1.2, 0.2);
          }
        }
        if (lod >= 1 && R.chance(0.5)) outlineRect(NB, x, top + ch, z, w * 0.86, d * 0.86, R.next(), R.next());
      }
    }

    function hiveDetails(GB, NB, x, y0, z, w, h, d, lod) {
      if (lod < 1) return;
      const floorH = 3.0;
      const floors = Math.floor(h / floorH);
      const balcN = lod >= 2 ? 22 : 5, acN = lod >= 2 ? 16 : 4, bayN = lod >= 2 ? 4 : 2;
      for (let i = 0; i < balcN; i++) {
        const f = R.int(0, 3), F = faceFrame(x, z, w, d, f);
        const fl = R.int(2, Math.max(2, floors - 2));
        const al = R.range(-F.len / 2 + 2, F.len / 2 - 2);
        const bw = R.range(2.2, 4.2);
        setData(GB, MAT.CONCRETE);
        faceBox(GB, F, al, y0 + fl * floorH, bw, 0.25, 1.3);
        setData(GB, MAT.METAL);
        const rx = F.o[0] + F.t[0] * al + F.n[0] * 1.25, rz = F.o[2] + F.t[2] * al + F.n[2] * 1.25;
        GB.box(rx, y0 + fl * floorH + 0.25, rz, Math.abs(F.t[0]) * bw + 0.06, 1.0, Math.abs(F.t[2]) * bw + 0.06);
      }
      setData(GB, MAT.METAL);
      for (let i = 0; i < acN; i++) {
        const f = R.int(0, 3), F = faceFrame(x, z, w, d, f);
        const fl = R.int(1, Math.max(1, floors - 1));
        faceBox(GB, F, R.range(-F.len / 2 + 1, F.len / 2 - 1), y0 + fl * floorH + R.range(0.2, 1.6), 0.9, 0.65, 0.6);
      }
      setData(GB, MAT.RESID);
      for (let i = 0; i < bayN; i++) {
        const f = R.int(0, 3), F = faceFrame(x, z, w, d, f);
        const fl = R.int(1, Math.max(1, floors - 6));
        faceBox(GB, F, R.range(-F.len / 3, F.len / 3), y0 + fl * floorH, R.range(3, 7), R.range(6, 15), R.range(0.8, 1.8));
      }
      // pipes running up the facade
      if (lod >= 2) {
        setData(GB, MAT.METAL);
        for (let i = 0; i < 2; i++) {
          const F = faceFrame(x, z, w, d, R.int(0, 3));
          faceBox(GB, F, R.range(-F.len / 2 + 1, F.len / 2 - 1), y0, 0.35, h, 0.35);
        }
      }
    }

    function facadeSigns(GB, NB, b, x, y0, z, w, h, d, lod, damaged) {
      if (lod < 1) return;
      if (b.style !== 'hive' && b.style !== 'industrial') h = Math.max(20, h * 0.42);
      // prefer faces looking at her (origin)
      const faces = [0, 1, 2, 3].map((f) => {
        const F = faceFrame(x, z, w, d, f);
        const toHero = AG.U.v3.norm([-F.o[0], 0, -F.o[2]]);
        return { f, F, score: AG.U.v3.dot(F.n, toHero) + R.next() * 0.6 };
      }).sort((a, c) => c.score - a.score);
      const count = lod >= 2 ? R.int(1, 4) : R.int(0, 2);
      for (let i = 0; i < count; i++) {
        const { F } = faces[i % 2];
        const vert = R.chance(0.6);
        if (vert) {
          const sh = Math.min(h * 0.6, R.range(9, 24));
          const sw = sh / AG.SignAtlas.aspectV * R.range(0.9, 1.15);
          const al = R.chance(0.5) ? (F.len / 2 - 1.5) * (R.chance(0.5) ? 1 : -1) : R.range(-F.len / 3, F.len / 3);
          addSign(GB, NB, F, al, y0 + R.range(6, Math.max(7, h - sh - 4)), { vertical: true, perpendicular: R.chance(0.65), w: sw, h: sh });
        } else {
          const sw = Math.min(F.len * 0.8, R.range(8, 22));
          const sh = sw / AG.SignAtlas.aspectH;
          addSign(GB, NB, F, R.range(-F.len / 2 + sw / 2, F.len / 2 - sw / 2), y0 + R.range(8, Math.max(9, h - sh - 3)), { vertical: false, w: sw, h: sh });
        }
      }
    }

    /* The RESTORED TOP of a damaged tower: one plain volume from the fracture line up to the
       tower's original height, on the same footprint as its floating chunks (an octagonal prism
       for the octagonal towers). Fragment code −1: hidden while the city is broken, the city
       shader dissolves it in as the tower is rebuilt (same timing as its chunks), so the
       restored city shows whole towers instead of a sparse stack of chunks over a skeleton.
       It uses only the building's own data — no random numbers — so every seed's city (and
       everything generated after this tower) stays exactly the same.                      */
    function restoreTop(GB, b, x, cut, z, w, d, fullH, mat, octaR) {
      const lost = fullH - cut;
      if (lost < 1) return;
      setData(GB, mat, -1);
      if (octaR > 0) GB.prism(x, cut, z, octaR, lost, 8, Math.PI / 8);
      else GB.box(x, cut, z, w, lost, d);
    }

    /* Exposed skeleton + floating fragments above a fracture line. */
    function fracture(GB, NB, b, x, cut, z, w, d, fullH, mat, lod) {
      const lost = fullH - cut;
      // skeleton columns (jagged break) + the partial slabs below: the DEBRIS of the break
      // (fragment code −2: the city shader dissolves it away as the tower is restored)
      setData(GB, MAT.GIRDER, -2);
      const nx = Math.max(2, Math.round(w / 7)), nz = Math.max(2, Math.round(d / 7));
      const slopeA = R.range(0, Math.PI * 2);
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
        const edge = i === 0 || j === 0 || i === nx || j === nz;
        if (!edge && lod < 2) continue;
        if (R.chance(0.25)) continue;
        const px = x - w / 2 + (i / nx) * w, pz = z - d / 2 + (j / nz) * d;
        const s = 0.5 + 0.5 * Math.cos(slopeA) * ((i / nx) - 0.5) * 2 + 0.5 * Math.sin(slopeA) * ((j / nz) - 0.5);
        const ch = lost * AG.U.clamp(s, 0.05, 0.95) * R.range(0.35, 0.8);
        GB.box(px, cut, pz, 0.7, ch, 0.7);
      }
      // partial floor slabs
      const slabs = lod >= 2 ? 7 : 3;
      for (let i = 0; i < slabs; i++) {
        const yy = cut + R.range(2, lost * 0.45);
        const sw = w * R.range(0.25, 0.7), sd = d * R.range(0.25, 0.7);
        GB.box(x + R.range(-(w - sw) / 2, (w - sw) / 2), yy, z + R.range(-(d - sd) / 2, (d - sd) / 2), sw, 0.45, sd);
      }
      // fragments: the missing mass, broken into chunks that float in SILENCE
      const fx = 3, fz = 3, fy = Math.max(2, Math.min(5, Math.round(lost / 12)));
      const cw = w / fx, cd = d / fz, chh = lost / fy;
      const nFrag = lod >= 2 ? R.int(7, 13) : lod >= 1 ? R.int(4, 7) : 0;
      for (let k = 0; k < nFrag; k++) {
        const i = R.int(0, fx - 1), j = R.int(0, fz - 1), l = R.int(0, fy - 1);
        const id = 0.02 + R.next() * 0.97;
        setData(GB, R.chance(0.75) ? mat : MAT.CONCRETE, id);
        const sx = cw * R.range(0.55, 0.95), sy = chh * R.range(0.5, 0.95), sz = cd * R.range(0.55, 0.95);
        const cx = x - w / 2 + (i + 0.5) * cw, cz = z - d / 2 + (j + 0.5) * cd, cy = cut + (l + 0.5) * chh;
        GB.obox([cx, cy, cz], [sx / 2, sy / 2, sz / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], { skipBottom: false });
      }
      // a few broken girders that dangle out (debris too)
      if (lod >= 1) {
        setData(GB, MAT.GIRDER, -2);
        for (let i = 0; i < 3; i++) {
          const a = R.range(0, Math.PI * 2), L = R.range(6, 14);
          const px = x + R.range(-w / 3, w / 3), pz = z + R.range(-d / 3, d / 3), py = cut + R.range(2, lost * 0.4);
          const dir = AG.U.v3.norm([Math.cos(a), R.range(-0.6, 0.3), Math.sin(a)]);
          const side = AG.U.v3.norm(AG.U.v3.cross(dir, [0, 1, 0]));
          const up = AG.U.v3.cross(side, dir);
          GB.obox(AG.U.v3.add([px, py, pz], AG.U.v3.scale(dir, L / 2)), [L / 2, 0.25, 0.25], dir, up, side);
        }
      }
    }

    function building(b) {
      curHash = b.hash; curDist = distN(b.x, b.z);
      const lod = b.lod, mat = facadeMat(b.style);
      const fullH = b.h;
      const top = b.damaged ? fullH * R.range(0.5, 0.78) : fullH;
      let y = 0;
      let w = b.w, d = b.d;
      // podium
      if (fullH > 35 && b.style !== 'industrial') {
        const ph = R.range(6, 13);
        setData(G, MAT.CONCRETE);
        G.box(b.x, 0, b.z, w + 1.5, ph, d + 1.5);
        if (lod >= 1) {
          // shopfront strip
          const hue = R.next();
          outlineRect(N, b.x, ph - 0.6, b.z, w + 1.7, d + 1.7, hue, R.next());
          if (lod >= 2 && R.chance(0.7)) {
            const F = faceFrame(b.x, b.z, w + 1.5, d + 1.5, R.int(0, 3));
            const sw = Math.min(F.len * 0.7, 12);
            addSign(G, N, F, R.range(-F.len / 4, F.len / 4), 2.6, { vertical: false, w: sw, h: sw / AG.SignAtlas.aspectH });
          }
        }
        y = ph;
      }
      let style = b.style;
      let octaR = 0;                                            // the top octagon's radius (restored top)
      if (style === 'octa') {
        let r = Math.min(w, d) * 0.5, segs = R.int(2, 3), yy = y;
        const segH = (top - y) / segs;
        for (let s = 0; s < segs; s++) {
          setData(G, MAT.GLASS);
          G.prism(b.x, yy, b.z, r, segH, 8, Math.PI / 8);
          if (lod >= 1) {
            setData(G, MAT.CONCRETE);
            for (let k = 1; k <= Math.min(6, Math.floor(segH / 18)); k++) G.prism(b.x, yy + k * 18 - 0.3, b.z, r + 0.4, 0.6, 8, Math.PI / 8);
            setData(G, MAT.METAL);
            if (lod >= 2) for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              G.box(b.x + Math.cos(a) * (r + 0.2), yy, b.z + Math.sin(a) * (r + 0.2), 0.5, segH, 0.5);
            }
          }
          octaR = r;
          yy += segH; r *= R.range(0.78, 0.9);
        }
        w = d = r * 1.6;
        if (!b.damaged) crown(G, N, b, b.x, yy, b.z, w, d, lod);
        y = yy;
      } else if (style === 'slab') {
        // terraced arcology slab
        const steps = R.int(3, 5);
        const dir = R.chance(0.5) ? 1 : -1;
        let yy = y, dd = d;
        for (let s = 0; s < steps; s++) {
          const sh = (top - y) / steps;
          const zc = b.z + dir * (d - dd) / 2;
          shaftBox(G, b.x, yy, zc, w, sh, dd, s % 2 ? MAT.RESID : MAT.GLASS, lod);
          if (lod >= 1) {
            const hue = R.next();
            strip(N, [b.x - w / 2, yy + sh + 0.3, zc - dir * dd / 2], [b.x + w / 2, yy + sh + 0.3, zc - dir * dd / 2], 0.12, hue, R.next());
          }
          yy += sh; dd *= 0.72;
        }
        if (!b.damaged) crown(G, N, b, b.x, yy, b.z + dir * (d - dd / 0.72) / 2, w, dd / 0.72, lod);
        y = yy;
      } else {
        // corporate / hive / industrial: stacked setbacks
        const segs = style === 'corporate' ? R.int(1, 3) : 1;
        let yy = y;
        // the lowest shaft's real facade (used to put interactive lights exactly on a wall)
        b.shaft = { y0: y, y1: y + (top - y) / segs, w, d };
        b.shafts = [];
        for (let s = 0; s < segs; s++) {
          const sh = (top - y) / segs;
          b.shafts.push({ y0: yy, y1: yy + sh, w, d });   // every facade segment (no RNG use: the city is unchanged)
          shaftBox(G, b.x, yy, b.z, w, sh, d, mat, lod);
          if (style === 'corporate' && R.chance(0.45)) fins(G, b.x, yy, b.z, w, sh, d, lod);
          if (style === 'hive') hiveDetails(G, N, b.x, yy, b.z, w, sh, d, lod);
          if (style === 'corporate' && lod >= 1 && s < segs - 1 && R.chance(0.6)) outlineRect(N, b.x, yy + sh + 0.2, b.z, w + 0.6, d + 0.6, R.next(), R.next());
          yy += sh;
          if (s < segs - 1) { w *= R.range(0.7, 0.86); d *= R.range(0.7, 0.86); }
        }
        if (style === 'industrial' && lod >= 1) {
          setData(G, MAT.METAL);
          for (let i = 0; i < 4; i++) G.box(b.x + R.range(-w / 3, w / 3), yy, b.z, w * R.range(0.4, 0.8) * (i % 2), 0.6, 0.6 + d * R.range(0.3, 0.7) * ((i + 1) % 2));
          G.prism(b.x + w * 0.3, yy, b.z - d * 0.3, R.range(1.2, 2.2), R.range(10, 30), 8, 0);
        }
        if (!b.damaged) crown(G, N, b, b.x, yy, b.z, w, d, lod);
        y = yy;
      }
      facadeSigns(G, N, b, b.x, 0, b.z, b.w, top, b.d, lod, b.damaged);
      if (b.damaged) {
        fracture(G, N, b, b.x, top, b.z, w, d, fullH, style === 'hive' ? MAT.RESID : MAT.GLASS, lod);
        restoreTop(G, b, b.x, top, b.z, w, d, fullH, style === 'hive' ? MAT.RESID : MAT.GLASS, octaR);
      }
      return { top: y, w, d };
    }

    /* ---------------- lots & buildings ---------------- */
    const lots = [];
    const dt = cfg.downtown;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const bx = centers[i], bz = centers[j];
      if (i === 0 && j === 0) continue; // her block
      const dHero = Math.hypot(bx, bz);
      const far = dHero > 620;
      const split = far ? R.pick([1, 1, 2]) : R.pick([1, 2, 2, 3, 4]);
      const m = 3;
      const sub = [];
      if (split === 1) sub.push([bx, bz, BS - m * 2, BS - m * 2]);
      else if (split === 2) {
        if (R.chance(0.5)) { sub.push([bx - BS / 4, bz, BS / 2 - m * 2, BS - m * 2], [bx + BS / 4, bz, BS / 2 - m * 2, BS - m * 2]); }
        else { sub.push([bx, bz - BS / 4, BS - m * 2, BS / 2 - m * 2], [bx, bz + BS / 4, BS - m * 2, BS / 2 - m * 2]); }
      } else if (split === 3) {
        sub.push([bx - BS / 4, bz, BS / 2 - m * 2, BS - m * 2], [bx + BS / 4, bz - BS / 4, BS / 2 - m * 2, BS / 2 - m * 2], [bx + BS / 4, bz + BS / 4, BS / 2 - m * 2, BS / 2 - m * 2]);
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) sub.push([bx + sx * BS / 4, bz + sz * BS / 4, BS / 2 - m * 2, BS / 2 - m * 2]);
      }
      sub.forEach((s) => lots.push({ x: s[0], z: s[1], w: s[2] * R.range(0.82, 1), d: s[3] * R.range(0.82, 1), dHero, i, j }));
      // sidewalk / block base
      curHash = R.next(); curDist = distN(bx, bz);
      setData(G, MAT.SIDEWALK);
      G.box(bx, 0, bz, BS, 0.2, BS);
    }

    // an array of Building objects: each decides its own height, style and
    // district (p.random + p.noise) in its constructor ...
    const buildings = info.buildings;
    for (const L of lots) buildings.push(new AG.Building(L, p));
    // ... then a loop writes each one into the shared GPU meshes (render)
    // and registers its collision/interaction box (same format as before)
    for (const b of buildings) {
      b.render(building);
      info.boxes.push(b.toBox());
      if (b.h > 110) info.towers.push(b);
    }
    info.stats.districts = buildings.reduce((o, b) => { o[b.district] = (o[b.district] || 0) + 1; return o; }, {});

    /* ---------------- her flight route (Chapter 05) ----------------
       The avenue nearest config.city.flightAvenueX, reached along the street
       directly in front of her building. Skybridges never cross it.        */
    const avenueLines = lines.filter((L) => L.w > cfg.street);
    info.flightX = avenueLines.slice().sort((a, c) => Math.abs(a.c - cfg.flightAvenueX) - Math.abs(c.c - cfg.flightAvenueX))[0].c;
    info.frontStreetZ = lines.filter((L) => L.c < -BS / 2).sort((a, c) => c.c - a.c)[0].c;
    const crossesRoute = (A, B) => {
      for (let k = 0; k <= 24; k++) {
        const x = AG.U.lerp(A.x, B.x, k / 24), z = AG.U.lerp(A.z, B.z, k / 24);
        const onStreet = Math.abs(z - info.frontStreetZ) < 14 && x > Math.min(info.flightX, 0) - 24 && x < Math.max(info.flightX, 0) + 24;
        const onAvenue = Math.abs(x - info.flightX) < 20 && z < info.frontStreetZ + 10;
        if (onStreet || onAvenue) return true;
      }
      return false;
    };

    /* ---------------- skybridges ---------------- */
    const tall = info.towers;
    let bridges = 0;
    for (let a = 0; a < tall.length && bridges < 26; a++) for (let c = a + 1; c < tall.length && bridges < 26; c++) {
      const A = tall[a], B = tall[c];
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
      if (L < 30 || L > 95 || R.chance(0.45)) continue;
      if (crossesRoute(A, B)) continue;
      const yb = R.range(30, Math.min(A.top, B.top) * 0.75);
      curHash = R.next(); curDist = distN((A.x + B.x) / 2, (A.z + B.z) / 2);
      setData(G, MAT.GLASS);
      const ang = Math.atan2(dz, dx);
      G.boxY((A.x + B.x) / 2, yb, (A.z + B.z) / 2, L, 4.2, 6, -ang, { skipBottom: false });
      setData(G, MAT.CONCRETE);
      G.boxY((A.x + B.x) / 2, yb - 0.8, (A.z + B.z) / 2, L, 0.8, 7.2, -ang, { skipBottom: false });
      const ox = -Math.sin(ang) * 3.7, oz = Math.cos(ang) * 3.7;
      const hue = R.next(), hs = R.next();
      strip(N, [A.x + ox, yb - 0.9, A.z + oz], [B.x + ox, yb - 0.9, B.z + oz], 0.12, hue, hs);
      strip(N, [A.x - ox, yb - 0.9, A.z - oz], [B.x - ox, yb - 0.9, B.z - oz], 0.12, hue, hs);
      bridges++;
    }

    /* ---------------- elevated highway (in front of her) ---------------- */
    {
      const zLine = lines.filter((L) => L.w > cfg.street && L.c < -40).sort((a, c) => c.c - a.c)[0];
      if (zLine) {
        const zc = zLine.c, yd = 24, half = extent;
        curHash = 0.5; curDist = distN(0, zc);
        setData(G, MAT.CONCRETE);
        for (let x = -half; x < half; x += 120) {
          G.box(x + 60, yd, zc, 120, 1.6, 15, { skipBottom: false });
          curDist = distN(x, zc);
        }
        setData(G, MAT.METAL);
        for (let x = -half; x < half; x += 120) G.box(x + 60, yd + 1.6, zc + 7.2, 120, 1.0, 0.3), G.box(x + 60, yd + 1.6, zc - 7.2, 120, 1.0, 0.3);
        setData(G, MAT.CONCRETE);
        for (let x = -half + 20; x < half; x += 42) G.prism(x, 0, zc, 1.8, yd, 8, 0, { noTop: true });
        strip(N, [-half, yd + 0.2, zc + 7.6], [half, yd + 0.2, zc + 7.6], 0.15, 0.0, 0.31);
        strip(N, [-half, yd + 0.2, zc - 7.6], [half, yd + 0.2, zc - 7.6], 0.15, 0.5, 0.71);
        info.highway = { z: zc, y: yd + 1.6, half };
        info.boxes.push({ x0: -half, x1: half, z0: zc - 8, z1: zc + 8, top: yd + 2.8 });
      }
    }

    /* ---------------- holograms & searchlights ---------------- */
    {
      const cands = tall.filter((t) => t.top > 130 && Math.hypot(t.x, t.z) > 120).sort((a, c) => a.hash - c.hash);
      // the broken heart: the tallest intact-ish tower roughly ahead of her (-z)
      const ahead = tall.filter((t) => t.z < -250 && Math.abs(t.x / t.z) < 0.45).sort((a, c) => c.top - a.top)[0];
      const chosen = [];
      if (ahead) chosen.push({ t: ahead, design: 0 });
      cands.slice(0, 13).forEach((t, i) => { if (t !== ahead) chosen.push({ t, design: 1 + (i % 3) }); });
      chosen.forEach(({ t, design }) => {
        curDist = distN(t.x, t.z);
        const toH = AG.U.v3.norm([-t.x, 0, -t.z]);
        const side = [-toH[2], 0, toH[0]];
        const hh = design === 0 ? R.range(60, 80) : R.range(26, 52);
        const ww = design === 0 ? hh * 0.9 : hh * R.range(0.45, 0.8);
        const base = AG.U.v3.add([t.x, Math.min(t.top - hh - 5, t.top * R.range(0.35, 0.6)), t.z], AG.U.v3.scale(toH, Math.max(t.w, t.d) * 0.55 + 6));
        base[1] = Math.max(base[1], 40);
        neonData(N, R.next(), R.next(), NEON.HOLO, curDist);
        const c0 = AG.U.v3.sub(base, AG.U.v3.scale(side, ww / 2)), c1 = AG.U.v3.add(base, AG.U.v3.scale(side, ww / 2));
        N.quad(c0, c1, [c1[0], c1[1] + hh, c1[2]], [c0[0], c0[1] + hh, c0[2]], toH, [design + 0.001, 0, design + 0.999, 1]);
        // projector arm
        curHash = t.hash; setData(G, MAT.METAL);
        G.obox([base[0] - toH[0] * 3, base[1] - 1, base[2] - toH[2] * 3], [3.2, 0.6, 0.6], toH, [0, 1, 0], side);
        info.holos.push({ x: base[0], y: base[1] + hh / 2, z: base[2], design, w: ww, h: hh });
      });
      // searchlight beams
      tall.slice().sort((a, c) => c.top - a.top).slice(0, 7).forEach((t, i) => {
        curDist = distN(t.x, t.z);
        neonData(N, R.next(), i % 2 ? 0.5 : 0.25, NEON.BEAM, curDist);
        const dir = AG.U.v3.norm([R.range(-0.35, 0.35), 1, R.range(-0.35, 0.35)]);
        N.cone([t.x, t.top + 2, t.z], dir, R.range(500, 900), 1.2, R.range(30, 55), 12);
        info.beams.push({ x: t.x, y: t.top, z: t.z });
      });
    }

    /* ---------------- distant skyline ring ---------------- */
    for (let i = 0; i < cfg.skylineRing; i++) {
      const a = R.range(0, Math.PI * 2), r = R.range(extent + 80, extent + 1500);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const ahead = z < 0 ? 1.35 : 1;
      curHash = R.next(); curDist = distN(x, z);
      const h = (AG.U.lerp(60, 200, Math.pow(R.next(), 1.5)) + (R.chance(0.2) ? R.range(150, 380) : 0)) * ahead;
      setData(G, R.chance(0.6) ? MAT.GLASS : MAT.RESID);
      const w = R.range(30, 70), d = R.range(30, 70);
      if (R.chance(0.25)) G.prism(x, 0, z, w / 2, h, 8, Math.PI / 8); else G.box(x, 0, z, w, h, d);
      if (R.chance(0.3)) { setData(G, MAT.METAL); G.box(x, h, z, 0.8, R.range(15, 50), 0.8); }
    }

    /* ---------------- ground: streets ---------------- */
    {
      const half = extent + 1600;
      curHash = 0.5; curDist = 0;
      // continuous asphalt underlay
      setData(G, MAT.GROUND);
      G.data[2] = 0;
      G.quad([-half, -0.05, half], [half, -0.05, half], [half, -0.05, -half], [-half, -0.05, -half], [0, 1, 0], [-half, 0, half, 1]);
      // street quads with lane uv: u = metres along, v = 0..1 across.
      lines.forEach((L) => {
        curHash = AG.U.hash(L.k * 3.1);
        setData(G, MAT.GROUND);
        G.data[2] = L.w / 40; // encodes width for lane logic
        // along X (constant z)
        G.quad([-extent, 0.02, L.c + L.w / 2], [extent, 0.02, L.c + L.w / 2], [extent, 0.02, L.c - L.w / 2], [-extent, 0.02, L.c - L.w / 2], [0, 1, 0], [-extent, 0, extent, 1]);
      });
      lines.forEach((L) => {
        curHash = AG.U.hash(L.k * 7.7 + 1);
        setData(G, MAT.GROUND);
        G.data[2] = L.w / 40;
        // along Z, split between crossings so it does not overlap
        const xs = lines.map((q) => q.c).sort((a, c) => a - c);
        for (let s = 0; s < xs.length - 1; s++) {
          const z0 = xs[s] + lines[s].w / 2, z1 = xs[s + 1] - lines[s + 1].w / 2;
          if (z1 <= z0) continue;
          G.quad([L.c - L.w / 2, 0.02, z0], [L.c - L.w / 2, 0.02, z1], [L.c + L.w / 2, 0.02, z1], [L.c + L.w / 2, 0.02, z0], [0, 1, 0], [z0, 0, z1, 1]);
        }
      });
    }

    /* ---------------- flying traffic lanes ---------------- */
    {
      let cars = 0;
      const lanesX = info.avenuesZ.filter(() => true);
      const addLane = (a, b, count) => {
        const dir = AG.U.v3.sub(b, a);
        for (let c = 0; c < count; c++) {
          const phase = R.next(), speed = R.range(0.7, 1.4), col = R.chance(0.5) ? 0.0 : (R.chance(0.6) ? 0.5 : 1.0);
          const thr = R.next();
          T.data = [phase, speed, col, thr];
          T._ensure(4);
          const i0 = T.rawVertex(a, dir, -1, -1, T.data), i1 = T.rawVertex(a, dir, 1, -1, T.data),
                i2 = T.rawVertex(a, dir, 1, 1, T.data), i3 = T.rawVertex(a, dir, -1, 1, T.data);
          T.rawTri(i0, i1, i2); T.rawTri(i0, i2, i3);
          cars++;
        }
      };
      lanesX.forEach((c) => {
        for (const alt of [R.range(38, 60), R.range(80, 120), R.range(140, 190)]) {
          addLane([-extent, alt, c - 4], [extent, alt, c - 4], R.int(5, 10));
          addLane([extent, alt + 3, c + 4], [-extent, alt + 3, c + 4], R.int(5, 10));
          addLane([c - 4, alt + 6, -extent], [c - 4, alt + 6, extent], R.int(5, 10));
          addLane([c + 4, alt + 9, extent], [c + 4, alt + 9, -extent], R.int(5, 10));
        }
      });
      if (info.highway) {
        const hw = info.highway;
        for (let k = 0; k < 4; k++) addLane([k < 2 ? -hw.half : hw.half, hw.y + 0.9, hw.z + (k - 1.5) * 3], [k < 2 ? hw.half : -hw.half, hw.y + 0.9, hw.z + (k - 1.5) * 3], 18);
      }
      info.stats.cars = cars;
    }

    /* ---------------- HER building + rooftop ---------------- */
    const hero = buildHero(H, HN, R, cfg.heroHeight);
    info.boxes.push({ x0: -23.5, x1: 23.5, z0: -21.5, z1: 21.5, top: cfg.heroHeight + 1.4, hero: true });
    info.hero = hero;
    // her building shaft also casts into the far pass so it is visible in aerial shots
    curHash = 0.77; curDist = 0;

    const out = {
      city: G.build(p), hero: H.build(p), neon: N.build(p), heroNeon: HN.build(p), traffic: T.build(p), info
    };
    info.stats.vertices = { city: G.vertexCount, hero: H.vertexCount, neon: N.vertexCount, traffic: T.vertexCount };
    info.stats.buildings = lots.length;
    info.stats.ms = Math.round(performance.now() - t0);
    return out;

    /* ================================================================
       Her building: an older residential tower with a cluttered,
       rain-soaked rooftop. Everything here is modelled at human scale
       because the camera comes within a metre of it.
       ================================================================ */
    function buildHero(GB, NB, R, H0) {
      const W = 46, D = 42;
      curHash = 0.613; curDist = 0;
      // shaft (sides only; the roof is its own material)
      setData(GB, MAT.RESID);
      const h2 = H0;
      GB.quad([W / 2, 0, D / 2], [W / 2, 0, -D / 2], [W / 2, h2, -D / 2], [W / 2, h2, D / 2], [1, 0, 0]);
      GB.quad([-W / 2, 0, -D / 2], [-W / 2, 0, D / 2], [-W / 2, h2, D / 2], [-W / 2, h2, -D / 2], [-1, 0, 0]);
      GB.quad([-W / 2, 0, D / 2], [W / 2, 0, D / 2], [W / 2, h2, D / 2], [-W / 2, h2, D / 2], [0, 0, 1]);
      GB.quad([W / 2, 0, -D / 2], [-W / 2, 0, -D / 2], [-W / 2, h2, -D / 2], [W / 2, h2, -D / 2], [0, 0, -1]);
      setData(GB, MAT.CONCRETE);
      for (let y = 9; y < H0 - 2; y += 9) GB.box(0, y - 0.25, 0, W + 0.5, 0.5, D + 0.5);
      hiveDetails(GB, NB, 0, 0, 0, W, H0, D, 2);
      // roof slab
      setData(GB, MAT.ROOF_HERO);
      GB.quad([-W / 2, H0, D / 2], [W / 2, H0, D / 2], [W / 2, H0, -D / 2], [-W / 2, H0, -D / 2], [0, 1, 0], [-W / 2, D / 2, W / 2, -D / 2]);

      // parapet with a broken gap in front of her
      const ph = 1.15, pt = 0.35;
      const gap = [-3.5, 4.5]; // x-range missing on the front (-z) edge
      setData(GB, MAT.CONCRETE);
      GB.box(0, H0, D / 2 - pt / 2, W, ph, pt);
      GB.box(W / 2 - pt / 2, H0, 0, pt, ph, D);
      GB.box(-W / 2 + pt / 2, H0, 0, pt, ph, D);
      const fl = (gap[0] + W / 2), fr = (W / 2 - gap[1]);
      GB.box(-W / 2 + fl / 2, H0, -D / 2 + pt / 2, fl, ph, pt);
      GB.box(W / 2 - fr / 2, H0, -D / 2 + pt / 2, fr, ph, pt);
      // jagged stubs at the gap
      GB.box(gap[0] + 0.35, H0, -D / 2 + pt / 2, 0.7, ph * 0.6, pt);
      GB.box(gap[1] - 0.25, H0, -D / 2 + pt / 2, 0.5, ph * 0.35, pt);
      // coping
      setData(GB, MAT.METAL);
      GB.box(0, H0 + ph, D / 2 - pt / 2, W + 0.2, 0.08, pt + 0.12);
      GB.box(-W / 2 + fl / 2, H0 + ph, -D / 2 + pt / 2, fl, 0.08, pt + 0.12);
      GB.box(W / 2 - fr / 2, H0 + ph, -D / 2 + pt / 2, fr, 0.08, pt + 0.12);
      // the missing parapet pieces float just beyond the edge (fragments). They are also the
      // six word screens of stages 04–05 (js/fx/screenWords.js): their boxes are recorded here,
      // unchanged (same random calls in the same order)
      const screens = [];
      for (let i = 0; i < 6; i++) {
        const id = 0.03 + i * 0.05;
        setData(GB, MAT.CONCRETE, id);
        const x = AG.U.lerp(gap[0] + 0.8, gap[1] - 0.6, (i + 0.5) / 6);
        const c = [x, H0 + ph * 0.5, -D / 2 + pt / 2], h = [0.55 + R.range(-0.1, 0.15), ph * R.range(0.3, 0.5), pt / 2];
        GB.obox(c, h, [1, 0, 0], [0, 1, 0], [0, 0, 1], { skipBottom: false });
        screens.push({ c, h, frag: id });
      }
      // railing on the side parapets
      setData(GB, MAT.METAL);
      for (const sx of [-1, 1]) {
        for (let z = -D / 2 + 1; z < D / 2; z += 1.6) GB.box(sx * (W / 2 - pt / 2), H0 + ph, z, 0.06, 0.95, 0.06);
        GB.box(sx * (W / 2 - pt / 2), H0 + ph + 0.95, 0, 0.07, 0.07, D - 1);
        GB.box(sx * (W / 2 - pt / 2), H0 + ph + 0.5, 0, 0.05, 0.05, D - 1);
      }
      // stair hut
      setData(GB, MAT.CONCRETE);
      GB.box(13, H0, 13, 7, 3.4, 6, { skipBottom: true });
      GB.box(13, H0 + 3.4, 13, 7.6, 0.25, 6.6);
      setData(GB, MAT.PANEL);
      GB.box(13, H0, 9.98, 1.2, 2.3, 0.05);
      neonData(NB, 0.4, 1.0, NEON.SMALL, 0);
      NB.box(13, H0 + 2.45, 9.9, 0.5, 0.08, 0.08);
      // vent pipes on hut
      setData(GB, MAT.METAL);
      GB.prism(15.5, H0 + 3.65, 14.5, 0.25, 1.6, 8, 0);
      GB.prism(10.8, H0 + 3.65, 15, 0.18, 1.1, 8, 0);
      // HVAC units with fans
      [[-14, -6], [-14, -1.4], [-8.5, 9], [5, 15]].forEach(([x, z], i) => {
        setData(GB, MAT.METAL);
        GB.box(x, H0, z, 3.2, 1.5, 2.2);
        GB.box(x, H0 + 1.5, z, 3.0, 0.08, 2.0);
        GB.prism(x - 0.7, H0 + 1.58, z, 0.7, 0.12, 12, 0);
        GB.prism(x + 0.8, H0 + 1.58, z, 0.7, 0.12, 12, 0);
        for (let k = -1; k <= 1; k++) GB.box(x + 1.62, H0 + 0.2, z + k * 0.6, 0.05, 1.1, 0.4);
      });
      // water tank on legs + ladder
      setData(GB, MAT.METAL);
      const tx = -15, tz = 14;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) GB.box(tx + sx * 1.3, H0, tz + sz * 1.3, 0.18, 1.6, 0.18);
      GB.prism(tx, H0 + 1.6, tz, 2.1, 3.4, 12, 0);
      GB.prism(tx, H0 + 5.0, tz, 1.2, 0.6, 12, 0);
      for (let y = 0.3; y < 5; y += 0.4) GB.box(tx + 2.2, H0 + y, tz, 0.04, 0.04, 0.6);
      GB.box(tx + 2.2, H0, tz - 0.3, 0.05, 5.2, 0.05); GB.box(tx + 2.2, H0, tz + 0.3, 0.05, 5.2, 0.05);
      // antenna mast
      GB.box(19, H0, -17, 0.25, 14, 0.25);
      for (let k = 1; k < 5; k++) GB.box(19, H0 + k * 2.7, -17, 2.2 - k * 0.3, 0.06, 0.06);
      neonData(NB, 0.9, 0.0, NEON.BLINK, 0);
      NB.box(19, H0 + 14, -17, 0.3, 0.3, 0.3);
      // floor pipes on supports
      setData(GB, MAT.METAL);
      GB.box(-W / 2 + 1.2, H0 + 0.3, 2, 0.32, 0.32, D - 8);
      GB.box(-W / 2 + 1.8, H0 + 0.3, 2, 0.22, 0.22, D - 8);
      for (let z = -14; z < 17; z += 3) GB.box(-W / 2 + 1.5, H0, z, 1.2, 0.3, 0.12);
      GB.box(0, H0 + 0.25, 18.5, 30, 0.26, 0.26);
      // roof drains / curbs
      setData(GB, MAT.CONCRETE);
      GB.box(-6, H0, 3, 9, 0.18, 0.4);
      // debris near the broken parapet
      for (let i = 0; i < 26; i++) {
        setData(GB, MAT.CONCRETE);
        const s = R.range(0.06, 0.32);
        const x = R.range(gap[0] - 2, gap[1] + 2), z = R.range(-D / 2 + 0.6, -D / 2 + 5);
        const a = R.range(0, Math.PI);
        GB.obox([x, H0 + s * 0.4, z], [s, s * 0.6, s * 0.8], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)], { skipBottom: true });
      }

      // ---- her position: lying near the broken edge, facing the city ----
      const fig = { x: 1.0, y: H0, z: -15.2, yaw: Math.PI };

      // ---- the fallen sign: propped against nothing, lying where it fell ----
      // A plate lying face-up, one long edge propped on debris (tilt).
      const V = AG.U.v3;
      const sx = -2.4, sz = -13.2;
      const tilt = 0.42, ang = 0.3;
      const ax = [Math.cos(ang), 0, -Math.sin(ang)];          // long axis
      const sd = [Math.sin(ang), 0, Math.cos(ang)];           // horizontal short axis
      const inUp = V.norm(V.add(V.scale(sd, -Math.cos(tilt)), [0, Math.sin(tilt), 0]));
      const faceN = V.norm(V.cross(ax, inUp));
      const sw = 3.4, shh = 0.95;
      const cen = [sx, H0 + Math.sin(tilt) * shh / 2 + 0.1, sz];
      setData(GB, MAT.PANEL);
      GB.obox(cen, [sw / 2 + 0.12, shh / 2 + 0.1, 0.06], ax, inUp, faceN, { skipBottom: false });
      setData(GB, MAT.CONCRETE);
      GB.obox(V.add(cen, V.add(V.scale(inUp, shh / 2 + 0.05), [0, -Math.sin(tilt) * shh / 2 - 0.05, 0])), [1.2, 0.18, 0.25], ax, [0, 1, 0], sd);
      const corner = (u, v) => V.add(V.add(V.add(cen, V.scale(faceN, 0.07)), V.scale(ax, u * sw / 2)), V.scale(inUp, v * shh / 2));
      const eA = AG.SignAtlas.get('LOVE', false), eB = AG.SignAtlas.get('STILL HERE', false);
      neonData(NB, 0.11, 0.5, NEON.HERO_A, 0);
      NB.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), faceN, [eA.u0, eA.v1, eA.u1, eA.v0]);
      neonData(NB, 0.12, 1.0, NEON.HERO_B, 0);
      const c2 = (u, v) => AG.U.v3.add(corner(u, v), AG.U.v3.scale(faceN, 0.004));
      NB.quad(c2(-1, -1), c2(1, -1), c2(1, 1), c2(-1, 1), faceN, [eB.u0, eB.v1, eB.u1, eB.v0]);

      return {
        x: 0, z: 0, H0, W, D, fig, screens,
        sign: { x: cen[0] + faceN[0] * 0.6, y: cen[1] + faceN[1] * 0.6 + 0.2, z: cen[2] + faceN[2] * 0.6 },
        door: { x: 13, y: H0 + 2.4, z: 9.6 }
      };
    }
  }

  return { generate };
})();
