/* =====================================================================
   Screen words — the six screens of stages 04–05
   ---------------------------------------------------------------------
   The six floating parapet pieces at her broken edge (cityGenerator.js
   buildHero, recorded as info.hero.screens) carry six words:
       VOICE · COURAGE · JOY · FREEDOM · SELF-LOVE · BEGIN AGAIN
   with fine warm threads between neighbouring screens.

   Activation (update(), game time — a pause freezes it):
     01–03   nothing is shown.
     04      words 1–5 start as a very faint ghost. Word i lights when
             AG.Interactions.cityLinks > i — cityLinks rises by exactly
             one for each SUCCESSFUL building-to-building connection
             (duplicates and invalid pairs are rejected there), so the
             n-th connection lights exactly the n-th word, in order, once.
             When word i (i ≥ 1) lights, a thread draws in from word i−1.
             BEGIN AGAIN stays dark.
     05      all six words and all five threads. The fifth connection
             starts 05 in the same frame (the lift-off scene), so BEGIN
             AGAIN lights 0.35 s into that scene, after SELF-LOVE, and its
             thread draws in from SELF-LOVE.
     Replay  everything returns to dark ('reset').
   Close-up: when one of words 1–4 lights in stage 04, SW.beat = { i, at }
   and the camera (camera.js wordBeat) takes a ~3.4 s close look at it.

   Drawing (renderer.js drawScreenWords, shader js/shaders/screens.glsl.js):
   one static mesh per city: a word quad on the camera-facing side of each
   screen and one thread quad between each pair. The vertex shader applies
   the same floating / homing offset as the city shader, so the text stays
   on its screen. Lettering: a p5.Graphics texture rendered once (sharp
   rows + soft glow rows), uploaded as a p5.Image with mipmaps.
   ===================================================================== */
window.AG = window.AG || {};

