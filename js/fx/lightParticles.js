/* =====================================================================
   LightParticle — the glints her light trail sheds while she flies (05)
   ---------------------------------------------------------------------
   The trail itself (thin streamers from her feet) stays on the GPU
   (character.glsl.js, uKind 0). These are the few small, bright glints
   that come off it: CPU objects, so each one can drift on its own.

   One LightParticle (p5.js vectors from p.createVector):
     pos   where it is (m)
     vel   how fast it moves (m/s)
     acc   this frame's acceleration (m/s²): a p.noise() flow field
           (gentle, organic swirl) + a little buoyancy, minus drag
     update(dt, t)  acc → vel → pos, scaled by dt (seconds from p.deltaTime),
                    so the motion is the same at 30 or 120 fps
     display(i)     writes its position, alpha (fade in, twinkle, fade out),
                    colour and size into slot i of the GPU buffers; the
                    renderer draws every slot in ONE call (uKind 7)
     isDead()       its age has reached its life

   Lifecycle (AG.LightParticles):
     spawn   while she flies, at a rate set by the trail's strength and her
             speed (≤ RATE = 7 per second, so only a few are alive at once),
             on the trail's thin bundle a little behind her feet, moving with
             her at ~95 % of her speed, so they stay near it and fade. Never more than MAX.
     update  every playing frame: each particle updates; dead ones are
             removed with a REVERSE loop (splice never skips one).
     pause   not updated (they hold still, like the rest of the scene).
     reset   Replay / a new city / leaving stage 05 clears the array.

   Randomness comes from a stateless hash of a counter, not p.random(), so
   the city's seeded random sequence is never touched.
   ===================================================================== */
window.AG = window.AG || {};

AG.LightParticle = class LightParticle {
  constructor(p, pos, vel, life, col, size, seed) {
    this.p = p;
    this.pos = pos;                        // p5.Vector
    this.vel = vel;                        // p5.Vector
    this.acc = p.createVector(0, 0, 0);    // p5.Vector
    this.life = life; this.age = 0;
    this.col = col; this.size = size; this.seed = seed;
  }

  update(dt, t) {
    const p = this.p, s = this.seed, f = 0.22, tt = t * 0.45;
    // gentle organic drift: a smooth p.noise() flow field (−1..1 per axis)
    const nx = p.noise(this.pos.x * f + s, this.pos.y * f, tt) * 2 - 1;
    const ny = p.noise(this.pos.y * f, this.pos.z * f + s, tt + 31.7) * 2 - 1;
    const nz = p.noise(this.pos.z * f + 57.1, this.pos.x * f, tt + s) * 2 - 1;
    this.acc.set(nx * 1.2, ny * 0.8 + 0.15, nz * 1.2);                 // gentle swirl + slight buoyancy
    this.acc.add(p5.Vector.mult(this.vel, -AG.LightParticles.DRAG));  // drag
    this.vel.add(p5.Vector.mult(this.acc, dt));
    this.pos.add(p5.Vector.mult(this.vel, dt));
    this.age += dt;
  }

  /* fade in quickly, twinkle, fade out; written into GPU slot i */
  display(i, pos, col) {
    const k = this.age / this.life;
    const tw = 0.65 + 0.35 * Math.sin(this.age * 19 + this.seed * 6.28);
    const a = 0.6 * Math.min(1, k * 6) * Math.pow(1 - k, 1.6) * tw;
    pos[i * 4] = this.pos.x; pos[i * 4 + 1] = this.pos.y; pos[i * 4 + 2] = this.pos.z; pos[i * 4 + 3] = a;
    col[i * 4] = this.col[0]; col[i * 4 + 1] = this.col[1]; col[i * 4 + 2] = this.col[2]; col[i * 4 + 3] = this.size * (0.8 + 0.4 * (1 - k));
  }

  isDead() { return this.age >= this.life; }
};

