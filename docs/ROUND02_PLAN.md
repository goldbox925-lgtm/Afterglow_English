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
js/garden/gardens.js      AG.Gardens: the five buildings. CONFIGS (palettes, plants, particle motion,
                          rooftop size) and one site record per building (doorway, position, seed,
                          saved flower, transformation, completion, rooftop)                  [phase 6]
js/garden/botanical.js    AG.Botanical: the atrium's procedural plants (hanging wisteria, planters),
                          grown once into a cached opaque mesh.
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

**Environment upgrade, Part A (as built): the glass atrium** (`js/garden/atrium.js`,
`js/shaders/atrium.glsl.js`).

*Geometry.* Real 3D meshes, built once with `AG.GeometryBuilder` (about 102 k vertices in 5
meshes after the tuning pass, `p.randomSeed` for repeatable variation):
- **Glass hall:** 24 m radius, 36 facets × 7 bands up to 28 m, then a ribbed glass dome to 44 m
  with an oculus.
- **Metal:** mullions, ring beams, 12 dome ribs and dome rings.
- **Integrated light strips:** on every second mullion, as a floor cove light, and on the
  walkway rails.
- **Stepped pearl platform:** 3 steps under the flower, with gold edge strips.
- **Two curved walkways:** at 9 m and 17 m, with rails and under-edge light.
- **8 planters and 102 hanging wisteria plants:** procedural, on the real beams (see *The procedural plants* below).
- **The city beyond the glass:** the REAL Round 01 buildings round the doorway tower (1,165 of
  them, from the city's own collision boxes), in the city's own axes. The garden's origin is the
  doorway building's centre at the doorway's floor. Towers closer than 60 m are left out so the
  glass is not walled in. The city floor far below shows its street lights.

*Materials and light (WebGL2 / GLSL):*
- **Metal and stone:** hemisphere ambient, a key light from the dome, the flower's warm point
  light, soft Blinn highlights and a fresnel rim, plus depth haze.
- **Glass:** fresnel alpha, thin-film colour, vertical reflection streaks and bright pane edges.
- **Floor reflection:** the frames, plants and flower are rendered a second time through a
  mirrored view matrix (about y = −1). The polished floor is drawn translucent over that
  reflection, more reflective at grazing angles. No real-time ray tracing.
- **Floor inlays:** light rings and spokes, and a golden pool round the platform.
- **City:** window grids, roof trims, aerial haze and a glow rising from below.
- **Plants:** opaque and depth-tested (see *The procedural plants* below), swaying in the vertex shader.

*Responding to her* (the existing streams: her position, `prox`, the flower's core):

| Effect | Far → near (measured) |
|---|---|
| Light-strip colour, `p.lerpColor` | violet-blue (0.53, 0.55, 1.0) → pink-gold (1.0, 0.6, 0.65) |
| Floor inlays | lavender → gold |
| Golden pool radius, `p.map` → `p.lerp` | 6.6 → 11.3 m |
| Pollen speed | 0.37 → 0.67 m/s |

- The pollen also drifts toward her (`p5.Vector`, no per-frame allocation).
- The plants lean away and brighten within about 10 m of her (vertex shader).
- The core's warm light on the stone follows the flower's glow.

*p5 drawing:* 14 petals drift down (`p5.Vector` + `p.noise` breeze), drawn as bezier outlines,
turning (`p.rotate`) and tumbling (`p.scale` on one axis).

*Tuning pass (toward the reference):*
- **Brighter room:** a brighter ambient, gold-white light strips on every mullion, and a stronger
  warm light from the flower.
- **Glowing dais:** the pearl top glows gold round the flower, with an inner ring of light.
- **Floor:** a stronger mirror (58–92 % reflective) and brighter inlays.
- **City:** lighter glass towers with more lit windows and less haze.
- **Glass and wisteria:** more glass sheen, and fuller wisteria.
- **Camera:** fov 58° at 15.5 m, a lower pitch looking slightly up into the room.

*Scale and camera:*
- The game's flower is now 2.6 (2 in the preview), and her hover ring, keep-out sphere and
  height scale with it.
- Default camera: fov 58°, 15.5 m, a low pitch that shows the room; zoom up to 20 m (inside the
  glass).

*Performance:* about 5.3 ms CPU per garden frame (forced redraws, everything on). All meshes are
static; per frame only uniforms and 48 + 14 small objects update.

*Limitations:*
- The atrium (24 m radius) is larger than the tower's real footprint (22 × 49 m): the interior is
  enlarged so the garden, the camera and the heroine fit.
- The platform's top is evenly lit, without reflections of its own.
- The dome is mostly above the default view.
- Phase 4's flat interior walls and their vines and leaves are gone. The transformation now plays
  on the atrium itself (see *Inside the atrium* below). The facade and rooftop parts are unchanged.

**The procedural plants (`js/garden/botanical.js`, the `gardenPlant` shader).** They replaced the
hanging "cotton".

*What was wrong.* Each strand carried three soft crossed quads, up to 1.2 m wide, every 0.6 m. They
were drawn additively without depth writes, so they merged into blurry blobs, could not hide one
another, and went over the bloom threshold. The camera could reach the walkways (r = 17.5 m), and
nothing shrank sprites near the lens.

*Now.*
- 102 plants and 8 planter plants: 653 flower clusters, about 19,000 flowers, about 2,100 leaves,
  160 k vertices in two cached meshes, built once. Only the lower mesh (walkway at 9 m, planters) is
  drawn in the floor's reflection, and the upper plants' flowers have no wing petals.
- Opaque and depth-tested, drawn with the metal before the glass and the flower.
- Attached under the real beams: the walkways, the wall's top ring, the dome's first ring.
  `p.noise` makes clumps and gaps along each beam; the tips stop above the flower.
- `p.random`, `p.noise`, `p.createVector` and p5.Vector grow the paths; `p.map`, `p.lerp` and
  `p.constrain` set lengths, taper and flower size; `p.bezierPoint` gives the leaf outline;
  `p.lerpColor` the palette; `p.sin` / `p.cos` the whorls and the idle sway; `p.deltaTime` drives
  the ripple through `dt`.
- Plants within about 4 m of the camera, or of the line of sight to the flower, are dithered away.
  `cam.maxR` (16.4 m) keeps the camera inside the walkways, except on a narrow portrait screen,
  which needs the distance to fit the flower. Pollen fades near the lens, and drifting petals
  larger than 42 px are skipped.
- Streams: `uHer` / `uProx` (leaves lean and flutter, light rises), 12 sparks follow her; `uBloom`
  (nearby flowers brighten); `R2.dragging` (a ripple through the plants); stages C and E (gold,
  richer colours).
- The platform's glow and highlight were reduced, so the flower reads against it.

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
- **A, awakening.** A golden pulse (two rings, p5 layer, `p.scale`). A golden wave spreads from
  the flower across the atrium's platform and floor, and the floor's inlays turn gold behind it.
- **B, energy flow.** Light rises up the building's columns and floor slabs, with pulses running
  up and along them, and the windows begin to light one by one (each has its own threshold).
- **C, organic growth.** Pink, cyan and lavender vines climb the facade, tip-first. Small luminous
  leaves unfurl from them as the growth front passes (see *Facade leaves* below).
- **D, rooftop bloom.** A giant `AG.BloomFlower` opens above the roof, drawn by the existing
  flower renderer (`GardenScene.drawFlowerBody`: the same shaders and `p.rotate` / `p.scale`
  petal transforms). Inside, a rosette of light behind the flower opens, turns and pulses with
  the same stage, and the dome and upper glass glow pink-gold.
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
The vines grow only outside: the four faces are the building's real lowest shaft, from the city's
geometry, with extra roots at both sides of the doorway.

*Inside the atrium (`AG.Atrium.update` turns the streams into `A.fx`, `js/shaders/atrium.glsl.js`
draws it).* Before 100 % every value is zero, so the room is exactly the Part A room.

| Stage | Effect | Uniforms |
|---|---|---|
| A | A golden wave crosses the platform and then the floor (radius `St.A · 32 m`). Behind it the inlays and stone joints turn gold. Nothing is added right under the flower. | `uLight`, `uLightR` (solid, floor) |
| B | Energy climbs the frames (front at `y = −1 + St.B · 49 m`). Behind it the strips turn gold and settle lower, so the pulses running up them read as moving light; the metal warms. | `uEnergy`, `uFrontY` (solid) |
| B–D | The wall panes light one by one, in the facade windows' colours; about 70 % end up lit. | `uWin`, `uWinA`, `uWinB` (glass) |
| C | Gold spreads out from the flower through the plants: stems and leaves turn gold, the flowers' throats light up and their colour stays. | `uGold`, `uGoldR` (plants) |
| D | The dome and upper glass glow pink-gold, as added light, so the city stays visible through it. | `uDome` (glass) |
| E | The plants' colours reach their richest, and all the room's light breathes with the facade (`Living.look().breath`). | `uColA`, `uColB`, `uBreath` |

*Facade leaves (`AG.Vines.ribbons`, option `{ leafEvery, leafSize, rand }`).* They are part of the
vine mesh: world-space quads on the same facade plane as the vines.
- A leaf is based exactly on a point of its vine (every 4th path step), turned 0.7–1.1 rad off the
  vine's direction, alternating sides along the vine. A leaf that would overhang the face's edge
  is left out.
- Its data is `(s, 2, depth, hash)`: `s` is that vine point's growth order, so it can never appear
  before the vine reaches it; `across = 2` marks it as a leaf for `livingVine`.
- The shader scales the leaf outline about its base by how far the front has passed it, so it
  unfurls from the vine. Stage E fully opens the last leaves at the very tips.
- Size, angle and hash come from the build's seeded `p.random`, so the same seed gives the same
  leaves (verified: a rebuild gives identical geometry).

*Rendering split:*
- **WebGL / GLSL** (`js/shaders/living.glsl.js`, `AG.Living`): the facade walls, structure,
  windows, the vines and their leaves, and the rooftop flower.
- **p5 drawing:** the golden pulse and the rosette, plus the Phase 2 elements.

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
  they sit over the city's own windows and don't align with them. Their colour is a per-window mix
  of `uWinA` / `uWinB`, which `p.lerpColor` moves from cyan-lavender through pink to gold-pink as
  the transformation progresses (`AG.Living`, 0..1 RGB).
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
- **Keys and mouse.** ← → fly her round the flower and ↑ changes her height, with the city's
  key handlers and tap detection (see *Flight controls* below). The mouse never steers her in the
  garden.
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
| **6 (done)** | Five living buildings on one system: `AG.Gardens` configurations and site records; one flower scene whose state and palette are swapped per building; one atrium whose plants and city view are rebuilt per building; a facade and rooftop flower per completed building; the "City Bloom" counter; the finale | All five can be entered and use their own palette. The shared bloom works in each. Rooftop flowers stand on the right buildings. Finished states persist across switches. Round 01 and direct R02 still work. No added listeners or render loops. |
| **6b (done)** | Progress HUD (City Bloom from completed buildings, the building, bloom and transform bars from the real values) and short narrative lines at arrival, first drag, completion and leaving; each completed building adds to the sky glow and keeps a column of light | The counter starts at 0 / 5 and rises once per completed building. Bars match the real values and reach 100 % only when done. Progress persists across switches. Lines appear at their moments, hold while paused, clear on Replay, and never take the pointer. The HUD fits desktop and phone widths. Round 01 shows none of it. |

Each phase ends with screenshots, an interaction test, a Round 01 check and an honest report of
what was not verified.

**Phase 6 notes (as built): five living buildings.**

*One system.* `AG.Gardens.CONFIGS` holds what differs: Rose, Azure, Violet, Solar and Aurora each
have a flower palette, an interior palette, facade and portal colours, plant parameters, particle
motion and a rooftop size. `AG.Gardens.sites` holds one record per building in the current city.

*What is shared and what is per building.* There is one p5 instance, one `p.draw`, one flower
scene (`G.scene`), one atrium room, one set of shaders and one set of flower meshes.
- Going through a doorway, `AG.Garden` saves the previous site's flower (`snapshot`), loads this
  one (`restore`, `setPalette`), and asks the atrium to `activate(site)`.
- `activate` frees the previous plants and city view, then rebuilds them with
  `p.randomSeed(site.seed)` and the site's parameters. Only one building's details are in memory.
- A facade and rooftop flower are built only when that building has bloomed.
- `AG.R2` advances every bloomed site's transformation, including while she is in another building.

*Choosing the buildings.* `garden.js chooseAll()` takes the doorways nearest downtown that stand
well apart. All five prefer roofs with a helipad or lattice crown, so that no mast or spire passes
through the flower; other roofs are used only if a city has too few. The city generator now
records `crownKind` on each building; this draws no random numbers, so the city is unchanged.

*Progress.* The progress HUD and the finale are described in the next section.

**City progress and narrative (as built).**

*The HUD (`js/garden/r2Hud.js`, `#r2Hud` in `index.html`).* It reads the game's state once per
frame, after `AG.R2.update`, and writes the page only when a value changes. It has no progress
value of its own:

| Shows | Read from |
|---|---|
| City Bloom: n / 5 | `AG.Gardens.completedCount()`: a building counts once its transformation is complete |
| Building name and colour | the site in focus: the one she is in; in flight, the one still transforming behind her, else the doorway she is lining up with |
| Bloom bar | `AG.Garden.siteBloom(site)`: the live flower for the site the scene holds, the saved one otherwise |
| Transform bar | `site.transform` |
| Stage caption (inside, wide screens) | the flower's `stageName()`, then the transformation stage |

- Both bars show 100 % only when the game says done (`AG.R2.BLOOM_DONE`, `transform >= 1`); below
  that they round down, so they never reach 100 % early.
- The bars are `role="progressbar"` with `aria-valuenow`. The HUD has `pointer-events: none`, so a
  click or drag over it reaches the canvas and cannot change a value.
- In flight, only values in progress are shown. When all five are complete, only the counter stays.
- The HUD is visible only with `body.garden` (Round 02). The old bottom meter is removed; its stage
  text moved into the HUD.
- Layout: top-right on wide screens. Up to 1240 px the instructions panel moves left, under the
  brand. At phone width the HUD is a full-width strip, at the top inside and above the controls in
  flight.

*Narrative.* A short line fades in and out at the bottom centre at four moments: arriving in a
building, the first drag of its flower, its transformation completing (wherever she is), and
leaving a bloomed building while others still wait. The line is picked from the real counts of
bloomed and completed buildings, so the wording moves from her strength, to the city waking, to
the city made beautiful. Claims such as "One bud left" are only made when true. The full central
sentence appears once, when the fifth building completes. Each site stores which moments it has
told (`site.told`), so a moment is never repeated for the same building. Lines run on the game
clock: pause holds them, Replay clears them. They never take the pointer.

*The city's awakening.* Each completed building adds a share of the sky glow
(`AG.Gardens.awakeningLook()`, `p.lerpColor` round the finished buildings' colours); with all five
complete this equals the earlier finale. A finished building also keeps a thin column of light in
its colour over its roof, using the existing portal beacon, which swells once the first time she
is out in the city to see it.

**Flight controls (as built).** Round 02 uses the city's flight (`AG.Flight`, `js/core/flight.js`).
There is no separate movement system: the same key handlers, the same ↑ tap / double-tap detection
(`press()`), the same speed, acceleration, turn rate and turn tightening.

*Between buildings (approach / explore).* The controls are the city's:

| Input | Result |
|---|---|
| ← / → | turn left / right (each tested on its own) |
| ↑ tap | a lift of about 15 m |
| ↑ ↑ double-tap (within 0.4 s) | the stronger lift, about 45 m; one tap never triggers it |
| ↑ hold | speeds her up (21 → 30 m/s), as in the city |
| ↓ hold | descends, and cancels a lift still pending |
| mouse x | turns her, as in the city |

The doorway assists (`F.assistTurn`, `F.assistVy`, set in `js/garden/garden.js`) now yield to the
player:
- The turn assist fades out while an arrow is held and returns about 1–2 s after release.
- The height assist pauses while ↑ or ↓ is used or a lift is still running, and returns about
  1.5–3 s later. A tap of ↑ now climbs even when she is lined up with a doorway. Before, the height
  assist pulled her back down, and within 110 m (`assistHold`) it cancelled the lift altogether.
- After a click on R02 or "Back to the city", the pointer is usually resting on the button, off
  centre. It is "parked" (`F.mouseParked`) and does not steer her until it moves 24 px. Before, it
  turned her on its own and could cancel ←.
- While Round 02 runs, a held arrow key wins over the mouse (`F.keysFirst`).

All of these are 0, false or null in Round 01, so its flight is unchanged.

*In the garden (garden mode).*
- ← / → fly her round the flower at 8.5 m/s (the city's turn tightening included) and back to the
  slow cruise when released. ← always carries her to the left of the view and → to the right: the
  ring direction is chosen from the camera's right vector (`g.camRight`).
- She faces the way she flies: the yaw follows her velocity quickly while she moves fast.
- ↑ tap and double-tap give the city's lifts at room scale (× 0.1, about 1.5 m and about 4.5 m),
  eased. ↑ hold climbs steadily, ↓ hold descends, and the height range is 0.9–8.5 m.
- Released, she settles back on the ring beside the flower and returns to her levitating pose.
- The mouse still belongs to the flower and the camera. A click or drag on the flower never
  starts flight, and a drag works with an arrow held.

All of this is frame-rate independent (exponential easing on `dt`, sub-steps ≤ 1/120 s), and
nothing sets her position directly.

**Flight out, rooftop reveal and next target (as built)** (`js/garden/garden.js`,
`js/core/flight.js`, `js/garden/atrium.js`, `js/shaders/atrium.glsl.js`, `js/garden/living.js`,
`js/shaders/living.glsl.js`, `js/core/camera.js`, `js/ui/ui.js`).

*When it runs.* A site completes (transform 100 %) while she is inside: `site.exitSeq` becomes
`'pending'` and the garden moves to the new phase `launch`. If it completes while she is outside
(or after "Back to the city"), `exitSeq` is `'skip'`: there is no flight out, and going back in later
does not replay it. Each site keeps its own progress.

*Timeline (game seconds from the start of `launch`).*

| t | What happens |
|---|---|
| 0 – 2.2 | The final light: a bright band rises through the atrium's glass and metal (`uFinal`). |
| 1.2 – 2.4 | The glass panel on the doorway's side dissolves open with a glowing edge (`uOpen`, `discard`), about ±20° wide, between the floor band and the first walkway. |
| 2.0 | She takes off (`F.garden.launch`): an assisted course to the opening and straight on, at the city cruise speed with the city acceleration. |
| about 3 – 5 | Past the glass and through the building's facade: a short light flash, then she is in the city. |

*Controls during the launch.* ← / → shift her across the opening (7 m/s, in screen terms through
`camRight`). Taps and double-taps of ↑ lift her within the opening (× 0.12). Held ↑ / ↓ climb or
descend, kept inside the opening. The aim goes round the flower if it is in the way. Everything
works on `dt` (sub-steps ≤ 1/120 s). Full city control returns as soon as she is outside. The pad
(← → ↑ ↓) is shown during the launch on touch screens. The mouse is not used for flight, so it
cannot interfere with the flower.

*The hand-off (no teleport).* The garden's axes are the city's. Its origin is
`O = [box.cx, doorway.y − doorway.h/2 + 1, box.cz]`, the same offset `atrium.js` uses, so
`world = garden + O`. The hand-off keeps her position, velocity (`F.setVel`) and any lift still
being eased (`F.carryLift`). The scene change (atrium image → city image) is covered by a short
white flash (0.5).

*Rooftop reveal.* A 4 s camera pose from `AG.Garden.cameraPose()`. It is a side shot because the
flying character only has a back view. It frames her and the rooftop flower together, pulling back
to fit both (at most 75 m in landscape and 150 m in portrait). It carries the camera with her
(`anchor`) so she stays in frame at full speed. Next, the chase camera eases back. For about 3 s its
look is gently drawn toward the next target's beacon, unless the beacon is behind her. The camera
never steers her, and the player keeps control throughout. `snapLook` in `camera.js` is opt-in, so
Round 01's cuts are unchanged.

*Next target.*
- `G.targetSite` is the nearest building that has not yet bloomed: measured from her position in
  the city, or from the current building after it completes.
- It changes only when the current target completes, or when she flies into another building.
  Buildings that bloomed but are still transforming are skipped.
- The target's beacon is the brightest and widest; other unfinished buildings get a dimmer one.
- The edge arrow points to the target's doorway while it is off screen.
- The HUD pill reads "NEXT: AZURE · 420 m", with a live 3D distance in steps of 10 m and a dot in
  the building's colour. It reads "AZURE · TRANSFORMING 6%" while the target has bloomed but is
  still transforming, and "THE CITY IS IN BLOOM" when all five are complete.
- The story line after a flight out is "One light has returned. Another is waiting."
- The hint "Fly to the beacon. Double-tap ↑ to rise; use ← → to steer." is shown during the launch and the reveal.
- **Arriving at the target** (`trackTarget` in `js/garden/garden.js`). As she closes in on the next
  target's doorway (from 320 m to 90 m), its beacon grows brighter (about 1.6× at 100 m, up to about
  2.2× nearer), wider (12 → 17 m) and pulses faster, and its doorway glows even before she is lined
  up with it. Within 170 m the prompt changes to "ENTER AZURE" / "Fly into the glowing doorway to
  enter Azure. Use ← → and ↑ ↓ to line up." (it goes again past 200 m).
- The entry starts only when she flies into the doorway's rectangle herself. Nothing moves her
  there: the existing gentle line-up (a small turn and height assist when she is in front of it and
  roughly heading for it) helps, but she has to keep flying toward it. Through it, the existing
  1.1 s glide into the light and white fade open that building's scene with its own flower.

*Audio-reactive awakening* (outside the building only, for 9 s after completion).
- **Wave** (`uWave` in `livingWall`): a band of light rises up the facade, brightening the
  structure lines and windows in the building's palette. Its strength follows
  `Reactivity.drive.mid`.
- **Sparkles:** 2–4 at a time on a rising musical accent (`Reactivity.accent` above 0.42, at least
  0.24 s apart), on the facade or around the rooftop flower. There are at most 16 per building and
  each lasts 0.7 s.
- **Trail:** 48 light sprites from the building toward the next beacon (up to 160 m, pink → gold
  in the building's palette). It grows over 2 s and fades out at 5.5–7.5 s, and its shimmer follows
  the treble.
- Everything uses the existing analysis (`AG.Reactivity`), which already includes the AUDIO
  REACTIVITY ON/OFF fade. With reactivity OFF the wave plays at a steady base strength, the trail
  does not shimmer, and there are no sparkles. There is no microphone and no new audio source.

*Fallback.* "Back to the city" still works at every point inside, including before completion. If
she leaves early, the flight out is skipped (`'skip'`) and the target stays the same building until
it completes.

*Limitations.*
- The reveal is a side shot (no front-facing flying pose), and she is small at its widest moment.
- The atrium scene and the city scene are separate images, so the change between them is covered by
  a flash. Her position and speed are continuous.
- The audio-reactive parts were tested with synthetic levels, not real music.

**The 3D heroine in the Memory Garden (experiment, as built)** (`js/character/heroModel.js`,
`js/shaders/hero3d.glsl.js`, assets in `assets/character/3d/`).

*Scope.*
- She is drawn in 3D only inside the Memory Garden scene: the phases `inside`, `leave` and the
  flight out (`launch`).
- In the city (Round 01, and Round 02 between buildings) she is the original pose images. The
  scene changes are covered by the existing white fades, so the swap is never seen.
- The flight physics, controls, camera, flower and shaders are unchanged. The only movement change
  is a new, opt-in impulse (below).

*Assets.* The two Blender exports share one rig:
- `Afterglow_Animated.glb`: the mesh (49 080 vertices, 31 030 triangles), a 24-joint skin, one
  JPEG texture, and the clips Flight, Idle_Float and Idle_Float.001.
- `Afterglow_Flower_Reaction.glb`: only its clip Flower_Reaction is read. Its channels are mapped
  onto the first file's skeleton by joint name, and the loader checks that the joint lists match.

One mesh and one skeleton are drawn, never two characters.

*What the clips contain* (checked in the GLBs and in the source `.blend` files):

| Clip | Length | Bones that move | Notes |
|---|---|---|---|
| Flight | 4 s | arms, legs, head | eases from the rest pose into the flight pose over 0–2 s, then holds; the body stays upright in the export |
| Idle_Float, Idle_Float.001 | 4 s | none | identical: the rest pose (arms out), plus a 0.2 m bob on the Armature node (a seamless loop) |
| Flower_Reaction | 1.667 s | spine, head, arms, right shoulder | starts from the rest pose, ends elsewhere |

The Armature node's bob is played on one continuous clock, separately from the bones, so
cross-fades never make her dip. The reaction file's own root channels are ignored.

*Rendering.*
- **Mesh:** a `p5.Geometry` drawn with `p.model()` and a `p.createShader()` program in the garden
  scene's framebuffer. It writes depth, so petals, planters and glass sort correctly around her.
- **Skinning:** on the GPU. p5 1.11 has no custom vertex attributes, so each of the four influences
  is packed as `joint + weight × 0.999` into the vec4 colour channel. That is the same packed-data
  channel the city meshes use.
- **Joint matrices:** 24 matrices sent as 72 `vec4` rows.
- **Light:** lavender ambient, a warm key light from the flower's heart in its palette (stronger as
  she comes close), and a soft rim.
- **Texture:** resized to 2048² and mipmapped.


*Scale.* The rig is drawn ×3.3 (about 5.6 m, three times the earlier ×1.1). This is visual only: the
flight speed, the collision radius and the interaction distances are unchanged. The open flower
stays wider than she is. The flight-out camera pulls back by `min(1.9, √(scale/1.1))`.

*Garden camera framing for her size* (`gardenScene.js camera()`, fed by `garden.js heroTick`).
- Horizontal, her body reaches about 5 m out from her head, and her head flies on a ring of about
  4.9 m round the flower. A narrow window could not hold that: on a 536 px wide pane she was cut in
  half by the frame's edge whenever she flew round to the side.
- While she is inside, the garden passes the camera her body's centre (`AG.HeroModel.centre`) and
  reach (`reach()`, 0.88 × scale ≈ 2.9 m). The camera then stands back far enough for the ring plus
  her body (`fitW`), never past 20 m (inside the glass).
- On a screen still too narrow for that, the view slides sideways towards her, eased over about
  0.4 s. It stops before the flower's heart comes nearer than 2.6 m to the frame's edge.
- On a wide screen (1280×720) nothing changes: the camera stays at 15.5 m, with no slide.
- The flight-out camera (`cam.eye`) is unaffected, and the slide is off while it runs.
- Measured: at 1280×720, distance 15.5 m and slide 0. At 536×600, 20 m and 1.1 m. At 375×812,
  20 m and 1.8 m. Those were measured with a 3.4 m margin. The margin was then eased to 2.6 m, which
  allows up to about 2.5 m of slide on 375×812; that has not been re-measured.
- On 375×812 at the 3.4 m margin, her head and body stayed in frame at the side of the ring, but
  her legs reached past the edge.

*Clip check, repeated* (Python, read straight from both GLBs):
- `Idle_Float` and `Idle_Float.001` are byte-identical: the bob only, with no bone motion.
  `Idle_Float` is used.
- `Flower_Reaction`'s root channel is a constant identity rotation, so ignoring it changes nothing.
- The two files' Armature offsets differ (−1.73 vs −0.85). That does not matter, because only the
  reaction's bone channels are taken from the second file.
- `Ascend`, `Rest` and the empty `baselayer` clips are not loaded.

*Sequence* (`AG.HeroModel.update`, driven from `AG.Garden.update`, so Pause holds the pose):

| State | Clip | When | Cross-fade in |
|---|---|---|---|
| arrive | Idle_Float (its bob) | entering a garden, for 1.6 s, under the white fade-in | none |
| flight | Flight, played once, then held at its last frame | after arrive (or at once if the flight out begins) | 0.5 s |
| react | Flower_Reaction, once | the first time this building's flower reaches `R2.BLOOM_DONE` | 0.5 s, then 0.9 s back to the held Flight pose |

- **Breath.** During arrive a procedural sigh lifts the chest and shoulders (Spine01, Spine, neck,
  both shoulders), rising and settling once. Later a faint 4.5 s breath continues in the held pose.
  It is off during the reaction. There is no breath clip; this is bone rotation on top of the clip.
- **Horizontal flight.** The exported Flight keeps the body upright; only the source
  `Idle_Float.blend` tilts it 77° forward. So the 77° tilt is rebuilt in the model matrix and eased
  in with Flight's own 0–2 s progress, so pose and tilt arrive together. In the held pose a slow
  pitch/roll sway and Idle_Float's bob keep her floating. She faces her direction of travel and
  banks on turns.
- Movement changes never restart Flight: once held, it stays held.
- **No clipping.** With the body horizontal, the model is drawn so her head, not her hips, sits at
  the controller point (`HEAD_BACK`); the body trails behind it. Hovering by the open flower, the
  head keeps a clear gap from the petals.
- **Reaction.** It starts from the held Flight pose (the tilt fades to upright with it) and its fast
  first keys are covered by the 0.5 s fade. Its upward lift is `AG.Flight.gardenImpulse(1.6, 1.8)`:
  the garden's arrive target rises and settles in a smooth bump. The skeleton's root is never moved.
  The per-building flag is `site.reacted`, cleared by Replay. Rest and Ascend are not used.

*Loading and fallback.*
- The GLBs are fetched when Round 02 starts (`AG.Garden.start`), never in Round 01.
- Whether a visit uses 3D is decided when she enters a garden. If the model is not ready yet, that
  visit keeps the images. A load error keeps the images. `?hero=2d` turns the 3D heroine off.
- `AG.HeroModel.debug()` reports the state, the transitions and the asset info.

*Known limits.*
- Idle_Float and Idle_Float.001 have no bone motion in the export, so only their bob is used.
- The horizontal tilt is procedural (see above). A re-export of Flight with the hips rotated would
  let `FLIGHT_TILT` in `js/character/heroModel.js` drop to 0.

**Garden flight, city landmarks and navigation (polish pass, as built).**

*Controls (Round 02).*
- **In the garden:** ← → fly round the flower, true to the view; release them and she glides to a
  stop. A tap of ↑ lifts her; a double tap lifts her more; hold ↑ to climb or ↓ to descend. The
  mouse belongs to the flower (click the heart, drag outward) and to the camera (drag elsewhere,
  wheel).
- **In the city:** ← → steer. Tap or double-tap ↑ to rise; ↓ descends. To enter a building, fly into
  its glowing doorway yourself. Nothing flies her there.

*Smooth flight round the flower* (`gardenUpdate` in `js/core/flight.js`, garden mode only). Measured
with fixed frame steps over the same ← / release / → / reversal sequence, the jerk had three causes:
- **Heading.** She faced her velocity above 0.35 m/s and the flower below it, a hard switch. That
  swung her up to 90° in a few frames (up to 7–30 rad/s), which looks harsh on a 5.6 m body. Now the
  two directions are blended continuously by speed. A critically damped spring (ω 6.5/s, at most
  2.6 rad/s) turns her, sub-stepped with the path.
- **Orbit target.** It jumped to full orbit speed on a press and froze on a release. Now its angular
  velocity eases in and out (`G.azVel`, frame-rate independent), so she accelerates and decelerates.
- **Held boost.** The city's held-arrow boost (+55 %) asked for about 46 m/s² on the 4.9 m ring,
  beyond the 26 m/s² steering limit. She drifted out and swung back. In the garden the boost is now
  +15 %.
- Her nose-up / nose-down while climbing is eased in `js/character/heroModel.js` (it followed the
  vertical speed instantly).

Results at 30, 60 and 144 fps were the same:

| | Before | After |
|---|---|---|
| Peak turn rate | 7.4–30 rad/s | 2.6 rad/s |
| Turn acceleration (99th percentile) | 134–305 rad/s² | about 20 rad/s² |
| Peak jerk | 546–9128 m/s³ | about 96 m/s³ |

The game's speed is unchanged, apart from the held boost above.

*Her size.* The 3D heroine is ×3.3 (about 5.6 m, 3× the first build). The image heroine (the
fallback when the model is not loaded yet, or `?hero=2d`) is now drawn 3× in the garden too: the
`k` size multiplier in `R.drawCharacterWith`, which only the garden passes. Speed, collision and
interaction distances are unchanged.

*Completed buildings as landmarks.*
- **The rooftop flower** is 1.6× larger. Its open crown reaches a little past the roof's edge, as in
  the Azure concept art. Its base stays on the roof and the petals above it.
- **A glow crown** in the flower's colours surrounds it (`living.js`). It is depth-tested, so a
  building in front hides it, and its size never drops below 3 % (inner) / 6 % (outer) of the
  distance, so it reads across the city.
- **The completed building's beacon** is a steady column (0.5–1.0 strength, 7–12 m wide). The next
  target's beacon is the pulsing, brighter and wider one (12–17 m). Far away every column keeps a
  readable width: about 1 % of the distance, or 1.5 % for the target.
- **Markers in the building's colour** (`#landmarks`, `landmarkMarks` in `js/ui/ui.js`):
  - off screen: a dot with a pointer at the screen edge;
  - on screen but behind other buildings: a ring on the flower;
  - in plain sight: none.
  
  Occlusion is a segment test against the city's boxes about 8 times a second; the building itself
  does not count. A marker never sits on the target's edge arrow.

*Finding the next building.*
- **Order.** The next target is the nearest building not yet bloomed. With seed 698426 the legs are
  297–595 m (about 15–30 s at cruise speed). The selection is unchanged because it already keeps the
  route short.
- **Reveal.** After the flight out, the reveal shot frames the completed flower, then the look is
  drawn toward the target's beacon.
- **HUD and trail.** The HUD reads "NEXT: AURORA · 460 m" (live), and a short trail of light fades
  out toward the target.
- **Edge arrow and ring.** The arrow and its ring are in the target's colour. The ring now also
  marks the target's doorway when it is on screen but hidden behind buildings.
- **Arrival.** On approach the entry prompt shows (see *Arriving at the target*). Inside a building
  the HUD objective reads "AURORA · INSIDE" (it used to compute a distance from garden coordinates).
- **Finale.** When all five are complete the target guidance gives way to "THE CITY IS IN BLOOM".

*Audio-reactive effects* (the existing analyser and the AUDIO REACTIVITY toggle; no microphone, no
second soundtrack):
- **Facade wave.** The completion wave plays for 9 s, as before. Afterwards a restrained wave climbs
  the completed facade every 14 s. Its strength is 0.16–0.47, from the music's mids, × the
  ON/OFF fade.
- **Sparkles.** Afterwards they come one or two at a time, only round the rooftop flower, on a
  musical accent, at most every 1.4 s.
- **Trail.** It shimmers with the treble, as before.

With reactivity OFF all of these fade to nothing.

*Tests (built-in browser, 1280×760 and 375×812, seed 698426).*
- **Garden arrival.** The breath plays (1.6 s), then Flight eases into the held horizontal pose and
  stays held while she hovers and orbits. The reaction plays once at full bloom.
- **Orbit.** Both directions, stopping and reversing measured as in the table above. Screenshots
  show a readable pose at 3D and image sizes.
- **Landmarks.** Rose was viewed from 300–1000 m and from a street at 55 m. The flower and its crown
  read at 600 m. When it was hidden, the HUD marker showed. Behind the camera it moved to the edge.
- **Next building.** Rose's flight out led to the reveal, the trail, "NEXT: AURORA" and the
  colour-matched arrow. The doorway ring appeared when Aurora was hidden. With only forward flight,
  she entered Aurora at the prompt and Aurora's own scene opened (flower at 0, 3D heroine arriving).
- **Audio.** The recurring wave reaches 0.157 with reactivity ON and 0 with it OFF. Sparkles were
  born on accents with ON and none with OFF. These accents were synthetic: the test tab's analyser
  read silence, since there was no click to start playback.
- **Pause, replay, progress.**
  - Pause froze her position, her heading and the clip.
  - A flower left at 50 % is still 50 % on re-entry.
  - Replay reset the buildings, the heroine and the markers.
- **Round 01.** Stages 1–5 are unchanged; no markers or Round 02 colours appear.
- **Narrow screen.** 375 px wide with no horizontal scroll; the HUD, the edge arrow and the marker
  fit.
- **Errors.** No console errors. The only harness error is the known `interactions.js` race of the
  test's manual redraw, which also happens on the committed base.

*Not verified.* A real phone, frame rate on slower GPUs, the music actually driving the sparkles
(only synthetic accents were used), and every seed's building layout.

*Re-test after the camera framing change (built-in browser, seed 195747; 536×600, 375×812 and
1280×720).*
- **Arrival.** Arrive, then Flight at 1.61 s, held. Orbiting ← and → never restarted a clip: the log
  shows only the two entries.
- **Reaction.**
  - At full bloom, Flower_Reaction played once.
  - She rose upright with her arms open, and her highest lift was 0.75 m, from the movement impulse.
  - It went back to the held Flight pose at t = 4.
  - The building then completed and the flight out began.
- **Next building.**
  - The HUD showed "NEXT: AURORA · 720 m", matching the measured 718 m to the doorway.
  - The edge arrow was in Aurora's green, and Rose had its landmark marker.
  - Placed 60 m in front of Aurora's doorway with no steering, she flew in herself after the prompt
    "Fly into the glowing doorway to enter Aurora…". Aurora's scene opened with the flower at 0.
- **Regressions.**
  - Reactivity OFF faded to 0, and back ON returned to 1.
  - Pause froze the clip and her position, and Play resumed.
  - Round 01 after a reload: the garden is off, the 3D model was not loaded, no markers appeared,
    and there were no errors.
  - 375 px: no horizontal scroll.
- **Progress across a page reload.** It is not kept, on the committed base either: the game has no
  storage. Progress lasts for the session. Within it, a flower's bloom and the completed buildings
  persist across visits.
- **Route length.** The distance to the next building depends on the seed. This seed's first leg
  is 720 m, where seed 698426's legs are 297–595 m.


**3D flight feel (as built).** Garden and flight-out only. The city flight that Round 01 uses is
untouched.

*Turning* (`js/core/flight.js`, `yawSpring`). One critically damped heading spring now serves the
orbit and the flight out. The flight out used to switch at a hard 0.35 m/s threshold.
- The spring is sub-stepped at ≤ 1/120 s.
- Its turn rate is capped at 2.6 rad/s, and its angular acceleration at 11 rad/s².
- It brakes in time: its speed is limited to √(2·a·|error|), so the acceleration cap never makes it
  overshoot.

*Banking.* `F.bank` eases (rate 3) toward −yawRate × 0.16, capped at ±0.26 rad (14.9°), and back to
level when the turn ends. A full-speed orbit holds about 12–15°. It is visual only: the collision
sphere and the flight position never see it.

*Orientation* (`js/character/heroModel.js`, `modelMatrix`).
- The wanted rotation is built as a quaternion, Ry(yaw) · Rx(tilt + climb + sway) · Rz(bank + roll
  sway).
- The drawn orientation is slerped toward it with 1 − e^(−11·dt), the same at any frame rate.
- Pause leaves it frozen: dt is accumulated in `update()` only.
- The head-first offset uses the smoothed forward.

*Weightless float.*
- **Sources.** The Armature's bob plus slow, incommensurate sines: pitch and roll sway, and a small
  whole-body lift of ±0.12 m. All of it is visual, outside the flight position and collision.
- **Calm factor.** All of it is scaled by `calm`, which eases toward 1 − 0.75 × busy (rate 2.5).
  `busy` comes from the turn rate, the change in speed and the vertical speed. Measured, it drops
  to 0.26 while she is actively flown and returns to 0.97 as she glides.
- **Reduced motion.** With `prefers-reduced-motion`, everything is scaled by a further 0.35.
- **Clips.** The skeletal clips are not touched. Only the bob's root offset is scaled.

*Camera anticipation* (`gardenScene.js camera()`).
- **Lead.** The view leads her sideways velocity by 0.3 s, up to ±1.4 m.
- **Height.** It follows her height by 30 % of the offset plus 0.12 × her vertical speed, within
  −0.6 … +1.4 m.
- **Easing.** Both are eased, at rates 2.5 and 2.
- **Flower in frame.** The slide (lead plus the narrow-screen fit) never puts the flower's heart
  nearer than 2.6 m to the frame's edge.
- **Reduced motion and flight out.** Both effects are off with reduced motion, and while the
  flight-out camera runs.

*Wake* (`garden.js herWake`).
- **Glints.** Small sprites are shed behind her body, at 0–14 a second by her speed (none below
  1.5 m/s, all from 7 m/s), at most 24 alive.
- **Look.** They live 0.7–1.2 s, drift back and up, and are coloured from the flower's heat colour
  to lavender.
- **Drawing.** They use the flower's own glow-sprite program, additive and depth-tested. There is
  no new shader.
- **Reduced motion.** A third as many, with no drift.
- **Pause.** They freeze.

*Measurements.* The simulation was run at fixed steps over the same input sequence: orbit ← 2.5 s,
rest, → 2.5 s, rest, ← → reversals, ↑ held 1.5 s, rest, ↓ 1 s, rest.

| | 30 fps | 60 fps | 144 fps |
|---|---|---|---|
| max turn rate (rad/s) | 2.60 | 2.60 | 2.60 |
| max turn acceleration (rad/s², was p99 ≈ 20) | 11.0 | 11.0 | 11.0 |
| max bank | 14.8° | 14.8° | 14.8° |
| max jerk (m/s³) | 96 | 99 | 99 |
| p99 acceleration (m/s²) | 21.6 | 21.9 | 22.0 |
| ring error after the last release | 0 | 0 | 0 |

- **Settling.** In each rest, the heading settles with at most one swing (turning back to face the
  flower) and no oscillation.

*Browser checks* (536×600, 375×812, desktop).
- **Orbit.** The bank read −12.5 … +10.7°.
- **Ascent.** The camera rise reached 0.85 m, and the lead reached 1.07 m.
- **Flower position.** The flower's heart stayed between 0.50 and 0.56 of the width at 536 px, and
  at 0.25 at 375 px.
- **Wake.** Up to 6 glints in the orbit, 15 in the flight out.
- **Animation.** The reaction played once (flight → react → flight).
- **Flight out.** Her turn rate reached 0.83 rad/s and her bank 11.9°. She reached the city
  normally.
- **Frame cost.** 375×812 garden redraw on the CPU: 1.8 ms median, 2.2 ms p95.
- **Round 01.** It runs with no garden, no model and no errors.
- **Not verified.** Reduced motion was checked in code only: the pane could not emulate it. A real
  phone was not tested, and neither was GPU time.
