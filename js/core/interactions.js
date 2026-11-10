/* =====================================================================
   Interactions — the viewer's part in states 01–04.
   ---------------------------------------------------------------------
   01 NUMBNESS   THE PULSE. One window flickers faintly and irregularly,
                 off to the side of the first view. Find it, click it.
                 → the first fracture (impact, lightning) → FRACTURE.
   02 FRACTURE   FRAGILE LIGHTS. Click any of the highlighted windows
                 to steady it: an electric pulse, a glitch, a brief neon
                 flare, a small and LIMITED wave of light (half strength).
                 Four steadied → AWAKENING.
   03 AWAKENING  Click five outlined dark buildings. Light automatically
                 travels from the nearest restored building.
   04 RECLAIMING Connect restored buildings with five visible light paths.
                 Drag from one golden point to another, or click one and
                 then another. The fifth connection unlocks flight.
   ===================================================================== */
window.AG = window.AG || {};

AG.Interactions = (function () {
  const U = AG.U, V = U.v3, C = AG.CONFIG, IC = C.interaction, NC = IC.network;
  const I = {
    vantage: null, beacon: null, fragile: [], nodes: [], links: [], hintLevel: 0, hint: null,
    progress: 0, hover: -1, dragging: false, dragFrom: -1, dragTo: null, beaconScreen: null,
    stabilised: 0, connections: 0, awakeningConnections: 0, cityLinks: 0, selectedBuilding: -1,
    // what each stage actually requires in THIS city: the configured amount, or fewer if
    // the generated city provides fewer targets (so a stage can never become impossible)
    need: { fragile: IC.fragile.needed, awakening: NC.awakeningNeeded, links: NC.reclaimingLinks }
  };
  let info = null, R = null, lastAction = 0, holdIdx = -1, holdT = 0, baseNodes = [];
  let shaftPool = [];   // buildings with facades (stage 03 top-up candidates)

  /* ---------------- geometry helpers ---------------- */
  function faceToward(b, from, sh) {
    const dx = from[0] - b.cx, dz = from[2] - b.cz;
    if (Math.abs(dx) / sh.w > Math.abs(dz) / sh.d) { const sx = Math.sign(dx) || 1; return { o: [b.cx + sx * sh.w / 2, 0, b.cz], n: [sx, 0, 0], t: [0, 0, sx], len: sh.d }; }
    const sz = Math.sign(dz) || 1; return { o: [b.cx, 0, b.cz + sz * sh.d / 2], n: [0, 0, sz], t: [-sz, 0, 0], len: sh.w };
  }
  const visibleFrom = (a, p, n, skip) => AG.Flight.segmentClear(a, V.add(p, V.scale(n, 2.2)), 0, skip) > 0.999;
  /* a window on one facade segment; yk = height within the WHOLE tower (0 bottom … 1 top) */
  function windowOn(b, from, R, yk) {
    const segs = b.shafts && b.shafts.length ? b.shafts : [b.shaft];
    const y0 = segs[0].y0, y1 = segs.at(-1).y1;
    const yw = y0 + (y1 - y0) * yk;
    const sh = segs.find((g) => yw >= g.y0 && yw <= g.y1) || segs.at(-1);
    const F = faceToward(b, from, sh);
    const y = U.clamp(yw, sh.y0 + 4, sh.y1 - 4);
    const lat = (F.len / 2 - 3.5) * R.range(-0.6, 0.6);
    return { pos: V.add(V.add([F.o[0], y, F.o[2]], V.scale(F.t, lat)), V.scale(F.n, 0.22)), n: F.n, right: F.t, up: [0, 1, 0] };
  }
  /* the highest visible window on this tower (tries a few heights) */
  function visibleWindow(b, R, ks) {
    for (const yk of ks) { const c = windowOn(b, I.vantage, R, yk); if (visibleFrom(I.vantage, c.pos, c.n, b)) { c.box = b; return c; } }
    return null;
  }
  function seedOf() { let s = 0; for (const b of info.boxes) s = (s + b.top * 131.7 + b.cx * 7.1) % 1e9; return Math.floor(s) || 7; }
  const angOf = (p) => Math.atan2(p[0] - I.vantage[0], -(p[2] - I.vantage[2]));
  const distOf = (p) => Math.hypot(p[0] - I.vantage[0], p[2] - I.vantage[2]);

  /* ---------------- setup ---------------- */
  function build(inf, restoration) {
    info = inf; R = restoration;
    I.vantage = V.add(AG.CharacterDirector.spots.lie, [3, 10, 27]);
    const rng = U.rng(seedOf());
    const shafts = info.boxes.map((b, idx) => ({ b, idx })).filter((o) => o.b.building && o.b.shaft && o.b.top > 30);
    const used = new Set();
    // 01 the pulse: off the first view, 140–460 m, visible
    const pickOne = (angLo, angHi, dLo, dHi, yk) => {
      let best = null, bs = 1e9;
      for (const { b, idx } of shafts) {
        if (used.has(idx)) continue;
        const c = [b.cx, 0, b.cz], d = distOf(c), a = Math.abs(angOf(c)) * 57.3;
        if (d < dLo || d > dHi || a < angLo || a > angHi) continue;
        const w = visibleWindow(b, rng, [0.8, 0.6, 0.4]);
        if (!w) continue;
        const sc = Math.abs(d - 260) + rng.next() * 80;
        if (sc < bs) { bs = sc; best = Object.assign(w, { idx }); }
      }
      if (best) used.add(best.idx);
      return best;
    };
    I.beacon = pickOne(55, 125, 140, 460) || pickOne(30, 160, 100, 700) || pickOne(0, 180, 60, 1000);
    // 02 fragile lights: spread across the view in front of her, closer than the network edge
    I.fragile = [];
    const sectors = [-62, -38, -14, 10, 34, 58];
    for (const a0 of sectors) {
      let best = null, bs = 1e9;
      for (const { b, idx } of shafts) {
        if (used.has(idx)) continue;
        const c = [b.cx, 0, b.cz], d = distOf(c), a = angOf(c) * 57.3;
        if (d < 110 || d > 420 || Math.abs(a - a0) > 14) continue;
        const w = visibleWindow(b, rng, [0.85, 0.65, 0.45]);
        if (!w) continue;
        const sc = Math.abs(a - a0) * 3 + Math.abs(d - 240) * 0.2 + rng.next() * 20;
        if (sc < bs) { bs = sc; best = Object.assign(w, { idx }); }
      }
      if (best) { used.add(best.idx); I.fragile.push(Object.assign(best, { phase: rng.next() * 100, rate: rng.range(0.7, 1.4), stable: false, stableAt: 0, hold: 0 })); }
    }
    // some cities leave a sector empty: fill up to the required number with a wider search
    // (80–600 m, ±80°), so stage 02 always has enough windows. Cities that already had
    // enough skip this, so their targets are unchanged.
    if (I.fragile.length < IC.fragile.needed) {
      const extra = [];
      for (const { b, idx } of shafts) {
        if (used.has(idx)) continue;
        const c = [b.cx, 0, b.cz], d = distOf(c), a = angOf(c) * 57.3;
        if (d < 80 || d > 600 || Math.abs(a) > 80) continue;
        extra.push({ b, idx, sc: Math.abs(d - 240) * 0.2 + Math.abs(a) * 0.5 });
      }
      extra.sort((x, y) => x.sc - y.sc);
      for (const o of extra) {
        if (I.fragile.length >= IC.fragile.needed) break;
        const w = visibleWindow(o.b, rng, [0.85, 0.65, 0.45]);
        if (!w || I.fragile.some((f) => V.len(V.sub(f.pos, w.pos)) < 40)) continue;
        used.add(o.idx);
        I.fragile.push(Object.assign(w, { idx: o.idx, phase: rng.next() * 100, rate: rng.range(0.7, 1.4), stable: false, stableAt: 0, hold: 0 }));
      }
    }
    I.need.fragile = Math.min(IC.fragile.needed, I.fragile.length);
    // 03/04 the network: windows spread over the city in front of her, ≥ 70 m apart
    const pool = [];
    for (const { b, idx } of shafts) {
      if (used.has(idx)) continue;
      const c = [b.cx, 0, b.cz], d = distOf(c), a = Math.abs(angOf(c)) * 57.3;
      if (d < 60 || d > 1000 || a > 110) continue;
      pool.push({ b, idx, d, k: rng.next() });
    }
    pool.sort((x, y) => x.k - y.k);
    const nodes = [];
    for (const o of pool) {
      if (nodes.length >= NC.nodes) break;
      const w = visibleWindow(o.b, rng, [0.9, 0.7, 0.5, 0.3]);
      if (!w || nodes.some((n) => V.len(V.sub(n.pos, w.pos)) < 60)) continue;
      nodes.push(Object.assign(w, { idx: o.idx, lit: false, litAt: -1e9, seed: false, col: null }));
    }
    baseNodes = nodes;
    shaftPool = shafts;
    I.nodes = nodes.slice();
    resetState();
  }

  /* the seeds of the network = the pulse + the steadied fragile lights */
  function seedNetwork(at) {
    const seeds = [I.beacon].concat(I.fragile.filter((f) => f.stable));
    seeds.forEach((s, k) => {
      if (!s) return;
      if (I.nodes.some((n) => n.seed && V.len(V.sub(n.pos, s.pos)) < 1)) return;
      I.nodes.push(Object.assign({}, s, { lit: true, litAt: at, seed: true, col: IC.colours.at(k % IC.colours.length) }));
    });
    // keep only nodes the light can actually reach from a seed (the graph stays connected)
    const reach = new Set(I.nodes.map((n, i) => (n.seed ? i : -1)).filter((i) => i >= 0));
    let grew = true;
    while (grew) {
      grew = false;
      I.nodes.forEach((n, i) => {
        if (reach.has(i)) return;
        for (const j of reach) if (V.len(V.sub(n.pos, I.nodes[j].pos)) <= NC.linkRange) { reach.add(i); grew = true; break; }
      });
    }
    I.nodes = I.nodes.filter((n, i) => reach.has(i));
    topUpReachable();
  }

  /* Stage 03 always asks for exactly NC.awakeningNeeded (5) buildings. If fewer dark
     buildings are reachable, add the closest suitable EXISTING buildings whose visible
     window lies within reach of the network, one at a time (each one extends the reach).
     Deterministic: a fixed candidate order and the interaction module's own seeded
     sequence, so the city (geometry and its random sequence) is untouched.              */
  function topUpReachable() {
    let missing = NC.awakeningNeeded - I.nodes.filter((n) => !n.seed).length;
    if (missing <= 0) return;
    const rng = U.rng((seedOf() ^ 0x3a7f1) >>> 0);
    // buildings that already carry a target (incl. the pulse and the steadied windows) are skipped;
    // an unsteadied fragile window is gone after stage 02, so its building may be used
    const taken = new Set();
    I.nodes.forEach((n) => { if (n.idx !== undefined) taken.add(n.idx); });
    const range = NC.linkRange * 0.95;
    for (let guard = 0; missing > 0 && guard < 40; guard++) {
      // candidates: unused buildings in front of her whose footprint is near the network
      const cands = [];
      for (const { b, idx } of shaftPool) {
        if (taken.has(idx)) continue;
        const c = [b.cx, 0, b.cz];
        if (distOf(c) < 60 || distOf(c) > 1000 || Math.abs(angOf(c)) * 57.3 > 110) continue;
        let near = 1e9;
        for (const n of I.nodes) near = Math.min(near, Math.hypot(n.pos[0] - b.cx, n.pos[2] - b.cz));
        if (near <= range) cands.push({ b, idx, near });
      }
      cands.sort((x, y) => x.near - y.near || x.idx - y.idx);
      let added = false;
      for (const o of cands) {
        taken.add(o.idx);
        // highest window on this facade that is visible from her roof AND within reach
        // (a tall tower's top window can be out of reach even when the tower is close)
        let w = null;
        for (const yk of [0.9, 0.75, 0.6, 0.45, 0.3, 0.15]) {
          const c = windowOn(o.b, I.vantage, rng, yk);
          if (!visibleFrom(I.vantage, c.pos, c.n, o.b)) continue;
          if (I.nodes.some((n) => V.len(V.sub(n.pos, c.pos)) < 40)) continue;          // keep targets apart
          if (!I.nodes.some((n) => V.len(V.sub(n.pos, c.pos)) <= range)) continue;     // must be reachable
          c.box = o.b; w = c; break;
        }
        if (!w) continue;
        I.nodes.push(Object.assign(w, { idx: o.idx, lit: false, litAt: -1e9, seed: false, col: null, topUp: true }));
        missing--; added = true;
        break;
      }
      if (!added) break;
    }
  }

  function resetState() {
    I.fragile.forEach((f) => { f.stable = false; f.hold = 0; });
    I.nodes = baseNodes.slice();
    I.nodes.forEach((n) => { n.lit = false; n.litAt = -1e9; n.col = null; });
    lastAction = 0; holdIdx = -1; holdT = 0;
    I.links = []; I.progress = 0; I.stabilised = 0; I.connections = 0; I.awakeningConnections = 0; I.cityLinks = 0;
    I.selectedBuilding = -1; I.hintLevel = 0; I.hint = null; I.dragging = false; I.dragFrom = -1;
  }

  /* ---------------- camera geometry ---------------- */
  function basis(cam) {
    const dir = V.norm(V.sub(cam.target, cam.pos)), right = V.norm(V.cross(dir, [0, 1, 0])), up = V.cross(right, dir);
    return { dir, right, up, th: Math.tan(cam.fov * Math.PI / 360), asp: window.innerWidth / window.innerHeight };
  }
  function project(p, cam) {
    const B = basis(cam), v = V.sub(p, cam.pos), z = V.dot(v, B.dir);
    if (z <= 0.1) return null;
    const x = V.dot(v, B.right) / (z * B.th * B.asp), y = V.dot(v, B.up) / (z * B.th);
    return { x: (x + 1) / 2 * window.innerWidth, y: (1 - y) / 2 * window.innerHeight, on: Math.abs(x) < 1 && Math.abs(y) < 1, nx: x, ny: y, z };
  }
  function nearestOnScreen(list, px, py, cam, tol, filter) {
    let best = -1, bd = tol;
    list.forEach((n, i) => {
      if (filter && !filter(n, i)) return;
      const s = project(n.pos, cam); if (!s || !s.on) return;
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /* ---------------- 01: the pulse ---------------- */
  function findPulse(at, auto) {
    if (AG.FSM.state !== 'NUMBNESS') return;
    R.add({ x: I.beacon.pos[0], z: I.beacon.pos[2], y: I.beacon.pos[1], R: 46, dur: 2.4, strength: 0.6, col: [1, 0.78, 0.86], t0: at, auto, kind: 'pulse' });
    if (!auto) U.emit('fracture', { pos: I.beacon.pos });
    lastAction = at;
    if (!auto) AG.FSM.advance('NUMBNESS');
  }

  /* ---------------- 02: fragile lights ---------------- */
  function fragileOn(f, at) {
    if (f.stable) return 1;
    // irregular: two incommensurate flickers + occasional long blackouts
    const a = Math.sin(at * 3.1 * f.rate + f.phase) + Math.sin(at * 7.3 * f.rate + f.phase * 1.7) * 0.6;
    const blackout = U.hash(Math.floor((at + f.phase) / 2.3)) < 0.22;
    return blackout ? 0 : a > -0.25 ? 1 : 0;
  }
  function stabilise(f, at, auto) {
    if (f.stable) return;
    f.stable = true; f.stableAt = at; I.stabilised++;
    const col = IC.colours.at((I.stabilised - 1) % IC.colours.length);
    R.add({ x: f.pos[0], z: f.pos[2], y: f.pos[1], R: IC.fragile.radius, dur: 1.6, strength: 0.5, col, t0: at, auto, kind: 'fragile' });
    if (!auto) U.emit('stabilise', { n: I.stabilised, needed: IC.fragile.needed, pos: f.pos });
    lastAction = at;
    if (I.stabilised >= I.need.fragile && !auto) AG.FSM.advance('FRACTURE');
  }

  /* ---------------- 03/04: the network ---------------- */
  const inReach = (a, b) => V.len(V.sub(a.pos, b.pos)) <= NC.linkRange * (AG.FSM.state === 'RECLAIMING_SELF' ? 1.15 : 1);
  function connect(i, j, at, auto) {
    const a = I.nodes[i], b = I.nodes[j];
    if (!a || !b || !a.lit || b.lit) return false;
    const recl = AG.FSM.state === 'RECLAIMING_SELF';
    b.lit = true; b.litAt = at + (auto ? 0 : 0.85);
    b.col = a.col && !auto && U.hash(I.connections * 3.1) < 0.5 ? a.col : IC.colours.at(I.connections % IC.colours.length);
    I.links.push({ a: i, b: j, t0: auto ? -1e9 : at, col: b.col });
    I.connections++;
    if (AG.FSM.state === 'AWAKENING') I.awakeningConnections++;
    R.add({ x: b.pos[0], z: b.pos[2], y: b.pos[1], R: recl ? NC.reclaimingRadius : NC.awakeningRadius, dur: recl ? 3.2 : 2.4, strength: recl ? 1 : 0.85, col: b.col, t0: auto ? -1e9 : at + 0.85, kind: 'node' });
    if (!auto) U.emit('connect', { n: I.connections, from: a.pos, to: b.pos, col: b.col, reclaiming: recl });
    // RECLAIMING: whole districts answer — the closest dark neighbours wake a moment later
    if (recl) {
      I.nodes.map((n, k) => ({ n, k, d: V.len(V.sub(n.pos, b.pos)) })).filter((o) => !o.n.lit && o.d < 105).sort((x, y) => x.d - y.d).slice(0, 2)
        .forEach((o, m) => { o.n.lit = true; o.n.litAt = (auto ? -1e9 : at + 1.6 + m * 0.5); o.n.col = b.col; I.links.push({ a: j, b: o.k, t0: auto ? -1e9 : at + 0.9 + m * 0.5, col: b.col });
          R.add({ x: o.n.pos[0], z: o.n.pos[2], y: o.n.pos[1], R: NC.reclaimingRadius * 0.85, dur: 3, strength: 0.95, col: b.col, t0: auto ? -1e9 : at + 1.6 + m * 0.5, kind: 'cascade' }); });
    }
    lastAction = at;
    return true;
  }

  /* State 04: connect two buildings that are already awake. This is a
     deliberately different, visible action from clicking dark nodes in 03. */
  function connectBuildings(i, j, at, auto) {
    const a = I.nodes[i], b = I.nodes[j];
    if (!a || !b || i === j || !a.lit || !b.lit || at < a.litAt || at < b.litAt) return false;
    const duplicate = I.links.some((l) => l.city && ((l.a === i && l.b === j) || (l.a === j && l.b === i)));
    if (duplicate) return false;
    const col = IC.colours.at((I.cityLinks + 4) % IC.colours.length);
    I.links.push({ a: i, b: j, t0: auto ? -1e9 : at, col, city: true });
    I.cityLinks++; I.connections++;
    const mx = (a.pos[0] + b.pos[0]) * 0.5, mz = (a.pos[2] + b.pos[2]) * 0.5, my = (a.pos[1] + b.pos[1]) * 0.5;
    R.add({ x: mx, z: mz, y: my, R: NC.reclaimingRadius, dur: 3.2, strength: 1, col, t0: auto ? -1e9 : at + 0.45, kind: 'city-link' });
    if (!auto) U.emit('connect', { n: I.connections, cityLinks: I.cityLinks, from: a.pos, to: b.pos, col, reclaiming: true });
    lastAction = at;
    if (!auto && I.cityLinks >= NC.reclaimingLinks) AG.FSM.advance('RECLAIMING_SELF');
    return true;
  }
  function reachableDark() { return I.nodes.map((n, k) => k).filter((k) => !I.nodes[k].lit && I.nodes.some((m) => m.lit && inReach(m, I.nodes[k]))); }
  function connectNearestTo(j, at) {
    let best = -1, bd = 1e9;
    I.nodes.forEach((n, i) => { if (n.lit && inReach(n, I.nodes[j])) { const d = V.len(V.sub(n.pos, I.nodes[j].pos)); if (d < bd) { bd = d; best = i; } } });
    return best >= 0 ? connect(best, j, at, false) : false;
  }
  /* overall progress: the restored share of the city, or the share of the network lit
     (whichever is further), so every seed reaches the thresholds by connecting nodes */
  function progressNow() {
    const net = I.nodes.filter((n) => !n.seed);
    const lit = net.filter((n) => n.lit).length;
    const networkProgress = net.length ? NC.toAfterglow * lit / (0.8 * net.length) : 0;
    const linkProgress = NC.toReclaiming + (NC.toAfterglow - NC.toReclaiming) * U.clamp(I.cityLinks / NC.reclaimingLinks, 0, 1);
    return Math.min(1, Math.max(R.progress, networkProgress, I.cityLinks ? linkProgress : 0));
  }
  function checkProgress() {
    const st = AG.FSM.state, P = (I.progress = progressNow());
    if (st === 'AWAKENING' && I.awakeningConnections >= I.need.awakening) AG.FSM.advance('AWAKENING');
  }

  /* default choices when a presentation jump skips a state */
  function autoComplete(state) {
    const at = AG.FSM.animTime;
    if (state === 'NUMBNESS') findPulse(at, true);
    else if (state === 'FRACTURE') { I.fragile.forEach((f) => { if (I.stabilised < I.need.fragile) stabilise(f, at, true); }); seedNetwork(at); }
    else if (state === 'AWAKENING') {
      if (!I.nodes.some((n) => n.seed)) seedNetwork(at);
      let guard = 200;
      while (guard-- > 0 && I.awakeningConnections < I.need.awakening) {
        const dark = reachableDark(); if (!dark.length) break;
        const j = dark[Math.floor(U.hash(guard * 7.7 + I.connections) * dark.length)];
        let src = I.nodes.findIndex((n) => n.lit && inReach(n, I.nodes[j]));
        connect(src, j, at, true);
      }
      I.progress = progressNow();
    } else if (state === 'RECLAIMING_SELF') {
      if (!I.nodes.some((n) => n.seed)) seedNetwork(at);
      const lit = I.nodes.map((n, i) => n.lit ? i : -1).filter((i) => i >= 0);
      let guard = 200;
      while (guard-- > 0 && I.cityLinks < NC.reclaimingLinks) {
        const a = lit[Math.floor(U.hash(guard * 2.7) * lit.length)];
        const b = lit[Math.floor(U.hash(guard * 5.9 + 3) * lit.length)];
        connectBuildings(a, b, at, true);
      }
      I.progress = progressNow();
    }
  }

  /* ---------------- per frame ---------------- */
  function update(dt, at, input, cam) {
    const st = AG.FSM.state, local = AG.FSM.stateTime, cinema = AG.FSM.inCinematic;
    I.beaconScreen = null; I.hint = null; I.hover = -1; I.dragTo = null; I.fragHover = -1; I.charge = null;
    if (cinema || st === 'AFTERGLOW') { I.dragging = false; return; }

    if (st === 'NUMBNESS' && I.beacon) {
      const H = IC.pulse.hints, t = local - 6;   // the opening shot takes ~6 s
      I.hintLevel = Math.max(2, t > H[3] ? 4 : t > H[2] ? 3 : t > H[1] ? 2 : t > H[0] ? 1 : 0);
      const sp = project(I.beacon.pos, cam), vis = sp && visibleFrom(cam.pos, I.beacon.pos, I.beacon.n, I.beacon.box);
      I.beaconScreen = sp ? Object.assign(sp, { visible: !!vis }) : null;
      if (input.click) {
        const ok = sp && vis && Math.hypot(input.click.x - sp.x, input.click.y - sp.y) < IC.pulse.tolerancePx * (1 + 0.25 * I.hintLevel);
        if (ok) findPulse(at, false);
        else U.emit('tap', { x: input.click.x, y: input.click.y, near: sp && sp.on && Math.hypot(input.click.x - sp.x, input.click.y - sp.y) < 160 });
      }
      if (input.enter && sp && vis && Math.abs(sp.nx) < 0.3 && Math.abs(sp.ny) < 0.3) findPulse(at, false);
      return;
    }

    if (st === 'FRACTURE') {
      // safety net: a city with no fragile windows at all must not trap the story here
      if (I.need.fragile === 0) { AG.FSM.advance('FRACTURE'); return; }
      I.fragile.forEach((f) => { f.on = fragileOn(f, at); });
      const pick = (x, y) => nearestOnScreen(I.fragile, x, y, cam, IC.fragile.tolerancePx, (f) => !f.stable);
      if (input.px !== undefined) I.fragHover = pick(input.px, input.py);
      if (input.click) {
        const k = pick(input.click.x, input.click.y);
        if (k >= 0) stabilise(I.fragile[k], at, false);
        else U.emit('tap', { x: input.click.x, y: input.click.y, near: k >= 0, dark: k >= 0 });
      }
      const target = I.fragile.findIndex((f) => !f.stable && project(f.pos, cam)?.on);
      if (target >= 0) I.hint = project(I.fragile[target].pos, cam);
      if (st === 'FRACTURE' && AG.FSM.state === 'AWAKENING') seedNetwork(at);
      return;
    }

    if (st === 'AWAKENING') {
      if (!I.nodes.some((n) => n.seed)) seedNetwork(at);
      const tol = NC.tolerancePx;
      const darkPick = (x, y) => nearestOnScreen(I.nodes, x, y, cam, tol * 1.2, (n) => !n.lit);
      if (input.px !== undefined) I.hover = darkPick(input.px, input.py);
      if (input.click) {
        const j = darkPick(input.click.x, input.click.y);
        if (j >= 0) { if (!connectNearestTo(j, at)) U.emit('tap', { x: input.click.x, y: input.click.y, far: true }); }
        else U.emit('tap', { x: input.click.x, y: input.click.y });
      }
      const dark = reachableDark();
      let best = null, bd = 1e9;
      for (const j of dark) { const s = project(I.nodes[j].pos, cam); if (s && s.on) { const d = Math.hypot(s.nx, s.ny); if (d < bd) { bd = d; best = s; } } }
      I.hint = best;
      checkProgress();
      return;
    }

    if (st === 'RECLAIMING_SELF') {
      if (!I.nodes.some((n) => n.seed)) seedNetwork(at);
      const tol = NC.tolerancePx * 1.35;
      const litPick = (x, y) => nearestOnScreen(I.nodes, x, y, cam, tol, (n) => n.lit && at >= n.litAt);
      if (input.px !== undefined) I.hover = litPick(input.px, input.py);
      if (input.pressed && !I.dragging) {
        const k = litPick(input.pressed.x, input.pressed.y);
        if (k >= 0) { I.dragging = true; I.dragFrom = I.selectedBuilding >= 0 ? I.selectedBuilding : k; }
      }
      if (I.dragging) {
        I.dragTo = { x: input.px, y: input.py };
        const jh = litPick(input.px, input.py);
        I.dragOk = jh >= 0 && jh !== I.dragFrom;
        if (jh >= 0) I.hover = jh;
        if (input.released) {
          const j = litPick(input.released.x, input.released.y);
          if (j >= 0 && j !== I.dragFrom && connectBuildings(I.dragFrom, j, at, false)) I.selectedBuilding = -1;
          else if (j === I.dragFrom && input.released.moved < 8) I.selectedBuilding = j;
          else if (j >= 0) U.emit('tap', { x: input.released.x, y: input.released.y, near: true });
          I.dragging = false; I.dragFrom = -1;
        }
      }
      const candidates = I.nodes.map((n, i) => n.lit && at >= n.litAt ? i : -1).filter((i) => i >= 0);
      const focus = I.selectedBuilding >= 0 ? I.selectedBuilding : candidates.find((i) => project(I.nodes[i].pos, cam)?.on);
      if (focus >= 0) I.hint = project(I.nodes[focus].pos, cam);
      I.progress = progressNow();
    }
  }

  /* data for the renderer (network shader); link colour = palette index */
  const MAXN = 48;
  const uP = new Float32Array(MAXN * 4), uS = new Float32Array(MAXN * 4), uA = new Float32Array(MAXN * 4), uB = new Float32Array(MAXN * 4);
  function renderData(at) {
    uP.fill(0); uS.fill(0); uA.fill(0); uB.fill(0);
    const st = AG.FSM.state;
    let items = [];
    if (st === 'FRACTURE') items = I.fragile.map((f, k) => ({ pos: f.pos, lit: f.stable ? 1 : f.on * 0.85, kind: f.stable ? 2 : 1, hover: k === I.fragHover ? 1 : 0, col: f.stable ? IC.colours.at(k % 5) : [1, 0.85, 0.75] }));
    else if (st === 'AWAKENING' || st === 'RECLAIMING_SELF') {
      const reach = new Set(reachableDark());
      items = I.nodes.map((n, k) => ({ pos: n.pos, lit: n.lit ? U.clamp((at - n.litAt) / 0.4, 0, 1) : 0, kind: n.lit ? 2 : reach.has(k) ? 3 : 4, hover: k === I.hover || k === I.dragFrom ? 1 : 0, col: n.col || [0.8, 0.85, 1] }));
    } else if (st === 'AFTERGLOW') {
      items = I.nodes.filter((n) => n.lit).map((n) => ({ pos: n.pos, lit: 0.6, kind: 2, hover: 0, col: n.col || [1, 0.8, 0.6] }));
    }
    items.slice(0, MAXN).forEach((o, i) => {
      uP[i * 4] = o.pos[0]; uP[i * 4 + 1] = o.pos[1]; uP[i * 4 + 2] = o.pos[2]; uP[i * 4 + 3] = o.kind;
      uS[i * 4] = o.col[0]; uS[i * 4 + 1] = o.col[1]; uS[i * 4 + 2] = o.col[2]; uS[i * 4 + 3] = o.lit + o.hover * 2;
    });
    const links = st === 'AWAKENING' || st === 'RECLAIMING_SELF' || st === 'AFTERGLOW' ? I.links.slice(-MAXN) : [];
    links.forEach((l, i) => {
      const a = I.nodes[l.a], b = I.nodes[l.b]; if (!a || !b) return;
      const k = U.clamp((at - l.t0) / 0.85, 0, 1);
      uA[i * 4] = a.pos[0]; uA[i * 4 + 1] = a.pos[1]; uA[i * 4 + 2] = a.pos[2]; uA[i * 4 + 3] = k;
      uB[i * 4] = b.pos[0]; uB[i * 4 + 1] = b.pos[1]; uB[i * 4 + 2] = b.pos[2]; uB[i * 4 + 3] = Math.max(0, IC.colours.indexOf(l.col));
    });
    return { nodes: uP, nodeS: uS, linkA: uA, linkB: uB, count: Math.min(items.length, MAXN), linkCount: links.length };
  }

  return Object.assign(I, { progressNow, build, update, renderData, autoComplete, resetState, seedNetwork, project, reachableDark, connectBuildings, MAXN,
    pick: nearestOnScreen });
})();
