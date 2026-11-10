# Round 02 · Memory Garden — the Interactive Bloom

One interactive 3D flower. It lives **in the game**, inside a building that opens after Round 01's
finale (see *In the game* below). The development preview `bloom.html` shows the same scene alone.

## In the game

Round 01 is unchanged and ends as before: fifth fragment → glide → ascent → end card.

| Step | What happens |
|---|---|
| End card | Two buttons: **Enter the Memory Garden** and **Play again**. |
| Approach | Free flight again over the restored city, about 170 m in front of one building. Its facade has opened into an arched **doorway of light**, with a column of light above its roof. The fragments are off. The goal pill says *Fly through the doorway of light*, and the edge arrow points to it while it is off screen. |
| Help on the way in | Within about 220 m, roughly heading for it, with hands off the controls: she lines up gently (turn ≤ 0.45 rad/s, height). The look-ahead avoidance is off, so it never turns her away from the doorway. In the last ~110 m, a rise still pending is dropped (↓ still works). Steering always wins. |
| Enter | Through the opening: she glides on into the light and the screen fades to white (1.1 s). |
| Inside | The Memory Garden: the flower, exactly as in the preview. Click the heart · drag outward to unfold · drag elsewhere to look around · wheel to zoom. A meter shows the stage and %. **Close the bud** resets the flower. |
| Back to the city | Fades out and puts her just outside the doorway, facing away. The flower keeps its state, so flying back in continues where she left it. |
| Play again / R / a stage jump | Closes the doorway and resets the garden. |

**The doorway's building** is deterministic for each city (no random numbers):
- an undamaged tower with a known facade (`b.shafts`: corporate / hive / industrial towers);
- its facade at the doorway's height is within 3 m of its collision box;
- the doorway looks down a corridor clear of every building for the whole approach
  (`AG.Flight.segmentClear`);
- among those, the one nearest downtown.

A doorway was found in all 12 random cities tested, in about 0.1 s, once, when the button is
clicked.

**Collision:** the doorway uses the collision module's prepared Round 02 portals
(`box.portals`). That rectangle of the face is passable; the rest of the building stays solid.

**Hooks in Round 01 files.** Each one does nothing in Round 01:

| File | Hook |
|---|---|
| `js/core/flight.js` | `noFragments`, `assistTurn`, `assistVy`, `assistHold`, `avoidOff` (all reset by `Flight.reset()`) |
| `js/render/renderer.js` | `drawPortal()` draws only while `AG.Garden.portalDraw()` returns a doorway |
| `js/sketch.js` | Calls `AG.Garden.update` instead of the flight while Round 02 runs, and draws the garden scene instead of the city while inside |
| `js/ui/ui.js` | The goal pill, prompt, edge arrow and white veil for Round 02. The fragment HUD is hidden in Round 02. |
| `js/core/story.js` | Flying back into the city clears the finale's light (veil, title, sunrise) |
| `index.html` / `css/style.css` | The end-card button, the garden panel, the veil |

**Mouse steering:** on the way to the doorway the mouse position steers, exactly as in Stage 05.

**Open:** serve the project folder, then go to **`/bloom.html`**
(e.g. `http://127.0.0.1:5500/bloom.html`, the same server as the game).

| Do | Result |
|---|---|
| Click the flower's heart | It awakens: the core pulses, a ring runs across the ground |
| Drag outward from the heart | The petals unfold; the farther you drag, the more it opens. Release keeps it; drag again to continue up to 100 %. It never opens by itself. |
| Drag elsewhere / mouse wheel | Orbit / zoom the camera (orbit is suspended while dragging the flower) |
| **R** or **RESET** | Back to the closed bud |

A temporary indicator at the bottom shows the stage and 0–100 %. Touch works the same
(p5 forwards touches to the mouse events).

## Files

| File | What |
|---|---|
| `bloom.html` | The preview page (UI + script tags) |
| `js/garden/flower.js` | `AG.BloomFlower.create(p, { center, scale })`: the flower's state, petal poses, picking, click / drag, stamens, particles, colours. Renderer-independent, so the game's renderer can draw it in the next phase. |
| `js/shaders/flower.glsl.js` | Petal shader (3D petal bending + translucent iridescent shading), sprite shader (core glow, anthers, stamens, motes, ground rings), backdrop, composite |
| `js/garden/gardenScene.js` | `AG.GardenScene.create(p)`: the scene's camera, picking, input (`down` / `move` / `up` / `wheel`), draw order and bloom post. Used by both the game and the preview. On narrow (portrait) screens the camera stands back so the open flower fits. |
| `js/garden/garden.js` | `AG.Garden`: Round 02 in the game. Picks the doorway's building, then runs the approach → enter → inside → back sequence, the input inside, and the UI hooks. |
| `js/shaders/portal.glsl.js` | The doorway on the facade (arched opening, swirling light, rim, spill) and the beacon above the roof |
| `js/garden/bloomPreview.js` | The preview page: p5's mouse events → `AG.GardenScene`, and the meter |

Reused from the project:
- the p5 instance mode and WebGL2 setup;
- the shared GLSL (`common.glsl.js`);
- `AG.GeometryBuilder`, and `AG.U` (maths, `mat4`);
- the game's bloom passes (`AG.SHADERS.bright` / `blur`);
- the `AG.LightParticle` class (the floating motes).

