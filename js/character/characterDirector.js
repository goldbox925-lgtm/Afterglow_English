/* =====================================================================
   Character director — which image of her is on screen, where, how.
   ---------------------------------------------------------------------
   Driven by the emotional STATE (AG.FSM), never by a clock:

     opening      A lying (~1 s) → I pushing up → H seated, from behind
     NUMBNESS     H seated, looking at the dark city (for as long as it takes)
     FRACTURE     a short reaction beat: B hugging her knees (reverse angle),
                  then H again — still seated, still hurting
     AWAKENING    H seated; a faint aura grows as light returns around her
     RECLAIMING   a short beat: she stands (H → J), then stays standing
     AFTERGLOW    lift-off beat: J → D rising → (flash) G flying, banking.
                  Holding ↑ plays the emotional ARC (AG.Flight.phase):
                    SUFFERING   B  curled up in the air, trembling, sinking
                    RESISTANCE  B → C  kneeling in the air, straining, looking up
                    RELEASE     C → E  the body extends, arms open
                    LEVITATION  E  weightless, slow and full-bodied
                    ASCENSION   E  rising fast, still clearly visible
                    LIGHT       E  into the light (only after sustained ascension)
                  In the air every pose turns to face the lens (mode 'cyl'),
                  and glow/particles stay low so she remains the centre.

   EXHAUSTION before that: slow, heavy breathing and recurring sobs (small
   trembles) while she lies and sits; standing up in 04 is a struggle
   (H → I pushing up, shaking → C kneeling, looking up → J standing).

   The images are never stretched to fake joint motion. Pose changes are
   cross-dissolves, camera cuts or light flashes. Motion is code: breath,
   flinch, bob, rise, bank, aura, trail.
   ===================================================================== */
window.AG = window.AG || {};

