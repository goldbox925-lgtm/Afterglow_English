# Round 02 · Memory Garden — p5.js-first technical plan

Status: **phases 1–4 are implemented**: the state backbone, direct R02 navigation, one input path,
hover, the p5-drawn light layer, the heroine in the garden, and the building's transformation. The
exit / final exploration sequence is not built yet.

## 0. Audit: what exists today

| Area | What it is now | p5.js today |
|---|---|---|
| p5 integration | **One** p5 instance in instance mode (`js/sketch.js`) owns the only WebGL2 canvas and the only frame loop (`p.draw`). `bloom.html` is a separate page with its own instance (dev preview only). | `p.setup`, `p.draw`, `p.deltaTime`, `p.windowResized`, `p.createCanvas`, `p.setAttributes` |
| City renderer | `js/render/renderer.js` draws through p5's WEBGL renderer (`p.shader`, `p.model`, `p.createFramebuffer`, `p.blendMode`). Every shader uses its **own** `uView` / `uProj` (`AG.Camera`), so p5's camera and transforms do **not** affect the city. | rendering calls only |
| Flower | `js/garden/gardenScene.js` + `js/shaders/flower.glsl.js`. The petal and receptacle shaders multiply by **p5's `uModelMatrix`**, so `p.translate` / `p.rotate` / `p.scale` / `p.push` / `p.pop` place, open, sway and grow each petal. Lit, translucent, iridescent GLSL material; the bloom post-process. | `rotate`, `scale`, `translate`, `push`, `pop`, `resetMatrix`, `lerp`, `map`, `constrain`, `noise`, `sin`, `cos`, `lerpColor`, `color`, `createVector`, `p5.Vector`, `dist` |
| Generation | `js/city/cityGenerator.js`, `building.js` | `p.random`, `p.randomSeed`, `p.noise`, `p.noiseSeed`, `p.lerp` (seeded per city) |
| Input | `AG.Input` (`js/audio/mic.js`): DOM pointer and wheel listeners → a per-frame snapshot. `js/sketch.js`: keyboard. `js/garden/garden.js`: **its own** canvas pointer listeners inside the garden (a second pointer path). The preview uses `p.mousePressed` / `mouseDragged` / `mouseReleased` / `mouseWheel`. | preview only |
| Flight and collision | `js/core/flight.js` (velocity and command as `p5.Vector`, `p.lerp`, `p.constrain`), `js/core/collision.js` (sub-stepped sphere vs boxes; prepared Round 02 portals) | `createVector`, `p5.Vector`, `lerp`, `constrain` |
| Particles | `AG.LightParticle` (`js/fx/lightParticles.js`): `p5.Vector` + `p.noise` drift, reverse-loop removal. Used by her trail and the flower's motes. | vectors, `noise` |
| Round 02 flow | `js/garden/garden.js`: end card → flight to the doorway → white fade → garden scene → back to the city | — |
| **Not used anywhere yet** | — | `beginShape`, `vertex`, `bezierVertex`, `endShape`, `line`, `ellipse`, `mouseMoved`, `millis`, `frameCount`, `random` (outside city generation) |

**Key technical fact.** p5's immediate-mode drawing (`beginShape`, `bezierVertex`, `ellipse`,
`line`) works on this same WebGL canvas, but it uses **p5's** camera, not `AG.Camera` /
`GardenScene`'s.
- So the p5-drawn layer is a **screen-space light layer**. It is drawn on the main canvas after
  the composite, with p5's default camera.
- It is anchored to 3D points through the existing `project()` functions (world → screen
  pixels).
- No second canvas, no second WebGL context, no second loop.

## 1. Module architecture

