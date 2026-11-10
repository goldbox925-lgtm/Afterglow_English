# Audio reactivity (Phase 1)

The city reacts to AFTERGLOW's **own soundtrack**: the generative score in `js/audio/score.js`,
or `assets/audio/soundtrack.mp3` if one is added. There is no microphone input, and the
interface has no mute or volume control. The music always plays at its designed level while
the story is playing.

The control bar has one audio-related control, **AUDIO REACTIVITY ON/OFF**. It changes only
the visuals:

| | ON (default) | OFF |
|---|---|---|
| Soundtrack | plays normally | plays normally (identical) |
| Bass | swells the city glow on the sky and the bloom | original glow |
| Mids | lit windows pulse | original windows |
| Treble | windows sparkle, her spark particles brighten | original |
| Built-in heartbeat (`uPulse`) and equaliser signs (`uBands`) | follow the music | still (the story's "no music" input) |

## Who does what

The work is split across three technologies. Only the middle one is p5.js.

1. **Web Audio API** (`js/audio/audio.js`)
   - The soundtrack plays through `musicBus`.
   - An `AnalyserNode` is connected to that same bus as a passive tap. It outputs no sound,
     so the music is never played twice.
   - `AG.Audio.rawBands()` calls `analyser.getByteFrequencyData()` and averages three bands
     (0..1): bass 35–160 Hz, mid 250–2000 Hz, treble 3–9 kHz.
   - The pre-existing `AG.Audio.bands()` (gained and clamped) still feeds the story.

2. **p5.js** (`js/audio/reactivity.js`, called once per frame from `sketch.js`)
   - `p.deltaTime`: frame time, so the smoothing behaves the same at any frame rate.
   - `p.lerp()`: attack/release smoothing of each band, a slow running baseline per band,
     smoothing of the final drive, the ON/OFF cross-fade and the hand-off to the story.
   - `p.map()`: two mappings per band, combined into the drive
     (`drive = levelWeight × LEVEL + beatWeight × BEAT`, clamped, then smoothed):
     - **LEVEL**: the smoothed level mapped `floor..ceil` → 0..1. Sustained music gives a
       steady response.
     - **BEAT**: *smoothed − baseline* mapped `0..span` → 0..1. Beats and swells push the
       drive further.
   - `p.constrain()`: clamps every mapped value (and the frame time) to safe ranges.
   - Plain JavaScript does the rest (`Math.exp` for the smoothing factor, DOM updates for
     the debug view).
   - Why both parts: the first version used BEAT only. The baseline follows sustained
     music within about 2 s, so *smoothed − baseline* sat near 0 most of the time (≈ 0 in
     55–100% of samples, depending on band and stage) and every dip below the baseline
     was clamped away. LEVEL keeps a response during sustained music; BEAT keeps it
     moving with the music.

3. **GLSL** (`js/render/renderer.js` passes the drives as uniforms)
   - Bass: the sky shader's `uCityGlow` and the composite shader's `uBloom`.
   - Mid: city shader `uAudioMid`. Lit windows brighten, some rooms more than others, and
     the averaged far windows pulse too.
   - Treble: city shader `uAudioTreble` (brief sparkles on glass, re-picked about 14 times
     per second) and the existing spark particles' `uAmount` (only while they're shown).
   - Every effect is multiplied by its drive, so with a drive of 0 the image is
     identical to the original.

Tuning lives in `AG.CONFIG.reactivity` (`js/config.js`):
- `levelWeight` / `beatWeight`;
- per band: `floor` / `ceil` (set from the measured ranges below), `span` and
  attack/release;
- the drive smoothing (`outAttack` / `outRelease`);
- the baseline speed;
- the ON/OFF fade time.

OFF fades the shader drives to 0 over about a second. The music values handed to the
story (heartbeat and equaliser signs) ease to the story's neutral 0.2 before switching to
its "no music" path, so nothing snaps.

## Per-stage settings

`AG.CONFIG.reactivity.stages` overrides a few values per stage. `AG.CONFIG.reactivity.sky`
holds the bass → sky/bloom strengths that `renderer.js` reads:

```
uCityGlow = cityGlow × (1 + sky.gain × bass) + sky.add × bass
uBloom    = 0.6 × (1 + sky.bloom × bass)
```

| | 01–03 (calm) | 04 (sky pulse) | 05 |
|---|---|---|---|
| `levelWeight` | 0.7 | 0.45 | 0.6 (global) |
| `beatWeight` | 0.6 | 0.85 | 0.6 |
| `outRelease` | 3.5 (slower fall) | 7 (faster fall) | 5 |
| `baseline` | 0.5 | 0.8 | 0.5 |
| `mid.floor` / `mid.ceil` | 0.07 / 0.55 | 0.10 / 0.70 | 0.10 / 0.70 |
| `bass.span` | 0.10 | 0.08 | 0.10 |
| `sky.gain` | 1.2 | 1.8 | 1.2 |
| `sky.add` | [0.196, 0.07, 0.224] (×1.4) | [0.14, 0.05, 0.16] | [0.14, 0.05, 0.16] |
| `sky.bloom` | 0.85 | 0.9 | 0.9 |

- Stage 05 has no overrides and uses the global values exactly, as before.
- On a stage change, the values in use ease to the new stage's over `stageBlend`
  (1.2 s, `p.lerp`), so brightness never jumps.
- The debug header shows the current stage, level×, beat×, sky gain, add and bloom.