AG.ScreenWords = (function () {
  const U = AG.U;
  const WORDS = ['VOICE', 'COURAGE', 'JOY', 'FREEDOM', 'SELF-LOVE', 'BEGIN AGAIN'];
  const ROW = 128, TEX_W = 1024, FONT_PX = 60, TRACK = 0.34;   // texture rows, letter size, tracking (em)
  const DIM = 0.07;          // stage 04: a faint ghost of the words still to come
  const FADE = 0.8;          // s for a word to light
  const DRAW = 0.9;          // s for a thread to draw in
  const BEGIN_DELAY = 0.35;   // s into the stage 05 lift-off before BEGIN AGAIN lights (its first shot shows the screens)
  const SW = { ready: false, beat: null, lit: [0, 0, 0, 0, 0, 0], line: [0, 0, 0, 0, 0], on: [false, false, false, false, false, false], log: [], WORDS };
  let p = null, widths = [];

  /* the lettering, once: rows 0–5 sharp, rows 6–11 the same words blurred (glow) */
  function bakeTexture(p5inst) {
    p = p5inst;
    const g = p.createGraphics(TEX_W, ROW * 12);
    g.pixelDensity(1);
    const ctx = g.drawingContext;
    ctx.clearRect(0, 0, TEX_W, ROW * 12);
    ctx.font = `300 ${FONT_PX}px "Helvetica Neue", "Inter", "Segoe UI", system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    const track = FONT_PX * TRACK;
    widths = WORDS.map((w) => {
      let tw = 0;
      for (const ch of w) tw += ctx.measureText(ch).width + track;
      return tw - track;
    });
    const draw = (w, i, y, shadow) => {
      let x = (TEX_W - widths[i]) / 2;
      for (const ch of w) {
        if (shadow) ctx.fillText(ch, x - 4000, y); else ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width + track;
      }
    };
    WORDS.forEach((w, i) => draw(w, i, ROW * i + ROW / 2, false));
    // glow rows: only the soft shadow of each word lands in the texture (works in every browser)
    ctx.shadowColor = 'rgba(255,255,255,1)'; ctx.shadowBlur = 16; ctx.shadowOffsetX = 4000;
    WORDS.forEach((w, i) => draw(w, i, ROW * (i + 6) + ROW / 2, true));
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
    SW.image = g.get();       // a p5.Image: uploaded once (a Graphics would re-upload every frame)
    g.remove();
    SW.textWidths = widths.slice();
  }

  /* the static mesh for one city: 6 word quads + 5 thread quads on the screens' camera side.
     aPosition = world position, aNormal = the screen box centre (for the homing offset),
     aTexCoord = uv, aVertexColor = [kind (0 word / 1 thread), index, fragment id, 0]       */
  function buildMesh(info) {
    const S = info.hero && info.hero.screens;
    if (!S || S.length !== 6 || !p) return null;
    // one letter size for all six words: the largest that fits every word inside its screen
    let scale = 1e9;                                            // metres per texture pixel
    S.forEach((s, i) => { scale = Math.min(scale, (2 * s.h[0] * 0.84) / widths[i], (2 * s.h[1] * 0.2) / (FONT_PX * 0.72)); });
    const qw = TEX_W * scale, qh = ROW * scale;
    SW.letterHeight = FONT_PX * 0.72 * scale;
    const B = new AG.GeometryBuilder('screenWords');
    const quad = (a, b, c, d, n0, n1, data0, data1, uv) => {
      B._ensure(4);
      const v0 = B.rawVertex(a, n0, uv[0], uv[1], data0), v1 = B.rawVertex(b, n1, uv[2], uv[1], data1),
            v2 = B.rawVertex(c, n1, uv[2], uv[3], data1), v3 = B.rawVertex(d, n0, uv[0], uv[3], data0);
      B.rawTri(v0, v1, v2); B.rawTri(v0, v2, v3);
    };
    const front = (s) => s.c[2] + s.h[2] + 0.008;                // just in front of the camera-facing side
    const textY = (s) => s.c[1] + s.h[1] * 0.16, lineY = (s) => s.c[1] - s.h[1] * 0.12;
    S.forEach((s, i) => {
      const z = front(s), y = textY(s), x0 = s.c[0] - qw / 2, x1 = s.c[0] + qw / 2;
      const d = [0, i, s.frag, 0];
      quad([x0, y - qh / 2, z], [x1, y - qh / 2, z], [x1, y + qh / 2, z], [x0, y + qh / 2, z], s.c, s.c, d, d, [0, 0, 1, 1]);
    });
    const TH = 0.16;                                             // thread quad height (the thread itself is ~1 px)
    for (let i = 0; i < 5; i++) {
      const a = S[i], b = S[i + 1], z = Math.max(front(a), front(b)) + 0.002;
      const ya = lineY(a), yb = lineY(b);
      quad([a.c[0], ya - TH / 2, z], [b.c[0], yb - TH / 2, z], [b.c[0], yb + TH / 2, z], [a.c[0], ya + TH / 2, z],
        a.c, b.c, [1, i, a.frag, 0], [1, i, b.frag, 0], [0, 0, 1, 1]);
    }
    return B.build(p);
  }

  function reset() {
    SW.beat = null;
    for (let i = 0; i < 6; i++) { SW.lit[i] = 0; SW.on[i] = false; }
    for (let i = 0; i < 5; i++) SW.line[i] = 0;
  }
  function init(p5inst) { bakeTexture(p5inst); U.on('reset', reset); U.on('replay', reset); SW.ready = true; }

  /* every frame; dt = game seconds (0 while paused) */
  function update(dt) {
    if (!SW.ready) return;
    const st = AG.FSM.state;
    // the fifth connection advances to 05 in the same frame (lift-off scene): BEGIN AGAIN waits
    // BEGIN_DELAY s into that scene, so SELF-LOVE lights first, as the last word of stage 04
    const cin = AG.FSM.cinematic, holdBack = cin && cin.name === 'liftoff' && cin.t < BEGIN_DELAY;
    const n = st === 'RECLAIMING_SELF' ? U.clamp(AG.Interactions.cityLinks || 0, 0, 5) : st === 'AFTERGLOW' ? (holdBack ? 5 : 6) : 0;
    for (let i = 0; i < 6; i++) {
      const want = i < n;
      if (want && !SW.on[i]) {
        // stage 04, connections 1–4: the camera takes a brief close look at the word (camera.js);
        // the 5th connection starts stage 05, whose lift-off shot already frames the screens
        if (st === 'RECLAIMING_SELF' && i < 4) SW.beat = { i, at: AG.FSM.animTime };
        SW.on[i] = true; SW.log.push({ i, word: WORDS[i], state: st, links: AG.Interactions.cityLinks }); U.emit('screenLit', { i, word: WORDS[i] }); }
      if (!want && SW.on[i]) SW.on[i] = false;
      const target = want ? 1 : (st === 'RECLAIMING_SELF' && i < 5 ? DIM : 0);
      const step = dt / FADE;
      SW.lit[i] = SW.lit[i] < target ? Math.min(target, SW.lit[i] + step) : Math.max(target, SW.lit[i] - step * 2);
    }
    // thread i joins word i and word i+1: it draws in once word i+1 has begun to light
    for (let i = 0; i < 5; i++) {
      const want = SW.on[i] && SW.on[i + 1];
      SW.line[i] = want ? Math.min(1, SW.line[i] + (SW.lit[i + 1] > 0.15 ? dt / DRAW : 0)) : Math.max(0, SW.line[i] - dt / 0.6);
    }
  }

  return Object.assign(SW, { init, update, reset, buildMesh });
})();
