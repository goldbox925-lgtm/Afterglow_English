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