Safe ranges for further tuning:
- 01–03: `levelWeight` 0.7–0.85, `outRelease` 2.5–3.5, `mid.floor` 0.04–0.08,
  `mid.ceil` 0.45–0.55, `sky.add` ×1.4–1.8, `sky.bloom` 0.7–0.9.
- 04: `levelWeight` 0.35–0.45, `beatWeight` 0.85–1.0, `bass.span` 0.07–0.08,
  `baseline` 0.8–1.0, `outRelease` 7–9, `sky.gain` 1.8–2.2.

Measured with the generative score (6 s means; ON vs OFF brightness at an ordinary moment):

| Stage | bass drive | mid drive | ON vs OFF brightness |
|---|---|---|---|
| 01 | 0.59 (was 0.48) | 0.43 (was 0.22) | +5.4% |
| 02 | 0.58 | 0.68 | +6.5% |
| 03 | 0.53 (was 0.46) | 0.72 (was 0.46) | +5.3% |
| 04 | 0.61, range 0.22–1.00, ~7 pulses / 6 s | 0.32–0.6 | +9.3% |
| 05 | 0.68 (unchanged settings) | 0.60 | (unchanged) |

## City response per stage (`AG.CONFIG.reactivity.city`)

`renderer.js` passes these to the existing `js/shaders/city.glsl.js`; no new shader file:

| Uniform | Value | Effect in `city.glsl.js` |
|---|---|---|
| `uAudioBass` | bass drive × `bassGlow` | `emit *= 1 + 0.6 × uAudioBass`: the buildings' own light (windows, light veins, seams) |
| `uAudioMid` | mid drive × `midPulse` | lit windows pulse (`windows()`) |
| `uAudioTreble` | max(treble drive, accent × `sparkAccent`) | sparkles on window glass, near and far |
| `uSparkNear` | `sparkNear` | sparkle strength on big, close windows (lower = sparks stay in the distant city) |

- **Accent** (`AG.Reactivity.accent`): the stronger beat rise of bass or mid, with a quick
  rise and slower fall (`accent.attack` / `accent.release`, `p.lerp`).
- The score has almost no treble before stage 05, so in 01–04 the sparkles come from
  these accents.

| | 01–03 | 04 | 05 (default) |
|---|---|---|---|
| `bassGlow` | 0.6 | 0.7 | 0 |
| `midPulse` | 1.4 | 1.3 | 1 |
| `sparkAccent` | 0.4 | 0.5 | 0 |
| `sparkNear` | 0.25 | 0.25 | 1 |

Stage 05 uses the defaults, so its picture is exactly as before. Safe ranges:
`bassGlow` 0.4–0.9, `midPulse` 1.1–1.6, `sparkAccent` 0.3–0.6, `sparkNear` 0.15–0.5.

Measured ON vs OFF, comparing two consecutive frames of the same scene (generative score):

| Moment | Stage 02 | Stage 03 | Stage 04 |
|---|---|---|---|
| Typical (no accent) | +8.5% | +4.9% | +7.8% |
| Strong accent (brief) | | | +21% |

On an accent in stage 01, short white sparks light up across the dark towers.

## Testing

1. Serve the folder (for example `python3 -m http.server 8000`) and open
   `http://localhost:8000/?audiodebug=1` in a normal browser. You can also press **B** at any
   time after entering.
2. **Temporary debug view.** It shows, per band:
   - raw analyser value (orange bar);
   - smoothed value (cyan bar);
   - baseline (white tick);
   - the **drive** sent to the shaders (magenta bar);
   - the numbers for raw, smooth, base, level, beat and drive.

   It also shows ON/OFF, the audio source and play state.
3. Click **Begin the story**. Raw and smoothed values move with the music. In stage 01 the
   score is sparse; stage 04 (press **4**) and stage 05 (press **5**) are the clearest.
4. Click **AUDIO REACTIVITY ON** to switch it OFF. Raw values keep moving (the music is still
   playing), the drives fall to 0, and glow, windows and sparkles return to the original look.
5. Press **Space** to pause. Raw and drive values fall to 0. Resume and they return.

### Measured drive per stage (generative score, mean over 6 s)

| Stage | bass | mid | treble | old BEAT-only bass / mid |
|---|---|---|---|---|
| 01 Numbness | 0.48 | 0.22 | 0 | 0.07 / 0.17 |
| 03 Awakening | 0.46 | 0.46 | 0 | 0.05 / 0.28 |
| 04 Reclaiming | 0.53 | 0.54 | 0.04 | 0.13 / 0.11 |
| 05 Afterglow | 0.67 | 0.64 | 0.67 | 0.24 / 0.12 |

### Soundtrack content per stage (generative score, measured)

| Stage | bass | mid | treble |
|---|---|---|---|
| 02 Fracture | 0.80–0.89 | 0.25–0.32 | ≈ 0 |
| 03 Awakening | 0.73–0.85 | 0.30–0.52 | ≈ 0 |
| 04 Reclaiming | 0.74–0.99 | 0.51–0.62 | 0.01–0.02 |
| 05 Afterglow | 0.70–1.00 | 0.61–0.71 | 0.22–0.29 |

The score has almost nothing above 3 kHz before stage 05, so treble sparkles mostly appear
during the flight. This is the soundtrack's own content, not a fault.

## Removing the debug view later

- In `js/audio/reactivity.js`, delete `toggleDebug`, `drawDebug`, the `?audiodebug=1`
  listener and the `debugOn` line in `update()`.
- In `js/sketch.js`, delete the `B` key line.
- In `css/style.css`, delete the `#audioDebug` rules.
- In `index.html`, delete the `B` row in Help.
