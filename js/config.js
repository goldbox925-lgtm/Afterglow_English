/* =====================================================================
   AFTERGLOW — configuration
   Everything a director would want to tweak lives here: the 90-second
   film timeline, chapter beats, flight timing, palette, quality tiers
   and asset paths. All paths are RELATIVE so the project works inside a
   GitHub Pages project sub-directory (https://user.github.io/repo/).
   ===================================================================== */
window.AG = window.AG || {};

AG.CONFIG = {
  version: '2.0.0',

  /* ---------- Soundtrack ------------------------------------------------
     Drop an original MP3 at this path. If it is missing (404) or fails to
     decode, the generative score in js/audio/score.js plays instead.
     `offset` = seconds into the MP3 that correspond to film time 0.
     Align your track's drop with beats.afterglow.climax (71 s) and its
     big swell with beats.afterglow.cloud (81 s).                       */
  soundtrack: {
    src: null, // Optional MP3 absent; use the existing generative score without a 404
    offset: 0,
    loadTimeoutMs: 5000
  },

  /* ---------- Audio reactivity (js/audio/reactivity.js) ----------
     drive = levelWeight × LEVEL + beatWeight × BEAT, clamped to 0..1, then
     smoothed (outAttack / outRelease per second, p.lerp).
       LEVEL: smoothed band level mapped floor..ceil → 0..1 (p.map). Keeps a
              steady response while the music is sustained. floor/ceil are
              set from the generative score's measured ranges.
       BEAT:  rise above the slow baseline mapped 0..span → 0..1 (p.map).
     attack/release: band smoothing speed per second (higher = faster).
     baseline: how fast the baseline follows (per second).
     fadeTime: ON/OFF ease in seconds.                                  */
  reactivity: {
    fadeTime: 0.35,
    baseline: 0.5,
    levelWeight: 0.6,
    beatWeight: 0.6,
    outAttack: 14,
    outRelease: 5,
    bass:   { attack: 22, release: 6,  floor: 0.55, ceil: 0.95, span: 0.10 },
    mid:    { attack: 18, release: 7,  floor: 0.10, ceil: 0.70, span: 0.08 },
    treble: { attack: 30, release: 10, floor: 0.01, ceil: 0.25, span: 0.04 }
  },

  /* ---------- The five emotional states (finite-state machine) ----------
     States change ONLY when the viewer completes an interaction. Time is
     used for local animation, camera easing and sound, never to advance
     the story. `prompt` is the short context-sensitive instruction.     */
  states: [
    { id: 'NUMBNESS',        num: '01', title: 'NUMBNESS',        subtitle: 'The city that stood still',
      prompt: 'Look around with the mouse. Click the pulsing window.' },
    { id: 'FRACTURE',        num: '02', title: 'FRACTURE',        subtitle: 'The night everything broke',
      prompt: 'Click four glowing windows to bring back their light.' },
    { id: 'AWAKENING',       num: '03', title: 'AWAKENING',       subtitle: 'First light',
      prompt: 'Click five dark buildings marked with a glowing ring to wake them.' },
    { id: 'RECLAIMING_SELF', num: '04', title: 'RECLAIMING YOURSELF', subtitle: 'The city that listens',
      prompt: 'Connect five pairs of golden points on the buildings: drag a line between them or click one, then the other.' },
    { id: 'AFTERGLOW',       num: '05', title: 'AFTERGLOW',       subtitle: 'Become the light',
      prompt: 'Mouse or ← → to turn · ↓ to descend · hold ↑ to rise toward the light' }
  ],

  interaction: {
    pulse: { tolerancePx: 34, hints: [10, 20, 34, 52] },          // s in NUMBNESS: brighter · edge arrow · drift · shaft
    fragile: { count: 6, needed: 4, holdTime: 0.55, tolerancePx: 30, radius: 34 },
    network: {
      nodes: 42, linkRange: 175, tolerancePx: 26,
      awakeningRadius: 72, reclaimingRadius: 118,
      awakeningNeeded: 5,         // simple clicks on reachable dark buildings in state 03
      reclaimingLinks: 5,         // user-created building-to-building links in state 04
      toReclaiming: 0.30,          // restoration progress that opens RECLAIMING SELF
      toAfterglow: 0.62,           // … and unlocks the flight
      hintAfter: 9
    },
    colours: [[1.0, 0.62, 0.3], [1.0, 0.28, 0.72], [0.3, 0.9, 1.0], [0.66, 0.4, 1.0], [1.0, 0.82, 0.45]]
  },

  /* Free flight (state 05). Units: metres, seconds, radians. */
  flight: {
    cruise: 21, boostMax: 30, accel: 1.4, turnRate: 1.05, mouseTurn: 1.25, deadZone: 0.08,
    descend: 10, ascend: 19, minAlt: 9, wallMargin: 7, probe: 28,
    finaleAltitude: 420        // metres: reaching it while holding ↑ after ≥ 18 s of ascension enters the light
  },

  /* ---------- Palette --------------------------------------------------- */
  palette: {
    blue: [0.18, 0.55, 1.00], cyan: [0.15, 0.95, 1.00], magenta: [1.00, 0.16, 0.66],
    violet: [0.55, 0.25, 1.00], amber: [1.00, 0.62, 0.25], gold: [1.00, 0.78, 0.42]
  },

  /* ---------- City generation ------------------------------------------ */
  city: {
    blocks: 13, blockSize: 58, street: 16, avenueEvery: 4, avenueWidth: 30,
    heroHeight: 92,
    downtown: { x: -120, z: -620, radius: 520 },
    damageRate: 0.36,
    skylineRing: 220,
    flightAvenueX: -190      // the avenue nearest this x becomes her flight canyon
  },

  /* ---------- Quality tiers (auto-adaptive) ----------------------------- */
  quality: {
    tiers: {
      high:     { renderScale: 1.0,  maxDpr: 1.5, rain: 9000, bloomPasses: 2, lens: true,  particles: 1.0 },
      balanced: { renderScale: 1.0,  maxDpr: 1.0, rain: 6000, bloomPasses: 1, lens: true,  particles: 0.8 },
      low:      { renderScale: 0.72, maxDpr: 1.0, rain: 3000, bloomPasses: 1, lens: false, particles: 0.5 }
    },
    order: ['low', 'balanced', 'high'],
    initial: 'balanced',
    targetFps: 50,
    adaptive: true
  }
};


AG.stateIndex = (id) => AG.CONFIG.states.findIndex((s) => s.id === id);
