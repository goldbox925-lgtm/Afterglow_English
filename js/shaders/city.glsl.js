/* =====================================================================
   City shader — all opaque architecture in a single program.
   Vertex stage:  fragments float / reassemble, voice-driven tremor,
                  glitch slicing of distant towers.
   Audio reactivity (GLSL side): uAudioBass brightens the buildings' own
   light, uAudioMid pulses lit windows, uAudioTreble (treble or musical
   accents) adds sparkles; all come from js/audio/reactivity.js via
   renderer.js and are 0 when OFF.
   Fragment stage: procedural windows (one by one, spreading outward
                  from her), wet glass, stained concrete, her rain-
                  rippled rooftop, streets with light veins and traffic.
   PHYSICAL DAMAGE (extension): facades of struck buildings are torn open
                  — dark cavities with broken floor slabs, charred rims,
                  smashed windows, embers, soot. Where the viewer's light
                  arrives (restoration field) the holes CLOSE: the cavity
                  shrinks, a construction lattice in that light's colour
                  fills the gap, then solid facade with a gold seam.
                  Floating fragments of the broken towers return home the
                  same way (vertex stage).
   ===================================================================== */
AG.SHADERS.city = {
  vert: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.field + `
in vec3 aPosition; in vec3 aNormal; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView; uniform mat4 uProj;
uniform float uRebuild, uInstability, uGlitch, uTremor;
out vec3 vWorld; out vec3 vNormal; out vec2 vUv; out vec4 vData; out float vAssembled;

void main(){
  vec3 p = aPosition; vec4 d = aVertexColor;
  float mat = floor(d.g * 10.0 + 0.5);
  float frag = d.b;
  vAssembled = 1.0;
  bool isGround = (mat > 4.5 && mat < 5.5) || mat > 7.5;
  if (frag > 0.0 && !isGround){
    // order: pieces near her come home first, with per-piece jitter
    float order = d.a <= 0.0 ? 0.0 : fract(frag * 7.13) * 0.5 + d.a * 0.5;   // her parapet comes home first
    // pieces inside an area the viewer restored come home too
    float Lv = fieldAt(aPosition).w;
    float a = smoothstep(order * 0.8, order * 0.8 + 0.18, max(uRebuild, Lv * 0.98));
    float away = 1.0 - a;
    vec3 dir = vec3(hash11(frag * 13.1) - 0.5, hash11(frag * 7.7) * 0.7 + 0.2, hash11(frag * 3.3) - 0.5);
    vec3 off = dir * vec3(12.0, 14.0, 12.0);
    if (d.a <= 0.0){
      // her broken parapet: pieces hang in the air just beyond the edge, below eye level
      off = vec3((hash11(frag * 13.1) - 0.5) * 3.0, -3.2 - hash11(frag * 7.7) * 2.5, -1.8 - hash11(frag * 3.3) * 3.0);
    }
    float bob = sin(uTime * 0.35 + frag * 41.0);
    vec3 wob = vec3(sin(uTime * 0.21 + frag * 17.0), bob, cos(uTime * 0.27 + frag * 23.0)) * (d.a > 0.0 ? 1.6 : 0.07);
    // the voice makes suspended pieces shiver (they do not come back)
    vec3 shiver = (vec3(hash11(floor(uTime * 30.0) + frag * 99.0), hash11(floor(uTime * 30.0) + frag * 71.0), hash11(floor(uTime * 30.0) + frag * 37.0)) - 0.5) * uTremor * (d.a > 0.0 ? 1.2 : 0.05);
    p += (off + wob + shiver) * away;
    vAssembled = a;
  }
  // restored tops of damaged towers (frag −1) appear, and the bare skeleton / slabs of the break
  // (frag −2) disappear, as that area is rebuilt — the same timing as the tower's chunks
  if (frag < 0.0 && !isGround){
    float Lv = fieldAt(aPosition).w;
    float order = 0.45 + d.a * 0.5;
    float a = smoothstep(order * 0.8, order * 0.8 + 0.18, max(uRebuild, Lv * 0.98));
    vAssembled = frag < -1.5 ? 1.0 - a : a;
  }
  if (!isGround && d.a > 0.0){
    float hgt = max(p.y, 0.0);
    float n1 = vnoise(vec3(p.x * 0.012, p.y * 0.02 + uTime * 0.5, p.z * 0.012)) - 0.5;
    float n2 = vnoise(vec3(p.z * 0.012 + 7.0, p.y * 0.02 - uTime * 0.4, p.x * 0.012)) - 0.5;
    p.xz += vec2(n1, n2) * uInstability * hgt * 0.06;
    // digital interference: horizontal slices of distant towers jump sideways
    float band = floor(p.y / 7.0) + floor(uTime * 14.0) * 13.0;
    float g = step(1.0 - uGlitch * 0.25, hash11(band + d.r * 61.0));
    p.x += (hash11(band * 1.7) - 0.5) * 9.0 * g * uGlitch;
  }
  vWorld = p; vNormal = aNormal; vUv = aTexCoord; vData = d;
  gl_Position = uProj * uView * vec4(p, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.fog + AG.SHADERS.lights + AG.SHADERS.field + AG.SHADERS.spots + `
in vec3 vWorld; in vec3 vNormal; in vec2 vUv; in vec4 vData; in float vAssembled;
out vec4 outColor;

uniform float uRestore;     // 0 silence -> 1 city fully re-lit
uniform float uSeam;        // kintsugi glow on rebuilt fractures
uniform float uSurvivor;    // fraction of windows still alive in the dark
uniform float uTraffic;
uniform float uRain;
uniform float uFlash;       // lightning
uniform float uPulse;       // city heartbeat (music low band)
uniform float uEcho;        // sustained voice in SILENCE: one far window answers
uniform vec3  uLightTint;        // colour of newly returning light (voice pitch)
uniform vec3  uAmbSky, uAmbGround;
uniform vec3  uHero;        // her position (light propagates from here)
uniform vec3  uCharPos;     // where she is now
uniform float uCharGlow;    // her aura × speed
uniform float uNear;        // 1 when rendering the near (rooftop) pass
uniform float uEmitScale;   // debug / global emission trim
uniform float uDamage;      // global severity of the physical damage (1 = devastated)
uniform float uEmber;       // embers still glowing in the wounds
uniform float uAudioMid;    // soundtrack mid band, smoothed (0 when AUDIO REACTIVITY is OFF)
uniform float uAudioTreble; // sparkle drive: treble band or musical accents (0 when OFF)
uniform float uAudioBass;   // bass drive × per-stage bassGlow (0 when OFF and in stage 05)
uniform float uSparkNear;   // sparkle strength on big close windows (1 = full, as in stage 05)
float gL = 0.0;             // restoration by the viewer at this fragment (field)
vec3  gSCol = vec3(1.0);    // that area's colour

/* ---------- physical damage of facades ----------
   n: a cellular-ish noise over the facade plane. A building's
   susceptibility (hash) × severity sets a threshold; n above it is torn
   away. The restoration field lowers the severity locally, so the
   threshold rises and the hole closes from its rim inward.            */
float dmgNoise(vec2 q){ return vnoise2(q) * 0.6 + vnoise2(q * 2.7 + 5.3) * 0.28 + vnoise2(q * 7.9 + 1.7) * 0.12; }
struct Damage { float hole; float rim; float halo; float seam; float lattice; float soot; float n; float thr; };
Damage facadeDamage(vec3 wp, vec3 N, float bh){
  Damage o; o.hole = 0.0; o.rim = 0.0; o.halo = 0.0; o.seam = 0.0; o.lattice = 0.0; o.soot = 0.0; o.n = 0.0; o.thr = 1.0;
  float sus = smoothstep(0.22, 0.97, hash11(bh * 91.7 + 3.1));
  float D0 = uDamage * sus;                                   // as broken as it got
  if (D0 < 0.02) return o;
  float heal = smoothstep(0.06, 0.9, gL);
  float D = D0 * (1.0 - heal);                                // what is still broken
  vec2 t = normalize(vec2(-N.z, N.x) + 1e-5);
  float u = dot(wp.xz, t);
  vec2 q = vec2(u * 0.05, wp.y * 0.042) + vec2(bh * 37.0, bh * 11.0);
  float n = dmgNoise(q);
  float thr0 = 1.0 - D0 * 0.6, thr = 1.0 - D * 0.6;
  float aa = fwidth(n) * 1.2 + 1e-4;
  o.n = n; o.thr = thr;
  o.hole = D > 0.02 ? smoothstep(thr - aa, thr + aa, n) : 0.0;
  o.rim = D > 0.02 ? exp(-max(thr - n, 0.0) / (aa * 2.0 + 0.012)) * (1.0 - o.hole) : 0.0;
  o.halo = D > 0.02 ? smoothstep(thr - 0.13, thr, n) * (1.0 - o.hole) : 0.0;
  // repaired band: was a hole (n > thr0), is facade again (n < thr)
  float healed = smoothstep(thr0 - aa, thr0 + aa, n) * (1.0 - o.hole);
  o.seam = exp(-abs(n - thr0) / (aa * 1.5 + 0.006)) * heal * (1.0 - o.hole);
  o.lattice = healed * (1.0 - smoothstep(0.55, 0.95, gL));
  // soot climbs above each wound
  float nb = dmgNoise(q - vec2(0.0, 0.22));
  o.soot = smoothstep(thr - 0.22, thr + 0.02, nb) * D * (1.0 - o.hole);
  return o;
}

/* the inside of a torn-open floor: darkness, slab edges, rebar, embers */
vec3 cavity(vec3 wp, vec3 N, vec3 V, float bh, vec3 amb, Damage dm){
  vec3 Vin = -V;
  float cosT = max(dot(-N, Vin), 0.2);
  vec3 back = wp + Vin * (5.5 / cosT);                        // the rear of the room, 5.5 m in
  float fl = fract((wp.y + bh * 5.0) / 3.0);                  // slab edge at the facade plane
  float flB = fract((back.y + bh * 5.0) / 3.0);
  float slab = smoothstep(0.84, 0.9, fl) * (1.0 - smoothstep(0.97, 1.0, fl));
  float slabB = smoothstep(0.8, 0.9, flB);
  float deep = smoothstep(0.0, 0.08, dm.n - dm.thr);          // deeper inside the wound = darker
  vec3 c = vec3(0.004, 0.0045, 0.006) + amb * 0.05 * slabB * (1.0 - deep * 0.6);
  c += amb * 0.32 * slab + uFlash * vec3(0.3, 0.35, 0.5) * slab;
  vec2 tt = normalize(vec2(-N.z, N.x) + 1e-5);
  float u = dot(wp.xz, tt);
  float rebar = step(0.92, fract(u * 0.9 + bh * 7.0)) * (1.0 - deep) * 0.6;
  c += amb * 0.25 * rebar;
  float flick = 0.6 + 0.4 * vnoise(vec3(wp.xz * 0.4, uTime * 2.0));
  c += vec3(1.0, 0.36, 0.08) * uEmber * (1.0 - deep) * 0.5 * flick * step(0.7, hash12(floor(vec2(u, wp.y) * 0.25) + bh));
  return c;
}

vec3 skyApprox(vec3 r){
  float up = clamp(r.y, -1.0, 1.0);
  return mix(uFogLow * 1.2, uFogHigh * 0.7, smoothstep(-0.1, 0.6, up)) + uFlash * vec3(0.5, 0.6, 0.9) * smoothstep(0.0, 0.8, up);
}

/* Procedural windows. Returns emissive colour; sets glassMask. */
vec3 windows(vec3 wp, vec3 N, float bh, float mat, float distN, out float glassMask, out float dark){
  vec2 t = normalize(vec2(-N.z, N.x) + 1e-5);
  float u = dot(wp.xz, t);
  bool glass = mat < 0.5;
  float floorH = glass ? 3.6 : 3.0;
  float colW = glass ? (1.6 + fract(bh * 13.0) * 1.2) : (2.6 + fract(bh * 7.0) * 1.6);
  vec2 g = vec2(u / colW, (wp.y + bh * 5.0) / floorH);
  vec2 cell = floor(g); vec2 f = fract(g);
  vec2 fw = fwidth(g);
  float fx = glass ? 0.07 : 0.2, fy = glass ? 0.14 : 0.28;
  float aa = max(fw.x, fw.y);
  float inWin = smoothstep(fx - aa, fx + aa, f.x) * smoothstep(1.0 - fx + aa, 1.0 - fx - aa, f.x)
              * smoothstep(fy - aa, fy + aa, f.y) * smoothstep(1.0 - fy * 0.5 + aa, 1.0 - fy * 0.5 - aa, f.y);
  float face = floor(N.x * 2.0 + N.z * 5.0 + 10.0);
  // rooms span several window columns, so light comes on in believable clusters
  float roomW = 2.0 + floor(fract(bh * 31.0) * 3.0);
  vec2 room = vec2(floor(cell.x / roomW), cell.y);
  float h  = hash12(room + vec2(bh * 917.0, face * 31.0));
  float h2 = hash12(room.yx * 1.7 + vec2(bh * 53.0, face));
  float h3 = hash12(cell * 1.31 + bh * 7.0);
  // --- power state ---
  float onT = h * 0.5 + distN * 0.9;
  float rs = uRestore * 1.45;
  float on = smoothstep(onT, onT + 0.012, rs) * step(0.38, h2);
  // areas the viewer restored: rooms ignite as the sphere passes, in that area's colour
  float onL = smoothstep(h * 0.7, h * 0.7 + 0.02, gL * 1.2) * step(0.3, h2);
  float ignL = onL * exp(-max(gL * 1.2 - h * 0.7, 0.0) * 22.0);
  on = max(on, onL);
  float ignite = smoothstep(onT, onT + 0.012, rs) * step(0.38, h2) * exp(-max(rs - onT, 0.0) * 30.0) * 1.2;
  float surv = step(h, uSurvivor) * step(0.5, h2);
  float flick = surv * (0.45 + 0.55 * step(0.25, hash11(floor(uTime * (3.0 + h * 9.0)) + h * 100.0)));
  // the one window that answers a sustained voice in the dark
  float echo = uEcho * step(0.995, h) * step(0.15, distN) * step(distN, 0.45);
  float lit = max(max(on, flick * 0.8), echo * 3.0);
  // --- colour ---
  vec3 warm = vec3(1.0, 0.62, 0.34), cool = vec3(0.55, 0.75, 1.0);
  vec3 wc = mix(warm, cool, step(0.62, h2));
  if (h2 > 0.94) wc = neonHue(h * 3.0) * 0.9;
  wc = mix(wc, uLightTint, 0.35 * on * step(h, 0.7));
  wc = mix(wc, gSCol, 0.72 * onL * step(h, 0.9));
  float blinds = mix(1.0, 0.55 + 0.45 * step(0.5, fract(f.y * 7.0)), step(0.6, hash11(h * 77.0)));
  float grad = 0.7 + 0.3 * f.y;
  float inten = (0.25 + 0.55 * h3) * (0.6 + 0.6 * fract(h2 * 9.0));
  vec3 em = wc * lit * inten * blinds * grad * (1.0 + 0.6 * onL) + wc * ignite + wc * ignL * 0.9;
  em *= glass ? 0.95 : 1.15;
  // --- audio reactivity (no effect when both drives are 0) ---
  // mid: lit windows pulse with the music, some rooms more than others
  em *= 1.0 + uAudioMid * (0.5 + 1.0 * h3);
  // treble: brief sparkles on the glass, re-picked ~14 times a second
  float spT = floor(uTime * 14.0);
  float spk = step(1.0 - 0.07 * uAudioTreble, hash12(cell * 1.73 + vec2(bh * 41.0, spT)));
  // close-up windows (small fwidth) get uSparkNear; distant ones full strength (1.0 → unchanged)
  spk *= mix(uSparkNear, 1.0, smoothstep(0.05, 0.3, aa));
  em += vec3(0.85, 0.95, 1.0) * spk * uAudioTreble * 3.5;
  // --- far away: average instead of aliasing ---
  float far = smoothstep(0.25, 0.8, aa);
  float avgOn = max(clamp((rs - distN * 0.9) / 0.5, 0.0, 1.0), gL * 0.9) * 0.62;
  vec3 avgEm = mix(mix(warm, cool, 0.4), gSCol, 0.7 * gL) * (avgOn * 0.5 + uSurvivor * 0.4) * (0.45 + 0.3 * gL);
  // audio reactivity, far away: the averaged windows pulse (mid) and sparkle on a coarse grid (treble)
  avgEm *= 1.0 + uAudioMid * 0.8;
  float spkF = step(1.0 - 0.06 * uAudioTreble, hash12(floor(vec2(u, wp.y) / 5.0) * 1.37 + vec2(bh * 13.0, spT)));
  avgEm += vec3(0.85, 0.95, 1.0) * spkF * uAudioTreble * 2.0;
  glassMask = mix(inWin, 0.55, far);
  dark = 1.0 - lit;
  return mix(em * inWin, avgEm, far);
}

float edgeMask(vec2 uv, float w){
  vec2 e = min(uv, 1.0 - uv);
  return 1.0 - smoothstep(0.0, w, min(e.x, e.y));
}

void main(){
  vec4 d = vData;
  float mat = floor(d.g * 10.0 + 0.5);
  float bh = d.r, distN = d.a;
  vec3 wp = vWorld;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - wp);
  vec3 col = vec3(0.0), emit = vec3(0.0);
  // restored top (−1) / debris of the break (−2): shown where noise < vAssembled, so it dissolves
  // in (out) over the rebuild, with a thin warm edge on the moving front — never a pop
  float rebuiltEdge = 0.0;
  if (d.b < 0.0){
    float rn = (vnoise(wp * 0.35) * 0.65 + vnoise(wp * 1.9 + 7.0) * 0.35) * 0.96;
    if (rn >= vAssembled) discard;
    rebuiltEdge = (1.0 - smoothstep(0.0, 0.05, vAssembled - rn)) * step(vAssembled, 0.999);
  }
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uAmbGround, uAmbSky, hemi);
  vec3 flashL = uFlash * vec3(0.55, 0.65, 1.0) * (0.35 + 0.65 * max(N.y, 0.0)) * 0.9;
  float distH = length(wp.xz - uHero.xz);
  vec3 sFrontCol; float sFront; vec3 sCol_;
  { vec4 fl = fieldAt(wp); gL = fl.w; gSCol = fl.rgb; }
  spotLocal(wp, sCol_, sFront, sFrontCol);

  if (mat < 1.5){
    // ---------------- facades: glass towers & residential blocks ---------------
    vec3 base = mat < 0.5 ? vec3(0.05, 0.06, 0.085) : vec3(0.085, 0.08, 0.088);
    float streak = vnoise(vec3(wp.x * 0.7 + wp.z * 0.7, wp.y * 0.05, bh * 10.0));
    base *= 0.7 + 0.5 * streak;
    float gm = 0.0, dk = 1.0;
    vec3 w = vec3(0.0);
    bool wall = abs(N.y) < 0.5;
    if (wall) w = windows(wp, N, bh, mat, distN, gm, dk);
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    vec3 refl = skyApprox(R) * (mat < 0.5 ? 0.55 : 0.18) * (0.3 + 0.7 * fres);
    col = base * (amb + flashL) + refl * gm * dk + amb * 0.15 * (1.0 - gm);
    emit = w;
    if (wall && uNear < 0.5){
      Damage dm = facadeDamage(wp, N, bh);
      // charred, cracked rim; smashed windows around each wound
      float broken = max(dm.halo, dm.rim);
      float shards = step(0.55, hash12(floor(vec2(dot(wp.xz, normalize(vec2(-N.z, N.x) + 1e-5)), wp.y) * 0.6) + bh * 13.0));
      emit *= 1.0 - broken * (0.85 + 0.15 * shards);
      col = mix(col, col * 0.3 + refl * 0.25 * shards * gm, broken);
      col *= 1.0 - dm.soot * 0.75;
      col += vec3(1.0, 0.4, 0.1) * dm.rim * uEmber * 0.35 * (0.6 + 0.4 * sin(uTime * 3.0 + wp.y));
      // repair: a construction lattice in the light's colour fills the gap, then a gold seam
      vec2 lq = vec2(dot(wp.xz, normalize(vec2(-N.z, N.x) + 1e-5)), wp.y);
      vec2 lg = abs(fract(lq / 1.5) - 0.5);
      float lat = (1.0 - smoothstep(0.0, 0.07, min(lg.x, lg.y))) * dm.lattice;
      emit += gSCol * lat * (0.5 + 0.5 * sin(uTime * 2.4 - wp.y * 0.3)) * 0.9;
      emit = mix(emit, emit * 0.4, dm.lattice * 0.5);
      emit += mix(vec3(1.0, 0.72, 0.38), gSCol, 0.35) * dm.seam * 1.3;
      // the wound itself
      if (dm.hole > 0.001){
        vec3 cav = cavity(wp, N, V, bh, amb, dm);
        col = mix(col, cav, dm.hole);
        emit *= 1.0 - dm.hole;
      }
    }
  } else if (mat < 2.5 || mat > 7.5){
    // ---------------- concrete / sidewalks ----------------
    float n = vnoise(wp * 0.35) * 0.5 + vnoise(wp * 2.1) * 0.25;
    vec3 base = vec3(0.075, 0.072, 0.08) * (0.65 + n);
    if (mat > 7.5) base = vec3(0.05, 0.05, 0.06) * (0.7 + n * 0.6);
    col = base * (amb * 1.2 + flashL);
    float wet = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col += skyApprox(reflect(-V, N)) * wet * 0.25;
  } else if (mat < 3.5){
    // ---------------- metal: AC units, railings, masts ----------------
    vec3 base = vec3(0.05, 0.055, 0.065);
    col = base * (amb + flashL);
    vec3 R = reflect(-V, N);
    col += skyApprox(R) * 0.18 * (0.2 + 0.8 * pow(1.0 - max(dot(N, V), 0.0), 3.0));
  } else if (mat < 4.5){
    // ---------------- HER ROOFTOP: wet concrete, puddles, rain ripples ---------------
    vec2 q = wp.xz;
    float puddle = smoothstep(0.50, 0.58, fbm2(q * 0.32 + 3.1));
    float grime = fbm2(q * 1.7);
    vec2 rc = q * 2.6; vec2 ci = floor(rc);
    vec2 rn = vec2(0.0); float rip = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++){
      vec2 c = ci + vec2(float(i), float(j));
      float hh = hash12(c);
      if (hh > uRain) continue;
      vec2 ctr = c + hash22(c);
      float tt = fract(uTime * 0.85 + hh * 7.0);
      vec2 dv = rc - ctr; float dd = length(dv);
      float rr = (dd - tt * 0.55) * 18.0;
      float ring = exp(-rr * rr) * (1.0 - tt) * (1.0 - tt);
      rip += ring; rn += dv / max(dd, 1e-3) * ring;
    }
    vec3 Np = normalize(vec3(rn.x * 0.35 * puddle, 1.0, rn.y * 0.35 * puddle));
    vec3 Nc = normalize(vec3((vnoise2(q * 9.0) - 0.5) * 0.25, 1.0, (vnoise2(q * 9.0 + 5.0) - 0.5) * 0.25));
    vec3 Nr = normalize(mix(Nc, Np, puddle));
    vec3 base = vec3(0.07, 0.068, 0.075) * (0.55 + 0.6 * grime);
    base = mix(base, vec3(0.012, 0.014, 0.02), puddle);
    vec3 R = reflect(-V, Nr);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(Nr, V), 0.0), 5.0);
    vec3 env = skyApprox(R);
    // reflections of nearby lights: sharp in puddles, smeared on wet concrete
    vec3 lr = vec3(0.0);
    for (int i = 0; i < 4; i++){
      vec3 Lv = uLightPos[i] - wp; float dl = length(Lv); vec3 L = Lv / dl;
      float s = pow(max(dot(R, L), 0.0), mix(18.0, 260.0, puddle));
      lr += uLightCol[i] * s * mix(0.25, 2.4, puddle) / (1.0 + dl * dl * 0.06);
    }
    col = base * (amb * 1.1 + flashL) + pointLights(wp, Nr, V, 24.0, 0.2, 0.2) * base * 3.0;
    col += (env * mix(0.12, 0.85, puddle) * fres + lr) * (0.6 + 0.4 * puddle);
    col += rip * puddle * 0.03 * (uAmbSky + 0.3);
  } else if (mat < 5.5){
    // ---------------- streets: wet asphalt, light veins, traffic ----------------
    float width = d.b * 40.0;
    vec3 base = vec3(0.016, 0.017, 0.022);
    vec3 R = reflect(-V, N);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col = base * amb + skyApprox(R) * fres * 0.5;
    if (width > 0.1){
      float along = vUv.x, across = vUv.y * width;
      float sh = bh;
      // lane markings
      float dash = step(0.5, fract(along / 6.0)) * (1.0 - smoothstep(0.06, 0.12, abs(across - width * 0.5)));
      col += vec3(0.25) * dash * 0.08;
      // streetlight pools
      float k = floor(along / 26.0 + sh * 10.0);
      float lh = hash11(k + sh * 77.0);
      float side = lh > 0.5 ? 1.0 : 0.0;
      vec2 lp = vec2((k + 0.5 - sh * 10.0) * 26.0, mix(1.2, width - 1.2, side));
      float pool = exp(-dot(vec2(along, across) - lp, vec2(along, across) - lp) * 0.012);
      float lOn = smoothstep(distN * 0.9 + lh * 0.1, distN * 0.9 + lh * 0.1 + 0.02, uRestore * 1.4);
      float lSurv = step(lh, uSurvivor * 2.0) * step(0.3, hash11(floor(uTime * 6.0) + lh * 50.0));
      vec3 lc = mix(vec3(1.0, 0.62, 0.35), vec3(0.5, 0.75, 1.0), step(0.7, lh));
      col += lc * pool * max(lOn, lSurv * 0.6) * 0.9;
      // ground traffic: head- and tail-lights streaming along two lanes
      float dirS = across < width * 0.5 ? 1.0 : -1.0;
      float lane = across < width * 0.5 ? 0.0 : 1.0;
      float spd = 13.0 + 5.0 * hash11(sh * 9.0 + lane);
      float s = (along * dirS + uTime * spd) / 11.0 + hash11(sh + lane) * 5.0;
      float car = floor(s); float fs = fract(s);
      float present = step(hash11(car * 1.31 + sh * 17.0 + lane), uTraffic);
      float laneC = mix(width * 0.25, width * 0.75, lane);
      float ac = abs(across - laneC);
      float lights = smoothstep(0.35, 0.0, abs(fs - 0.5)) * smoothstep(1.4, 0.2, ac);
      vec3 cc = lane < 0.5 ? vec3(1.0, 0.9, 0.75) : vec3(1.0, 0.1, 0.12);
      emit += cc * lights * present * 1.6;
      emit += cc * present * smoothstep(3.0, 0.0, ac) * smoothstep(0.6, 0.0, abs(fs - 0.5)) * 0.15; // wet smear
    }
    // light veins: restoration flowing outward from her building
    float front = uRestore * 1650.0;
    float behind = smoothstep(front + 20.0, front - 80.0, distH);
    float edge = exp(-abs(distH - front) / 18.0) * step(0.001, uRestore) * step(uRestore, 0.98);
    float lineM = width > 0.1 ? (1.0 - smoothstep(0.1, 0.9, abs(vUv.y - 0.5) * width)) : 0.0;
    float pulseRing = exp(-abs(distH - fract(uTime * 0.18) * front) / 12.0) * uPulse;
    vec3 vc = mix(vec3(0.15, 0.9, 1.0), vec3(1.0, 0.25, 0.65), 0.5 + 0.5 * sin(distH * 0.01 - uTime * 0.6));
    emit += vc * lineM * (edge * 2.5 + behind * (0.18 + pulseRing * 1.4));
  } else if (mat < 6.5){
    // ---------------- sign backing panels ----------------
    col = vec3(0.018, 0.018, 0.024) * (amb + flashL) + skyApprox(reflect(-V, N)) * 0.06;
  } else {
    // ---------------- exposed skeleton of broken towers ----------------
    vec3 base = vec3(0.035, 0.032, 0.036);
    col = base * (amb + flashL);
    float order = bh * 0.3 + distN * 0.6;
    float g = smoothstep(order, order + 0.12, max(uSeam, gL));
    float e = edgeMask(vUv, 0.12);
    vec3 kin = mix(vec3(1.0, 0.7, 0.35), vec3(1.0, 0.3, 0.7), fract(bh * 3.0));
    float travel = 0.5 + 0.5 * sin(wp.y * 0.25 - uTime * 2.0 + bh * 20.0);
    emit += kin * g * (0.25 + 0.75 * e) * (0.5 + 0.5 * travel) * 0.9;
  }

  // near-field lights (fallen sign, door, lightning spill) on everything up close
  if (uNear > 0.5 && mat != 4.0) col += pointLights(wp, N, V, 32.0, 0.35, 0.3) * 0.06;

  // the dissolving front of a restored top / of the debris: a thin kintsugi-gold edge
  emit += vec3(1.0, 0.68, 0.36) * 1.6 * rebuiltEdge;

  // fragments: faint cold outline while suspended, warm kintsugi seams once home
  if (d.b > 0.0 && !(mat > 4.5 && mat < 5.5)){
    float e = edgeMask(vUv, 0.04);
    float home = vAssembled;
    vec3 seam = mix(vec3(0.3, 0.8, 1.0) * 0.25, vec3(1.0, 0.68, 0.36) * 1.6, home);
    seam = mix(seam, gSCol * 1.6, 0.5 * gL * home);
    emit += seam * e * (0.35 + 0.65 * home) * (home > 0.99 ? max(uSeam, gL) : 1.0);
  }

  // the viewer's shockwave: a bright front sweeping across every surface it reaches
  if (sFront > 0.002) emit += mix(vec3(1.0, 0.85, 0.95), sFrontCol, 0.7) * sFront * (mat < 1.5 ? 0.9 : 0.6);

  // she lights what she passes: windows flare, wet surfaces catch her aura
  float dc = length(wp - uCharPos);
  float near = exp(-dc / 22.0) * uCharGlow;
  emit *= 1.0 + near * 2.2;
  // audio reactivity: bass lifts the buildings' own light (windows, veins, seams); 0 → unchanged
  emit *= 1.0 + 0.6 * uAudioBass;
  col += vec3(1.0, 0.45, 0.85) * exp(-dc / 7.0) * uCharGlow * 0.35 * (0.4 + 0.6 * pow(1.0 - max(dot(N, V), 0.0), 2.0));
  col += emit * uEmitScale;
  col = applyFog(col, wp);
  outColor = vec4(col, 1.0);
}
`
};
