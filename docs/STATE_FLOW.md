# Story state flow (Phase 3)

The story is a finite-state machine (`js/core/fsm.js`). A state changes **only** when
the viewer completes its interaction (`AG.FSM.advance(from)`). Time never moves the story;
it is used only for animation, the camera and sound. The interactions live in
`js/core/interactions.js` (01–04) and `js/core/flight.js` (05).

```
NUMBNESS ─► FRACTURE ─► AWAKENING ─► RECLAIMING_SELF ─► AFTERGLOW ─► finale ─► (Play again) ─► NUMBNESS
```

| # | State | Entry | Interaction | Completion | Transition |
|---|---|---|---|---|---|
| 01 | NUMBNESS | Begin the story / replay. Opening cutscene `intro` (6.4 s); input is ignored while it runs. | Look around (drag or arrow keys). Click the one pulsing window, or press Enter when it is centred. Hints grow over time (brighter, edge arrow, camera drift). | `findPulse()` | `advance('NUMBNESS')` → FRACTURE |
| 02 | FRACTURE | Cutscene `fracture` (3.2 s). | Click flickering windows to steady them. | `stabilised ≥ need.fragile` (4) | `advance('FRACTURE')` → AWAKENING |
| 03 | AWAKENING | The light network is seeded from the pulse and the steadied windows. | Click dark buildings (glowing ring) within reach of a lit one. | `awakeningConnections ≥ need.awakening` (5) | `advance('AWAKENING')` → RECLAIMING_SELF |
| 04 | RECLAIMING_SELF | Cutscene `stand` (8.4 s). | Drag between two lit buildings, or click one and then the other. | `cityLinks ≥ need.links` (5) | `advance('RECLAIMING_SELF')` → AFTERGLOW |
| 05 | AFTERGLOW | Cutscene `liftoff` (4.8 s); flight and fragments reset. | Steer with ← → (or the mouse; a held arrow turns up to 55 % faster, for a controlled U-turn); level glide with no sinking; tap ↑ for a small lift (about 13 m), double-tap ↑ for a smooth bigger rise (about 45 m); hold ↑ to speed up (21 → 30 m/s, no height change); ↓ to descend (cancels a pending rise). On touch devices an on-screen pad (◀ ▶ ▲ ▼) does the same. Holding ↑ never ends the story. Fly within 20 m of each of the five fragments (`js/core/fragments.js`). | Fifth fragment collected → `Flight.enterLight()` → `Flight.finale` | Glide (12 s) → ascent → end card 13 s into the ascent (game time) → **Play again** → NUMBNESS |

## Controls that act on the machine

- **Pause / resume** (Space, ▶ button): stops the clocks, cutscenes and all interaction.
  Hiding the browser tab pauses automatically.
- **Replay** (R, ↺ button, Play again): resets restoration, interactions, flight, character,
  camera and story, then starts 01 with its cutscene.
- **Jump** (keys 1–5, presentation only): earlier stages complete with default choices.
  Jumping backwards resets first, then completes up to the target.

## `need`: what each stage requires in this city

`AG.Interactions.need` holds the amount each stage requires; it drives both the completion
check and the progress dots.

- **Stage 02:** 4 windows. It is capped at the number found, but the wider search finds 4 in
  every city tested.
- **Stage 03:** always exactly **5** buildings, never lowered. If the network can reach fewer than
  5 dark buildings, `topUpReachable()` adds existing buildings. Each time, it takes the closest
  building that is not yet a target, has a window visible from her roof within reach of the
  network, and is at least 40 m from other targets.
  - It uses the interaction module's own seeded sequence, so the city's geometry and random
    sequence are untouched, and the same seed gives the same targets.
  - Cities that already have 5 or more reachable buildings get no additions.
- **Stage 04:** 5 links.

## Bugs found and fixed

Measured over 190 generated cities before the fix:

1. **Stage 02 could not be completed** in about 3% of cities (e.g. seeds 4, 505290, 285683,
   18786, 532282, 741740).
   - Cause: the six narrow view sectors (110–420 m) found only 3 fragile windows, but 4
     were required.
   - Fix: a second, wider search (80–600 m, ±80°) fills up to 4. Cities that already had
     enough are unchanged.
   - Safety net: `need.fragile` is capped at the number found.
2. **Stage 03 could not be completed** in about 1% of cities (seeds 876916, 207946).
   - Cause: only 4 dark buildings were within reach of the light, but 5 were required.
   - Fix: a deterministic top-up adds reachable existing buildings until there are 5. The
     requirement, the prompt ("five") and the 5 progress dots never change.
   - Verified on the three named seeds for every possible choice of steadied windows, and on
     150 more cities (962 window choices): at least 5 reachable every time, deterministic,
     no building used twice.