## How the flower is built

**Petals:**
- 10 real 3D petals in two rings (5 outer, 5 inner, offset 36°).
- One mesh (a u × v grid, 30 × 18 quads) is drawn once per petal with that petal's uniforms.
  `u` runs from the base PIVOT to the tip, `v` across.
- The vertex shader bends it each frame. The spine is a circular arc in the petal's plane: it
  leaves the pivot at angle θ from vertical (the opening rotation) and turns by k per unit
  length (curl). In closed form:
  `r = (cos θ − cos(θ+ks))/k`, `y = (sin(θ+ks) − sin θ)/k`.
- Width follows a pointed lotus outline, and the halves cup toward the inner face (more when
  closed). The CPU adds a little flutter and twist from `p.noise()`.

**Poses:**
- Closed: θ 0.30–0.42, k −0.42…−0.45 (tips curl in), cup 0.95–1.0.
- Open: outer ring θ ≈ 1.28, k −0.40 (wide, tips upturned); inner ring θ ≈ 0.98, k −0.30.

**Bloom:**
- A single value drives every petal.
- Each petal maps it through its own window (outer ring 0 → 0.72, inner ring 0.22 → 1.0, each
  petal slightly offset) and eases (smoothstep) between its closed and open pose.
- The result is one continuous motion through bud (0), awakening (≈ 0.3), opening (≈ 0.6) and
  full bloom (1).

**Shading:**
- Two-sided. Petals are alpha-blended and drawn back to front, sorted on the CPU by distance
  to the camera. They do not write depth, so translucency layers correctly over the opaque
  golden receptacle.
- Colour: a warm base → pink / lavender body → cyan / blue tip, with view-dependent
  thin-film iridescence.
- Glowing veins (a centre vein plus side veins sweeping to the tip, with light flowing along
  them), bright rims, and warm light from the core on the petal bases.
- HDR output, so the bloom pass adds the glow.
- **Premultiplied alpha:** p5's `BLEND` mode is `gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`, so the
  petal shader outputs `vec4(colour * alpha, alpha)`. Outputting straight colour makes the ten
  overlapping petals add up to white.
- **Keeping the centre warm, not white:** bright light that is nearly white turns pure white after
  tone mapping. So everything warm near the heart uses a deep amber, not a pale gold:
  - the core light on the petal bases: (1.0, 0.48, 0.12);
  - the lower veins: (1.0, 0.62, 0.3);
  - the petal base colour;
  - the core glow and the anthers.

  Their strength is kept moderate, and the ground glow under the flower is dimmed.
- **Hue-preserving tone map** (`flowerComposite`): plain ACES pushes bright colours toward
  white, which turned the stacked petals pastel.
  - The composite scales each colour by the ACES curve of its brightest channel, so the hue
    survives.
  - It is blended 65 / 35 with plain ACES, so the hottest highlights still whiten a little.
  - It applies only to this preview's composite; the game's own post-processing is untouched.

**Alive:**
- Breathing (`p.sin`) and noise flutter differ per petal.
- The colours move from cool lavender → pink → warm gold (`p.lerpColor`).
- The core and veins brighten with awakening and bloom; a click pulse lights the core and a
  ground ring.
- Stamens rise out of the opening bud; motes become busier as it opens.

**Picking:**
- The pointer becomes a 3D ray (`p.createVector` / `p5.Vector`) through the camera.
- The ray is tested against a sphere around the flower's heart (tall inside the bud, lower and
  wider when open). Clicks elsewhere never affect the flower.

**Drag → bloom:**
- `gain = p.map(p.dist(mouse, centre) − distAtPress, 0, flowerRadiusOnScreen, 0, 1)`
- `target = max(target, p.constrain(targetAtPress + gain, 0, 1))`
- `bloom = p.lerp(bloom, target, 1 − e^(−3.2·dt))`, with dt from `p.deltaTime`.

## p5.js functions used

| Where | Functions |
|---|---|
| Interaction | `p.mousePressed`, `p.mouseDragged`, `p.mouseReleased`, `p.mouseWheel`, `p.keyPressed`, `p.mouseX`, `p.mouseY`, `p.dist`, `p.map`, `p.constrain` |
| Animation and state | `p.lerp`, `p.sin`, `p.cos`, `p.noise`, `p.deltaTime`, `p.TWO_PI` |
| Picking | `p.createVector`, `p5.Vector` (`sub`, `dot`, `cross`, `normalize`, `add`, `mult`) |
| Colour | `p.color`, `p.lerpColor`, `p.red` / `p.green` / `p.blue` |
| Rendering | `p.createShader`, `p.createFramebuffer`, `p.model`, `p.blendMode`, `p.setAttributes`, `p.createCanvas` |

Plain JavaScript holds the interaction state. The geometry is bent and shaded in GLSL.

## Not done yet (next phases)

- No sound in the garden. The city's soundtrack keeps playing.
- One flower only. Nothing else in the garden yet.
EOF
pkill -f "http.server 5500"; pkill -f "recv.py"; git status --short