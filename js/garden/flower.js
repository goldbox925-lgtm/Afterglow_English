/* =====================================================================
   Round 02 · Memory Garden — the Interactive Bloom flower
   ---------------------------------------------------------------------
   AG.BloomFlower.create(p, { center, scale }) → one flower. Renderer-
   independent: it owns the bloom STATE, the per-petal pose, picking and
   the click / drag interaction; a renderer (js/garden/bloomPreview.js
   now, the game's renderer in Round 02) draws it with the shaders in
   js/shaders/flower.glsl.js.

   STRUCTURE (lotus): 10 real 3D petals in two rings (5 outer, 5 inner,
   offset 36°). Each petal has a PIVOT at its base on a small ring; its
   pose is { θ opening angle about the pivot, k curl along its length,
   cup across its width } and the vertex shader bends the petal mesh
   into that shape. A golden receptacle, 18 stamens with glowing anthers,
   a core glow, floating motes and ground light rings complete it.

   BLOOM: one value 0…1 drives everything. Each petal maps it through its
   own window (outer ring opens first, inner ring later, each petal a
   little offset) and eases between its closed and open pose, so the
   flower passes smoothly through the bud (0), awakening (~0.3), opening
   (~0.6) and full bloom (1) — never a switch between models.
     bloom  = p.lerp(bloom, target, 1 − e^(−3.2·dt))   (smooth, immediate)
     target = changed ONLY by the user dragging outward (never by time)

   INTERACTION (the renderer turns the pointer into a ray):
     pointerDown(ray, mouse, centreOnScreen, radiusPx)
       ray–sphere test against the flower's heart (p5.Vector maths). A
       hit awakens the flower (core pulse) and starts a drag.
     pointerDrag(mouse)   p.dist(mouse, centre) − the distance at press,
       p.map(…, 0, radiusPx, 0, 1) → target = p.constrain(start + gain,
       0, 1), never less than before: releasing keeps it, repeated drags
       continue until 100 %.
     pointerUp()          ends the drag.
   ALIVE: breathing (sin) and p.noise() flutter per petal, colours from
   p.lerpColor (cool lavender → pink → warm gold), particles (the
   existing AG.LightParticle class) that grow busier as it opens.
   Time comes in as dt (seconds from p.deltaTime).
   ===================================================================== */
window.AG = window.AG || {};