```
js/sketch.js              the ONE p5 instance, the ONE p.draw loop, and (phase 2) the ONE set of
                          p5 input callbacks (p.mousePressed / Dragged / Released / Moved)
js/garden/round2.js       AG.R2: the shared Round 02 state (phase, bloom, awake, hover,
                          proximity, transform, …) and the phase machine
                          ENTER → APPROACH → AWAKEN → DRAG → BLOOM → TRANSFORM → EXIT → EXPLORE.
                          Pure data plus events ('r2phase'); no drawing, no input listeners.   [step 1]
js/garden/garden.js       the existing flow (doorway, enter, inside, back). It writes its facts
                          into AG.R2 and reads AG.R2 for its decisions.
js/garden/flower.js       AG.BloomFlower: flower state and animation (unchanged role)
js/garden/gardenScene.js  the 3D garden image (WebGL2 / GLSL, p5 transforms on the flower)
js/garden/r2Layer.js      AG.R2Layer: the p5-DRAWN light layer (beginShape / bezierVertex /
                          ellipse / line, inside push / translate / rotate / scale / pop),
                          screen space, after the composite                                   [phase 2]
js/garden/r2Heroine.js    her movement in the garden: a p5.Vector arrive / seek steering
                          toward where the player points (mouseMoved / mousePressed)           [phase 3]
js/garden/vines.js        AG.Vines: procedural growth computed with p5 (noise-guided
                          p5.Vector walkers, bezier curves, lerpColor), used by the r2Layer
                          (garden, screen space) and by the renderer (facade, 3D)             [phase 4]
js/shaders/facade.glsl.js the facade's light patterns on the doorway building (WebGL2), driven by
                          the growth parameters AG.Vines computes                              [phase 4]
```

## 2. p5.js functions mapped to behaviour

