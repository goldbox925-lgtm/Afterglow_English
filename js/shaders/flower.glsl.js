/* =====================================================================
   Round 02 · Memory Garden — the Interactive Bloom flower (shaders)
   ---------------------------------------------------------------------
   flowerPetal  ONE petal per draw call (uniforms uA/uB/uC describe it).
     The mesh is a plain (u, v) grid: u = 0 at the base pivot … 1 at the
     tip, v = −1 … 1 across. The vertex shader bends it into a real 3D
     petal every frame:
       · the spine is a circular arc in the petal's own vertical plane:
         its direction starts at angle θ from vertical (θ = how far the
         petal has opened, rotating about the PIVOT at its base) and turns
         by k per unit length (k < 0 curls the tip inward → bud; k > 0
         lets it fall outward). Closed form, so no stepping:
            r(s) = (cos θ − cos(θ+ks)) / k ,  y(s) = (sin(θ+ks) − sin θ) / k
       · the width follows a pointed lotus profile, and the two halves
         cup toward the inner face (more cupped when closed),
       · a little flutter/twist from CPU noise.
     uKind 1 draws the golden receptacle (a small dome mesh) instead.
     Fragment: translucent iridescent surface (alpha blended, sorted back
     to front by the CPU), glowing veins, bright rims, warm light from the
     core near the base, all HDR so the bloom pass picks the light up.
   flowerSprite  camera-facing sprites and thin ribbons:
     kind 0 = glow sprites (core glow, anthers, floating motes) from
              uniform arrays (CPU positions, LightParticle objects)
     kind 1 = stamen filaments (ribbons between uStamA[i] and uStamB[i])
     kind 2 = the ground disc: soft concentric light rings + click pulse
   flowerBackdrop  the preview's night-violet gradient behind it all.
   flowerComposite  scene + bloom → tone map, vignette (preview only).
   ===================================================================== */
window.AG = window.AG || {};
AG.SHADERS = AG.SHADERS || {};

