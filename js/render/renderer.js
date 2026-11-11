/* =====================================================================
   Renderer — passes, uniforms and post-processing.
   ---------------------------------------------------------------------
   Frame:
     sceneFB (HDR half-float)
       1. sky dome                      (no depth)
       2. FAR pass  near 1.5m … 7km     city, traffic, neon (additive)
       3. NEAR pass near 3cm … 600m     her rooftop, her, the fallen sign,
                                        rain — after clearing depth, only
                                        when the camera is on her roof.
          Splitting the depth range keeps both a 1 cm hair strand and a
          tower 5 km away crisp without z-fighting.
     bloom: bright-pass ¼ res → separable blur (× 2 levels on High)
     composite → canvas (tone map, grade, lens, glitch, grain, letterbox)
   Audio reactivity: AG.Reactivity.drive (bass/mid/treble, 0..1, already
   smoothed with p5.js) is passed to GLSL as uniforms: bass → sky city
   glow + bloom, mid → uAudioMid (windows), treble → uAudioTreble (window
   sparkles) + spark particles. All 0 when AUDIO REACTIVITY is OFF.
   ===================================================================== */
window.AG = window.AG || {};

AG.Renderer = (function () {
  const R = {};
  let p, gl;
  let SH = {};
  let quad, sky, rainGeo = [], world = null;
  let charQuad = null, partGeo = { trail: [], sparks: [], cloud: [], beacon: [], smoke: [], glint: [] }, netGeo = {}, smokeSrc = null;
  const PAL = new Float32Array(AG.CONFIG.interaction.colours.flat());
  let sceneFB, bA, bB, cA, cB;
  let tier = AG.CONFIG.quality.tiers[AG.CONFIG.quality.initial];
  let tierName = AG.CONFIG.quality.initial;
  let rainCount = 0;
  let floatOK = true;

  function makeShader(def) { return p.createShader(def.vert, def.frag); }

  R.init = function (inst) {
    p = inst; gl = p.drawingContext;
    SH.city = makeShader(AG.SHADERS.city);
    SH.neon = makeShader(AG.SHADERS.neon);
    SH.traffic = makeShader(AG.SHADERS.traffic);
    SH.rain = makeShader(AG.SHADERS.rain);
    SH.sky = makeShader(AG.SHADERS.sky);
    SH.character = makeShader(AG.SHADERS.character);
    SH.particles = makeShader(AG.SHADERS.particles);
    SH.netNode = makeShader(AG.SHADERS.networkNode);
    SH.netLink = makeShader(AG.SHADERS.networkLink);
    SH.bright = makeShader(AG.SHADERS.bright);
    SH.blur = makeShader(AG.SHADERS.blur);
    SH.comp = makeShader(AG.SHADERS.composite);
    SH.screens = makeShader(AG.SHADERS.screens);

    // fullscreen quad
    const Q = new AG.GeometryBuilder('quad');
    Q.quad([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, 1], [0, 0, 1, 1]);
    quad = Q.build(p)[0];
    // sky sphere
    const S = new AG.GeometryBuilder('sky');
    const la = 24, lo = 48;
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) {
      const P = (a, b) => { const th = (a / la) * Math.PI, ph = (b / lo) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
      S.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), [0, 1, 0]);
    }
    sky = S.build(p)[0];
    // character plane (corners ±1, uv 0..1)
    const CQ = new AG.GeometryBuilder('charquad');
    CQ.quad([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, 1], [0, 0, 1, 1]);
    charQuad = CQ.build(p)[0];
    buildParticles();
    R.resize();
  };

  function buildRain(n) {
    if (rainCount === n) return;
    rainGeo.forEach((g) => { if (p.freeGeometry) p.freeGeometry(g); });
    const rng = AG.U.rng(777);
    const B = new AG.GeometryBuilder('rain');
    for (let i = 0; i < n; i++) {
      const c = [rng.next(), rng.next(), rng.next()];
      const d = [rng.next(), rng.next(), rng.next(), 0];
      B._ensure(4);
      const a = B.rawVertex(c, [0, 1, 0], -1, 0, d), b = B.rawVertex(c, [0, 1, 0], 1, 0, d),
            e = B.rawVertex(c, [0, 1, 0], 1, 1, d), f = B.rawVertex(c, [0, 1, 0], -1, 1, d);
      B.rawTri(a, b, e); B.rawTri(a, e, f);
    }
    rainGeo = B.build(p);
    rainCount = n;
  }

  /* GPU particles: static seeds, animated entirely in the vertex shader */
  function particleMesh(name, n, seed) {
    const rng = AG.U.rng(seed);
    const B = new AG.GeometryBuilder(name);
    for (let i = 0; i < n; i++) {
      const c = [rng.next(), rng.next(), rng.next()], d = [rng.next(), rng.next(), rng.next(), rng.next()];
      B._ensure(4);
      const a = B.rawVertex(c, [0, 1, 0], -1, -1, d), b = B.rawVertex(c, [0, 1, 0], 1, -1, d),
            e = B.rawVertex(c, [0, 1, 0], 1, 1, d), f = B.rawVertex(c, [0, 1, 0], -1, 1, d);
      B.rawTri(a, b, e); B.rawTri(a, e, f);
    }
    return B.build(p);
  }
  /* the light trail: GPU sprites ORDERED along 3 thin lines (aPosition = [u along the line,
     line / 3, du]); each sprite is one ribbon segment */
  function strandMesh(name, n, strands) {
    const per = Math.max(8, Math.floor(n / strands)), B = new AG.GeometryBuilder(name);
    for (let k = 0; k < strands; k++) for (let j = 0; j < per; j++) {
      const c = [j / per, (k + 0.5) / strands, 1 / per], d = [0, 0, 0, 0];
      B._ensure(4);
      const a = B.rawVertex(c, [0, 1, 0], -1, -1, d), b = B.rawVertex(c, [0, 1, 0], 1, -1, d),
            e = B.rawVertex(c, [0, 1, 0], 1, 1, d), f = B.rawVertex(c, [0, 1, 0], -1, 1, d);
      B.rawTri(a, b, e); B.rawTri(a, e, f);
    }
    return B.build(p);
  }
  /* one sprite per LightParticle slot (aPosition.x = slot index) */
  function slotMesh(name, n) {
    const B = new AG.GeometryBuilder(name);
    for (let i = 0; i < n; i++) {
      const c = [i, 0, 0], d = [0, 0, 0, 0];
      B._ensure(4);
      const a = B.rawVertex(c, [0, 1, 0], -1, -1, d), b = B.rawVertex(c, [0, 1, 0], 1, -1, d),
            e = B.rawVertex(c, [0, 1, 0], 1, 1, d), f = B.rawVertex(c, [0, 1, 0], -1, 1, d);
      B.rawTri(a, b, e); B.rawTri(a, e, f);
    }
    return B.build(p);
  }
  function buildParticles() {
    const k = tier.particles || 1;
    Object.values(partGeo).forEach((list) => list.forEach((g) => { if (p.freeGeometry) p.freeGeometry(g); }));
    partGeo.trail = strandMesh('trail', Math.round(480 * k), 3);     // 3 lines (was 1100 scattered sprites)
    partGeo.glint = slotMesh('glint', AG.LightParticles.MAX);
    partGeo.sparks = particleMesh('sparks', Math.round(260 * k), 12);
    partGeo.cloud = particleMesh('cloud', Math.round(2600 * k), 13);
    partGeo.beacon = particleMesh('beacon', 1, 14);
    partGeo.smoke = particleMesh('smoke', Math.round(900 * k), 15);
    R._particleTier = k;
    if (!netGeo.node) {
      // network sprites: aPosition.x = node index, aPosition.y = segment
      const NB = new AG.GeometryBuilder('netNodes'), MAXN = 48;
      for (let i = 0; i < MAXN; i++) {
        NB._ensure(4);
        const c = [i, 0, 0], d = [0, 0, 0, 0];
        const a = NB.rawVertex(c, [0, 1, 0], -1, -1, d), b = NB.rawVertex(c, [0, 1, 0], 1, -1, d), e = NB.rawVertex(c, [0, 1, 0], 1, 1, d), f = NB.rawVertex(c, [0, 1, 0], -1, 1, d);
        NB.rawTri(a, b, e); NB.rawTri(a, e, f);
      }
      netGeo.node = NB.build(p);
      const LB = new AG.GeometryBuilder('netLinks');
      for (let i = 0; i < MAXN; i++) for (let sg = 0; sg < 8; sg++) {
        LB._ensure(4);
        const c = [i, sg, 0], d = [0, 0, 0, 0];
        const a = LB.rawVertex(c, [0, 1, 0], -1, -1, d), b = LB.rawVertex(c, [0, 1, 0], 1, -1, d), e = LB.rawVertex(c, [0, 1, 0], 1, 1, d), f = LB.rawVertex(c, [0, 1, 0], -1, 1, d);
        LB.rawTri(a, b, e); LB.rawTri(a, e, f);
      }
      netGeo.link = LB.build(p);
    }
  }

  function fb(opts) {
    const o = Object.assign({ antialias: false, textureFiltering: p.LINEAR, channels: p.RGBA }, opts);
    if (floatOK) {
      try { return p.createFramebuffer(Object.assign({ format: p.HALF_FLOAT }, o)); } catch (e) { floatOK = false; }
    }
    return p.createFramebuffer(o);
  }

  R.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, tier.maxDpr);
    p.pixelDensity(dpr);
    const w = Math.max(16, Math.floor(p.width * tier.renderScale)), h = Math.max(16, Math.floor(p.height * tier.renderScale));
    const bw = Math.max(8, Math.floor(p.width / 4)), bh = Math.max(8, Math.floor(p.height / 4));
    if (!sceneFB) {
      sceneFB = fb({ width: w, height: h, density: dpr, depth: true });
      bA = fb({ width: bw, height: bh, density: 1, depth: false });
      bB = fb({ width: bw, height: bh, density: 1, depth: false });
      cA = fb({ width: Math.ceil(bw / 2), height: Math.ceil(bh / 2), density: 1, depth: false });
      cB = fb({ width: Math.ceil(bw / 2), height: Math.ceil(bh / 2), density: 1, depth: false });
    } else {
      sceneFB.resize(w, h); sceneFB.pixelDensity(dpr);
      bA.resize(bw, bh); bB.resize(bw, bh);
      cA.resize(Math.ceil(bw / 2), Math.ceil(bh / 2)); cB.resize(Math.ceil(bw / 2), Math.ceil(bh / 2));
    }
    buildRain(tier.rain);
    if (charQuad && R._particleTier !== tier.particles) buildParticles();
  };

  R.setTier = function (name) {
    if (!AG.CONFIG.quality.tiers[name]) return;
    tierName = name; tier = AG.CONFIG.quality.tiers[name];
    R.resize();
    AG.U.emit('quality', name);
  };
  R.getTier = () => tierName;

  R.setWorld = function (w) {
    if (world) ['city', 'hero', 'neon', 'heroNeon', 'traffic'].forEach((k) => world[k].forEach((g) => { if (p.freeGeometry) p.freeGeometry(g); }));
    world = w; smokeSrc = null;
  };

  /* smoke columns: the broken towers she can see, chosen once */
  function smokeSources() {
    const Vt = AG.Interactions.vantage;
    if (smokeSrc || !Vt || !world) return smokeSrc;
    const cand = world.info.boxes.filter((b) => b.damaged && b.building).map((b) => {
      const dx = b.cx - Vt[0], dz = b.cz - Vt[2], d = Math.hypot(dx, dz), a = Math.abs(Math.atan2(dx, -dz));
      return { b, d, a };
    }).filter((o) => o.d > 120 && o.d < 1100 && o.a < 1.6).sort((x, y) => (x.d + x.a * 300) - (y.d + y.a * 300));
    const pick = [];
    for (const o of cand) { if (pick.length >= 8) break; if (pick.every((q) => Math.hypot(q.b.cx - o.b.cx, q.b.cz - o.b.cz) > 120)) pick.push(o); }
    smokeSrc = pick.map((o) => [o.b.cx, o.b.top - 8, o.b.cz]);
    while (smokeSrc.length < 8) smokeSrc.push([0, -999, 0]);
    return smokeSrc;
  }
  const smokeU = new Float32Array(32);
  function drawSmoke(F, S) {
    const src = smokeSources();
    if (!src || S.smoke < 0.01) return;
    src.forEach((q, i) => {
      const live = q[1] > -900 ? (1 - AG.Restoration.at(q[0], q[2])) : 0;
      smokeU[i * 4] = q[0]; smokeU[i * 4 + 1] = q[1]; smokeU[i * 4 + 2] = q[2]; smokeU[i * 4 + 3] = 0.11 * S.smoke * live;
    });
    const sh = SH.particles;
    p.shader(sh); common(sh, F); fog(sh, S);
    p.blendMode(p.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
    sh.setUniform('uKind', 6); sh.setUniform('uSmoke', smokeU); sh.setUniform('uSmokeCol', S.smokeCol || [0.06, 0.06, 0.08]);
    partGeo.smoke.forEach((g) => p.model(g));
  }

  /* the viewer's lights: fragile windows, nodes, threads */
  const FRP = new Float32Array(48 * 4), FRS = new Float32Array(48 * 4);   // stage-05 fragment sprites
  function drawNetwork(F, S) {
    const d = AG.Interactions.renderData(F.at);
    if (d.count || d.linkCount) {
      p.blendMode(p.ADD); gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
      if (d.linkCount) {
        const sh = SH.netLink; p.shader(sh); common(sh, F);
        sh.setUniform('uA', d.linkA); sh.setUniform('uB', d.linkB); sh.setUniform('uPal', PAL); sh.setUniform('uCount', d.linkCount);
        netGeo.link.forEach((g) => p.model(g));
      }
      if (d.count) {
        const sh = SH.netNode; p.shader(sh); common(sh, F); fog(sh, S);
        sh.setUniform('uP', d.nodes); sh.setUniform('uS', d.nodeS); sh.setUniform('uCount', d.count); sh.setUniform('uFogMul', 1);
        netGeo.node.forEach((g) => p.model(g));
      }
    }
    // stage 05: the revealed fragment (and collection bursts) with the same sprite program, drawn
    // WITHOUT depth test so the city's buildings never hide the goal the player is looking for
    if (AG.FSM.state === 'AFTERGLOW' && AG.Fragments && AG.Fragments.ready) {
      const fr = AG.Fragments.sprites(F.at).slice(0, 48);
      if (fr.length) {
        FRP.fill(0); FRS.fill(0);
        fr.forEach((o, i) => {
          FRP[i * 4] = o.pos[0]; FRP[i * 4 + 1] = o.pos[1]; FRP[i * 4 + 2] = o.pos[2]; FRP[i * 4 + 3] = o.kind;
          FRS[i * 4] = o.col[0]; FRS[i * 4 + 1] = o.col[1]; FRS[i * 4 + 2] = o.col[2]; FRS[i * 4 + 3] = o.lit;
        });
        p.blendMode(p.ADD); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        const sh = SH.netNode; p.shader(sh); common(sh, F); fog(sh, S);
        sh.setUniform('uP', FRP); sh.setUniform('uS', FRS); sh.setUniform('uCount', fr.length); sh.setUniform('uFogMul', 1);
        netGeo.node.forEach((g) => p.model(g));
        gl.enable(gl.DEPTH_TEST);
      }
    }
  }

  /* ---------- uniforms ---------- */
  function common(sh, F) {
    sh.setUniform('uView', F.view); sh.setUniform('uProj', F.proj);
    sh.setUniform('uCamPos', F.cam.pos); sh.setUniform('uTime', F.at !== undefined ? F.at : F.t);
  }
  function fog(sh, S) {
    sh.setUniform('uFogDensity', S.fogDensity); sh.setUniform('uFogFalloff', S.fogFalloff);
    sh.setUniform('uFogLow', S.fogLow); sh.setUniform('uFogHigh', S.fogHigh);
  }
  function lights(sh, F) { sh.setUniform('uLightPos', F.lightPos); sh.setUniform('uLightCol', F.lightCol); }

  function drawCity(F, S, geos, near) {
    const sh = SH.city;
    p.shader(sh);
    common(sh, F); fog(sh, S); lights(sh, F);
    sh.setUniform('uRebuild', S.rebuild); sh.setUniform('uInstability', S.instability);
    sh.setUniform('uGlitch', S.glitch); sh.setUniform('uTremor', S.tremor);
    sh.setUniform('uRestore', S.restore); sh.setUniform('uSeam', S.seam); sh.setUniform('uSurvivor', S.survivor);
    sh.setUniform('uTraffic', S.traffic); sh.setUniform('uRain', S.rain); sh.setUniform('uFlash', S.flash);
    sh.setUniform('uPulse', S.pulse); sh.setUniform('uEcho', S.echo); sh.setUniform('uLightTint', S.tint);
    sh.setUniform('uAmbSky', S.ambSky); sh.setUniform('uAmbGround', S.ambGround);
    sh.setUniform('uHero', F.hero); sh.setUniform('uNear', near ? 1 : 0);
    sh.setUniform('uCharPos', F.charPos || F.hero); sh.setUniform('uCharGlow', F.charGlow || 0);
    sh.setUniform('uEmitScale', (window.AG_DEBUG && window.AG_DEBUG.emit !== undefined) ? window.AG_DEBUG.emit : 1);
    sh.setUniform('uSpot', F.spots.spots); sh.setUniform('uSpotC', F.spots.cols);
    sh.setUniform('tField', F.spots.field); sh.setUniform('uFieldBox', F.spots.box);
    sh.setUniform('uDamage', S.damage); sh.setUniform('uEmber', S.ember);
    // audio → city: bass → building glow, mid → window pulse, accents/treble → sparkles (strengths per stage)
    const AR = AG.Reactivity, CC = AR.city || AG.CONFIG.reactivity.city;
    sh.setUniform('uAudioBass', AR.drive.bass * CC.bassGlow);
    sh.setUniform('uAudioMid', AR.drive.mid * CC.midPulse);
    sh.setUniform('uAudioTreble', Math.max(AR.drive.treble, (AR.accent || 0) * CC.sparkAccent)); sh.setUniform('uSparkNear', CC.sparkNear);
    geos.forEach((g) => p.model(g));
  }
  function drawNeon(F, S, geos) {
    const sh = SH.neon;
    p.shader(sh);
    common(sh, F); fog(sh, S);
    sh.setUniform('tAtlas', AG.SignAtlas.texture);
    sh.setUniform('uInstability', S.instability); sh.setUniform('uGlitch', S.glitch);
    sh.setUniform('uRestore', S.restore); sh.setUniform('uSurvivor', S.survivor); sh.setUniform('uPulse', S.pulse);
    sh.setUniform('uSeam', S.seam); sh.setUniform('uHoloPower', S.holoPower); sh.setUniform('uBeamPower', S.beamPower);
    sh.setUniform('uHeroA', S.heroA); sh.setUniform('uHeroB', S.heroB); sh.setUniform('uHeroALetters', S.heroALetters);
    sh.setUniform('uCharPos', F.charPos || F.hero); sh.setUniform('uCharGlow', F.charGlow || 0);
    sh.setUniform('uSmallLight', S.smallLight); sh.setUniform('uLightTint', S.tint); sh.setUniform('uBands', S.bands);
    sh.setUniform('tField', F.spots.field); sh.setUniform('uFieldBox', F.spots.box);
    geos.forEach((g) => p.model(g));
  }
  function drawTraffic(F, S) {
    const sh = SH.traffic;
    p.shader(sh); common(sh, F); fog(sh, S);
    sh.setUniform('uTraffic', S.traffic);
    world.traffic.forEach((g) => p.model(g));
  }
  function drawRain(F, S) {
    const sh = SH.rain;
    p.shader(sh); common(sh, F); lights(sh, F);
    sh.setUniform('uRain', S.rain); sh.setUniform('uWind', S.wind); sh.setUniform('uBox', 34.0); sh.setUniform('uVel', F.vel || [0, 0, 0]);
    sh.setUniform('uAmbSky', [S.ambSky[0] + S.flash * 0.4, S.ambSky[1] + S.flash * 0.45, S.ambSky[2] + S.flash * 0.6]);
    rainGeo.forEach((g) => p.model(g));
  }
  /* ---------- her: textured planes ---------- */
  function poseBasis(item, cam, scale) {
    const V = AG.U.v3;
    const P = AG.CharacterAssets.get(item.id);
    if (!P) return null;
    const meta = AG.CHARACTER_MANIFEST.poses[item.id];
    const subjW = meta.fit === 'width' ? meta.size : meta.size * P.aspect;
    const subjH = meta.fit === 'width' ? meta.size / P.aspect : meta.size;
    let right, up, n;
    const toCam = V.sub(cam.pos, item.anchorPos);
    if (item.mode === 'fixed') {
      // the plane faces `face` (0 = +z, PI = toward the city) and may turn ≤ maxTurn toward the lens
      const h = V.norm([toCam[0], 0, toCam[2]]);
      const lim = (meta.maxTurn || 22) * Math.PI / 180, face = meta.face || 0;
      let rel = Math.atan2(h[0], h[2]) - face;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const yaw = face + AG.U.clamp(rel, -lim, lim);
      n = [Math.sin(yaw), 0, Math.cos(yaw)]; up = [0, 1, 0]; right = V.norm(V.cross(up, n));
    } else if (item.mode === 'cyl') {
      n = V.norm([toCam[0], 0, toCam[2]]); up = [0, 1, 0]; right = V.norm(V.cross(up, n));
    } else if (item.mode === 'side' && item.flight) {
      right = item.flight.fwd; up = item.flight.up;
    } else {
      right = cam.right || [1, 0, 0]; up = cam.up || [0, 1, 0];
    }
    if (item.roll) {
      const c = Math.cos(item.roll), sn = Math.sin(item.roll);
      const r2 = V.add(V.scale(right, c), V.scale(up, sn)), u2 = V.sub(V.scale(up, c), V.scale(right, sn));
      right = r2; up = u2;
    }
    // breathing: vertical only, anchored at the ground; never a stretch of limbs
    const sy = 1 + (item.breath || 0) * scale;
    const H = subjH * sy, W = subjW;
    const margin = 0.22;
    let center = item.anchorPos.slice();
    if (meta.anchor === 'bottom') center = V.add(center, V.scale(up, H / 2));
    center = V.add(center, [0, item.bob || 0, 0]);
    if (item.shake) center = V.add(center, [(Math.random() - 0.5) * item.shake, (Math.random() - 0.5) * item.shake * 0.5, 0]);
    const bw = P.bbox.u1 - P.bbox.u0, bh = P.bbox.v1 - P.bbox.v0;
    const rect = [P.bbox.u0 - bw * margin, P.bbox.v0 - bh * margin, P.bbox.u1 + bw * margin, P.bbox.v1 + bh * margin];
    return { P, meta, center, right: V.scale(right, W * (1 + 2 * margin)), up: V.scale(up, H * (1 + 2 * margin)), rect, W, H, n };
  }

  function drawCharacter(F, S, cam, CH) {
    if (!CH || !world) return;
    const sh = SH.character;
    const R0 = S.mood !== undefined ? S.mood : S.restore;
    // scene light on her: cold and dim in the dark, warm as the city returns, the sign's magenta near it
    const lightMul = [
      AG.U.lerp(0.42, 1.0, R0) + S.heroA * 0.25 + S.dawn * 0.2,
      AG.U.lerp(0.46, 0.95, R0) + S.heroA * 0.04 + S.dawn * 0.1,
      AG.U.lerp(0.66, 0.98, R0) + S.heroA * 0.18
    ];
    const rim = [S.ambSky[0] * 0.6 + S.heroA * 0.5 + S.tint[0] * R0 * 0.25, S.ambSky[1] * 0.6 + S.tint[1] * R0 * 0.2, S.ambSky[2] * 0.7 + S.heroA * 0.3 + S.tint[2] * R0 * 0.2];
    p.shader(sh); common(sh, F); fog(sh, S);
    const first = CH.items.at(-1);
    // contact shadow + aura sprite first
    const groundPose = first && !CH.flying && first.anchorPos[1] < AG.CharacterDirector.spots.H0 + 1.2;
    if (groundPose) {
      const b = poseBasis(first, cam, 1);
      if (b) {
        p.blendMode(p.BLEND);
        sh.setUniform('uMode', 1); sh.setUniform('uAlpha', 1);
        const g = [first.anchorPos[0], AG.CharacterDirector.spots.H0 + 0.012, first.anchorPos[2]];
        const lying = first.id === 'A' || first.id === 'I';
        const ax = b.n ? [b.n[2], 0, -b.n[0]] : [1, 0, 0];
        sh.setUniform('uCenter', g); sh.setUniform('uRight', AG.U.v3.scale(ax, Math.max(b.W, 0.8) * (lying ? 1.08 : 1.15))); sh.setUniform('uUp', AG.U.v3.scale(b.n ? [b.n[0], 0, b.n[2]] : [0, 0, 1], lying ? 0.75 : 0.9));
        sh.setUniform('uAlpha', lying ? 1.25 : 1);
        p.model(charQuad);
      }
    }
    const auraCol = [1.0, 0.55, 0.92];
    CH.items.forEach((item) => {
      if (!(item.aura > 0.01)) return;
      const b = poseBasis(item, cam, 1); if (!b) return;
      p.blendMode(p.ADD);
      sh.setUniform('uMode', 2); sh.setUniform('uAlpha', 1 - (item.dissolve || 0) * 0.6); sh.setUniform('uAura', item.aura * (0.8 + 0.4 * CH.speedN));
      sh.setUniform('uAuraCol', auraCol);
      sh.setUniform('uCenter', AG.U.v3.add(b.center, AG.U.v3.scale(b.n || cam.dir || [0, 0, 1], -0.05)));
      const s = Math.max(b.W, b.H) * 1.6;
      sh.setUniform('uRight', AG.U.v3.scale(AG.U.v3.norm(b.right), s)); sh.setUniform('uUp', AG.U.v3.scale(AG.U.v3.norm(b.up), s));
      p.model(charQuad);
    });
    // the images
    p.blendMode(p.BLEND);
    CH.items.forEach((item) => {
      const b = poseBasis(item, cam, 1); if (!b) return;
      if (window.AG_DEBUG && window.AG_DEBUG.logChar) { window.__AG_CHAR = { id: item.id, center: b.center, right: b.right, up: b.up, rect: b.rect, cam: cam.pos, alpha: item.alpha, dis: item.dissolve, tex: [b.P.tex.width, b.P.tex.height], status: b.P.status }; }
      const far = AG.U.v3.len(AG.U.v3.sub(cam.pos, b.center));
      const projH = b.H / Math.max(0.1, far) * (p.height / (2 * Math.tan(cam.fov * Math.PI / 360)));
      const tex = projH < 260 ? b.P.small : b.P.tex;
      sh.setUniform('uMode', 0); sh.setUniform('tTex', tex);
      sh.setUniform('uUvRect', b.rect);
      sh.setUniform('uHalo', [0.035, 0.035 * (b.P.tex.width / b.P.tex.height)]);
      sh.setUniform('uAlpha', item.alpha); sh.setUniform('uDissolve', item.dissolve || 0);
      sh.setUniform('uAura', item.aura * 0.9); sh.setUniform('uAuraCol', auraCol);
      sh.setUniform('uFlash', CH.flash * 0.9);
      sh.setUniform('uEmissiveKeep', b.P.fallback ? 0.0 : 0.85);
      sh.setUniform('uLightMul', lightMul); sh.setUniform('uRimCol', rim);
      sh.setUniform('uCenter', b.center); sh.setUniform('uRight', b.right); sh.setUniform('uUp', b.up);
      p.model(charQuad);
    });
  }

  function drawParticles(F, S, CH, t) {
    const sh = SH.particles;
    p.blendMode(p.ADD);
    p.shader(sh); common(sh, F); fog(sh, S);
    const fl = AG.Flight;
    if (S.cloudGlow > 0.01 && fl.ready) {
      sh.setUniform('uKind', 2); sh.setUniform('uAmount', S.cloudGlow);
      const cl = fl.cloud();
      sh.setUniform('uCloudC', cl.center); sh.setUniform('uCloudR', cl.radii);
      partGeo.cloud.forEach((g) => p.model(g));
    }
    // the pulse: one window still alive, until the viewer finds it
    const bz = AG.Interactions.beacon;
    if (bz && S.beacon > 0.01) {
      sh.setUniform('uBeaconPos', bz.pos); sh.setUniform('uBeaconRight', bz.right); sh.setUniform('uBeaconUp', bz.up);
      sh.setUniform('uBeacon', S.beacon); sh.setUniform('uBeaconHint', S.beaconHint);
      gl.enable(gl.DEPTH_TEST);
      for (const k of [3, 4, 5]) { if (k === 5 && S.beaconHint < 3) continue; sh.setUniform('uKind', k); partGeo.beacon.forEach((g) => p.model(g)); }
    }
    if (!CH) return;
    if (CH.trail > 0.01 && fl.ready) {
      sh.setUniform('uKind', 0); sh.setUniform('uAmount', CH.trail); sh.setUniform('uSpeed', CH.speedN);
      sh.setUniform('uTrail', AG.CharacterDirector.trailPoints(t, 24));
      // the streamers lean to her left by default and swing out of her turns
      sh.setUniform('uSweep', AG.U.clamp(-0.55 - (fl.yawRate || 0) * 0.9, -1.4, 1.0));
      partGeo.trail.forEach((g) => p.model(g));
    }
    // the glints shed by the trail (p5.js LightParticle objects, CPU) — one draw call
    const LP = AG.LightParticles;
    if (LP.list.length) {
      LP.pack();
      sh.setUniform('uKind', 7); sh.setUniform('uGlint', LP.posBuf); sh.setUniform('uGlintC', LP.colBuf);
      partGeo.glint.forEach((g) => p.model(g));
    }
    if (CH.sparkle > 0.01) {
      const m = CH.main, b = m.anchorPos;
      const c = AG.CHARACTER_MANIFEST.poses[m.id].anchor === 'bottom' ? [b[0], b[1] + 0.9, b[2]] : b;
      sh.setUniform('uKind', 1); sh.setUniform('uAmount', CH.sparkle * (1 + 1.5 * AG.Reactivity.drive.treble)); sh.setUniform('uCharPos', c);
      partGeo.sparks.forEach((g) => p.model(g));
    }
  }

  function drawParticlesNear(F, S, CH, t) {
    const sh = SH.particles;
    p.blendMode(p.ADD); p.shader(sh); common(sh, F); fog(sh, S);
    if (CH.sparkle > 0.01) {
      const m = CH.main, b = m.anchorPos;
      const c = AG.CHARACTER_MANIFEST.poses[m.id].anchor === 'bottom' ? [b[0], b[1] + 0.9, b[2]] : b;
      sh.setUniform('uKind', 1); sh.setUniform('uAmount', CH.sparkle * (1 + 1.5 * AG.Reactivity.drive.treble)); sh.setUniform('uCharPos', c);
      partGeo.sparks.forEach((g) => p.model(g));
    }
  }

  /* the six word screens at her broken parapet (stages 04–05, js/fx/screenWords.js): drawn
     right after her rooftop, in the same pass, so they are depth-tested against it */
  let swGeo = null, swWorld = null, swMip = false;
  function drawScreenWords(F, S) {
    const SW = AG.ScreenWords;
    if (!SW || !SW.ready || !world || !SW.lit.some((v) => v > 0.002)) return;
    if (swWorld !== world) {
      if (swGeo && p.freeGeometry) swGeo.forEach((g) => p.freeGeometry(g));
      swGeo = SW.buildMesh(world.info); swWorld = world;
    }
    if (!swGeo) return;
    const sh = SH.screens;
    additive();
    p.shader(sh); common(sh, F); fog(sh, S);
    sh.setUniform('uRebuild', S.rebuild); sh.setUniform('uTremor', S.tremor);
    sh.setUniform('tField', F.spots.field); sh.setUniform('uFieldBox', F.spots.box);
    sh.setUniform('tWords', SW.image); sh.setUniform('uLit', SW.lit); sh.setUniform('uLine', SW.line);
    sh.setUniform('uStrength', 1);
    swGeo.forEach((g) => p.model(g));
    // smooth lettering at a distance: mipmaps for the word texture, once
    if (!swMip) {
      const tex = p._renderer.getTexture ? p._renderer.getTexture(SW.image) : null;
      if (tex && tex.glTex) {
        gl.bindTexture(gl.TEXTURE_2D, tex.glTex); gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        swMip = true;
      }
    }
  }

  /* Round 02: the doorway of light on its building and the beacon above it (js/garden/garden.js;
     nothing is drawn in Round 01). Additive; the doorway is depth-tested, the beacon is not. */
  function drawPortal(F) {
    const P = AG.Garden && AG.Garden.portalDraw();
    if (!P || !AG.SHADERS.portal) return;
    if (!SH.portal) SH.portal = makeShader(AG.SHADERS.portal);
    const sh = SH.portal;
    p.blendMode(p.ADD); gl.depthMask(false); p.shader(sh); common(sh, F);
    sh.setUniform('uOpen', P.open); sh.setUniform('uNear', P.near); sh.setUniform('uN', P.n);
    gl.enable(gl.DEPTH_TEST);
    sh.setUniform('uKind', 0); sh.setUniform('uC', P.c); sh.setUniform('uSize', [P.w / 2, P.h / 2]);
    p.model(quad);
    gl.disable(gl.DEPTH_TEST);
    sh.setUniform('uKind', 1); sh.setUniform('uC', P.beacon); sh.setUniform('uSize', [9, 320]);
    p.model(quad);
    gl.enable(gl.DEPTH_TEST);
  }

  function opaque() { p.blendMode(p.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); }
  function additive() { p.blendMode(p.ADD); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); }

  /* ---------- frame ---------- */
  R.render = function (S, cam, t, rt, CH, at) {
    if (!world) return;
    const D = window.AG_DEBUG || {};
    if (D.noRender) return;
    const hero = world.info.hero;
    const aspect = p.width / p.height;
    const F = { t, at: at !== undefined ? at : t, cam, hero: [hero.fig.x, hero.fig.y, hero.fig.z] };
    F.spots = AG.Restoration.uniforms(F.at);
    if (CH && CH.flash > 0.02) S = Object.assign({}, S, { exposure: S.exposure + CH.flash * 0.6 });
    // near-field lights: fallen sign, door, the city's returning warmth, lightning
    const sA = S.heroA * 1.7, sB = S.heroB * 1.6;
    F.lightPos = [hero.sign.x, hero.sign.y, hero.sign.z, hero.door.x, hero.door.y, hero.door.z,
      hero.fig.x - 3, hero.H0 + 7, hero.fig.z - 22, hero.fig.x + 6, hero.H0 + 16, hero.fig.z + 4];
    F.lightCol = [1.0 * sA + 1.0 * sB, 0.12 * sA + 0.62 * sB, 0.5 * sA + 0.32 * sB,
      1.0 * S.smallLight * 0.6, 0.72 * S.smallLight * 0.6, 0.45 * S.smallLight * 0.6,
      S.tint[0] * S.restore * 12, S.tint[1] * S.restore * 12, S.tint[2] * S.restore * 12,
      S.flash * 60, S.flash * 70, S.flash * 95];

    sceneFB.begin();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    p.noStroke();

    const far = AG.Camera.matrices(aspect, cam.split ? 1.5 : cam.flight ? AG.U.clamp(cam.distHero * 0.2, 0.25, 1.5) : Math.max(0.05, Math.min(1.5, cam.distHero * 0.01)), 7000);
    // where she is, and how much light she carries (windows and signs react as she passes)
    F.vel = CH && CH.flying && cam.flight ? CH.vel : [0, 0, 0];
    F.charPos = CH && CH.main && CH.main.anchorPos ? CH.main.anchorPos : F.hero;
    F.charGlow = CH ? (CH.flying ? 0.35 + 0.65 * CH.speedN : CH.main.id === 'E' || CH.main.id === 'D' ? 0.35 : 0) : 0;
    F.view = far.view; F.proj = far.proj;

    // 1. sky
    p.blendMode(p.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    p.shader(SH.sky); common(SH.sky, F);
    // bass → the glow the city throws on the sky (identical to the original when the drive is 0)
    // strengths come from AG.CONFIG.reactivity.sky (per stage, eased in reactivity.js)
    const bass = AG.Reactivity.drive.bass, SK = AG.Reactivity.sky || AG.CONFIG.reactivity.sky, gk = 1 + SK.gain * bass;
    SH.sky.setUniform('uZenith', S.zenith); SH.sky.setUniform('uHorizon', S.horizon);
    SH.sky.setUniform('uCityGlow', [S.cityGlow[0] * gk + SK.add[0] * bass, S.cityGlow[1] * gk + SK.add[1] * bass, S.cityGlow[2] * gk + SK.add[2] * bass]);
    SH.sky.setUniform('uFlash', S.flash); SH.sky.setUniform('uFlashX', S.flashX); SH.sky.setUniform('uDawn', S.dawn); SH.sky.setUniform('uCloud', S.cloud); SH.sky.setUniform('uSun', S.sun);
    p.model(sky);

    // 2. far pass
    opaque();
    if (!D.noCity) drawCity(F, S, world.city, false);
    if (!cam.split) { drawCity(F, S, world.hero, true); drawScreenWords(F, S); }
    additive();
    if (!D.noTraffic) drawTraffic(F, S);
    if (!D.noNeon) drawNeon(F, S, world.neon);
    drawSmoke(F, S);
    drawNetwork(F, S);
    drawPortal(F);
    additive();
    if (!cam.split) {
      drawNeon(F, S, world.heroNeon);
      gl.depthMask(false); drawCharacter(F, S, cam, CH);
      additive(); drawParticles(F, S, CH, t);
      if (!D.noRain) drawRain(F, S);
    } else { additive(); drawParticles(F, S, null, t); }

    // 3. near pass
    if (cam.split) {
      gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      const nr = AG.Camera.matrices(aspect, 0.03, 600);
      F.view = nr.view; F.proj = nr.proj;
      opaque();
      drawCity(F, S, world.hero, true);
      drawScreenWords(F, S);
      additive();
      drawNeon(F, S, world.heroNeon);
      gl.depthMask(false); drawCharacter(F, S, cam, CH);
      additive();
      if (CH) { const c2 = Object.assign({}, CH); drawParticlesNear(F, S, c2, t); }
      if (!D.noRain) drawRain(F, S);
    }
    gl.depthMask(true);
    p.blendMode(p.BLEND);
    sceneFB.end();
    if (D.read) { const st = (fb) => { fb.loadPixels(); const px = fb.pixels; let mx = 0, sum = 0, nan = 0; for (let i = 0; i < px.length; i += 4) { const v = Math.max(px[i], px[i + 1], px[i + 2]); if (!isFinite(v)) nan++; else { mx = Math.max(mx, v); sum += v; } } return { max: mx, avg: sum / (px.length / 4), nan }; }; window.__AG_READ = { scene: st(sceneFB) }; D.read = 0; }

    // ---- bloom ----
    gl.disable(gl.DEPTH_TEST);
    const pass = (target, sh, uni) => {
      target.begin(); gl.disable(gl.DEPTH_TEST);
      p.clear(); p.shader(sh); Object.keys(uni).forEach((k) => sh.setUniform(k, uni[k])); p.model(quad);
      target.end();
    };
    pass(bA, SH.bright, { tSrc: sceneFB, uTexel: [1 / sceneFB.width, 1 / sceneFB.height], uThreshold: 1.0 });
    pass(bB, SH.blur, { tSrc: bA, uDir: [1 / bA.width, 0] });
    pass(bA, SH.blur, { tSrc: bB, uDir: [0, 1 / bA.height] });
    const two = tier.bloomPasses > 1;
    if (two) {
      pass(cA, SH.blur, { tSrc: bA, uDir: [1.5 / bA.width, 0] });
      pass(cB, SH.blur, { tSrc: cA, uDir: [0, 2 / cA.height] });
      pass(cA, SH.blur, { tSrc: cB, uDir: [2 / cA.width, 0] });
      pass(cB, SH.blur, { tSrc: cA, uDir: [0, 2 / cA.height] });
    } else {
      pass(cB, SH.blur, { tSrc: bA, uDir: [0, 2 / bA.height] });
    }

    // ---- composite ----
    p.clear();
    gl.disable(gl.DEPTH_TEST);
    const c = SH.comp;
    p.shader(c);
    c.setUniform('tScene', sceneFB); c.setUniform('tBloom', bA); c.setUniform('tBloom2', cB);
    c.setUniform('uRes', [p.width, p.height]); c.setUniform('uTime', rt);
    // bass → city glow: the bloom grows with the music (0.6 exactly when the drive is 0)
    c.setUniform('uBloom', D.noBloom ? 0 : 0.6 * (1 + (AG.Reactivity.sky || AG.CONFIG.reactivity.sky).bloom * AG.Reactivity.drive.bass)); c.setUniform('uExposure', D.exp !== undefined ? D.exp : S.exposure);
    c.setUniform('uGlitch', S.glitch); c.setUniform('uFade', S.fade);
    c.setUniform('uLetterbox', R.letterbox); c.setUniform('uGrain', 0.035); c.setUniform('uVignette', 0.55);
    c.setUniform('uLens', tier.lens ? (cam.close || 0) * S.rain * 0.35 : 0);
    c.setUniform('uRainScreen', S.rain); c.setUniform('uFlash', S.flash);
    c.setUniform('uSat', S.sat); c.setUniform('uAberr', 0.45); c.setUniform('uLift', S.lift); c.setUniform('uGain', S.gain);
    c.setUniform('uFreeze', R.freeze);
    c.setUniform('uSpeed', R.speed || 0); c.setUniform('uWhite', R.white || 0);
    p.model(quad);
    gl.enable(gl.DEPTH_TEST);
  };
  /* Round 02: draw HER (the same pose images, CharacterDirector items and character shader as in
     the city) into another scene's framebuffer, seen by that scene's camera — the Memory Garden
     (js/garden/gardenScene.js). cam: { pos, right, up, dir, fov, V, P }. The light is the garden's:
     no fog, a lavender ambient rim and a warm glow from the flower (light.warm 0..1). */
  R.drawCharacterWith = function (cam, CH, t, light) {
    if (!CH || !world || !SH.character) return;
    const w = (light && light.warm) || 0;
    const S = { mood: 1, restore: 1, heroA: 0.15 + 0.35 * w, dawn: 0.25 * w, ambSky: [0.5, 0.4, 0.72], tint: [1.0, 0.62 + 0.1 * w, 0.8],
      fogDensity: 0, fogFalloff: 0.002, fogLow: [0, 0, 0], fogHigh: [0, 0, 0] };
    const F = { t, at: t, view: cam.V, proj: cam.P, cam };
    // her aura sprite at a third: against the garden's plain backdrop its square edge would show
    const items = CH.items.map((it) => Object.assign({}, it, { aura: (it.aura || 0) * 0.33 }));
    gl.depthMask(false);
    drawCharacter(F, S, cam, Object.assign({}, CH, { items }));
    p.blendMode(p.BLEND);
  };
  R.letterbox = 1; R.freeze = 0;
  R._debug = () => ({ sceneFB, bA, cB });

  return R;
})();