## Stage 05 fragments (Phase 4)

Five collectibles appear one at a time, **ahead of her** wherever she is flying:
VOICE (blue), COURAGE (pink), JOY (gold), FREEDOM (violet), SELF-LOVE (warm white).

How they work:

- **Sequence:** only the next uncollected fragment exists. The first appears after **6 s of active
  flight**, each next one **10 s of active flight after the previous collection**. Time counts only
  while she is controllable (not during the lift-off, not while paused, not after the ending). A
  fragment that hasn't appeared yet can't be collected. Replay resets the timer and the sequence.
- **Instruction:** `#fragGoal` shows "COLLECT ALL FIVE FRAGMENTS" at the top, just below the stage
  card (or the top bar when the card is hidden), until 5/5.
- **Visibility:** the revealed fragment is drawn after the city without depth testing, so buildings
  never hide it. While it is off screen, the existing hint arrow (also used in stage 01) points to
  it.

- **Collection:** `p5.Vector.dist(fragment, her position) < 20 m`, each counted once. Collecting
  one plays a burst: the flower flares and dissolves while a ring expands (network-node shader,
  kind 5).
- **Ending:** the fifth calls `AG.Flight.enterLight()`, the existing ending sequence (see below).

### Stage 05 ending (Phase 6)

After the fifth fragment, `Flight.drift(dt, input)` runs instead of `Flight.update`. It counts
`Flight.finaleT` in game time (it only runs while the story plays, so a pause freezes it), in
two parts:

