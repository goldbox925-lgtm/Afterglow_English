# Round 02 · Memory Garden — the Interactive Bloom

One interactive 3D flower. It lives **in the game**, inside a building that opens after Round 01's
finale (see *In the game* below). The development preview `bloom.html` shows the same scene alone.

## In the game

**Testing shortcut:** the **R02** chip (after the five stage chips) or key **6** starts Round 02
directly at the doorway. Round 01's stages complete with default choices, as with the other
jumps; the lift-off cinematic and the end card are skipped.

**Input and the light layer:** inside the garden, input arrives through p5's own mouse
callbacks in `js/sketch.js`.
- Hovering over the golden centre brightens it and shows a turning cue ring.
- Clicking it awake sends a pulse ring outward.
- As it opens, p5-drawn petal symbols orbit it and pollen halos pulse around the anthers
  (`js/garden/r2Layer.js`). The preview shows the same layer.

**She is in the garden:** her flight continues inside, through `AG.Flight`'s garden mode.
- She glides in from the left of the view, slows down and settles beside the flower, then turns
  from her flying pose to levitating.
- ← → fly her round the flower; ↑ ↓ change her height.
- As she comes close, the flower glows warmer, the petals facing her lean toward her, and the
  motes drift to her.
- A click on the heart before she has arrived waits for her.

**At 100 % the building awakens** (Phase 4, `js/garden/living.js`). The stages follow each
other over about 40 s; the meter shows the stage and its progress.
- **Inside** (the atrium round the flower): a golden wave across the platform and floor, energy
  climbing the frames, the glass panes lighting one by one, gold spreading through the hanging wisteria, a rosette
  of light and a glowing dome, and finally breathing.
- **Outside** (Back to the city): the facade lights up and its windows shift from cool to warm
  colours, vines climb it and small leaves unfurl from them, and a giant flower opens on the roof.
- The transformation stays; Play again / R / R02 reset it.

**Phase:** `AG.R2` (`js/garden/round2.js`) is Round 02's shared state. It derives the phase
ENTER → APPROACH → AWAKEN → DRAG → BLOOM → TRANSFORM → EXIT → EXPLORE, shown in the HUD as
"R02 · PHASE". The plan for the next phases is `docs/ROUND02_PLAN.md`.

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
| `js/shaders/flower.glsl.js` | Petal shader (3D petal shape and bending + lit, translucent, iridescent tissue), sprite shader (core glow, anthers, stamens, motes, ground rings), backdrop, composite |
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
- The vertex shader (`petalPos` in `flowerPetal`) builds each petal every frame:
  - **Spine.** It leaves the pivot at angle θ from vertical (the opening rotation) and bends
    with a curvature that changes along it, k(s) = k0 + k1·s. That gives an S-curve (flared
    base, upturned tip) when open, and a bulge folding in over the top when closed. There is no
    closed form, so it is integrated numerically (10 midpoint steps). `flower.js` `spine()`
    uses the same integration, for sorting.
  - **Outline.** Rounded obovate: widest above the middle, a narrow claw at the base, a soft
    round tip. The half-width is about a third of the length (outer 0.6, inner 0.5 flower
    units).
  - **Irregularity.** Each petal has its own length, width, angle and an asymmetry: one side
    a little wider, with a slight lean.
  - **Across the width.** The halves cup toward the inner face, the edges curl back a little
    near the tip when open, and a faint noise ripple runs over the surface.
  - **Wrap.** While closed, the width wraps round the flower's axis at the petal's own radius.
    That makes the bud a smooth, rounded body of overlapping petals with no flat flaps. The wrap
    eases out over the first ~75 % of each petal's opening.
  - **Normal.** Computed from the deformed surface itself (central differences), so the
    lighting follows every bend.
- The CPU adds breathing (`p.sin`), and flutter and twist from `p.noise()`.

**Poses** (θ, k0, k1, cup):

| Pose | Outer ring | Inner ring |
|---|---|---|
| Closed | 0.68, −0.10, −0.82, 1.05 | 0.52, −0.14, −0.92, 1.10 |
| Open | 1.30, 0, −0.62, 0.45 (nearly flat, tips lifting), edge curl 0.3 | 0.90, 0, −0.55, 0.50 (a cup), edge curl 0.2 |

Each petal adds ±0.06 to θ.

**Bloom:**
- A single value drives every petal.
- Each petal maps it through its own window (outer ring 0 → 0.72, inner ring 0.22 → 1.0, each
  petal slightly offset) and eases (smoothstep) between its closed and open pose.
- The result is one continuous motion through bud (0), awakening (≈ 0.3), opening (≈ 0.6) and
  full bloom (1).

**Shading** (`flowerPetal` fragment shader): a lit, translucent living tissue.
- **Lighting:**
  - a hemisphere ambient fill (lavender from above, deep violet below), so the bud is never
    flat-dark;
  - a cool key light from above-front;
  - a warm point light just above the heart, colour × `uCore` with distance falloff.
  - Both use *wrap* diffuse, so light scatters softly into the thin tissue.
- **Translucency:**
  - back-light transmission: light from the key and the core glows through a petal seen
    against it, more in the thin middle than at the edges;
  - alpha is thin in the middle and denser at the edges and at grazing angles (fresnel), plus
    a little noise.
- **View-dependent:**
  - a fresnel rim sheen in the iridescent hue;
  - a soft, wide highlight from the key light and the core, deliberately broad and dim
    (dew-like, not a plastic spot);
  - thin-film iridescence: the hue shifts with the viewing angle, position and a slow drift,
    toward cyan at the edges.
- **Surface variation (noise):** soft mottling and fine lengthwise striations.
- **Veins:** a mid vein plus fine parallel veins that converge toward the base. Light flows up
  them (`sin(u·12 − t·2)`), and they are warmer near the heart.