AG.LightParticles = (function () {
  const U = AG.U;
  const MAX = 48;            // slots in the GPU buffer (a cap, not a target)
  const RATE = 7;            // glints per second at full trail strength and speed (a few, subtle)
  const COLS = [[0.35, 0.88, 1.0], [1.0, 0.45, 0.82], [0.82, 0.32, 1.0], [0.95, 0.9, 1.0]];   // the trail's cyan, pink, magenta + a soft white
  const LP = { list: [], MAX, DRAG: 0.6, posBuf: new Float32Array(MAX * 4), colBuf: new Float32Array(MAX * 4), spawned: 0, removed: 0 };
  let p = null, carry = 0, n = 0;
  const rnd = (a) => U.hash(n * 12.9898 + a * 78.233);   // stateless 0..1

  /* the side the streamers sweep to (same formula as the renderer's uSweep) */
  const sweepNow = () => U.clamp(-0.55 - (AG.Flight.yawRate || 0) * 0.9, -1.4, 1.0);

  function init(p5inst) { p = p5inst; U.on('reset', clear); U.on('replay', clear); }
  function clear() { LP.list.length = 0; carry = 0; }

  function spawn(CH) {
    const fs = CH.flight || AG.Flight.state(), base = CH.main.anchorPos;
    n++;
    // born on the trail's thin bundle: a little behind her feet along her heading, with the
    // bundle's gentle droop and swing (same shape as strandPos in the trail shader)
    const u = 0.1 + 0.7 * rnd(1), sweep = sweepNow(), back = u * (2.4 + 1.2 * (CH.speedN || 0));
    const right = p.createVector(fs.right[0], fs.right[1], fs.right[2]);
    const pos = p.createVector(base[0], base[1] - 0.78 - 1.3 * Math.pow(u, 1.4), base[2])
      .sub(p.createVector(fs.fwd[0], fs.fwd[1], fs.fwd[2]).mult(0.25 + back))
      .add(p5.Vector.mult(right, sweep * 1.1 * Math.pow(u, 1.3)))
      .add(p.createVector(rnd(3) - 0.5, rnd(4) - 0.5, rnd(5) - 0.5).mult(0.12));
    // moving with her at ~95 % of her speed: they stay near the bundle, drift a little and fade
    const out = p.createVector((rnd(6) - 0.5) * 0.3, -0.15 - 0.2 * rnd(7), (rnd(2) - 0.5) * 0.3);
    const vel = p.createVector(fs.fwd[0], fs.fwd[1], fs.fwd[2]).mult(fs.speed * (0.93 + 0.04 * rnd(8))).add(out);
    LP.list.push(new AG.LightParticle(p, pos, vel, 0.6 + 0.5 * rnd(9), COLS[Math.floor(rnd(10) * COLS.length) % COLS.length], 0.022 + 0.02 * rnd(11), rnd(12) * 100));
    LP.spawned++;
  }

  /* every frame while the story plays; dt in seconds (from p.deltaTime) */
  function update(dt, t, CH) {
    if (!p) return;
    const flying = CH && CH.flying && !CH.air && CH.trail > 0.01 && AG.FSM.state === 'AFTERGLOW' && !AG.FSM.cinematic;
    if (flying) {
      carry += dt * RATE * CH.trail * (0.35 + 0.65 * (CH.speedN || 0));
      while (carry >= 1) { carry -= 1; if (LP.list.length < MAX) spawn(CH); }
    } else carry = 0;
    // update, then remove expired particles safely: a REVERSE loop, so splice never skips one
    for (let i = LP.list.length - 1; i >= 0; i--) {
      const q = LP.list[i];
      q.update(dt, t);
      if (q.isDead()) { LP.list.splice(i, 1); LP.removed++; }
    }
    if (AG.FSM.state !== 'AFTERGLOW') clear();
  }

  /* fill the GPU buffers (unused slots get alpha 0 and are not drawn) */
  function pack() {
    LP.posBuf.fill(0); LP.colBuf.fill(0);
    LP.list.forEach((q, i) => q.display(i, LP.posBuf, LP.colBuf));
  }

  return Object.assign(LP, { init, clear, update, pack });
})();