| Part | Game time | Her movement (`js/core/flight.js`) | Camera (`js/core/camera.js` `finalePose`) |
|---|---|---|---|
| Glide | 0–12 s (`finaleGlide`) | Glides forward at 16 m/s (back-view flying pose G). Eases up to at least 160 m (above ~95 % of the roofs) at ≤ 7 m/s, never down, and climbs only for a tower right on her path (others are steered around). Steerable with the mouse / ← → (60 % of the free-flight turn). Hands off, she turns gently (0.4 rad/s) until downtown is within ~50° of her heading (~20° when she is far past the city's edge), so the panorama is the city. | Over the first ~7 s it eases back from the chase (≈ 5 m) to 16 m behind, 5 m above and 4 m to the side, fov 56 → 62, looking past her slightly down along her course. She stays about 10 % of the frame height, just below the centre. |
| Ascent | from 12 s | The original drift: rises at up to 7 m/s while her forward speed eases to 2 m/s (levitating pose E). Still steerable (50 %). | The original pull-back, starting from the glide's position: over 12 s it eases round (shortest way) to the side away from the dawn, 19 m out and 3 m below her, fov 60 → 52, so she rises in front of the sun and is kept near the centre. |

Story timings (`js/core/story.js`), counted from the start of the ascent unless noted:
- Sun: 0–5 s. During the glide only a faint promise of it (≤ 0.25).
- Title: 8–10 s. Veil: 9–11 s.
- End card: 13 s (`finaleEnd`, `js/ui/ui.js`, on the game clock; it was a 13 s browser timer).
- Dawn colour builds from the fifth fragment, slowly over the glide.
- The air clears during the glide (fog density −55 %), so the restored city reads at a distance.

Replay resets all of it (`Flight.reset`, `Camera.reset`, `Story.reset`).
- **Placement:** chosen at the moment of the reveal from her current position and heading:
  about 100–120 m ahead, 18–40 m to one side (at most about 22° off her path), at her height
  (SELF-LOVE 25 m higher). The spot must be free air with an open straight path from her;
  otherwise fixed fallbacks are tried (other side, nearer, a little higher, finally above the
  rooftops). Distances and sides come from a stateless hash of the city, so no random generator
  is used: the same seed and the same flight give the same spots.
  - If she overshoots, the hint arrow points back and she can U-turn (about 180° in 2.5 s with a
    held arrow) and collect it.
- **Ceiling:** the flight is capped 30 m above the light threshold, so she can't rise out of
  reach of the fragments.

### Stage 05 HUD and feedback

**HUD** (`#fragHud`, bottom centre above the control bar; shown only while she can fly in
stage 05):
- five flower icons: collected ones filled in their colour, the active one outlined and pulsing,
  the rest faint;
- the count `n / 5`;
- the active fragment's name and description.

**On each collection:**
- a message just above the HUD for 2.6 s (`NAME · n/5` and "You found your …");
- the icon pops;
- 14 sparks fly out from the fragment's position in the city (network shader, kind 6);
- one chime plays through the existing audio system's effects bus. It is silent if audio isn't
  running, and not part of the music or the audio reactivity.

Replay hides the message and the count returns to 0. The descriptions come from the
Collectibles reference sheet; the message pattern comes from the HUD reference recording.

## Stage 05 light trail and glints

**Light trail** (GPU; `js/shaders/character.glsl.js` `strandPos` / uKind 0, `js/render/renderer.js` `strandMesh`):
- **3 very thin lines** (cyan, pink, magenta), drawn from 480 ordered GPU sprites × the quality
  tier's particle factor. The old trail used 1100 scattered sprites. Each sprite is one short
  ribbon segment of a line.
- The lines start just behind her feet and run together as one bundle along her **actual
  recent path** for ~2.4–3.6 m (longer when she is faster). So they always point back along her
  direction of travel and curve as she turns.
- A gentle droop (1.3 m at the end) and a swing out of her turns (`uSweep` from
  `Flight.yawRate`; slightly to her left when flying straight) keep the bundle readable from the
  chase camera. The lines twist slowly around each other, 2–8 cm apart.
- Tapered from ~2 cm to ~0.4 cm half-width. They fade in just behind her, fade out toward their
  end, and fade before the camera (no rays toward the lens). Only a soft shimmer, no pulses.
- Strength: `CharacterDirector` `trail`, unchanged (free flight and the finale glide; none in
  the ascent).

**Glints** (CPU; `js/fx/lightParticles.js`, drawn by uKind 7): a few subtle sparkles on the bundle.

```
spawn   while she flies (not during scripted scenes, not in the ascent), rate = 7/s ×
        trail strength × (0.35 + 0.65 × speed): about 3–6 alive at a time. Born on the bundle
        a little behind her feet, moving with her at ~95 % of her speed. Skipped if MAX (48)
        are alive.
update  every playing frame: acc = gentle p.noise() swirl + slight buoyancy − drag;
        vel += acc·dt; pos += vel·dt; age += dt (dt from p.deltaTime).
remove  isDead() (age ≥ life, 0.6–1.1 s); a reverse loop splices dead ones out.
draw    display() writes position / alpha / colour / size (2–4 cm) into one of 48 GPU slots;
        the renderer draws all slots in one call. Alpha ≤ 0.6: fade in, twinkle, fade out.
pause   not updated (they hold still). Replay, a new city, or leaving stage 05 clears them.
```

They use a stateless hash for their randomness, never `p.random()`, so the city's seeded
sequence is untouched.

## Stage 04–05 word screens

The six floating parapet pieces at her broken edge (`cityGenerator.js` `buildHero`, unchanged
geometry, recorded as `info.hero.screens`) carry six words:
**VOICE · COURAGE · JOY · FREEDOM · SELF-LOVE · BEGIN AGAIN**, joined by fine warm threads.

- **Code:** `js/fx/screenWords.js` (activation, lettering texture, mesh) and
  `js/shaders/screens.glsl.js`, drawn by `renderer.js` `drawScreenWords` right after her rooftop,
  in the same pass.
- **Placement:** the words sit on each screen's camera-facing side. The vertex shader applies
  the same floating / homing offset as the city shader, so text and threads stay on their
  screens.
- **Lettering:** one letter size for all six words: the largest that fits every word inside its
  own screen (about 7 cm letters; the screens are about 1.2 × 0.9 m).

| Stage | Words | Threads |
|---|---|---|
| 01–03 | none | none |
| 04 | Words 1–5 start as a faint ghost (7 %). Word *i* lights when `AG.Interactions.cityLinks` > *i*. `cityLinks` rises by exactly 1 per successful connection (duplicates / invalid pairs are rejected in `connectBuildings`), so connection *n* lights word *n*, once, in order. BEGIN AGAIN stays dark. | When word *i* lights, the thread from word *i − 1* draws in (0.9 s). |
| 05 | All six. The 5th connection starts 05 in the same frame (lift-off scene): SELF-LOVE lights first, BEGIN AGAIN 0.35 s later. | All five; the last (SELF-LOVE → BEGIN AGAIN) draws in. |
| Replay | All dark again. | None. |

Timing uses game time (a pause freezes it). Words fade in over 0.8 s.

**Stage 04 close-up** (`js/core/camera.js` `wordBeat`):
- When connections 1–4 light their word (`AG.ScreenWords.beat = { i, at }`), the explore view
  eases to a close, slightly oblique look at the new word and the previous one, so the new
  thread shows. It is taken from her side away from the word, so she does not cover it.
- Timing (game time): 0.7 s in, 1.8 s hold, 0.9 s back; fov → 38.
- Nothing is blocked. The viewer's look direction is kept and returned to.
- The 5th connection has no beat: the stage 05 lift-off shot already frames all six.
- A pause freezes the beat; Replay clears it.

Where the words can be read:
- **Stage 04:** in each close-up (desktop and phone, readable). Between beats the default camera
  is ~34 m away, where they show as lit screens; zooming in with the mouse wheel makes them
  readable.
- **Stage 05:** the lift-off scene's first shot (1.2 s) frames all six close up, readable at
  desktop and landscape-phone sizes. On a portrait phone that shot's letterbox does not
  include the screens.

## Stage 05 flight: motion, collisions and camera

Flight exists only in stage 05 (and its ending). In stages 01–04 she is placed by the scripted
scenes on her roof and only the look-around camera moves, so these changes leave them untouched.

**Motion** (`js/core/flight.js` `move`):
- The controls set a commanded velocity: heading × speed (cruise 21, boost 30 m/s) plus the
  vertical speed from taps / double-taps / ↓.
- Her actual velocity (a `p5.Vector`) follows it with `vel.lerp(cmd, 1 − e^(−response·dt))`
  (response 9 /s). Its length is limited with `p.constrain`.
- `dt` is `p.deltaTime` in seconds, clamped to 0.1.

**Collisions** (`js/core/collision.js`):
- Buildings are solid boxes from the ground to the roof. She is a sphere of radius 2.4 m
  (`flight.radius`).
- *Soft approach:* within reach (≥ 8 m, and further at speed), her speed toward a surface is
  limited to 2.6 × the remaining gap, so she comes to rest at the boundary instead of stopping
  dead. Motion along the surface is untouched.
- *Collide & slide:* the move is split into sub-steps of ≤ 1.2 m (no tunnelling, even at
  30 m/s and 10 fps). After each sub-step, each nearby box's closest point gives a contact
  normal (wall, roof or rounded edge / corner). She is moved out by exactly the overlap, and
  only the velocity component into the surface is removed: she slides along it, never bounces.
  Up to 4 passes resolve two buildings at once (inside corners, narrow streets).
- A uniform grid (64 m cells) keeps each query to the few buildings around her.

**Hands-off help** (never while the player steers):
- A gentle look-ahead turn (0.45 rad/s; the finale glide keeps 1.2) toward the side with more
  room. The side is chosen once and kept while the way is blocked, so there is no left-right
  wobble.
- The look-ahead tests her actual path: a ray along her heading, with a margin just under her
  collision radius (`segmentClear`, radius − 0.2 m). So it acts only while she is heading into a
  building. A passable street (≥ ~5 m), or flying parallel to a facade, does not trigger it.
  After a glancing touch she deflects until she is parallel, then flies on along the wall.
- Resting against or sliding along a facade turns her softly (≤ 0.6 rad/s) to face along it.

**Camera** (`js/core/camera.js`):
- The chase camera follows a smoothed heading (eased at 4.5 /s along the shortest way round).
- The wall check that pulls the camera in front of a facade is eased: it shortens quickly
  (14 /s) when a building cuts the view and lengthens slowly (2.2 /s) when it clears.
- Scripted shots (lift-off, the stage 04 close-ups, the finale) are unchanged.

**Round 02 (prepared, not used):** a building box may set `solid: false`, or
`portals: [{ c, n, w, h, open }]`. Contacts on an open portal's rectangle (on the face whose
normal matches `n`) are ignored, so she can fly in; the rest of the building stays solid.
`AG.Collision.passable()` is the single place to extend this (for example to hand over to an
interior scene).