| Function(s) | Behaviour | Phase |
|---|---|---|
| `p.mousePressed`, `p.mouseDragged`, `p.mouseReleased` | Awaken / drag / release the flower in the game (replacing `garden.js`'s own pointer listeners, so there is one input path) | 2 |
| `p.mouseMoved`, `p.mouseX`, `p.mouseY` | Hover over the golden centre (it brightens, a cue ring appears); the point she glides toward | 2, 3 |
| `p.dist` | Hover test against the projected heart; her proximity to the flower; the drag gain (already used) | 2, 3 |
| `p.map`, `p.constrain` | Proximity → glow; bloom → shader parameters, particle rate and transform progress | 2–4 |
| `p.lerp`, `p.deltaTime` | Every eased value is frame-rate independent: `lerp(x, target, 1 − e^(−k·dt))` | all |
| `p.createVector`, `p5.Vector` (`sub`, `setMag`, `limit`, `add`, `mult`, `heading`) | Her arrive steering in the garden; vine walkers; particle forces toward or away from her | 3, 4 |
| `p.random` (seeded) | Vine branching choices and petal-motif placements | 4 |
| `p.noise` | Vine wandering, organic sway of the motifs, particle drift (already: flutter, sway) | 2–4 |
| `p.translate`, `p.rotate`, `p.scale`, `p.push`, `p.pop` | The flower's 3D petals (done). The p5 light layer: rotating luminous symbols orbiting the heart, growing petal-shaped light motifs, pulsating pollen halos, each isolated in `push` / `pop` | done, 2 |
| `p.sin`, `p.cos` | Orbit positions of the symbols, breathing, pulses | 2 |
| `p.millis`, `p.frameCount` | Timing of the transformation sequence (start time, staggered vine starts); `frameCount` throttles the vine rebuild to every Nth frame | 4 |
| `p.color`, `p.lerpColor` | Layer and vine colours from cool lavender to gold with bloom and transform (already used for the petal colours) | 2, 4 |
| `p.beginShape`, `p.vertex`, `p.bezierVertex`, `p.endShape` | Petal-shaped light motifs and the luminous vines drawn in the garden | 2, 4 |
| `p.line`, `p.ellipse` | The hover cue ring, pollen halos, the awaken pulse ring, vine nodes | 2 |

## 3. What p5.js draws (immediate mode, on the main canvas)

**The R2 light layer** (`r2Layer.js`, phase 2). Screen space, additive, anchored with
`project()`:
- **Hover cue** (`ellipse`, `line`): a thin ring and four ticks around the golden centre when the
  pointer is over it.
- **Awaken pulse** (`ellipse` + `scale`): a ring expanding from the heart.
- **Orbiting luminous symbols** (`push`, `translate`, `rotate`, `scale`, `beginShape` /
  `bezierVertex`): small petal-shaped glyphs circling the flower, their count and radius driven
  by bloom.
- **Pollen halos** (`ellipse`, `scale`): breathing rings around the anthers.
- **Growing vines** (phase 4): bezier curves from the base of the flower outward across the
  garden floor, with `lerpColor`.

## 4. What stays in WebGL2 / GLSL

- The city, the heroine (in the city), the doorway and beacon, fog, bloom and the composite.
- The 3D flower geometry and its GLSL material (it already takes p5's model matrix).
- **The facade transformation** (phase 4). It must follow the building's 3D surfaces, so the
  renderer draws it. Its shapes (vine paths, growth front, colours) are **calculated by p5**
  (`AG.Vines`) and passed as uniforms or a rebuilt mesh.

## 5. Shared state: one object, read by everyone

`AG.R2` (step 1) is the single source of Round 02 state. Writers:
- `garden.js`: the flow phase, visits, her proximity;
- `flower.js`: bloom, awake, dragging, hover (via `garden.js`).

The 3D scene, the p5 layer, the renderer's facade pass and the UI only **read** it. The derived
phase changes emit `U.emit('r2phase', { phase, prev })`, so the audio and UI can react without
polling.

## 6. No duplicate loops, inputs or contexts

- **One canvas, one WebGL2 context, one `p.draw`.** The garden scene and the p5 layer are
  functions called from `sketch.js`'s `p.draw`. The preview page keeps its own instance only
  because it is a separate page.
- **One input path in the game** (phase 2): the p5 callbacks in `sketch.js` forward to
  `AG.Garden` while Round 02 is active. `garden.js`'s own canvas pointer listeners are then
  removed. `AG.Input` stays for Round 01.
- **No new dependencies.** p5 1.11 already provides everything above.

## 7. Phases and test criteria

**Phase 4 notes (as built): the building's transformation.**

*Data streams.* All are in `AG.R2` (`js/garden/round2.js`), the single authority; everything
else only reads them.

| Stream | Source | Used by |
|---|---|---|
| `bloom`, `bloomed` | the flower | the trigger: nothing starts before 100 % (measured: 0 at 98 %) |
| `glow` (flower.core), `particles` (live motes) | the flower | the transformation's speed: `p.constrain(p.map(glow, 0.8, 2.4, 0.9, 1.2) · p.map(particles, 0, 40, 0.92, 1.12), 0.8, 1.35)` |
| `sinceBloom` | game time after 100 % (paused with the game, from `p.deltaTime`) | the golden pulse, the shaders' animation, breathing |
| `transform` 0..1 | `+= dt / 42 s · drive` | everything below |
| `stage.A … E` | windows on `transform` (`p.map` → `p.constrain`, overlapping): A 0–0.18, B 0.12–0.42, C 0.3–0.72, D 0.6–0.9, E 0.85–1 | shaders, p5 layer, rooftop flower |
| `windows` | `p.map(transform, 0.2, 0.78)` | which windows are lit |
| `flowerPos`, `buildingPos` | the scene, the doorway's building | light origin, rooftop placement |

*The stages:*
- **A, awakening.** A golden pulse (two rings, p5 layer, `p.scale`). Golden light spreads from
  the flower across the atrium floor and walls (a light front in the wall shader), and golden
  light paths grow across the floor.
- **B, energy flow.** Light rises up the building's columns and floor slabs, with pulses running
  up and along them, and the windows begin to light one by one (each has its own threshold).
- **C, organic growth.** Pink, cyan and lavender vines climb the walls, tip-first. Luminous leaves
  unfurl along them as the growth front passes (p5 layer: `push` / `translate` / `rotate` /
  `scale` / `pop`, bezier leaf outlines).
- **D, rooftop bloom.** A giant `AG.BloomFlower` opens above the roof, drawn by the existing
  flower renderer (`GardenScene.drawFlowerBody`: the same shaders and `p.rotate` / `p.scale`
  petal transforms). Inside, a rosette of light behind the flower opens, turns and pulses with
  the same stage, and the walls glow from the top.
- **E, living architecture.** Everything breathes (`p.sin`), the vines' light flows, and the
  colours drift with `p.lerpColor`.

*Procedural growth (`js/garden/vines.js`).* Walkers grow on the building's real planes:
- each has a position and direction (`p.createVector`);
- every step turns it by `p.map(p.noise(u, v, seed), 0, 1, −turn, turn)` and pulls it gently
  upward (`dir.lerp(up, k).setMag(step)`);
- side shoots branch when `p.random() < branchP`;
- a walker stops at the surface's edge;
- `p.randomSeed(seed from the building)` makes the vines deterministic per city (verified: a
  rebuild gives identical geometry).

The paths become ribbon meshes (`AG.GeometryBuilder`) whose growth order the shader reveals.
- **Inside**, the atrium walls are the doorway building's own footprint, enlarged to keep the
  walls at least 24 m from the flower.
- **Outside**, the four faces are the building's real lowest shaft, from the city's geometry,
  with extra roots at both sides of the doorway.

*Rendering split:*
- **WebGL / GLSL** (`js/shaders/living.glsl.js`, `AG.Living`): the walls, structure, windows,
  the vines inside and outside, the floor light paths, and the rooftop flower.
- **p5 drawing:** the golden pulse, the leaves and the rosette, plus the Phase 2 elements.

*Performance.*
- The meshes are built once (seeded) and grow by uniforms; nothing is allocated per frame for
  them.
- Measured CPU per garden frame: 0.9 ms before, 3.7–5.3 ms during the transformation.
- p5's immediate mode turned out expensive in WEBGL: every `beginShape` / `endShape` rebuilds its
  stroke geometry on the CPU (the floor paths drawn as p5 beziers cost ~11 ms), and filled bezier
  shapes are tessellated every frame (800 leaves hung the page). So those became a WebGL mesh,
  and the p5 layer keeps 40 outline leaves.

*Other notes:*
- **Exterior windows:** they are a soft overlay at about a third of the inside intensity, because
  they sit over the city's own windows and don't align with them.
- **Heroine and camera:** the transformation never moves her or the camera. Measured over 2.5 s:
  camera unchanged; she drifted 0.29 m, which is the tail of her own arrival easing.

**Phase 3 notes (as built).** Phase 3 has no new movement system: it reuses her existing
flight controller, poses and character drawing.
- **Flight.** `AG.Flight` (`js/core/flight.js`) has a **garden mode** (`enterGarden` /
  `exitGarden`). It keeps the same state (`F.pos`, `F.yaw`) and the same `p5.Vector` velocity,
  with garden rules:
  - "arrive" steering toward a point on a ring round the flower: desired velocity
    `p5.Vector.sub(target, pos).setMag(p.map(d, 0, slowR, 0, cruise))`;
  - the steering force `(desired − vel)·respond`, limited with `.limit()`;
  - fixed sub-steps of ≤ 1/120 s;
  - a keep-out sphere round the flower (`dot` / `sub`, so she never passes through it).
- **Measured.** She settles on the ring with **no overshoot**, arriving in 2.9 s at 10, 30 and
  60 fps alike (identical paths).
- **Keys and mouse.** ← → move her round the flower and ↑ ↓ change her height (the existing key
  handlers). The mouse never steers her in the garden.
- **Poses.** `CharacterDirector` uses the same images: `G` (flying, back view) while she flies
  in, cross-faded to `E` (levitating) once she has arrived.
- **Drawing.** `AG.Renderer.drawCharacterWith()` lets the garden scene draw her with the city's
  own character code and the garden's camera. She is drawn before or after the translucent petals
  depending on which is nearer. Her aura is at a third, because its square sprite edge shows
  against the garden's plain backdrop.
- **Proximity.** `p.dist` (her → the heart), then `p.map` (9 m → 3.6 m), then `p.constrain`
  give `prox` 0..1, eased with `p.lerp`. Measured, her near vs removed:
  - core 0.08 → 0.36 and emission 0.55 → 0.79;
  - the petals facing her lean up to 0.085 rad toward her (`p.rotate`);
  - motes 14 → 31, drifting toward her at 0.53 m/s (`p5.Vector` pull).
- **Click before she arrives.** A click on the sleeping heart while she is still flying in waits
  for her: the flower wakes when she arrives.
- **Conflicts.** None: orbiting the camera never moves her, and a drag with → held opens the
  flower and moves her round it, with the camera still.

**Phase 2 notes (as built):**
- **Input.** `js/sketch.js` defines `p.mousePressed`, `p.mouseDragged`, `p.mouseReleased`,
  `p.mouseMoved` and `p.mouseWheel`. They forward to `AG.Garden` only while the garden is on
  screen, and they ignore presses on the garden's own buttons. `garden.js` no longer has
  listeners of its own. Round 01 keeps `AG.Input`, unchanged.
- **Hover.** `GardenScene.hover()` compares the pointer to the heart with `p.dist`, against the
  heart's own pick radius on screen. The flower eases `hoverK` with `p.lerp`; the core rises by up
  to +0.45 (0.08 → 0.53 on the closed bud), and the cursor becomes a pointer.
- **Layer.** `js/garden/r2Layer.js` draws on the same canvas after the composite, in screen
  space with p5's default camera.
- **p5 limit found:** in p5 1.11 WEBGL, `ellipse()` with a detail above about 50 draws nothing,
  so the layer uses detail ≤ 48.
- **Ablation (in the running game):**
  - without `rotate`, the ticks and symbols stop turning (all upright);
  - without `scale`, the whole layer collapses to dots;
  - without `bezierVertex`, the petal symbols lose their outline;
  - without `translate`, everything piles up at the screen centre.


| Phase | Builds | Test criteria |
|---|---|---|
| **1 (done)** | `AG.R2` state and phase machine; the "R02" chip and key **6** jump straight to the start of Round 02; the HUD shows the Round 02 phase | The R02 chip and key 6 start Round 02 (the doorway flight) from any stage, with no lift-off cinematic and no end card. Phases run ENTER → APPROACH → AWAKEN → DRAG → BLOOM → TRANSFORM → EXIT → EXPLORE as the existing flow is played. The story path (end card → Enter the Memory Garden) still works. All five Round 01 stages work. No console errors. |
| **2 (done)** | One input path (p5 callbacks); hover on the heart (`mouseMoved` + `dist`) brightens the core; the p5 light layer (cue ring, awaken pulse, orbiting symbols, pollen halos) | Hover changes the core brightness (measured). Each layer element is visible in screenshots, and absent when its `p.*` call is disabled (ablation). Click / drag / release unchanged. The preview still works. |
| **3 (done)** | The heroine in the garden; APPROACH by pointing (`mouseMoved` / `mousePressed` → arrive steering, `p5.Vector`); proximity → glow, petal response, motes drifting toward her | Her distance to the flower changes the glow (measured). She stops smoothly (no overshoot) at 10, 30 and 60 fps. Drag still works. |
| **4 (done)** | TRANSFORM: at 100 %, `AG.Vines` (noise-guided `p5.Vector` walkers, seeded `p.random`, beziers, `lerpColor`, `millis`) grows light vines in the garden (p5 layer) and across the doorway building's facade (renderer pass); EXIT → EXPLORE shows the transformed building in the city | The growth starts only after 100 %, is deterministic per city, keeps 60 fps on the balanced tier, and persists when she flies around the building. Round 01 is unchanged. |

Each phase ends with screenshots, an interaction test, a Round 01 check and an honest report of
what was not verified.
