# Generative city (Phase 2)

The city is generated from one number, the **seed**. It is shown in the address bar as
`#seed=…`; reload the page and you get the same city. Press **N** for a new city (a new seed).

## p5.js techniques used

| Technique | Where | What it does |
|---|---|---|
| `p.randomSeed(seed)`, `p.noiseSeed(seed)` | `CityGenerator.generate()` | Seed p5's random and noise once per city, so the same seed always gives the same city. |
| `p.random()` / `p.random(lo, hi)` / `p.random(array)` | `cityGenerator.js` (the `R` helpers), `building.js` | Controlled variation: building heights, styles, signs, damage, rooftop details. Always inside chosen limits. |
| `p.noise(x, z)` | `Building.district()`, building heights | A smooth 0..1 value over the map. Nearby points get similar values, so neighbouring buildings share a district (residential / mixed / corporate) and heights rise and fall in patches. |
| `p.lerp()` | `Building` constructor | Blends a random number with a noise value for building heights. |
| Arrays and loops | `info.buildings` | Every lot becomes a `Building` in one array. One loop creates them, one loop builds their geometry, and a loop in `sketch.js` updates them every frame. |
| A class | `AG.Building` in `js/city/building.js` | See below. |

## The Building class

| Method | When | What it does |
|---|---|---|
| `constructor(lot, p)` | once | Decides height, style, damage and district with `p.random()` and `p.noise()`. |
| `render(drawGeometry)` | once | Writes the building into the shared GPU meshes using the existing geometry code. |
| `update(restoration)` | every frame | Reads how much of the viewer's restored light has reached it (`this.light`). |
| `contains(x, z)`, `isLit()`, `toBox()` | any time | Hit test, "is it lit?", and the collision/interaction box other systems use. |

The city is still drawn by the custom GPU shader: all buildings are merged into a few big
meshes (one draw call instead of about 1000). So `render()` adds geometry once; it is not
called every frame. The class owns the building's data and behaviour.

## Districts (`AG.CONFIG.city.districts`)

- `scale`: size of the districts. Smaller numbers give bigger districts.
- `residentialBelow` / `corporateAbove`: noise thresholds that pick the district type.
- `heightScale` / `heightMix`: a finer noise layer blended into building heights.
- `heightFactor`: a height multiplier per district.
- `styles`: weighted style tables per district and height class. `mixed` is the original mix.

The original layout rules are unchanged:
- the street grid;
- the downtown cluster;
- framing towers beside her and the open view in front of her;
- the calm block around her building;
- the flight canyon.

## Measured

- Same seed generated twice: identical geometry (vertex checksum, building boxes, district counts).
- Districts are coherent: 85% of buildings share the district of their nearest neighbour,
  against 38% for random assignment (seed 199362).
- Interactive targets across 9 seeds: 9–26, mean 16.8. The previous version gave 7–22, mean 15.2.
