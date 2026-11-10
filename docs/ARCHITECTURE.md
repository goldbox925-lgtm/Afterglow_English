# Architecture (v3 — user-driven states)

```
index.html → config.js → util → shaders (common [+ field], city [+ physical damage], neon, fx, post,
character [+ smoke], network) → city generator → character assets → core/fsm → core/restoration →
core/flight → character director → core/interactions → core/story → core/camera → audio → renderer → ui → sketch
```

| Module | Role |
|---|---|
| `core/fsm.js` | the 5 states + FREE_FLIGHT / ASCENSION modes, cinematic beats, presentation jumps (no timers) |
| `core/restoration.js` | persistent restoration field (512² image), sources, waves, progress / districts |
| `core/interactions.js` | pulse (01), fragile lights (02), node network (03–04), hints, picking, render data |
| `core/flight.js` | free flight + ascension controller, avoidance, collisions, trail, finale threshold |
| `core/story.js` | mood → rain, haze, smoke, embers, damage severity, neon, sky, grade (continuous) |
| `core/camera.js` | cinematic beats, explore view (01–04), chase / ascension / finale cameras |
| `character/characterDirector.js` | pose per state (A I H B J D E G), dissolves, aura, bank |
| `shaders/network.glsl.js` | nodes and threads (two programs, 48-entry uniform arrays) |
| `audio/score.js`, `audio.js` | adaptive score (section loops per state, ascension accents), MP3 loop + filter |

Removed from the previous build: `core/timeline.js` (gated film clock) and `core/interact.js`
(gates). Both are preserved in `backup_original/`.

---

## Previous architecture notes (still valid for the renderer and city)

# AFTERGLOW — Technical architecture

## Module map
```
index.html            static entry point; loads scripts in order (no bundler, no modules)
css/style.css         cinematic, auto-hiding interface
lib/p5.min.js         p5.js 1.11.11 (local copy)
js/config.js          timeline, beats, palette, city parameters, quality tiers, soundtrack path
js/core/util.js       seeded RNG (mulberry32), hashes, easing, vec3/mat4, event bus
js/core/timeline.js   film clock + chapter state machine + interactive GATES (film time holds, animTime runs)
js/core/story.js      film time + input → every state value (5 chapters, 90 s; input enhances, never gates)
js/core/camera.js     shot list, cross-blends, free modes, parallax/drag/zoom, near/far split decision
js/city/geometryBuilder.js   merges primitives into ≤60k-vertex p5.Geometry chunks with packed data
js/city/signAtlas.js  neon words rendered once to a 2048² canvas texture (R core, G halo, B letter id)
js/city/cityGenerator.js     the procedural city, damage system, her rooftop, traffic lanes
js/city/building.js          Building class: height/style/district via p.random + p.noise, render(), update()
assets/character/manifest.js which image each pose uses, its size, anchor and plane mode
js/character/characterAssets.js  loads poses, checks real alpha vs baked checkerboard, silhouette fallback
js/character/characterDirector.js  pose track, dissolves/cuts/flashes, breathing, float, lift-off, flight placement
js/core/interact.js   the viewer's part: pulse window, restore spots, ray picking, hints, steering, gate solving
js/core/flight.js     flight spline from the generated city, time→distance table, building collision helpers
js/shaders/character.glsl.js  character planes (scene lighting, dissolve, aura) + GPU particles (trail, sparkles, cloud)
tools/                audit_character_assets.py · key_checkerboard.py (provisional cut-outs)
js/shaders/*.glsl.js  GLSL ES 3.00: common, city, neon, traffic/rain/sky/figure, post
js/render/renderer.js passes, uniforms, HDR framebuffers, bloom, composite
js/audio/audio.js     Web Audio graph, MP3 probe, ambience, event SFX, analyser bands
js/audio/score.js     deterministic generative score (fallback soundtrack)
js/audio/reactivity.js soundtrack → visuals: p5 mapping/smoothing, ON/OFF, debug view
js/audio/mic.js       Input (mouse/keyboard); AG.Mic is an always-off placeholder
js/ui/ui.js           DOM controls, chapter cards, hints, toasts, end card
js/sketch.js          p5 instance: boot, frame loop, handlers, keyboard, adaptive quality
```

## Frame loop (sketch.js → draw)
1. `Input.update` — mic features + mouse/keyboard hold merged into one signal.
2. `Timeline.update` — advances film time (or reads `audio.currentTime`), emits `chapter` events.
3. `Audio.bands()` — low/mid/high of the music bus (drives pulse, equaliser holograms).
4. `Story.compute(t, input, bands)` — ~60 state values (restore, rebuild, seam, rain, fog colours,
   grade, sign brightness, breathing, head lift…). Pure function of time except for the user's
   *boost* and the interactive first-light moment, both reset on seek/replay.