AG.SHADERS.flowerPetal = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 aPosition; in vec2 aTexCoord;
uniform mat4 uView, uProj;
uniform vec3 uCenter;      // flower base (world)
uniform float uScale;      // metres per flower unit
uniform vec4 uA;           // azimuth φ, pivot radius r0, length L, half-width W
uniform vec4 uB;           // opening angle θ, curvature k, cup, pivot height y0
uniform vec4 uC;           // flutter (sideways sway at the tip), twist, -, -
uniform float uKind;       // 0 petal · 1 receptacle dome
out vec2 vUv; out vec3 vN; out vec3 vWorld; out float vU;
vec2 spine(float s, float th, float k){
  if (abs(k) < 1e-3) return vec2(s * sin(th), s * cos(th));
  return vec2((cos(th) - cos(th + k * s)) / k, (sin(th + k * s) - sin(th)) / k);
}
void main(){
  if (uKind > 0.5){
    // receptacle: aPosition is a unit dome; scaled and lifted to the flower's heart
    vec3 p = uCenter + vec3(aPosition.x * 0.13, aPosition.y * 0.1 + 0.09, aPosition.z * 0.13) * uScale;
    vN = normalize(vec3(aPosition.x, aPosition.y * 1.4, aPosition.z));
    vUv = aTexCoord; vU = 0.0; vWorld = p;
    gl_Position = uProj * uView * vec4(p, 1.0);
    return;
  }
  float u = aPosition.x, v = aPosition.y;
  float phi = uA.x, r0 = uA.y, L = uA.z, W = uA.w;
  float th = uB.x, k = uB.y, cup = uB.z, y0 = uB.w;
  float s = u * L;
  vec2 sp = spine(s, th, k);
  float al = th + k * s;
  vec2 d2 = vec2(sin(al), cos(al));            // spine direction in (radial, up)
  vec2 nIn = vec2(-cos(al), sin(al));          // toward the inner face
  // pointed lotus outline: narrow pivot, widest a little below the middle, sharp tip
  float w = W * (0.10 + 0.90 * pow(sin(PI * pow(u, 0.78)), 0.85)) * pow(1.0 - u, 0.12);
  vec3 R = vec3(cos(phi), 0.0, sin(phi)), T = vec3(-sin(phi), 0.0, cos(phi)), Y = vec3(0.0, 1.0, 0.0);
  float tw = uC.y * u;                          // a slight twist toward the tip
  vec3 Tw = normalize(T * cos(tw) + Y * sin(tw) * 0.25);
  vec3 nIn3 = R * nIn.x + Y * nIn.y;
  vec3 p = R * (r0 + sp.x) + Y * (y0 + sp.y)
         + Tw * (v * w)
         + nIn3 * (cup * v * v * w)
         + T * (uC.x * u * u);                  // flutter
  // normal from the two surface tangents
  vec3 tu = R * d2.x + Y * d2.y;
  vec3 tv = Tw + nIn3 * (2.0 * cup * v * w);
  vN = normalize(cross(tv, tu));
  vec3 wp = uCenter + p * uScale;
  vUv = vec2(u, v); vU = u; vWorld = wp;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; in vec3 vN; in vec3 vWorld; in float vU;
out vec4 outColor;
uniform float uKind;
uniform vec3 uBaseCol, uBodyCol, uTipCol, uRimCol, uCoreCol;   // p.lerpColor results (CPU)
uniform float uBloom, uAwake, uCore, uVein, uAlpha, uSeed;
uniform vec3 uCenter; uniform float uScale;
void main(){
  vec3 V = normalize(uCamPos - vWorld);
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float ndv = abs(dot(N, V)), fr = pow(1.0 - ndv, 2.2);
  if (uKind > 0.5){
    // the golden receptacle: warm, bright toward its top, rim-lit
    float top = smoothstep(-0.2, 1.0, vN.y);
    vec3 c = uCoreCol * (0.45 + 0.9 * uCore * top) + vec3(1.0, 0.55, 0.2) * fr * (0.3 + 0.5 * uCore);
    outColor = vec4(c, 1.0);
    return;
  }
  float u = vUv.x, v = vUv.y, av = abs(v);
  // body gradient: warm near the pivot, the main colour, a cooler tip
  vec3 col = mix(uBaseCol, uBodyCol, smoothstep(0.0, 0.45, u));
  col = mix(col, uTipCol, smoothstep(0.45, 1.0, u) * 0.85);
  // thin-film iridescence: the hue drifts around the petal's own colour with the viewing angle
  // (and toward cyan at grazing angles) instead of washing it toward grey
  vec3 ir = 0.5 + 0.5 * cos(6.2832 * (fr * 0.9 + u * 0.35 + av * 0.2 + uSeed + vec3(0.0, 0.33, 0.67)));
  col *= 1.0 + (ir - 0.5) * 0.75;
  col = mix(col, uTipCol, fr * 0.45);
  // veins: a central vein and side veins that sweep toward the tip, flowing light inside
  float mid = exp(-av * 30.0) * smoothstep(0.98, 0.2, u) * smoothstep(0.0, 0.12, u);
  float sweep = fract(u * 7.0 - av * 2.6 + 0.15);
  float side = smoothstep(0.08, 0.0, abs(sweep - 0.5) - 0.42) * smoothstep(0.0, 0.25, av) * smoothstep(0.98, 0.5, av) * smoothstep(0.95, 0.15, u);
  float flow = 0.65 + 0.35 * sin(u * 14.0 - uTime * 2.2 + uSeed * 20.0);
  float vein = (mid * 1.0 + side * 0.55) * flow;
  // rims (the petal edge and tip) and the warm light the core throws on the inner base
  // (no rim right at the narrow base, where ten petals overlap at the heart)
  float rim = (smoothstep(0.78, 1.0, av) + smoothstep(0.88, 1.0, u) * 0.6) * smoothstep(0.06, 0.32, u);
  float coreLight = exp(-u * 5.5) * uCore * 0.6;
  vec3 emit = uRimCol * rim * (0.30 + 0.45 * uBloom) + mix(uRimCol, vec3(1.0, 0.62, 0.3), smoothstep(0.45, 0.0, u) * 0.6) * vein * uVein * 1.0
            + vec3(1.0, 0.48, 0.12) * coreLight * 1.1 + uRimCol * fr * 0.14 * (0.3 + 0.7 * uBloom);
  vec3 c = col * (0.40 + 0.22 * uAwake + 0.38 * uBloom) + emit;
  // translucent: thin in the middle, denser at the rims and at grazing angles
  float a = clamp(uAlpha * (0.52 + 0.3 * fr + 0.25 * rim + 0.15 * vein), 0.0, 0.95);
  // p5's BLEND is premultiplied (ONE, ONE_MINUS_SRC_ALPHA): the colour must be multiplied by
  // alpha, or every translucent layer adds its full brightness and the heart washes to white
  outColor = vec4(c * a, a);
}
`
};

AG.SHADERS.flowerSprite = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 aPosition; in vec2 aTexCoord;
uniform mat4 uView, uProj;
uniform float uKind;
uniform vec4 uSpr[64];       // kind 0: xyz + size
uniform vec4 uSprC[64];      // kind 0: rgb + alpha
uniform vec4 uStamA[18];     // kind 1: filament base xyz + width
uniform vec4 uStamB[18];     // kind 1: filament tip xyz + brightness
uniform vec3 uCenter; uniform float uScale, uDisc;
out vec2 vUv; out vec3 vCol; out float vA; out float vKind;
void main(){
  int i = int(aPosition.x + 0.5);
  vKind = uKind;
  if (uKind < 0.5){
    vec4 s = uSpr[i], c = uSprC[i];
    vec4 vp = uView * vec4(s.xyz, 1.0);
    vp.xy += aTexCoord * s.w * (c.a > 0.0 ? 1.0 : 0.0);
    vUv = aTexCoord; vCol = c.rgb; vA = c.a;
    gl_Position = uProj * vp;
  } else if (uKind < 1.5){
    if (i >= 18) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    vec4 a = uStamA[i], b = uStamB[i];
    vec4 va = uView * vec4(a.xyz, 1.0), vb = uView * vec4(b.xyz, 1.0);
    vec2 d = vb.xy - va.xy; float dl = length(d); vec2 dn = dl > 1e-6 ? d / dl : vec2(0.0, 1.0), pn = vec2(-dn.y, dn.x);
    float t = aTexCoord.x * 0.5 + 0.5;
    vec4 vp = mix(va, vb, t); vp.xy += pn * aTexCoord.y * a.w * mix(1.0, 0.45, t);
    vUv = vec2(t, aTexCoord.y); vCol = vec3(1.0, 0.68, 0.3); vA = b.w * 0.75;
    gl_Position = uProj * vp;
  } else {
    // ground disc in the XZ plane under the flower
    vec3 p = uCenter + vec3(aTexCoord.x, 0.0, aTexCoord.y) * uDisc * uScale + vec3(0.0, 0.004, 0.0);
    vUv = aTexCoord; vCol = vec3(1.0); vA = 1.0;
    gl_Position = uProj * uView * vec4(p, 1.0);
  }
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; in vec3 vCol; in float vA; in float vKind;
out vec4 outColor;
uniform float uBloom, uAwake, uPulseR, uPulseA;
uniform vec3 uRingCol;
void main(){
  if (vKind < 0.5){
    float r2 = dot(vUv, vUv); if (r2 > 1.0) discard;
    float g = exp(-r2 * 4.0) + 0.7 * exp(-r2 * 26.0);
    outColor = vec4(vCol * g * vA, 1.0);
  } else if (vKind < 1.5){
    float g = exp(-vUv.y * vUv.y * 3.5);
    outColor = vec4(vCol * g * vA * mix(0.6, 1.4, vUv.x), 1.0);
  } else {
    // soft concentric rings that brighten as it blooms, and the expanding click pulse
    float r = length(vUv);
    if (r > 1.0) discard;
    float rings = 0.0;
    for (int k = 1; k <= 3; k++){ float rr = 0.28 * float(k); rings += exp(-pow((r - rr) * 60.0, 2.0)) * (1.0 - 0.25 * float(k)); }
    float glow = exp(-r * r * 9.0) * 0.3;
    float pulse = exp(-pow((r - uPulseR) * 30.0, 2.0)) * uPulseA;
    vec3 c = uRingCol * ((rings * (0.25 + 0.75 * uBloom) + glow) * (0.3 + 0.7 * max(uAwake, uBloom)) + pulse * 1.6);
    outColor = vec4(c * (1.0 - smoothstep(0.8, 1.0, r)), 1.0);
  }
}
`
};