AG.BloomFlower = (function () {
  const U = AG.U;
  const OUTER = 5, INNER = 5, PETALS = OUTER + INNER, STAMENS = 18, MAX_SPR = 64, MAX_MOTES = 40;

  function create(p, opts) {
    const o = Object.assign({ center: [0, 0, 0], scale: 4 }, opts || {});
    const sc = o.scale;
    const F = {
      center: o.center.slice(), scale: sc,
      bloom: 0, target: 0, awake: false, awakeK: 0, pulseT: 99, dragging: false,
      petals: [], stamA: new Float32Array(STAMENS * 4), stamB: new Float32Array(STAMENS * 4),
      spr: new Float32Array(MAX_SPR * 4), sprC: new Float32Array(MAX_SPR * 4), sprN: 0,
      motes: [], colors: {}, t: 0, n: 0, clicks: 0
    };
    const h = (a) => U.hash(a * 12.9898 + 3.7);                 // stateless 0..1 (no p.random)

    /* ---- the ten petals: placement with p.cos / p.sin, closed and open poses ---- */
    for (let i = 0; i < PETALS; i++) {
      const outer = i < OUTER, j = outer ? i : i - OUTER;
      const phi = (outer ? j / OUTER : (j + 0.5) / INNER) * p.TWO_PI + (h(i) - 0.5) * 0.12;
      F.petals.push({
        outer, phi, dir: [p.cos(phi), 0, p.sin(phi)],
        r0: outer ? 0.12 : 0.07, y0: outer ? 0.08 : 0.11,
        L: (outer ? 1.8 : 1.5) * (0.95 + 0.1 * h(i + 20)), W: (outer ? 0.47 : 0.40) * (0.94 + 0.12 * h(i + 40)),
        closed: { th: outer ? 0.42 : 0.30, k: outer ? -0.42 : -0.45, cup: outer ? 0.95 : 1.0 },
        // open: the outer ring spreads wide with upturned tips, the inner ring opens to a cup
        open: { th: (outer ? 1.28 : 0.98) + (h(i + 60) - 0.5) * 0.1, k: outer ? -0.40 : -0.30, cup: outer ? 0.30 : 0.38 },
        // each petal's own window on the shared bloom value (outer first, inner later)
        w0: (outer ? 0.0 : 0.22) + j * 0.03, w1: outer ? 0.72 + j * 0.03 : 1.0,
        seed: h(i + 80), pose: { th: 0, k: 0, cup: 0, flutter: 0, twist: 0 }, mid: [0, 0, 0]
      });
    }

    /* ---- stamens: bases on a small ring (p.cos / p.sin), tips rise and spread as it opens ---- */
    const stamens = [];
    for (let i = 0; i < STAMENS; i++) {
      const a = (i / STAMENS) * p.TWO_PI + h(i + 100) * 0.3;
      stamens.push({ a, hgt: 0.42 + 0.22 * h(i + 120), lean: 0.16 + 0.14 * h(i + 140), seed: h(i + 160) });
    }

    /* ---- colours (p.lerpColor): cool lavender → pink → warm gold as it blooms ---- */
    const C = {
      lav: p.color(150, 125, 235), pink: p.color(255, 120, 205), gold: p.color(255, 196, 110),
      cyan: p.color(110, 220, 255), blue: p.color(140, 160, 255), white: p.color(255, 236, 245), amber: p.color(255, 140, 60)
    };
    const rgb = (c, k) => [p.red(c) / 255 * (k || 1), p.green(c) / 255 * (k || 1), p.blue(c) / 255 * (k || 1)];

    function reset() {
      F.bloom = 0; F.target = 0; F.awake = false; F.awakeK = 0; F.pulseT = 99; F.dragging = false; F.motes.length = 0; F.clicks = 0;
    }

    /* the heart of the flower for picking: tall inside the closed bud, low and wide when open */
    function heart() {
      const b = U.smooth(0, 1, F.bloom);
      return { c: [F.center[0], F.center[1] + U.lerp(0.78, 0.32, b) * sc, F.center[2]], r: U.lerp(0.42, 0.5, b) * sc };
    }

    /* ray (p5.Vector origin, p5.Vector unit direction) → distance to the heart sphere, or −1 */
    function pick(ro, rd) {
      const H = heart();
      const oc = p5.Vector.sub(ro, p.createVector(H.c[0], H.c[1], H.c[2]));
      const b = oc.dot(rd), c = oc.dot(oc) - H.r * H.r, disc = b * b - c;
      if (disc < 0) return -1;
      const t = -b - Math.sqrt(disc);
      return t > 0 ? t : -1;
    }

    let drag = null;
    function pointerDown(ro, rd, mouse, centreScreen, radiusPx) {
      if (pick(ro, rd) < 0) return false;
      if (!F.awake) { F.awake = true; F.pulseT = 0; }        // CLICK — awaken: the core pulses
      else F.pulseT = Math.min(F.pulseT, 0.35);              // a softer pulse on later presses
      F.clicks++;
      drag = { d0: p.dist(mouse[0], mouse[1], centreScreen[0], centreScreen[1]), t0: F.target, cs: centreScreen, R: Math.max(40, radiusPx) };
      F.dragging = true;
      return true;
    }
    function pointerDrag(mouse) {
      if (!drag) return;
      // DRAG — unfold: how far the pointer has moved OUTWARD from the centre since the press
      const d = p.dist(mouse[0], mouse[1], drag.cs[0], drag.cs[1]);
      const gain = p.map(d - drag.d0, 0, drag.R, 0, 1);
      const t = p.constrain(drag.t0 + gain, 0, 1);
      if (t > F.target) F.target = t;                        // never closes; releasing keeps it
    }
    function pointerUp() { drag = null; F.dragging = false; }

    /* ---- per frame ---- */
    function update(dt, camPos) {
      F.t += dt;
      const t = F.t;
      F.bloom = p.lerp(F.bloom, F.target, 1 - Math.exp(-3.2 * dt));
      if (Math.abs(F.bloom - F.target) < 1e-4) F.bloom = F.target;
      F.awakeK = p.lerp(F.awakeK, F.awake ? 1 : 0, 1 - Math.exp(-2.5 * dt));
      F.pulseT += dt;
      const b = F.bloom, life = 0.3 + 0.7 * F.awakeK;
      // petals: each eases through its own window, breathes and flutters a little differently
      for (let i = 0; i < PETALS; i++) {
        const P = F.petals[i];
        const pp = U.smooth(P.w0, P.w1, b);
        const e = pp * pp * (3 - 2 * pp);
        const breath = 0.022 * p.sin(t * 1.25 + i * 0.73) * life * (1 - 0.4 * pp);
        const nz = p.noise(i * 7.31, t * 0.28) - 0.5, nz2 = p.noise(i * 3.7 + 11, t * 0.21) - 0.5;
        P.pose.th = p.lerp(P.closed.th, P.open.th, e) + breath + nz * 0.05 * (0.3 + b);
        P.pose.k = p.lerp(P.closed.k, P.open.k, e) + nz2 * 0.08 * b;
        P.pose.cup = p.lerp(P.closed.cup, P.open.cup, e);
        P.pose.flutter = nz * 0.14 * (0.25 + b) * life;
        P.pose.twist = nz2 * 0.35 * b;
        // the petal's middle (for back-to-front sorting)
        const s = 0.5 * P.L, th = P.pose.th, k = P.pose.k;
        const r = Math.abs(k) < 1e-3 ? s * Math.sin(th) : (Math.cos(th) - Math.cos(th + k * s)) / k;
        const y = Math.abs(k) < 1e-3 ? s * Math.cos(th) : (Math.sin(th + k * s) - Math.sin(th)) / k;
        P.mid = [F.center[0] + P.dir[0] * (P.r0 + r) * sc, F.center[1] + (P.y0 + y) * sc, F.center[2] + P.dir[2] * (P.r0 + r) * sc];
        P.dist2 = camPos ? (P.mid[0] - camPos[0]) ** 2 + (P.mid[1] - camPos[1]) ** 2 + (P.mid[2] - camPos[2]) ** 2 : 0;
      }
      // colours
      const warm = U.smooth(0.55, 1.0, b);
      const body = p.lerpColor(C.lav, C.pink, U.smooth(0.05, 0.65, b));
      F.colors = {
        base: rgb(p.lerpColor(p.lerpColor(C.lav, C.pink, b), C.amber, 0.2 + 0.5 * warm), 0.8),
        body: rgb(body),
        tip: rgb(p.lerpColor(C.blue, C.cyan, U.smooth(0.2, 0.8, b))),
        rim: rgb(p.lerpColor(C.lav, C.pink, 0.4 + 0.6 * b), 0.9 + 0.6 * b),
        core: rgb(p.lerpColor(C.pink, C.gold, 0.6 + 0.4 * b), 1.0),
        ring: rgb(p.lerpColor(C.lav, C.pink, b), 0.6)
      };
      // core intensity: faint inside the bud, glowing when awake, radiant at full bloom, + click pulse
      const pulse = Math.exp(-F.pulseT * 3.0);
      F.core = 0.08 + 0.3 * F.awakeK + 1.15 * Math.pow(b, 1.4) + 0.9 * pulse * (0.4 + 0.6 * F.awakeK);
      F.vein = 0.18 + 0.35 * F.awakeK + 0.9 * b;
      F.pulseR = Math.min(1, F.pulseT * 0.75); F.pulseA = pulse * 0.9;
      // stamens: rise out of the opening bud and spread, swaying with noise
      const emerge = U.smooth(0.18, 0.85, b);
      for (let i = 0; i < STAMENS; i++) {
        const S = stamens[i], ca = p.cos(S.a), sa = p.sin(S.a);
        const base = [F.center[0] + ca * 0.06 * sc, F.center[1] + 0.17 * sc, F.center[2] + sa * 0.06 * sc];
        const sw = (p.noise(i * 1.7 + 50, t * 0.4) - 0.5) * 0.06;
        const lean = p.lerp(0.02, S.lean, emerge), hgt = p.lerp(0.22, S.hgt, emerge);
        const tip = [F.center[0] + (ca * (0.06 + lean) - sa * sw) * sc, F.center[1] + (0.17 + hgt) * sc, F.center[2] + (sa * (0.06 + lean) + ca * sw) * sc];
        F.stamA.set([base[0], base[1], base[2], 0.012 * sc], i * 4);
        F.stamB.set([tip[0], tip[1], tip[2], 0.25 + 1.4 * emerge * (0.6 + 0.4 * S.seed)], i * 4);
        S.tip = tip;
      }
      updateMotes(dt, t, b);
      packSprites(emerge);
    }

    /* floating motes: the existing AG.LightParticle class (p5.Vector + p.noise drift, dt) */
    let carry = 0;
    const MOTE_COLS = [[1.0, 0.55, 0.85], [0.75, 0.6, 1.0], [0.45, 0.9, 1.0], [1.0, 0.82, 0.5]];
    function updateMotes(dt, t, b) {
      const rate = (F.awake ? 1.5 : 0.4) + 26 * Math.pow(b, 1.2);    // busier as it opens
      carry += dt * rate;
      while (carry >= 1) {
        carry -= 1;
        if (F.motes.length >= MAX_MOTES) continue;
        F.n++;
        const a = h(F.n * 3.1) * p.TWO_PI, rr = (0.25 + h(F.n * 5.7) * (0.6 + 1.1 * b)) * sc, y = (0.15 + h(F.n * 7.9) * (0.9 + 0.8 * b)) * sc;
        const pos = p.createVector(F.center[0] + p.cos(a) * rr, F.center[1] + y, F.center[2] + p.sin(a) * rr);
        const vel = p.createVector((h(F.n * 9.1) - 0.5) * 0.4, 0.25 + 0.5 * h(F.n * 11.3), (h(F.n * 13.7) - 0.5) * 0.4);
        F.motes.push(new AG.LightParticle(p, pos, vel, 2.2 + 2.8 * h(F.n * 17.1), MOTE_COLS[Math.floor(h(F.n * 19.3) * 4) % 4], (0.03 + 0.03 * h(F.n * 23.9)) * sc, h(F.n * 29.7) * 100));
      }
      // update, then remove expired motes with a reverse loop
      for (let i = F.motes.length - 1; i >= 0; i--) {
        const m = F.motes[i];
        m.update(dt, t);
        m.vel.mult(Math.exp(-1.4 * dt));                     // calmer than her trail glints
        if (m.isDead()) F.motes.splice(i, 1);
      }
    }

    /* glow sprites for the renderer: core glow, 18 anthers, the motes */
    const tmpP = new Float32Array(4), tmpC = new Float32Array(4);
    function packSprites(emerge) {
      F.spr.fill(0); F.sprC.fill(0);
      let n = 0;
      const put = (x, y, z, size, r, g, bl, a) => { if (n >= MAX_SPR) return; F.spr.set([x, y, z, size], n * 4); F.sprC.set([r, g, bl, a], n * 4); n++; };
      const cc = F.colors.core;
      put(F.center[0], F.center[1] + (0.26 + 0.2 * F.bloom) * sc, F.center[2], (0.2 + 0.22 * Math.min(1.6, F.core)) * sc, 1.0, 0.55, 0.15, 0.12 + 0.2 * Math.min(1.6, F.core));
      for (const S of stamens) put(S.tip[0], S.tip[1], S.tip[2], 0.05 * sc * (0.5 + 0.6 * emerge), 1.0, 0.45, 0.08, 0.25 + 0.8 * emerge);
      for (let i = 0; i < F.motes.length; i++) {
        F.motes[i].display(0, tmpP, tmpC);
        put(tmpP[0], tmpP[1], tmpP[2], tmpC[3], tmpC[0], tmpC[1], tmpC[2], tmpP[3] * 0.9);
      }
      F.sprN = n;
    }

    /* the stage name for the progress indicator */
    function stageName() {
      const b = F.target;
      return b < 0.15 ? (F.awake ? 'Awakened bud' : 'Closed bud') : b < 0.45 ? 'Awakening' : b < 0.85 ? 'Opening' : 'Full bloom';
    }

    return Object.assign(F, { reset, update, pick, heart, pointerDown, pointerDrag, pointerUp, stageName, PETALS, STAMENS });
  }

  return { create };
})();
