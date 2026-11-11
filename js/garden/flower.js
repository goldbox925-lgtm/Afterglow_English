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
      grow: 0.94, growPulseT: 99, fullPulseT: 99, full: false, idleYaw: 0,   // p.scale() / p.rotate() inputs (gardenScene.js)
      hover: false, hoverK: 0,                                               // the pointer over the golden centre (p.mouseMoved)
      visitor: null, proxTo: 0, prox: 0,                                     // Round 02: her position and closeness (setVisitor)
      petals: [], stamA: new Float32Array(STAMENS * 4), stamB: new Float32Array(STAMENS * 4),
      spr: new Float32Array(MAX_SPR * 4), sprC: new Float32Array(MAX_SPR * 4), sprN: 0,
      motes: [], colors: {}, t: 0, n: 0, clicks: 0
    };
    const h = (a) => U.hash(a * 12.9898 + 3.7);                 // stateless 0..1 (no p.random)

    /* ---- the ten petals: placement with p.cos / p.sin, closed and open poses ---- */
    for (let i = 0; i < PETALS; i++) {
      const outer = i < OUTER, j = outer ? i : i - OUTER;
      const phi = (outer ? j / OUTER : (j + 0.5) / INNER) * p.TWO_PI + (h(i) - 0.5) * 0.12;
      const v = (k) => (h(i + k) - 0.5);                       // per-petal irregularity (−0.5 … 0.5)
      F.petals.push({
        outer, phi, dir: [p.cos(phi), 0, p.sin(phi)],
        r0: outer ? 0.12 : 0.07, y0: outer ? 0.08 : 0.12,
        // wide, rounded petals (half-width ≈ a third of the length), each a little different
        L: (outer ? 1.75 : 1.5) * (1 + 0.1 * v(20)), W: (outer ? 0.6 : 0.5) * (1 + 0.12 * v(40)),
        asym: 0.16 * v(50) * 2,                                  // one side a little wider, a slight lean
        // spine: θ = opening rotation at the pivot, curvature k(s) = k0 + k1·s along the petal.
        // CLOSED: each petal bulges out and folds in over the top → a rounded bud
        closed: { th: (outer ? 0.68 : 0.52) + 0.04 * v(55), k0: outer ? -0.1 : -0.14, k1: outer ? -0.82 : -0.92, cup: outer ? 1.05 : 1.1, curl: 0.0 },
        // OPEN: the outer ring spreads nearly flat and lifts its tips (S-curve), the inner ring opens to a cup
        open: { th: (outer ? 1.3 : 0.9) + 0.12 * v(60), k0: outer ? 0.0 : 0.0, k1: outer ? -0.62 : -0.55, cup: outer ? 0.45 : 0.5, curl: outer ? 0.3 : 0.2 },
        // each petal's own window on the shared bloom value (outer first, inner later)
        w0: (outer ? 0.0 : 0.22) + j * 0.03, w1: outer ? 0.72 + j * 0.03 : 1.0,
        seed: h(i + 80), pose: { th: 0, k0: 0, k1: 0, cup: 0, curl: 0, wrap: 1, flutter: 0, twist: 0 }, mid: [0, 0, 0]
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
      F.growPulseT = 99; F.fullPulseT = 99; F.full = false; F.hover = false; F.hoverK = 0; F.prox = 0; F.proxTo = 0;
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
    /* CLICK — awaken: the core pulses, the flower swells (p.scale). Also called by the garden
       when a click on the heart was made before she arrived (it waits for her). */
    function awaken() {
      if (!F.awake) { F.awake = true; F.pulseT = 0; F.growPulseT = 0; }
      else F.pulseT = Math.min(F.pulseT, 0.35);              // a softer pulse on later presses
    }
    /* Round 02: the heroine near the flower. pos = her world position (or null), prox 0..1
       (js/garden/garden.js: p.dist → p.map → p.constrain); eased here with p.lerp */
    function setVisitor(pos, prox) { F.visitor = pos; F.proxTo = pos ? prox : 0; }
    function pointerDown(ro, rd, mouse, centreScreen, radiusPx) {
      if (pick(ro, rd) < 0) return false;
      awaken();
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
      /* ---- the whole flower's p.scale() factor (gardenScene.js), centred on its base:
           · gradual growth as it unfolds (0.94 → 1.0, p.map)
           · a small swell when it is first clicked awake (+5 %, a 0.7 s p.sin envelope)
           · a gentle breathing once fully open (±1.8 %, p.sin)
           · a slightly larger pulse the moment it reaches 100 % (+8 %, 1.4 s)
         eased with p.lerp(…, 1 − e^(−12·dt)) so nothing ever jumps ---- */
      F.growPulseT += dt; F.fullPulseT += dt;
      if (!F.full && b >= 0.995) { F.full = true; F.fullPulseT = 0; }
      const env = (x, len) => (x < len ? p.sin(Math.PI * x / len) : 0);
      const growTo = p.map(b, 0, 1, 0.94, 1.0) * (1 + 0.05 * env(F.growPulseT, 0.7) + 0.08 * env(F.fullPulseT, 1.4) + 0.018 * p.sin(t * 1.3) * U.smooth(0.9, 1, b));
      F.grow = p.lerp(F.grow, growTo, 1 - Math.exp(-12 * dt));
      // a slow organic turn of the whole flower about its axis (p.rotate, ±3.5°, p.noise)
      F.idleYaw = (p.noise(t * 0.08, 3.3) - 0.5) * 0.12 * life;
      const sg = sc * F.grow;
      // petals: each eases through its own window, breathes and flutters a little differently
      for (let i = 0; i < PETALS; i++) {
        const P = F.petals[i];
        const pp = U.smooth(P.w0, P.w1, b);
        const e = pp * pp * (3 - 2 * pp);
        const breath = 0.022 * p.sin(t * 1.25 + i * 0.73) * life * (1 - 0.4 * pp);
        const nz = p.noise(i * 7.31, t * 0.28) - 0.5, nz2 = p.noise(i * 3.7 + 11, t * 0.21) - 0.5;
        // ROTATION about the petal's own base (applied with p.rotate() in gardenScene.js):
        //   hinge = closed → open (outer ring first: each petal's own window w0 … w1)
        //   sway  = a small idle rotation: breathing (p.sin) + p.noise drift
        P.hinge = p.lerp(P.closed.th, P.open.th, e);
        P.sway = breath + nz * 0.05 * (0.3 + b);
        P.pose.th = P.hinge + P.sway;                          // (the shader needs it only for the closed bud's wrap)
        P.grow = p.lerp(0.9, 1.0, e);                          // each petal grows a little as it unfolds (p.scale)
        // the petals on HER side lean toward her a little as she comes close (p.rotate, gardenScene.js);
        // a response only: the bloom value itself is never changed by her
        if (F.visitor) {
          const az = Math.atan2(F.visitor[2] - F.center[2], F.visitor[0] - F.center[0]);
          P.lean = 0.09 * F.prox * Math.max(0, p.cos(P.phi - F.idleYaw - az)) * (1 - 0.5 * e);
        } else P.lean = 0;
        P.pose.k0 = p.lerp(P.closed.k0, P.open.k0, e) + nz2 * 0.06 * b;
        P.pose.k1 = p.lerp(P.closed.k1, P.open.k1, e);
        P.pose.cup = p.lerp(P.closed.cup, P.open.cup, e);
        P.pose.curl = p.lerp(P.closed.curl, P.open.curl, e);
        P.pose.wrap = p.constrain(p.map(e, 0, 0.75, 1, 0), 0, 1);   // wrapped round the bud → free, cupped petal
        P.pose.flutter = nz * 0.14 * (0.25 + b) * life;
        P.pose.twist = nz2 * 0.35 * b;
        // the petal's middle (for back-to-front sorting): the same spine as the vertex shader
        const [r, y] = spine(0.5 * P.L, P.pose.th, P.pose.k0, P.pose.k1);
        const az = P.phi - F.idleYaw;
        P.mid = [F.center[0] + Math.cos(az) * (P.r0 + r) * sg, F.center[1] + (P.y0 + y) * sg, F.center[2] + Math.sin(az) * (P.r0 + r) * sg];
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
      // HOVER: the golden centre brightens while the pointer is over it (eased, p.lerp)
      F.hoverK = p.lerp(F.hoverK, F.hover && !F.dragging ? 1 : 0, 1 - Math.exp(-8 * dt));
      // PROXIMITY: her closeness, eased (p.lerp), warms the core and the petals' own glow
      F.prox = p.lerp(F.prox, F.proxTo, 1 - Math.exp(-2.5 * dt));
      F.core = 0.08 + 0.3 * F.awakeK + 1.15 * Math.pow(b, 1.4) + 0.9 * pulse * (0.4 + 0.6 * F.awakeK) + 0.45 * F.hoverK + 0.3 * F.prox;
      F.vein = 0.18 + 0.35 * F.awakeK + 0.9 * b;
      // emissive glow and iridescence strength: already alive in the bud, fuller as it opens
      F.emit = p.map(b, 0, 1, 0.55 + 0.25 * F.awakeK, 1.15) + 0.3 * pulse + 0.25 * F.prox;
      F.iri = p.constrain(0.45 + 0.15 * F.awakeK + 0.5 * b, 0, 1);
      F.pulseR = Math.min(1, F.pulseT * 0.75); F.pulseA = pulse * 0.9;
      // stamens: rise out of the opening bud and spread, swaying with noise
      const emerge = U.smooth(0.18, 0.85, b);
      for (let i = 0; i < STAMENS; i++) {
        // (billboards built on the CPU in world space: they follow the same grow / idleYaw values)
        const S = stamens[i], ca = p.cos(S.a - F.idleYaw), sa = p.sin(S.a - F.idleYaw);
        const base = [F.center[0] + ca * 0.06 * sg, F.center[1] + 0.17 * sg, F.center[2] + sa * 0.06 * sg];
        const sw = (p.noise(i * 1.7 + 50, t * 0.4) - 0.5) * 0.06;
        const lean = p.lerp(0.02, S.lean, emerge), hgt = p.lerp(0.22, S.hgt, emerge);
        const tip = [F.center[0] + (ca * (0.06 + lean) - sa * sw) * sg, F.center[1] + (0.17 + hgt) * sg, F.center[2] + (sa * (0.06 + lean) + ca * sw) * sg];
        F.stamA.set([base[0], base[1], base[2], 0.012 * sg], i * 4);
        F.stamB.set([tip[0], tip[1], tip[2], 0.25 + 1.4 * emerge * (0.6 + 0.4 * S.seed)], i * 4);
        S.tip = tip;
      }
      updateMotes(dt, t, b);
      packSprites(emerge);
    }

    /* the petal spine to arc length s (as in the vertex shader): direction θ + k0·m + ½·k1·m² */
    function spine(s, th, k0, k1) {
      let r = 0, y = 0; const hh = s / 10;
      for (let i = 0; i < 10; i++) { const m = (i + 0.5) * hh, al = th + k0 * m + 0.5 * k1 * m * m; r += p.sin(al) * hh; y += p.cos(al) * hh; }
      return [r, y];
    }

    /* floating motes: the existing AG.LightParticle class (p5.Vector + p.noise drift, dt) */
    let carry = 0;
    const MOTE_COLS = [[1.0, 0.55, 0.85], [0.75, 0.6, 1.0], [0.45, 0.9, 1.0], [1.0, 0.82, 0.5]];
    function updateMotes(dt, t, b) {
      const rate = (F.awake ? 1.5 : 0.4) + 26 * Math.pow(b, 1.2) + 8 * F.prox;   // busier as it opens, and as she comes near
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
        // near her, the motes drift toward her (a p5.Vector pull, stronger the closer she is)
        if (F.visitor && F.prox > 0.01) {
          const pull = p5.Vector.sub(p.createVector(F.visitor[0], F.visitor[1], F.visitor[2]), m.pos);
          if (pull.mag() > 0.3) m.vel.add(pull.setMag(1.4 * F.prox * dt * sc / 2));
        }
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
      put(F.center[0], F.center[1] + (0.26 + 0.2 * F.bloom) * sc * F.grow, F.center[2], (0.2 + 0.22 * Math.min(1.6, F.core)) * sc, 1.0, 0.55, 0.15, 0.12 + 0.2 * Math.min(1.6, F.core));
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

    return Object.assign(F, { reset, update, pick, heart, pointerDown, pointerDrag, pointerUp, awaken, setVisitor, stageName, PETALS, STAMENS });
  }

  return { create };
})();
