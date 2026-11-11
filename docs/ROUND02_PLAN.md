# Round 02 · Memory Garden — p5.js-first technical plan

Status: **phases 1 and 2 are implemented**: the state backbone, direct R02 navigation, one input
path, hover, and the p5-drawn light layer. Phases 3–4 are proposals with test criteria, to be
built one at a time.

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
| 3 | The heroine in the garden; APPROACH by pointing (`mouseMoved` / `mousePressed` → arrive steering, `p5.Vector`); proximity → glow, petal response, motes drifting toward her | Her distance to the flower changes the glow (measured). She stops smoothly (no overshoot) at 10, 30 and 60 fps. Drag still works. |
| 4 | TRANSFORM: at 100 %, `AG.Vines` (noise-guided `p5.Vector` walkers, seeded `p.random`, beziers, `lerpColor`, `millis`) grows light vines in the garden (p5 layer) and across the doorway building's facade (renderer pass); EXIT → EXPLORE shows the transformed building in the city | The growth starts only after 100 %, is deterministic per city, keeps 60 fps on the balanced tier, and persists when she flies around the building. Round 01 is unchanged. |

Each phase ends with screenshots, an interaction test, a Round 01 check and an honest report of
what was not verified.
