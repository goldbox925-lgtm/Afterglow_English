/* =====================================================================
   Building — one building of the generated city (data + behaviour)
   ---------------------------------------------------------------------
   The city is drawn on the GPU: every building's boxes are merged into a
   few big meshes and drawn with the custom city shader (one draw call
   instead of ~1000). So a Building does NOT draw itself every frame.
   Instead it:
     constructor()  decides WHAT to build (height, style, damage, district)
                    using p5.js:  p.random()  controlled variation
                                  p.noise()   coherent districts
     render(fn)     writes its geometry ONCE into the shared GPU mesh,
                    using the city's existing geometry code (fn)
     update(R)      runs every frame: reads how much of the viewer's
                    restored light has reached it
     contains(), isLit(), toBox()   interaction / query helpers

   All randomness comes from p5's seeded generators (p.randomSeed /
   p.noiseSeed, called once per city in CityGenerator), so the same seed
   always gives the same city.
   ===================================================================== */
window.AG = window.AG || {};

AG.Building = class Building {
  /* p.noise() → which kind of district a point belongs to.
     Noise changes smoothly in space, so neighbouring lots share a district
     (unlike p.random(), which would make every lot unrelated).          */
  static district(p, x, z) {
    const D = AG.CONFIG.city.districts;
    const n = p.noise(x * D.scale + 11.3, z * D.scale + 37.7);   // 0..1, smooth
    const type = n < D.residentialBelow ? 'residential' : n > D.corporateAbove ? 'corporate' : 'mixed';
    return { type, n };
  }

  /* p.random() picks one entry of a weighted table, e.g. { hive: 0.6, industrial: 0.25, corporate: 0.15 } */
  static weightedPick(p, table) {
    const keys = Object.keys(table);
    let total = 0;
    keys.forEach((k) => { total += table[k]; });
    let r = p.random(total);
    for (const k of keys) { r -= table[k]; if (r < 0) return k; }
    return keys[keys.length - 1];
  }

  /**
   * @param {object} lot   { x, z, w, d, dHero } — footprint from the street grid
   * @param {p5} p         the p5 instance (seeded random / noise)
   */
  constructor(lot, p) {
    const cfg = AG.CONFIG.city, D = cfg.districts, dt = cfg.downtown;
    this.x = lot.x; this.z = lot.z; this.w = lot.w; this.d = lot.d;
    this.dHero = lot.dHero;

    // --- district (p.noise): coherent neighbourhoods ---
    const dist = Building.district(p, this.x, this.z);
    this.district = dist.type;
    this.districtNoise = dist.n;

    // --- height: random variation, blended with a second, finer noise layer
    //     so heights rise and fall in patches instead of pure static ---
    const hn = p.noise(this.x * D.heightScale + 71.1, this.z * D.heightScale + 3.9);
    const r = p.lerp(p.random(), hn, D.heightMix);
    const dd = Math.hypot(this.x - dt.x, this.z - dt.z) / dt.radius;
    const tall = Math.exp(-dd * dd * 1.6);                         // the downtown cluster (unchanged rule)
    let h = p.lerp(18, 95, Math.pow(r, 1.6)) * D.heightFactor[this.district] + tall * Math.pow(p.random(), 0.8) * p.random(120, 360);
    // story framing (unchanged rules): towers beside her, an open vista in front, a calm block around her
    if (this.dHero < 230 && Math.abs(this.x) > 50 && p.random() < 0.55) h = Math.max(h, p.random(105, 210));
    if (this.z < -20 && this.z > -260 && Math.abs(this.x) < 110) h = Math.min(h, p.random(28, 70));
    if (this.dHero < 90) h = Math.min(Math.max(h, 40), 150);
    this.h = h;

    // --- level of detail by distance from her (unchanged) ---
    this.lod = this.dHero < 400 ? 2 : this.dHero < 900 ? 1 : 0;

    // --- architectural style: weighted by height class AND district ---
    const cls = h > 170 ? 'tall' : h > 70 ? 'mid' : 'low';
    this.style = Building.weightedPick(p, D.styles[this.district][cls]);

    // --- damage (unchanged rule) and a per-building hash for window patterns ---
    this.damaged = h > 45 && p.random() < cfg.damageRate * (h > 150 ? 1.35 : 1);
    this.hash = p.random();

    // filled in by render() / update()
    this.top = h;
    this.shaft = null; this.shafts = null;
    this.light = 0;
  }

  /* Write this building's geometry into the shared GPU meshes, once.
     `drawGeometry` is the city's existing builder (boxes, setbacks, crowns,
     signs, fractures); it returns the real top after setbacks/damage.   */
  render(drawGeometry) {
    const res = drawGeometry(this);
    this.top = res.top;
    return res;
  }

  /* Every frame: how much of the viewer's restored light has reached this
     building (0..1). Read-only; restoration itself is unchanged.        */
  update(restoration) {
    this.light = restoration && restoration.at ? restoration.at(this.x, this.z) : 0;
  }

  /* interaction helpers */
  contains(x, z, pad) {
    const m = pad || 0;
    return Math.abs(x - this.x) <= this.w / 2 + m && Math.abs(z - this.z) <= this.d / 2 + m;
  }
  isLit() { return this.light > 0.5; }

  /* the collision / interaction box other systems already use (format unchanged) */
  toBox() {
    const hw = (this.w + 1.6) / 2, hd = (this.d + 1.6) / 2;
    return { x0: this.x - hw, x1: this.x + hw, z0: this.z - hd, z1: this.z + hd,
      top: Math.max(this.h * (this.damaged ? 0.92 : 1), this.top) + 6,
      cx: this.x, cz: this.z, shaft: this.shaft || null, shafts: this.shafts || null, damaged: this.damaged, building: true };
  }
};