AG.CharacterDirector = (function () {
  const U = AG.U, V = U.v3;
  const D = { out: null };
  let spots = null;
  let cur = 'A', prev = null, t0 = -1e9, fade = 0, flashAt = -1e9;

  function setInfo(info) {
    const H0 = info.hero.H0;
    spots = { lie: [1.0, H0, -15.2], edge: [0.6, H0, -19.4], H0 };
    reset();
  }
  function reset() { cur = 'A'; prev = null; t0 = -1e9; fade = 0; flashAt = -1e9; }

  /* switch pose: fade = cross-dissolve seconds (0 = cut), flash = cover with light */
  function setPose(id, at, f, flash) {
    if (id === cur) return;
    prev = f > 0 ? cur : null; cur = id; t0 = at; fade = f || 0;
    if (flash) flashAt = at;
  }

  /* which pose the story wants now */
  function wanted(at) {
    const F = AG.FSM, st = F.state, cin = F.cinematic;
    if (st === 'NUMBNESS') {
      const t = F.stateTime;
      if (cin && cin.name === 'intro') return t < 1.15 ? ['A'] : t < 2.5 ? ['I', 0.45, true] : ['H', 0];
      return ['H', 0];
    }
    if (st === 'FRACTURE') { if (cin && cin.name === 'fracture') return cin.t < 2.6 ? ['B', 0] : ['H', 0]; return ['H', 0]; }
    if (st === 'AWAKENING') return ['H', 0];
    if (st === 'RECLAIMING_SELF') {
      // standing up is hard: push up, shake, kneel, look up, then stand
      if (cin && cin.name === 'stand') return cin.t < 1.6 ? ['H', 0] : cin.t < 3.8 ? ['I', 0.5] : cin.t < 6.0 ? ['C', 0] : ['J', 0];
      return ['J', 0];
    }
    if (st === 'AFTERGLOW') {
      if (cin && cin.name === 'liftoff') return cin.t < 1.2 ? ['J', 0] : cin.t < 3.4 ? ['D', 0.9] : ['G', 0.5, true];
      const Fl = AG.Flight;
      if (Fl.finale) return Fl.gliding ? ['G', 0.6] : ['E', 0];   // glide (back view, flying) → the ascent
      if (Fl.arc) {
        // ArrowUp is ascent, not a replay of her earlier suffering.
        // Keep her visibly airborne from the first press.
        return ['E', 0.45];
      }
      return ['G', 0.6];
    }
    return ['H', 0];
  }

  /* recurring sobs: a short tremble every few seconds (0..1) */
  function sob(at) {
    const T = 5.6, x = at % T, n = Math.floor(at / T);
    if (U.hash(n * 3.7) < 0.3) return 0;
    return x < 1.3 ? Math.sin(x / 1.3 * Math.PI) * (0.6 + 0.4 * Math.abs(Math.sin(at * 19))) : 0;
  }

  /* a pose in the air during the ascension arc (faces the lens, stays readable) */
  function placeAir(P, id, at, S) {
    const Fl = AG.Flight, a = Fl.ascT, meta = AG.CHARACTER_MANIFEST.poses[id];
    P.mode = 'cyl'; P.air = true;
    const fs = Fl.state();
    const H = meta.fit === 'height' ? meta.size : meta.size * 0.75;
    P.anchorPos = meta.anchor === 'bottom' ? V.add(fs.pos, [0, -H * 0.5, 0]) : fs.pos.slice();
    P.flight = fs;
    const heavy = 1 - U.smooth(1.4, 4.4, a);                  // weight that has not let go yet
    const lev = U.smooth(3.8, 9, a);                          // weightlessness
    P.shake = Fl.holding || Fl.finale ? (0.03 * heavy + 0.012 * sob(at) * heavy) : 0.008 * heavy;
    P.breath = (0.012 * heavy + 0.004) * S.breath;
    P.bob = lev * 0.07 * Math.sin(at * 1.2) - heavy * 0.06 * (0.5 + 0.5 * Math.sin(at * 0.7));
    // light stays modest: she, not the glow, is the centre of the scene
    P.aura = id === 'E' ? 0.12 + 0.18 * lev + (Fl.finale ? 0.2 : 0) : id === 'C' ? 0.1 + 0.1 * U.smooth(2.6, 4.6, a) : 0.04;
    return P;
  }

  function place(id, at, S) {
    const meta = AG.CHARACTER_MANIFEST.poses[id];
    const P = { id, anchorPos: null, mode: meta.mode, face: meta.face || 0, breath: 0, bob: 0, aura: 0, shake: 0, roll: 0 };
    const F = AG.FSM, cin = F.cinematic;
    const sink = meta.sink || 0;
    const exhausted = F.state === 'NUMBNESS' || F.state === 'FRACTURE' ? 1 : F.state === 'AWAKENING' ? 0.55 : 0.25;
    if (F.state === 'AFTERGLOW' && !cin && (AG.Flight.arc || AG.Flight.finale) && (id === 'B' || id === 'C' || id === 'E')) return placeAir(P, id, at, S);
    switch (id) {
      case 'A': case 'I': case 'B': case 'C': {
        P.anchorPos = V.add(spots.lie, [0, -sink, 0]);
        P.breath = (id === 'A' ? 0.016 : 0.011) * S.breath;
        // sobbing while she lies and hugs her knees; shaking with effort when she pushes up
        const strain = id === 'I' && cin && cin.name === 'stand' ? 0.018 : 0;
        P.shake = S.impact * 0.02 + 0.012 * sob(at) * exhausted + strain;
        P.aura = id === 'C' && F.state === 'RECLAIMING_SELF' ? 0.12 : 0;
        break;
      }
      case 'H':
        P.anchorPos = V.add(spots.lie, [0, -sink, -0.15]);
        // slumped, heavy breathing; recurring sobs that fade as the city returns
        P.breath = (0.009 + 0.006 * exhausted) * S.breath; P.shake = S.impact * 0.015 + 0.01 * sob(at) * exhausted;
        P.bob = -0.012 * exhausted * (0.5 + 0.5 * Math.sin(at * 0.5));
        // she begins to notice the returning light
        P.aura = F.state === 'AWAKENING' ? 0.06 + 0.22 * U.smooth(0.0, 0.3, AG.Interactions.progress) : 0;
        break;
      case 'J':
        P.anchorPos = spots.edge.slice(); P.breath = 0.006 * S.breath;
        P.aura = 0.15 + 0.25 * U.smooth(0.3, 0.62, AG.Interactions.progress);
        break;
      case 'D': {
        const k = cin && cin.name === 'liftoff' ? U.easeInOut(U.clamp((cin.t - 1.2) / 2.2, 0, 1)) : 1;
        P.anchorPos = V.add(spots.edge, [0, 0.95 * k, -1.2 * k]); P.bob = 0.03 * Math.sin(at * 1.7) * k; P.aura = 0.45 + 0.4 * k;
        break;
      }
      case 'E': {
        const k = cin && cin.name === 'liftoff' ? U.easeInOut(U.clamp((cin.t - 3.0) / 2.6, 0, 1)) : 1;
        P.anchorPos = V.add([0.6, spots.H0 + 1.75, -20.6], [0, 1.9 * k, -2.4 * k]);
        P.bob = 0.06 * Math.sin(at * 1.3); P.aura = 0.85 + 0.15 * Math.sin(at * 2.1);
        break;
      }
      case 'F': case 'G': {
        const fs = AG.Flight.state();
        P.anchorPos = fs.pos.slice(); P.flight = fs; P.roll = fs.bank * (1 - fs.upright * 0.7);
        P.aura = 0.8 + 0.7 * fs.upright + 0.4 * AG.Flight.asc;
        P.bob = 0.05 * Math.sin(at * 2.3) * (1 - fs.speedN);
        break;
      }
    }
    return P;
  }

  function update(at, S) {
    if (!spots) return null;
    const w = wanted(at);
    setPose(w[0], at, w[1], w[2]);
    const items = [];
    const k = fade > 0 ? U.clamp((at - t0) / fade, 0, 1) : 1;
    if (prev && k < 1) {
      const a = place(prev, at, S); a.alpha = 1; a.dissolve = U.smooth(0, 1, k); items.push(a);
      const b = place(cur, at, S); b.alpha = 1; b.dissolve = 1 - U.smooth(0, 1, k); b.incoming = true; items.push(b);
    } else { const a = place(cur, at, S); a.alpha = 1; a.dissolve = 0; items.push(a); }
    const flash = Math.exp(-Math.max(0, at - flashAt) * 3.5) * (at >= flashAt ? 1 : 0);
    const main = items.at(-1);
    const air = !!main.air;
    const flying = main.id === 'F' || main.id === 'G' || air;
    const fs = flying ? AG.Flight.state() : null;
    const a = AG.Flight.ascT;
    D.out = {
      items, main, flash, flying, air,
      // in the ascension arc the trail is a thin wake beneath her, never a veil
      trail: air ? 0.18 * U.smooth(7, 16, a) : flying ? U.clamp(0.35 + 0.65 * fs.speedN, 0, 1) : 0,
      sparkle: air ? (main.id === 'E' ? 0.08 + 0.12 * U.smooth(6, 14, a) : 0) : Math.max(main.id === 'D' ? 0.7 : 0, flying ? 0.5 : 0, main.id === 'J' ? 0.25 * U.smooth(0.4, 0.62, AG.Interactions.progress) : 0),
      speedN: fs ? fs.speedN : 0,
      vel: fs ? V.add(V.scale(fs.fwd, fs.speed), [0, fs.vy, 0]) : [0, 0, 0]
    };
    return D.out;
  }

  function trailPoints() { return AG.Flight.trailPoints(); }

  Object.assign(D, { setInfo, update, trailPoints, reset });
  Object.defineProperty(D, 'spots', { get: () => spots });
  return D;
})();
