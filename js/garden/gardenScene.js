/* =====================================================================
   Round 02 · Memory Garden — the garden scene (one AG.BloomFlower)
   ---------------------------------------------------------------------
   AG.GardenScene.create(p) → a self-contained renderer + input handler
   for the Interactive Bloom, drawn into any p5 WebGL2 canvas. It is used
   by the game (inside the portal building, js/garden/garden.js) and by
   the dev preview (bloom.html, js/garden/bloomPreview.js).

   Input (screen pixels, the canvas' CSS size = p.width × p.height):
     down(x, y)   a press: on the flower's heart → awaken + start a drag
                  (returns true); anywhere else → start an orbit
     move(x, y)   drag: unfold the flower, or orbit the camera
                  (the orbit is suspended while the flower is dragged)
     up()         release (the flower keeps what it reached)
     wheel(d)     zoom
   draw(dt)       one frame

   p5.js used here: p.createVector / p5.Vector (picking ray), p.dist,
   p.constrain, p.createFramebuffer, p.createShader, p.model, p.blendMode.
   ===================================================================== */
window.AG = window.AG || {};

AG.GardenScene = {
  create(p) {
    const U = AG.U;
    const SH = {}; let gl, quad, petalGeo, domeGeo, sprGeo, stamGeo, discGeo, sceneFB, bA, bB, ready = false;
    const cam = { yaw: 0.55, pitch: 0.3, dist: 12.5, target: [0, 1.9, 0], fov: 40 };
    const view = { eye: [0, 0, 0], V: null, P: null };
    const flower = AG.BloomFlower.create(p, { center: [0, 0, 0], scale: 2 });
    let mode = null, lastX = 0, lastY = 0;            // mode: 'flower' | 'orbit' | null

    function mesh(name, fill) { const B = new AG.GeometryBuilder(name); fill(B); return B.build(p)[0]; }   // each mesh fits one chunk
    const quadAt = (B, c, d) => {                       // one sprite / ribbon quad, corners ±1
      B._ensure(4);
      const a = B.rawVertex(c, [0, 1, 0], -1, -1, d), b = B.rawVertex(c, [0, 1, 0], 1, -1, d),
            e = B.rawVertex(c, [0, 1, 0], 1, 1, d), f = B.rawVertex(c, [0, 1, 0], -1, 1, d);
      B.rawTri(a, b, e); B.rawTri(a, e, f);
    };
    const bloomSize = () => [Math.max(8, Math.floor(p.width / 4)), Math.max(8, Math.floor(p.height / 4))];

    /* shaders, meshes and framebuffers: created on first use */
    function init() {
      if (ready) return;
      gl = p.drawingContext;
      const mk = (d) => p.createShader(d.vert, d.frag);
      SH.petal = mk(AG.SHADERS.flowerPetal); SH.spr = mk(AG.SHADERS.flowerSprite); SH.back = mk(AG.SHADERS.flowerBackdrop);
      SH.comp = mk(AG.SHADERS.flowerComposite); SH.bright = mk(AG.SHADERS.bright); SH.blur = mk(AG.SHADERS.blur);
      quad = mesh('gq', (B) => B.quad([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, 1], [0, 0, 1, 1]));
      // the petal: a (u, v) grid — u along the petal (finer near the tip), v across
      petalGeo = mesh('petal', (B) => {
        const NU = 30, NV = 18;
        for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
          B._ensure(4);
          const u0 = Math.pow(i / NU, 0.9), u1 = Math.pow((i + 1) / NU, 0.9), v0 = j / NV * 2 - 1, v1 = (j + 1) / NV * 2 - 1, d = [0, 0, 0, 0];
          const a = B.rawVertex([u0, v0, 0], [0, 0, 1], u0, v0, d), b = B.rawVertex([u1, v0, 0], [0, 0, 1], u1, v0, d),
                c = B.rawVertex([u1, v1, 0], [0, 0, 1], u1, v1, d), e = B.rawVertex([u0, v1, 0], [0, 0, 1], u0, v1, d);
          B.rawTri(a, b, c); B.rawTri(a, c, e);
        }
      });
      // the receptacle: a unit dome
      domeGeo = mesh('dome', (B) => {
        const la = 10, lo = 24;
        const P = (i, j) => { const th = (i / la) * Math.PI * 0.62, ph = (j / lo) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
        for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) B.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), [0, 1, 0]);
      });
      sprGeo = mesh('spr', (B) => { for (let i = 0; i < 64; i++) quadAt(B, [i, 0, 0], [0, 0, 0, 0]); });
      stamGeo = mesh('stam', (B) => { for (let i = 0; i < 18; i++) quadAt(B, [i, 0, 0], [0, 0, 0, 0]); });
      discGeo = mesh('disc', (B) => quadAt(B, [0, 0, 0], [0, 0, 0, 0]));
      const fbo = (o) => { try { return p.createFramebuffer(Object.assign({ format: p.HALF_FLOAT, textureFiltering: p.LINEAR, antialias: false }, o)); } catch (e) { return p.createFramebuffer(Object.assign({ textureFiltering: p.LINEAR }, o)); } };
      const [bw, bh] = bloomSize();
      sceneFB = fbo({ depth: true });
      bA = fbo({ width: bw, height: bh, density: 1, depth: false });
      bB = fbo({ width: bw, height: bh, density: 1, depth: false });
      ready = true;
    }
    function resize() {
      if (!ready) return;
      sceneFB.resize(p.width, p.height);
      const [bw, bh] = bloomSize();
      bA.resize(bw, bh); bB.resize(bw, bh);
    }

    /* ---------- camera ---------- */
    function camera() {
      const cp = Math.cos(cam.pitch);
      // on a narrow (portrait) screen the camera stands back so the open flower (≈ 4.6 m to each
      // side of its centre) still fits across; on wider screens cam.dist is used as it is
      const aspect = p.width / p.height, dist = Math.max(cam.dist, 5.2 / (Math.tan(cam.fov * Math.PI / 360) * aspect));
      view.eye = [cam.target[0] + Math.sin(cam.yaw) * cp * dist, cam.target[1] + Math.sin(cam.pitch) * dist, cam.target[2] + Math.cos(cam.yaw) * cp * dist];
      view.V = U.mat4.lookAt(view.eye, cam.target, [0, 1, 0]);
      view.P = U.mat4.perspective(cam.fov * Math.PI / 180, p.width / p.height, 0.05, 300);
    }
    /* world → screen pixels */
    function project(w) {
      const m = (M, v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12] * v[3], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13] * v[3], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14] * v[3], M[3] * v[0] + M[7] * v[1] + M[11] * v[2] + M[15] * v[3]];
      const c = m(view.P, m(view.V, [w[0], w[1], w[2], 1]));
      return [(c[0] / c[3] * 0.5 + 0.5) * p.width, (0.5 - c[1] / c[3] * 0.5) * p.height];
    }
    /* the picking ray through the pointer (p5.Vector) */
    function ray(mx, my) {
      const eye = p.createVector(...view.eye), fwd = p5.Vector.sub(p.createVector(...cam.target), eye).normalize();
      const right = fwd.cross(p.createVector(0, 1, 0)).normalize(), up = right.cross(fwd).normalize();
      const th = Math.tan(cam.fov * Math.PI / 360), x = (2 * mx / p.width - 1) * th * (p.width / p.height), y = (1 - 2 * my / p.height) * th;
      return { ro: eye, rd: p5.Vector.add(fwd, p5.Vector.add(p5.Vector.mult(right, x), p5.Vector.mult(up, y))).normalize() };
    }

    /* ---------- input ---------- */
    function down(x, y) {
      camera();                                          // matrices are valid even before the first frame
      lastX = x; lastY = y;
      const { ro, rd } = ray(x, y);
      const H = flower.heart();
      const cs = project(H.c), edge = project([H.c[0] + Math.cos(cam.yaw) * 1.6 * flower.scale, H.c[1], H.c[2] - Math.sin(cam.yaw) * 1.6 * flower.scale]);
      const radiusPx = p.dist(cs[0], cs[1], edge[0], edge[1]);
      mode = flower.pointerDown(ro, rd, [x, y], cs, radiusPx) ? 'flower' : 'orbit';
      return mode === 'flower';
    }
    function move(x, y) {
      if (mode === 'flower') flower.pointerDrag([x, y]);           // camera orbit suspended
      else if (mode === 'orbit') {
        // the pointer's change since the last event (robust for mouse and touch)
        cam.yaw -= (x - lastX) * 0.006;
        cam.pitch = p.constrain(cam.pitch + (y - lastY) * 0.004, -0.15, 1.2);
      }
      lastX = x; lastY = y;
    }
    function up() { if (mode === 'flower') flower.pointerUp(); mode = null; }
    function wheel(d) { cam.dist = p.constrain(cam.dist * Math.exp(d * 0.001), 6, 30); }
    function resetView() { cam.yaw = 0.55; cam.pitch = 0.3; cam.dist = 12.5; mode = null; }

    /* ---------- frame ---------- */
    function draw(dt) {
      init();
      camera();
      flower.update(dt, view.eye);
      const t = flower.t, col = flower.colors;

      sceneFB.begin();
      p.clear();
      // backdrop
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.BLEND);
      p.shader(SH.back); SH.back.setUniform('uBloom', flower.bloom); SH.back.setUniform('uTime', t); p.model(quad);
      gl.enable(gl.DEPTH_TEST);
      const common = (sh) => { sh.setUniform('uView', view.V); sh.setUniform('uProj', view.P); sh.setUniform('uCamPos', view.eye); sh.setUniform('uTime', t); sh.setUniform('uCenter', flower.center); sh.setUniform('uScale', flower.scale); };
      // ground light rings + click pulse
      p.blendMode(p.ADD); gl.depthMask(false);
      p.shader(SH.spr); common(SH.spr);
      SH.spr.setUniform('uKind', 2); SH.spr.setUniform('uDisc', 2.6); SH.spr.setUniform('uBloom', flower.bloom); SH.spr.setUniform('uAwake', flower.awakeK);
      SH.spr.setUniform('uPulseR', flower.pulseR); SH.spr.setUniform('uPulseA', flower.pulseA); SH.spr.setUniform('uRingCol', col.ring);
      p.model(discGeo);
      // receptacle (opaque, writes depth)
      p.blendMode(p.BLEND); gl.depthMask(true);
      p.shader(SH.petal); common(SH.petal);
      SH.petal.setUniform('uKind', 1); SH.petal.setUniform('uCore', flower.core); SH.petal.setUniform('uCoreCol', col.core);
      p.model(domeGeo);
      // stamen filaments
      p.blendMode(p.ADD); gl.depthMask(false);
      p.shader(SH.spr); common(SH.spr);
      SH.spr.setUniform('uKind', 1); SH.spr.setUniform('uStamA', flower.stamA); SH.spr.setUniform('uStamB', flower.stamB);
      p.model(stamGeo);
      // petals: translucent, sorted back to front, two-sided, no depth writes
      p.blendMode(p.BLEND);
      p.shader(SH.petal); common(SH.petal);
      SH.petal.setUniform('uKind', 0);
      SH.petal.setUniform('uBaseCol', col.base); SH.petal.setUniform('uBodyCol', col.body); SH.petal.setUniform('uTipCol', col.tip);
      SH.petal.setUniform('uRimCol', col.rim); SH.petal.setUniform('uCoreCol', col.core);
      SH.petal.setUniform('uBloom', flower.bloom); SH.petal.setUniform('uAwake', flower.awakeK); SH.petal.setUniform('uCore', flower.core);
      SH.petal.setUniform('uVein', flower.vein); SH.petal.setUniform('uAlpha', 0.58 + 0.14 * flower.bloom);
      const order = flower.petals.slice().sort((a, b) => b.dist2 - a.dist2);
      for (const P of order) {
        SH.petal.setUniform('uA', [P.phi, P.r0, P.L, P.W]);
        SH.petal.setUniform('uB', [P.pose.th, P.pose.k, P.pose.cup, P.y0]);
        SH.petal.setUniform('uC', [P.pose.flutter, P.pose.twist, 0, 0]);
        SH.petal.setUniform('uSeed', P.seed);
        p.model(petalGeo);
      }
      // glow sprites: core glow, anthers, motes
      p.blendMode(p.ADD);
      p.shader(SH.spr); common(SH.spr);
      SH.spr.setUniform('uKind', 0); SH.spr.setUniform('uSpr', flower.spr); SH.spr.setUniform('uSprC', flower.sprC);
      p.model(sprGeo);
      gl.depthMask(true); p.blendMode(p.BLEND);
      sceneFB.end();

      // bloom: the game's bright-pass + separable blur
      gl.disable(gl.DEPTH_TEST);
      const pass = (target, sh, uni) => { target.begin(); p.clear(); p.shader(sh); Object.keys(uni).forEach((k) => sh.setUniform(k, uni[k])); p.model(quad); target.end(); };
      pass(bA, SH.bright, { tSrc: sceneFB, uTexel: [1 / sceneFB.width, 1 / sceneFB.height], uThreshold: 1.1 });
      for (let i = 0; i < 2; i++) {
        pass(bB, SH.blur, { tSrc: bA, uDir: [(1 + i) / bA.width, 0] });
        pass(bA, SH.blur, { tSrc: bB, uDir: [0, (1 + i) / bA.height] });
      }
      p.clear(); p.shader(SH.comp);
      SH.comp.setUniform('tScene', sceneFB); SH.comp.setUniform('tBloom', bA); SH.comp.setUniform('uBloomAmt', 0.45);
      p.model(quad);
      gl.enable(gl.DEPTH_TEST);
    }

    return { flower, cam, view, init, resize, draw, down, move, up, wheel, resetView, camera, project,
      get dragging() { return mode === 'flower'; } };
  }
};
