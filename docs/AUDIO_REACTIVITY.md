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
