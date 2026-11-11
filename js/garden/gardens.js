/* =====================================================================
   Round 02 · the five living buildings (AG.Gardens)
   ---------------------------------------------------------------------
   One gameplay system, five configurations. This file holds:
     CONFIGS   what differs between the buildings: the flower's palette,
               the interior's light, the facade's colours, the plants'
               parameters, the particles' motion, the rooftop flower's size
     sites     one record per building in this city: its doorway, world
               position, seed, saved flower state, transformation state,
               completion and rooftop placement

   There is ONE flower scene, ONE atrium and ONE render loop. AG.Garden
   loads a site's flower state and palette into the scene when she goes
   through its doorway; AG.Atrium swaps in that site's plants and city
   view. AG.R2 advances every site's transformation. AG.Living draws
   every site's facade and rooftop flower.

   Rose is the first building, the one she reaches first.
   Colours are [r, g, b] in 0..255 unless noted; flower.js and atrium.js
   turn them into p.color values and p.lerpColor between them.
   ===================================================================== */
window.AG = window.AG || {};

AG.Gardens = (function () {
  const CONFIGS = [
    { id: 'rose', name: 'Rose',
      flower: { bud: [236, 150, 195], body: [255, 118, 185], tipA: [255, 170, 150], tipB: [255, 208, 170], warm: [255, 145, 85], core: [255, 200, 115],
        heat: [1.0, 0.55, 0.2], stam: [1.0, 0.68, 0.34], anther: [1.0, 0.45, 0.08], motes: [[1.0, 0.55, 0.8], [1.0, 0.72, 0.62], [1.0, 0.62, 0.72], [1.0, 0.82, 0.5]], yaw: 0.12, breath: 0.018 },
      interior: { a: [255, 120, 210], b: [190, 160, 255], c: [255, 190, 165], gold: [255, 190, 110], aRich: [255, 80, 200], bRich: [165, 95, 255], fx: [1.0, 0.66, 0.3], pool: [1.0, 0.62, 0.3], leaf: [1.0, 1.0, 1.0], plantGold: [1.0, 0.72, 0.34] },
      city: { a: [255, 120, 205], b: [165, 140, 255], cool: [110, 220, 255], gold: [255, 196, 110] },
      portal: { a: [1.0, 0.42, 0.78], b: [0.62, 0.5, 1.0], gold: [1.0, 0.62, 0.22], cool: [0.45, 0.85, 1.0] },
      plants: { density: 1, length: 1, floret: 1, curl: 1 },
      motion: { f: 0, h: 0 }, roof: 1.05 },
    { id: 'azure', name: 'Azure',
      flower: { bud: [86, 150, 222], body: [38, 212, 226], tipA: [150, 222, 245], tipB: [216, 240, 250], warm: [110, 225, 215], core: [226, 245, 255],
        heat: [0.5, 0.88, 1.0], stam: [0.72, 0.94, 1.0], anther: [0.45, 0.85, 0.98], motes: [[0.4, 0.9, 0.95], [0.6, 0.85, 1.0], [0.85, 0.95, 1.0], [0.45, 1.0, 0.9]], yaw: 0.2, breath: 0.012 },
      interior: { a: [60, 220, 235], b: [130, 180, 255], c: [210, 240, 255], gold: [200, 235, 250], aRich: [20, 200, 230], bRich: [90, 150, 255], fx: [0.6, 0.92, 1.0], pool: [0.35, 0.8, 0.95], leaf: [0.62, 1.05, 1.15], plantGold: [0.82, 0.95, 1.0] },
      city: { a: [60, 220, 235], b: [130, 180, 255], cool: [190, 235, 255], gold: [215, 240, 255] },
      portal: { a: [0.2, 0.86, 0.92], b: [0.5, 0.7, 1.0], gold: [0.82, 0.95, 1.0], cool: [0.6, 0.95, 1.0] },
      plants: { density: 0.85, length: 1.2, floret: 0.85, curl: 0.6 },
      motion: { f: 0.9, h: 2.2 }, roof: 1.0 },
    { id: 'violet', name: 'Violet',
      flower: { bud: [120, 90, 210], body: [172, 108, 250], tipA: [206, 176, 255], tipB: [240, 230, 250], warm: [150, 88, 240], core: [250, 235, 255],
        heat: [0.78, 0.55, 1.0], stam: [0.9, 0.78, 1.0], anther: [0.72, 0.42, 1.0], motes: [[0.72, 0.5, 1.0], [0.85, 0.7, 1.0], [0.95, 0.9, 1.0], [0.6, 0.45, 0.95]], yaw: 0.09, breath: 0.026 },
      interior: { a: [190, 120, 255], b: [140, 120, 250], c: [235, 225, 255], gold: [235, 215, 255], aRich: [170, 80, 255], bRich: [120, 80, 255], fx: [0.82, 0.66, 1.0], pool: [0.62, 0.42, 1.0], leaf: [1.0, 0.72, 1.2], plantGold: [0.94, 0.86, 1.0] },
      city: { a: [190, 120, 255], b: [140, 120, 250], cool: [205, 195, 255], gold: [240, 225, 255] },
      portal: { a: [0.74, 0.46, 1.0], b: [0.52, 0.45, 1.0], gold: [0.94, 0.86, 1.0], cool: [0.8, 0.75, 1.0] },
      plants: { density: 1.15, length: 0.9, floret: 1.1, curl: 1.2 },
      motion: { f: 0.5, h: 3.4 }, roof: 1.1 },
    { id: 'solar', name: 'Solar',
      flower: { bud: [222, 150, 72], body: [255, 168, 50], tipA: [250, 220, 160], tipB: [255, 236, 192], warm: [255, 128, 30], core: [255, 215, 100],
        heat: [1.0, 0.6, 0.14], stam: [1.0, 0.8, 0.36], anther: [1.0, 0.55, 0.08], motes: [[1.0, 0.72, 0.3], [1.0, 0.86, 0.55], [1.0, 0.6, 0.2], [1.0, 0.92, 0.7]], yaw: 0.15, breath: 0.03 },
      interior: { a: [255, 175, 70], b: [255, 210, 140], c: [255, 235, 190], gold: [255, 190, 80], aRich: [255, 150, 40], bRich: [255, 190, 100], fx: [1.0, 0.7, 0.25], pool: [1.0, 0.66, 0.22], leaf: [1.2, 1.0, 0.7], plantGold: [1.0, 0.8, 0.36] },
      city: { a: [255, 175, 70], b: [255, 210, 140], cool: [255, 225, 170], gold: [255, 195, 85] },
      portal: { a: [1.0, 0.68, 0.26], b: [1.0, 0.82, 0.55], gold: [1.0, 0.76, 0.3], cool: [1.0, 0.9, 0.7] },
      plants: { density: 0.75, length: 0.75, floret: 1.25, curl: 1.4 },
      motion: { f: 1.4, h: 1.2 }, roof: 1.15 },
    { id: 'aurora', name: 'Aurora',
      flower: { bud: [120, 210, 182], body: [108, 240, 190], tipA: [120, 235, 230], tipB: [240, 252, 248], warm: [160, 250, 210], core: [245, 255, 245],
        heat: [0.58, 1.0, 0.8], stam: [0.8, 1.0, 0.92], anther: [0.5, 0.95, 0.75], motes: [[0.5, 1.0, 0.78], [0.5, 0.95, 0.95], [0.92, 1.0, 0.98], [0.6, 1.0, 0.7]], yaw: 0.17, breath: 0.022 },
      interior: { a: [110, 240, 190], b: [100, 225, 225], c: [240, 252, 248], gold: [200, 255, 230], aRich: [70, 235, 170], bRich: [60, 215, 220], fx: [0.62, 1.0, 0.82], pool: [0.4, 0.95, 0.75], leaf: [0.72, 1.15, 0.95], plantGold: [0.86, 1.0, 0.92] },
      city: { a: [110, 240, 190], b: [100, 225, 225], cool: [200, 250, 240], gold: [225, 255, 240] },
      portal: { a: [0.42, 0.95, 0.75], b: [0.4, 0.88, 0.88], gold: [0.9, 1.0, 0.95], cool: [0.75, 1.0, 0.95] },
      plants: { density: 1, length: 1.35, floret: 0.8, curl: 0.8 },
      motion: { f: 0.7, h: 4.2 }, roof: 0.95 }
  ];

  const G = { CONFIGS, sites: [], limit: CONFIGS.length, finale: 0 };
  let p = null, sky = null;
  const NOSTAGE = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  function init(inst) { p = inst; }

  const freshFlower = () => ({ bloom: 0, target: 0, awake: false, awakeK: 0, full: false, clicks: 0 });

  /* a site from a chosen doorway (js/garden/garden.js) and its configuration */
  function makeSite(cfg, index, portal) {
    const b = portal.box, top = b.shafts[b.shafts.length - 1];
    const lift = b.crownKind === 'helipad' ? 1.3 : 0.1;                 // (on the helipad's deck, not inside it)
    return {
      index, id: cfg.id, name: cfg.name, cfg, portal,
      position: [b.cx, b.top, b.cz],
      seed: Math.floor(Math.abs(b.cx * 31.7 + b.cz * 11.3)) % 9973 + 3,
      flower: freshFlower(),
      bloomed: false, completed: false, sinceBloom: 0, transform: 0, windows: 0,
      stage: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      // the giant flower's base on the top shaft's real roof, sized to that roof
      rooftop: { center: [b.cx, top.y1 + lift, b.cz], scale: cfg.roof * (top.w + top.d) / 4 / 1.8 },
      living: null
    };
  }
  function setSites(portals) { G.sites = portals.slice(0, G.limit).map((pt, i) => makeSite(CONFIGS[i], i, pt)); }

  /* a new story: every building back to its bud. The chosen doorways stay. */
  function resetAll() {
    for (const s of G.sites) {
      s.flower = freshFlower();
      s.bloomed = false; s.completed = false; s.sinceBloom = 0; s.transform = 0; s.windows = 0;
      for (const k in s.stage) s.stage[k] = 0;
      if (AG.Living && s.living) AG.Living.release(s);
    }
    G.finale = 0;
  }
  function clear() { resetAll(); G.sites = []; }

  const bloomedCount = () => G.sites.reduce((n, s) => n + (s.bloomed ? 1 : 0), 0);
  const completedCount = () => G.sites.reduce((n, s) => n + (s.completed ? 1 : 0), 0);
  const allComplete = () => G.sites.length > 0 && completedCount() === G.sites.length;

  /* the finale eases in once the last rooftop flower has fully opened (and stays) */
  function update(dt) {
    if (!p) return;
    G.finale = p.lerp(G.finale, allComplete() ? 1 : 0, 1 - Math.exp(-dt / 2.4));
    if (G.finale < 1e-3) G.finale = 0;
  }

  /* the combined palettes for the sky: p.lerpColor round the five buildings' colours, slowly */
  function finaleLook(t) {
    if (!(G.finale > 0) || !G.sites.length) return null;
    if (!sky) sky = CONFIGS.map((c) => p.color(c.city.a[0], c.city.a[1], c.city.a[2]));
    const n = G.sites.length, x = ((t * 0.05) % 1) * n, i = Math.floor(x);
    const c = p.lerpColor(sky[i % n], sky[(i + 1) % n], x - i);
    return { k: G.finale, col: [p.red(c) / 255, p.green(c) / 255, p.blue(c) / 255] };
  }

  return Object.assign(G, { NOSTAGE, init, setSites, resetAll, clear, update, bloomedCount, completedCount, allComplete, finaleLook });
})();
