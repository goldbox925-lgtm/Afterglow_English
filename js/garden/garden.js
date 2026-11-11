/* =====================================================================
   Round 02 · Memory Garden — the way in (after Round 01's finale)
   ---------------------------------------------------------------------
   Round 01 is unchanged and ends as before (fifth fragment → glide →
   ascent → end card). The end card now also offers "Enter the Memory
   Garden". Choosing it:

   APPROACH  She is back in free flight over the restored city, about
             170 m in front of ONE building whose facade has opened into
             a doorway of light (an arch, ~14 × 18 m) with a column of
             light above its roof. The fragments are off. The edge arrow
             points to the doorway while it is off screen. Within ~220 m,
             hands off the controls, she lines up with it gently (turn
             and height); the look-ahead avoidance is off while she is
             heading for it, so it never steers her away. The portal uses
             the collision module's prepared ROUND 02 portals: the
             doorway's rectangle on that face is passable, the rest of
             the building stays solid.
   ENTER     Through the doorway: she glides on into the light while the
             screen fades to white (1.1 s).
   INSIDE    The Memory Garden: AG.GardenScene (the Interactive Bloom)
             replaces the city image, with the p5-drawn light layer
             (AG.R2Layer) on top. Input arrives through p5's own mouse
             callbacks in js/sketch.js (pointerDown / pointerMove /
             pointerUp / hover / wheel below). Click the heart, drag outward to
             unfold; drag elsewhere to look around; wheel to zoom.
             "Back to the city" fades out and puts her just outside the
             doorway, facing away; the flower keeps its state, so flying
             back in continues where she left it.
   LAUNCH    When the building's transformation reaches 100 % while she
             is inside: the final light rises through the atrium, the
             glass panel on the doorway's side dissolves open (shader
             uOpen, atrium.glsl.js), and she takes off through it
             (AG.Flight launch: assisted, ← → shift her across the
             opening, double-tap ↑ lifts her within it). Past the glass
             the garden coordinates map 1:1 onto the city (world =
             garden + doorway origin), so she keeps her position, speed
             and heading; a short light flash covers the scene change.
   REVEAL    Back in the city (phase APPROACH, G.exit set): a 4 s side
             shot frames her and the rooftop flower together, then the
             chase camera returns, its look gently drawn toward the next
             target's beacon for ~3 s. A light trail leads that way.
   TARGET    G.targetSite: the nearest building not yet bloomed; changes
             only when the current one completes. Its beacon is the
             brightest; the HUD pill reads "NEXT: NAME · d m".
   Play again / R / a stage jump closes everything (U 'reset').

   FIVE BUILDINGS (js/garden/gardens.js): the same loop runs at five
   doorways. All are open during free flight; G.site is the one whose
   flower state is loaded in the single scene, G.portal the doorway she
   is lining up with. Going through a doorway swaps the state, palette
   and atrium details to that site.

   Choice of the buildings (deterministic from the city, no randomness):
   undamaged towers with a known facade (js/city/cityGenerator.js
   b.shafts: corporate / hive / industrial), whose facade at the
   doorway's height is within 3 m of the collision box, and whose
   doorway looks down a corridor that is clear of every building for
   the whole approach (AG.Flight.segmentClear). Among those, the ones
   nearest downtown that stand well apart; the nearest is the first.
   ===================================================================== */
window.AG = window.AG || {};

