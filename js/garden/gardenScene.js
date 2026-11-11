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
   draw(dt, o)    one frame; o.CH (optional) = CharacterDirector's items: she is drawn in it

   p5.js used here: p.createVector / p5.Vector (picking ray), p.dist,
   p.constrain, p.createFramebuffer, p.createShader, p.model, p.blendMode.
   ===================================================================== */
window.AG = window.AG || {};

AG.GardenScene = {
  create(p, o) {
    const U = AG.U;
    const SH = {}; let gl, quad, petalGeo, domeGeo, sprGeo, stamGeo, discGeo, sceneFB, bA, bB, ready = false;
    // the default view shows the room round the flower (wider, lower, a little further back)
    const cam = { yaw: 0.55, pitch: 0.08, dist: 15.5, target: [0, 4.2, 0], fov: 58 };
    const view = { eye: [0, 0, 0], V: null, P: null };
    // (the game's garden flower is larger, 2.6, so it holds the atrium; the preview keeps 2)
    const flower = AG.BloomFlower.create(p, { center: [0, 0, 0], scale: (o && o.scale) || 2 });
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
      const aspect = p.width / p.height, dist = Math.max(Math.min(cam.dist, (cam.maxR || Infinity) / Math.max(cp, 0.2)), 5.2 / (Math.tan(cam.fov * Math.PI / 360) * aspect));
      // (cam.eye, when set, places the eye directly: the game's camera following her out, js/garden/garden.js)
      view.eye = cam.eye ? cam.eye.slice() : [cam.target[0] + Math.sin(cam.yaw) * cp * dist, cam.target[1] + Math.sin(cam.pitch) * dist, cam.target[2] + Math.cos(cam.yaw) * cp * dist];
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
    /* the heart on screen: its centre and the radius of its pick sphere, in pixels */
    function heartScreen() {
      camera();
      const H = flower.heart(), cs = project(H.c);
      const edge = project([H.c[0] + Math.cos(cam.yaw) * H.r, H.c[1], H.c[2] - Math.sin(cam.yaw) * H.r]);
      return { x: cs[0], y: cs[1], r: p.dist(cs[0], cs[1], edge[0], edge[1]) };
    }
    /* HOVER (p.mouseMoved): is the pointer over the golden centre? p.dist on screen against the
       heart's own pick radius; the flower eases its hover glow toward it */
    function hover(x, y) {
      const h = heartScreen();
      flower.hover = mode !== 'orbit' && p.dist(x, y, h.x, h.y) <= h.r;
      return flower.hover;
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
    function wheel(d) { cam.dist = p.constrain(cam.dist * Math.exp(d * 0.001), 6, 20); }   // (≤ 20 m: inside the atrium's glass, r = 24 m)
    function resetView() { cam.yaw = 0.55; cam.pitch = 0.08; cam.dist = 15.5; cam.target = [0, 4.2, 0]; cam.eye = null; mode = null; }

    /* the flower's own origin in p5's transform stack (shared by the receptacle and the petals):
       reset → its base → p.scale (growth / click swell / breathing / 100 % pulse, js/garden/flower.js
       F.grow, centred on the base) → p.rotate (a slow organic turn about its axis, F.idleYaw) */
    function flowerOrigin(fl) {
      p.resetMatrix();
      p.translate(fl.center[0], fl.center[1], fl.center[2]);
      p.scale(fl.scale * fl.grow);
      p.rotate(fl.idleYaw, [0, 1, 0]);
    }

    /* ---------- frame ---------- */
    /* the camera as the city renderer's character drawing expects it (pos, basis, fov, matrices) */
    function camInfo() {
      const V3 = U.v3, dir = V3.norm(V3.sub(cam.target, view.eye)), right = V3.norm(V3.cross(dir, [0, 1, 0])), up = V3.cross(right, dir);
      return { pos: view.eye, target: cam.target, dir, right, up, fov: cam.fov, V: view.V, P: view.P };
    }
    /* Round 02: her (o.CH, CharacterDirector's items), drawn by the city renderer's own character
       code with this scene's camera. Petals are translucent and drawn back to front without depth
       writes, so she is drawn before them when she is behind the flower and after them in front. */
    function drawHer(o) {
      if (!o || !o.CH || !AG.Renderer || !AG.Renderer.drawCharacterWith) return;
      AG.Renderer.drawCharacterWith(camInfo(), o.CH, flower.t, { warm: flower.prox });
    }

    /* the flower itself (receptacle, stamens, sorted petals, glow sprites) into the framebuffer that is
       bound now, seen through vw = { V, P, eye }. Used by this scene and, for the rooftop flower of
       the building's transformation, by the city renderer (js/garden/living.js): the same shaders,
       and the same p.rotate / p.scale petal transforms. */
    function drawFlowerBody(fl, vw, hooks) {
      init();
      const t = fl.t, col = fl.colors;
      const common = (sh) => { sh.setUniform('uView', vw.V); sh.setUniform('uProj', vw.P); sh.setUniform('uCamPos', vw.eye); sh.setUniform('uTime', t); sh.setUniform('uCenter', fl.center); sh.setUniform('uScale', fl.scale); };
      // receptacle (opaque, writes depth)
      p.blendMode(p.BLEND); gl.depthMask(true);
      p.shader(SH.petal); common(SH.petal);
      SH.petal.setUniform('uKind', 1); SH.petal.setUniform('uCore', fl.core); SH.petal.setUniform('uCoreCol', col.core); SH.petal.setUniform('uHeatCol', col.heat);
      p.push();
      flowerOrigin(fl);
      p.model(domeGeo);
      p.pop();
      // stamen filaments
      p.blendMode(p.ADD); gl.depthMask(false);
      p.shader(SH.spr); common(SH.spr);
      SH.spr.setUniform('uKind', 1); SH.spr.setUniform('uStamA', fl.stamA); SH.spr.setUniform('uStamB', fl.stamB); SH.spr.setUniform('uStamCol', col.stam);
      p.model(stamGeo);
      if (hooks && hooks.beforePetals) hooks.beforePetals();
      // petals: translucent, sorted back to front, two-sided, no depth writes
      p.blendMode(p.BLEND);
      p.shader(SH.petal); common(SH.petal);
      SH.petal.setUniform('uKind', 0);
      SH.petal.setUniform('uBaseCol', col.base); SH.petal.setUniform('uBodyCol', col.body); SH.petal.setUniform('uTipCol', col.tip);
      SH.petal.setUniform('uRimCol', col.rim); SH.petal.setUniform('uCoreCol', col.core); SH.petal.setUniform('uHeatCol', col.heat); SH.petal.setUniform('uStamCol', col.stam);
      SH.petal.setUniform('uBloom', fl.bloom); SH.petal.setUniform('uAwake', fl.awakeK); SH.petal.setUniform('uCore', fl.core);
      SH.petal.setUniform('uVein', fl.vein); SH.petal.setUniform('uAlpha', 0.58 + 0.14 * fl.bloom);
      SH.petal.setUniform('uIri', fl.iri); SH.petal.setUniform('uEmit', fl.emit);
      const order = fl.petals.slice().sort((a, b) => b.dist2 - a.dist2);
      p.push();
      flowerOrigin(fl);
      for (const P of order) {
        // each petal: p5's model matrix = flower origin · azimuth · its base · its rotation · its growth.
        // The petal shader multiplies its local geometry by this matrix (uModelMatrix).
        p.push();
        p.rotate(-P.phi, [0, 1, 0]);          // turn to the petal's place around the flower
        p.translate(P.r0, P.y0, 0);           // move to its base: the pivot it rotates about
        p.rotate(-P.hinge, [0, 0, 1]);        // OPENING: rotates away from the centre about its base, driven by the drag
        p.rotate(-P.sway, [0, 0, 1]);         // idle organic sway about the same base (p.sin breathing + p.noise)
        p.rotate(-P.lean, [0, 0, 1]);         // Round 02: the petals on her side lean toward her as she comes close
        p.scale(P.grow);                      // the petal grows a little as it unfolds (0.9 → 1.0), from its base
        SH.petal.setUniform('uA', [0, P.r0, P.L, P.W]);
        SH.petal.setUniform('uB', [P.pose.th, P.pose.k0, P.pose.cup, P.y0]);
        SH.petal.setUniform('uC', [P.pose.flutter, P.pose.twist, P.pose.k1, P.asym]);
        SH.petal.setUniform('uD', [P.pose.curl, 0.12, P.seed, P.pose.wrap]);
        SH.petal.setUniform('uSeed', P.seed);
        p.model(petalGeo);
        p.pop();
      }
      p.pop();
      if (hooks && hooks.afterPetals) hooks.afterPetals();
      // glow sprites: core glow, anthers, motes
      p.blendMode(p.ADD);
      p.shader(SH.spr); common(SH.spr);
      SH.spr.setUniform('uKind', 0); SH.spr.setUniform('uSpr', fl.spr); SH.spr.setUniform('uSprC', fl.sprC);
      p.model(sprGeo);
      gl.depthMask(true); p.blendMode(p.BLEND);
    }

    function draw(dt, o) {
      init();
      camera();
      flower.update(dt, view.eye);
      const t = flower.t, col = flower.colors;
      // is she behind the flower's centre (seen from the camera)?
      const herPos = o && o.CH && o.CH.main && o.CH.main.anchorPos;
      const herBehind = !!herPos && U.v3.len(U.v3.sub(herPos, view.eye)) > U.v3.len(U.v3.sub(flower.center, view.eye));

      sceneFB.begin();
      p.clear();
      // backdrop
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); p.blendMode(p.BLEND);
      p.shader(SH.back); SH.back.setUniform('uBloom', flower.bloom); SH.back.setUniform('uTime', t); p.model(quad);
      // Round 02 · Phase 4: the atrium's living walls behind the flower, once the transformation runs
      if (o && o.atrium) o.atrium({ V: view.V, P: view.P, eye: view.eye }, flower.center);
      gl.enable(gl.DEPTH_TEST);
      // THE ATRIUM (js/garden/atrium.js): the city outside, the room mirrored in the polished floor,
      // the floor, metal and stone, then the glass (all behind or round the flower; the flower last)
      const env = o && o.env, st = o && o.streams, vw = { V: view.V, P: view.P, eye: view.eye };
      if (env && env.built) {
        gl.depthMask(true); p.blendMode(p.BLEND);
        env.drawCity(vw, t);
        // the reflection: the same room seen through the floor's mirror (y = −1)
        const M = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -2, 0, 1];
        const vm = { V: U.mat4.mul(view.V, M), P: view.P, eye: [view.eye[0], -2 - view.eye[1], view.eye[2]] };
        env.drawSolid(vm, t, st);
        env.drawPlants(vm, t, st, true);               // opaque, depth-tested
        p.blendMode(p.ADD); gl.depthMask(false);
        drawFlowerBody(flower, vm);
        gl.enable(gl.DEPTH_TEST); gl.depthMask(true); p.blendMode(p.BLEND);
        env.drawFloor(vw, t, st);                       // translucent polish over the reflection
        env.drawSolid(vw, t, st);
        env.drawPlants(vw, t, st);                     // opaque: before the glass and the flower
        gl.depthMask(false); env.drawGlass(vw, t, st);
      }
      const common = (sh) => { sh.setUniform('uView', view.V); sh.setUniform('uProj', view.P); sh.setUniform('uCamPos', view.eye); sh.setUniform('uTime', t); sh.setUniform('uCenter', flower.center); sh.setUniform('uScale', flower.scale); };
      // ground light rings + click pulse
      p.blendMode(p.ADD); gl.depthMask(false);
      p.shader(SH.spr); common(SH.spr);
      SH.spr.setUniform('uKind', 2); SH.spr.setUniform('uDisc', 2.25); SH.spr.setUniform('uBloom', flower.bloom); SH.spr.setUniform('uAwake', flower.awakeK);
      SH.spr.setUniform('uPulseR', flower.pulseR); SH.spr.setUniform('uPulseA', flower.pulseA); SH.spr.setUniform('uRingCol', col.ring);
      p.model(discGeo);
      drawFlowerBody(flower, { V: view.V, P: view.P, eye: view.eye }, {
        beforePetals: () => { if (herBehind) { drawHer(o); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); } },
        afterPetals: () => { if (herPos && !herBehind) { drawHer(o); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); } }
      });
      // the atrium's pollen: the flower's glow-sprite program, with the atrium's 48 motes
      if (env && env.built) {
        p.blendMode(p.ADD); gl.depthMask(false);
        p.shader(SH.spr); common(SH.spr);
        SH.spr.setUniform('uKind', 0); SH.spr.setUniform('uSpr', env.spr); SH.spr.setUniform('uSprC', env.sprC);
        p.model(sprGeo);
      }
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

    /* glow sprites (the flower's sprite program) into the bound framebuffer: used by the building's
       transformation for the particles rising up the facade */
    function drawSprites(spr, sprC, vw, t) {
      init();
      p.shader(SH.spr);
      SH.spr.setUniform('uView', vw.V); SH.spr.setUniform('uProj', vw.P); SH.spr.setUniform('uCamPos', vw.eye); SH.spr.setUniform('uTime', t || 0);
      SH.spr.setUniform('uKind', 0); SH.spr.setUniform('uSpr', spr); SH.spr.setUniform('uSprC', sprC);
      p.model(sprGeo);
    }

    return { flower, cam, view, init, resize, draw, drawFlowerBody, drawSprites, down, move, up, wheel, hover, heartScreen, resetView, camera, project,
      get dragging() { return mode === 'flower'; } };
  }
};