AG.SHADERS.flowerBackdrop = {
  vert: AG.SHADERS.quadVert,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; out vec4 outColor;
uniform float uBloom;
void main(){
  vec2 q = vUv - vec2(0.5, 0.42);
  vec3 top = vec3(0.07, 0.04, 0.12), low = vec3(0.16, 0.07, 0.2);
  vec3 c = mix(low, top, smoothstep(0.0, 1.0, vUv.y));
  c += vec3(0.5, 0.25, 0.55) * exp(-dot(q, q) * 6.0) * (0.10 + 0.12 * uBloom);
  float st = step(0.9975, hash12(floor(vUv * vec2(900.0, 560.0))));
  c += st * 0.25 * smoothstep(0.35, 1.0, vUv.y);
  outColor = vec4(c, 1.0);
}
`
};

AG.SHADERS.flowerComposite = {
  vert: AG.SHADERS.quadVert,
  frag: AG.SHADERS.header + `
in vec2 vUv; out vec4 outColor;
uniform sampler2D tScene, tBloom; uniform float uBloomAmt;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture(tScene, vUv).rgb + texture(tBloom, vUv).rgb * uBloomAmt;
  // tone map: plain ACES pushes bright colours toward white; scaling the colour by the curve of
  // its brightest channel keeps the hue. A blend keeps a little white in the hottest highlights.
  c *= 0.95;
  float m = max(max(c.r, c.g), c.b);
  vec3 keepHue = c * (aces(vec3(m)).x / max(m, 1e-4));
  c = mix(aces(c), keepHue, 0.65);
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.9;
  outColor = vec4(pow(c, vec3(1.0 / 1.05)), 1.0);
}
`
};
