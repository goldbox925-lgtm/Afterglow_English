# AFTERGLOW — A City Made of Feelings

*When the city feels what you feel.*

An interactive music video rendered live in the browser with **p5.js 1.11.11 (WEBGL 2)**
and the **Web Audio API**. A procedurally generated cyberpunk megacity collapses and recovers with a
young woman's heartbreak. **Nothing moves on until the viewer acts**: five emotional states, each
completed by an interaction, rebuild the city gradually and persistently — physically and in light —
until the viewer flies her out of it and rises into the light.

Static site: no build step, no backend, no API keys. Runs on GitHub Pages.

---

## Run it locally

```bash
cd afterglow
python3 -m http.server 8000        # or: npx serve .   or VS Code "Live Server"
# open http://localhost:8000 in Chrome
```

Use a local server rather than double-clicking `index.html`: browsers block image loading for
WebGL textures from `file://`.

**Audio reactivity:** the soundtrack drives the city glow (bass), window pulses (mids) and
sparkles (treble). The **AUDIO REACTIVITY ON/OFF** button in the control bar switches only
that visual response; the music keeps playing either way. There is no microphone input and no
mute/volume control. Details: [docs/AUDIO_REACTIVITY.md](docs/AUDIO_REACTIVITY.md).

**Optional soundtrack:** put an original track at `assets/audio/soundtrack.mp3`. Without it, a
generative score plays (one harmless `404` for that file appears in the console).

## Deploy to GitHub Pages

1. Create a public repository and upload the **contents** of this folder so `index.html` is at the
   root (keep the hidden `.nojekyll` file).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.**
3. After 1–2 minutes open `https://<you>.github.io/<repo>/` and run `docs/TESTING_CHECKLIST.md`.

`backup_original/` holds the untouched previous build (same city, shaders and graphics) so the
result can be compared side by side: open `/backup_original/index.html`. It can be deleted before
publishing.

All paths are relative, p5.js is bundled in `lib/`, shaders are JS strings (no `fetch`), and Pages
serves HTTPS.

---

## The experience — five user-driven states

| # | State | What you see | What you do | Moves on when |
|---|---|---|---|---|
| 01 | **NUMBNESS** | She lies on the roof, then sits looking at a devastated city | Drag to look around and **click the pulsing window**. Its direction is shown immediately | the window is clicked |
| 02 | **FRACTURE** | The first fracture: impact, lightning and broken towers | **Click four highlighted windows.** There is no timing or hold requirement | 4 lights are permanent |
| 03 | **AWAKENING** | Light begins travelling between buildings | **Click five outlined dark buildings.** The nearest light connects automatically | 5 buildings wake up |
| 04 | **RECLAIMING SELF** | She stands and the restored buildings become a city network | **Connect five pairs of golden points:** drag point-to-point, or click one and then another | 5 visible links are complete → lift-off begins |
| 05 | **AFTERGLOW** | Free flight through the restored city, third-person chase camera | **Mouse x / ← →** steer · **↓** descend · **hold ↑ = the ascension arc**: SUFFERING → RESISTANCE → RELEASE → LEVITATION → ASCENSION (see below). Release ↑ = she hovers; after 4 s she flies again | ≥ 18 s of held ascension **and** the light altitude → LIGHT, title, end card |

There are no timers in the story, no score, no missions. Time only drives local animation, camera
easing and sound. Everything you restore **stays restored**; the city is never regenerated.

### The ascension arc (hold ↑)

Driven by **seconds of held ↑**, never by a clock, and always with her full body in frame:

| Held | Phase | Her | Camera · light · music |
|---|---|---|---|
| 0–1.4 s | SUFFERING | stops, curls up in the air (B), trembling, sinking | swings round to her face, slightly above; rain returns, colder grade; the old dissonance |
| 1.4–3.8 s | RESISTANCE | straining, then kneeling in the air and looking up (C) | close, full body |
| 3.8–6.2 s | RELEASE | her body extends, arms open (C → E) | camera sinks below her; open chord; riser |
| 6.2–12 s | LEVITATION | weightless, slow, arms open (E) | slow orbit, low and heroic; the drop |
| 12 s + | ASCENSION | rising fast, still clearly visible | pulls back and up so the city falls away beneath her; cloud crash |
| ≥ 18 s and 420 m | LIGHT | E, into the sunrise | slow pull-back with her in frame; sunrise chord, title |

Releasing ↑ pauses the climb (she hovers in her current pose). After 4 s she returns to free flight;
once RELEASE has been reached, the next ↑ resumes from levitation (liberation is not undone). Glow,
particles and the cloud veil are kept low throughout so she stays the emotional centre.

Earlier, she is visibly exhausted: heavy breathing and recurring sobs while she lies and sits, and
standing up in 04 is a struggle (sitting → pushing up, shaking → kneeling, looking up → standing).

## Controls

| Input | 01–04 | 05 Afterglow |
|---|---|---|
| Mouse move | hover / select | steer (left–right of centre, with a dead zone) |
| Drag | look around · in 04: connect two golden points | small camera offset |
| Click | activate a light/building · in 04: select one point, then another | — |
| Wheel | zoom | — |
| ← → | look left / right | turn |
| ↑ / ↓ | look up / down | **↑ = ascension only** · ↓ = descend |
| Enter | select the pulse when it is near the centre | — |

Space pause · R replay · 1–5 jump to a state (presentation; skipped states complete with default
choices) · C camera view · B audio debug view (temporary) · N new city · F fullscreen · H hide UI · Q quality.
Arrow keys and Space never scroll the page.

## Documentation

* `docs/INTERACTIVE_DESIGN.md` — state machine & interaction-flow diagrams, the restoration algorithm,
  p5.js / JavaScript functions used, UTS presentation text, tested features and limitations.
* `docs/ARCHITECTURE.md` — modules and render passes. `docs/TESTING_CHECKLIST.md` — manual test list.
* `docs/CHARACTER_ASSETS.md` — pose specification.

## Character assets — IMPORTANT

The ten poses live in `assets/character/`. The browser checks each image it loads and lists the
result under **Help → Character assets**. Audit of the supplied files
(`python3 tools/audit_character_assets.py`):

| Pose | File | Status |
|---|---|---|
| A | `A_lying.png` | ✅ real transparency |
| I | `I_pushing_up.png` | ✅ real transparency · low resolution (820×647), soft in close-ups |
| H | `H_sitting_back.png` | ✅ real transparency · low resolution (660×657) |
| J | `J_standing_back.png` | ✅ real transparency · low resolution (503×680) |
| B | `B_sitting.png` | ⚠️ **baked-in checkerboard**: no real transparency |
| C | `C_kneeling.png` | ⚠️ **baked-in checkerboard** |
| D | `D_liftoff.png` | ⚠️ **byte-identical copy of `C_kneeling.png`** (and a checkerboard) |
| E | `E_levitating.png` | ⚠️ **baked-in checkerboard** |
| F | `F_flying_side.png` | ⚠️ **baked-in checkerboard** |
| G | `G_flying_back.png` | ⚠️ **baked-in checkerboard** |

The checkerboard files are **reported, never treated as transparent.** So the film still works, it
uses provisional cut-outs in `assets/character/keyed/`, made with `tools/key_checkerboard.py`. The
tool keys on the checker's texture rather than its colour, so her platinum hair stays intact. Faint
checker residue can remain inside the soft glow around her, visible in close-ups. The original files
are kept untouched.

**To fix properly:** re-export B, C, E, F, G with real alpha, plus a real D (back view, feet leaving
the ground). Drop them into `assets/character/` under the same names and set each pose's `src` back
to that name in `assets/character/manifest.js`. No other code changes are needed. Full specification:
`docs/CHARACTER_ASSETS.md`.

---