5. `Camera.update` — desired pose (film shot or free mode) → damped follow → parallax.
6. `Audio.update` — ambience gains/filters follow the story; generative score schedules notes.
7. `Renderer.render` — see below.  8. `UI.update`.  9. Adaptive quality check.

Synchronisation rule: **everything visible or audible is a function of film time**, so pause,
seek and replay cannot drift. Shaders receive film time as `uTime` (rain freezes when paused).

## Render passes
```
sceneFB (RGBA16F, depth)
  sky dome (no depth)
  FAR  (near 1.5 m, far 7 km): city · traffic(add) · neon(add)
  NEAR (only when the camera is on her roof; depth cleared; near 3 cm):
       her building/rooftop · figure · fallen sign(add) · rain(add)
bloom: bright-pass → ¼ res → separable 9-tap blur (H,V) → ⅛ res second level on High
composite → canvas: chromatic aberration · glitch · lens drops · screen rain · bloom ·
           ACES · lift/gain/saturation grade · vignette · grain · letterbox · fade · pause tint
```

## Packed vertex data
City meshes (`aVertexColor`): `r` building hash · `g` material×0.1 · `b` fragment id (0 = static;
for streets: width/40) · `a` distance from her / 1400 m.
Materials: 0 glass · 1 residential · 2 concrete · 3 metal · 4 her rooftop · 5 street · 6 sign panel ·
7 girder · 8 sidewalk.
Neon meshes: `r` hash · `g` hue · `b` type (0 sign, .1 LOVE, .15 STILL HERE, .3 strip, .5 hologram,
.7 beam, .85 practical, .95 aircraft) · `a` distance. Holograms put the design id in the integer
part of `uv.x`.
Traffic: `aPosition` lane start, `aNormal` lane vector, `uv` billboard corner, colour = phase/speed/
colour/presence threshold — cars move entirely on the GPU.
Figure: `r` tights weight · `g` breathing weight · `b` head weight · `a` top-arm weight;
`uv` = skin / hair weights (soft material blending).

## Procedural generation
- **Grid**: 27×27 blocks, 58 m, 16 m streets, every 4th a 30 m avenue (non-uniform pitch).
- **Lots**: each block split 1/2/3/4 ways (far blocks fewer).
- **Height**: lognormal-ish base + a downtown Gaussian cluster ahead of her (−z); framing towers
  near her on both sides; a capped low zone directly in front to open the vista.
- **Style** by height; **LOD** by distance (full details < 400 m, medium < 900 m).
- **Damage**: cut height 50–78 %; skeleton columns with a sloped break plane; partial slabs;
  dangling girders; 4–13 fragment chunks in a voxelised “missing volume”.
- **Windows** are not geometry: the shader derives floors/columns from world position and the face
  tangent; rooms group 2–4 columns; a hash and the distance from her decide when each room lights.
- Every random choice comes from `AG.U.rng(seed)`, so `#seed=1234` always rebuilds the same city.

## Restoration model (Story)
`restore = smoothstep((t − tFirstLight)/(168 − tFirstLight))^1.15 + boost`, where `boost`
(≤ 0.22) accumulates from sustained input in Reconnection and decays slowly. Windows, signs,
streetlights and veins each compare their own threshold `hash·k + distance·0.9` against
`restore·1.45`, which is what makes light visibly travel outward from her.
`rebuild` (fragments) and `seam` (kintsugi glow) lag behind `restore`.

## Interactive gates and spots
- `config.gates` lists the gates (15 s find, 21 s restore). `Timeline.update` stops film time at an
  unsolved gate and sets `holding`. `animTime = filmTime + total hold time` drives every shader's
  `uTime`, so the world keeps moving while the story waits.
- `AG.Interact` solves gates: a click on the beacon, or five restorations. It calls
  `Timeline.release(id)`. `Interact.onSeek(t)` auto-solves gates behind `t` (default choices) and
  un-solves gates ahead of it, removing their spots.
- **Spots** are `{centre, max radius, duration, colour, start(animTime)}`. Each frame they become
  `uSpot[8]` (xyz + current radius) and `uSpotC[8]` (rgb + shockwave front). `spotLocal()` in
  `AG.SHADERS.spots` gives each fragment or vertex its restoration, colour and front. The city
  shader uses it for windows, fragment rebuild, seams and the front; the neon shader for sign power.
- **Picking:** a ray from the camera through the click (same basis as the view) is intersected with
  the building boxes exported by the generator. The beacon test is screen-space (projected window
  within ~34 px, widening with hints) plus a line-of-sight check.
- **Score:** `Score.musicTime(t, holding, holdTime)` maps film time onto the authored 90 s score and
  loops a passage while a gate holds.
