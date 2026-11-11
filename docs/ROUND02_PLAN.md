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
| **6 (done)** | Five living buildings on one system: `AG.Gardens` configurations and site records; one flower scene whose state and palette are swapped per building; one atrium whose plants and city view are rebuilt per building; a facade and rooftop flower per completed building; the "City Bloom" counter; the finale | All five can be entered and use their own palette. The shared bloom works in each. Rooftop flowers stand on the right buildings. Finished states persist across switches. Round 01 and direct R02 still work. No added listeners or render loops. |

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

*Progress.* "City Bloom — n / 5" counts bloomed buildings and is visible only in Round 02. When
all five are complete, `finaleLook()` moves the sky glow through the five palettes with
`p.lerpColor`. Free flight continues.