AG.Garden = (function () {
  const U = AG.U, V = U.v3;
  const DOOR_W = 14, DOOR_H = 18;      // metres: the opening
  const START = 170;                   // metres in front of the doorway where she starts
  const ENTER_T = 1.1, FADE_IN = 1.4, LEAVE_T = 0.7;
  // THE FLIGHT OUT (after a building's transformation completes while she is inside), game seconds:
  const FINAL_T = 2.2;                 // 0 … FINAL_T   the final light rises through the atrium
  const OPEN_A = 1.2, OPEN_B = 2.4;    // the glass panel on the doorway's side dissolves open
  const LAUNCH_AT = 2.0;               // she takes off toward it (assisted, still steerable)
  const REVEAL_T = 4.0, GUIDE_T = 7.0; // outside: the reveal shot, then the look drawn toward the next beacon
  const HER_K = 3;                     // the image heroine's size in the garden (the 3D one: AG.HeroModel's SCALE)
  const HINT = 'Fly to the beacon. Double-tap ↑ to rise; use ← → to steer.';
  const G = { phase: 'off', portal: null, site: null, white: 0, open: 0, near: 0, scene: null, visits: 0, t: 0,
    targetSite: null,                  // the next building to guide her to (changes only when it is complete)
    exit: null,                        // outside after the flight out: { t, site, side } (the reveal camera, the hint)
    exitFx: { final: 0, open: 0 }, exitGeom: null };
  let p = null, info = null;
  const $ = (id) => document.getElementById(id);

  /* ---------- the doorway's building ---------- */
  /* every usable doorway, one per building (its best), best first */
  function candidates(info) {
    const FC = AG.CONFIG.flight, D = AG.CONFIG.city.downtown;
    const normals = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const out = [];
    for (const b of info.boxes || []) {
      if (!b.building || b.damaged || b.hero || !b.shafts || !b.shafts.length) continue;
      let best = null;
      for (const s of b.shafts) {
        const lo = s.y0 + DOOR_H / 2 + 3, hi = Math.min(s.y1 - DOOR_H / 2 - 3, 140);
        if (hi < lo || s.w < DOOR_W + 6 || s.d < DOOR_W + 6) continue;
        for (const n of normals) {
          // the real facade on this side vs the collision box face: the doorway must sit on both
          const half = n[0] ? s.w / 2 : s.d / 2, boxHalf = n[0] ? (b.x1 - b.x0) / 2 : (b.z1 - b.z0) / 2;
          if (boxHalf - half > 3 || boxHalf - half < -0.5) continue;
          for (let k = 0; k < 3; k++) {
            const y = U.lerp(hi, lo, k / 2);
            if (y < 22) continue;
            const c = [b.cx + n[0] * half, y, b.cz + n[2] * half];
            const score = -Math.hypot(c[0] - D.x, c[2] - D.z) + y * 0.5;
            if (best && score <= best.score) continue;
            const from = V.add(c, V.scale(n, boxHalf - half + FC.radius + 2)), to = V.add(c, V.scale(n, START + 25));
            if (AG.Flight.segmentClear(from, to, DOOR_W / 2, b) < 0.999) continue;
            best = { box: b, shaft: s, c, n, w: DOOR_W, h: DOOR_H, inset: boxHalf - half, roof: b.top, score };
          }
        }
      }
      if (best) out.push(best);
    }
    return out.sort((a, c) => c.score - a.score);
  }
  function choose(info) { return candidates(info)[0] || null; }

  /* up to n doorways: the best open roof first (Rose), the rest as near downtown as they
     can be while standing well apart, relaxing the spacing only if the city needs it */
  function chooseAll(info, n) {
    const c = candidates(info), picked = [];
    // a giant flower needs a roof with nothing standing in its middle: no penthouse mast, no spire
    const openRoof = (q) => q.box.crownKind === 'helipad' || q.box.crownKind === 'lattice';
    for (const pool of [c.filter(openRoof), c]) {
      for (const gap of [260, 180, 120, 70]) {
        for (const q of pool) {
          if (picked.length >= n) break;
          if (picked.includes(q) || picked.some((o) => Math.hypot(o.c[0] - q.c[0], o.c[2] - q.c[2]) < gap)) continue;
          picked.push(q);
        }
        if (picked.length >= n) return picked;
      }
    }
    return picked;
  }

  function openPortals() {
    const Gs = AG.Gardens;
    if (!Gs.sites.length && info) Gs.setSites(chooseAll(info, Gs.limit));
    if (!Gs.sites.length) return false;
    // the collision module's Round 02 portal on each face (its centre on the collision box face)
    for (const s of Gs.sites) {
      const P = s.portal, onBox = V.add(P.c, V.scale(P.n, P.inset));
      P.box.portals = [{ c: onBox, n: P.n, w: P.w, h: P.h + 2, open: true }];
    }
    return true;
  }
  function closePortals() { for (const s of AG.Gardens.sites) delete s.portal.box.portals; }

  /* ---------- which building the flower scene holds ---------- */
  function loadFlower(s) { const f = G.scene.flower; f.setPalette(s.cfg.flower); f.restore(s.flower); }
  function selectSite(s) {
    if (G.site === s) return;
    if (G.scene && G.site) G.site.flower = G.scene.flower.snapshot();
    G.site = s; G.portal = s.portal;
    if (G.scene) loadFlower(s);
  }

  /* ---------- her place in front of the doorway ---------- */
  function placeOutside(dist, facingDoor) {
    const F = AG.Flight, P = G.portal, n = P.n;
    F.pos = V.add(P.c, V.scale(n, dist));
    F.pos[1] = P.c[1];
    // heading = [sin yaw, 0, −cos yaw]
    const dir = facingDoor ? V.scale(n, -1) : n;
    F.yaw = Math.atan2(dir[0], -dir[2]); F.yawRate = 0; F.bank = 0; F.vy = 0;
    F.speed = AG.CONFIG.flight.cruise;
    F.resetMotion();
  }
  function setFlightAssist(on) {
    const F = AG.Flight;
    F.noFragments = on; F.keysFirst = on;     // Round 02: a held arrow key wins over the mouse
    if (!on) { F.assistTurn = 0; F.assistVy = 0; F.avoidOff = false; F.assistHold = false; F.mouseParked = null; }
  }
  /* the mouse steers her again only once it moves (it was left on a button) */
  function parkMouse() { const I = AG.Input; AG.Flight.mouseParked = [I.px || 0, I.py || 0]; }

  /* ---------- phases ---------- */
  function start() {
    if (G.phase !== 'off') return;
    if (!openPortals()) { AG.UI.toast('No doorway could open in this city — try a new city (N)'); return; }
    G.site = null; selectSite(AG.Gardens.sites[0]);
    G.targetSite = AG.Gardens.sites[0]; G.exit = null;   // (Rose: the building she starts in front of)
    if (AG.HeroModel) AG.HeroModel.load(p);   // the 3D heroine: loaded now (never in Round 01), in the background
    AG.Flight.reset();                       // (also resets the fragments; they stay off below)
    setFlightAssist(true);
    parkMouse();                              // (the pointer is still on the R02 chip or the end card's button)
    placeOutside(START, true);
    G.phase = 'approach'; G.t = 0; G.white = 0.9; G.open = 0;
    document.body.classList.remove('ended'); document.body.classList.add('garden');
    $('endCard').classList.remove('show');
    AG.Camera.snapNext();
    AG.U.emit('gardenPhase', { phase: G.phase });
  }

  /* ---------- ENDING PREVIEW (testing only; the "Preview Ending" chip) ----------
     Round 02's ending is the existing city-wide completion state (all five buildings complete:
     AG.Gardens.finale eases in, the sky takes all five colours, the taller rooftop columns, the
     central sentence, "THE CITY IS IN BLOOM"). The preview shows exactly that, without playing the
     five buildings: it keeps a copy of every building's real progress and her place first, and
     "Return to Round 02" puts both back. Nothing of it is stored or carried into normal play; a
     Replay or a stage jump drops the copy (the progress is reset by that anyway). */
  let PV = null;
  const SITE_KEYS = ['bloomed', 'completed', 'sinceBloom', 'transform', 'windows', 'surge', 'exitSeq', 'reacted'];
  function snapSites() {
    if (G.scene && G.site && (G.phase === 'inside' || G.phase === 'launch' || G.phase === 'leave')) G.site.flower = G.scene.flower.snapshot();
    const Gs = AG.Gardens, F = AG.Flight;
    return {
      sites: Gs.sites.map((s) => { const o = {}; for (const k of SITE_KEYS) o[k] = s[k]; o.stage = Object.assign({}, s.stage); o.told = Object.assign({}, s.told); o.flower = Object.assign({}, s.flower); return o; }),
      finale: Gs.finale, awake: Gs.awake, target: G.targetSite, site: G.site, visits: G.visits,
      phase: G.phase, pos: F.pos.slice(), yaw: F.yaw
    };
  }
  function restoreSites(S) {
    const Gs = AG.Gardens;
    Gs.sites.forEach((s, i) => { const o = S.sites[i]; for (const k of SITE_KEYS) s[k] = o[k]; Object.assign(s.stage, o.stage); s.told = Object.assign({}, o.told); s.flower = Object.assign({}, o.flower); });
    Gs.finale = S.finale; Gs.awake = S.awake; G.targetSite = S.target; G.visits = S.visits;
  }
  /* out of a garden (if she is in one) straight into the city flight, under the white fade */
  function toCity() {
    const F = AG.Flight;
    if (G.phase === 'inside' || G.phase === 'launch' || G.phase === 'leave' || G.phase === 'enter') {
      showInside(false);
      if (F.garden) F.exitGarden();
      if (G.scene) G.scene.up();
    }
    if (p && p.canvas) p.canvas.style.cursor = '';
    setFlightAssist(true); parkMouse();
    G.phase = 'approach'; G.t = 0; G.white = 1; G.exit = null; G.entryHint = false; G.targetNear = 0;
  }
  function previewEnding() {
    if (G.phase === 'off') { AG.UI.toast('Start Round 02 first (R02), then preview its ending'); return false; }
    if (PV) restoreSites(PV); else PV = snapSites();   // Restart: from the same real progress again
    const Gs = AG.Gardens, F = AG.Flight;
    for (const s of Gs.sites) {
      s.bloomed = true; s.completed = true; s.transform = 1; s.windows = 1; s.exitSeq = 'skip'; s.reacted = true;
      s.sinceBloom = Math.max(s.sinceBloom, 60); s.surge = 0;
      for (const k in s.stage) s.stage[k] = 1;
      s.flower = { bloom: 1, target: 1, awake: true, awakeK: 1, full: true, clicks: s.flower.clicks || 0 };
      s.told.complete = -1;                // (each completion's line is not retold all at once…)
    }
    Gs.sites[Gs.sites.length - 1].told.complete = false;   // (…only the ending's central sentence, once)
    if (AG.R2Hud) AG.R2Hud.clear();
    Gs.finale = 0; Gs.awake = 0;          // (both ease in again: the ending is seen arriving)
    if (G.scene && G.site) loadFlower(G.site);
    toCity();
    closePortals();
    // a vantage over the city: back from the five buildings' centre, above their roofs, facing them
    const R = Gs.sites.map((s) => s.rooftop.center), c = [0, 1, 2].map((i) => R.reduce((a, r) => a + r[i], 0) / R.length);
    const far = Math.max(...R.map((r) => Math.hypot(r[0] - c[0], r[2] - c[2]))), top = Math.max(...R.map((r) => r[1]));
    const d0 = Math.hypot(F.pos[0] - c[0], F.pos[2] - c[2]) > 1 ? [(F.pos[0] - c[0]), (F.pos[2] - c[2])] : [0, 1], dl = Math.hypot(d0[0], d0[1]);
    F.pos = [c[0] + d0[0] / dl * (far + 140), top + 45, c[2] + d0[1] / dl * (far + 140)];
    const to = V.sub([c[0], top, c[2]], F.pos);
    F.yaw = Math.atan2(to[0], -to[2]); F.yawRate = 0; F.bank = 0; F.vy = 0; F.speed = AG.CONFIG.flight.cruise; F.resetMotion();
    G.portal = G.site ? G.site.portal : Gs.sites[0].portal;
    AG.Camera.snapNext();
    G.preview = true; document.body.classList.add('r2-preview');
    AG.U.emit('gardenPhase', { phase: G.phase });
    return true;
  }
  function endPreview() {
    if (!PV) return false;
    const S = PV, F = AG.Flight; PV = null;
    restoreSites(S);
    if (AG.R2Hud) AG.R2Hud.clear();
    G.site = S.site || G.site;
    if (G.scene && G.site) loadFlower(G.site);
    toCity();
    openPortals();
    if (S.phase === 'approach') {
      F.pos = S.pos.slice(); F.yaw = S.yaw; F.yawRate = 0; F.bank = 0; F.vy = 0; F.speed = AG.CONFIG.flight.cruise; F.resetMotion();
    } else if (G.site) {
      // she was in a garden: back outside its doorway as "Back to the city" leaves her (facing away,
      // so she never flies in again by herself; turning round and in takes a few seconds)
      G.portal = G.site.portal; placeOutside(G.portal.inset + AG.CONFIG.flight.radius + 14, false);
    }
    G.portal = G.site ? G.site.portal : G.portal;
    AG.Camera.snapNext();
    G.preview = false; document.body.classList.remove('r2-preview');
    AG.U.emit('gardenPhase', { phase: G.phase });
    return true;
  }

  function reset() {
    PV = null; G.preview = false; document.body.classList.remove('r2-preview');
    closePortals();
    AG.Gardens.resetAll(); G.site = null;
    setFlightAssist(false);
    if (AG.Flight.garden) AG.Flight.exitGarden();
    G.pendingAwaken = false; G.prox = 0;
    G.targetSite = null; G.exit = null; G.exitFx = { final: 0, open: 0 }; G.exitGeom = null;
    if (AG.Living && AG.Living.stopTrail) AG.Living.stopTrail();
    G.phase = 'off'; G.white = 0; G.open = 0; G.near = 0; G.t = 0; G.visits = 0; G.targetNear = 0; G.entryHint = false;
    G.hero3d = false; if (AG.HeroModel) AG.HeroModel.reset();
    if (p && p.canvas) p.canvas.style.cursor = '';
    if (G.scene) { G.scene.flower.reset(); G.scene.resetView(); }
    document.body.classList.remove('garden', 'garden-inside');
    showInside(false);
  }

  function leave() {
    if (G.phase !== 'inside') return;
    if (G.site && G.site.exitSeq === 'pending') G.site.exitSeq = 'skip';   // (Back to the city wins over the flight out)
    G.phase = 'leave'; G.t = 0; if (G.scene) G.scene.up();
  }

  function showInside(on) {
    const el = $('gardenUI'); if (el) el.classList.toggle('show', on);
    document.body.classList.toggle('garden-inside', on);
  }

  /* the doorway in her frame: d = in front of the facade, along / up = in its plane */
  function local(pos, P) {
    const r = V.sub(pos, P.c), t = [-P.n[2], 0, P.n[0]];
    return { d: V.dot(r, P.n), along: V.dot(r, t), up: r[1] };
  }

  /* called by sketch.js instead of the flight update while Round 02 runs (story playing) */
  function update(dt, input) {
    const F = AG.Flight;
    let P = G.portal;
    G.t += dt;
    trackCompletion();
    if (G.phase === 'approach') {
      if (G.exit && (G.exit.t += dt) > GUIDE_T) G.exit = null;
      P = G.portal = lineUpTarget(F);
      G.open = Math.min(1, G.open + dt / 1.5);
      G.white = Math.max(0, G.white - dt / 1.2);
      // a gentle line-up, only when she is in front of the doorway and roughly heading for it
      const L = local(F.pos, P), rel = V.sub(P.c, F.pos);
      const want = Math.atan2(rel[0], -rel[2]), diff = Math.atan2(Math.sin(want - F.yaw), Math.cos(want - F.yaw));
      const inFront = !PV && L.d > 0 && L.d < 230;     // (none in the ending preview: no doorway to line up with)
      const k = inFront ? U.smooth(0.8, 0.25, Math.abs(diff)) * U.smooth(230, 120, L.d) : 0;
      F.assistTurn = U.clamp(diff * 1.4, -0.45, 0.45) * k;
      F.assistVy = U.clamp((P.c[1] - F.pos[1]) * 1.1, -12, 12) * (inFront ? U.smooth(0.9, 0.3, Math.abs(diff)) : 0);
      F.avoidOff = inFront && Math.abs(diff) < 0.6;
      // (the doorway height assist yields to the player: a tap of ↑ always climbs, js/core/flight.js)
      F.assistHold = false;
      G.near = inFront ? U.smooth(160, 30, L.d) : 0;
      F.update(dt, input, true);
      trackTarget();
      if ((G.occT = (G.occT || 0) - dt) <= 0) { G.occT = 0.12; occlusion(); }
      // through the doorway? (only when she flies into it herself: nothing moves her there)
      // (the ending preview shows the city only: its doorways are closed, js/core/collision.js keeps
      // the buildings solid, and nothing is entered)
      const FC = AG.CONFIG.flight, through = !PV && AG.Gardens.sites.find((s) => {
        const Q = s.portal, L2 = local(F.pos, Q);
        return L2.d < FC.radius + 0.6 && L2.d > -6 && Math.abs(L2.along) < Q.w / 2 && L2.up > -Q.h / 2 && L2.up < Q.h / 2;
      });
      if (through) {
        selectSite(through); G.portal = through.portal;
        if (!through.completed) G.targetSite = through;      // the building she is in is the one that counts now
        G.phase = 'enter'; G.t = 0; G.entryHint = false; G.targetNear = 0; setFlightAssist(true); F.assistTurn = 0; F.assistVy = 0; F.assistHold = false;
        AG.U.emit('gardenPhase', { phase: G.phase });
      }
    } else if (G.phase === 'enter') {
      // she glides on into the light (no collision: the doorway is open), the screen turns white
      const sp = Math.max(12, F.flySpeed || F.speed || 12);
      F.pos = V.sub(F.pos, V.scale(P.n, sp * dt));
      G.white = U.smooth(0, ENTER_T * 0.9, G.t);
      if (G.t >= ENTER_T) {
        G.phase = 'inside'; G.t = 0; G.white = 1; G.visits++;
        if (!G.scene) { G.scene = AG.GardenScene.create(p, { scale: 2.6 }); G.scene.cam.maxR = 16.4; loadFlower(G.site); }   // (the camera stays inside the walkways' 17.5 m edge)
        showInside(true);
        enterGardenFlight();
        // the 3D heroine, if her model is ready by now (decided per visit: never a swap mid-scene)
        G.hero3d = !!(AG.HeroModel && AG.HeroModel.usable());
        FX.parts.length = 0; FX.acc = 0; FX.n = 0;
        if (G.hero3d) AG.HeroModel.begin();
        AG.U.emit('gardenPhase', { phase: G.phase });
      }
    } else if (G.phase === 'inside') {
      G.white = Math.max(0, 1 - G.t / FADE_IN);
      // her flight continues in the garden (AG.Flight's garden mode: p5.Vector arrive steering);
      // ← → are true to the view, so it needs the camera's right vector
      if (F.garden) { const e = G.scene.view.eye, t = G.scene.cam.target, d = V.norm(V.sub(t, e)); F.garden.camRight = V.norm(V.cross(d, [0, 1, 0])); }
      F.update(dt, input, true);
      tourCamera(dt);
      // PROXIMITY: p.dist to the flower's heart → p.map (9 m far … 3.6 m close) → p.constrain 0..1
      const f = G.scene.flower, H = f.heart().c;
      const d = p.dist(F.pos[0], F.pos[1], F.pos[2], H[0], H[1], H[2]);
      G.prox = p.constrain(p.map(d, 9, 3.6, 0, 1), 0, 1);
      f.setVisitor(F.pos, G.prox);
      // a click on the heart before she arrived waited for her: the flower wakes as she arrives
      if (G.pendingAwaken && F.gardenArrived) { G.pendingAwaken = false; f.awaken(); }
      // the flower has just opened fully (once per building): the 3D heroine's reaction, with a
      // small upward lift through her own movement (js/core/flight.js), never her skeleton's root
      if (!G.site.reacted && f.bloom >= AG.R2.BLOOM_DONE) {
        G.site.reacted = true;
        if (G.hero3d && AG.HeroModel.react() && F.gardenImpulse) F.gardenImpulse(1.6, 1.8);
      }
      heroTick(dt, 'inside');
      // its transformation has just completed with her here: the flight out
      if (G.site.exitSeq === 'pending') beginLaunch();
    } else if (G.phase === 'launch') {
      G.white = Math.max(0, G.white - dt / 1.2);
      G.exitFx.final = U.clamp(G.t / FINAL_T, 0, 1);
      G.exitFx.open = U.smooth(OPEN_A, OPEN_B, G.t);
      if (F.garden) { const e = G.scene.view.eye, t = G.scene.cam.target, d = V.norm(V.sub(t, e)); F.garden.camRight = V.norm(V.cross(d, [0, 1, 0])); }
      if (F.garden && !F.garden.launch && G.t >= LAUNCH_AT) {
        const X = G.exitGeom;
        F.garden.launch = { n: X.n, R: X.R, Rout: X.Rout, y: X.y, yLo: X.yLo, yHi: X.yHi, halfW: X.halfW, off: 0, lift: 0, lateral: 7, liftScale: 0.12, climb: 4, r: 0 };
      }
      F.update(dt, input, true);
      const f = G.scene.flower, H = f.heart().c;
      G.prox = p.constrain(p.map(p.dist(F.pos[0], F.pos[1], F.pos[2], H[0], H[1], H[2]), 9, 3.6, 0, 1), 0, 1);
      f.setVisitor(F.pos, G.prox);
      heroTick(dt, 'launch');
      launchCamera(dt);
      const L = F.garden && F.garden.launch;
      if (L) {
        G.white = Math.max(G.white, U.smooth(L.Rout - 5, L.Rout, L.r) * 0.5);    // the light of the opening as she passes
        if (L.r >= L.Rout || G.t > LAUNCH_AT + 7) handOff();
      }
    } else if (G.phase === 'leave') {
      heroTick(dt, 'leave');
      G.white = U.smooth(0, LEAVE_T, G.t);
      if (G.t >= LEAVE_T) {
        showInside(false);
        F.exitGarden();                       // back to her city flight
        placeOutside(P.inset + AG.CONFIG.flight.radius + 14, false);
        setFlightAssist(true);
        parkMouse();                          // (the pointer is still on "Back to the city")
        G.phase = 'approach'; G.t = 0; G.white = 1;
        AG.Camera.snapNext();
        AG.U.emit('gardenPhase', { phase: G.phase });
      }
    }
  }

  /* THE ARRIVAL CIRCUIT's camera (js/core/flight.js gardenTour): while the circuit runs, the orbit
     camera turns round the flower WITH her, by the same guided angle each frame (so it never spins on
     its own), and drifts at most 0.25 rad/s (× the circuit's eased gain) toward keeping her
     TOUR_SIDE (1.2 rad) from its nearest ring point: beside the flower, neither in front of it nor
     hidden behind its petals, and the flower is seen from every side. The circuit's direction is
     chosen as it starts: toward the camera's side from where she is. Her hand steering pauses it (gain → 0); a drag of the
     view by the player hands the camera to them for the rest of the circuit. */
  const TOUR_SIDE = 1.2;     // rad from the camera's nearest ring point: beside the flower (≈ 6 m out), not in front of it
  function tourCamera(dt) {
    const F = AG.Flight, T = F.garden && F.garden.tour, cam = G.scene && G.scene.cam;
    if (!T || !cam || cam.eye) return;
    const c = G.scene.flower.center, herAz = Math.atan2(F.pos[2] - c[2], F.pos[0] - c[0]);
    let eyeAz = Math.PI / 2 - cam.yaw;                      // (eye azimuth = π/2 − yaw)
    // before it starts: the circuit runs TOWARD the camera's side from where she is, so her body trails
    // outward (away from the flower) and she is seen coming, and the camera need not swing across
    if (T.state === 'wait') { T.dir = Math.atan2(Math.sin(herAz - eyeAz), Math.cos(herAz - eyeAz)) > 0 ? -1 : 1; return; }
    if (T.state !== 'run' || cam.userOrbit) return;
    cam.yaw -= T.dAz;                                       // the camera turns with her …
    eyeAz = Math.PI / 2 - cam.yaw;
    const want = herAz + T.dir * TOUR_SIDE;                 // … and keeps her TOUR_SIDE ahead of its own side
    const err = Math.atan2(Math.sin(want - eyeAz), Math.cos(want - eyeAz));
    // (the drift fades out over the circuit's last 0.8 rad, so the camera comes to rest smoothly with her)
    const fadeOut = U.smooth(0, 0.8, 2 * Math.PI - T.ang);
    cam.yaw -= U.clamp(err * 0.5, -0.25, 0.25) * T.gain * fadeOut * dt;
  }
  /* the 3D heroine's animation follows her garden flight (js/character/heroModel.js) */
  /* HER WAKE (garden and flight out): a few small glints shed behind her body, more the faster she
     flies (none while she hovers). At most 24 live sprites, drawn with the flower's own glow-sprite
     program (additive, depth-tested, no new shader). Reduced motion: a third as many, no drift. */
  const FX = { spr: new Float32Array(64 * 4), sprC: new Float32Array(64 * 4), parts: [], acc: 0, n: 0, born: 0 };
  const RMQ = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return null; } })();
  function herWake(dt, phase) {
    const F = AG.Flight, HM = AG.HeroModel, v = F.vel || [0, 0, 0], sp = Math.hypot(v[0], v[1], v[2]);
    const still = !!(RMQ && RMQ.matches), MAX = 24;
    if (phase !== 'leave' && dt > 0) {
      FX.acc += (still ? 4 : 14) * U.smooth(1.5, 7, sp) * dt;
      const c = G.hero3d && HM.centre ? HM.centre : F.pos, r = G.hero3d ? HM.reach() : 1.2;
      const ux = sp > 1e-3 ? v[0] / sp : 0, uy = sp > 1e-3 ? v[1] / sp : 0, uz = sp > 1e-3 ? v[2] / sp : 0;
      while (FX.acc >= 1) {
        FX.acc -= 1;
        if (FX.parts.length >= MAX) continue;
        const j = () => (Math.random() - 0.5);
        const back = r * (0.35 + 0.4 * Math.random());
        FX.parts.push({
          x: c[0] - ux * back + j() * 1.0, y: c[1] - uy * back + j() * 0.8, z: c[2] - uz * back + j() * 1.0,
          vx: still ? 0 : -v[0] * 0.06 + j() * 0.3, vy: still ? 0 : 0.25 + j() * 0.2, vz: still ? 0 : -v[2] * 0.06 + j() * 0.3,
          age: 0, life: 0.7 + 0.5 * Math.random(), s: 0.09 + 0.08 * Math.random(), w: Math.random()
        });
        FX.born++;
      }
    }
    for (const q of FX.parts) { q.age += dt; const k = Math.exp(-1.6 * dt); q.vx *= k; q.vz *= k; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; }
    FX.parts = FX.parts.filter((q) => q.age < q.life);
    // into the sprite arrays (unused slots: size 0, alpha 0)
    const col = G.scene && G.scene.flower.colors.heat || [1, 0.7, 0.6], lav = [0.78, 0.7, 1.0];
    FX.spr.fill(0); FX.sprC.fill(0);
    FX.parts.forEach((q, i) => {
      const u = q.age / q.life, a = 0.55 * U.smooth(0, 0.15, u) * (1 - U.smooth(0.45, 1, u));
      FX.spr.set([q.x, q.y, q.z, q.s * (1 - 0.4 * u)], i * 4);
      FX.sprC.set([col[0] + (lav[0] - col[0]) * q.w, col[1] + (lav[1] - col[1]) * q.w, col[2] + (lav[2] - col[2]) * q.w, a], i * 4);
    });
    FX.n = FX.parts.length;
  }
  function heroTick(dt, phase) {
    herWake(dt, phase);
    // the garden camera keeps all of the (large) 3D heroine in frame while she is inside
    const cam = G.scene && G.scene.cam, HM = AG.HeroModel;
    if (cam) {
      const on = G.hero3d && phase === 'inside' && HM.centre;
      cam.follow = on ? { p: HM.centre, r: HM.reach(), v: AG.Flight.vel || [0, 0, 0] } : null;
      cam.fitW = on ? (AG.Flight.garden.ringNow || AG.Flight.garden.ring) + HM.reach() * 1.6 : null;
    }
    if (!G.hero3d) return;
    const F = AG.Flight, v = F.vel || [0, 0, 0];
    AG.HeroModel.update(dt, { phase, arrived: !!F.gardenArrived, hs: Math.hypot(v[0], v[2]) });
  }

  /* ---------- completion and the next target ---------- */
  /* a building that completes with her inside it gets the flight out; one that completes while she is
     elsewhere does not (re-entering it later never throws her out). The next target is updated only
     when the current one is complete: the nearest building whose flower has not opened yet. */
  function trackCompletion() {
    for (const s of AG.Gardens.sites) if (s.completed && s.exitSeq === null) s.exitSeq = G.site === s && G.phase === 'inside' ? 'pending' : 'skip';
    if (!G.targetSite || G.targetSite.completed) G.targetSite = pickTarget();
  }
  function pickTarget() {
    const F = AG.Flight, from = G.phase === 'approach' || !G.site ? F.pos : G.site.position;
    let best = null, bd = Infinity;
    for (const s of AG.Gardens.sites) {
      if (s.bloomed) continue;
      const d = Math.hypot(s.portal.c[0] - from[0], s.portal.c[2] - from[2]);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  const beaconPoint = (s) => [s.portal.box.cx, s.portal.roof + 40, s.portal.box.cz];

  /* THE FLIGHT OUT, 1: the final light, the opening, her take-off (phase 'launch', still in the garden
     scene). The opening is a glass panel on the doorway's side (P.n): in the city that side looks down
     the doorway's corridor, which was chosen clear of every building, so she flies straight out. */
  function beginLaunch() {
    const F = AG.Flight, P = G.site.portal, n = P.n, b = P.box, A = G.atrium, FC = AG.CONFIG.flight;
    const boxHalf = n[0] ? (b.x1 - b.x0) / 2 : (b.z1 - b.z0) / 2, az = Math.atan2(n[2], n[0]);
    const inArc = (a, a0, a1) => { const w = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return w(a - a0) <= w(a1 - a0); };
    const underWalk = !!(A && A.walks && A.walks().some((wk) => wk[0] < 12 && inArc(az, wk[1], wk[2])));   // a walkway crosses the opening: stay under it
    const R = A ? A.R : 24;
    G.exitGeom = { n, az, R, Rout: Math.max(R + 3, boxHalf + FC.radius + 2.5), yLo: 3.6, yHi: underWalk ? 7.4 : 10.6, y: underWalk ? 5.0 : 5.6, halfW: 6.2 };
    G.exitFx = { final: 0, open: 0, dir: [Math.cos(az), Math.sin(az)] };
    G.site.exitSeq = 'done';
    G.phase = 'launch'; G.t = 0; G.pendingAwaken = false;
    if (G.scene) G.scene.up();                // a drag in progress ends: nothing more to open
    if (p && p.canvas) p.canvas.style.cursor = '';
    showInside(false);
    if (F.garden) F.garden.camRight = null;
    AG.U.emit('gardenPhase', { phase: G.phase });
  }
  /* the garden camera: first it turns to face the opening (behind the flower), then it follows her
     from behind, staying inside the glass while she flies on out through it */
  function launchCamera(dt) {
    const sc = G.scene, cam = sc.cam, F = AG.Flight, n = G.exitGeom.n;
    if (!F.garden || !F.garden.launch) {
      const want = Math.atan2(-n[0], -n[2]), d = Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw));
      cam.yaw += d * (1 - Math.exp(-1.8 * dt)); cam.pitch = U.damp(cam.pitch, 0.1, 1.8, dt);
      cam.target = cam.target.map((v, i) => U.damp(v, [0, 4.2, 0][i], 1.8, dt));
      return;
    }
    if (!cam.eye) { cam.eye = sc.view.eye.slice(); G.camT = 0; }
    // the follow eases IN (its rate grows over ~1.4 s): from the orbit view to behind her is up to
    // ~20 m, which a full-rate follow covered in half a second (a whip); now it is a glide
    G.camT = (G.camT || 0) + dt;
    const ramp = U.smooth(0, 1.4, G.camT);
    const v = F.vel || [0, 0, 0], hs = Math.hypot(v[0], v[2]), hd = hs > 1 ? [v[0] / hs, 0, v[2] / hs] : [n[0], 0, n[2]];
    // (the 3D heroine is about 3× the pose images: the camera follows from proportionally further back)
    const fk = G.hero3d ? Math.min(1.9, Math.sqrt(AG.HeroModel.sizeK())) : 1;
    const eye = V.add(V.sub(F.pos, V.scale(hd, 6.5 * fk)), [0, 1.8 * fk, 0]);
    const er = Math.hypot(eye[0], eye[2]);
    if (er > 19) { eye[0] *= 19 / er; eye[2] *= 19 / er; }
    eye[1] = U.clamp(eye[1], 0.5, 26);
    const tg = V.add(F.pos, V.scale(hd, 4));
    cam.eye = cam.eye.map((x, i) => U.damp(x, eye[i], 0.9 + 3.6 * ramp, dt));
    cam.target = cam.target.map((x, i) => U.damp(x, tg[i], 1.5 + 5.5 * ramp, dt));
  }
  /* THE FLIGHT OUT, 2: past the glass and clear of the real facade, she continues in the city. The
     garden's axes are the city's and its origin is the building's centre at the doorway's floor (the
     same offset the atrium uses for the city outside its glass), so her position, heading and velocity
     carry over exactly: the same point, no jump. */
  function handOff() {
    const F = AG.Flight, s = G.site, P = s.portal, b = P.box, L = F.garden.launch;
    const O = [b.cx, P.c[1] - P.h / 2 + 1, b.cz];
    const gPos = F.pos.slice(), gVel = (F.vel || [0, 0, 0]).slice();
    F.exitGarden();
    F.pos = V.add(gPos, O);
    F.setVel(gVel);
    F.speed = Math.max(Math.hypot(gVel[0], gVel[2]), 10); F.vy = gVel[1]; F.yawRate = 0;
    F.carryLift(Math.max(0, L.aimY - gPos[1]));
    setFlightAssist(true);
    parkMouse();
    if (G.scene) G.scene.resetView();
    // the reveal shot is taken from the side with the clearer view of her and the rooftop flower
    const n = P.n, t = [-n[2], 0, n[0]], RF = V.add(s.rooftop.center, [0, s.rooftop.scale * 0.35, 0]);
    const clear = (sd) => { const c = V.add(V.add(F.pos, V.scale(t, sd * 45)), [0, 14, 0]); return F.segmentClear(F.pos, c, 1.5) + F.segmentClear(c, RF, 1.5, b); };
    G.exit = { t: 0, site: s, side: clear(1) >= clear(-1) ? 1 : -1 };
    G.phase = 'approach'; G.t = 0; G.white = 0.5; G.open = Math.max(G.open, 1);
    G.exitFx = { final: 0, open: 0 };
    AG.Camera.snapNext();
    if (AG.Living && AG.Living.startTrail && G.targetSite) AG.Living.startTrail(s, F.pos, beaconPoint(G.targetSite));
    AG.U.emit('gardenPhase', { phase: G.phase });
  }
  /* THE FLIGHT OUT, 3 (city camera, js/core/camera.js): REVEAL from the side, pulling back until she
     and the rooftop flower share the frame; then the normal chase, its look drawn a little toward the
     next beacon for a few seconds (her heading is never changed). base = the chase pose. */
  function cameraPose(base) {
    const X = G.exit;
    if (!X || G.phase !== 'approach') return null;
    const F = AG.Flight, H = F.pos, s = X.site, n = s.portal.n, t = [-n[2], 0, n[0]], et = X.t;
    if (et < REVEAL_T) {
      const RF = V.add(s.rooftop.center, [0, s.rooftop.scale * 0.35, 0]);
      const k = U.easeInOut(U.clamp(et / 2.2, 0, 1)), fov = 56;
      // the look point between them, so both stay in the frame; far enough back to hold both
      const T = V.lerp(H, RF, 0.45 * k);
      const fit = V.len(V.sub(RF, H)) * 0.62 / (Math.tan(fov * Math.PI / 360) * Math.min(p.width / p.height, 1.6)) + 10;
      const dist = U.lerp(8, U.clamp(fit, 26, p.width >= p.height ? 75 : 150), k);   // (kept close enough for her to read)
      const dir = V.norm(V.add(V.add(V.scale(t, X.side * 0.92), V.scale(n, 0.3)), [0, U.lerp(0.12, 0.3, k), 0]));
      // anchor: the camera is carried along with her (no lag at her 20 m/s), then eases its framing
      return { pos: V.add(T, V.scale(dir, dist)), target: T, fov, flight: true, rate: 2.4, snapLook: true, anchor: H.slice(), fs: F.state() };
    }
    const out = Object.assign({}, base, { rate: U.lerp(1.8, 7, U.smooth(REVEAL_T, GUIDE_T, et)) });
    const B = G.targetSite && !G.targetSite.bloomed ? beaconPoint(G.targetSite) : null;
    const w = 0.38 * U.smooth(REVEAL_T, REVEAL_T + 1.2, et) * (1 - U.smooth(GUIDE_T - 1.4, GUIDE_T, et));
    if (!B || w < 1e-3) return out;
    const look = V.sub(base.target, base.pos), Ln = V.len(look), ld = V.scale(look, 1 / Ln), toB = V.norm(V.sub(B, base.pos));
    if (V.dot(toB, ld) < 0.1) return out;                  // behind her: the edge arrow shows the way
    out.target = V.add(base.pos, V.scale(V.norm(V.lerp(ld, toB, w)), Ln));
    return out;
  }
  /* the control hint during the flight out and its first seconds outside */
  function hintText() {
    if (G.phase === 'approach' && G.entryHint && G.targetSite) return 'Fly into the glowing doorway to enter ' + G.targetSite.name + '. Use ← → and ↑ ↓ to line up.';
    return G.phase === 'launch' || (G.phase === 'approach' && G.exit) ? HINT : null;
  }
  function hintTitle() { return G.phase === 'approach' && G.entryHint && G.targetSite ? 'ENTER ' + G.targetSite.name.toUpperCase() : 'FLY ON'; }
  /* for the UI: is the target's doorway, or a completed building's rooftop flower, hidden behind other
     buildings from the camera? (checked ~8 times a second; the building itself does not count) */
  const css = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')';
  const crown = (s) => V.add(s.rooftop.center, [0, s.rooftop.scale * 0.55, 0]);
  const hiddenFrom = (eye, q, box) => AG.Flight.segmentClear(eye, q, 0, box) < 0.995;
  function occlusion() {
    const eye = AG.Camera.state && AG.Camera.state.pos, T = G.targetSite;
    if (!eye) return;
    G.tgtHidden = !!(T && !T.bloomed && hiddenFrom(eye, V.add(T.portal.c, V.scale(T.portal.n, 2.5)), T.portal.box));
    for (const s of AG.Gardens.sites) s.landmarkHidden = s.completed && hiddenFrom(eye, crown(s), s.portal.box);
  }
  /* the completed buildings' rooftop flowers, for the UI's landmark markers (in the city only) */
  function landmarks() {
    if (G.phase !== 'approach') return [];
    return AG.Gardens.sites.filter((s) => s.completed).map((s) => ({ id: s.id, pos: crown(s), col: css(s.cfg.portal.a), hidden: !!s.landmarkHidden }));
  }
  function targetHidden() { return G.phase === 'approach' && !!G.tgtHidden; }
  /* how close she is to the next target's doorway: 0 far … 1 at about 90 m (the beacon grows with it),
     and the entry hint (on under 170 m, off again past 200 m) */
  function trackTarget() {
    const T = G.targetSite, F = AG.Flight;
    if (G.phase !== 'approach' || !T || T.bloomed) { G.targetNear = 0; G.entryHint = false; return; }
    const d = V.len(V.sub(T.portal.c, F.pos));
    G.targetNear = U.smooth(320, 90, d);
    G.entryHint = G.entryHint ? d < 200 : d < 170;
  }

  /* the garden scene replaces the city image while inside (or fading out of it) */
  function drawsScene() { return G.phase === 'inside' || G.phase === 'leave' || G.phase === 'launch'; }
  function draw(dt, CH) {
    // the garden, with her in it (the city renderer's character drawing), inside the glass atrium
    // (js/garden/atrium.js), whose light follows the same data streams (her position, closeness,
    // the flower's glow). (Phase 4's interior walls stand aside for the atrium: the transformation's
    // inside effects move into it in Part B; the city facade and rooftop are unchanged.)
    const f0 = G.scene.flower, streams = { t: f0.t, her: AG.Flight.garden ? AG.Flight.pos : null, prox: G.prox || 0, core: f0.core, bloom: f0.bloom, eye: G.scene.view.eye,
      exitFx: G.phase === 'launch' ? G.exitFx : null };   // the final light and the opening (the flight out)
    if (G.atrium) G.atrium.update(dt, streams);
    G.scene.draw(dt, { CH, env: G.atrium, streams, hero3d: G.hero3d ? AG.HeroModel : null, herState: AG.Flight.garden ? AG.Flight.state() : null, herK: HER_K, herFx: FX.n ? FX : null });
    if (!G.layer) G.layer = AG.R2Layer.create(p);
    G.layer.draw(G.scene);                    // the p5-drawn light layer, on top (js/garden/r2Layer.js)
  }

  /* her entrance into the garden: the same flight state, now in the garden mode. She glides in
     from the left of the view and settles front-left of the flower, where the camera sees both. */
  /* the atrium's room is built once per city; each building's own details are swapped in as she
     enters (its plants, its light, the real city round it outside the glass) */
  function prepareAtrium() {
    const sc = G.scene;
    if (!G.atrium) {
      sc.camera();
      G.atrium = AG.Atrium.create(p, { camAz: Math.atan2(sc.view.eye[2], sc.view.eye[0]), seed: AG.Gardens.sites[0].seed });
      G.atrium.build(info);
    }
    G.atrium.activate(G.site);
  }

  function enterGardenFlight() {
    const sc = G.scene, c = sc.flower.center;
    sc.cam.userOrbit = false;                   // (a new visit: the arrival circuit may turn the view again)
    prepareAtrium();
    sc.camera();
    const camAz = Math.atan2(sc.view.eye[2] - c[2], sc.view.eye[0] - c[0]);
    const az0 = camAz + 1.8, r = 9.5, k = sc.flower.scale / 2;   // (the hover ring scales with the flower)
    const start = [c[0] + Math.cos(az0) * r, c[1] + 3.3, c[2] + Math.sin(az0) * r];
    const inward = [-Math.cos(az0) * 2.4, -0.2, -Math.sin(az0) * 2.4];
    AG.Flight.enterGarden({ center: c.slice(), start, v0: inward, az: camAz + 0.8, ring: 3.8 * k, keepOut: 2.7 * k, h: 2.4 * k });
    G.pendingAwaken = false;
  }

  /* in free flight: the doorway she is lined up with, or else the nearest flower still asleep */
  function lineUpTarget(F) {
    let best = null;
    for (const s of AG.Gardens.sites) {
      const L = local(F.pos, s.portal), rel = V.sub(s.portal.c, F.pos), want = Math.atan2(rel[0], -rel[2]);
      const diff = Math.abs(Math.atan2(Math.sin(want - F.yaw), Math.cos(want - F.yaw)));
      if (L.d > 0 && L.d < 230 && diff < 0.8 && (!best || L.d < best.d)) best = { P: s.portal, d: L.d };
    }
    if (best) return best.P;
    const next = G.targetSite && !G.targetSite.bloomed ? G.targetSite : nextSite();
    return next ? next.portal : G.portal;
  }
  function nextSite() {
    const F = AG.Flight;
    let best = null, bd = Infinity;
    for (const s of AG.Gardens.sites) {
      if (s.bloomed) continue;
      const d = Math.hypot(s.portal.c[0] - F.pos[0], s.portal.c[2] - F.pos[2]);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /* every doorway, its colours and its beacon, for the city renderer. A beacon marks a building
     still to bloom; in the finale a taller column of its colours stands on every roof. */
  function portalDraw() {
    if ((G.phase !== 'approach' && G.phase !== 'enter') || G.open <= 0.001) return null;
    const Gs = AG.Gardens, fin = Gs.finale, eye = AG.Camera.state && AG.Camera.state.pos;
    return Gs.sites.map((s) => {
      const P = s.portal, D = s.draw || (s.draw = { c: P.c, n: P.n, w: P.w, h: P.h, beacon: [P.box.cx, P.roof, P.box.cz], col: s.cfg.portal });
      const isNext = s === G.targetSite && !s.bloomed, tn = isNext && fin <= 0 ? (G.targetNear || 0) : 0;
      // the target's doorway glows brighter as she comes close, even before she is lined up with it
      D.open = G.open; D.near = Math.max(P === G.portal ? G.near : 0, 0.55 * tn);
      // a finished building keeps a steady (unpulsing) column of its own colour above its rooftop flower, a
      // landmark; narrower than the target's pulsing one. It swells once when she first sees it
      const swell = s.completed ? Math.sin(Math.PI * Gs.surgeK(s)) : 0;
      // the next target's beacon is the bright one (a slow pulse); the other buds keep a quieter column
      // (near it, the beacon grows wider and brighter and pulses faster; the shader's own dimming
      // by uNear is outweighed: about 1.6× at 100 m)
      D.beaconK = fin > 0 ? fin * (0.5 + 0.18 * Math.sin(G.t * 0.6 + s.index * 1.26)) : isNext ? G.open * (1.05 + (0.2 + 0.1 * tn) * Math.sin(G.t * (2.2 + 1.6 * tn))) * (1 + 1.25 * tn) : !s.bloomed ? 0.45 * G.open : s.completed ? (0.5 + 0.5 * swell) * G.open : 0;
      D.beaconW = fin > 0 ? 13 : isNext ? 12 + 5 * tn : s.completed ? 7 + 5 * swell : 6.5; D.beaconH = fin > 0 ? 440 : isNext ? 380 : 320;
      // far away a column keeps a readable width on screen (about 1 % of the distance; the target's 1.5 %)
      if (eye) { const dc = Math.hypot(D.beacon[0] - eye[0], D.beacon[2] - eye[2]); D.beaconW = Math.max(D.beaconW, dc * (isNext ? 0.015 : s.completed || fin > 0 ? 0.01 : 0.007)); }
      return D;
    });
  }
  /* for the UI's edge arrow: the next target's doorway (none while that building is transforming) */
  function target() { if (G.phase !== 'approach') return null; const s = G.targetSite; return s && !s.bloomed ? s.portal.c : null; }
  /* the HUD objective: "NEXT: AZURE · 420 m" (live), or what the city is doing */
  function goalText() {
    const Gs = AG.Gardens, T = G.targetSite, F = AG.Flight;
    if (Gs.allComplete()) return 'THE CITY IS IN BLOOM';
    if (T && !T.bloomed && T === G.site && G.phase !== 'approach' && G.phase !== 'off') return T.name.toUpperCase() + ' · INSIDE';   // (her position is in the garden's own space there)
    if (T && !T.bloomed) {
      const d = Math.hypot(T.portal.c[0] - F.pos[0], T.portal.c[1] - F.pos[1], T.portal.c[2] - F.pos[2]);
      return 'NEXT: ' + T.name.toUpperCase() + ' · ' + (d < 10 ? '< 10' : String(Math.round(d / 10) * 10)) + ' m';
    }
    if (T && !T.completed) return T.name.toUpperCase() + ' · TRANSFORMING ' + Math.min(99, Math.floor(T.transform * 100)) + '%';
    return Gs.bloomedCount() === Gs.sites.length ? 'THE LAST FLOWERS ARE OPENING' : 'FLY THROUGH A DOORWAY OF LIGHT';
  }
  /* the objective's colour: the target building's own (CSS rgb) */
  function goalColor() { const T = G.targetSite; return T && !AG.Gardens.allComplete() ? 'rgb(' + T.cfg.portal.a.map((v) => Math.round(v * 255)).join(',') + ')' : ''; }
  /* a building's real bloom: live in the flower scene for the site it holds, saved for the others */
  function siteBloom(s) { return G.scene && s === G.site ? G.scene.flower.bloom : s.flower.bloom; }

  /* ---------- input inside: called from the ONE input path, p5's own mouse callbacks in
     js/sketch.js (p.mousePressed / mouseDragged / mouseReleased / mouseMoved / mouseWheel, which
     p5 also fires for touch). No listeners of its own. ---------- */
  function wantsPointer() { return G.phase === 'inside' && !!G.scene && AG.FSM.playing; }
  function pointerDown(x, y) {
    if (!wantsPointer()) return false;
    const onHeart = G.scene.hover(x, y);
    // she is still flying in: a click on the sleeping flower's heart waits for her (no drag yet)
    if (onHeart && !G.scene.flower.awake && !AG.Flight.gardenArrived) { G.pendingAwaken = true; return true; }
    return G.scene.down(x, y) || true;
  }
  function pointerMove(x, y) { if (wantsPointer()) G.scene.move(x, y); }
  function pointerUp() { if (G.scene) G.scene.up(); }
  function hover(x, y) {
    if (!wantsPointer()) return;
    const on = G.scene.hover(x, y);
    if (p && p.canvas) p.canvas.style.cursor = on ? 'pointer' : '';
  }
  function wheel(d) { if (wantsPointer()) G.scene.wheel(d); }

  function init(p5inst) {
    p = p5inst;
    $('endGarden').addEventListener('click', start);
    $('gardenBack').addEventListener('click', leave);
    $('gardenReset').addEventListener('click', () => { if (G.scene) G.scene.flower.reset(); });
    AG.U.on('reset', reset);
    AG.U.on('replay', reset);
  }
  /* a new city: forget the old doorway */
  function setWorld(i) { reset(); AG.Gardens.clear(); G.portal = null; if (G.atrium) G.atrium.dispose(); G.atrium = null; info = i; }
  function resize() { if (G.scene) G.scene.resize(); }

  return Object.assign(G, {
    init, setWorld, resize, start, reset, leave, update, draw, drawsScene, portalDraw, target, goalText, goalColor, hintText, hintTitle, landmarks, targetHidden, cameraPose, siteBloom, choose, chooseAll,
    wantsPointer, pointerDown, pointerMove, pointerUp, hover, wheel,
    isActive: () => G.phase !== 'off',
    wakeInfo: () => ({ live: FX.n, born: FX.born }),   // (her wake's sprites, for the checks)
    previewEnding, endPreview, inPreview: () => !!PV
  });
})();
