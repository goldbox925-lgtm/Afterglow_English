/* =====================================================================
   Round 02 · the 3D heroine (Memory Garden only)
   ---------------------------------------------------------------------
   ONE skinned character, loaded from two Blender exports of the same rig:
     assets/character/3d/Afterglow_Animated.glb
        mesh (49 080 vertices, one texture), skin (24 joints), clips
        Flight (4 s) and Idle_Float (4 s)
     assets/character/3d/Afterglow_Flower_Reaction.glb
        the same mesh and skeleton; only its clip Flower_Reaction (1.667 s)
        is read. Its channels are mapped onto the first file's skeleton by
        joint name (identical hierarchy, identical rest pose), so there is
        one mesh and one skeleton on screen, never two characters.

   What the clips contain (checked in the GLBs and the source .blend files):
     Flight          arms, legs and head ease into the flight pose over
                     0–2 s, then hold it (2–4 s). It is NOT a loop. The body
                     stays UPRIGHT in this export: only the oldest source,
                     Idle_Float.blend, also tips the hips 77° forward.
     Idle_Float,
     Idle_Float.001  identical: the rest pose (arms out), no bone moves.
     both            the Armature node bobs 0.2 m (a seamless 4 s loop).
     Reaction        6 bones (spine, head, arms) move; starts from the rest
                     pose, ends elsewhere (cross-faded back).
   How they are played (the garden's sequence):
     ARRIVE  Idle_Float (Idle_Float.001 is the same) for ARRIVE_T, with a
             procedural breath / sigh on the upper body (spine lifts,
             shoulders rise and settle): there is no breath clip.
     FLIGHT  from 0 once, as the entry transition; with it the body tips
             forward FLIGHT_TILT (rebuilt procedurally: the horizontal pose
             the export lost), so the held pose is horizontal. From then on
             the held pose, never restarted, with a gentle procedural float
             (slow sway and breathing): while she orbits, hovers, and on
             the flight out.
     REACT   once per building, when its flower first opens fully: from the
             held flight pose (the body rises upright with the cross-fade),
             then back to the held flight pose. The upward impulse is the
             movement system's (AG.Flight.gardenImpulse), never the root.
   The body's bob always comes from the Armature node's own curve, on one
   continuous clock, so cross-fades never make her dip or jump. The tilt,
   the sway and the scale are the model matrix only: her flight position,
   speed and collision (AG.Flight's garden mode) are untouched.

   Not loaded at all in Round 01: AG.Garden.start() asks for it. Until it is
   ready (or if it fails, or with ?hero=2d in the URL) the garden keeps the
   original pose images (AG.Renderer.drawCharacterWith).
   ===================================================================== */
window.AG = window.AG || {};

