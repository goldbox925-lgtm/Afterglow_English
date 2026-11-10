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
| 05 | AFTERGLOW | Cutscene `liftoff` (4.8 s); flight reset. | Steer with mouse or ← →, ↓ to descend, hold ↑ to ascend (mode FREE_FLIGHT ⇄ ASCENSION). | Altitude reached while holding ↑ → `Flight.finale` | End card after ~13 s → **Play again** → NUMBNESS |

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