- **Emission:** soft rims at the edge and tip (not at the base, where ten petals overlap), the
  veins, a faint body glow, and the warm core light on the petal bases.
- Two-sided. Petals are alpha-blended and drawn back to front, sorted on the CPU by distance to
  the camera. They do not write depth, so translucency layers correctly over the opaque golden
  receptacle.
- HDR output; the existing bloom pass (`bright` + `blur`) adds the glow.
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

**What the bloom value drives.** Everything follows the user's drag; nothing opens by itself.

| Value | b = 0 | 0.3 | 0.6 | 1 | Where |
|---|---|---|---|---|---|
| Outer petal θ (opening rotation) | 0.67 | 0.86 | 1.27 | 1.28 | vertex: rotation about the pivot |
| Wrap (closed body → free petal) | 1 | 0.58 | 0 | 0 | vertex |
| k0 / k1 / cup / edge curl | closed | → | → | open | vertex: bending, cupping |
| Iridescence `uIri` | 0.45 | 0.75 | 0.90 | 1.00 | fragment: film strength, cyan edges, sheen |
| Emission `uEmit` | 0.55 | 0.91 | 1.01 | 1.15 | fragment: rims, veins, body glow |
| Core `uCore` | 0.08 | 0.59 | 0.94 | 1.53 | core light, transmission, golden glow sprite |
| Veins `uVein` | 0.18 | 0.80 | 1.07 | 1.43 | fragment |
| Motes per second | 0.4 → 1.5 awake | ≈ 9 | ≈ 16 | ≈ 27 | CPU (`AG.LightParticle`) |

Values at 0.3–1 were measured with the flower awake.
- Colours move from cool lavender through pink to a warm gold base (`p.lerpColor`). Tips go blue
  → cyan.
- Emission and iridescence use `p.map` / `p.constrain`.
- Bloom and awakening ease with `p.lerp(…, 1 − e^(−k·dt))`, using `p.deltaTime`.
- A click pulse adds to the core and the emission and runs a ring across the ground.
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
| Transforms | `p.push`, `p.pop`, `p.resetMatrix`, `p.translate`, **`p.rotate`**, **`p.scale`** (see below) |

Plain JavaScript holds the interaction state. The geometry is bent and shaded in GLSL.

## `p.rotate()` and `p.scale()`: how they reach the custom shader

**How they connect.**
- The flower is drawn through p5's own WEBGL renderer: `p.shader(...)` + `p.model(...)` into a
  `p.createFramebuffer()`.
- p5 1.11 passes its transform stack to every shader as `uModelMatrix`.
- The petal shader (`flowerPetal`) builds each petal in its **own local frame**: base pivot at
  the origin, growing along +Y, +X pointing away from the centre.
- It then multiplies by `uModelMatrix` (positions, and normals through its 3 × 3 part).
- The receptacle dome is placed the same way.
- So every `p.translate` / `p.rotate` / `p.scale` in `js/garden/gardenScene.js` really moves the
  3D petals.

**Before this change** the shader built world positions from its own uniforms, and p5's
transforms had no effect on the flower.

**The calls** (`js/garden/gardenScene.js`):

| Call | Where | What it transforms |
|---|---|---|
| `p.scale(flower.scale * flower.grow)` | `flowerOrigin()` | The whole flower (petals and receptacle), centred on its base. `F.grow` (`flower.js`): growth while unfolding 0.94 → 1.0 (`p.map`); +5 % swell on the first click; ±1.8 % breathing after full bloom (`p.sin`); +8 % pulse on reaching 100 %. Eased with `p.lerp(…, 1 − e^(−12·dt))`. |
| `p.rotate(flower.idleYaw, [0, 1, 0])` | `flowerOrigin()` | A slow organic turn of the whole flower about its axis (±3.5°, `p.noise`) |
| `p.rotate(-P.phi, [0, 1, 0])` | petal loop | Turns the petal to its place around the flower |
| `p.rotate(-P.hinge, [0, 0, 1])` | petal loop, after `p.translate(P.r0, P.y0, 0)` to its base | **The opening.** The petal rotates away from the centre about its own base. `P.hinge = p.lerp(closed, open, e)`, where e is this petal's eased window on the drag-controlled bloom value (outer ring 0 → 0.72, inner ring 0.22 → 1.0, so the outer petals open first). |
| `p.rotate(-P.sway, [0, 0, 1])` | petal loop | The idle organic rotation about the same base: breathing (`p.sin`) + `p.noise` drift |
| `p.scale(P.grow)` | petal loop | Each petal grows from its base as it unfolds (0.9 → 1.0) |

**Billboards.** The camera-facing sprites (core glow, anthers, motes) and the stamen ribbons
are built on the CPU in world space. They follow the same `F.grow` / `F.idleYaw` values there,
so they stay with the petals.

**The closed bud's wrap.** The petal is wrapped round the flower's axis while closed. That needs
the petal's radius in the flower, so the shader also receives the same θ as `uB.x`. It uses θ
only for the wrap; the rotation itself is `p.rotate`.

**Verified in the running preview** by ablation at 60 % bloom: turning `p.rotate` / `p.scale`
into no-ops in the page.
- Without the base rotations, all petals stand straight up.
- Without any `p.rotate`, all ten petals collapse onto one spot.
- Without `p.scale`, the flower shrinks to its raw size of 1 unit.
- Restored, the frame is unchanged (mean pixel difference 0.5, motion noise).

## Not done yet (next phases)

- No sound in the garden. The city's soundtrack keeps playing.
- One flower only. Nothing else in the garden yet.
EOF
pkill -f "http.server 5500"; pkill -f "recv.py"; git status --short