AG.HeroModel = (function () {
  const BASE = 'assets/character/3d/';
  const MAIN = 'Afterglow_Animated.glb', REACT = 'Afterglow_Flower_Reaction.glb';
  const SCALE = 3.3;              // the rig is 1.70 m → about 5.6 m in the garden (3× the first version, 1.1)
  const TEX = 2048;               // texture resized to this (mipmapped)
  const ARRIVE_T = 1.6;           // the arrival breath, before the Flight transition
  const FLIGHT_T = 2.0;           // Flight reaches its held pose here
  const FLIGHT_TILT = 77 * Math.PI / 180;   // the body's forward tip in the horizontal flight pose
  const HEAD_BACK = 0.68;         // rig units from the body's centre back to just behind the head (head top ≈ 0.87)
  const FADE = { toFlight: 0.5, toReact: 0.5, reactOut: 0.9 };
  const HELD = () => clips.Flight.dur;   // a time in Flight where its pose is fully reached (held from 2 s)
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const H = {
    status: 'off', error: null,
    enabled: !/[?&]hero=2d\b/.test(location.search),
    info: null
  };
  let p = null, gl = null, sh = null, geo = null, img = null, mipDone = false;
  let N = 0, parent = null, order = null, rest = null, joints = null, ibm = null, armature = -1;
  const clips = {};
  const bones = new Float32Array(72 * 4);
  const world = [], local = new Float32Array(16), tmp = new Float32Array(16);

  /* ---------- GLB parsing ---------- */
  function parseGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB file');
    let off = 12, json = null, bin = null;
    while (off + 8 <= buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
      else if (type === 0x004E4942) bin = buf.slice(off + 8, off + 8 + len);
      off += 8 + len;
    }
    if (!json || !bin) throw new Error('GLB without JSON or BIN chunk');
    return { json, bin, dv: new DataView(bin) };
  }
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const RD = {
    5120: [1, (d, o) => d.getInt8(o), 127], 5121: [1, (d, o) => d.getUint8(o), 255],
    5122: [2, (d, o) => d.getInt16(o, true), 32767], 5123: [2, (d, o) => d.getUint16(o, true), 65535],
    5125: [4, (d, o) => d.getUint32(o, true), 0], 5126: [4, (d, o) => d.getFloat32(o, true), 0]
  };
  /* an accessor as a flat Float32Array (normalized integers → 0..1), or raw integers for indices */
  function acc(g, i, raw) {
    const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], n = NC[a.type], [sz, get, max] = RD[a.componentType];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * sz;
    const out = raw ? new Uint32Array(a.count * n) : new Float32Array(a.count * n);
    const norm = !raw && a.normalized && max ? 1 / max : 1;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(g.dv, base + k * stride + c * sz) * norm;
    return out;
  }

  /* ---------- small column-major mat4 helpers ---------- */
  function fromTRS(o, T, R, S) {
    const x = R[0], y = R[1], z = R[2], w = R[3], x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    o[0] = (1 - (yy + zz)) * S[0]; o[1] = (xy + wz) * S[0]; o[2] = (xz - wy) * S[0]; o[3] = 0;
    o[4] = (xy - wz) * S[1]; o[5] = (1 - (xx + zz)) * S[1]; o[6] = (yz + wx) * S[1]; o[7] = 0;
    o[8] = (xz + wy) * S[2]; o[9] = (yz - wx) * S[2]; o[10] = (1 - (xx + yy)) * S[2]; o[11] = 0;
    o[12] = T[0]; o[13] = T[1]; o[14] = T[2]; o[15] = 1;
    return o;
  }
  function mul(o, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      for (let r = 0; r < 4; r++) tmp[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
    o.set(tmp); return o;
  }

  /* ---------- skeleton and clips ---------- */
  // a pose: per node T(3) R(4) S(3) = 10 floats
  const newPose = () => new Float32Array(N * 10);
  function buildSkeleton(g) {
    const nodes = g.json.nodes; N = nodes.length;
    parent = new Int16Array(N).fill(-1);
    nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
    order = []; const seen = new Uint8Array(N);
    const visit = (i) => { if (seen[i]) return; if (parent[i] >= 0) visit(parent[i]); seen[i] = 1; order.push(i); };
    for (let i = 0; i < N; i++) visit(i);
    rest = newPose();
    nodes.forEach((n, i) => {
      const o = i * 10, T = n.translation || [0, 0, 0], R = n.rotation || [0, 0, 0, 1], S = n.scale || [1, 1, 1];
      rest.set(T, o); rest.set(R, o + 3); rest.set(S, o + 7);
    });
    const skin = g.json.skins[0];
    joints = skin.joints.slice();
    ibm = acc(g, skin.inverseBindMatrices);
    armature = nodes.findIndex((n) => n.name === 'Armature');
    for (let i = 0; i < N; i++) world[i] = new Float32Array(16);
    H.info = { nodes: N, joints: joints.length, jointNames: joints.map((j) => nodes[j].name), allNames: nodes.map((n) => n.name) };
  }
  /* a clip from any of the two files, its channels mapped onto OUR nodes by name */
  function buildClip(g, name, byName) {
    const a = g.json.animations.find((x) => x.name === name);
    if (!a) return null;
    const ch = []; let dur = 0;
    for (const c of a.channels) {
      const nm = g.json.nodes[c.target.node].name, node = byName[nm], path = c.target.path;
      if (node === undefined || path === 'weights') continue;
      const s = a.samplers[c.sampler], times = acc(g, s.input), vals = acc(g, s.output);
      dur = Math.max(dur, times[times.length - 1]);
      ch.push({ node, path, times, vals, w: path === 'rotation' ? 4 : 3, step: s.interpolation === 'STEP', off: path === 'translation' ? 0 : path === 'rotation' ? 3 : 7, root: node === armature });
    }
    return { name, dur, ch, moving: ch.filter((c) => c.times.length > 2 && !c.root).length };
  }

  function sampleCh(c, t, out, o) {
    const T = c.times, n = T.length, w = c.w, v = c.vals;
    if (n === 1 || t <= T[0]) { for (let k = 0; k < w; k++) out[o + k] = v[k]; return; }
    if (t >= T[n - 1]) { for (let k = 0; k < w; k++) out[o + k] = v[(n - 1) * w + k]; return; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    if (c.step) { for (let k = 0; k < w; k++) out[o + k] = v[lo * w + k]; return; }
    const u = (t - T[lo]) / (T[hi] - T[lo]), a = lo * w, b = hi * w;
    if (w === 4) slerp(out, o, v, a, v, b, u);
    else for (let k = 0; k < w; k++) out[o + k] = v[a + k] + (v[b + k] - v[a + k]) * u;
  }
  function slerp(out, o, A, a, B, b, u) {
    let bx = B[b], by = B[b + 1], bz = B[b + 2], bw = B[b + 3];
    let d = A[a] * bx + A[a + 1] * by + A[a + 2] * bz + A[a + 3] * bw;
    if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let k0 = 1 - u, k1 = u;
    if (d < 0.9995) { const th = Math.acos(d), s = Math.sin(th); k0 = Math.sin(k0 * th) / s; k1 = Math.sin(u * th) / s; }
    const x = A[a] * k0 + bx * k1, y = A[a + 1] * k0 + by * k1, z = A[a + 2] * k0 + bz * k1, w = A[a + 3] * k0 + bw * k1;
    const l = Math.hypot(x, y, z, w) || 1;
    out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
  }
  /* the clip's bones at time t (its root channels are ignored: the bob is applied separately) */
  function sampleClip(out, clip, t) {
    out.set(rest);
    for (const c of clip.ch) if (!c.root) sampleCh(c, t, out, c.node * 10 + c.off);
  }
  function blendInto(out, A, B, k) {
    for (let i = 0; i < N; i++) {
      const o = i * 10;
      for (const q of [0, 1, 2, 7, 8, 9]) out[o + q] = A[o + q] + (B[o + q] - A[o + q]) * k;
      slerp(out, o + 3, A, o + 3, B, o + 3, k);
    }
  }

  /* ---------- the animation controller ---------- */
  // a player: { clip, t, mode: 'hold' (clamp at the end) | 'once', tilt } or a frozen pose { pose, tilt }
  const A = { state: null, cur: null, prev: null, fade: 0, fadeDur: 0, clock: 0, stateT: 0, reactions: 0, log: [], tilt: 0, breath: 0, climb: 0,
    q: null, qdt: 0, calm: 1, spPrev: 0, accS: 0 };
  // the system's "reduce motion" setting: the float, sway and bob are kept small
  const RM = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return null; } })();
  const reducedMotion = () => !!(RM && RM.matches);
  const P0 = { a: null, b: null, out: null };
  function playerPose(pl, out) {
    if (pl.pose) { out.set(pl.pose); return out; }
    const c = pl.clip, t = Math.min(pl.t, c.dur);
    sampleClip(out, c, t); return out;
  }
  // how far the body has tipped into the horizontal flight pose (0 upright … 1 horizontal)
  function playerTilt(pl) {
    if (pl.pose) return pl.tilt;
    return pl.clip === clips.Flight ? smooth(0, FLIGHT_T, Math.min(pl.t, pl.clip.dur)) : 0;
  }
  function currentPose() {
    if (!A.cur) return null;
    playerPose(A.cur, P0.a);
    A.tilt = playerTilt(A.cur);
    if (A.prev && A.fade < A.fadeDur) {
      playerPose(A.prev, P0.b);
      const k = A.fade / A.fadeDur, s = k * k * (3 - 2 * k);
      blendInto(P0.out, P0.b, P0.a, s);
      A.tilt = playerTilt(A.prev) + (A.tilt - playerTilt(A.prev)) * s;
      return P0.out;
    }
    return P0.a;
  }
  function go(state, fade, t0) {
    if (A.state === state) return;
    const clip = state === 'react' ? clips.Flower_Reaction : state === 'arrive' ? clips.Idle_Float : clips.Flight;
    if (!clip) return;
    // whatever is on screen now becomes the pose we fade from (a fade in progress is frozen first)
    if (A.cur && fade > 0) {
      const now = currentPose();
      A.prev = A.prev && A.fade < A.fadeDur ? { pose: now.slice(), tilt: A.tilt } : A.cur;
    } else A.prev = null;
    A.cur = { clip, t: t0 || 0, mode: state === 'react' ? 'once' : 'hold' };
    A.state = state; A.fade = 0; A.fadeDur = fade; A.stateT = 0;
    if (A.log.length > 40) A.log.shift();
    A.log.push({ at: +A.clock.toFixed(2), state, t0: +(t0 || 0).toFixed(2) });
  }
  /* a new visit to a garden: arrival (Idle_Float + a breath), then the Flight transition once */
  function begin() {
    A.state = null; A.cur = null; A.prev = null; A.climb = 0; A.q = null; A.qdt = 0; A.calm = 1; A.accS = 0; A.spPrev = AG.Flight.flySpeed || 0;
    go('arrive', 0, 0);
  }
  /* ctx: { phase: 'inside' | 'launch' | 'leave', arrived, hs } (the sequence is time-driven: movement
     never restarts it) */
  function update(dt, ctx) {
    if (!A.cur) return;
    A.clock += dt; A.stateT += dt;
    // her nose-up / nose-down while climbing or descending, eased (it never follows a step in speed)
    const F = AG.Flight, want = AG.U.clamp(Math.atan2(-(F.vy || 0), Math.max(F.flySpeed || 0, 1)) * 0.5, -0.35, 0.35);
    A.climb += (want - A.climb) * (1 - Math.exp(-3 * dt));
    // how busy her flight is (turning, speeding up or slowing, climbing): the procedural float calms
    // down while she is actively flown and comes back as she glides (eased both ways)
    if (dt > 0) {
      const sp = F.flySpeed || 0, acc = Math.abs(sp - A.spPrev) / dt; A.spPrev = sp;
      A.accS += (acc - A.accS) * (1 - Math.exp(-6 * dt));
      const busy = AG.U.clamp(Math.abs(F.yawRate || 0) / 1.4 + A.accS / 4 + Math.abs(F.vy || 0) / 2.5, 0, 1);
      A.calm += ((1 - 0.75 * busy) - A.calm) * (1 - Math.exp(-2.5 * dt));
    }
    A.qdt += dt;
    A.cur.t += dt; if (A.prev && !A.prev.pose) A.prev.t += dt;
    if (A.prev) { A.fade += dt; if (A.fade >= A.fadeDur) A.prev = null; }
    if (A.state === 'arrive' && (A.stateT >= ARRIVE_T || (ctx && ctx.phase === 'launch'))) go('flight', FADE.toFlight, 0);
    else if (A.state === 'react' && A.cur.t >= A.cur.clip.dur) go('flight', FADE.reactOut, HELD());   // back to the held pose
  }
  /* the flower opened fully: once (the caller keeps the once-per-building flag) */
  function react() {
    if (!clips.Flower_Reaction || !A.cur) return false;
    go('react', FADE.toReact, 0);
    A.reactions++;
    return true;
  }

  /* ---------- procedural motion (no clip for it): the arrival breath and the float ---------- */
  // the breath: 0 … 1 … 0. Arriving, one slow sigh (in over ~0.7 s, out more slowly); afterwards a faint
  // breath every ~4.5 s. Each is weighted by how much of that state is on screen.
  function breathNow() {
    const fadeK = A.prev ? smooth(0, 1, A.fade / A.fadeDur) : 1;
    let b = 0;
    if (A.state === 'arrive') { const u = A.stateT / ARRIVE_T; b = smooth(0.0, 0.42, u) * (1 - smooth(0.5, 1.0, u)); }
    else if (A.prev && A.log.length > 1 && A.log[A.log.length - 2].state === 'arrive') { const u = (A.stateT + ARRIVE_T) / ARRIVE_T; b = (1 - smooth(0.5, 1.0, u)) * (1 - fadeK); }
    const calm = 0.22 * Math.pow(Math.max(0, Math.sin(A.clock * 2 * Math.PI / 4.5)), 2);
    return Math.max(b, A.state === 'react' ? 0 : calm * A.tilt);
  }
  const BREATH = { Spine01: [-0.06, 'x'], Spine: [-0.05, 'x'], neck: [0.04, 'x'], LeftShoulder: [0.07, 'z'], RightShoulder: [0.07, 'z'] };
  let breathNodes = null;
  const Rd = new Float32Array(16);
  function rotLocal(M, axisModel, ang) {
    // the model-space axis in this node's own frame (its world rotation, scale removed), then M · R
    const sx = Math.hypot(M[0], M[1], M[2]), sy = Math.hypot(M[4], M[5], M[6]), sz = Math.hypot(M[8], M[9], M[10]);
    let x = (M[0] * axisModel[0] + M[1] * axisModel[1] + M[2] * axisModel[2]) / sx;
    let y = (M[4] * axisModel[0] + M[5] * axisModel[1] + M[6] * axisModel[2]) / sy;
    let z = (M[8] * axisModel[0] + M[9] * axisModel[1] + M[10] * axisModel[2]) / sz;
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    Rd.set([t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1]);
    mul(M, M, Rd);
  }

  /* ---------- loading ---------- */
  async function load(inst) {
    if (H.status !== 'off' || !H.enabled) return;
    p = inst; H.status = 'loading';
    try {
      const t0 = performance.now();
      const fetchGLB = async (f) => { const r = await fetch(BASE + f); if (!r.ok) throw new Error(f + ': HTTP ' + r.status); return parseGLB(await r.arrayBuffer()); };
      const g = await fetchGLB(MAIN);
      buildSkeleton(g);
      const byName = {}; g.json.nodes.forEach((n, i) => { byName[n.name] = i; });
      clips.Flight = buildClip(g, 'Flight', byName);
      clips.Idle_Float = buildClip(g, 'Idle_Float', byName);
      if (!clips.Flight || !clips.Idle_Float) throw new Error('Flight / Idle_Float missing in ' + MAIN);
      // the bob: the Armature node's translation in Idle_Float (Flight has the same curve)
      const bob = clips.Idle_Float.ch.find((c) => c.root && c.path === 'translation');
      A.bob = bob || null;
      buildMesh(g);
      await buildTexture(g);
      sh = p.createShader(AG.SHADERS.heroSkin.vert, AG.SHADERS.heroSkin.frag);
      P0.a = newPose(); P0.b = newPose(); P0.out = newPose();
      H.status = 'ready';
      H.info.loadMs = Math.round(performance.now() - t0);
      // the reaction: a second file, same rig; its clip only (a failure here keeps the rest working)
      try {
        const g2 = await fetchGLB(REACT);
        const names2 = g2.json.skins[0].joints.map((j) => g2.json.nodes[j].name).join();
        if (names2 !== H.info.jointNames.join()) throw new Error('different skeleton');
        clips.Flower_Reaction = buildClip(g2, 'Flower_Reaction', byName);
      } catch (e) { H.reactError = String(e.message || e); console.warn('AFTERGLOW hero 3D: no Flower_Reaction —', H.reactError); }
      H.info.clips = Object.keys(clips).map((k) => clips[k] && [k, +clips[k].dur.toFixed(3), clips[k].moving]);
    } catch (e) {
      H.status = 'failed'; H.error = String(e.message || e);
      console.warn('AFTERGLOW hero 3D: keeping the pose images —', H.error);
    }
  }
  function buildMesh(g) {
    const pr = g.json.meshes[0].primitives[0], at = pr.attributes;
    const pos = acc(g, at.POSITION), nrm = acc(g, at.NORMAL), uv = acc(g, at.TEXCOORD_0);
    const jn = acc(g, at.JOINTS_0, true), wt = acc(g, at.WEIGHTS_0), idx = acc(g, pr.indices, true);
    const n = pos.length / 3;
    const G = new p5.Geometry(1, 1), verts = new Array(n), norms = new Array(n), col = new Array(n * 4);
    for (let i = 0; i < n; i++) {
      verts[i] = { x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2] };
      norms[i] = { x: nrm[i * 3], y: nrm[i * 3 + 1], z: nrm[i * 3 + 2] };
      // the four influences, normalised, each packed as jointIndex + weight · 0.999
      const ws = wt[i * 4] + wt[i * 4 + 1] + wt[i * 4 + 2] + wt[i * 4 + 3] || 1;
      for (let k = 0; k < 4; k++) col[i * 4 + k] = jn[i * 4 + k] + Math.min(1, wt[i * 4 + k] / ws) * 0.999;
    }
    G.vertices = verts; G.vertexNormals = norms; G.uvs = Array.from(uv); G.vertexColors = col;
    const faces = new Array(idx.length / 3);
    for (let i = 0; i < faces.length; i++) faces[i] = [idx[i * 3], idx[i * 3 + 1], idx[i * 3 + 2]];
    G.faces = faces; G.gid = 'hero3d-' + Math.random().toString(36).slice(2, 8);
    geo = G;
    H.info.vertices = n; H.info.triangles = faces.length;
  }
  async function buildTexture(g) {
    const mat = g.json.materials[0], ti = mat.pbrMetallicRoughness.baseColorTexture.index;
    const im = g.json.images[g.json.textures[ti].source], bv = g.json.bufferViews[im.bufferView];
    const blob = new Blob([new Uint8Array(g.bin, bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType });
    const bmp = await createImageBitmap(blob, { resizeWidth: TEX, resizeHeight: TEX, resizeQuality: 'high' });
    img = p.createImage(TEX, TEX);
    img.drawingContext.drawImage(bmp, 0, 0);
    img.setModified(true);
    H.info.texture = [bmp.width, bmp.height];
    if (bmp.close) bmp.close();
  }
  function mipmaps() {
    mipDone = true;
    try {
      const tx = p._renderer.getTexture(img);
      gl.bindTexture(gl.TEXTURE_2D, tx.glTex);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);
    } catch (e) { /* plain linear filtering then */ }
  }

  /* ---------- drawing ---------- */
  function computeBones(pose) {
    // the bob: the Armature node's own curve on one continuous clock (it loops seamlessly)
    if (armature >= 0 && A.bob) {
      const o = armature * 10;
      sampleCh(A.bob, A.clock % A.bob.times[A.bob.times.length - 1], pose, o);
      // smaller while she is turning or changing speed (and with reduced motion): rest + (bob − rest)·k
      const k = floatK();
      for (let q = 0; q < 3; q++) pose[o + q] = rest[o + q] + (pose[o + q] - rest[o + q]) * k;
    }
    if (!breathNodes) breathNodes = H.info.allNames.map((n) => BREATH[n] || null);
    const b = breathNow(); A.breath = b;
    for (const i of order) {
      const o = i * 10;
      fromTRS(local, pose.subarray(o, o + 3), pose.subarray(o + 3, o + 7), pose.subarray(o + 7, o + 10));
      if (parent[i] >= 0) mul(world[i], world[parent[i]], local); else world[i].set(local);
      // the breath: a small extra turn of the upper body's own bones (children follow)
      const br = breathNodes[i];
      if (br && b > 1e-3) {
        if (br[1] === 'x') rotLocal(world[i], [1, 0, 0], br[0] * b);
        else rotLocal(world[i], [0, 0, 1], br[0] * b * (world[i][12] >= world[joints[0]][12] ? 1 : -1));   // shoulders rise on either side
      }
    }
    const m = new Float32Array(16);
    for (let j = 0; j < joints.length; j++) {
      mul(m, world[joints[j]], ibm.subarray(j * 16, j * 16 + 16));
      for (let r = 0; r < 3; r++) { const q = (j * 3 + r) * 4; bones[q] = m[r]; bones[q + 1] = m[4 + r]; bones[q + 2] = m[8 + r]; bones[q + 3] = m[12 + r]; }
    }
  }
  /* her model matrix: at the flight position, facing her heading, tipped forward into the horizontal
     flight pose (A.tilt), banked into turns, pitched a little with her climb, and a slow float sway
     (+Z of the rig = her front; +θ about X tips her head forward). Visual only. */
  // how much of the procedural float is on: calm when gliding, less when busy, less with reduced motion
  function floatK() { return A.calm * (reducedMotion() ? 0.35 : 1); }
  // quaternions (x, y, z, w): a · b, and the rotation by angle about one axis
  const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qAxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax === 0 ? s : 0, ax === 1 ? s : 0, ax === 2 ? s : 0, Math.cos(ang / 2)]; };
  const qa = new Float32Array(4), qb = new Float32Array(4);
  function modelMatrix(fs) {
    const f = fs.fwd, yaw = Math.atan2(f[0], f[2]), c = A.clock, fk = floatK();
    // the float: slow incommensurate sines (a noise-like drift that never repeats visibly), calmer
    // while she is busy. Visual only: her flight position and collision never see it.
    const sway = fk * (0.035 * Math.sin(c * 1.15) + 0.015 * Math.sin(c * 2.3 + 1.1));
    const pitch = A.tilt * FLIGHT_TILT + A.climb + sway;
    const roll = -(fs.bank || 0) + fk * (0.03 * Math.sin(c * 0.85 + 0.4) + 0.012 * Math.sin(c * 1.9 + 2.0));
    // the wanted orientation R = Ry(yaw) · Rx(pitch) · Rz(roll) as a quaternion, and the drawn one
    // slerped toward it (1 − e^(−k·dt): the same at any frame rate; frozen while paused)
    const want = qMul(qMul(qAxis(1, yaw), qAxis(0, pitch)), qAxis(2, roll));
    if (!A.q) A.q = want.slice();
    else {
      const k = 1 - Math.exp(-11 * Math.min(A.qdt, 0.1));
      qa.set(A.q); qb.set(want); slerp(qa, 0, qa, 0, qb, 0, k); A.q = Array.from(qa);
    }
    A.qdt = 0;
    const M = fromTRS(new Float32Array(16), [0, 0, 0], A.q, [SCALE, SCALE, SCALE]);
    // the drawn forward (horizontal), from the smoothed orientation: the rig's Y + Z diagonal, whose
    // horizontal part points forward for any pitch from −45° to 135° (upright … tipped past level)
    let fx = M[4] + M[8], fz = M[6] + M[10]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    // a slight float of the whole body (visual only), on top of the Armature's own bob
    const lift = fk * SCALE * (0.025 * Math.sin(c * 0.73 + 0.6) + 0.012 * Math.sin(c * 1.61 + 2.4));
    // horizontal, the body is drawn trailing BEHIND the flight position (her head near it), so the
    // point the flight's keep-out sphere protects is her head: facing the flower she never reaches
    // into its petals. Upright (arrival, reaction) she is centred on it as before.
    const back = HEAD_BACK * SCALE * A.tilt;
    M[12] = fs.pos[0] - fx * back; M[13] = fs.pos[1] + lift; M[14] = fs.pos[2] - fz * back;
    H.centre = [M[12], M[13], M[14]];   // her body's centre (the garden camera keeps it in frame)
    return M;
  }
  /* into the bound framebuffer. view: { V, P, eye }; light: { warm 0..1, key (world point), col } */
  function draw(view, fs, light) {
    if (H.status !== 'ready' || !A.cur) return false;
    gl = p.drawingContext;
    const pose = currentPose();
    computeBones(pose);
    const L = light || {}, warm = L.warm || 0, kc = L.col || [1.0, 0.72, 0.55];
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); p.blendMode(p.BLEND);
    p.shader(sh);
    sh.setUniform('uView', view.V); sh.setUniform('uProj', view.P); sh.setUniform('uHeroModel', modelMatrix(fs));
    sh.setUniform('uBones', bones);
    sh.setUniform('tTex', img);
    sh.setUniform('uCamPos', view.eye); sh.setUniform('uKeyPos', L.key || [0, 4, 0]); sh.setUniform('uKeyCol', kc);
    sh.setUniform('uAmbSky', [0.62, 0.52, 0.86]); sh.setUniform('uAmbGround', [0.3, 0.22, 0.36]);
    sh.setUniform('uRimCol', [0.95 * (0.6 + 0.4 * warm), 0.62, 1.0]);
    sh.setUniform('uWarm', warm); sh.setUniform('uAlpha', 1); sh.setUniform('uEmit', 0.12);
    p.model(geo);
    if (!mipDone) mipmaps();
    H.drawn = (H.drawn || 0) + 1;
    return true;
  }

  function reset() { A.state = null; A.cur = null; A.prev = null; A.reactions = 0; A.log.length = 0; }
  /* her drawn size against the pose images' (cameras that frame her use it) */
  function sizeK() { return SCALE / 1.1; }
  /* how far her body reaches from its centre, in metres (half her height or arm span) */
  function reach() { return 0.88 * SCALE; }
  function usable() { return H.enabled && H.status === 'ready'; }
  function debug() { return { status: H.status, state: A.state, t: A.cur ? +A.cur.t.toFixed(3) : null, fade: A.prev ? +(A.fade / A.fadeDur).toFixed(2) : 1, reactions: A.reactions, tilt: +A.tilt.toFixed(3), breath: +A.breath.toFixed(3), calm: +A.calm.toFixed(3), reducedMotion: reducedMotion(), log: A.log.slice(), info: H.info, error: H.error, reactError: H.reactError || null }; }

  Object.defineProperty(H, 'bones', { get: () => bones });   // (read-only, for the visual checks)
  return Object.assign(H, { load, usable, begin, update, react, draw, reset, debug, sizeK, reach });
})();
