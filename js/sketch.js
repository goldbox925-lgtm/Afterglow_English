/* =====================================================================
   AFTERGLOW — A City Made of Feelings
   sketch.js — p5.js (instance mode, WEBGL) glue: boot, frame loop,
   controls. The interesting work lives in the modules:
     core/      fsm (5 emotional states), restoration (persistent field),
                interactions (01–04), flight (05), story (atmosphere),
                camera (director)
     city/      geometry builder, sign atlas, procedural city,
                Building class (p.random / p.noise, seeded per city)
     character/ image-based character: assets, director (poses)
     render/    passes & post-processing      shaders/  GLSL
     audio/     engine + ambience, adaptive generative score,
                reactivity (soundtrack → city glow / windows / sparkles)
   ===================================================================== */
(function () {
  const U = AG.U, C = AG.CONFIG;
  let world = null, seed = 0;
  let rt = 0, entered = false, generating = false;
  let qualityMode = 'auto';
  const perf = { acc: 0, frames: 0, warm: 0, good: 0 };

  function seedFromURL() {
    const m = /seed=(\d+)/.exec(location.hash);
    return m ? parseInt(m[1], 10) : Math.floor(Math.random() * 1e6);
  }

  /* the short scripted beat that opens each state (control returns after it) */
  const CINEMATIC = { NUMBNESS: ['intro', 6.4], FRACTURE: ['fracture', 3.2], RECLAIMING_SELF: ['stand', 8.4], AFTERGLOW: ['liftoff', 4.8] };

  new p5((p) => {
    function generate(newSeed) {
      generating = true;
      seed = newSeed;
      try { history.replaceState(null, '', '#seed=' + seed); } catch (e) {}
      AG.UI.setSeed(seed);
      const t0 = performance.now();
      AG.SignAtlas.build(p);
      const w = AG.CityGenerator.generate(seed, p);
      AG.Renderer.setWorld(w);
      world = w;
      AG.CharacterDirector.setInfo(w.info);
      AG.Flight.build(w.info, p);
      AG.Fragments.build(w.info, p);          // stage 05 collectibles (deterministic from the city)
      AG.LightParticles.clear();
      const vantage = U.v3.add(AG.CharacterDirector.spots.lie, [3, 10, 27]);
      AG.Restoration.init(p, w.info, vantage);
      AG.Interactions.build(w.info, AG.Restoration);
      AG.Camera.setInfo(w.info);
      AG.Garden.setWorld(w.info);              // Round 02: the doorway is chosen in this city when it opens
      perf.warm = 0;
      generating = false;
      console.info('[AFTERGLOW] city seed', seed, JSON.stringify(w.info.stats), 'nodes', AG.Interactions.nodes.length, 'progress buildings', AG.Restoration.buildingsTotal, 'total', Math.round(performance.now() - t0), 'ms');
      window.__AG_READY = true;
    }

    /* everything back to the beginning of the story (the city itself is kept) */
    function resetStory() {
      AG.Restoration.reset();
      AG.Interactions.resetState();
      AG.Flight.reset();
      AG.CharacterDirector.reset();
      AG.Camera.reset();
      AG.Story.reset();
    }

    p.setup = function () {
      p.setAttributes({ antialias: false, alpha: false, depth: true, version: 2 });
      p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
      p.setAttributes({ antialias: false, alpha: false, depth: true, version: 2 });
      p.frameRate(60);
      if (p.webglVersion !== 'webgl2') {
        AG.UI.setLoading('This experience needs WebGL 2 (current Chrome, Edge, Firefox or Safari 15+).', false);
        p.noLoop(); return;
      }
      AG.Renderer.init(p);
      AG.Input.bind(p.canvas);
      AG.UI.init(handlers);
      AG.LightParticles.init(p);
      AG.ScreenWords.init(p);
      AG.Story.bindEvents();
      AG.Garden.init(p);
      AG.UI.setLoading('Generating the city…', false);
      AG.CharacterAssets.load(p, 'A');
      setTimeout(() => {
        try {
          generate(seedFromURL());
          AG.Camera.snapNext();
          const ready = () => AG.UI.setLoading('Headphones recommended · best in Chrome', true);
          if (AG.CharacterAssets.firstReady) ready();
          else { AG.UI.setLoading('Loading her…', false); AG.U.on('characterFirstReady', ready); setTimeout(ready, 8000); }
        } catch (e) {
          console.error(e);
          AG.UI.setLoading('Something went wrong while building the city: ' + e.message, false);
        }
      }, 60);
      wireEvents();
    };

    p.windowResized = function () {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      AG.Renderer.resize();
      AG.Garden.resize();
      perf.warm = 0;
    };

    /* Round 02's input: p5's own mouse callbacks (p5 also routes touches here) forward to the
       Memory Garden while it is on screen. Round 01 keeps AG.Input (unchanged); these callbacks
       do nothing outside the garden, so there is one input path per round and no duplicates. */
    const onCanvas = (e) => !e || !e.target || e.target === p.canvas;
    p.mousePressed = function (e) {
      if (!AG.Garden.wantsPointer() || !onCanvas(e)) return;      // (buttons in the garden UI stay clickable)
      AG.Garden.pointerDown(p.mouseX, p.mouseY);
      return false;
    };
    p.mouseDragged = function () { if (AG.Garden.wantsPointer()) { AG.Garden.pointerMove(p.mouseX, p.mouseY); return false; } };
    p.mouseReleased = function () { AG.Garden.pointerUp(); };
    p.mouseMoved = function () { AG.Garden.hover(p.mouseX, p.mouseY); };
    p.mouseWheel = function (e) { if (AG.Garden.wantsPointer()) { AG.Garden.wheel(e.delta); return false; } };

    p.draw = function () {
      const dt = Math.min(p.deltaTime / 1000, 0.1) || 0.016;
      rt += dt;
      if (!world || generating) { p.background(0); return; }
      const F = AG.FSM;
      const ctx = AG.Audio.ctx;
      const input = AG.Input.update(dt, ctx ? ctx.sampleRate : 48000);
      F.update(dt);
      const playing = F.playing, at = F.animTime;
      // behind the title screen: a slowly drifting establishing view of the broken city
      if (!entered) { F.animTime += dt; }
      if (entered && playing) AG.Interactions.update(dt, at, input, AG.Camera.state);
      else { input.click = null; input.enter = false; input.pressed = null; input.released = null; }
      AG.Restoration.update(dt, F.animTime);
      // every building updates itself each frame (a loop over the array of Building objects)
      let litBuildings = 0;
      for (const b of world.info.buildings) { b.update(AG.Restoration); if (b.isLit()) litBuildings++; }
      if (entered && playing && F.state === 'AFTERGLOW' && !F.cinematic) {
        if (AG.Garden.isActive()) AG.Garden.update(dt, input);     // Round 02: to the doorway, through it, inside
        else if (AG.Flight.finale) AG.Flight.drift(dt, input); else AG.Flight.update(dt, input, true);
      }
      // audio reactivity: Web Audio analyser bands → p5.js mapping & smoothing.
      // OFF → null, the story's own "no music" path (the original non-reactive look).
      const music = AG.Reactivity.update(p, playing ? AG.Audio.bands() : null, playing ? AG.Audio.rawBands() : null);
      const S = AG.Story.compute(dt, playing, input, music);
      if (!entered) { S.fade = Math.max(S.fade, 0.35); }
      const CH = AG.CharacterDirector.update(F.animTime, S);
      // the trail's glints (p5.js LightParticle objects): advanced only while the story plays
      if (entered && playing) AG.LightParticles.update(dt, F.animTime, CH);
      // the six word screens (stages 04–05): lit by stage 04 connections, all six in 05
      AG.ScreenWords.update(entered && playing ? dt : 0);
      const cam = AG.Camera.update(F.animTime, dt, rt, input);
      AG.Audio.update(S, F.animTime, dt, playing);
      AG.Renderer.freeze = U.damp(AG.Renderer.freeze, entered && !playing ? 1 : 0, 4, dt);
      AG.Renderer.letterbox = U.damp(AG.Renderer.letterbox, AG.Camera.mode === 'film' && (F.cinematic || F.state === 'AFTERGLOW') ? 1 : 0.35, 2, dt);
      // speed feel + the luminous veil inside the cloud
      AG.Renderer.speed = U.damp(AG.Renderer.speed || 0, cam.flight && CH ? CH.speedN * 0.9 : 0, 3, dt);
      let white = 0;
      if (AG.Flight.ready && S.cloudGlow > 0) {
        const c = AG.Flight.cloud(), d = U.v3.sub(cam.pos, c.center);
        const q = Math.hypot(d[0] / c.radii[0], d[1] / c.radii[1], d[2] / c.radii[2]);
        white = U.smooth(1.05, 0.55, q) * 0.3 * S.cloudGlow;      // a thin veil: she stays visible inside the cloud
      }
      AG.Renderer.white = U.damp(AG.Renderer.white || 0, white, 4, dt);
      AG.R2.update(dt);                       // Round 02's shared state and phase (js/garden/round2.js)
      // Round 02: inside the doorway the Memory Garden replaces the city image
      if (AG.Garden.drawsScene()) AG.Garden.draw(playing ? dt : 0);
      else AG.Renderer.render(S, cam, F.animTime, rt, CH, F.animTime);
      AG.UI.update(dt, S, input);
      adapt(dt);
      const IA = AG.Interactions, R = AG.Restoration;
      window.__AG_STATE = { state: F.state, mode: F.mode, cinematic: F.cinematic ? F.cinematic.name : null, fps: p.frameRate(), tier: AG.Renderer.getTier(),
        progress: +R.progress.toFixed(3), districts: R.districts, lit: R.buildingsLit, litBuildings, mood: +S.mood.toFixed(3), rain: +S.rain.toFixed(2), damage: +S.damage.toFixed(2),
        stabilised: IA.stabilised, connections: IA.connections, nodes: IA.nodes.length, hint: IA.hintLevel,
        split: cam.split, pose: CH ? CH.items.map((i) => i.id).join('>') : '', flight: cam.flight,
        alt: AG.Flight.ready ? Math.round(AG.Flight.pos[1]) : 0, asc: +AG.Flight.asc.toFixed(3), finale: AG.Flight.finale, r2: AG.R2.phase };
    };

    function adapt(dt) {
      perf.warm += dt;
      if (qualityMode !== 'auto' || perf.warm < 4) { perf.acc = perf.frames = 0; return; }
      perf.acc += dt; perf.frames++;
      if (perf.acc < 2.5) return;
      const fps = perf.frames / perf.acc;
      perf.acc = perf.frames = 0;
      const order = C.quality.order, cur = order.indexOf(AG.Renderer.getTier());
      if (fps < C.quality.targetFps - 8 && cur > 0) { AG.Renderer.setTier(order[cur - 1]); perf.warm = 0; perf.good = 0; }
      else if (fps > 58) { perf.good++; if (perf.good >= 3 && cur < order.indexOf('balanced')) { AG.Renderer.setTier(order[cur + 1]); perf.warm = 0; perf.good = 0; } }
      else perf.good = 0;
    }

    /* ---------------- controls ---------------- */
    const handlers = {
      toggle() { if (!entered) return; AG.FSM.toggle(); },
      replay() { if (!entered) return; AG.Camera.snapNext(); AG.FSM.replay(); },
      jump(id) { if (!entered) return; AG.Garden.reset(); AG.FSM.jumpTo(id); AG.Camera.snapNext(); },
      /* testing / presentation: straight to the start of Round 02 (the flight to the doorway).
         Round 01's stages complete with default choices, as the other jumps do; the lift-off
         cinematic and the end card are skipped. The story path (end card → Enter the Memory
         Garden) is unchanged. */
      jumpR2() {
        if (!entered) return;
        AG.Garden.reset(); AG.R2.reset();
        AG.FSM.jumpTo('AFTERGLOW');
        AG.FSM.cinematic = null;
        if (!AG.FSM.playing) AG.FSM.play();
        AG.Garden.start();
        AG.UI.showCard(C.states[C.states.length - 1], true);   // the stage label only, no "05" title card
        AG.Camera.snapNext();
      },
      reactivity() { AG.Reactivity.setEnabled(!AG.Reactivity.enabled); },
      regen() {
        if (generating) return;
        AG.UI.toast('Building a new city…');
        setTimeout(() => {
          const st = AG.FSM.state;
          generate(Math.floor(Math.random() * 1e6));
          if (entered) { AG.FSM.replay(); if (st !== 'NUMBNESS') AG.FSM.jumpTo(st); }
          AG.Camera.snapNext(); AG.UI.toast('New city · seed ' + seed);
        }, 50);
      },
      fullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => AG.UI.toast('Fullscreen was blocked by the browser'));
      },
      camera(m) { AG.Camera.setMode(m); },
      quality(q) { qualityMode = q; if (q !== 'auto') AG.Renderer.setTier(q); perf.warm = 0; }
    };
    AG.handlers = handlers;

    async function enter() {
      if (entered || !world) return;
      entered = true;
      AG.UI.hideIntro();
      try { await AG.Audio.init(); } catch (e) { console.warn('audio init failed', e); AG.UI.toast('Audio could not start — the experience continues silently'); }
      AG.FSM.animTime = 0;
      AG.Camera.snapNext();
      AG.FSM.replay();                        // NUMBNESS + the opening beat
    }

    function wireEvents() {
      document.getElementById('btnEnter').addEventListener('click', enter);
      U.on('playstate', (pl) => { if (pl) AG.Audio.play(); else AG.Audio.pause(); });
      U.on('reset', () => { resetStory(); AG.Audio.restart && AG.Audio.restart(); });
      U.on('autoComplete', (e) => AG.Interactions.autoComplete(e.state));
      // every state opens with a short directed beat, then hands control to the viewer
      U.on('state', (e) => {
        const c = CINEMATIC[e.state];
        if (e.state === 'AFTERGLOW' && e.prev !== 'AFTERGLOW') AG.Flight.reset();
        if (c && !(e.why === 'jump' && e.state === 'FRACTURE')) AG.FSM.startCinematic(c[0], c[1]);
        AG.Camera.snapNext();
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && AG.FSM.playing) AG.FSM.pause(); });
      // arrow keys: look around (01–04) · steer / descend / ASCEND (05). Never scroll the page.
      const ARROW = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', A: 'left', d: 'right', D: 'right', s: 'down', S: 'down' };
      const setKey = (k, v) => { const n = ARROW[k]; if (!n) return false; AG.Flight.press(n, v); return true; };
      window.addEventListener('keyup', (e) => { if (setKey(e.key, false)) e.preventDefault(); });
      window.addEventListener('blur', () => { AG.Flight.keys = {}; });
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault();
        if (!entered) { if (e.key === 'Enter' || e.key === ' ') enter(); return; }
        const k = e.key;
        if (setKey(k, true)) return;
        if (k === ' ') handlers.toggle();
        else if (k === 'r' || k === 'R') handlers.replay();
        else if (k === 'b' || k === 'B') AG.Reactivity.toggleDebug();   // temporary audio debug view
        else if (k === 'c' || k === 'C') AG.Camera.cycle();
        else if (k === 'n' || k === 'N') handlers.regen();
        else if (k === 'f' || k === 'F') handlers.fullscreen();
        else if (k === 'h' || k === 'H') AG.UI.toggleHidden();
        else if (k === '?' || k === '/') AG.UI.toggleHelp();
        else if (k === 'Escape') AG.UI.toggleHelp(false);
        else if (k >= '1' && k <= '5') handlers.jump(C.states.at(Number(k) - 1).id);
        else if (k === '6') handlers.jumpR2();                         // R02 — Memory Garden
        else if (k === 'q' || k === 'Q') {
          const opts = ['auto', 'low', 'balanced', 'high'];
          const nq = opts[(opts.indexOf(qualityMode) + 1) % opts.length];
          handlers.quality(nq); document.getElementById('quality').value = nq; AG.UI.toast('Quality: ' + nq);
        }
      });
    }
  }, document.getElementById('stage'));
})();