## Damaged towers in the restored city

About a fifth of the towers are generated damaged (`cityGenerator.js` `fracture`):
- The tower is cut at a fracture line, and the cut shows a bare steel skeleton and partial
  floor slabs.
- The missing top exists only as 4–13 chunks (none on distant towers). They float while the
  city is broken and fly home as it is restored.
- Home, those chunks fill only part of the missing volume, so a restored tower used to end in
  a gappy, gold-edged stack over a skeleton, or simply stop at the cut.

The fix:
- **Restored top** (`restoreTop`): each damaged tower also gets one plain volume from the cut
  to its original height, on the chunks' footprint (an octagonal prism for octagonal towers).
  It uses the building's own data and no random numbers, so every seed's city is unchanged.
- **Shader timing:** the city shader keeps it hidden while the city is broken and dissolves it
  in as that area is rebuilt (same timing as the chunks, with a thin gold edge on the
  dissolving front). The skeleton and slabs of the break dissolve out at the same time.
  Fragment codes: −1 = restored top, −2 = debris.
- **Stage 05:** the rebuild completes over the first 4 s of the stage (`story.js`). Mood alone
  stops at ~0.93 there, which left the farthest chunks short of home.
- Stages 01–03 look as before; in stage 04, towers complete where the viewer has restored
  the city.
